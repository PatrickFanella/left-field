#!/usr/bin/env python3
"""Admit web-only delivery without changing factual publication or data roles."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import urllib.request
import uuid

STATE = Path.home() / '.local/state/fleet-deploy/left-field'
SOURCE = 'https://git.subcult.tv/subculture-collective/left-field'
RELEASES = Path('/srv/server/projects/dsa-seats-r1/releases')
SQL = """
BEGIN READ ONLY;
SELECT json_build_object(
 'role',rolname,'login',rolcanlogin,'superuser',rolsuper,'create_role',rolcreaterole,
 'create_database',rolcreatedb,'replication',rolreplication,'bypass_rls',rolbypassrls,
 'database_create',has_database_privilege(rolname,current_database(),'CREATE'),
 'writable_schemas',(SELECT count(*) FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%'
   AND n.nspname<>'information_schema' AND has_schema_privilege('dsa_seats_web_login',n.oid,'CREATE')),
 'writable_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','v','m','f')
   AND has_table_privilege('dsa_seats_web_login',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
 'writable_sequences',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind='S'
   AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('dsa_seats_web_login',c.oid,'USAGE,UPDATE') ELSE false END),
 'memberships',(SELECT json_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r
   WHERE r.rolname<>'dsa_seats_web_login' AND pg_has_role('dsa_seats_web_login',r.oid,'MEMBER')),
 'security_definers',(SELECT json_agg(n.nspname||'.'||p.proname||':'||md5(pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,p.oid)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%'
   AND n.nspname<>'information_schema' AND p.prosecdef AND has_function_privilege('dsa_seats_web_login',p.oid,'EXECUTE')),
 'published',(SELECT json_agg(json_build_array(id,label,status,source_cutoff) ORDER BY id) FROM data_releases WHERE status='published'),
 'published_digests',(SELECT json_agg(json_build_array(d.release_id,d.domain,d.row_count,d.sha256) ORDER BY d.release_id,d.domain)
   FROM release_content_digests d JOIN data_releases r ON r.id=d.release_id WHERE r.status='published'),
 'unresolved_published_ingest',(SELECT count(*) FROM ingest_runs i JOIN data_releases r ON r.id=i.release_id
   WHERE r.status='published' AND i.status IN('running','failed')))
FROM pg_roles WHERE rolname='dsa_seats_web_login';
ROLLBACK;
"""


def run(args, timeout=30, data=None):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Web admission command failed')
    return result.stdout


def inspect(name, kind='container'):
    return json.loads(run(['docker', kind, 'inspect', name]))[0]


def admit(metadata, registered):
    assert metadata['role'] == 'dsa_seats_web_login' and metadata['login'] is True
    assert metadata['memberships'] == ['dsa_seats_web']
    for key in ['superuser', 'create_role', 'create_database', 'replication', 'bypass_rls', 'database_create']:
        assert metadata[key] is False, 'Native web privilege changed: ' + key
    for key in ['writable_schemas', 'writable_tables', 'writable_sequences', 'unresolved_published_ingest']:
        assert metadata[key] == 0, 'Native web/data admission changed: ' + key
    assert len(metadata['published']) == 1 and 'synthetic' not in metadata['published'][0][1].lower()
    assert len(metadata['published_digests']) == 7
    assert metadata == registered, 'Native role or factual release changed; review its registration'


def image_contract(image):
    script = "const fs=require('fs'),p=require('path'),c=require('crypto'),out={};function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const n=p.join(d,f.name);if(f.isDirectory())walk(n);else out[n.slice(5)]=c.createHash('sha256').update(fs.readFileSync(n)).digest('hex')}}walk('/app/drizzle');out['deploy/nuc/run-with-secrets.sh']=c.createHash('sha256').update(fs.readFileSync('/app/deploy/nuc/run-with-secrets.sh')).digest('hex');console.log(JSON.stringify(out));"
    return json.loads(run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', image, '-e', script]))


def retain_source(image, digest):
    assert re.fullmatch(r'[0-9a-f]{64}', digest)
    target = RELEASES / digest
    staging = None
    try:
        if not target.exists():
            size = int(run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'stat', image, '-c', '%s', '/app/deploy/ci/source.tar']))
            assert 0 < size <= 2 * 1024**3 and shutil.disk_usage(RELEASES).free > 2 * size + 4 * 1024**3
            staging = RELEASES / ('.ci-' + uuid.uuid4().hex)
            run(['sudo', '-n', 'install', '-d', '-m', '0700', '-o', str(os.getuid()), '-g', str(os.getgid()), str(staging)])
            archive = staging / 'source.tar'
            with archive.open('wb') as output:
                result = subprocess.run(['docker', 'run', '--rm', '--init', '--network', 'none', '--read-only', '--log-driver', 'none', '--entrypoint', '/usr/bin/timeout',
                                         image, '-s', 'TERM', '-k', '5', '60', 'cat', '/app/deploy/ci/source.tar'], stdout=output, stderr=subprocess.DEVNULL, timeout=45)
            assert result.returncode == 0
            with archive.open('rb') as source:
                assert hashlib.file_digest(source, 'sha256').hexdigest() == digest
            source = staging / 'source'
            source.mkdir(mode=0o700)
            with tarfile.open(archive) as tar:
                for member in tar.getmembers():
                    assert not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
                    assert member.isfile() or member.isdir() or member.issym()
                tar.extractall(source, filter='data')
            lock = run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'cat', image, '/app/data/source-lock.json'])
            assert (source / 'data/source-lock.json').read_bytes() == lock
            run(['sudo', '-n', 'mv', '-T', '--', str(staging), str(target)])
            staging = None
        with (target / 'source.tar').open('rb') as source:
            assert hashlib.file_digest(source, 'sha256').hexdigest() == digest
        assert (target / 'source/data/source-lock.json').read_bytes() == run([
            'docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'cat', image, '/app/data/source-lock.json'])
    finally:
        if staging:
            shutil.rmtree(staging / 'source', ignore_errors=True)
            (staging / 'source.tar').unlink(missing_ok=True)
            run(['sudo', '-n', 'rmdir', '--', str(staging)])


def main():
    os.umask(0o077)
    registration = json.loads((STATE / 'registration.json').read_text())
    for name, digest in registration['native_file_sha256'].items():
        assert run(['sudo', '-n', 'sha256sum', '--', name]).decode().split()[0] == digest, 'Native configuration changed'
    api = inspect('dsa-seats-r1-app-1')
    assert {k: api['Config'].get(k) for k in ['User', 'Cmd', 'Entrypoint']} == registration['startup']
    assert api['HostConfig'].get('Tmpfs', {}) == registration['tmpfs']
    revision = run(['git', 'ls-remote', SOURCE + '.git', 'refs/heads/main']).decode().split()[0]
    assert re.fullmatch(r'[0-9a-f]{40}', revision)
    with urllib.request.urlopen(SOURCE.replace('https://git.subcult.tv/', 'https://git.subcult.tv/api/v1/repos/') + '/commits/' + revision + '/status', timeout=10) as response:
        checks = json.load(response)['statuses']
    required = ['static / static (push)', 'acceptance / acceptance (push)']
    for name in required:
        matching = [s for s in checks if s['context'] in [name, name.replace('(push)', '(workflow_dispatch)')]]
        assert matching and max(matching, key=lambda s: s['id'])['status'] == 'success', 'Main quality gate has not passed: ' + name
    candidate = inspect('fleet-deploy/left-field/app:' + revision, 'image')
    labels = candidate['Config']['Labels']
    assert labels['org.opencontainers.image.revision'] == revision and labels['org.opencontainers.image.source'] == SOURCE
    assert image_contract(candidate['Id']) == registration['source_contract_sha256'], 'Native schema/tool admission is required'
    metadata = json.loads(run(['docker', 'exec', '-i', 'dsa-seats-r1-postgres-1', 'psql', '-X', '-qAt',
                              '-U', 'dsa_seats_admin', '-d', 'dsa_seats_r1', '-v', 'ON_ERROR_STOP=1'], data=SQL.encode()))
    admit(metadata, registration['native_data_contract'])
    retain_source(candidate['Id'], labels['org.opencontainers.image.source-tree-sha256'])
    fixture = run(['docker', 'create', '--network', 'none', '--entrypoint', '/bin/true', candidate['Id']]).decode().strip()
    try:
        run(['sudo', '-n', 'env', 'APP_CONTAINER=' + fixture, '/usr/local/sbin/dsa-seats-factual-backup.sh', '--check-source-only'])
    finally:
        run(['docker', 'rm', fixture])
    print(json.dumps({'result': 'PASS', 'source_commit': revision, 'native_backup_source_identity': 'PASS',
                      'read_only_web_role': True, 'published_pointer_and_seven_digests': 'unchanged',
                      'data_or_provider_operation': False}))


if __name__ == '__main__':
    main()
