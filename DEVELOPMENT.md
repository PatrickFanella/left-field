# Left Field

Left Field is a research site for seats in the U.S. House and Senate,
governorships, and state legislatures, published at
<https://left-field.subcult.tv>. It scores each seat from public election,
geography, and campaign-finance records, shows the inputs behind every score,
and says which inputs it does not have. Scores are provisional and versioned.
They are research priorities, not forecasts or endorsements.

The site also publishes factual House and Senate seat records with their
sources. An address lookup resolves an address to its federal districts without
retaining it; it stays off unless a deployment has passed privacy review.

`PRD.md` and `ARCHITECTURE.md` still carry the earlier working title, Federal
Seat Research.

## Product boundary

The application organizes public election, geography, campaign-finance, and
incumbent evidence. It is a research tool. It is not a voter-profiling,
persuasion, fundraising, or election-prediction system.

The repository keeps source material, candidate records, reviewed evidence, and
publishable datasets separate. Missing information stays missing; it is not
converted into a zero or an inferred fact. See
[`PRD.md`](PRD.md) for product scope and [`ARCHITECTURE.md`](ARCHITECTURE.md) for
the system and data-contract boundaries.

## Status

Active development. The repository includes the Next.js application, Postgres
and PostGIS persistence, versioned migrations, source-lock verification,
reproducible acquisition and generation scripts, unit and integration tests,
and production-environment contract checks. Repository evidence is not itself a
claim that every proposed dataset or public release has been approved.

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

### Next.js lint dependency

The `@next/eslint-plugin-next` override replaces only its `fast-glob` dependency
with pinned `tinyglobby` 0.2.17 to remove the unpatched `braces` advisory
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
All Next.js, React, accessibility, and TypeScript lint rules remain enabled.
`npm run lint` first checks that Next.js discovers default, literal, wildcard,
brace, array, and normalized Windows-style roots and still rejects internal
HTML links. Remove the override when the upstream plugin has a safe dependency
chain, and retain the compatibility check when upgrading it.
