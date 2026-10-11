import base64
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zlib

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from publish_coaching_report import decode_report_token, create_report_asset
from test_coaching_link import report


def pack(data, kind="z"):
    b=json.dumps(data,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    if kind=="z":
        b=zlib.compress(b)
    return kind+"."+base64.urlsafe_b64encode(b).decode().rstrip("=")


class PublishTests(unittest.TestCase):
    def test_roundtrip_and_assign_id(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"match-001.json"
            create_report_asset("match-001",pack(report()),path)
            decoded=json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(decoded["match"]["id"],"match-001")
            self.assertEqual(decoded["coaching"]["summary"],report()["coaching"]["summary"])

    def test_roundtrip_raw_token(self):
        self.assertEqual(decode_report_token(pack(report(),"j")),report())

    def test_reject_conflicting_match_id(self):
        x=report();x["match"]["id"]="another"
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                create_report_asset("match-001",pack(x),Path(folder)/"match-001.json")

    def test_reject_unsafe_id(self):
        with tempfile.TemporaryDirectory() as folder:
            for value in ("../bad","bad name","bad.json",".bad","", "a"*81):
                with self.subTest(value=value),self.assertRaises(ValueError):
                    create_report_asset(value,pack(report()),Path(folder)/"ignore.json")

    def test_refuse_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"match-001.json"
            path.write_text("existing")
            with self.assertRaises(FileExistsError):
                create_report_asset("match-001",pack(report()),path)
            self.assertEqual(path.read_text(),"existing")

    def test_reject_decompression_bomb(self):
        very_large={"data":"X"*2_000_000}
        with self.assertRaises(ValueError):
            decode_report_token(pack(very_large))

    def test_reject_trailing_compressed_data(self):
        blob=zlib.compress(json.dumps(report()).encode())+b"JUNK"
        token="z."+base64.urlsafe_b64encode(blob).decode().rstrip("=")
        with self.assertRaises(ValueError):
            decode_report_token(token)

    def test_reject_unverified_token(self):
        for text in ("","not-a-token","z.invalid*characters","z.","https://site/#r=z.abcd","z.A"*9000):
            with self.subTest(text=text[:40]),self.assertRaises((ValueError,Exception)):
                decode_report_token(text)

    def test_reject_bad_schema(self):
        x=report();x["schemaVersion"]=2
        with self.assertRaises(ValueError):
            decode_report_token(pack(x))

if __name__=="__main__":unittest.main()
