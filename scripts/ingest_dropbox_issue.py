#!/usr/bin/env python3
"""GitHub Actions: publish approved SF6 replay using sealed Dropbox URL transport.

Owner-created issue carries only public metadata and PyNaCl sealed-box ciphertext;
private decryption key must be present in GitHub Actions secret. The old base64
plaintext URL schema is NOT supported and there is no insecure fallback.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import json
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

from create_coaching_link import MATCH_ID
from dropbox_ingress_crypto import decrypt_url
from ingest_match_package import MAX_ARCHIVE_BYTES, extract_package
from publish_match import PAGES, REPO, get_release_and_assets, publish

BODY_FIELDS = {"schemaVersion", "matchId", "sealedUrl", "size", "sha256", "dropboxHash"}
LOWER_SHA256 = re.compile(r"^[a-f0-9]{64}$", re.ASCII)
DROPBOX_BLOCK_SIZE = 4 * 1024 * 1024
USER_AGENT = "SF6-AI-Coach-Public-Replay-Ingress/1"
OWNER = "SashunDev"


def allowed_url(raw: str) -> bool:
    if not isinstance(raw, str) or not 40 <= len(raw) <= 4096:
        return False
    try:
        u = urlsplit(raw)
        host = u.hostname
        return (
            u.scheme == "https"
            and host is not None
            and (host == "dl.dropboxusercontent.com"
                 or host.endswith(".dl.dropboxusercontent.com"))
            and u.port in (None, 443)
            and u.username is None and u.password is None
            and not u.fragment
            and u.path.startswith("/")
            and u.query != ""
        )
    except ValueError:
        return False


class DropboxOnlyRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_url(newurl):
            raise ValueError("Download redirected outside allowed Dropbox host")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def parse_issue(event: dict, private_key_b64: str) -> tuple[str, str, int, str, str]:
    issue = event.get("issue")
    repo = event.get("repository")
    if not isinstance(issue, dict) or not isinstance(repo, dict):
        raise ValueError("Missing GitHub issue/repository")
    if (repo.get("full_name") != REPO or issue.get("user", {}).get("login") != OWNER
            or event.get("action") != "opened"):
        raise ValueError("Only new issues from the repository owner may publish")
    raw = issue.get("body")
    if not isinstance(raw, str) or len(raw) > 7000:
        raise ValueError("Invalid issue body")
    payload = json.loads(raw)
    if not isinstance(payload, dict) or set(payload) != BODY_FIELDS or type(payload["schemaVersion"]) is not int or payload["schemaVersion"] != 2:
        raise ValueError("Invalid publish schema")
    match_id = payload["matchId"]
    if not isinstance(match_id, str) or not MATCH_ID.fullmatch(match_id):
        raise ValueError("Invalid match ID")
    if issue.get("title") != "SF6-PUBLISH " + match_id:
        raise ValueError("Issue title does not match replay identity")
    n = payload["size"]
    if type(n) is not int or not 1 <= n <= MAX_ARCHIVE_BYTES:
        raise ValueError("Invalid ZIP size")
    sha, dropbox_sha = payload["sha256"], payload["dropboxHash"]
    if any(not isinstance(x, str) or not LOWER_SHA256.fullmatch(x) for x in (sha, dropbox_sha)):
        raise ValueError("Invalid digests")
    # A private key is compulsory; no base64 URL fallback is allowed.
    url = decrypt_url(payload["sealedUrl"], private_key_b64)
    if not allowed_url(url):
        raise ValueError("Decrypted URL is not an allowed HTTPS Dropbox one-time URL")
    return match_id, url, n, sha, dropbox_sha


def download_and_validate(url: str, expected_size: int, sha: str,
                          dropbox_sha: str, dest: Path) -> None:
    if not allowed_url(url):
        raise ValueError("Unsafe URL")
    opener = build_opener(DropboxOnlyRedirect())
    request = Request(url, headers={"User-Agent": USER_AGENT})
    full, blocks = hashlib.sha256(), hashlib.sha256()
    total, block = 0, bytearray()
    # Never issue HEAD: Dropbox temporary links are single-use.
    with opener.open(request, timeout=120) as source, dest.open("xb") as target:
        if source.status != 200:
            raise ValueError("Dropbox GET returned an unexpected status")
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > expected_size:
                raise ValueError("Dropbox file larger than expected")
            target.write(chunk)
            full.update(chunk)
            block.extend(chunk)
            while len(block) >= DROPBOX_BLOCK_SIZE:
                blocks.update(hashlib.sha256(block[:DROPBOX_BLOCK_SIZE]).digest())
                del block[:DROPBOX_BLOCK_SIZE]
        if block:
            blocks.update(hashlib.sha256(block).digest())
    if (total != expected_size or full.hexdigest() != sha
            or blocks.hexdigest() != dropbox_sha):
        raise ValueError("Public source integrity mismatch")


def run(event: dict, *, apply: bool, private_key_b64: str) -> str:
    match_id, url, size, sha, dropbox_hash = parse_issue(event, private_key_b64)
    with tempfile.TemporaryDirectory(prefix="sf6-dropbox-ingress-") as d:
        root = Path(d)
        archive = root / ("sf6-coach-package-" + match_id + ".zip")
        try:
            download_and_validate(url, size, sha, dropbox_hash, archive)
        except (HTTPError, URLError, TimeoutError) as exc:
            # URLs may appear in network exception text. Never print exception.
            raise RuntimeError("Dropbox single-use download failed") from None
        # Extract into separate folder; ZIP itself is not committed.
        extracted = root / "extracted"
        extracted.mkdir()
        mid, report, video = extract_package(archive, extracted)
        if mid != match_id:
            raise ValueError("ZIP identity disagrees with GitHub issue")
        if not apply:
            return "DRY_RUN PASS"
        _, assets = get_release_and_assets()
        present = {a.get("name") for a in assets if a.get("state") == "uploaded"}
        resume = bool({mid + ".json", mid + ".mp4"} & present)
        link = publish(report, video, apply=True, resume=resume,
                       replace_report=False, backup_dir=None, wait_sec=1500)
        if link != PAGES + "#id=" + mid:
            raise RuntimeError("Published URL does not match issue match ID")
        return link


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--event", required=True, type=Path)
    p.add_argument("--apply", action="store_true")
    args = p.parse_args(argv)
    try:
        event = json.loads(args.event.read_text(encoding="utf-8"))
        output = run(event, apply=args.apply,
                     private_key_b64=os.environ.get("SF6_DROPBOX_INGRESS_PRIVATE_KEY_B64", ""))
        # No URLs other than the final publicly approved Pages short link.
        print("VERIFIED SF6 PUBLIC REPLAY:", output)
        return 0
    except (ValueError, RuntimeError, OSError, KeyError, TypeError, json.JSONDecodeError):
        print("SF6 Dropbox ingress failed. Check source expiry, bytes, schema, and Pages status. No URL logged.",
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
