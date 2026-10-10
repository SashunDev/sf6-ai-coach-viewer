#!/usr/bin/env python3
"""Clean videos in the dedicated SF6 AI Coach GitHub Release.

Sizes use decimal MB (1 MB = 1,000,000 bytes). Never touch non-video
assets, coaching JSON, other releases, Git files or commit history.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import os
import sys
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

RELEASE_TAG = "sf6-ai-coach-media"
MAX_BYTES = 2_000_000_000
TARGET_BYTES = 1_800_000_000
MAX_DAYS = 14
VIDEO_SUFFIXES = (".mp4", ".mov", ".webm", ".m4v")
API = "https://api.github.com"


@dataclass(frozen=True)
class VideoAsset:
    id: int
    name: str
    size: int
    created_at: datetime


def is_video_asset(name: str) -> bool:
    return isinstance(name, str) and name.lower().endswith(VIDEO_SUFFIXES)


def parse_asset(value: dict[str, Any]) -> VideoAsset:
    stamp = datetime.fromisoformat(value["created_at"].replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("GitHub asset has no time zone")
    size = int(value["size"])
    ident = int(value["id"])
    if size < 0 or ident <= 0:
        raise ValueError("GitHub asset has invalid size or id")
    return VideoAsset(ident, value["name"], size, stamp.astimezone(timezone.utc))


def calculate_deletions(assets: list[VideoAsset], now: datetime) -> tuple[list[VideoAsset], str]:
    """Expire by age first; then trim to target if over limit; oldest first."""
    now = now.astimezone(timezone.utc)
    videos = sorted((a for a in assets if is_video_asset(a.name)),
                    key=lambda a: (a.created_at, a.id))
    expire_at = now - timedelta(days=MAX_DAYS)
    to_delete = [a for a in videos if a.created_at <= expire_at]
    expired_ids = {a.id for a in to_delete}
    keep = [a for a in videos if a.id not in expired_ids]
    total = sum(a.size for a in keep)
    size_deleted = 0
    if total > MAX_BYTES:
        for asset in keep:
            if total <= TARGET_BYTES:
                break
            to_delete.append(asset)
            total -= asset.size
            size_deleted += 1
    return to_delete, (
        f"all_video_assets={len(videos)} age_deleted={len(expired_ids)} "
        f"capacity_deleted={size_deleted} remaining_bytes={total} "
        f"limit_bytes={MAX_BYTES} target_bytes={TARGET_BYTES} max_age_days={MAX_DAYS}"
    )


def request_json(path: str, token: str, method: str = "GET", payload: dict | None = None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SF6-AI-Coach-Video-Retention",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(API + path, data=body, headers=headers, method=method)
    with urlopen(req, timeout=30) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def list_release_assets(repo: str, release_id: int, token: str) -> list[VideoAsset]:
    output: list[VideoAsset] = []
    for page in range(1, 31):
        items = request_json(
            f"/repos/{repo}/releases/{release_id}/assets?per_page=100&page={page}",
            token
        )
        if not isinstance(items, list):
            raise ValueError("Unexpected GitHub asset response")
        output.extend(parse_asset(item) for item in items)
        if len(items) < 100:
            return output
    raise RuntimeError("Too many assets: refusing incomplete enumeration")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Print planned deletions but do not delete")
    args = parser.parse_args()
    repo = os.getenv("GITHUB_REPOSITORY", "")
    token = os.getenv("GITHUB_TOKEN", "")
    if not repo or not token or repo.count("/") != 1:
        raise RuntimeError("Requires GITHUB_REPOSITORY=owner/repo and GITHUB_TOKEN")
    try:
        release = request_json(f"/repos/{repo}/releases/tags/{RELEASE_TAG}", token)
    except HTTPError as err:
        if err.code == 404:
            print(f"Dedicated release {RELEASE_TAG!r} not created yet; no action")
            return 0
        raise
    if not isinstance(release, dict) or release.get("tag_name") != RELEASE_TAG or not release.get("id"):
        raise RuntimeError("Refusing to manage unexpected release")
    assets = list_release_assets(repo, int(release["id"]), token)
    victims, summary = calculate_deletions(assets, datetime.now(timezone.utc))
    print(summary)
    for victim in victims:
        print(f"{'WOULD DELETE' if args.dry_run else 'DELETE'} "
              f"{victim.name} | {victim.size} bytes | {victim.created_at.isoformat()}")
        if not args.dry_run:
            request_json(f"/repos/{repo}/releases/assets/{victim.id}",
                         token, method="DELETE")
    print(f"mode={'DRY_RUN' if args.dry_run else 'APPLY'} "
          f"completed; removed={0 if args.dry_run else len(victims)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
