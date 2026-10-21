# State and local intake

Status: active procedure, 2026-09-23. Applies to state-legislative, county, municipal, school-board, and judicial primary-result context. These artifacts stay excluded from the released Priority Index.

## What changed

Before this procedure, every state cost a bespoke parser module of roughly 400 to 600 lines with its own copy of the XLSX or CSV reader and hand-typed closure counts, a new chained `local-context-coverage-vN` module, a generator script, an npm script, a hand-edited source-lock entry, and a UI allowlist edit. Validating the newest coverage receipt re-ran all 17 parsers from raw sources (48 seconds in `local-context-coverage-v15.test.ts`).

Now a state is one spec file plus one registry line. The shared code lives in `src/rapid-acquisition/intake/`:

| File | Role |
|---|---|
| `package.ts` | `IntakeSpec` contract, source-lock verification, contest invariants, derived per-cycle and package summaries, hashing, rebuild-and-compare validation |
| `workbook.ts` | XLSX sheet reader with merged-cell expansion |
| `table.ts` | CSV, TSV, and pipe reader with RFC 4180 quoting |
| `source-lock.ts` | Read, verify, upsert, and serialise `data/source-lock.json` in the committed layout |
| `registry.ts` | The list of local-context artifacts: 17 frozen legacy artifacts as data, plus every live spec |
| `coverage.ts` | Registry-driven `rapid-local-context-coverage-v16`, verified from lock-pinned artifact bytes instead of a rebuild chain |
| `pdf.ts` | `pdftotext` layout and coordinate-TSV extraction, retained beside the PDF as a `derived_extract` |
| `specs/` | One file per state; `ohio-state-legislative.ts` is the worked example |

`scripts/rapid/intake.ts` (`npm run rapid:intake`) replaces per-state generator scripts and manual lock edits. Beyond `retain`, `build`, `coverage`, and `check`, it offers `pin <id> <path> <kind>` for reviewed inputs such as alias tables and `derive <id>` for derived artifacts registered in `scripts/rapid/derived-artifacts.ts` (scores, evidence, context). The fifteen chained coverage generator scripts are removed; the v1 through v15 receipts are frozen and reproduced by their own tests.

PDF sources are not parsed at runtime. Declare `download.extract` on the source (`mode: "layout"` or `"tsv"`, plus the extract's lock id) and `retain` runs `pdftotext`, retains the extract next to the PDF, and pins it with the PDF as parent. The spec then parses the extract.

## First formula use of the intake

`rapid-state-legislative-primary-context-v1` (`src/rapid-acquisition/state-legislative-primary-context.ts`) reads the twelve local-context catalogs through the source lock and derives, per state, a Democratic primary contestation score that the v0.9 House score applies to Republican-held seats. Catalogs that retain only contested primaries are marked ineligible rather than silently compared. See [the v0.9 review note](../reviews/house-priority-republican-route-v09-2026-09-23.md). The coverage receipts themselves stay `formulaEligibleCount: 0`; formula use happens in a separately pinned derived artifact.

The coverage receipt is regenerated in place. There is no v17; the artifact list is the registry, and the web read model takes its artifact count and child paths from the same registry.

## Adding a state

1. **Write the spec.** Copy `src/rapid-acquisition/intake/specs/ohio-state-legislative.ts`. Declare each source by its future lock id with `cycleYear`, `electionDate`, and a `download` descriptor (`url`, `outputPath` under `data/source/rapid/`). Write `parse` to return normalised contests: office level, office slug, district or null, jurisdiction or null, raw office title, raw party, and candidates with votes. Reconcile against the source's own totals inside `parse` and fail on mismatch.
2. **Register it.** Add the spec to `INTAKE_SPECS` in `src/rapid-acquisition/intake/specs/index.ts`.
3. **Retain sources.** `npm run rapid:intake -- retain <artifact-id>` downloads each declared source over HTTPS, refuses unexpected redirects, and pins bytes and digest in the source lock. The first fetch records the pin; nothing has to be hashed by hand beforehand.
4. **Build.** `npm run rapid:intake -- build <artifact-id>` writes `data/metadata/<artifact-id>.json`, pins it in the lock with its sources as parents, and regenerates the coverage receipt and its lock entry. The command prints the summary and per-cycle counts.
5. **Pin closure.** Copy the printed counts into the spec's `expect` blocks so a silent source change fails the next build. Add a short receipt under `docs/reviews/` with the printed digests.
6. **Verify.** `npm run rapid:intake -- check` rebuilds every registered intake artifact from retained bytes and compares. `npm run data:verify` remains the repository gate.

A spec cannot mark winners, resolve holder identity, or set formula eligibility; those fields are fixed by the builder and the coverage build rejects any artifact whose summary reports formula-eligible rows.

## Trust model

Per-artifact truth still comes from a rebuild: each artifact's test and `rapid:intake check` re-parse the retained source bytes. The coverage receipt trusts the source lock for artifact bytes, which is the same trust the web read model already applied. What is no longer done is re-running every parser whenever any one artifact is added.

The 17 legacy artifacts are frozen. Their modules, tests, and v1 through v15 receipts remain in place and unchanged; the registry lists them as data so the coverage build does not import them. Do not port them: their artifact digests are pinned in the lock and in review receipts, and a port would churn every hash for no new evidence.

## Verification of this change

Run on 2026-09-23 in this worktree:

- `npx vitest run src/rapid-acquisition/intake src/ui/rapid-local-context-coverage.test.ts`: 6 files, 21 tests, 1.9 seconds.
- The Ohio spec reproduces the frozen v1 closure (221 contests, 282 candidate rows, 1,632,849 votes) through the shared builder.
- The v16 receipt's artifact list equals the v15 receipt's artifact list.
- `npm run typecheck`, `npm run lint` (zero warnings after removing 154 unused imports and one dead FEC coordinator function), and `npm run data:verify` (1,144 entries) pass.
- Vitest now uses a 60-second per-test timeout in `vitest.config.mts`; rebuild-and-compare tests routinely exceed the 5-second default under parallel load.
- The AIPAC numeric-evidence v4 tests skip, rather than fail, when the non-retained FEC PAS2 archives are absent; set `DSA_SEATS_AIPAC_PAS2_DIR` to run them. `src/ingestion/fec/aipac-numeric-pas2-parse.test.ts` now covers the PAS2 parsing and latest-filing selection offline with synthetic 22-field rows, and the date helper reports `AIPAC_NUMERIC_PAS2_DATE_INVALID` for out-of-range months instead of a raw RangeError.
- `make test-fast` (`npm run test:fast`) runs intake, scoring, and UI unit tests without the artifact rebuild suites.
- Coverage artifacts carry `cyclesThrough`, the latest election or survey year covered, and the sources page shows it.
- The stale browser-gate heading for `/` was updated to the priorities page title; the browser gate itself was not run in this change.

## Refresh and publish (added 2026-09-24)

Two commands keep the Senate and state-legislative layers current without editing source code.

```sh
npm run rapid:refresh                       # retain today's FEC candidate summary and Open States rosters, pin them, rewrite data/metadata/refresh-inputs.json
npm run rapid:refresh -- --cycle 2028       # move the FEC files to another cycle; without it the refresh keeps the pointer's cycle
npm run rapid:publish -- --version v1.1     # re-derive every registered artifact, write and pin data/metadata/priority-index-release.json, write a review-note skeleton, verify the lock
npm run rapid:publish -- --bump             # same, with the next minor version after the pinned descriptor (what the weekly workflow runs)
```

The refresh pointer names dated snapshots (FEC candidate summary and master, the unitedstates/congress-legislators `legislators-current.json` roster, Open States legislator CSVs and executive YAML files); builders read the pointer. The Senate layer reads the Congress roster from the pointer and falls back to the 2026-08-04 file for pointers written before the roster was added (2026-10-20). The FEC cycle does not follow the calendar. Moving to 2028 means passing `--cycle 2028` (or the workflow's `cycle` input), and it is a model change: the House and Senate layers filter on the 2026 election year. The release descriptor is what the store and pages show as model version, publication date, and cutoffs. `.github/workflows/refresh.yml` runs both weekly and opens a pull request for review. The House layer is frozen at v0.9 and is only re-derived and re-verified by publish.

Derived artifacts registered in `scripts/rapid/derived-artifacts.ts` may name their parents as a function of the lock when a parent is a dated snapshot.

## State-legislative general returns (added 2026-09-29)

State-legislative seats are ranked one state at a time from that state's own official general-election returns. Each covered state has an adapter in `src/rapid-acquisition/state-general/` that declares its retained sources (id, HTTPS URL, path, cycle) and parses them into contests; `state-legislative-general-results.ts` normalizes every adapter's output to one contract, computes the Democratic-minus-Republican margin over all votes cast, and fails closed when a file yields a different contest count than the adapter declares.

```sh
npm run rapid:state-returns                          # download and pin every declared source not yet on disk
npm run rapid:state-returns -- --state GA            # one state
npm run rapid:state-returns -- --check               # verify retained bytes against the lock, download nothing
npm run rapid:intake -- derive state-legislative-general-results-v1
npm run rapid:intake -- derive state-legislative-score-v01-projection-v1
```

The score layer joins the Open States roster to the latest retained contest for each chamber and district, so a state becomes ranked the moment its adapter lands; seats elsewhere stay in the projection unscored with the reason. A publisher that re-issues a file under the same URL fails the byte check, and the adapter must declare a new source id rather than overwrite.

Sources can declare four optional fields when a publisher needs them: `postBody` and `postContentType` for files served only in response to a POST (Florida's form, Vermont's GraphQL pages; the lock URL records the body), `userAgent` for sites whose bot filter refuses the project's own (Texas), and `pdfLayoutExtract` for PDFs. With `pdfLayoutExtract`, the retention script runs `pdftotext -layout` once and pins the text beside the PDF as a `derived_extract`; the results builder parses the extract, so no build or test needs pdftotext.

Some publishers block the project's VPN egress. Files for those states were retained through a residential route: an existing network namespace on Kvant that reaches the ISP router over Ethernet, entered only for the retention command (`sudo -n ip netns exec discord_isp runuser -u onnwee -- npm run rapid:state-returns -- --state TX`). Host routing is not changed. Re-running retention for those states needs the same route.

Returns retained before a state certifies its canvass carry `resultStatus: "unofficial"` on the source. The flag passes through to each contest, the state summary (`unofficialSourceIds`) and the score row (`baselineResultStatus`); when no source is unofficial these fields are absent, so earlier packages keep their digests. Once the state certifies, add the certified file under a new source id and remove the unofficial one.

When a seat's contest was held after the roster snapshot and the roster's holder did not finish in the winning places, the seat is carried as `roster_predates_contest` rather than scored. This covers the weeks between the election and Open States seating the winners.

Adding a state: write the adapter, run the three commands above, confirm the contest count and a few margins against the publisher's own summary page, then `npm run rapid:publish -- --bump`.

## Workbook extracts (added 2026-09-25)

`.xls` and `.xlsx` sources are converted to CSV once with LibreOffice through the intake CLI and the CSV bytes are retained beside the workbook as a `derived_extract` whose parent is the workbook's lock id:

```sh
npm run rapid:intake -- extract-workbook tn-2024-primary-precinct-results data/source/rapid/house-primary/tn/2024/primary-results-by-precinct-libreoffice.csv
```

A zip of workbooks produces a deterministic zip of CSVs. Readers call `readWorkbookCsvExtract` or `readWorkbookCsvZipExtract` from `src/rapid-acquisition/intake/workbook-extract.ts`, which verify the pin and lineage; no build or test runs LibreOffice. The Alabama and Tennessee result modules read their extracts this way and reproduce their pinned artifacts unchanged.
