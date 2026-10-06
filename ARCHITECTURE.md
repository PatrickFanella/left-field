# Left Field — Technical Architecture

## Implemented Phase 1 baseline (2026-07-21)

The checked-in baseline is a modular monolith: **Next.js route handlers and TypeScript**, Drizzle, and a local tested **PostgreSQL 16.4/PostGIS 3.4** baseline. Migrations `0000`–`0006` define 90 tables, including normalized launch-proof evidence and verifier attestations. This describes repository and disposable-local evidence, not a production deployment.

The current published release is R1 only: **541 offices** (441 House and 100 Senate) and **497 valid geometries**. R2 (members/ACS/finance), R3 (elections), and R4 (maps, corrections, and lookup readiness) are candidate, synthetic, disabled, or otherwise blocked; none may be represented as published factual enrichment.

## Runtime and data boundaries

- Next route handlers serve public reads through bounded direct SQL DTO queries. Browse limits its root result to 51 and joins to the 541-seat catalog; profile reads use a bounded recursive source-closure query seeded from the current DTO, rather than an unbounded graph traversal.
- Release manifests v1/v2 bind release content. Seven domain digests and their invalidation triggers gate candidate validation and promotion; a changed gated domain removes its digest and validation gate transactionally.
- `DATABASE_URL` is migration-owner only. `WEB_DATABASE_URL` is read-only; `INGEST_DATABASE_URL`, `NATIONWIDE_FINALIZER_DATABASE_URL`, `LAUNCH_VERIFIER_DATABASE_URL`, `RELEASE_PREFLIGHT_DATABASE_URL`, and `RELEASE_OPERATOR_DATABASE_URL` are distinct ingestion, candidate-validation, cryptographic-verification, restricted-preflight, and single-use operator capabilities. Correction intake/review/maintenance and address-lookup roles use their own URLs. These credentials are not interchangeable.
- Candidate creation, launch verification, preflight proof, and promotion are separate actions. Launch attestations and proofs expire, are single-use, bind the branch and fingerprints, freeze candidate writers, and are consumed by the operator lifecycle function. The lifecycle CLI performs promote, rollback, and roll-forward only; it never creates or mutates candidates. Public readers see only the published pointer.
- Candidate baselines may be copied only from an eligible published or retired schema-v2 release. Published and retired release history remains immutable; rollback and roll-forward change the pointer rather than rebuild data.

## Maps and operations

- TIGER processing uses `mapshaper`; map artifacts have immutable receipts, checksums, release-addressed object keys, and validating public serving with a fallback. Public and retired-release serving is implemented. Production object-retention and runtime-credential evidence is still an R4 promotion blocker.
- Corrections live in a separate `operations` schema, outside release manifests and digests. Fixed `SECURITY DEFINER` APIs separate intake, review, maintenance, and release-content roles. Controls include CSRF, idempotency, trusted-edge IP hashing, rate buckets, append-only review transitions, candidate/snapshot incorporation binding, and cleanup.
- Correction explanation text and optional URLs are **untrusted, potentially personal operational data**. Public correction activation is blocked until trusted-edge/direct-ingress controls, retention and cleanup operation, malicious-link moderation, access controls, and emergency redaction/deletion procedures are deployed and evidenced. A correction never mutates its cited immutable release.
- Address lookup is disabled by default. The enabled-only path is no-store, bounded, and redacted, returning only minimized resolution data; it has disabled, canary, and enabled modes. Shared enablement remains blocked on trusted edge/egress, infrastructure and vendor review, retention/redaction proof, two-person approval, and a controlled production canary.
- `release:health` uses the restricted preflight role and reports sanitized universe, geometry, provenance, coverage/quarantine, ingest failure, seven-digest, bounded-read, and launch-blocker fields. The local drill proves role separation, stale/expired-proof rejection, five domain invalidations, immutable preservation, rollback, and roll-forward. Signals are bounded JSONL counts/statuses/durations with an opt-in best-effort sink; default operation has no durable sink and no production telemetry. Health therefore reports production telemetry as `not_observed`.

## Release state and evidence boundary

| Domain | Current state | Boundary |
|---|---|---|
| R1 identity/geography | published | 541 offices, 497 valid geometries, seven-digest validation |
| R2 members, ACS, finance | candidate-only | source, mapping, licensing, and finalization gates remain |
| R3 elections | candidate-only/blocked | reviewed state/year source, geometry, policy, and reconciliation evidence remains |
| R4 maps, corrections, lookup | disabled/blocked | R3 predecessor plus production retention, correction lifecycle, lookup privacy, and accessibility evidence remains |

## Deliberately post-MVP

The HTTP API sketch is conceptual, not a stable public API. Ranking, comparison, aggregate downloads, score explanations, and evidence publication/editorial classification are post-MVP domains. They require their own approved contracts and must not be inferred from the present schema or synthetic fixtures.

## Security and privacy invariants

- Submitted addresses and returned coordinates are transient; they must not enter product logs, analytics, telemetry, error reporting, storage, or public responses.
- Public data is release-addressed and provenance-bound. `NULL` is not zero; coverage and missing reasons remain explicit.
- No voter-level records, individual donor lookup, demographic ranking/filtering, or inferred ideology is part of this system.
- Axe checks are useful automated regression checks, not WCAG conformance. Manual WCAG 2.2 AA and assistive-technology core-flow validation remain required before public acceptance.
