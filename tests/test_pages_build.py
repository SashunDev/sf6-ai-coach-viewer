from datetime import datetime, timedelta, timezone
import tempfile
import sys
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_pages_site import (
    Asset, MEDIA_BUDGET, MAX_AGE_DAYS, SITE_FILES, build,
    parse_asset, select_assets, parse_report_asset, select_reports,
    REPORT_TOTAL_BUDGET, REPORT_MAX_BYTES
)

NOW = datetime(2026, 10, 11, tzinfo=timezone.utc)


def item(i: int, age: float, size: int, name: str | None = None) -> Asset:
    return Asset(i, name or f"test-{i}.mp4", size, NOW - timedelta(days=age))


def raw(name="clip.mp4", size=100, age=1, state="uploaded"):
    return dict(id=10, name=name, size=size, state=state,
                created_at=(NOW - timedelta(days=age)).isoformat())


class PagesMirrorTests(TestCase):
    def test_newest_first(self):
        chosen=select_assets([item(1, 3, 9), item(2, 2, 9), item(3, 1, 9)], NOW)
        self.assertEqual([a.id for a in chosen], [3, 2, 1])

    def test_exact_budget(self):
        chosen=select_assets([item(1, 1, MEDIA_BUDGET)], NOW)
        self.assertEqual(len(chosen), 1)

    def test_above_budget(self):
        chosen=select_assets([item(1, 1, MEDIA_BUDGET + 1)], NOW)
        self.assertEqual(chosen, [])

    def test_one_too_large_but_next_smaller(self):
        chosen=select_assets([item(1, 1, MEDIA_BUDGET+1),
                              item(2, 2, 40)], NOW)
        self.assertEqual([a.id for a in chosen], [2])

    def test_no_overflow(self):
        chosen=select_assets([item(1,1,600_000_000),
                              item(2,2,300_000_000),
                              item(3,3,200_000_000)], NOW)
        self.assertEqual([a.id for a in chosen], [1,3])

    def test_exactly_14_days_old_excluded(self):
        self.assertEqual(select_assets([item(1,14,100)],NOW),[])

    def test_younger_than_14_days_included(self):
        self.assertEqual(len(select_assets([item(1,13.99,100)],NOW)),1)

    def test_future_timestamp_over_one_hour_excluded(self):
        self.assertEqual(select_assets([item(1,-2,100)],NOW),[])

    def test_parse_good_asset(self):
        x=parse_asset(raw())
        self.assertEqual((x.id,x.name,x.size),(10,"clip.mp4",100))

    def test_json_never_published(self):
        self.assertIsNone(parse_asset(raw(name="match-report.json")))

    def test_other_video_extensions_not_published(self):
        self.assertIsNone(parse_asset(raw(name="match.webm")))

    def test_filename_traversal_rejected(self):
        for name in ["../evil.mp4","a/b.mp4","x%2fy.mp4","bad name.mp4",
                     ".hidden.mp4","evil.mp4?dl=1","Klip.mp4"]:
            with self.subTest(name=name):
                self.assertIsNone(parse_asset(raw(name=name)))

    def test_unavailable_assets_ignored(self):
        self.assertIsNone(parse_asset(raw(state="starter")))

    def test_duplicate_filename_refuses_ambiguity(self):
        with self.assertRaises(ValueError):
            select_assets([item(1,1,200,"ABC.mp4"),item(2,2,100,"abc.mp4")],NOW)

    def test_site_copies_existing_pages_and_video(self):
        with tempfile.TemporaryDirectory() as base:
            root=Path(base)
            for x in SITE_FILES:
                (root / x).write_text("original:"+x,encoding="utf-8")
            output=root/"pub"
            data=b"\0\0\0\x10ftypisom\0\0\0\0"
            asset=item(1,1,len(data),"good.mp4")
            def fake_download(argv,**kwargs):
                media=Path(argv[argv.index("--dir")+1])
                (media/"good.mp4").write_bytes(data)
                return None
            with patch("build_pages_site.subprocess.run",side_effect=fake_download):
                build(output,root,[asset],"test-token")
            self.assertEqual((output/"index.html").read_text(),"original:index.html")
            self.assertEqual((output/"media/good.mp4").read_bytes(),data)
            self.assertTrue((output/".nojekyll").exists())
            self.assertEqual(sorted(x.name for x in (output/"media").iterdir()),["good.mp4"])

    def test_failed_download_refuses_deploy(self):
        with tempfile.TemporaryDirectory() as base:
            root=Path(base)
            for x in SITE_FILES:
                (root/x).write_text("x")
            with patch("build_pages_site.subprocess.run",return_value=None):
                with self.assertRaises(RuntimeError):
                    build(root/"pub",root,[item(1,1,80)],"test-token")

    def test_does_not_overwrite_existing_output(self):
        with tempfile.TemporaryDirectory() as base:
            root=Path(base)
            (root/"pub").mkdir()
            with self.assertRaises(FileExistsError):
                build(root/"pub",root,[],"test-token")

    def test_parse_rejects_untrusted_metadata(self):
        for changes in [{"size":0},{"size":True},{"id":"1"},{"created_at":"yesterday"}]:
            with self.subTest(changes=changes):
                with self.assertRaises((ValueError,TypeError)):
                    parse_asset({**raw(),**changes})

    def test_report_json_asset_is_distinct_from_video(self):
        data = raw(name="match-001.json", size=23, age=999)
        self.assertIsNone(parse_asset(data))
        parsed = parse_report_asset(data)
        self.assertEqual(parsed.name, "match-001.json")
        self.assertEqual(select_reports([parsed]), [parsed])

    def test_report_video_age_does_not_expire_json(self):
        report = Asset(2, "match-002.json", 170, NOW - timedelta(days=900))
        self.assertEqual(select_reports([report]), [report])

    def test_report_budget_exact_boundary(self):
        data = Asset(1, "match-001.json", REPORT_MAX_BYTES, NOW)
        self.assertEqual(select_reports([data]), [data])

    def test_report_size_over_limit_refuses_asset(self):
        with self.assertRaises(ValueError):
            parse_report_asset(raw(name="match-001.json", size=REPORT_MAX_BYTES + 1))

    def test_report_cannot_exceed_total_pages_budget(self):
        reports = [Asset(i+1, f"match-{i}.json", REPORT_MAX_BYTES, NOW)
                   for i in range(REPORT_TOTAL_BUDGET // REPORT_MAX_BYTES + 1)]
        with self.assertRaises(ValueError):
            select_reports(reports)

    def test_report_name_safety(self):
        for name in ["a/b.json", "../report.json", "a.json%3F", ".private.json",
                     "Match.Report.json", "Klip.json", "bad name.json", "bad.mp4"]:
            with self.subTest(name=name):
                self.assertIsNone(parse_report_asset(raw(name=name)))

    def test_duplicate_reports_refused(self):
        with self.assertRaises(ValueError):
            select_reports([Asset(1,"match-A.json",100,NOW),
                            Asset(2,"match-a.json",100,NOW)])

    def test_report_is_copied_even_without_video(self):
        import json
        sample = {
          "schemaVersion":1,
          "match":{"id":"match-001","self":"アレックス","opponent":"リュウ","style":"クラシック",
                   "analysisMode":"動画連動レポート","scoreSelf":1,"scoreOpponent":0,
                   "mainFocus":"判断","mainFocusNote":"検証","durationSec":16},
          "coaching":{"summary":"観察","primaryTheme":"判断","secondaryTheme":None},
          "events":[{"id":"E01","round":"ROUND 01","start":2.0,"end":3.0,
                     "category":"good","tag":"良いプレイ","title":"成功",
                     "short":"確認","observed":"行動","judgment":"判断","action":"次回",
                     "success":"条件"}]
        }
        raw_json = json.dumps(sample,ensure_ascii=False).encode("utf-8")
        with tempfile.TemporaryDirectory() as base:
            root=Path(base)
            for page in SITE_FILES:
                (root/page).write_text("original",encoding="utf-8")
            asset=Asset(1,"match-001.json",len(raw_json),NOW)
            def fake_download(argv,**kwargs):
                (Path(argv[argv.index("--dir")+1])/"match-001.json").write_bytes(raw_json)
            with patch("build_pages_site.subprocess.run",side_effect=fake_download):
                build(root/"pub",root,[],"token",[asset])
            self.assertEqual((root/"pub/reports/match-001.json").read_bytes(),raw_json)
            self.assertEqual(list((root/"pub/media").iterdir()),[])


if __name__ == "__main__":
    main()
