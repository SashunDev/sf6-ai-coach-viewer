#!/usr/bin/env python3
"""Public-key sealed-box transport for Dropbox one-time SF6 replay download URLs.

Public issue carries ONLY ciphertext; private key is a GitHub Actions secret.
Do not log the decrypted URL or the raw Actions secret.
"""
from __future__ import annotations

import base64
import binascii
import re

from nacl.exceptions import CryptoError
from nacl.public import PrivateKey, PublicKey, SealedBox

B64_URL = re.compile(r"^[A-Za-z0-9_-]{65,5500}$", re.ASCII)
PUBLIC_KEY_BYTES = 32
SEALED_OVERHEAD = 48


def raw_key(value: str, *, private: bool) -> bytes:
    if not isinstance(value, str) or len(value) != 44:
        raise ValueError("Invalid ingress key encoding")
    try:
        key = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid ingress key encoding") from None
    if len(key) != PUBLIC_KEY_BYTES or base64.b64encode(key).decode() != value:
        raise ValueError("Invalid ingress key length or padding")
    return key


def encrypt_url(url: str, public_key_b64: str) -> str:
    """Return URL-safe ciphertext; sealed-box plaintext is never emitted."""
    if not isinstance(url, str) or not 40 <= len(url) <= 4096:
        raise ValueError("Invalid ephemeral URL")
    key = PublicKey(raw_key(public_key_b64, private=False))
    encrypted = SealedBox(key).encrypt(url.encode("utf-8"))
    return base64.urlsafe_b64encode(encrypted).decode("ascii").rstrip("=")


def decrypt_url(ciphertext_b64url: str, private_key_b64: str) -> str:
    """Fail closed on missing/wrong secret, bad encoding, or tampering."""
    if not isinstance(ciphertext_b64url, str) or not B64_URL.fullmatch(ciphertext_b64url):
        raise ValueError("Encrypted URL is missing or malformed")
    raw = raw_key(private_key_b64, private=True)
    try:
        ciphertext = base64.b64decode(
            ciphertext_b64url + "=" * (-len(ciphertext_b64url) % 4),
            altchars=b"-_", validate=True,
        )
        if len(ciphertext) < SEALED_OVERHEAD + 40:
            raise ValueError("Encrypted URL is too short")
        if base64.urlsafe_b64encode(ciphertext).decode("ascii").rstrip("=") != ciphertext_b64url:
            raise ValueError("Encrypted URL is not canonical base64url")
        plaintext = SealedBox(PrivateKey(raw)).decrypt(ciphertext)
        return plaintext.decode("utf-8")
    except (CryptoError, binascii.Error, UnicodeDecodeError, ValueError):
        raise ValueError("Unable to decrypt the one-time URL") from None
