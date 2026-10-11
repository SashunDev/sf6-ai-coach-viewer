"""No-network tests for encrypted GitHub issue -> Dropbox -> guarded publisher."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from nacl.public import PrivateKey

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import ingest_dropbox_issue as app
from dropbox_ingress_crypto import encrypt_url, decrypt_url

MID="synthetic-test-001"
URL="https://ucabcdef.dl.dropboxusercontent.com/cd/0/get/opaque_download_token?dl=1"
PRIVATE=PrivateKey.generate()
PRIVATE_B64=base64.b64encode(PRIVATE.encode()).decode()
PUBLIC_B64=base64.b64encode(PRIVATE.public_key.encode()).decode()


def event(**edits):
    data=b"synthetic zipped data"
    metadata={
        "schemaVersion":2,"matchId":MID,
        "sealedUrl":encrypt_url(URL,PUBLIC_B64),
        "size":len(data),
        "sha256":hashlib.sha256(data).hexdigest(),
        "dropboxHash":hashlib.sha256(hashlib.sha256(data).digest()).hexdigest(),
    }
    metadata.update(edits)
    return {"action":"opened","repository":{"full_name":app.REPO},
            "issue":{"title":"SF6-PUBLISH "+MID,"user":{"login":"SashunDev"},
                     "body":json.dumps(metadata)}}


class FakeResponse:
    status=200
    def __init__(self,payload):
        import io
        self.stream=io.BytesIO(payload)
    def read(self,n):
        return self.stream.read(n)
    def __enter__(self):
        return self
    def __exit__(self,*args):
        self.stream.close()


class IngressTests(unittest.TestCase):
    def test_sealed_round_trip_and_no_plaintext_issue_exposure(self):
        obj=event()
        self.assertNotIn(URL, obj["issue"]["body"])
        self.assertNotIn(base64.urlsafe_b64encode(URL.encode()).decode().rstrip("="),obj["issue"]["body"])
        mid,url,size,sha,dropbox_hash=app.parse_issue(obj, PRIVATE_B64)
        self.assertEqual((mid,url,size),(MID,URL,len(b"synthetic zipped data")))
        self.assertEqual(len(sha),64)
        self.assertEqual(len(dropbox_hash),64)

    def test_no_secret_fails_closed(self):
        with self.assertRaises(ValueError):
            app.parse_issue(event(), "")

    def test_wrong_secret_fails_closed(self):
        other=base64.b64encode(PrivateKey.generate().encode()).decode()
        with self.assertRaises(ValueError):
            app.parse_issue(event(),other)

    def test_tampered_ciphertext_fails_closed(self):
        obj=event()
        metadata=json.loads(obj["issue"]["body"])
        value=metadata["sealedUrl"]
        metadata["sealedUrl"]=value[:20]+("A" if value[20]!="A" else "B")+value[21:]
        obj["issue"]["body"]=json.dumps(metadata)
        with self.assertRaises(ValueError):
            app.parse_issue(obj,PRIVATE_B64)

    def test_old_plaintext_schema_is_rejected(self):
        obj=event(schemaVersion=1)
        data=json.loads(obj["issue"]["body"])
        data["encodedUrl"]=base64.urlsafe_b64encode(URL.encode()).decode().rstrip("=")
        data.pop("sealedUrl")
        obj["issue"]["body"]=json.dumps(data)
        with self.assertRaisesRegex(ValueError,"schema"):
            app.parse_issue(obj,PRIVATE_B64)

    def test_reject_wrong_owner(self):
        obj=event();obj["issue"]["user"]["login"]="attacker"
        with self.assertRaises(ValueError):
            app.parse_issue(obj,PRIVATE_B64)

    def test_reject_wrong_repo(self):
        obj=event();obj["repository"]["full_name"]="other/repo"
        with self.assertRaises(ValueError):
            app.parse_issue(obj,PRIVATE_B64)

    def test_reject_wrong_title(self):
        obj=event();obj["issue"]["title"]="any other issue"
        with self.assertRaises(ValueError):
            app.parse_issue(obj,PRIVATE_B64)

    def test_reject_non_dropbox_download_host(self):
        for url in ("https://localhost/evil?x=1",
                    "http://ucab.dl.dropboxusercontent.com/cd/get?t=2",
                    "https://evil.com/get?t=2",
                    "https://dl.dropboxusercontent.com.evil.com/get?t=2",
                    "https://user:pass@dl.dropboxusercontent.com/cd/get?a=2",
                    "https://dl.dropboxusercontent.com:1234/cd/get?a=2",
                    "https://dl.dropboxusercontent.com/cd/get?a=2#fragment"):
            self.assertFalse(app.allowed_url(url))
            # Keep URL length in encryption API's admissible range while
            # preserving each invalid scheme/host/fragment property.
            candidate = url + ("x" * max(0, 40 - len(url)))
            obj=event(sealedUrl=encrypt_url(candidate,PUBLIC_B64))
            with self.assertRaises(ValueError):
                app.parse_issue(obj,PRIVATE_B64)

    def test_reject_invalid_digests_size_and_schema(self):
        for updates in (
            {"size":100000001},{"size":0},{"size":True},
            {"sha256":"0"*32},{"dropboxHash":"not-a-sha"},
            {"schemaVersion":1},{"matchId":"../unsafe"},
        ):
            with self.subTest(updates=updates),self.assertRaises(ValueError):
                app.parse_issue(event(**updates),PRIVATE_B64)

    def test_reject_extra_metadata_to_prevent_publishing_overrides(self):
        obj=event()
        data=json.loads(obj["issue"]["body"]);data["replaceReport"]=True
        obj["issue"]["body"]=json.dumps(data)
        with self.assertRaises(ValueError):
            app.parse_issue(obj,PRIVATE_B64)

    def test_full_hash_and_dropbox_chunk_hash_from_get(self):
        payload=b"x"*4_194_304+b"this is next Dropbox chunk"
        full=hashlib.sha256(payload).hexdigest()
        drop=hashlib.sha256(hashlib.sha256(payload[:4_194_304]).digest()+
                            hashlib.sha256(payload[4_194_304:]).digest()).hexdigest()
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/"source.zip"
            with patch.object(app,"build_opener") as o:
                o.return_value.open.return_value=FakeResponse(payload)
                app.download_and_validate(URL,len(payload),full,drop,path)
                self.assertEqual(path.read_bytes(),payload)
                self.assertEqual(o.return_value.open.call_count,1)

    def test_fail_closed_on_sha_mismatch(self):
        payload=b"some bytes"
        with tempfile.TemporaryDirectory() as td:
            with patch.object(app,"build_opener") as o:
                o.return_value.open.return_value=FakeResponse(payload)
                with self.assertRaisesRegex(ValueError,"integrity mismatch"):
                    app.download_and_validate(URL,len(payload),"0"*64,"0"*64,Path(td)/"bad.zip")

    def test_fail_closed_on_size_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            with patch.object(app,"build_opener") as o:
                o.return_value.open.return_value=FakeResponse(b"too long")
                with self.assertRaisesRegex(ValueError,"larger than expected"):
                    app.download_and_validate(URL,2,"0"*64,"0"*64,Path(td)/"bad.zip")

    def test_redirects_refuse_other_hosts(self):
        with self.assertRaises(ValueError):
            app.DropboxOnlyRedirect().redirect_request(None,None,302,"found",{},
                                                        "https://evil.example.com/download?x=2")

    def test_no_public_publish_during_dry_run(self):
        with patch.object(app,"download_and_validate"),\
             patch.object(app,"extract_package",return_value=
                          (MID,Path("/tmp/fake.json"),Path("/tmp/fake.mp4"))),\
             patch.object(app,"publish",side_effect=AssertionError("No publish")):
            self.assertEqual(app.run(event(),apply=False,private_key_b64=PRIVATE_B64),"DRY_RUN PASS")

    def test_wrong_secret_does_not_download(self):
        with patch.object(app,"download_and_validate",side_effect=AssertionError("Unexpected download")):
            with self.assertRaises(ValueError):
                app.run(event(),apply=False,private_key_b64="")

    def test_encryption_nondeterministic(self):
        self.assertNotEqual(encrypt_url(URL,PUBLIC_B64),encrypt_url(URL,PUBLIC_B64))


if __name__=="__main__":
    unittest.main()
