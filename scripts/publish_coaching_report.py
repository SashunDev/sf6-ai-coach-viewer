#!/usr/bin/env python3
"""Safely convert a URL-encoded coaching report token into a Release JSON asset.

This script does NOT upload, delete or overwrite data. Only workflow publish
can do that, with an explicit overwrite flag for corrections.
"""
from __future__ import annotations
import argparse
import base64
import json
from pathlib import Path
import re
import zlib

from create_coaching_link import MATCH_ID, MAX_JSON_BYTES, validate_report


def decode_report_token(token: str) -> dict:
    if not isinstance(token, str) or not re.fullmatch(r"(?:z|j)\.[A-Za-z0-9_-]{8,12000}", token):
        raise ValueError("Expected a raw z.<base64url> or j.<base64url> token")
    kind, encoded = token.split(".", 1)
    compressed = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    if kind == "z":
        stream = zlib.decompressobj()
        raw = stream.decompress(compressed, MAX_JSON_BYTES + 1)
        if len(raw) > MAX_JSON_BYTES or not stream.eof or stream.unconsumed_tail or stream.unused_data:
            raise ValueError("Invalid compressed report or decompression limit exceeded")
    else:
        raw = compressed
        if len(raw) > MAX_JSON_BYTES:
            raise ValueError("Raw report is too large")
    data = json.loads(raw.decode("utf-8"))
    validate_report(data)
    return data


def create_report_asset(match_id: str, token: str, output: Path) -> Path:
    if not isinstance(match_id, str) or not MATCH_ID.fullmatch(match_id):
        raise ValueError("Unsafe match ID")
    data = decode_report_token(token)
    declared = data["match"].get("id")
    if declared is not None and declared != match_id:
        raise ValueError("Cannot change a report's declared match ID")
    data["match"]["id"] = match_id
    payload = (json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    if len(payload) > MAX_JSON_BYTES:
        raise ValueError("Serialized report is larger than 1MB")
    if output.exists() or not output.parent.is_dir():
        raise FileExistsError("Output file exists or directory is missing")
    output.write_bytes(payload)
    return output


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--match-id", required=True)
    p.add_argument("--token", required=True)
    p.add_argument("--output-dir", required=True, type=Path)
    args = p.parse_args()
    if not isinstance(args.match_id, str) or MATCH_ID.fullmatch(args.match_id) is None:
        p.error("Invalid match ID")
    output = args.output_dir / (args.match_id + ".json")
    create_report_asset(args.match_id, args.token, output)
    print(f"PASS: public Release JSON prepared {output.name}, bytes={output.stat().st_size}")


if __name__ == "__main__":
    main()
