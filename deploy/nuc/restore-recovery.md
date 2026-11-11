# Recover the backed-up published release

Run the maintained factual restore script on NUC as root:

```sh
/usr/local/sbin/dsa-seats-factual-restore-drill.sh --snapshot-only
```

This is an isolated drill, not a production cutover. It retrieves the latest tagged encrypted backup, validates backup checksums and the archived source lock, matches the exact local application image ID, and restores temporary database and object volumes on an internal Docker network. Each disposable container has a one-CPU, 1536 MiB, 256-PID limit. The script removes its temporary containers, network, volumes and restored files when it exits.

The snapshot contract checks the backed-up release identity, seven stored content digests, ingest history, factual counts, web-role read/write restrictions, object-store TLS and retention, application routes, and restricted repository health. Repository health recomputes the existing seven-domain validation gate. The published pointer must remain equal to the backup's pointer. The health JSON is retained beside the text receipt in `/srv/server/restore-evidence/dsa-seats/`.

The snapshot result uses a separate `dsa_seats_snapshot_restore.prom` file and `dsa_seats_snapshot_restore_*` metrics. It never updates `dsa_seats_restore_drill_*`, which continues to represent the original restore-plus-publication-lifecycle contract. Failure to parse the health report, a failed repository gate, or a changed published pointer fails the snapshot drill.

Without arguments the script still runs the original rollback/roll-forward exercise. That exercise currently rejects the August full release: it selects the legacy publication path, but the required predecessor proofs and unchanged-content inheritance do not exist. A successful snapshot drill does not qualify release promotion, rollback followed by roll-forward, production telemetry, or a production cutover. Do not invent proof records or weaken those publication checks to make that exercise pass.

Prerequisites include the current restic password file, trusted SSH host key, NUC backup key, exact application/PostGIS/MinIO server images, the pinned MinIO client, and retained FEC TLS material. The client archive is on Dozor at `/srv/recovery/images/minio-mc-a7fe349ef4bd.tar.zst`; verify SHA256 `682a8948ad1dd6c69496573f68592add9ec3a87fd18caed72ef5b2291690f8f2` before loading it. Verify loaded client image ID `sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727`. This drill does not prove reconstruction on a blank host without those prerequisites.

Environment overrides for repository, key, evidence directory, metrics destination and restore subnet remain available. Keep snapshot and lifecycle metric destinations separate. Unknown or extra command-line arguments are rejected before any restore work begins.


## Images missing a source archive label

A factual backup resolves source identity before dumping data or pausing object
stores. Prefer an image built with a valid `SOURCE_TREE_SHA256` label and retain
its exact archive as `releases/<sha256>/source.tar`, with its extracted tree in
`releases/<sha256>/source/`.

For an already-deployed image whose source label is absent, capture `/app` from
that exact immutable image in a disposable read-only, network-isolated container.
Exclude generated `.next`, `node_modules` and `.git` directories. Do not copy
runtime environment files or mounted credentials. Retain the archive and its
extracted tree in the same layout, addressed by the archive's SHA-256. This
records the deployed image filesystem, not an assumed Git build context.

Install a root-owned mode-0600 `runtime/backup-source.json` receipt containing
`schema_version: 1`, `source_kind: "immutable-image-filesystem"`, `image_id`
(the complete `sha256:` image ID), `git_revision` (the image's full revision),
`source_tree_sha256` and `source_lock_sha256`. The receipt is valid only for that
image and revision. The backup verifies the archive bytes, embedded source lock
and extracted source lock before accepting it. Never reuse this receipt for a
new image or substitute the source from an older Compose release directory.

Run `backup-factual.sh --check-source-only` to verify identity without taking a
backup, changing metrics or pausing stores. A deployment that omits both valid
source labels and a matching retained receipt remains a backup failure.

The NUC deployment retains its existing Kvant data2 Restic repository, SSH key
path, two local staging generations and LAN-bound ntfy destination. Long-term Restic retention remains fourteen daily,
eight weekly and twelve monthly snapshots. Backup success and an isolated
restore remain separate acceptance checks.

Before restoring any snapshot, the drill checks the retained PostgreSQL, MinIO
server and exact MinIO client images. Restore missing images from a checksum-
verified recovery archive; do not substitute a floating client tag.

Application recovery selects the immutable image ID stored in `deployment.csv`,
not a tag derived from the source archive hash. Runtime-only patches may retain
the same application source archive while having different image identities.
A missing exact image remains a recovery failure; no tag fallback is allowed.
