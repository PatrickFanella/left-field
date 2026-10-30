# Arizona 2024 general-election OpenElections cross-check v1

This is a reviewer-only comparison of the retained Arizona signed general-canvass transcription and the fifteen retained OpenElections Arizona 2024 general precinct CSVs. The Arizona Secretary of State's signed canvass remains controlling. No OpenElections value is a score input, factual record, correction, or activation input.

## Inputs and scope

- Official controlling input: `az-2024-general-canvass-signed-pdf` and its retained reviewed transcription, covering all 30 State Senate and 30 State House contests on November 5, 2024.
- Independent comparison input: the 15 county CSVs in `data/source/crosschecks/az/2024/openelections/`, pinned to OpenElections revision `bf14331521f62f74cb17848ab11ca3dfd27f4f82` under `2024/General/`.
- The OpenElections Arizona repository does not declare a repository or data license at that revision. Its data remains `unknown` for redistribution purposes. The MIT license in `openelections-core` applies to that separate code repository, not these data files.

The comparison aggregates only party-labelled `State Senate` and `State House` candidate rows across the 15 county files. It excludes OpenElections' partyless contest-total, over-vote, under-vote, and write-in-total rows. It does not infer named write-ins from aggregate lines.

Rows join only when chamber, normalized district (`12` and `Dist-12`), normalized party, and a punctuation/diacritic/case-normalized candidate name all agree. There is no fuzzy-name matching: spelling and abbreviation differences remain source-only findings.

## Result

| Finding | Candidate rows |
|---|---:|
| Matched | 148 |
| Exact totals | 124 |
| Matched with different totals | 24 |
| Official-only | 11 |
| OpenElections-only | 13 |

The observed differences are useful review leads, not evidence that the signed canvass is wrong. Examples include:

- State House 3, Alexander Kolodin: official `88,693`; OpenElections `88,683`.
- State House 8, Caden Darrow: official `35,180`; OpenElections `35,167`.
- State Senate 3, John Kavanagh: official `110,048`; OpenElections `110,034`.
- State Senate 30, Hildy Angius: official `92,213`; OpenElections `83,302`.

The conservative join also exposes transcription/data-name differences without silently merging them. For example, the official canvass has State House 2 independent Tom Simes (`15,946`) and OpenElections has no matching named row. It reports official `Joseph Chaplik` and OpenElections `Joseph CHAPLICK` separately rather than treating a spelling correction as a fact. Similar separate rows occur for `Lorena Austin`/`AUSTEN`, `Mike S. Fogel`/`Mike FOGEL`, and `Hildy Angius`/`ANGUS`.

## Verification

```bash
npx tsx scripts/generate-arizona-2024-general-openelections-crosscheck.ts --check
npm run test:run -- src/rapid-acquisition/crosschecks/arizona-2024-general.test.ts
```

The generator reads only the fixed source-lock pins: the signed canvass, its reviewed transcription, and 15 named OpenElections county files. It verifies retained bytes, the transcription's signed-canvass parent, URLs, paths, commit, and election-date filename. The test verifies that the report remains reviewer-only, parses both seven- and ten-column OpenElections CSV variants, rejects malformed, duplicate, normalized-collision, and unsafe-integer rows, finds exact and non-exact matched rows, and preserves source-only findings. It does not alter state-legislative result construction.
