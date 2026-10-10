#!/usr/bin/env python3
"""Build the GitHub Pages video site without putting MP4s into Git history.

The dedicated public Release is authoritative. Pages mirrors only the newest
14-day MP4 assets within a separate 800,000,000 byte media budget.
Uploads, release cleanup and coaching JSON are NOT modified by this script.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from urllib.request import Request, urlopen

REPO = "SashunDev/sf6-ai-coach-viewer"
RELEASE_TAG = "sf6-ai-coach-media"
MEDIA_BUDGET = 800_000_000
MAX_AGE_DAYS = 14
NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}\.mp4$", re.I | re.ASCII)
SITE_FILES = (
    "index.html", "demo.html", "release-smoke.html", "video-diagnostics.html",
    "pages-video-smoke.html", "pages-integration-smoke.html",
)


@dataclass(frozen=True)
class Asset:
    id: int
    name: str
    size: int
    created_at: datetime


def parse_asset(raw: dict) -> Asset | None:
    """Non-MP4, unsafe filenames and unavailable assets never enter Pages."""
    if not isinstance(raw, dict) or raw.get("state") != "uploaded":
        return None
    name = raw.get("name")
    if not isinstance(name, str) or NAME_PATTERN.fullmatch(name) is None:
        return None
    if type(raw.get("id")) is not int or raw["id"] <= 0:
        raise ValueError("Invalid asset ID")
    if type(raw.get("size")) is not int or raw["size"] < 1:
        raise ValueError("Invalid asset size")
    stamp = raw.get("created_at")
    if not isinstance(stamp, str):
        raise ValueError("Invalid asset timestamp")
    when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    if when.tzinfo is None:
        raise ValueError("Missing timezone")
    return Asset(raw["id"], name, raw["size"], when.astimezone(timezone.utc))


def select_assets(assets: list[Asset], now: datetime) -> list[Asset]:
    """Newest first. Exact size/age boundaries; deterministic and bounded."""
    now = now.astimezone(timezone.utc)
    cutoff = now - timedelta(days=MAX_AGE_DAYS)
    chosen: list[Asset] = []
    used = 0
    seen_names: set[str] = set()
    for asset in sorted(assets, key=lambda a: (a.created_at, a.id), reverse=True):
        if not isinstance(asset.name, str) or not NAME_PATTERN.fullmatch(asset.name):
            continue
        if asset.created_at <= cutoff or asset.created_at > now + timedelta(hours=1):
            continue
        if asset.name.casefold() in seen_names:
            raise ValueError("Duplicate MP4 asset name")
        seen_names.add(asset.name.casefold())
        if asset.size < 1 or asset.size > MEDIA_BUDGET - used:
            continue
        chosen.append(asset)
        used += asset.size
    return chosen


def get_release_assets(token: str, repo: str = REPO) -> list[Asset]:
    if repo != REPO or not token:
        raise ValueError("Unexpected repository or missing token")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SF6-Coach-Pages-Media-Mirror",
    }
    url = f"https://api.github.com/repos/{repo}/releases/tags/{RELEASE_TAG}"
    with urlopen(Request(url, headers=headers), timeout=35) as response:
        release = json.load(response)
    if release.get("tag_name") != RELEASE_TAG or type(release.get("id")) is not int:
        raise ValueError("Not the dedicated Release")
    assets: list[Asset] = []
    for page in range(1, 31):
        url = f"https://api.github.com/repos/{repo}/releases/{release['id']}/assets?per_page=100&page={page}"
        with urlopen(Request(url, headers=headers), timeout=35) as response:
            results = json.load(response)
        if not isinstance(results, list):
            raise ValueError("Unexpected GitHub asset listing")
        for item in results:
            asset = parse_asset(item)
            if asset is not None:
                assets.append(asset)
        if len(results) < 100:
            return assets
    raise RuntimeError("Too many Release assets: refusing an incomplete listing")


def build(out_dir: Path, source_dir: Path, assets: list[Asset], token: str) -> None:
    if out_dir.exists():
        raise FileExistsError(f"Output directory already exists: {out_dir}")
    out_dir.mkdir(parents=True)
    (out_dir / ".nojekyll").touch()
    for filename in SITE_FILES:
        origin = source_dir / filename
        if not origin.is_file():
            raise FileNotFoundError(f"Required page missing: {filename}")
        shutil.copyfile(origin, out_dir / filename)
    media_dir = out_dir / "media"
    media_dir.mkdir()
    for asset in assets:
        subprocess.run(
            ["gh", "release", "download", RELEASE_TAG, "--repo", REPO,
             "--pattern", asset.name, "--dir", str(media_dir)],
            check=True, timeout=240,
            env={**os.environ, "GH_TOKEN": token}
        )
        video = media_dir / asset.name
        if not video.is_file() or video.stat().st_size != asset.size:
            raise RuntimeError(f"Unexpected downloaded MP4 size: {asset.name}")
        with video.open("rb") as stream:
            if stream.read(16)[4:8] != b"ftyp":
                raise RuntimeError(f"Invalid MP4 signature: {asset.name}")
    total = sum(a.size for a in assets)
    if total > MEDIA_BUDGET:
        raise RuntimeError("Pages media budget exceeded")
    published = sorted(p.name for p in media_dir.iterdir())
    expected = sorted(a.name for a in assets)
    if published != expected:
        raise RuntimeError("Unexpected files in Pages media directory")
    print(f"PASS Pages site built: {len(SITE_FILES)} HTML pages, "
          f"{len(assets)} MP4(s), {total} video bytes / {MEDIA_BUDGET} budget")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("_site"))
    parser.add_argument("--source", type=Path, default=Path("."))
    parser.add_argument("--plan-only", action="store_true")
    args = parser.parse_args()
    token = os.environ.get("GITHUB_TOKEN", "")
    assets = get_release_assets(token)
    chosen = select_assets(assets, datetime.now(timezone.utc))
    print(f"eligible_mp4s={len(assets)} selected={len(chosen)} "
          f"total_bytes={sum(a.size for a in chosen)}")
    for a in chosen:
        print(f"selected: {a.name} bytes={a.size} created={a.created_at.isoformat()}")
    if not args.plan_only:
        build(args.out, args.source, chosen, token)


if __name__ == "__main__":
    main()
