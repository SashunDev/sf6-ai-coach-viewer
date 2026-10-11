"""Guard one-time sealed Dropbox ingress bootstrapping. All gh calls are mocked."""
import base64
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"scripts"))
import bootstrap_dropbox_ingress as setup


class BootstrapTests(unittest.TestCase):
    def test_apply_writes_private_only_to_gh_secret_stdin(self):
        calls=[]
        def gh(*args,stdin=None):
            calls.append((args,stdin))
            if args[:2]==("secret","list"):
                return json.dumps([])
            return ""
        with patch.object(setup.shutil,"which",return_value="/usr/bin/gh"),\
             patch.object(setup,"gh",side_effect=gh),\
             patch.object(setup.subprocess,"run",return_value=SimpleNamespace(
                 returncode=1,stderr="gh: Not Found (HTTP 404)")):
            self.assertEqual(setup.main(["--apply"]),0)
        self.assertEqual(len(calls),3)
        secret_args,private_stdin=calls[1]
        upload_args,upload_stdin=calls[2]
        self.assertEqual(secret_args[:3],("secret","set",setup.SECRET))
        self.assertEqual(upload_args[:3],("api","-X","PUT"))
        self.assertIsNone(upload_stdin)
        public_arg=next(p for p in upload_args if p.startswith("content="))
        public_text=base64.b64decode(public_arg.split("=",1)[1]).decode().strip()
        raw_private=base64.b64decode(private_stdin.strip())
        self.assertEqual(len(raw_private),32)
        self.assertEqual(len(base64.b64decode(public_text)),32)
        self.assertNotEqual(private_stdin.strip(),public_text)
        self.assertFalse(any(private_stdin.strip() in p for p in upload_args))

    def test_existing_secret_refuses_rotation(self):
        with patch.object(setup.shutil,"which",return_value="gh"),\
             patch.object(setup,"gh",return_value=json.dumps([{"name":setup.SECRET}])),\
             patch.object(setup.subprocess,"run",
                          side_effect=AssertionError("Must not inspect after secret check")):
            self.assertEqual(setup.main(["--apply"]),1)

    def test_existing_public_file_refuses_replacement(self):
        with patch.object(setup.shutil,"which",return_value="gh"),\
             patch.object(setup,"gh",return_value="[]"),\
             patch.object(setup.subprocess,"run",return_value=SimpleNamespace(
                 returncode=0,stderr="",stdout="existing public key")):
            self.assertEqual(setup.main(["--apply"]),1)

    def test_permission_or_network_error_fails_closed(self):
        with patch.object(setup.shutil,"which",return_value="gh"),\
             patch.object(setup,"gh",return_value="[]"),\
             patch.object(setup.subprocess,"run",return_value=SimpleNamespace(
                 returncode=1,stderr="gh: 403 Forbidden",stdout="")):
            self.assertEqual(setup.main(["--apply"]),1)

    def test_dry_run_no_mutation(self):
        with patch.object(setup.shutil,"which",return_value="gh"),\
             patch.object(setup,"gh",side_effect=AssertionError("No changes")):
            self.assertEqual(setup.main([]),0)


if __name__=="__main__":
    unittest.main()
