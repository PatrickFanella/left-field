#!/usr/bin/env python3
"""Check the actual web image using only the native disposable Task10 fixture."""
import base64
import json
import re
import subprocess
import sys
import time
import uuid

POSTGRES = 'postgis/postgis@sha256:681931a625df344215e9b8998bf34daf146b6a395ceacee4439eb9c85869239f'


def run(args, timeout=120, data=None):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Disposable image-check command failed')
    return result.stdout


def main(image, revision):
    assert re.fullmatch(r'[0-9a-f]{40}', revision)
    metadata = json.loads(run(['docker', 'image', 'inspect', image]))[0]
    labels = metadata['Config']['Labels']
    assert labels['org.opencontainers.image.revision'] == revision
    assert labels['org.opencontainers.image.source'] == 'https://git.subcult.tv/subculture-collective/left-field'
    assert re.fullmatch(r'[0-9a-f]{64}', labels['org.opencontainers.image.source-tree-sha256'])
    image = metadata['Id']
    name = 'left-field-ci-' + uuid.uuid4().hex[:12]
    network = volume = pg = app = seed = None
    try:
        network = run(['docker', 'network', 'create', '--internal', name]).decode().strip()
        volume = run(['docker', 'volume', 'create', '--driver', 'local', '--opt', 'type=tmpfs',
                      '--opt', 'device=tmpfs', '--opt', 'o=size=256m', name]).decode().strip()
        pg = run(['docker', 'run', '--rm', '-d', '--init', '--network', network, '--network-alias', 'postgres',
                  '--memory', '1536m', '--cpus', '1', '--pids-limit', '256', '--shm-size', '256m',
                  '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
                  '-e', 'POSTGRES_USER=dsa_seats', '-e', 'POSTGRES_PASSWORD=dsa_seats', '-e', 'POSTGRES_DB=dsa_seats_ci_test',
                  '--entrypoint', '/usr/bin/timeout', POSTGRES, '-s', 'TERM', '-k', '5', '420', 'docker-entrypoint.sh', 'postgres']).decode().strip()
        for attempt in range(60):
            if subprocess.run(['docker', 'exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', 'dsa_seats', '-d', 'dsa_seats_ci_test'], capture_output=True).returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('Disposable PostGIS did not become ready')
        seed = name + '-seed'
        run(['docker', 'run', '--name', seed, '--rm', '--init', '--network', network, '--memory', '4g', '--cpus', '2',
                    '--pids-limit', '256', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                    '-e', 'NODE_ENV=test', '-e', 'DATABASE_URL=postgresql://dsa_seats:dsa_seats@postgres:5432/dsa_seats_ci_test',
                    '-e', 'MAP_ARTIFACT_ROOT=/tmp/task13/task10-maps', '-v', volume + ':/tmp/task13/task10-maps',
                    '--entrypoint', '/usr/bin/timeout', image, '-s', 'TERM', '-k', '5', '150',
                    '/bin/sh', '-c', 'npm run db:migrate && npx --no-install tsx scripts/seed-task10-map-e2e.ts'], timeout=170)
        sql = b"CREATE ROLE dsa_seats_web_login LOGIN PASSWORD 'disposable-ci-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT; GRANT dsa_seats_web TO dsa_seats_web_login;"
        run(['docker', 'exec', '-i', pg, 'psql', '-X', '-U', 'dsa_seats', '-d', 'dsa_seats_ci_test', '-v', 'ON_ERROR_STOP=1'], data=sql)
        app = run(['docker', 'run', '--rm', '-d', '--init', '--network', network, '--memory', '1536m', '--cpus', '2',
                   '--pids-limit', '256', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                   '-e', 'NODE_ENV=production', '-e', 'WEB_DATABASE_URL=postgresql://dsa_seats_web_login:disposable-ci-only@postgres:5432/dsa_seats_ci_test',
                   '-e', 'MAP_ARTIFACT_ROOT=/tmp/task13/task10-maps', '-v', volume + ':/tmp/task13/task10-maps:ro',
                   '--entrypoint', '/usr/bin/timeout', image, '-s', 'TERM', '-k', '5', '240',
                   '/app/deploy/nuc/run-with-secrets.sh', 'npm', 'run', 'start', '--', '-H', '0.0.0.0']).decode().strip()
        fetch_js = "const r=await fetch('http://127.0.0.1:3000'+process.argv[1]);const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers),sha256:(await import('node:crypto')).createHash('sha256').update(b).digest('hex'),body:b.toString('base64')}));"
        def fetch(path):
            return json.loads(run(['docker', 'exec', app, 'node', '--input-type=module', '-e', fetch_js, path], timeout=15))
        for attempt in range(40):
            try:
                root = fetch('/')
                assert root['status'] == 200
                break
            except (AssertionError, RuntimeError):
                time.sleep(0.5)
        else:
            raise RuntimeError('Candidate web fixture did not become ready')
        assert b'Left Field' in base64.b64decode(root['body'])
        marker = (json.dumps({'schema_version': 1, 'source_commit': revision}, separators=(',', ':')) + '\n').encode()
        for suffix in ['', '?v=' + revision, '?v=stale']:
            response = fetch('/build-info.json' + suffix)
            assert response['status'] == 200 and base64.b64decode(response['body']) == marker
            assert response['headers']['cache-control'] == 'no-store'
        listing = "const fs=require('fs'),path=require('path'),crypto=require('crypto');const files={};function walk(dir){for(const n of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,n.name);if(n.isDirectory())walk(p);else if(n.isFile())files[p.slice('/app/public/'.length)]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}}walk('/app/public');console.log(JSON.stringify(files));"
        files = json.loads(run(['docker', 'run', '--rm', '--read-only', '--network', 'none', '--entrypoint', 'node', image, '-e', listing]))
        for name, expected in files.items():
            response = fetch('/' + name)
            assert response['status'] == 200 and response['sha256'] == expected, name
        for path in ['/seats', '/seats/seat_0', '/sources', '/coverage', '/method']:
            response = fetch(path)
            assert response['status'] == 200 and b'Left Field' in base64.b64decode(response['body']), path
        print(json.dumps({'result': 'PASS', 'public_assets': len(files), 'marker_uncached_all_queries': True,
                          'native_fixture_only': True, 'read_only_web_role': True, 'production_credentials_used': False}))
    finally:
        for owned in [app, seed, pg]:
            if owned:
                subprocess.run(['docker', 'rm', '-f', owned], capture_output=True)
        if volume:
            subprocess.run(['docker', 'volume', 'rm', volume], capture_output=True)
        if network:
            subprocess.run(['docker', 'network', 'rm', network], capture_output=True)


if __name__ == '__main__':
    assert len(sys.argv) == 3
    main(sys.argv[1], sys.argv[2])
