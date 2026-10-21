# Post-election update runbook (2026 general)

The 2026 general election is on November 3, 2026. This runbook covers bringing the Priority Index from pre-election baselines to the post-election map. Most of the work happens after certification and swearing-in, in December and January, not on November 4.

Written 2026-10-20. Commands and file paths refer to this repository.

## What updates on its own

The weekly workflow (`.github/workflows/refresh.yml`, Mondays 09:17 UTC) retains the FEC candidate summary and master, the Congress roster (`legislators-current.json`), Open States legislator CSVs and executive files. It re-derives the derived artifacts, bumps the release and opens a pull request. Review the generated note under `docs/reviews/` before merging.

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

1. **November 3–4: election night.** No action is required. If unofficial returns are retained for a state, mark the source `resultStatus: "unofficial"` (see `docs/data/rapid-intake.md`).
2. **November–December: certification.** States certify on their own schedules, from a few days to several weeks after the election. For each covered state, add the certified file as a new source with its contest count, then run `npm run rapid:state-returns -- --state XX` and `npm run rapid:publish -- --bump`. Before Open States seats the winners, a seat whose holder lost is carried as `roster_predates_contest`, not scored. That is expected until the roster catches up.
3. **December–January: swearing-in.** The weekly refresh picks up roster changes. Watch the `roster_predates_contest` count in the state-legislative summary fall toward zero.
4. **January 3, 2027: 120th Congress.** The Senate layer follows the next refresh. The House needs the new model before it reflects the new members.
5. **January 2027: governors take office** (most states). The governor layer follows the next refresh.

## Adding a 2026 state-legislative source

For each covered state:

1. Find the certified general-election file at the same publisher used for 2024.
2. Add a source entry with a new id, the HTTPS URL, path, `cycleYear: 2026` and `electionDate: "2026-11-03"`. Set `resultStatus: "unofficial"` if the state has not certified.
3. Add its contest count to `expectedContests`. Check the count against the publisher's own summary page.
4. Run `npm run rapid:state-returns -- --state XX`, then `npm run rapid:publish -- --bump`.

Adapter notes:

- **West Virginia**: Senate seats are filed by their first retained cycle. A 2026 contest supersedes the 2022 contest for the same seat, so no parser change is needed.
- **Alaska**: the adapter dispatches on format. A `.csv` in the 2024 `ENRbyPrecinct.csv` layout parses as 2024 did. The 2026 URL is not yet published; confirm it on the Division of Elections site.
- **Vermont**: add a `YEARS` entry in `state-general/vermont.ts` with the year, election date and page count, then the per-page contest counts.
- **Clarity states (CO, IA, SC, WV)**: each election has a new Clarity election id in the URL.
- **PDF states (KS, KY, MO, OR)**: set `pdfLayoutExtract`. The layout of a new year's PDF may differ, so check the parse against the publisher's totals.
- **Florida**: the POST body carries `ElectionDate`.
- **Texas, Pennsylvania**: the adapters carry year-specific rules (a 2022 skip in Texas, a candidate override in Pennsylvania). Check that they still hold for 2026.
- Publishers that block the VPN egress need the residential route described in `docs/data/rapid-intake.md`.

## Coverage gaps that remain

These are not part of this update and stay uncovered after it: state legislatures in AL, AZ, LA, MI, MN, MS, NE, NH, NM, NV, ND, OH, OK and SD; statewide executives other than governor; and local offices beyond the IN, NC and NM primary catalogs.
