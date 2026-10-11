#!/usr/bin/env python3
"""Verify a manually uploaded SF6 video/JSON pair after a successful Pages deploy.

Does not upload, mutate, delete or publish content. Uses canonical schema,
codec and public-byte validators from publish_match.py. A verified short URL
is printed only when BOTH public resources match the dedicated Release assets.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError

from build_pages_site import MEDIA_BUDGET, REPORT_MAX_BYTES
from create_coaching_link import MATCH_ID
from publish_match import PAGES, inspect_report, inspect_video, verify_public


def validate_uploaded_files(match_id: str, report: Path, video: Path) -> None:
    if not MATCH_ID.fullmatch(match_id):
        raise ValueError("Invalid match ID; only letters, digits, underscore and hyphen")
    data, _ = inspect_report(report, match_id)
    inspect_video(video, match_id, data["match"]["durationSec"])


def verify_uploaded_pair(match_id: str, report: Path, video: Path,
                         retries: int = 18, pause: int = 5) -> str:
    """Retry temporarily missing/mismatched Pages mirrors (eventual deployment)."""
    validate_uploaded_files(match_id, report, video)
    if retries < 1 or retries > 60 or not 0 <= pause <= 30:
        raise ValueError("Invalid retry configuration")
    resources = (
        (PAGES + "reports/" + match_id + ".json", report, "application/json", REPORT_MAX_BYTES),
        (PAGES + "media/" + match_id + ".mp4", video, "video/mp4", MEDIA_BUDGET),
    )
    last = None
    for attempt in range(retries):
        try:
            for url, local, mime, limit in resources:
                verify_public(url, local, mime, limit)
            link = PAGES + "#id=" + match_id
            print("VERIFIED VIDEO + JSON (GitHub Pages bytes and MIME): " + link)
            print("PASS: valid schema/ID and H.264; public MP4 and JSON SHA-256 match Release assets")
            print("Browser playback and seeking on iPhone still require a separate real-device check.")
            return link
        except (RuntimeError, HTTPError, URLError, OSError, TimeoutError, ValueError) as exc:
            last = exc
            if attempt < retries - 1:
                time.sleep(pause)
    raise RuntimeError(
        "NOT VERIFIED: at least one Pages asset is missing, stale, wrong type, or "
        "different from the Release. Never treat this as iPhone E2E PASS."
    ) from last


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--match-id", required=True)
    parser.add_argument("--report-file", required=True, type=Path)
    parser.add_argument("--video-file", required=True, type=Path)
    parser.add_argument("--retries", type=int, default=18)
    parser.add_argument("--pause", type=int, default=5)
    args = parser.parse_args(argv)
    try:
        verify_uploaded_pair(args.match_id, args.report_file, args.video_file,
                             retries=args.retries, pause=args.pause)
        return 0
    except (RuntimeError, ValueError, OSError) as exc:
        print("P4-C PUBLIC VERIFICATION FAILED:", str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
