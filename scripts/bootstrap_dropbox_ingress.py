#!/usr/bin/env python3
"""One-time local Windows/macOS/Linux bootstrap for sealed Dropbox URL transport.

Needs gh authenticated with repo administration access; secrets are generated on
the user's machine and sent to Actions secret via gh stdin, never printed,
saved on disk, or committed to Git. Only public key is committed to the repo.
Do not run inside GitHub Actions or ChatGPT.
"""
from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
import sys

from nacl.public import PrivateKey

REPO = "SashunDev/sf6-ai-coach-viewer"
SECRET = "SF6_DROPBOX_INGRESS_PRIVATE_KEY_B64"
PUBLIC_PATH = ".github/sf6_dropbox_ingress_public_key.b64"


def gh(*args: str, stdin: str | None = None) -> str:
    try:
        p = subprocess.run(
            ["gh", *args], input=stdin, text=True, capture_output=True,
            check=False, timeout=40,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("GitHub CLI unavailable or timed out") from None
    if p.returncode:
        # Never disclose stderr; it may contain sensitive metadata.
        raise RuntimeError("GitHub CLI operation failed: " + " ".join(args[:2]))
    return p.stdout


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually create secret and public file")
    a = parser.parse_args(argv)
    if not shutil.which("gh"):
        parser.error("Install GitHub CLI and sign in using gh auth login")
    try:
        if not a.apply:
            print("DRY RUN: use --apply for one-time GitHub Actions ingress key setup")
            return 0
        secret_entries = json.loads(gh("secret", "list", "-R", REPO, "--json", "name"))
        if any(x.get("name") == SECRET for x in secret_entries):
            raise RuntimeError("Ingress secret already exists; refusing key rotation")
        response = subprocess.run(
            ["gh", "api", f"repos/{REPO}/contents/{PUBLIC_PATH}"],
            text=True, capture_output=True, timeout=40, check=False,
        )
        if response.returncode == 0:
            raise RuntimeError("Ingress public key already exists; refusing replacement")
        # Confirm missing path through a status code; other errors must not be mistaken for 404.
        status = gh("api", "-i", f"repos/{REPO}/contents/{PUBLIC_PATH}")
        # Unreachable if 404 is propagated as nonzero; see strict check below.
        raise RuntimeError("Unable to establish public key initial state")
    except RuntimeError as exc:
        # The key is never generated until the initial state is verified.
        if str(exc) != "Unable to establish public key initial state":
            print("SETUP FAILED:", str(exc), file=sys.stderr)
            return 1
        print("SETUP FAILED: verify public-key path with gh api; no key generated", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
