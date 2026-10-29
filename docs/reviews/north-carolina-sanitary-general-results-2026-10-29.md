# North Carolina sanitary-district general results

The retained NCSBE November 5, 2024 precinct archive contributes 14 sanitary-district board, commissioner and supervisor contests, 51 candidate rows and 24,789 candidate votes across 11 reporting counties. Candidate-vote sums include multi-seat races and are not turnout counts. The separate catalog preserves both earlier North Carolina general-election artifacts byte-for-byte.

An exact allowlist selects the 14 retained ballot titles. It excludes other local office families and ballot questions. Titles remain source-defined historical contest keys, not normalized governing-body or boundary identities. The catalog does not enumerate appointed positions or offices absent from this ballot.

Twelve contests have vote-for rules greater than one. The Handy contest combines Davidson and Montgomery reports: two seats and 5,244 candidate votes. Whittier combines Jackson and Swain reports: three seats and 197 candidate votes. Regular and unexpired terms remain separate for Junaluska and Engelhard; Engelhard's unexpired contest retains its source vote-for rule of two.

The shared parser rejects duplicate precinct/candidate rows, conflicting seat counts, invalid election dates and mismatched vote channels. Blank source party values remain blank after whitespace trimming. The catalog retains 25 named or miscellaneous write-in candidate entries. No winner or current holder is inferred; all 14 contests remain formula-ineligible.

Source lock: `nc-2024-general-results-pct-zip`, retained at `data/source/rapid/state-general/nc/2024-general-results-pct.zip`, SHA-256 `2fab44e9b12e03c0d88ef832c2e6dc8c569e2b020d64df06a8b551b62bbdb426`.

Artifact: `data/metadata/rapid-north-carolina-sanitary-general-results-v1.json`. The registry-driven v16 coverage receipt now contains 21 artifacts.

Reproduce with:

```sh
npm run rapid:intake -- build rapid-north-carolina-sanitary-general-results-v1
npm run rapid:intake -- check
npm run data:verify
```

Local validation on October 29, 2026 passed 34 intake and coverage tests, TypeScript checking, lint, production build, deterministic intake rebuild comparisons, all 1,598 source-lock entries and diff checks. An independent Python CSV read confirmed the contest, candidate, vote and reporting-county totals. These checks do not establish hosted CI or deployment for this batch.
