"""Exercise source identity preflight without Docker, production data or root."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'nuc' / 'backup-factual.sh'


class BackupSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.image = 'sha256:' + 'a' * 64
        self.revision = 'b' * 40
        self.lock = b'{"sources":[]}\n'
        self.lock_sha = hashlib.sha256(self.lock).hexdigest()
        archive = self.root / 'source.tar'
        with tarfile.open(archive, 'w') as tar:
            info = tarfile.TarInfo('./data/source-lock.json')
            info.size = len(self.lock)
            tar.addfile(info, io.BytesIO(self.lock))
        self.digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.release = self.root / 'releases' / self.digest
        (self.release / 'source/data').mkdir(parents=True)
        archive.rename(self.release / 'source.tar')
        (self.release / 'source/data/source-lock.json').write_bytes(self.lock)
        self.receipt = self.root / 'receipt.json'
        self.data = {'schema_version': 1, 'source_kind': 'immutable-image-filesystem',
                     'image_id': self.image, 'git_revision': self.revision,
                     'source_tree_sha256': self.digest, 'source_lock_sha256': self.lock_sha}
        self.write_receipt()
        mock = self.bin / 'docker'
        mock.write_text('''#!/usr/bin/env python3
import os,sys
assert sys.argv[1:3] == ['inspect','--format'], sys.argv
fmt=sys.argv[3]
if fmt == '{{.Image}}': print(os.environ['MOCK_IMAGE'])
elif 'image.revision' in fmt: print(os.environ['MOCK_REVISION'])
elif 'source-tree-sha256' in fmt: print(os.environ['MOCK_LABEL'])
else: raise AssertionError(fmt)
''')
        mock.chmod(0o755)
        mock = self.bin / 'stat'
        mock.write_text('#!/bin/sh\ncase "$2" in %u) echo "${MOCK_UID:-0}";; %a) echo "${MOCK_MODE:-600}";; *) exit 2;; esac\n')
        mock.chmod(0o755)
        self.wrapper = self.root / 'resolve.sh'
        helpers = SCRIPT.read_text().rsplit('\nmain "$@"', 1)[0]
        self.wrapper.write_text(helpers + '\ntrap - EXIT\nresolve_source\nprintf "%s\\n" "$source_tree_sha"\n')
        self.env = {**os.environ, 'PATH': str(self.bin) + os.pathsep + os.environ['PATH'],
                    'RELEASE_ROOT': str(self.root / 'releases'), 'SOURCE_RECEIPT_FILE': str(self.receipt),
                    'MOCK_IMAGE': self.image, 'MOCK_REVISION': self.revision, 'MOCK_LABEL': 'unknown'}

    def write_receipt(self):
        self.receipt.write_text(json.dumps(self.data))
        self.receipt.chmod(0o600)

    def run_preflight(self, success, message=''):
        result = subprocess.run(['bash', str(self.wrapper)], env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode == 0, success, result.stderr)
        if success:
            self.assertEqual(result.stdout.strip(), self.digest)
        elif message:
            self.assertIn(message, result.stderr)

    def test_image_bound_receipt_recovers_missing_label(self):
        self.run_preflight(True)

    def test_valid_image_label_does_not_require_receipt(self):
        self.env['MOCK_LABEL'] = self.digest
        self.receipt.unlink()
        self.run_preflight(True)

    def test_unknown_label_without_receipt_is_rejected(self):
        self.receipt.unlink()
        self.run_preflight(False, 'image-bound source receipt is required')

    def test_another_image_cannot_reuse_receipt(self):
        self.env['MOCK_IMAGE'] = 'sha256:' + 'c' * 64
        self.run_preflight(False, 'does not match the deployed image')

    def test_another_revision_cannot_reuse_receipt(self):
        self.env['MOCK_REVISION'] = 'd' * 40
        self.run_preflight(False, 'does not match the deployed image')

    def test_untrusted_receipt_owner_is_rejected(self):
        self.env['MOCK_UID'] = '1000'
        self.run_preflight(False, 'root-owned mode 0600')

    def test_shared_receipt_permissions_are_rejected(self):
        self.env['MOCK_MODE'] = '644'
        self.run_preflight(False, 'root-owned mode 0600')

    def test_corrupt_archive_is_rejected(self):
        with (self.release / 'source.tar').open('ab') as stream:
            stream.write(b'corrupt')
        self.run_preflight(False, 'archive checksum does not match')

    def test_different_extracted_lock_is_rejected(self):
        (self.release / 'source/data/source-lock.json').write_text('different')
        self.run_preflight(False, 'source archive and deployed source lock differ')

    def test_different_receipt_lock_is_rejected(self):
        self.data['source_lock_sha256'] = 'e' * 64
        self.write_receipt()
        self.run_preflight(False, 'receipt lock checksum differs')


class RecoveryImageTests(unittest.TestCase):
    def test_required_retained_images_are_checked_without_running_containers(self):
        self.check_images('', True)

    def test_missing_pinned_client_fails_before_restore(self):
        self.check_images('sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727', False)

    def check_images(self, missing, success):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mock = root / 'docker'
            mock.write_text('''#!/usr/bin/env python3
import os,sys
assert sys.argv[1:3] == ['image','inspect'], sys.argv
sys.exit(1 if sys.argv[3] == os.environ.get('MISSING_IMAGE') else 0)
''')
            mock.chmod(0o755)
            script = SCRIPT.with_name('restore-factual-drill.sh')
            helper = root / 'check.sh'
            helper.write_text(script.read_text().rsplit('\nmain "$@"', 1)[0] + '\ntrap - EXIT\nrequire_recovery_images\n')
            env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH'], 'MISSING_IMAGE': missing}
            result = subprocess.run(['bash', str(helper)], env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode == 0, success, result.stderr)
            if not success:
                self.assertIn('load the verified archive before retrying', result.stderr)


if __name__ == '__main__':
    unittest.main()
