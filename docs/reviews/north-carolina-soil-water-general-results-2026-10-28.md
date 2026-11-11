# North Carolina soil-and-water supervisor results

The retained NCSBE November 5, 2024 precinct archive contributes 100 soil-and-water conservation district supervisor contests across 100 reporting counties, with 510 candidate rows and 4,143,641 candidate votes. This separate catalog extends the first local-general batch without changing its 635 contests or retained artifact bytes.

The exact ballot titles define these historical contests. They do not establish normalized conservation-district boundaries, governing-body identity, appointed membership, current holders, or a complete inventory of positions. Every observed vote-for rule is one. Candidate party fields are blank in the source and remain blank. The catalog preserves 382 named or miscellaneous write-in candidate entries; the source marks no winners.

The parser reuses the first batch's guards against duplicate precinct/candidate rows, conflicting vote-for rules, invalid election dates and mismatched vote channels. A separate positive title allowlist excludes sanitary districts, other local offices and ballot questions. All records remain formula-ineligible, with null current-holder identity and no winner inference.

Source lock: `nc-2024-general-results-pct-zip`, retained at `data/source/rapid/state-general/nc/2024-general-results-pct.zip`, SHA-256 `2fab44e9b12e03c0d88ef832c2e6dc8c569e2b020d64df06a8b551b62bbdb426`.

Artifact: `data/metadata/rapid-north-carolina-soil-water-general-results-v1.json`. The registry-driven v16 coverage receipt now contains 20 artifacts.

Reproduce with:

```sh
npm run rapid:intake -- build rapid-north-carolina-soil-water-general-results-v1
npm run rapid:intake -- check
npm run data:verify
```

Local validation on October 28, 2026 passed 31 intake and coverage tests, TypeScript checking, lint, production build, deterministic intake rebuild comparisons and all 1,597 source-lock entries. A separate Python CSV read confirmed the contest, candidate, vote and reporting-county totals. The build emitted 152 filesystem-tracing warnings; these checks do not establish hosted CI or deployment for this batch.
