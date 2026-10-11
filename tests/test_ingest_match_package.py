"""Single-upload staging importer tests. Synthetic bytes only, never public."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import ingest_match_package as app


MATCH = "test-001"


def fixture(mid=MATCH):
    return {
        "schemaVersion":1,
        "match":{"id":mid,"self":"Alex","opponent":"Terry",
                 "scoreSelf":1,"scoreOpponent":2,"style":"Classic",
                 "durationSec":16,"analysisMode":"Review",
                 "mainFocus":"Lethal","mainFocusNote":""},
        "coaching":{"summary":"Synthetic only","primaryTheme":"Practice",
                    "secondaryTheme":None},
        "events":[{"id":"evt1","round":"ROUND 01","start":2.0,"end":5.0,
                   "category":"review","tag":"SA3","title":"Sample",
                   "short":"Sample","observed":"Synthetic",
                   "judgment":"Synthetic","action":"Test",
                   "success":"Test"}],
    }


class IngestTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root=Path(self.folder.name)
        self.name=f"sf6-coach-package-{MATCH}.zip"
        self.zip=self.root/self.name
        self.mp4=b"\x00\x00\x00\x18ftypisom"+b"x"*300
        self.report=json.dumps(fixture()).encode("utf8")

    def write(self, *, names=None, method=zipfile.ZIP_DEFLATED):
        if names is None:
            names={MATCH+".mp4":self.mp4,MATCH+".json":self.report,
                   "PUBLISH_README.txt":b"Approved public SF6 replay"}
        with zipfile.ZipFile(self.zip,"w") as z:
            for name,payload in names.items():
                z.writestr(name,payload,compress_type=method)

    def extract(self):
        with tempfile.TemporaryDirectory(dir=self.root) as d:
            return app.extract_package(self.zip,Path(d))[0]

    def test_good_archive_accepts_report_and_video(self):
        self.write()
        with patch.object(app,"inspect_video",return_value=len(self.mp4)):
            self.assertEqual(self.extract(),MATCH)

    def test_reject_wrong_name_and_missing_data(self):
        self.write()
        evil=self.root/"other.zip"
        evil.write_bytes(self.zip.read_bytes())
        with patch.object(app,"inspect_video",return_value=len(self.mp4)):
            with self.assertRaisesRegex(ValueError,"Expected"):
                app.extract_package(evil,self.root)
            self.write(names={MATCH+".mp4":self.mp4})
            with self.assertRaises(ValueError):
                self.extract()

    def test_reject_zip_traversal_duplicate_and_encryption_like_entries(self):
        self.write(names={"../bad.mp4":self.mp4,MATCH+".json":self.report})
        with self.assertRaises(ValueError):
            self.extract()
        with zipfile.ZipFile(self.zip,"w") as z:
            z.writestr(MATCH+".mp4",self.mp4)
            z.writestr(MATCH+".mp4",self.mp4)
            z.writestr(MATCH+".json",self.report)
        with self.assertRaisesRegex(ValueError,"duplicate"):
            self.extract()

    def test_reject_report_mismatch_before_video_inspection(self):
        self.report=json.dumps(fixture("another-id")).encode()
        self.write()
        with patch.object(app,"inspect_video",side_effect=AssertionError("Not reached")):
            with self.assertRaises(ValueError):
                self.extract()

    def test_reject_oversized_archive_and_video_entry(self):
        self.write()
        with patch.object(app,"MAX_ARCHIVE_BYTES",1):
            with self.assertRaises(ValueError):
                self.extract()
        with patch.object(app,"MAX_VIDEO_BYTES",12),\
             patch.object(app,"inspect_video",return_value=20):
            with self.assertRaisesRegex(ValueError,"size"):
                self.extract()

    def test_publish_package_deletes_staging_only_after_verified_pages(self):
        self.write()
        asset={"id":123,"name":self.name}
        events=[]
        def gh(*args,**kw):
            events.append(args[:2])
            if args[:2]==("release","download"):
                (Path(args[-1])/self.name).write_bytes(self.zip.read_bytes())
            return ""
        with patch.object(app,"run_gh",side_effect=gh),\
             patch.object(app,"inspect_video",return_value=len(self.mp4)),\
             patch.object(app,"get_release_and_assets",return_value=({},[])),\
             patch.object(app,"publish",return_value=
                          "https://sashundev.github.io/sf6-ai-coach-viewer/#id="+MATCH):
            result=app.publish_package(asset)
        self.assertIn("#id="+MATCH,result)
        self.assertEqual(events[0],("release","download"))
        self.assertEqual(events[-1],("api","-X"))

    def test_failed_publishing_retains_staging_for_retry(self):
        self.write()
        asset={"id":123,"name":self.name}
        events=[]
        def gh(*args,**kw):
            events.append(args[:2])
            if args[:2]==("release","download"):
                (Path(args[-1])/self.name).write_bytes(self.zip.read_bytes())
            return ""
        with patch.object(app,"run_gh",side_effect=gh),\
             patch.object(app,"inspect_video",return_value=len(self.mp4)),\
             patch.object(app,"get_release_and_assets",return_value=({},[])),\
             patch.object(app,"publish",side_effect=RuntimeError("Pages failed")):
            with self.assertRaisesRegex(RuntimeError,"Pages failed"):
                app.publish_package(asset)
        self.assertNotIn(("api","-X"),events)

    def test_stale_package_removed_and_current_package_published(self):
        now=datetime.now(timezone.utc)
        old={"id":3,"name":"sf6-coach-package-old-001.zip","state":"uploaded",
             "created_at":(now-timedelta(hours=50)).isoformat()}
        current={"id":4,"name":self.name,"state":"uploaded",
                 "created_at":(now-timedelta(minutes=5)).isoformat()}
        done=[]
        with patch.object(app,"get_release_and_assets",return_value=({"tag_name":app.TAG},[old,current])),\
             patch.object(app,"delete_package",side_effect=lambda a:done.append(("del",a["id"]))),\
             patch.object(app,"publish_package",side_effect=lambda a:done.append(("pub",a["id"]))):
            self.assertEqual(app.ingest_pending(),0)
        self.assertEqual(done,[("del",3),("pub",4)])

    def test_no_packages_is_safe_noop(self):
        with patch.object(app,"get_release_and_assets",return_value=({"tag_name":app.TAG},[])),\
             patch.object(app,"run_gh",side_effect=AssertionError("Unexpected upload")):
            self.assertEqual(app.ingest_pending(),0)

    def test_bad_package_rejected_and_reported(self):
        now=datetime.now(timezone.utc)
        bad={"id":5,"name":self.name,"state":"uploaded","created_at":now.isoformat()}
        with patch.object(app,"get_release_and_assets",return_value=({"tag_name":app.TAG},[bad])),\
             patch.object(app,"publish_package",side_effect=ValueError("Unsafe")):
            self.assertEqual(app.ingest_pending(),1)

    def test_cannot_delete_any_other_asset(self):
        with patch.object(app,"run_gh",side_effect=AssertionError("Unexpected deletion")):
            with self.assertRaises(ValueError):
                app.delete_package({"id":4,"name":"my-personal-video.mp4"})
            with self.assertRaises(ValueError):
                app.delete_package({"id":-1,"name":self.name})


if __name__=="__main__":
    unittest.main()
