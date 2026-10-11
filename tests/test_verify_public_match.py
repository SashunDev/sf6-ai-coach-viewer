"""P4-C Pages verifier unit tests. No GitHub publish or network is performed."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import verify_public_match as verifier


def report_data(mid="test-replay"):
    return {
        "schemaVersion": 1,
        "match": {"id": mid, "self": "Alex", "opponent": "Terry",
                  "scoreSelf": 1, "scoreOpponent": 2, "style": "Classic",
                  "durationSec": 16, "analysisMode": "Replay",
                  "mainFocus": "Lethal", "mainFocusNote": ""},
        "coaching": {"summary": "Synthetic", "primaryTheme": "SA3",
                     "secondaryTheme": None},
        "events": [{"id": "E01", "round": "ROUND 01", "start": 2.0,
                    "end": 4.0, "category": "review", "tag": "SA3",
                    "title": "Synthetic", "short": "Synthetic",
                    "observed": "Sample", "judgment": "Unverified",
                    "action": "Check", "success": "Pass"}],
    }


class VerifyPublicMatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.mid = "test-replay"
        self.report = self.root / (self.mid + ".json")
        self.video = self.root / (self.mid + ".mp4")
        self.report.write_text(json.dumps(report_data()), encoding="utf-8")
        self.video.write_bytes(b"\x00\x00\x00\x18ftypisom" + b"\x00" * 100)

    def test_success_checks_both_assets_and_only_then_returns_short_url(self):
        inspected = []
        with patch.object(verifier, "inspect_video", return_value=self.video.stat().st_size), \
             patch.object(verifier, "verify_public", side_effect=lambda *args: inspected.append(args)):
            link = verifier.verify_uploaded_pair(self.mid, self.report, self.video,
                                                 retries=1, pause=0)
        self.assertEqual(link, verifier.PAGES + "#id=" + self.mid)
        self.assertEqual(len(inspected), 2)
        self.assertEqual(inspected[0][0], verifier.PAGES + "reports/" + self.mid + ".json")
        self.assertEqual(inspected[1][0], verifier.PAGES + "media/" + self.mid + ".mp4")
        self.assertEqual(inspected[0][2], "application/json")
        self.assertEqual(inspected[1][2], "video/mp4")

    def test_missing_mp4_never_prints_verified_link(self):
        def no_video(url, *args):
            if "/media/" in url:
                raise RuntimeError("404 video")
        with patch.object(verifier, "inspect_video", return_value=100), \
             patch.object(verifier, "verify_public", side_effect=no_video), \
             patch.object(verifier.time, "sleep") as sleep:
            with self.assertRaisesRegex(RuntimeError, "NOT VERIFIED"):
                verifier.verify_uploaded_pair(self.mid, self.report, self.video,
                                             retries=2, pause=0)
            sleep.assert_called_once()

    def test_stale_json_retries_then_succeeds(self):
        calls = []
        def flaky(url, *args):
            calls.append(url)
            if len(calls) == 1:
                raise RuntimeError("old report sha")
        with patch.object(verifier, "inspect_video", return_value=100), \
             patch.object(verifier, "verify_public", side_effect=flaky), \
             patch.object(verifier.time, "sleep") as sleep:
            verifier.verify_uploaded_pair(self.mid, self.report, self.video,
                                         retries=2, pause=0)
        self.assertEqual(len(calls), 3)
        sleep.assert_called_once()

    def test_invalid_id_is_rejected_before_network(self):
        with patch.object(verifier, "inspect_video", return_value=100), \
             patch.object(verifier, "verify_public",
                          side_effect=AssertionError("No network permitted")):
            for bad in ("../evil", "abc.json", "hello world", "あ"):
                with self.assertRaises(ValueError):
                    verifier.verify_uploaded_pair(bad, self.report, self.video,
                                                 retries=1, pause=0)

    def test_json_file_mismatch_and_invalid_schema_fail_closed(self):
        with patch.object(verifier, "verify_public",
                          side_effect=AssertionError("No network permitted")):
            self.report.write_text(json.dumps(report_data("another-id")))
            with self.assertRaisesRegex(ValueError, "must match"):
                verifier.verify_uploaded_pair(self.mid, self.report, self.video,
                                             retries=1, pause=0)

    def test_codec_and_length_are_checked(self):
        with patch.object(verifier, "inspect_video", side_effect=ValueError("video codec wrong")), \
             patch.object(verifier, "verify_public",
                          side_effect=AssertionError("No network permitted")):
            with self.assertRaisesRegex(ValueError, "video codec wrong"):
                verifier.verify_uploaded_pair(self.mid, self.report, self.video,
                                             retries=1, pause=0)

    def test_retry_bounds(self):
        with patch.object(verifier, "inspect_video", return_value=100):
            for n in (0, -1, 61):
                with self.assertRaisesRegex(ValueError, "retry"):
                    verifier.verify_uploaded_pair(self.mid, self.report, self.video,
                                                 retries=n, pause=0)


if __name__ == "__main__":
    unittest.main()
