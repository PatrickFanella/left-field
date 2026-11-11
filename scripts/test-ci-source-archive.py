"""Check native backup packaging with tiny, disposable Git repositories."""
import hashlib
import gzip
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('ci-source-archive.py').resolve()


class SourceArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='left-field-source-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'deploy/ci').mkdir(parents=True)
        (self.root / 'deploy/ci/.gitignore').write_text('source.tar\nsource.tmp\nsource.tar.gz\nsource.gz.tmp\n')
        (self.root / 'data').mkdir()
        (self.root / 'data/source-lock.json').write_text('{"sources":[]}\n')
        self.git('init', '-q')
        self.git('config', 'user.name', 'Disposable archive test')
        self.git('config', 'user.email', 'test@invalid.example')
        self.git('config', 'commit.gpgsign', 'false')
        self.commit()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.PIPE)

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'Disposable fixture')

    def package(self, allowed=True):
        result = subprocess.run(['python3', str(SCRIPT)], cwd=self.root, capture_output=True)
        self.assertEqual(result.returncode == 0, allowed)
        return result.stdout.decode().strip()

    def test_repeatable_archive_keeps_sources_and_omits_untracked_runtime_files(self):
        (self.root / '.env').write_text('DISPOSABLE_TEST_ONLY=yes\n')
        first = self.package()
        compressed = (self.root / 'deploy/ci/source.tar.gz').read_bytes()
        self.assertEqual(first, self.package())
        self.assertEqual(compressed, (self.root / 'deploy/ci/source.tar.gz').read_bytes())
        archive = self.root / 'deploy/ci/source.tar'
        self.assertEqual(first, hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(gzip.decompress(compressed), archive.read_bytes())
        with tarfile.open(archive) as source:
            self.assertEqual(source.extractfile('./data/source-lock.json').read(), b'{"sources":[]}\n')
            self.assertNotIn('./.env', source.getnames())

    def test_unmaterialized_lfs_is_refused(self):
        (self.root / 'data/source-lock.json').write_text('version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a' * 64 + '\nsize 100\n')
        self.commit()
        self.package(False)

    def test_uncommitted_source_is_refused(self):
        (self.root / 'data/source-lock.json').write_text('changed\n')
        self.package(False)

    def test_source_symlink_cannot_escape_the_repository(self):
        os.symlink(self.root.parent / 'outside', self.root / 'data/current')
        self.commit()
        self.package(False)


if __name__ == '__main__':
    unittest.main()
