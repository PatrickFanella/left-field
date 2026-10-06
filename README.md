# Left Field

An evidence-based research application for exploring United States House and
Senate seats, resolving an address to its current federal districts without
retaining it, and tracing important claims back to source records.

## Product boundary

The application organizes public election, geography, campaign-finance, and
incumbent evidence. It is a research tool—not a voter-profiling, persuasion,
fundraising, or election-prediction system.

The repository deliberately distinguishes source material, candidate records,
reviewed evidence, and publishable datasets. Missing information is preserved as
missing and is not converted into a zero or an inferred fact. See
[`PRD.md`](PRD.md) for product scope and [`ARCHITECTURE.md`](ARCHITECTURE.md) for
the system and data-contract boundaries.

## Status

Active development. The repository includes the Next.js application, Postgres
and PostGIS persistence, versioned migrations, source-lock verification,
reproducible acquisition and generation scripts, unit and integration tests,
and production-environment contract checks. Repository evidence is not itself a
claim that every proposed dataset or public release has been approved.

## Project identity

The product name is **Left Field**; the repository and npm package use
`left-field`. Clone the renamed repository with:

```bash
git clone https://git.subcult.tv/subculture-collective/left-field.git
```

Existing databases, roles, service units, configuration paths, and development
profiles retain their `dsa_seats` or `dsa-seats` identifiers for compatibility.
Evidence URNs and hash namespaces also retain those identifiers so recorded
source material and signed receipts remain verifiable. The product rename does
not require a database or service migration.

## Local development

Requirements: Node.js, npm, Docker with Compose, and Chromium for browser tests.

```bash
make install
make browser-install
make dev
```

`make dev` starts the local Postgres service, rebuilds a disposable synthetic
fixture database, and runs the Next.js development server. It does not use or
approve unpublished review data.

Run `make help` for the complete command list.

## Verification

```bash
make check
make e2e
```

`make check` runs type checking, lint, non-database unit tests, the production
environment contract, and source-lock verification. `make e2e` provisions its
own disposable browser-test database and runs the seeded desktop, mobile, and
accessibility gate.

Acceptance testing has additional isolated-database and restricted-login
requirements; follow the guardrails printed by `make acceptance` rather than
pointing tests at an existing database.

## Privacy and evidence

- Submitted addresses are intended for transient district resolution and must
  not be retained.
- Individual voter files, inferred ideology, and demographic targeting are out
  of scope.
- Material published facts require sources, retrieval context, and an explicit
  review state.
- Synthetic fixtures, proposals, reviewer decisions, and published outputs are
  different evidence classes and must remain distinguishable.

## License

No project-wide license has been declared. The repository also contains public
source data and derived artifacts whose reuse may be governed by their original
providers; consult the recorded source metadata before redistribution.
