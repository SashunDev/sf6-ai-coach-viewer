import base64
import json
import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import zlib

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from create_coaching_link import VIEWER, MEDIA, make_link, validate_report

def report():
    return {"schemaVersion":1,
        "match":{"self":"アレックス","opponent":"ガイル","scoreSelf":1,"scoreOpponent":0,
                 "style":"クラシック","analysisMode":"動画連動レポート",
                 "durationSec":16,"mainFocus":"リーサル判断","mainFocusNote":"次回も確認"},
        "coaching":{"summary":"良い判断あり","primaryTheme":"反撃確認を優先","secondaryTheme":None},
        "events":[{"id":"E01","round":"ROUND 01","start":2.1,"end":5.7,
                   "category":"review","tag":"振り返り","title":"確認の機会",
                   "short":"ヒット確認","observed":"入力のタイミングを確認",
                   "judgment":"要改善","action":"確認後に反撃",
                   "success":"次回も実戦で確認"}]}

class LinkTests(unittest.TestCase):
    def test_roundtrip_compressed_unicode(self):
        url=make_link(report())
        self.assertTrue(url.startswith(VIEWER+"#r=z."))
        param=parse_qs(urlsplit(url).fragment)
        token=param["r"][0].split(".",1)[1]
        unpacked=zlib.decompress(base64.urlsafe_b64decode(token+"="*(-len(token)%4)))
        self.assertEqual(json.loads(unpacked),report())
        self.assertNotIn("v",param)

    def test_video_link_same_origin(self):
        url=make_link(report(),"sf6-coach-synthetic-smoke-16s.mp4")
        fields=parse_qs(urlsplit(url).fragment)
        self.assertEqual(fields["v"],[MEDIA+"sf6-coach-synthetic-smoke-16s.mp4"])

    def test_reject_traversal_and_unsafe_names(self):
        for name in ("../x.mp4","a/b.mp4","a b.mp4",".hidden.mp4",
                     "x.mov","https://example.net/a.mp4","あ.mp4","a%2fb.mp4"):
            with self.subTest(name=name),self.assertRaises(ValueError):
                make_link(report(),name)

    def test_reject_wrong_schema(self):
        data=report();data["schemaVersion"]=2
        with self.assertRaises(ValueError):make_link(data)

    def test_reject_bad_event_range(self):
        data=report();data["events"][0]["end"]=17
        with self.assertRaises(ValueError):make_link(data)

    def test_reject_disordered_events(self):
        data=report()
        data["events"].append({**data["events"][0],"id":"E02","start":1,"end":2})
        with self.assertRaises(ValueError):make_link(data)

    def test_missing_fields(self):
        data=report();data["coaching"].pop("primaryTheme")
        with self.assertRaises(ValueError):make_link(data)

    def test_too_many_events(self):
        data=report()
        data["events"]=[{**data["events"][0],"id":f"E{i}"} for i in range(41)]
        with self.assertRaises(ValueError):make_link(data)

    def test_no_network_dependency(self):
        self.assertTrue(VIEWER.startswith("https://sashundev.github.io/"))
        self.assertEqual(validate_report(report())["schemaVersion"],1)

if __name__=="__main__":unittest.main()
