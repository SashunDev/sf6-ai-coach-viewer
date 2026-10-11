#!/usr/bin/env python3
"""Publish one approved SF6 replay + v1 coaching JSON to Release and Pages.

Requires the user's existing authenticated gh CLI; no new credential, database,
Git commit, or paid service.  DRY RUN by default. --apply explicitly publishes
public assets. Never claim a playable report URL before Pages is verified.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from build_pages_site import (
    Asset, MAX_AGE_DAYS, MEDIA_BUDGET, REPORT_MAX_BYTES,
    REPORT_MAX_COUNT, REPORT_TOTAL_BUDGET, parse_asset, parse_report_asset,
    select_assets, select_reports,
)
from build_standalone_report import validate_report

REPO = "SashunDev/sf6-ai-coach-viewer"
TAG = "sf6-ai-coach-media"
WORKFLOW = "pages-video-site.yml"
PAGES = "https://sashundev.github.io/sf6-ai-coach-viewer/"
RELEASE_VIDEO_CAP = 2_000_000_000
USER_AGENT = "SF6-Coach-Match-Publisher/1"
OLD_NOTES = "JSON is not stored here."
NEW_NOTES = "JSON coaching reports are retained without automatic expiry; MP4 videos expire after 14 days."


def run_gh(*args: str, timeout: int = 90) -> str:
    """Never shell out via shell=True or log CLI authentication details."""
    try:
        result = subprocess.run(
            ["gh", *args], text=True, capture_output=True,
            timeout=timeout, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("GitHub CLI is unavailable or timed out") from exc
    if result.returncode:
        # Stderr can contain URLs/user information; do not echo it.
        raise RuntimeError("GitHub command failed: " + " ".join(args[:2]))
    return result.stdout


def gh_json(*args: str) -> object:
    try:
        return json.loads(run_gh(*args))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Unexpected GitHub JSON response") from exc


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_report(path: Path, match_id: str) -> tuple[dict, int]:
    size = path.stat().st_size
    if size < 1 or size > REPORT_MAX_BYTES:
        raise ValueError("Report must be 1..1,048,576 bytes")
    data = validate_report(json.loads(path.read_text(encoding="utf-8")))
    if data["match"]["id"] != match_id or path.name != match_id + ".json":
        raise ValueError("match.id and JSON filename must match the shared ID")
    if len(json.dumps(data, allow_nan=False).encode("utf-8")) > REPORT_MAX_BYTES:
        raise ValueError("Report exceeds 1 MB when re-serialized")
    return data, size


def inspect_video(path: Path, match_id: str, duration: float) -> int:
    if path.name != match_id + ".mp4":
        raise ValueError("MP4 filename must match match.id")
    size = path.stat().st_size
    if not 12 <= size <= MEDIA_BUDGET:
        raise ValueError("Video exceeds Pages' 800 MB limit or is empty")
    with path.open("rb") as stream:
        if stream.read(12)[4:8] != b"ftyp":
            raise ValueError("Not an MP4 (ftyp missing)")
    if not shutil.which("ffprobe"):
        raise RuntimeError("ffprobe required for verified H.264 duration and codec preflight")
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_name,codec_type",
         "-of", "json", str(path)],
        capture_output=True, text=True, timeout=45, check=False,
    )
    if result.returncode:
        raise ValueError("Cannot inspect video codec/duration")
    meta = json.loads(result.stdout)
    video_streams = [s for s in meta.get("streams", []) if s.get("codec_type") == "video"]
    audio_streams = [s for s in meta.get("streams", []) if s.get("codec_type") == "audio"]
    if len(video_streams) != 1 or video_streams[0].get("codec_name") != "h264":
        raise ValueError("One H.264 video stream required for iPhone Pages")
    if any(s.get("codec_name") != "aac" for s in audio_streams):
        raise ValueError("If audio is present it must be AAC")
    actual = float(meta.get("format", {}).get("duration") or 0)
    if abs(actual - duration) > max(2.0, duration * .02):
        raise ValueError("Report duration does not match video duration")
    return size


def get_release_and_assets() -> tuple[dict, list[dict]]:
    release = gh_json("api", f"repos/{REPO}/releases/tags/{TAG}")
    if not isinstance(release, dict) or release.get("tag_name") != TAG or type(release.get("id")) is not int:
        raise RuntimeError("Unexpected public Release; refusing to publish")
    assets = []
    for page in range(1, 31):
        batch = gh_json("api", f"repos/{REPO}/releases/{release['id']}/assets?per_page=100&page={page}")
        if not isinstance(batch, list):
            raise RuntimeError("Invalid Release assets listing")
        assets.extend(batch)
        if len(batch) < 100:
            return release, assets
    raise RuntimeError("Release assets exceed pagination safety limit")


def plan_existing_assets(assets: list[dict], match_id: str, video_size: int,
                         report_size: int, *, replacing_report: bool) -> set[str]:
    names = [a.get("name") for a in assets if a.get("state") == "uploaded"]
    if len(names) != len(set(n.casefold() for n in names if isinstance(n, str))):
        raise ValueError("Duplicate Release asset names; refusing ambiguous publication")
    videos = [a for item in assets if (a := parse_asset(item)) is not None]
    reports = [a for item in assets if (a := parse_report_asset(item)) is not None]
    found = set(names).intersection({match_id + ".json", match_id + ".mp4"})
    report_name, video_name = match_id + ".json", match_id + ".mp4"
    if not replacing_report and report_name not in found:
        reports.append(Asset(-1, report_name, report_size, datetime.now(timezone.utc)))
    # Validate JSON's permanent capacity before writing either asset.
    select_reports(reports)
    current = datetime.now(timezone.utc)
    if video_name not in found:
        videos.append(Asset(-1, video_name, video_size, current))
    selected = select_assets(videos, current)
    if video_name not in {a.name for a in selected}:
        raise ValueError("New video would not fit the live Pages mirror (800 MB limit)")
    if video_size > RELEASE_VIDEO_CAP:
        raise ValueError("Video exceeds Release retention budget")
    return found


def download_and_check(name: str, local: Path, directory: Path) -> Path:
    # This branch only runs after an explicit --resume/--replace-report flag.
    run_gh("release", "download", TAG, "--repo", REPO,
           "--pattern", name, "--dir", str(directory), timeout=300)
    file = directory / name
    if not file.is_file() or sha256(file) != sha256(local):
        raise ValueError("Existing public Release asset differs from supplied local file: " + name)
    return file


def get_run_ids() -> set[int]:
    runs = gh_json("run", "list", "--repo", REPO, "--workflow", WORKFLOW,
                   "--event", "workflow_dispatch", "--limit", "30",
                   "--json", "databaseId")
    if not isinstance(runs, list):
        raise RuntimeError("Could not enumerate existing Pages workflow runs")
    return {r["databaseId"] for r in runs if type(r.get("databaseId")) is int}


def start_pages_and_wait(before: set[int], *, wait_sec: int = 1500) -> int:
    # No release changes after a deploy is triggered; send an explicit deploy=true.
    run_gh("workflow", "run", WORKFLOW, "--repo", REPO,
           "--ref", "main", "-f", "deploy=true")
    deadline = time.monotonic() + min(wait_sec, 1800)
    run_id = None
    while time.monotonic() < deadline:
        runs = gh_json("run", "list", "--repo", REPO, "--workflow", WORKFLOW,
                       "--event", "workflow_dispatch", "--limit", "30",
                       "--json", "databaseId,headSha,status")
        fresh = [r for r in runs if r.get("databaseId") not in before]
        if len(fresh) > 1:
            raise RuntimeError("Concurrent Pages runs are ambiguous; check GitHub Actions manually")
        if len(fresh) == 1:
            run_id = fresh[0]["databaseId"]
            break
        time.sleep(3)
    if run_id is None:
        raise RuntimeError("Pages dispatch accepted but no unique workflow run appeared")
    # GitHub CLI returns failure for a failed/cancelled build or deploy.
    run_gh("run", "watch", str(run_id), "--repo", REPO, "--exit-status", timeout=wait_sec)
    detail = gh_json("run", "view", str(run_id), "--repo", REPO,
                     "--json", "status,conclusion,jobs")
    if detail.get("status") != "completed" or detail.get("conclusion") != "success":
        raise RuntimeError("Pages run did not complete successfully")
    jobs = {j.get("name"): j.get("conclusion") for j in detail.get("jobs", [])}
    if jobs.get("build") != "success" or jobs.get("deploy") != "success":
        raise RuntimeError("Both Pages build and deploy jobs must succeed")
    return run_id


def verify_public(url: str, path: Path, mime: str, max_bytes: int) -> None:
    expected_hash, size = sha256(path), path.stat().st_size
    req = Request(url, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
    with urlopen(req, timeout=90) as response:
        if response.status != 200 or not response.headers.get("Content-Type", "").lower().startswith(mime):
            raise RuntimeError("Wrong HTTP status or MIME at " + url)
        length = response.headers.get("Content-Length")
        if length and int(length) != size:
            raise RuntimeError("Pages content size does not match: " + url)
        digest = hashlib.sha256()
        count = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            count += len(chunk)
            if count > max_bytes:
                raise RuntimeError("Pages payload exceeded permitted limit")
            digest.update(chunk)
        if count != size or digest.hexdigest() != expected_hash:
            raise RuntimeError("Pages content digest mismatch: " + url)


def wait_pages(report: Path, video: Path, match_id: str, *, wait_sec: int = 150) -> None:
    targets = [
        (PAGES + "reports/" + match_id + ".json", report, "application/json", REPORT_MAX_BYTES),
        (PAGES + "media/" + match_id + ".mp4", video, "video/mp4", MEDIA_BUDGET),
    ]
    deadline = time.monotonic() + wait_sec
    while True:
        try:
            for url, path, mime, limit in targets:
                verify_public(url, path, mime, limit)
            return
        except (RuntimeError, URLError, HTTPError, TimeoutError, OSError) as exc:
            if time.monotonic() >= deadline:
                raise RuntimeError("Pages asset delivery unverified; Release may be published, "
                                   "but online video/report E2E is NOT PASS") from exc
            time.sleep(5)


def correct_release_notes(release: dict) -> bool:
    text = release.get("body")
    if not isinstance(text, str) or OLD_NOTES not in text:
        return False
    revised = text.replace(OLD_NOTES, NEW_NOTES)
    run_gh("api", "-X", "PATCH", f"repos/{REPO}/releases/{release['id']}",
           "-f", "body=" + revised)
    return True


def publish(report: Path, video: Path, *, apply: bool, resume: bool,
            replace_report: bool, backup_dir: Path | None, wait_sec: int) -> str:
    if not shutil.which("gh"):
        raise RuntimeError("Authenticated GitHub CLI (gh) is required")
    match_id = video.stem
    data, report_size = inspect_report(report, match_id)
    video_size = inspect_video(video, match_id, data["match"]["durationSec"])
    release, assets = get_release_and_assets()
    found = plan_existing_assets(assets, match_id, video_size, report_size,
                                 replacing_report=replace_report)
    j, v = match_id + ".json", match_id + ".mp4"
    if replace_report:
        if found != {j, v} or resume or backup_dir is None:
            raise ValueError("--replace-report requires both existing assets and a --backup-dir")
        if backup_dir.exists() and not backup_dir.is_dir():
            raise ValueError("Backup destination must be a directory")
    elif found and not resume:
        raise ValueError("ID collision or interrupted pair; --resume verifies unchanged existing assets")
    elif resume and not found:
        raise ValueError("--resume requires a pre-existing partial pair")
    if not apply:
        print("DRY RUN PASS: public replay+JSON preflight, id=" + match_id +
              ", report_bytes=" + str(report_size) + ", video_bytes=" + str(video_size))
        print("Existing asset names: " + (", ".join(sorted(found)) if found else "none"))
        print("PUBLIC: everyone can access gameplay, opponent and coaching observations.")
        return "DRY_RUN"

    # Assets are already approved for publication ONLY when explicitly invoking --apply.
    # Verify any pre-existing counterpart before mutating the Release.
    with tempfile.TemporaryDirectory(prefix="sf6-coach-publish-") as d:
        tmp = Path(d)
        if v in found:
            download_and_check(v, video, tmp)
        if j in found and not replace_report:
            download_and_check(j, report, tmp)
        if replace_report:
            backup_dir.mkdir(parents=True, exist_ok=True)
            run_gh("release", "download", TAG, "--repo", REPO, "--pattern", j,
                   "--dir", str(tmp), timeout=120)
            existing = tmp / j
            if not existing.is_file():
                raise RuntimeError("Cannot back up existing report; refusing overwrite")
            backup = backup_dir / (j + "." +
                   datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".bak")
            if backup.exists():
                raise FileExistsError("Local backup collision; refusing overwrite")
            shutil.copyfile(existing, backup)
            if sha256(existing) == sha256(report):
                print("Already identical report; no overwrite necessary")
                return "UNCHANGED"
        before = get_run_ids()
        # Video first, then JSON. On failure leave the partial Release unchanged,
        # with a --resume path that verifies all existing bytes.
        if v not in found:
            run_gh("release", "upload", TAG, str(video), "--repo", REPO, timeout=600)
        if j not in found or replace_report:
            args = ["release", "upload", TAG, str(report), "--repo", REPO]
            if replace_report:
                args.append("--clobber")
            run_gh(*args, timeout=180)
    run_id = start_pages_and_wait(before, wait_sec=wait_sec)
    wait_pages(report, video, match_id, wait_sec=min(180, wait_sec))
    try:
        if correct_release_notes(release):
            print("Release description corrected: JSON persists, video expires after 14 days")
    except RuntimeError:
        print("WARNING: Old Release description still needs separate correction", file=sys.stderr)
    link = PAGES + "#id=" + match_id
    print("VERIFIED PUBLIC VIDEO + JSON: " + link)
    print("Pages build/deploy run:", run_id)
    print("MP4 is public for up to 14 days; public JSON persists separately.")
    return link


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--report", required=True, type=Path)
    p.add_argument("--video", required=True, type=Path)
    p.add_argument("--apply", action="store_true", help="Publish PUBLIC gameplay/report assets (default: dry-run)")
    p.add_argument("--resume", action="store_true", help="Verify and finish an interrupted matching pair")
    p.add_argument("--replace-report", action="store_true", help="Explicitly correct JSON only; never replace MP4")
    p.add_argument("--backup-dir", type=Path, help="Required local backup directory when correcting JSON")
    p.add_argument("--wait-sec", type=int, default=1500, help="Max wait for Pages CI (30..1800 seconds)")
    a = p.parse_args(argv)
    if not 30 <= a.wait_sec <= 1800:
        p.error("--wait-sec must be between 30 and 1800")
    try:
        publish(a.report, a.video, apply=a.apply, resume=a.resume,
                replace_report=a.replace_report, backup_dir=a.backup_dir,
                wait_sec=a.wait_sec)
        return 0
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired,
            json.JSONDecodeError) as exc:
        print("NOT VERIFIED:", str(exc), file=sys.stderr)
        print("No live Pages E2E PASS is claimed. Check Release assets and Actions; "
              "re-run --resume only after confirming matching inputs.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
