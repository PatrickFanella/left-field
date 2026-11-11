# North Carolina local general results — 2026-10-28

The first local-office expansion batch parses the retained North Carolina State Board of Elections November 5, 2024 precinct archive into 635 contests, 1,793 candidate rows, and 22,219,489 candidate votes. These are candidate-vote sums, including multi-seat races, not turnout counts.

The catalog includes 218 county commissioner, 217 board of education, 76 register-of-deeds, 90 municipal council, 32 mayor, and 2 superior-court-clerk contests. The sheriff classifier is supported, but this archive contributes no sheriff contests. All 100 counties contribute selected results. The archive was already retained and source-locked for state-legislative acquisition; its bytes were not replaced.

Source: [NCSBE historical results](https://www.ncsbe.gov/results-data/election-results/historical-election-results-data), [retained archive URL](https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_11_05/results_pct_20241105.zip). Parent source-lock ID: `nc-2024-general-results-pct-zip`. The receipt describes this archive snapshot and does not establish current certification or recount status independently.

Every selected row reconciles Election Day, early voting, absentee by mail, and provisional counts to its total. Candidate totals sum all precinct types and reporting counties. Twelve municipal contests span counties; the exact source title groups their county segments. For example, Raleigh mayor includes Durham and Wake and totals 222,637 candidate votes. Exact titles keep wards, districts, seats and unexpired terms distinct, without claiming normalized current-office identity.

The catalog preserves each candidate party literal, including blank parties, and all 135 multi-seat vote-for rules. Its 438 write-in candidate rows include 209 named write-ins and 229 miscellaneous write-in entries. Blank zero-vote choices are excluded as placeholders; positive-vote blank choices, duplicate precinct-candidate rows, conflicting seat counts and unreconciled vote channels fail validation.

The positive office allowlist excludes ballot questions, judicial races outside the selected court-clerk family, soil and water supervisors, sanitary districts and other unselected offices. Odd-year municipal elections are absent from this batch. The archive marks no winners; vote rank does not become a winner or current-holder claim. Every contest is formula-ineligible. Existing Priority Index data and scoring remain unchanged.

Artifact: `data/metadata/rapid-north-carolina-local-office-general-results-v1.json`. The registry-driven v16 local-context coverage receipt now includes 19 artifacts. The shared intake model adds optional candidate party, seats and reporting-jurisdiction fields; legacy artifacts are preserved.

Reproduction:

```sh
npm run rapid:intake -- build rapid-north-carolina-local-office-general-results-v1
npm run rapid:intake -- check
npx vitest run src/rapid-acquisition/intake src/ui/rapid-local-context-coverage.test.ts
npm run typecheck
npm run data:verify
```
