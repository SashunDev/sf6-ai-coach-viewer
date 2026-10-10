#!/usr/bin/env python3
"""Generate a valid SF6 AI Coach v1 one-tap report link (stdlib only).

Videos are NOT uploaded: optionally link a verified, already-published MP4.
The zlib+base64url token contains the full readable coaching JSON, not a secret.
"""
from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import zlib

VIEWER = "https://sashundev.github.io/sf6-ai-coach-viewer/"
MEDIA = VIEWER + "media/"
VIDEO_NAME = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}\.mp4$", re.ASCII | re.I)
URL_TOKEN_LIMIT = 12_000
MAX_JSON_BYTES = 1_048_576


def validate_report(data: object) -> dict:
    if not isinstance(data, dict) or type(data.get("schemaVersion")) is not int or data["schemaVersion"] != 1:
        raise ValueError("Expected a report object with schemaVersion: 1")
    match, coaching, events = data.get("match"), data.get("coaching"), data.get("events")
    if not isinstance(match, dict) or not isinstance(coaching, dict) or not isinstance(events, list):
        raise ValueError("Report requires match, coaching and events")
    if not 1 <= len(events) <= 40:
        raise ValueError("Report must have 1-40 events")
    if not isinstance(match.get("durationSec"), (int, float)) or not 0 < match["durationSec"] <= 86400:
        raise ValueError("Invalid video duration")
    for field in ("self", "opponent", "mainFocus", "analysisMode", "style"):
        if not isinstance(match.get(field), str) or not match[field].strip():
            raise ValueError("Missing match field: " + field)
    for field in ("summary", "primaryTheme"):
        if not isinstance(coaching.get(field), str) or not coaching[field].strip():
            raise ValueError("Missing coaching field: " + field)
    previous = -1.0
    for event in events:
        if not isinstance(event, dict):
            raise ValueError("Event must be an object")
        start, end = event.get("start"), event.get("end")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (start, end)):
            raise ValueError("Event timestamp must be numeric")
        if start < 0 or start < previous or end <= start or end > match["durationSec"]:
            raise ValueError("Event video-relative timestamps are invalid")
        if event.get("category") not in ("good", "review"):
            raise ValueError("Event category must be good or review")
        for field in ("round", "tag", "title", "short", "observed", "judgment", "action", "success"):
            if not isinstance(event.get(field), str) or not event[field].strip():
                raise ValueError("Missing event field: " + field)
        previous = start
    return data


def make_link(data: dict, video_name: str | None = None) -> str:
    validate_report(data)
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(raw) > MAX_JSON_BYTES:
        raise ValueError("Report exceeds 1MB")
    token = "z." + base64.urlsafe_b64encode(zlib.compress(raw, level=9)).decode("ascii").rstrip("=")
    if len(token) > URL_TOKEN_LIMIT:
        raise ValueError("Report link token exceeds the viewer's 12000 character limit")
    params = [("r", token)]
    if video_name is not None:
        if not VIDEO_NAME.fullmatch(video_name):
            raise ValueError("Invalid Pages MP4 filename")
        params.append(("v", MEDIA + video_name))
    return VIEWER + "#" + urlencode(params)


def is_published(video_name: str) -> bool:
    if not VIDEO_NAME.fullmatch(video_name):
        raise ValueError("Invalid Pages MP4 filename")
    req = Request(MEDIA + video_name, method="HEAD", headers={"User-Agent": "SF6-AI-Coach-Link-Builder"})
    try:
        with urlopen(req, timeout=15) as response:
            return response.status == 200 and "video/" in response.headers.get("Content-Type", "").lower()
    except (HTTPError, URLError, TimeoutError):
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path, help="v1 coaching report JSON")
    parser.add_argument("--video-name", help="Already published Pages MP4 file, e.g. match-001.mp4")
    parser.add_argument("--check-pages", action="store_true",
                        help="Require public Pages video to return HTTP 200 and video/* before adding it")
    parser.add_argument("--out", type=Path, help="Write URL to a text file")
    args = parser.parse_args()
    if args.check_pages and not args.video_name:
        parser.error("--check-pages requires --video-name")
    if args.video_name and args.check_pages and not is_published(args.video_name):
        parser.error("Pages MP4 is not publicly streamable yet; publish first or omit --video-name")
    raw = args.report.read_bytes()
    if len(raw) > MAX_JSON_BYTES:
        parser.error("JSON is larger than 1 MB")
    link = make_link(json.loads(raw.decode("utf-8")), args.video_name)
    if args.out:
        args.out.write_text(link + "\n", encoding="utf-8")
    print(link)
    if args.video_name and not args.check_pages:
        print("WARNING: MP4 availability was NOT checked; this link may be report-only until Pages is updated.",
              file=__import__("sys").stderr)


if __name__ == "__main__":
    main()
