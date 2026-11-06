# Automatic factual web delivery

The existing required `static / static` and `acceptance / acceptance` jobs retain
their source checks, typecheck, lint, tests, audit, database/query/browser gates
and production builds. A dependent `acceptance / Web image` job qualifies the
actual native image after acceptance succeeds. Promotion additionally checks
successful static and acceptance statuses for the exact current main commit,
read through the host’s existing explicit `subcult-agent` CLI login.
Only canonical Gitea main pushes or workflow dispatches can activate an image.
Pull requests run image qualification without deployment credentials.

## Web and data boundaries

The fixed receiver selects only `app` in project `dsa-seats-r1` on NUC. It retains
the secret-loading entrypoint, web-only password mount, read-only map volume,
network, ports, health check and runtime settings. Migration, role-grant,
release/operator, corrections, database and object-store services are excluded
from activation. Native factual publication and its independent reviewer,
preflight, verifier and lifecycle requirements remain in force.

The versioned `scripts/predeploy-ci.py` hook is installed from the exact green
merged source at its registered hash/path. A missing hook fails before
activation. It requires unchanged native configuration/secret-file hashes,
startup settings, all Drizzle files and the secret-loading wrapper. A read-only
metadata transaction checks exclusive web-role membership and no privileged
flags, database/schema creation or persistent table/sequence writes. Executable
security-definer function definitions, the published factual pointer and its
seven digest records must match registration; unresolved published ingestion
blocks activation. Native data/schema releases require their own admission and
reviewed registration updates. No production data or role is mutated by this hook.

## Exact source and recovery

The native backup requires the deployed image's exact source archive. CI fetches
the pinned LFS input, then `scripts/ci-source-archive.py` packages only committed,
tracked build inputs with deterministic metadata. It refuses dirty source,
unmaterialized LFS pointers and source symlinks escaping the repository. Untracked
runtime files are omitted. The archive SHA-256 is the native source-tree label;
the image transports its deterministic gzip copy in `/app/deploy/ci/source.tar.gz`.

Before activation, the hook decompresses with a size limit, verifies the archive bytes and source lock, and extracts
it with safe path filtering into a new private native release directory, and
atomically installs the archive/tree at
`/srv/server/projects/dsa-seats-r1/releases/<archive-sha256>/`. Existing source
archives are verified without replacement. Disk space is checked before copying.
A disposable, unstarted candidate container lets the maintained
`dsa-seats-factual-backup.sh --check-source-only` verify that exact candidate's
backup identity. This check takes no backup, changes no metrics and pauses no
store. Native backup retention and timers retain their procedures.

Image rollback restores the previous immutable web image and its checked public
responses; it does not roll back data. Existing archives and images are retained.
The snapshot-recovery drill and publication rollback/roll-forward drill remain
separate contracts, as documented in [snapshot recovery](../../deploy/nuc/restore-recovery.md).
Web delivery does not qualify a new factual release or satisfy blocked publication
proofs. Never substitute the synthetic preview for the public factual route.

## Qualification and identity

The actual-image check uses a new internal network and disposable PostGIS/maps,
with the native synthetic Task10 seed. Only its fixture migrator has admin access;
the web candidate receives only its fixture web login. Every packaged public
asset, selected rendered routes and the uncached source marker must pass. No
production credentials or provider operations enter this test. Fixture processes
have internal expiry and cleanup uses only their recorded names/IDs.

`/build-info.json` identifies the exact image source commit and always returns
no-store, including requests with query strings. The initial legacy profile
checks the factual page and native Docker health so the markerless prior image
remains recoverable. After independent first-deployment verification, add the
image-backed marker check and retain the legacy profile for old-image recovery.
Future deployments verify marker bytes directly against their accepted image.

The application key permits only Kvant's LAN source and the pinned receiver's
`left-field` profile, refusing a shell and data-service selection. Gitea holds
only `HOMELAB_DEPLOY_KEY` and `HOMELAB_KNOWN_HOSTS` for deployment; native mounted
credentials retain their existing stores. The homelab operator owns key review
on February 3, 2027. Private baseline/profile files are
`~/.config/fleet-deploy/left-field-compose.json` and `left-field.json`;
registration and receipts are under `~/.local/state/fleet-deploy/left-field/`.

After main CI succeeds, independently check source marker/assets, public factual
and privacy contracts, native backup source identity, published release/digests,
web privileges, runtime configuration and database/store/peer identities.
