import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from cleanup_release_videos import VideoAsset, calculate_deletions, parse_asset

NOW = datetime(2026, 10, 10, tzinfo=timezone.utc)
MB = 1_000_000


def v(i, days, size, name=None):
    return VideoAsset(i, name or f"match_{i}.mp4", size * MB, NOW - timedelta(days=days))


class RetentionTests(unittest.TestCase):
    def test_normal_under_limit(self):
        removed, report = calculate_deletions([v(1, 1, 950), v(2, 2, 1000)], NOW)
        self.assertEqual(removed, [])
        self.assertIn("remaining_bytes=1950000000", report)

    def test_exact_limit_no_capacity_trim(self):
        removed, _ = calculate_deletions([v(1, 1, 1000), v(2, 2, 1000)], NOW)
        self.assertEqual(removed, [])

    def test_over_limit_trim_to_90_percent(self):
        removed, report = calculate_deletions([v(1, 3, 500), v(2, 2, 850), v(3, 1, 850)], NOW)
        self.assertEqual([x.id for x in removed], [1])
        self.assertIn("remaining_bytes=1700000000", report)

    def test_expiry_first_14_days_exact(self):
        removed, report = calculate_deletions([v(1, 14, 100), v(2, 13.99, 100)], NOW)
        self.assertEqual([x.id for x in removed], [1])
        self.assertIn("age_deleted=1", report)

    def test_oldest_first_and_stable_order(self):
        removed, _ = calculate_deletions([v(3, 1, 850), v(1, 2, 600), v(2, 2, 850)], NOW)
        self.assertEqual([x.id for x in removed], [1])

    def test_json_is_never_deleted(self):
        removed, report = calculate_deletions([v(1, 100, 1000, "report.json"), v(2, 1, 100, "a.mp4")], NOW)
        self.assertEqual(removed, [])
        self.assertIn("all_video_assets=1", report)

    def test_expire_before_capacity(self):
        removed, report = calculate_deletions([v(1, 20, 1000), v(2, 2, 1000), v(3, 1, 1000)], NOW)
        self.assertEqual([a.id for a in removed], [1])
        self.assertIn("remaining_bytes=2000000000", report)

    def test_non_media_files_exempt_even_if_old(self):
        removed, _ = calculate_deletions([v(1, 20, 100, "config.txt"), v(2, 20, 100, "notes.json")], NOW)
        self.assertEqual(removed, [])

    def test_case_insensitive_video_ext(self):
        removed, _ = calculate_deletions([v(1, 20, 50, "GAME.MP4")], NOW)
        self.assertEqual([a.id for a in removed], [1])

    def test_single_large_video_deletion(self):
        removed, _ = calculate_deletions([v(1, 1, 1999), v(2, 2, 2)], NOW)
        self.assertEqual([a.id for a in removed], [2, 1])

    def test_parse_asset(self):
        a = parse_asset({"id": 10, "size": 123, "name": "replay.mp4", "created_at": "2026-10-10T07:00:00Z"})
        self.assertEqual((a.id, a.size, a.created_at.tzinfo), (10, 123, timezone.utc))


if __name__ == "__main__":
    unittest.main()
