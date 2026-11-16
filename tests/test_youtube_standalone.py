import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_standalone_report as app


class StandaloneYouTubeIsolationTests(unittest.TestCase):
    def test_canonical_offline_bundle_excludes_external_youtube_mode(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        result = app.strip_external_youtube_mode(source)
        self.assertIn('id="viewer"', result)
        self.assertIn('id="fileInput" type="file"', result)
        self.assertIn('id="coach-report-data" type="application/json"', result)
        self.assertIn(app.LOCAL_CSP, result)
        self.assertNotIn(app.YT_CSP, result)
        self.assertNotIn('id="youtubeReviewPanel"', result)
        self.assertNotIn('id="youtubeOpen"', result)
        self.assertNotIn('youtube-review.mjs', result)
        self.assertNotIn('window.addEventListener(\'sf6:youtube-review-open\'', result)
        self.assertEqual(result.count('id="insight"'), 1)
        self.assertEqual(result.count('id="viewer"'), 1)

    def test_older_offline_template_unchanged(self):
        legacy = '<html><body><script>test()</script></body></html>'
        self.assertEqual(app.strip_external_youtube_mode(legacy), legacy)

    def test_malformed_canonical_external_mode_fails_closed(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        with self.assertRaises(ValueError):
            app.strip_external_youtube_mode(source.replace(app.YT_MODULE, "", 1))
        with self.assertRaises(ValueError):
            app.strip_external_youtube_mode(source.replace(app.YT_CSP, app.LOCAL_CSP, 1))


if __name__ == "__main__":
    unittest.main()
