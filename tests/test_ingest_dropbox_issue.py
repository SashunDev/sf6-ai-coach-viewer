"""No-network tests for GitHub issue -> Dropbox -> guarded SF6 publisher ingress."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import ingest_dropbox_issue as app

MID="synthetic-test-001"
URL="https://ucabcdef.dl.dropboxusercontent.com/cd/0/get/opaque_download_token?dl=1"


def event(**edits):
    data=b"synthetic zipped data"
    metadata={
        "schemaVersion":1,"matchId":MID,
        "encodedUrl":base64.urlsafe_b64encode(URL.encode()).decode().rstrip("="),
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
    def test_parse_authorized_owner(self):
        mid,url,size,sha,dropbox_hash=app.parse_issue(event())
        self.assertEqual((mid,url,size),(MID,URL,len(b"synthetic zipped data")))
        self.assertEqual(len(sha),64)
        self.assertEqual(len(dropbox_hash),64)

    def test_reject_wrong_owner(self):
        obj=event()
        obj["issue"]["user"]["login"]="attacker"
        with self.assertRaises(ValueError):
            app.parse_issue(obj)

    def test_reject_wrong_repo(self):
        obj=event()
        obj["repository"]["full_name"]="other/repo"
        with self.assertRaises(ValueError):
            app.parse_issue(obj)

    def test_reject_wrong_title(self):
        obj=event()
        obj["issue"]["title"]="any other issue"
        with self.assertRaises(ValueError):
            app.parse_issue(obj)

    def test_reject_non_dropbox_download_host(self):
        for url in ("https://localhost/evil?x=1",
                    "http://ucab.dl.dropboxusercontent.com/cd/get?t=2",
                    "https://evil.com/get?t=2",
                    "https://dl.dropboxusercontent.com.evil.com/get?t=2",
                    "https://user:pass@dl.dropboxusercontent.com/cd/get?a=2",
                    "https://dl.dropboxusercontent.com:1234/cd/get?a=2",
                    "https://dl.dropboxusercontent.com/cd/get?a=2#fragment"):
            self.assertFalse(app.allowed_url(url))
            obj=event(encodedUrl=base64.urlsafe_b64encode(url.encode()).decode().rstrip("="))
            with self.assertRaises(ValueError):
                app.parse_issue(obj)

    def test_reject_invalid_digests_size_and_schema(self):
        for updates in (
            {"size":100000001},{"size":0},{"size":True},
            {"sha256":"0"*32},{"dropboxHash":"not-a-sha"},
            {"schemaVersion":2},{"matchId":"../unsafe"},
        ):
            with self.subTest(updates=updates),self.assertRaises(ValueError):
                app.parse_issue(event(**updates))

    def test_reject_extra_metadata_to_prevent_publishing_overrides(self):
        obj=event()
        body=json.loads(obj["issue"]["body"])
        body["replaceReport"]=True
        obj["issue"]["body"]=json.dumps(body)
        with self.assertRaises(ValueError):
            app.parse_issue(obj)

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
                self.assertEqual(o.return_value.open.call_args.kwargs["timeout"],120)

    def test_fail_closed_on_sha_mismatch(self):
        payload=b"some bytes"
        with tempfile.TemporaryDirectory() as td:
            with patch.object(app,"build_opener") as o:
                o.return_value.open.return_value=FakeResponse(payload)
                with self.assertRaisesRegex(ValueError,"integrity mismatch"):
                    app.download_and_validate(URL,len(payload),"0"*64,"0"*64,Path(td)/"bad.zip")

    def test_fail_closed_on_size_mismatch(self):
        payload=b"some bytes that are too long"
        with tempfile.TemporaryDirectory() as td:
            with patch.object(app,"build_opener") as o:
                o.return_value.open.return_value=FakeResponse(payload)
                with self.assertRaisesRegex(ValueError,"larger than expected"):
                    app.download_and_validate(URL,2,"0"*64,"0"*64,Path(td)/"bad.zip")

    def test_redirects_refuse_other_hosts(self):
        h=app.DropboxOnlyRedirect()
        with self.assertRaises(ValueError):
            h.redirect_request(None,None,302,"found",{},
                               "https://evil.example.com/download?x=2")

    def test_no_public_publish_during_dry_run(self):
        with patch.object(app,"download_and_validate"),\
             patch.object(app,"extract_package",return_value=
                          (MID,Path("/tmp/fake.json"),Path("/tmp/fake.mp4"))),\
             patch.object(app,"publish",side_effect=AssertionError("No publish")):
            self.assertEqual(app.run(event(),apply=False),"DRY_RUN PASS")

    def test_failure_contains_no_ephemeral_link(self):
        obj=event(sha256="0"*64)
        with patch.object(app,"download_and_validate",side_effect=ValueError("bad sha")):
            with self.assertRaisesRegex(ValueError,"bad sha"):
                app.run(obj,apply=False)


if __name__=="__main__":
    unittest.main()
