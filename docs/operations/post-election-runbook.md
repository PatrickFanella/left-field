# Post-election update runbook (2026 general)

The 2026 general election is on November 3, 2026. This runbook covers bringing the Priority Index from pre-election baselines to the post-election map. Most of the work happens after certification and swearing-in, in December and January, not on November 4.

Written 2026-10-20. Commands and file paths refer to this repository.

## What updates on its own

The weekly workflow (`.gitea/workflows/refresh.yml`, Mondays 09:17 UTC) retains the FEC candidate summary and master, the Congress roster (`legislators-current.json`), Open States legislator CSVs and executive files. It re-derives the derived artifacts, bumps the release and opens a pull request. Review the generated note under `docs/reviews/` before merging.

Picked up without code changes:

- **Senate**: new senators appear once `legislators-current.json` lists them. The builder requires exactly 100 senators. If a seat is vacant on refresh day, publish fails with `SENATE_V01_CLOSURE_INVALID`; rerun the next week or dispatch the workflow by hand.
- **Governors**: new governors appear once Open States lists the new role. On inauguration day, the role that ends on the snapshot date gives way to the one that starts.
- **State legislators**: Open States rosters replace holders as states seat their members.

## What does not update on its own

| Layer | Why | Action |
|---|---|---|
| State-legislative returns | Each source is a hand-written entry with its contest count | Add 2026 sources state by state (below) |
| House | v0.11 is frozen to the 119th Congress: it requires 218 Republicans and 430 seats, and sets `nextElectionYear` 2026 as a literal (`src/lib/house-priority-index.ts`) | Build a House model for the 120th Congress after January 3, 2027 |
| FEC cycle | Stays on 2026 until moved | `--cycle 2028` (or the workflow `cycle` input) together with the model changes for 2028. The open-seat signal in `house-incumbent-candidacy.ts` filters on `electionYear === 2026`. |
| Senate and governor summaries | `upIn2026` counts seats by `nextElectionYear` | Re-label for 2028 when the cycle moves |

## Timeline

1. **November 3–4: election night.** No action is required. The project waits for each state's certified canvass (decided 2026-11-03). If unofficial returns are retained for a state as an exception, mark the source `resultStatus: "unofficial"` (see `docs/data/rapid-intake.md`): every affected seat brief then says the baseline is unofficial, the methodology and sources pages name the state, the release descriptor lists it under `unofficialStates`, and the review note records it.
2. **November–December: certification.** States certify on their own schedules, from a few days to several weeks after the election. For each covered state, add the certified file as a new source with its contest count, then run `npm run rapid:state-returns -- --state XX` and `npm run rapid:publish -- --bump`. If the state had an unofficial source, remove that entry from the adapter and set `supersedes` on the certified one to its id (the build refuses both at once). The same publish settles that state's seats in `seat-outcome-ledger-v1`: holders who won or lost the general, and open seats held or flipped, by certified count. Before Open States seats the winners, a seat whose holder lost is carried as `roster_predates_contest`, not scored. That is expected until the roster catches up.
3. **December–January: swearing-in.** The weekly refresh picks up roster changes. Watch the `roster_predates_contest` count in the state-legislative summary fall toward zero. Every `rapid:publish` also rebuilds `seat-outcome-ledger-v1` (see `docs/data/outcome-ledger.md`): as rosters change, seats move from `unknown` to `roster_change` outcomes, and the review note's "2026 outcomes" line counts them. Check that a seat whose holder lost a certified primary is never later marked `incumbent_won`; the resolver's order forbids it, and the ledger test pins the four May losses.
4. **January 3, 2027: 120th Congress.** The Senate layer follows the next refresh. The House needs the new model before it reflects the new members.
5. **January 2027: governors take office** (most states). The governor layer follows the next refresh.

## Adding a 2026 state-legislative source

For each covered state:

1. Find the certified general-election file at the same publisher used for 2024.
2. Add a source entry with a new id, the HTTPS URL, path, `cycleYear: 2026` and `electionDate: "2026-11-03"`. Set `resultStatus: "unofficial"` if the state has not certified. If the entry replaces one already retained for the same returns, remove the old entry and set `supersedes` to its id.
3. Add its contest count to `expectedContests`. Check the count against the publisher's own summary page.
4. Run `npm run rapid:state-returns -- --state XX`, then `npm run rapid:publish -- --bump`.

Adapter notes:

- **West Virginia**: Senate seats are filed by their first retained cycle. A 2026 contest supersedes the 2022 contest for the same seat, so no parser change is needed.
- **Alaska**: the adapter dispatches on format. A `.csv` in the 2024 `ENRbyPrecinct.csv` layout parses as 2024 did. The 2026 URL is not yet published; confirm it on the Division of Elections site.
- **Vermont**: add a `YEARS` entry in `state-general/vermont.ts` with the year, election date and page count, then the per-page contest counts.
- **Clarity states (CO, IA, SC, WV)**: each election has a new Clarity election id in the URL.
- **PDF states (KS, KY, MO, OR)**: set `pdfLayoutExtract`. The layout of a new year's PDF may differ, so check the parse against the publisher's totals.
- **Arizona**: the Secretary of State publishes the canvass as a signed scan, and its sites block the VPN egress. Retain the scan (from the Internet Archive if the site still refuses), set `transcription`, and write `<pdf>-transcription.tsv` beside it in the 2024 layout. Check every total against the scan's county figures and against an independent county or precinct compilation; settle each disagreement from the scan and record it in `state-general/arizona.ts`.
- **Michigan, Nevada, Ohio**: the official hosts block the VPN egress, and the 2022 and 2024 files came from Internet Archive captures. For 2026, retain the certified file the same way once a capture taken after certification exists (or through the residential route), with the archive URL as the source URL. Michigan's House and Senate are both on the 2026 ballot; its results now come from `mvic.sos.state.mi.us`, which needs a new parser. Nevada's results pages give no party, so add that cycle's Legislative Counsel Bureau candidate list as a companion source; its 2022 list sits at a generic address that the Research Division reuses.
- **Florida**: the POST body carries `ElectionDate`.
- **Texas, Pennsylvania**: the adapters carry year-specific rules (a 2022 skip in Texas, a candidate override in Pennsylvania). Check that they still hold for 2026.
- Publishers that block the VPN egress need the residential route described in `docs/data/rapid-intake.md`. On 2026-11-04 that network namespace no longer existed on Kvant, and Kvant's own egress was refused too; NH, AZ, MI and Ohio's Republican primary files wait on it (see `docs/data/state-primaries-2026.md`).
- 2026 primaries for every office come from `state-primary-results-2026-v1`, one adapter per state under `src/rapid-acquisition/state-primary/`; the outcome ledger reads it on every publish.

## When a retained file changes

Results change after retention in three ways: a certified canvass replaces unofficial returns, an amended canvass or recount replaces a certified file, or a publisher silently re-issues a file at the same URL. The handling is the same for all three.

- A retained file is never overwritten. `rapid:state-returns` verifies a file on disk against the lock, and restores a missing file only from identical bytes; anything else fails `STATE_RETURNS_EXISTING_MISMATCH`.
- Retain the new file under a new source id, remove the old entry from the adapter, set `supersedes` on the new entry to the old id, and say why in `note`. The build refuses a replacement whose predecessor is still declared or was never pinned. The old bytes stay pinned in the lock, the state summary records the pair, and `rapid:publish` lists it in the review note under "Result status".
- The weekly refresh runs `npm run rapid:state-returns -- --probe`, which re-fetches every declared URL and reports `changed`, `unreachable`, `unpinned` or `unchanged` per source, writing nothing. The report is in the refresh pull request body. A `changed` row is the signal to go through the steps above; `unreachable` is expected for the publishers that refuse the runner's egress (AZ, MI, NV, OH). Run the probe by hand with `--state XX` to check one state.

## Coverage gaps that remain

These are not part of this update and stay uncovered after it: state legislatures in AL, LA, MS, NE, NH and OK, and the Michigan House (its 2024 results are only on `mvic.sos.state.mi.us`, which blocks the VPN egress; see the v1.15 release note); statewide executives other than governor; and local offices beyond the IN, NC and NM primary catalogs.
