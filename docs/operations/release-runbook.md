# Release operations runbook

## Safety boundary

Do not place connection strings, keys, addresses, or raw receipts in shell history, logs, tickets, or command lines. Inject secret values through the approved secret manager. Stop on any failed gate; do not retry a failed candidate by mutation. Preserve its receipts and quarantine/review the failed source or candidate before a new validated attempt.

Use distinct least-privilege connections: migration owner `DATABASE_URL`; ingest `INGEST_DATABASE_URL`; nationwide candidate validation `NATIONWIDE_FINALIZER_DATABASE_URL`; read-only preflight `RELEASE_PREFLIGHT_DATABASE_URL`; lifecycle operator `RELEASE_OPERATOR_DATABASE_URL`; independent launch verifier `LAUNCH_VERIFIER_DATABASE_URL`; web `WEB_DATABASE_URL`; corrections `CORRECTION_DATABASE_URL`; address admission `ADDRESS_DATABASE_URL`. The finalizer and launch verifier must have distinct LOGIN principals. `release:health` accepts only the preflight URL and verifies the session's exclusive `dsa_seats_release_preflight` role membership inside PostgreSQL; username spelling is not authorization.

## Local, disposable mechanism commands

Run migrations only as the migration owner:

```bash
npm run db:migrate
```

Run repository gates:

```bash
npm run data:verify
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Inspect one release with the restricted preflight role (replace the placeholder with an actual `rel_...` identifier):

```bash
npm run release:health -- --release <rel_release_id>
```

The JSON report is deliberately sanitized to counts/statuses/durations. It checks the 541/441/100 universe, 497 valid geometries, source/snapshot status, coverage/quarantine count, unresolved current ingestion runs, seven-domain gate, and bounded repository reads. A local repository gate is clean only when `repositoryStatus` is `pass`. Overall production readiness remains non-pass because production telemetry is explicitly `not_observed`; this is not launch approval.

Run the combined production report from a verifier container that can reach both
the factual database network and the monitoring network:

```bash
npm run production:health -- --release <rel_release_id>
```

The command uses the restricted preflight database role and Prometheus API. A
healthy deployment reports `repositoryStatus=pass` and
`productionTelemetryStatus=pass`. `alertDeliveryStatus` remains `blocked` until
a named human receiver owns the Left Field alert route and an end-to-end test
receipt is retained; a technically configured receiver name alone is not
delivery evidence.

Run the lifecycle drill only on one loopback `*_test` database, with six distinct LOGIN users, nonproduction `NODE_ENV`, and `RELEASE_DRILL_OPT_IN=RUN_SYNTHETIC_RELEASE_DRILL` already supplied by the disposable test environment:

```bash
npm run release:drill
```

The drill rejects production, non-loopback, non-`*_test`, shared-user, parameter-overridden, or multi-target configurations. Its successful JSON is local synthetic evidence only; it attests roles, invalidates five domains, rejects stale/expired proofs, and performs three full web-role browse/profile/source/coverage smoke phases after promotion, rollback, and roll-forward while proving immutable preservation.

## Candidate and release gates

Before any external lifecycle action: verify the source lock; migrate; require `repositoryStatus=pass` in the health report for the exact release; require no unresolved current ingest run; review quarantined counts rather than assuming zero; recheck the seven-domain validation gate; and run release-addressed browse/profile/sources/coverage smoke reads. Retain the resulting sanitized outputs with the release record. A blocked/not-run production-readiness result must never be described as green or launch-ready.

Stage only with the ingest role via the existing `npm run ingest` command. Finalize only through the matching existing command: `npm run finalize:nationwide`, `npm run enrich:members`, `npm run finalize:acs`, `npm run finalize:fec`, `npm run finalize:elections`, or `npm run finalize:maps`. Each parser requires its exact documented arguments, source receipts, source-lock binding, and finalizer-specific storage environment; do not guess arguments or use these commands to construct an unreviewed candidate. Finalization validates a candidate; it does not promote one.

Lifecycle transitions use the audited CLI and never the migration owner:

```bash
# Mapless/all-unassessed promotion or roll-forward; SQL still fails closed if evidence is required.
npm run release:lifecycle -- promote --release rel_...
npm run release:lifecycle -- roll-forward --release rel_...

# Reviewed-election proof: exactly 158 unique runs and the exact used lock-entry IDs.
npm run release:lifecycle -- promote --release rel_... \
  --election-source-release rel_... \
  --task9-run run_... --election-lock-entry lock_... # repeat exactly as required

# Emergency direct-predecessor rollback derives the current/predecessor under lock.
npm run release:lifecycle -- rollback
```

Launch proofs are explicit and mutually exclusive: `--launch-finance-proof <id>` or `--launch-election-proof <id>`. They require `LAUNCH_VERIFIER_DATABASE_URL`, an immutable configured raw store, and the review registry. Production reads only `/etc/dsa-seats/launch-review-keys.json`, which must be a root-owned regular file with exact mode `0640` and group equal to the process effective group; do not pass keys or paths on the command line. Nonproduction may set `LAUNCH_REVIEW_KEYS_FILE`. Finance terminal outcomes are derived from persisted verifier data, never CLI input. R4 maps at the fixed cutoff use `--launch-maps` and also require the independent verifier database.

The process requires `INGEST_DATABASE_URL`, `RELEASE_PREFLIGHT_DATABASE_URL`, and `RELEASE_OPERATOR_DATABASE_URL`; the ingest connection performs no lifecycle mutation. Map-bearing transitions additionally require configured exact map storage, and reviewed elections require the verified source lock/raw store. Missing or incomplete proof arguments fail before transition. Defaults remain disabled: no launch proof or map flag is inferred.

For promotion, obtain a short-lived preflight proof through the authorized API while the candidate is locked, then consume it once through the authorized operator API. The proof is bound to target/predecessor and expires; an expired or consumed proof must fail. Direct-predecessor rollback has its defined proof-free path; roll-forward still uses the restricted API and applicable proof. On any conflict, expiry, stale digest, or failed smoke, leave the published pointer unchanged, disable further lifecycle attempts, and roll forward only after the root cause is corrected and a new valid proof is issued.

R2/R3/R4 publication is currently blocked until independent reviewer keys, an independent verifier principal, immutable raw storage, and the approval package exist. R2 requires real keyed/reviewed FEC evidence and mappings; R3 requires reviewed nationwide election decisions and proof closure; R4 requires a publishable R3 predecessor and production object-retention/runtime-credential evidence. These are not runnable local steps.

For nonpublication research only, `npm run fetch:fec-local -- --output data/fec-local.json` fetches OpenFEC filing metadata and available electronic filings, sanitizes filings while streaming, and writes canonical content-addressed JSON under `data/fec-local.json.artifacts/` plus a resumable manifest. It requires only `FEC_API_KEY`; `--hours 1..6`, `--artifacts PATH`, and `--resume` are optional. The command has no PostgreSQL or object-store path, and every manifest is permanently marked `publicationEligible:false`, `reviewStatus:"unreviewed"`. Its output cannot be finalized, promoted, signed, or treated as publication evidence.

The production `release` tooling obtains the OpenFEC credential and distinct
FEC acquisition/replay-verifier database connections only from mounted secret
files. Both logins must be non-superuser, non-createdb, non-createrole,
non-replication principals with exactly their corresponding capability role;
neither may directly write release tables or inherit the other capability.
Their presence is necessary but insufficient. Do not run
`npm run acquire:fec-v2` until the exact candidate contains the independently
sealed 541-seat plan and expectation and the production TLS versioned store has
recorded retention evidence. The release container receives that evidence and
the store's public root CA as read-only files. Startup recomputes the evidence
SHA-256 and rejects evidence that is not bound to the configured endpoint,
bucket, pinned CA, enabled versioning, writer delete denial, exact one-year
COMPLIANCE default retention, and a retained-object proof. Never substitute the
local research fetcher, ordinary raw store, or an operator-created expectation.

### FEC v2 plan review handoff

The application may compile a proposed acquisition plan for independent review;
it may not install, seal, approve, or sign the verifier-owned expectation.
Prepare an explicit JSON input with exactly these root fields:
`schemaVersion` (`1`), `releaseId`, `receiptCutoff` (`2026-07-18`),
`campaignCycle` (`2026`), `sourceLockSha256`, and `targets`. `targets` must
contain exactly 541 unique seat-cycle IDs in C-byte order. Each target is either
`candidate_resolution_required`, or an explicit `terminal` target with
`vacant`, `non_candidate`, or `not_contested` disposition and an evidence
SHA-256.

Compile the review artifacts offline:

```bash
npm run compile:fec-v2-plan -- \
  --input /path/to/reviewed-targets.json \
  --plan /path/to/fec-v2-plan.json \
  --manifest /path/to/fec-v2-plan.review.json
```

The command creates files with exclusive-create semantics, verifies exact
idempotent retries, and rejects an existing conflicting plan or manifest. The
manifest records the canonical plan hash, source-lock hash, target-universe
hash, and disposition counts; it contains no credential or reviewer private
key. Send both files and the separate approval package to independent data
review. Only verifier-side administration may persist and seal the reviewed
541-target expectation. The release runtime receives the resulting exact plan
SHA and read-only plan file.

Before any production candidate or acquisition, requalify and record named
reviewer keys, acquisition/replay role separation, legal/data approval, exact
TLS endpoint/bucket/CA binding, enabled versioning, writer delete denial,
one-year COMPLIANCE retention, a retained-object proof, verifier-side plan
authority, and explicit candidate authorization. A missing gate blocks
production writes; local compilation is not production readiness evidence.

## Operational incidents and retention

Only the root-owned, latched `/run/dsa-seats/feature-gates.json` signed v2 activation package can enable correction intake or address lookup. Production verifies it against `/etc/dsa-seats/feature-gate-public-key.json`; both are root:`dsa-seats-gates`, exact `0640`, beneath root-owned exact-`0750` directories. The key document is `{version:1,keyId,publicKeyPem}` and the gate is an offline Ed25519 signature over canonical JSON; private signing keys must never be deployed. Use separate approved package SHA-256 values when both features are enabled. On uncertainty, replace it with the disabled signed package (or use the negative-only address/correction kill switches); do not use environment variables to activate either feature. Nonproduction may use the explicitly named path overrides only. On address/correction privacy uncertainty, disable first, preserve only nonsensitive incident evidence, and follow [`address-lookup-privacy-gate.md`](../deployment/address-lookup-privacy-gate.md).

The NUC runs `/usr/local/sbin/dsa-seats-factual-monitor.sh` through
`dsa-seats-factual-monitor.timer`. Inspect the latest result and its
low-cardinality textfile metrics with:

```bash
sudo systemctl status dsa-seats-factual-monitor.timer
sudo systemctl status dsa-seats-factual-monitor.service
sudo journalctl -u dsa-seats-factual-monitor.service --since today
sudo sed -n '1,240p' /srv/server/monitoring/data/node-exporter-textfile/dsa_seats_factual.prom
```

The monitor checks public HTTPS, the reverse-proxy hop, the NUC origin,
container health, restricted database access, the published release pointer,
the seven-domain gate, unresolved ingestion, and the exact map receipt/route
contract. It emits no release, run, source, URL, address, or receipt identifiers
as metric labels. Prometheus loads the DSA rules from
`/etc/prometheus/alerts/dsa-seats-alerts.yml`.

Register the checked-in rule group in the active NUC Prometheus configuration
with the idempotent registrar. The active Prometheus container bind-mounts the
configuration file itself, so restart that container after the registrar's
atomic replacement; an HTTP reload alone can continue reading the old inode.

```bash
sudo env \
  PROMETHEUS_CONFIG=/srv/apps/monitoring/config/prometheus/prometheus.yml \
  INSTALLED_RULES=/srv/apps/monitoring/config/prometheus/alerts/dsa-seats-alerts.yml \
  SOURCE_RULES=/path/to/release/deploy/nuc/dsa-seats-alerts.yml \
  sh /path/to/release/deploy/nuc/register-prometheus-rules.sh
docker restart prometheus
curl -fsS 'http://10.0.0.56:9090/api/v1/rules?type=alert'
```

The API result must contain exactly one healthy `dsa-seats-factual` group with
17 inactive rules before `production:health` is run.

The encrypted factual backup runs through
`dsa-seats-factual-backup.timer`. A successful backup includes the database,
immutable raw objects, map objects, exact source archive and source lock,
deployment/image identity, release and ingest manifests, backup/restore/monitor
scripts and units, monitor environment, Prometheus config and alert rules, the
FEC retention evidence and public root CA, and the latest sanitized
metrics/evidence. The FEC server private key is deliberately excluded and must
be recovered through the separately approved secret-recovery path. Validate the
local manifest before using a snapshot:

```bash
sudo systemctl status dsa-seats-factual-backup.timer
sudo cat /srv/server/backups/dsa-seats-r1/LAST_SUCCESS
sudo sh -c 'cd "/srv/server/backups/dsa-seats-r1/$(cat /srv/server/backups/dsa-seats-r1/LAST_SUCCESS)" && sha256sum --check SHA256SUMS'
```

Run the recovery proof as a transient service:

```bash
sudo systemd-run \
  --unit=dsa-seats-factual-restore-drill \
  --collect \
  /usr/local/sbin/dsa-seats-factual-restore-drill.sh
sudo journalctl -fu dsa-seats-factual-restore-drill.service
```

The drill restores the latest encrypted off-host snapshot into disposable
networks, containers, and volumes; verifies every backed-up checksum; migrates
and restores PostgreSQL; proves release/digest/ingest parity and the factual
closure; starts the restored application; exercises public data restrictions
and release-addressed browser/profile/sources/method routes; and performs an
isolated predecessor rollback and roll-forward. It also starts the restored FEC
store with the recovered TLS secret, validates it over HTTPS with the backed-up
public CA, proves the CA and server-certificate bindings recorded by the
retention evidence, and requires both the exact one-year COMPLIANCE default and
the retained object's versioned COMPLIANCE lock. Evidence is written beneath
`/srv/server/restore-evidence/dsa-seats/`, metrics beneath
`/srv/server/monitoring/data/node-exporter-textfile/`, and disposable resources
must be absent after completion.

Operations owns retention for raw objects, source receipts, lifecycle proofs, operational tables, logs, backups, and vendor exports. Production maps additionally require version retention and delete denial. Do not claim alert delivery without a named human receiver and retained end-to-end receipt. Application telemetry signals are bounded, sanitized JSONL best-effort events with no default durable destination or retry. `releaseId`, `runId`, and `sourceId` are JSONL correlation fields only and MUST NOT be metric label dimensions.
