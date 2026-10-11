"""Tests for P4-B: mocked GitHub/public HTTP only; never publish a real user file."""
from __future__ import annotations

import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import publish_match as pub


def report_data():
    return {
        "schemaVersion":1,
        "match":{"id":"match-01","self":"Alex","opponent":"Terry",
                 "scoreSelf":1,"scoreOpponent":2,"style":"Classic","durationSec":16,
                 "analysisMode":"Review","mainFocus":"Lethal","mainFocusNote":""},
        "coaching":{"summary":"Evidence-first","primaryTheme":"SA3","secondaryTheme":None},
        "events":[{"id":"E01","round":"ROUND 01","start":1,"end":3,"category":"review",
                   "tag":"SA3","title":"Stun","short":"Missed",
                   "observed":"Stun","judgment":"User confirmed",
                   "action":"Check SA3","success":"Finish"}],
    }


def assets():
    return []


def asset(name, size, id_):
    return {"id":id_, "name":name, "size":size, "state":"uploaded",
            "created_at":datetime.now(timezone.utc).isoformat()}


class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.report = self.root / "match-01.json"
        self.video = self.root / "match-01.mp4"
        self.report.write_text(json.dumps(report_data()), encoding="utf-8")
        self.video.write_bytes(b"\x00\x00\x00\x18ftypisom" + b"0"*100)

    def mock_codec(self, codec="h264", length="16", audio="aac"):
        result = json.dumps({"format":{"duration":length},
                             "streams":[{"codec_type":"video","codec_name":codec},
                                        {"codec_type":"audio","codec_name":audio}]})
        return patch.object(pub.subprocess, "run",
                            return_value=subprocess.CompletedProcess([],0,result,""))

    def test_report_validation_and_consistent_pair(self):
        data,n = pub.inspect_report(self.report, "match-01")
        self.assertEqual(data["match"]["id"],"match-01")
        self.assertGreater(n,0)
        with self.assertRaisesRegex(ValueError,"must match"):
            pub.inspect_report(self.report,"another-id")
        self.report.write_text(self.report.read_text().replace('"id": "match-01"','"id": "evil"'))
        with self.assertRaisesRegex(ValueError,"must match"):
            pub.inspect_report(self.report, "match-01")

    def test_video_codec_duration_and_header(self):
        with patch.object(pub.shutil,"which",return_value="/usr/bin/ffprobe"):
            with self.mock_codec():
                self.assertEqual(pub.inspect_video(self.video,"match-01",16), self.video.stat().st_size)
            with self.mock_codec(codec="hevc"):
                with self.assertRaisesRegex(ValueError,"H.264"):
                    pub.inspect_video(self.video,"match-01",16)
            with self.mock_codec(length="31"):
                with self.assertRaisesRegex(ValueError,"duration"):
                    pub.inspect_video(self.video,"match-01",16)
            with self.mock_codec(audio="opus"):
                with self.assertRaisesRegex(ValueError,"AAC"):
                    pub.inspect_video(self.video,"match-01",16)
        self.video.write_bytes(b"not a video")
        with self.assertRaises(ValueError):
            pub.inspect_video(self.video,"match-01",16)

    def test_release_asset_preflight_capacity_and_collision(self):
        now = datetime.now(timezone.utc)
        self.assertEqual(pub.plan_existing_assets([], "match-01",1000,500,replacing_report=False),set())
        existing=[asset("match-01.mp4", 1000, 1), asset("match-01.json", 500, 2)]
        self.assertEqual(pub.plan_existing_assets(existing,"match-01",1000,500,replacing_report=True),
                         {"match-01.mp4","match-01.json"})
        with self.assertRaisesRegex(ValueError,"Duplicate"):
            pub.plan_existing_assets(existing+[asset("MATCH-01.JSON",300,3)],"match-01",
                                     1000,500,replacing_report=False)
        with self.assertRaises(ValueError):
            pub.plan_existing_assets([], "match-01", pub.MEDIA_BUDGET+1, 500,
                                     replacing_report=False)
        with self.assertRaisesRegex(ValueError,"count exceeded"):
            pub.plan_existing_assets([asset(f"old-{i}.json",100,i+10)
                                      for i in range(pub.REPORT_MAX_COUNT)],"match-01",1000,500,
                                     replacing_report=False)

    def test_release_enumeration_and_fail_closed(self):
        release={"id":100,"tag_name":pub.TAG,"body":"xxx"}
        with patch.object(pub,"gh_json",side_effect=[release,[asset("x.mp4",100,1)]]):
            actual, inventory=pub.get_release_and_assets()
        self.assertEqual(actual["id"],100)
        self.assertEqual(len(inventory),1)
        with patch.object(pub,"gh_json",return_value={"id":10,"tag_name":"not-ours"}):
            with self.assertRaisesRegex(RuntimeError,"Unexpected"):
                pub.get_release_and_assets()

    def prereqs(self, present=None):
        if present is None:present=[]
        return [
            patch.object(pub.shutil,"which",return_value="/usr/bin/gh"),
            patch.object(pub,"inspect_video",return_value=self.video.stat().st_size),
            patch.object(pub,"get_release_and_assets",return_value=(
                {"id":10,"tag_name":pub.TAG,"body":pub.OLD_NOTES},present
            )),
        ]

    def test_safe_default_dry_run_does_not_upload(self):
        with self.prereqs()[0],self.prereqs()[1],self.prereqs()[2],\
             patch.object(pub,"run_gh",side_effect=AssertionError("unauthorized upload")):
            self.assertEqual(pub.publish(self.report,self.video,apply=False,
                                         resume=False,replace_report=False,backup_dir=None,
                                         wait_sec=60),"DRY_RUN")

    def test_duplicate_ids_refused_before_mutation(self):
        old=[asset("match-01.mp4",1000,1),asset("match-01.json",500,2)]
        mocks=self.prereqs(old)
        with mocks[0],mocks[1],mocks[2],\
             patch.object(pub,"run_gh",side_effect=AssertionError("must not upload")):
            with self.assertRaisesRegex(ValueError,"collision"):
                pub.publish(self.report,self.video,apply=True,resume=False,
                            replace_report=False,backup_dir=None,wait_sec=60)
            with self.assertRaisesRegex(ValueError,"backup-dir"):
                pub.publish(self.report,self.video,apply=True,resume=False,
                            replace_report=True,backup_dir=None,wait_sec=60)

    def test_success_requires_pages_dispatch_http_and_sha(self):
        mocks=self.prereqs()
        commands=[]
        def gh_spy(*args,**kwargs):
            commands.append(args)
            return "ok"
        with mocks[0],mocks[1],mocks[2],\
             patch.object(pub,"get_run_ids",return_value={1}),\
             patch.object(pub,"run_gh",side_effect=gh_spy),\
             patch.object(pub,"start_pages_and_wait",return_value=120),\
             patch.object(pub,"wait_pages") as verified:
            link=pub.publish(self.report,self.video,apply=True,resume=False,
                             replace_report=False,backup_dir=None,wait_sec=60)
        self.assertEqual(link,pub.PAGES+"#id=match-01")
        self.assertEqual([c[2] for c in commands if c[:2]==("release","upload")],
                         [pub.TAG,pub.TAG])
        self.assertEqual([c[3].endswith(".mp4") for c in commands if c[:2]==("release","upload")],[True,False])
        verified.assert_called_once()

    def test_failure_to_upload_second_asset_cannot_claim_success(self):
        mocks=self.prereqs()
        def fail_json(*args,**kwargs):
            if args[:2]==("release","upload") and str(args[3]).endswith(".json"):
                raise RuntimeError("upload rejected")
            return "ok"
        with mocks[0],mocks[1],mocks[2],\
             patch.object(pub,"get_run_ids",return_value=set()),\
             patch.object(pub,"run_gh",side_effect=fail_json),\
             patch.object(pub,"start_pages_and_wait",side_effect=AssertionError("should not deploy")):
            with self.assertRaisesRegex(RuntimeError,"upload rejected"):
                pub.publish(self.report,self.video,apply=True,resume=False,
                            replace_report=False,backup_dir=None,wait_sec=60)

    def test_failed_deploy_and_missing_mp4_block_verified_link(self):
        mocks=self.prereqs()
        with mocks[0],mocks[1],mocks[2],patch.object(pub,"get_run_ids",return_value=set()),\
             patch.object(pub,"run_gh",return_value="ok"),\
             patch.object(pub,"start_pages_and_wait",side_effect=RuntimeError("deploy FAIL")):
            with self.assertRaisesRegex(RuntimeError,"deploy FAIL"):
                pub.publish(self.report,self.video,apply=True,resume=False,
                            replace_report=False,backup_dir=None,wait_sec=60)
        with mocks[0],mocks[1],mocks[2],patch.object(pub,"get_run_ids",return_value=set()),\
             patch.object(pub,"run_gh",return_value="ok"),\
             patch.object(pub,"start_pages_and_wait",return_value=123),\
             patch.object(pub,"wait_pages",side_effect=RuntimeError("video missing")):
            with self.assertRaisesRegex(RuntimeError,"video missing"):
                pub.publish(self.report,self.video,apply=True,resume=False,
                            replace_report=False,backup_dir=None,wait_sec=60)

    def test_partial_release_requires_resume(self):
        mocks=self.prereqs([asset("match-01.mp4",1000,1)])
        with mocks[0],mocks[1],mocks[2],\
             patch.object(pub,"run_gh",side_effect=AssertionError("no write")):
            with self.assertRaisesRegex(ValueError,"--resume"):
                pub.publish(self.report,self.video,apply=True,resume=False,
                             replace_report=False,backup_dir=None,wait_sec=60)

    def test_resume_reuses_identical_existing_video_only(self):
        mocks=self.prereqs([asset("match-01.mp4",self.video.stat().st_size,1)])
        uploads=[]
        def mocked_gh(*args,**kwargs):
            if args[:2]==("release","download"):
                (Path(args[-1])/"match-01.mp4").write_bytes(self.video.read_bytes())
            elif args[:2]==("release","upload"):
                uploads.append(Path(args[3]).name)
            return "ok"
        with mocks[0],mocks[1],mocks[2],patch.object(pub,"get_run_ids",return_value=set()),\
             patch.object(pub,"run_gh",side_effect=mocked_gh),\
             patch.object(pub,"start_pages_and_wait",return_value=124),\
             patch.object(pub,"wait_pages"):
            self.assertEqual(pub.publish(self.report,self.video,apply=True,resume=True,
                             replace_report=False,backup_dir=None,wait_sec=60),
                             pub.PAGES+"#id=match-01")
        self.assertEqual(uploads,["match-01.json"])

    def test_resume_rejects_changed_video_before_any_write(self):
        mocks=self.prereqs([asset("match-01.mp4",self.video.stat().st_size,1)])
        uploads=[]
        def mocked_gh(*args,**kwargs):
            if args[:2]==("release","download"):
                (Path(args[-1])/"match-01.mp4").write_bytes(b"different")
            elif args[:2]==("release","upload"):
                uploads.append(args)
            return "ok"
        with mocks[0],mocks[1],mocks[2],patch.object(pub,"run_gh",side_effect=mocked_gh):
            with self.assertRaisesRegex(ValueError,"differs"):
                pub.publish(self.report,self.video,apply=True,resume=True,
                            replace_report=False,backup_dir=None,wait_sec=60)
        self.assertFalse(uploads)

    def test_explicit_report_correction_saves_backup_before_clobber(self):
        data=[asset("match-01.mp4",self.video.stat().st_size,1),
              asset("match-01.json",500,2)]
        mocks=self.prereqs(data)
        original=b'{"old":"report"}'
        commands=[]
        def mocked_gh(*args,**kwargs):
            if args[:2]==("release","download"):
                name=args[args.index("--pattern")+1]
                content=self.video.read_bytes() if name.endswith(".mp4") else original
                (Path(args[-1])/name).write_bytes(content)
            elif args[:2]==("release","upload"):
                commands.append(args)
            return "ok"
        backup=self.root/"backups"
        with mocks[0],mocks[1],mocks[2],patch.object(pub,"get_run_ids",return_value=set()),\
             patch.object(pub,"run_gh",side_effect=mocked_gh),\
             patch.object(pub,"start_pages_and_wait",return_value=125),\
             patch.object(pub,"wait_pages"):
            link=pub.publish(self.report,self.video,apply=True,resume=False,
                     replace_report=True,backup_dir=backup,wait_sec=60)
        self.assertEqual(link,pub.PAGES+"#id=match-01")
        copies=list(backup.glob("match-01.json.*.bak"))
        self.assertEqual(len(copies),1)
        self.assertEqual(copies[0].read_bytes(),original)
        self.assertEqual(len(commands),1)
        self.assertTrue(commands[0][3].endswith(".json"))
        self.assertIn("--clobber",commands[0])


    def test_concurrent_workflows_are_not_misattributed(self):
        with patch.object(pub,"run_gh",return_value=""),\
             patch.object(pub,"gh_json",return_value=[
                 {"databaseId":500},{"databaseId":501}]):
            with self.assertRaisesRegex(RuntimeError,"Concurrent"):
                pub.start_pages_and_wait({100},wait_sec=30)

    def test_replay_exact_sha_and_mime_required(self):
        payload=self.report.read_bytes()
        class Fake:
            status=200
            headers={"Content-Type":"application/json; charset=utf-8",
                     "Content-Length":str(len(payload))}
            def __init__(self, body):self.body=io.BytesIO(body)
            def __enter__(self):return self
            def __exit__(self,*args):return False
            def read(self,n):return self.body.read(n)
        with patch.object(pub,"urlopen",return_value=Fake(payload)):
            pub.verify_public(pub.PAGES+"reports/match-01.json",self.report,
                              "application/json",pub.REPORT_MAX_BYTES)
        with patch.object(pub,"urlopen",return_value=Fake(b"tampered")):
            with self.assertRaises(RuntimeError):
                pub.verify_public(pub.PAGES+"reports/match-01.json",self.report,
                                  "application/json",pub.REPORT_MAX_BYTES)
        class BadMime(Fake):
            headers={"Content-Type":"text/html"}
        with patch.object(pub,"urlopen",return_value=BadMime(payload)):
            with self.assertRaisesRegex(RuntimeError,"MIME"):
                pub.verify_public(pub.PAGES+"reports/match-01.json",self.report,
                                  "application/json",pub.REPORT_MAX_BYTES)

    def test_release_notes_corrected_without_deleting_unrelated_text(self):
        with patch.object(pub,"run_gh",return_value="ok") as called:
            self.assertTrue(pub.correct_release_notes({"id":10,
                "body":"PUBLIC media. "+pub.OLD_NOTES+" Other text."}))
        args=called.call_args.args
        self.assertIn("Other text.",args[-1])
        self.assertNotIn(pub.OLD_NOTES,args[-1])
        self.assertFalse(pub.correct_release_notes({"id":10,"body":"Already correct"}))


if __name__=="__main__":
    unittest.main()
