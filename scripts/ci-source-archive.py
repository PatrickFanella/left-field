#!/usr/bin/env python3
"""Retain the exact tracked, LFS-materialized build input for native recovery."""
import hashlib
import os
from pathlib import Path
import subprocess
import tarfile


def git(*args):
    return subprocess.check_output(['git', *args])


def main():
    os.umask(0o077)
    root = Path(git('rev-parse', '--show-toplevel').decode().strip())
    os.chdir(root)
    assert not git('status', '--porcelain', '--untracked-files=no'), 'Commit the reviewed build inputs first'
    revision = git('rev-parse', 'HEAD')
    destination = root / 'deploy/ci/source.tar'
    destination.parent.mkdir(exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    try:
        with tarfile.open(temporary, 'w', format=tarfile.PAX_FORMAT) as archive:
            for record in git('ls-files', '--stage', '-z').split(b'\0'):
                if not record:
                    continue
                metadata, raw_name = record.split(b'\t', 1)
                mode, _, stage = metadata.decode().split()
                name = raw_name.decode()
                assert stage == '0' and mode in ['100644', '100755', '120000']
                assert not name.startswith('/') and '..' not in Path(name).parts
                path = root / name
                assert path.resolve().is_relative_to(root), 'Source symlink escapes the repository'
                info = tarfile.TarInfo('./' + name)
                info.uid = info.gid = info.mtime = 0
                info.mode = 0o755 if mode == '100755' else 0o644
                if mode == '120000':
                    info.type = tarfile.SYMTYPE
                    info.linkname = os.readlink(path)
                    archive.addfile(info)
                else:
                    assert path.is_file()
                    info.size = path.stat().st_size
                    with path.open('rb') as source:
                        assert not source.read(200).startswith(b'version https://git-lfs.github.com/spec/v1\n'), 'Fetch the pinned LFS source before building'
                        source.seek(0)
                        archive.addfile(info, source)
        assert git('rev-parse', 'HEAD') == revision
        assert not git('status', '--porcelain', '--untracked-files=no')
        os.replace(temporary, destination)
        with destination.open('rb') as source:
            print(hashlib.file_digest(source, 'sha256').hexdigest())
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
