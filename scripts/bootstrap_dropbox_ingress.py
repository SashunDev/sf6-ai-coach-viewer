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
        # Accept ONLY a confirmed absent file, not network or permission errors.
        if not ("HTTP 404" in response.stderr or "404 Not Found" in response.stderr):
            raise RuntimeError("Cannot confirm public key is absent")
        private_key = PrivateKey.generate()
        private_b64 = base64.b64encode(private_key.encode()).decode("ascii")
        public_b64 = base64.b64encode(private_key.public_key.encode()).decode("ascii")
        # The private key is sent via stdin to gh; never printed, saved, or committed.
        gh("secret", "set", SECRET, "-R", REPO, stdin=private_b64 + "\n")
        public_content = base64.b64encode((public_b64 + "\n").encode("ascii")).decode("ascii")
        gh("api", "-X", "PUT", f"repos/{REPO}/contents/{PUBLIC_PATH}",
           "-f", "message=chore: initialize SF6 sealed Dropbox ingress public key",
           "-f", "branch=main", "-f", "content=" + public_content)
        print("PASS: private ingress key installed as GitHub Actions secret.")
        print("Public key committed to", PUBLIC_PATH, "for use by ChatGPT.")
        return 0
    except RuntimeError as exc:
        print("SETUP FAILED:", str(exc), file=sys.stderr)
        print("If only the secret was created, delete that secret from GitHub settings before retrying.",
              file=sys.stderr)
        return 1



if __name__ == "__main__":
    raise SystemExit(main())
