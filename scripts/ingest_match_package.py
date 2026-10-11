#!/usr/bin/env python3
"""Safely consume ONE manually uploaded public SF6 match ZIP from the dedicated Release.

Canonical operations reuse publish_match.publish (no video's Git commit).
Only the user's explicit ZIP upload makes a match eligible for public publishing.
Matching temporary packages are deleted after successful Pages verification;
stale packages are deleted after 48h even if validation or publishing failed.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import zipfile

from publish_match import (
    REPO, TAG, get_release_and_assets, inspect_report, inspect_video,
    publish, run_gh,
)

PACKAGE_PREFIX = "sf6-coach-package-"
PACKAGE_NAME = re.compile(r"^sf6-coach-package-([A-Za-z0-9][A-Za-z0-9_-]{0,79})\.zip$", re.ASCII)
MAX_ARCHIVE_BYTES = 100_000_000
MAX_README_BYTES = 2048
MAX_JSON_BYTES = 1_048_576
MAX_VIDEO_BYTES = 800_000_000
STALE_HOURS = 48


def extract_package(package: Path, output_dir: Path) -> tuple[str, Path, Path]:
    match = PACKAGE_NAME.fullmatch(package.name)
    if not match:
        raise ValueError("Expected sf6-coach-package-<safe-match-id>.zip")
    if not 1 <= package.stat().st_size <= MAX_ARCHIVE_BYTES:
        raise ValueError("Archive must be between 1 and 100,000,000 bytes")
    match_id = match.group(1)
    expected = {match_id + ".mp4", match_id + ".json"}
    allowed = expected | {"PUBLISH_README.txt"}
    with zipfile.ZipFile(package) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) not in (2, 3) or len(set(names)) != len(names):
            raise ValueError("Archive contains unexpected/duplicate entries")
        if not expected.issubset(set(names)) or not set(names).issubset(allowed):
            raise ValueError("Archive names must match report/video ID exactly")
        size_limit = {match_id + ".mp4": MAX_VIDEO_BYTES,
                      match_id + ".json": MAX_JSON_BYTES,
                      "PUBLISH_README.txt": MAX_README_BYTES}
        if sum(e.file_size for e in entries) > sum(size_limit.values()):
            raise ValueError("Uncompressed archive exceeds permitted size")
        for info in entries:
            if info.is_dir() or info.flag_bits & 1 or info.file_size < 1:
                raise ValueError("No folders, encrypted or empty entries allowed")
            if (info.external_attr >> 16) & 0o170000 == stat.S_IFLNK:
                raise ValueError("Symlinks are forbidden")
            if info.file_size > size_limit[info.filename] or info.compress_type not in (
                zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED,
            ):
                raise ValueError("Unexpected ZIP entry compression or size")
            if "/" in info.filename or "\\" in info.filename:
                raise ValueError("ZIP paths are forbidden")
        for info in entries:
            # No extractall: stream safe flat files into a private temporary folder.
            target = output_dir / info.filename
            with archive.open(info) as stream, target.open("xb") as dest:
                length = 0
                while True:
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    length += len(chunk)
                    if length > size_limit[info.filename]:
                        raise ValueError("Excessive uncompressed ZIP entry")
                    dest.write(chunk)
                if length != info.file_size:
                    raise ValueError("ZIP entry length mismatch")
    report, video = output_dir / (match_id + ".json"), output_dir / (match_id + ".mp4")
    data, _ = inspect_report(report, match_id)
    inspect_video(video, match_id, data["match"]["durationSec"])
    return match_id, report, video


def delete_package(asset: dict) -> None:
    name = asset.get("name")
    if not isinstance(name, str) or not name.startswith(PACKAGE_PREFIX):
        raise ValueError("Can only delete dedicated temporary upload packages")
    asset_id = asset.get("id")
    if type(asset_id) is not int or asset_id <= 0:
        raise ValueError("Invalid GitHub asset ID")
    run_gh("api", "-X", "DELETE", f"repos/{REPO}/releases/assets/{asset_id}")
    print("Deleted public staging package:", name)


def created_at(asset: dict) -> datetime:
    when = datetime.fromisoformat(asset["created_at"].replace("Z", "+00:00"))
    if when.tzinfo is None:
        raise ValueError("Asset timestamp missing timezone")
    return when.astimezone(timezone.utc)


def publish_package(asset: dict) -> str:
    name = asset["name"]
    if not PACKAGE_NAME.fullmatch(name):
        raise ValueError("Not a supported package filename")
    with tempfile.TemporaryDirectory(prefix="sf6-one-upload-") as folder:
        root = Path(folder)
        # Asset names validated above and downloaded without shell expansion.
        run_gh("release", "download", TAG, "--repo", REPO,
               "--pattern", name, "--dir", str(root), timeout=240)
        archive = root / name
        if not archive.is_file():
            raise RuntimeError("Staging ZIP is missing after GitHub download")
        match_id, report, video = extract_package(archive, root)
        _, existing = get_release_and_assets()
        existing_names = {x.get("name") for x in existing if x.get("state") == "uploaded"}
        resume = bool({match_id + ".json", match_id + ".mp4"} & existing_names)
        link = publish(report, video, apply=True, resume=resume,
                       replace_report=False, backup_dir=None, wait_sec=1500)
        if not link.startswith("https://") or "#id=" not in link:
            raise RuntimeError("Pages publish did not produce a verified short link")
    # Delete only after BOTH Pages assets have been independently verified.
    delete_package(asset)
    return link


def ingest_pending() -> int:
    release, assets = get_release_and_assets()
    if release.get("tag_name") != TAG:
        raise RuntimeError("Wrong dedicated Release")
    now = datetime.now(timezone.utc)
    failures = []
    uploaded = [a for a in assets if a.get("state") == "uploaded" and
                isinstance(a.get("name"), str) and a["name"].startswith(PACKAGE_PREFIX)]
    # Old failed staging packages cannot silently outlive the video retention policy.
    for asset in uploaded:
        try:
            age = now - created_at(asset)
            if age >= timedelta(hours=STALE_HOURS):
                delete_package(asset)
        except (ValueError, RuntimeError, KeyError) as exc:
            failures.append(f"Cleanup failed for asset id={asset.get('id')}: {type(exc).__name__}")
    # Limit public publish work per run; GitHub's schedule retries remaining packages.
    pending = [a for a in uploaded if PACKAGE_NAME.fullmatch(a["name"])
               and timedelta(0) <= now - created_at(a) < timedelta(hours=STALE_HOURS)]
    pending.sort(key=lambda a: (a["created_at"], a["id"]))
    print("Eligible single-upload packages:", len(pending))
    for asset in pending[:3]:
        try:
            print("Publishing public SF6 replay package:", asset["name"])
            publish_package(asset)
        except (ValueError, RuntimeError, OSError, zipfile.BadZipFile) as exc:
            failures.append(f"{asset['name']}: {type(exc).__name__}: {str(exc)[:180]}")
    if failures:
        for message in failures:
            print("NOT VERIFIED:", message, file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--zip", type=Path, help="Validate an upload archive locally; never publish")
    mode.add_argument("--auto", action="store_true", help="Import pending packages from dedicated public Release")
    parser.add_argument("--apply", action="store_true", help="Required with --auto; perform public release mutations")
    args = parser.parse_args(argv)
    if args.zip:
        if args.apply:
            parser.error("--apply only valid with --auto")
        with tempfile.TemporaryDirectory(prefix="sf6-zip-preflight-") as folder:
            mid, report, video = extract_package(args.zip, Path(folder))
            print("PASS: validated", mid, "JSON=", report.stat().st_size,
                  "MP4=", video.stat().st_size, "(NO PUBLISH)")
        return 0
    if not args.apply:
        parser.error("--auto requires explicit --apply")
    return ingest_pending()


if __name__ == "__main__":
    raise SystemExit(main())
