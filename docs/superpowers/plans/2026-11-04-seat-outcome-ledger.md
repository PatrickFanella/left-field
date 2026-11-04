# Seat Outcome Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the pre-election Priority Index once, then publish a weekly-rebuilt ledger that joins every scored seat to its 2026 outcome with graded evidence, and show it on the site.

**Architecture:** Two artifacts in the rapid layer. `priority-index-pre-election-2026-v1` is built once from the four v1.17 projections and pinned, never rebuilt. `seat-outcome-ledger-v1` is a registered derived artifact that joins the frozen rows to evidence readers (FEC candidacy, 2026 primary artifacts, current rosters) through one pure resolver, and writes a comparison block. A read model in `src/lib` feeds a new `/outcomes` page and one line on each brief page.

**Tech Stack:** TypeScript, vitest, Next.js app router (server components), the existing source-lock and derived-artifact registry.

**Spec:** `docs/superpowers/specs/2026-11-04-seat-outcome-ledger-design.md`

## Global Constraints

- No winner inference: an outcome is set only by a source-marked winner, a certified count with the holder inside or outside the `seats` winning places, or a roster change. Unofficial counts give `pending`.
- Missing evidence is `unknown`; never a default.
- Every row with evidence carries `evidenceSourceIds` (lock ids) and `observedAt` (the refresh snapshot date).
- The frozen snapshot's digest must not change on any later build; its test reproduces it from parents.
- Artifact serialization is `${JSON.stringify(value, null, 2)}\n`; row and package hashes use `hash(tag, unsigned)` from `src/rapid-acquisition/shared.ts` like every other artifact.
- Public copy: no "won"/"lost" without the evidence grade beside it; unknown counts shown first.

## Review Focus

- A state-legislative seat in a multi-member district whose holder changes: `seatId` can move to another holder. Test in Task 6: successor detection keys on holder ids within the district, not on `seatId` alone.
- A holder whose roster name differs from the ballot name (nickname, suffix, "LAST, First" order): the match must not pair the holder with a different candidate who shares the family name. Test in Task 3: two candidates sharing a family name yield no match.
- A primary whose source marks the holder as winner but whose count is unofficial: outcome follows the mark (`primary_source_marked_winner`), not the count status. Test in Task 5.
- A seat with `nextElectionYear !== 2026` that nevertheless has a 2026 primary row (a special or a mislabelled source): `not_up_in_2026` wins. Test in Task 5.
- The ledger built before any general result exists: every `up_in_2026` row without primary evidence is `unknown`, the comparison sums equal the row counts, and the page renders. Test in Tasks 7 and 9.

---

### Task 1: Holder-to-candidate name match helper

**Files:**
- Create: `src/rapid-acquisition/holder-name-match.ts`
- Test: `src/rapid-acquisition/holder-name-match.test.ts`
- Modify: `src/rapid-acquisition/state-legislative-roster.ts:197-198` (call the helper; behaviour unchanged)

**Interfaces:**
- Produces: `normalizeName(value: string): string` (lowercase, NFKD-stripped, letters and spaces only, collapsed); `holderMatches(holder: { familyName: string; givenName: string }, candidateName: string): boolean` (true when every family token is in the candidate's tokens and the given name's first token is absent, equals the candidate's first token, or is among the tokens; a `LAST, First` candidate name is reordered first; a trailing `(I)` or `*` is stripped); `uniqueHolderMatch<T extends { name: string }>(holder, candidates: readonly T[]): T | null` (exactly one match or null).

- [ ] **Step 1: Write the failing tests**

```ts
it("matches the roster rule across name orders and markers", () => {
  expect(holderMatches({ familyName: "Case", givenName: "Ed" }, "CASE, Ed")).toBe(true);
  expect(holderMatches({ familyName: "Cameron", givenName: "Mike" }, "Mike Cameron (I)")).toBe(true);
  expect(holderMatches({ familyName: "Clyburn", givenName: "James" }, "James E Jim Clyburn")).toBe(true);
  expect(holderMatches({ familyName: "Cohen", givenName: "Steve" }, "Justin J. Pearson")).toBe(false);
});
it("refuses an ambiguous family name", () => {
  const candidates = [{ name: "Ann Jones" }, { name: "Robert Jones" }];
  expect(uniqueHolderMatch({ familyName: "Jones", givenName: "" }, candidates)).toBeNull();
  expect(uniqueHolderMatch({ familyName: "Jones", givenName: "Ann" }, candidates)?.name).toBe("Ann Jones");
});
```

- [ ] **Step 2: Run `npx vitest run src/rapid-acquisition/holder-name-match.test.ts`** — expected: FAIL, module not found.
- [ ] **Step 3: Implement the three exports.** Reorder `LAST, First` by splitting on the first comma; strip `(I)` and `*` before normalizing.
- [ ] **Step 4: Run the test** — expected: PASS.
- [ ] **Step 5: Replace the inline rule in `state-legislative-roster.ts:197-198` with `holderMatches`, run `npx vitest run src/rapid-acquisition/state-legislative-roster.test.ts`** — expected: PASS including "matches the pinned artifact".
- [ ] **Step 6: Commit** `feat: extract the holder-to-candidate name match`.

### Task 2: Frozen pre-election snapshot

**Files:**
- Create: `src/rapid-acquisition/pre-election-snapshot-2026.ts`, `scripts/rapid/freeze-pre-election-snapshot.ts`
- Test: `src/rapid-acquisition/pre-election-snapshot-2026.test.ts`

**Interfaces:**
- Consumes: `FilesystemPriorityIndexRepository.getBriefs()` (ranked briefs, scored seats), `readStateLegislativeScoreV01Projection(root, lock)` (all 7,336 rows), `readPriorityIndexRelease(root, lock)`.
- Produces: `PRE_ELECTION_SNAPSHOT_2026 = { id: "priority-index-pre-election-2026-v1", path: "data/metadata/priority-index-pre-election-2026-v1.json", url: "urn:dsa-seats:priority-index-pre-election-2026:v1", parentIds: [house v11, senate v01, governor v01, state-legislative v01 ids, "priority-index-release-v1"] }`; `PreElectionSeatRow = { chamber: "house"|"senate"|"governor"|"state_house"|"state_senate"; seatId; seatLabel; stateCode; holderName; holderId; holderParty: "Democratic"|"Republican"|"Independent"|"Other"; scoreStatus: "scored"|StateLegislativeScoreStatus; route: PriorityRoute|null; score: number|null; rank: number|null; chamberRank: number|null; nextElectionYear: number|null; openSeatSignal: string|null; rowSha256 }`; `PreElectionSnapshot2026 = { schema: "priority-index-pre-election-2026-v1"; version: 1; modelVersion; publishedAt; rows; summary: { seats: 7916; scored: 7403; byChamber: Record<chamber, { seats; scored }> }; rowSetSha256; packageSha256 }`; `buildPreElectionSnapshot2026(root, lock)`, `readPreElectionSnapshot2026(root, lock)`.

- [ ] **Step 1: Write the failing test**

```ts
it("freezes every seat of the v1.17 release with its rank", () => {
  const value = buildPreElectionSnapshot2026();
  expect(value.modelVersion).toBe("v1.17");
  expect(value.summary).toEqual({ seats: 7916, scored: 7403, byChamber: { house: { seats: 430, scored: 430 }, senate: { seats: 100, scored: 100 }, governor: { seats: 50, scored: 50 }, state_house: expect.any(Object), state_senate: expect.any(Object) } });
  const top = value.rows.find((row) => row.rank === 1)!;
  expect(top.score).toBe(Math.max(...value.rows.map((row) => row.score ?? -1)));
  expect(value.rows.filter((row) => row.scoreStatus !== "scored").every((row) => row.score === null && row.rank === null)).toBe(true);
  expect(value.rows.filter((row) => row.chamber === "house").every((row) => /^[A-Z]\d{6}$/.test(row.holderId))).toBe(true);
});
it("matches the pinned artifact", () => { expect(readPreElectionSnapshot2026().packageSha256).toBe(buildPreElectionSnapshot2026().packageSha256); });
```

- [ ] **Step 2: Run it** — expected: FAIL, module not found.
- [ ] **Step 3: Implement the builder.** Rows from `getBriefs()` carry `rank`; `chamberRank` is the 1-based position within the chamber in rank order; unscored state-legislative rows come from the projection with their `status`. Sort rows by `chamber` then `seatId` with `byteCompare`. Fail `PRE_ELECTION_MODEL_VERSION:<v>` unless the release is v1.17.
- [ ] **Step 4: Write `scripts/rapid/freeze-pre-election-snapshot.ts`:** build, write the file, `upsertSourceLockEntry(derivedArtifactEntry({ ..., kind: "derived_artifact", parentIds }))`, `writeSourceLock`; refuse to run if the lock already has the id (`PRE_ELECTION_ALREADY_FROZEN`). Add `"rapid:freeze-pre-election": "tsx scripts/rapid/freeze-pre-election-snapshot.ts"` to package.json. Run it once.
- [ ] **Step 5: Run the test and `npm run data:verify`** — expected: PASS; one new lock entry.
- [ ] **Step 6: Commit** `feat: freeze the pre-election 2026 priority index` (include the artifact and lock).

### Task 3: Primary-outcome evidence readers

**Files:**
- Create: `src/rapid-acquisition/seat-outcome-evidence.ts`
- Test: `src/rapid-acquisition/seat-outcome-evidence.test.ts`

**Interfaces:**
- Produces: `PrimaryEvidence = { contestId: string; sourceIds: readonly string[]; party: "Democratic"|"Republican"; electionDate: string; seats: number; candidates: readonly { name: string; votes: number }[]; sourceMarkedWinners: readonly string[] | null; countStatus: "certified"|"unofficial" }`; `readHousePrimaryEvidence2026(root, lock): ReadonlyMap<string /* districtLabel */, readonly PrimaryEvidence[]>` reading the five pinned artifacts `rapid-house-primary-{hawaii-results-2026-v1,indiana-results-v2,mississippi-results-v3,south-carolina-results-v3,tennessee-results-v2}` through `readPinnedPackage`; `readStateLegislativePrimaryEvidence2026(root, lock): ReadonlyMap<string /* `${state}|${chamber}|${districtKey}` */, readonly PrimaryEvidence[]>` reading the GA, OH, KY and NC catalogs named in `rapid-state-legislative-primary-context-v1`'s `stateContext[].sourceArtifactId`; `countStatusOf(certificationStatus: string | null | undefined, resultAuthorityStatus: string): "certified"|"unofficial"` with the allowlist `settings_certified_true_no_separate_certificate`, `official_results_flag_retained_no_separate_signed_certificate`, `official_canvass_workbook_separate_certificate_not_retained` → certified; everything else unofficial.

- [ ] **Step 1: Write the failing tests**

```ts
it("grades counts fail-closed", () => {
  expect(countStatusOf("settings_certified_true_no_separate_certificate", "x")).toBe("certified");
  expect(countStatusOf("final_unofficial_no_separate_certification_instrument_retained", "x")).toBe("unofficial");
  expect(countStatusOf(undefined, "official_statewide_democratic_recap_pdf_retained_no_separate_certification_instrument")).toBe("unofficial");
});
it("reads the 2026 House primaries with their winner marks", () => {
  const value = readHousePrimaryEvidence2026();
  expect([...value.keys()].sort()).toEqual(["HI-01", "HI-02", "IN-01", "IN-07", "MS-02", "SC-06", "TN-09"]);
  expect(value.get("IN-01")![0]).toMatchObject({ party: "Democratic", sourceMarkedWinners: ["Frank J. Mrvan"], countStatus: "certified", seats: 1 });
  expect(value.get("SC-06")![0]!.sourceMarkedWinners).toEqual(["James E Jim Clyburn"]);
  expect(value.get("TN-09")![0]).toMatchObject({ sourceMarkedWinners: null, countStatus: "unofficial" });
});
it("reads the 2026 state-legislative primaries by district", () => {
  const value = readStateLegislativePrimaryEvidence2026();
  expect(value.get("GA|lower|1")![0]).toMatchObject({ party: "Republican", countStatus: "certified" });
  expect(value.get("GA|lower|1")![0]!.candidates.map((c) => c.name)).toContain("Mike Cameron (I)");
  expect([...value.keys()].every((key) => /^(GA|OH|KY|NC)\|/.test(key))).toBe(true);
});
```

- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.** House rows: `sourceWinnerNames ?? (sourceWinnerCandidateName ? [it] : null)` when `sourceWinnerStatus === "marked_by_source"`, else null; party from `rawParty` (`D`/`Democrat`/absent → Democratic since every pinned 2026 House artifact is a Democratic target file). State-legislative: `districtKey` from `state-legislative-roster.ts`; OH `districtCode` and `state_house` map to `district`/`lower`; party from `rawParty` (`R`/`REP` → Republican, `D`/`DEM` → Democratic). `seats` is 1.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** `feat: read 2026 primary evidence for the outcome ledger`.

### Task 4: Candidacy and roster-successor evidence readers

**Files:**
- Modify: `src/rapid-acquisition/seat-outcome-evidence.ts`
- Test: `src/rapid-acquisition/seat-outcome-evidence.test.ts`

**Interfaces:**
- Produces: `HolderCandidacy = { status: "filed_for_seat"|"filed_for_other_office"|"not_observed"|"not_applicable"; sourceIds: readonly string[] }`; `readHouseCandidacyEvidence(root, lock): ReadonlyMap<string /* seatCycleId */, HolderCandidacy>` from `house-incumbent-candidacy-v1` (`openSeatSignal !== null` → `filed_for_other_office`; else `houseStatutoryCandidate2026` → `filed_for_seat`; else `not_observed`); `Successor = { holderId: string; holderName: string; party: "Democratic"|"Republican"|"Independent"|"Other"; sourceId: string }`; `readSuccessors(root, lock, snapshot: PreElectionSnapshot2026): ReadonlyMap<string /* seatId */, Successor | null>` — null when the seat's current holder set still contains the frozen holderId. House and Senate from the Congress roster named by `readRefreshInputs(root, lock).congressLegislatorsId ?? CONGRESS_LEGISLATORS_BASELINE_ID` (`type: "rep"` by state+district, `type: "sen"` by state+class, party from the last term); governors from the pinned governor projection by `stateCode`; state-legislative seats from the pinned `state-legislative-roster-v1` rows grouped by `stateCode|chamber|districtKey`.

- [ ] **Step 1: Write the failing tests**

```ts
it("reads House candidacy", () => {
  const value = readHouseCandidacyEvidence();
  expect(value.size).toBe(430);
  expect([...value.values()].filter((row) => row.status === "filed_for_other_office")).toHaveLength(16);
  expect([...value.values()].filter((row) => row.status === "not_observed")).toHaveLength(3);
});
it("finds no successor while the rosters predate seating", () => {
  const snapshot = readPreElectionSnapshot2026();
  const value = readSuccessors(process.cwd(), readSourceLock(), snapshot);
  expect(value.size).toBe(snapshot.rows.length);
  expect([...value.values()].filter((row) => row !== null).length).toBeLessThan(40);
});
it("reports a successor when the frozen holder leaves a multi-member district", () => {
  // fixture: a snapshot with two VT holders in one district and a roster where one is replaced
  ...expect(result.get(replacedSeatId)).toMatchObject({ party: "Democratic" }); expect(result.get(keptSeatId)).toBeNull();
});
```
The third test builds the maps with an injected roster: give `readSuccessors` an optional fourth argument `rosters?: { congress?: Legislator[]; governors?: GovernorScoreV01Row[]; stateLegislative?: StateLegislativeRosterRow[] }` that bypasses the reads.

- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.** The "fewer than 40" bound documents that the 2026-11-03 rosters already differ from the 2026-08-04 House roster by resignations and specials; those rows get a successor with the roster's `sourceId` and will resolve by `roster_change` in Task 5 only when `stage === up_in_2026` and the general is otherwise unknown — see the resolver.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** `feat: read candidacy and roster successors for the outcome ledger`.

### Task 5: Outcome resolver

**Files:**
- Create: `src/rapid-acquisition/seat-outcome-resolver.ts`
- Test: `src/rapid-acquisition/seat-outcome-resolver.test.ts`

**Interfaces:**
- Consumes: Task 3/4 types, `holderMatches`/`uniqueHolderMatch` (Task 1).
- Produces: `Outcome = "not_up_in_2026"|"incumbent_ran_for_other_office"|"incumbent_did_not_run"|"incumbent_lost_primary"|"incumbent_lost_general"|"incumbent_won"|"open_seat_held"|"open_seat_flipped"|"unknown"`; `EvidenceGrade = "fec_filing"|"primary_source_marked_winner"|"primary_vote_order_certified"|"general_source_marked_winner"|"general_vote_order_certified"|"roster_change"|"none"`; `ContestStatus = "won"|"lost"|"pending"|"unknown"|"not_applicable"`; `Resolution = { stage; candidacy: HolderCandidacy["status"]; primary: { status: ContestStatus; contestId: string|null; countStatus: "certified"|"unofficial"|null; evidence: EvidenceGrade }; general: { status: ContestStatus; contestId: string|null; countStatus; evidence: EvidenceGrade }; successorParty: string|null; outcome: Outcome; evidence: EvidenceGrade; evidenceSourceIds: readonly string[] }`; `resolveOutcome(input: { row: PreElectionSeatRow; holder: { familyName: string; givenName: string }; candidacy: HolderCandidacy|null; primaries: readonly PrimaryEvidence[]; generals: readonly GeneralEvidence[]; successor: Successor|null }): Resolution` where `GeneralEvidence` has the same shape as `PrimaryEvidence` (empty until general adapters exist).

Rules, in order (the spec's resolution order): stage; candidacy `filed_for_other_office` → `incumbent_ran_for_other_office` (`fec_filing`); primary for the holder's party: holder matched → marked winner other than holder or certified count with holder outside the top `seats` → `lost` (grade by which); marked holder or certified count inside → `won`; unofficial and not marked → `pending`; holder unmatched in a primary of the holder's party → `candidacy = not_on_primary_ballot`, primary `not_applicable`; general likewise with `general_*` grades, and for a holder who did not run, winner party vs holder party → `open_seat_held`/`open_seat_flipped`; successor with no general evidence and `up_in_2026` → `roster_change`: successor id equals holder → `incumbent_won`; otherwise `incumbent_lost_general` when the holder was on the general ballot (`general.status !== "not_applicable"`) else `open_seat_*` by party, and `incumbent_did_not_run` when `candidacy` is `not_on_primary_ballot`. A `lost` primary ends resolution at `incumbent_lost_primary`.

- [ ] **Step 1: Write the failing tests** — one `it` per: not up; filed for Senate; lost primary by mark; lost primary by certified vote order; won primary, unknown general; marked winner with unofficial count → `won` (grade `primary_source_marked_winner`); unofficial unmarked → `pending`/`unknown`; not on primary ballot; a 2026 primary row on a `nextElectionYear: 2028` seat → `not_up_in_2026`; successor same party with no general → `open_seat_held` via `roster_change` when candidacy was `not_on_primary_ballot`; successor equals holder → `incumbent_won`; empty evidence → `unknown` with grade `none`.
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement `resolveOutcome`.** Pure; no I/O.
- [ ] **Step 4: Run** — expected: PASS.
- [ ] **Step 5: Commit** `feat: resolve seat outcomes from graded evidence`.

### Task 6: Ledger artifact and registry entry

**Files:**
- Create: `src/rapid-acquisition/seat-outcome-ledger.ts`
- Modify: `scripts/rapid/derived-artifacts.ts` (append entry after `STATE_LEGISLATIVE_SCORE_V01`), `scripts/rapid/publish.ts:78` (review note: a "2026 outcomes" line from the ledger summary)
- Test: `src/rapid-acquisition/seat-outcome-ledger.test.ts`

**Interfaces:**
- Produces: `SEAT_OUTCOME_LEDGER = { id: "seat-outcome-ledger-v1", path: "data/metadata/seat-outcome-ledger-v1.json", url: "urn:dsa-seats:seat-outcome-ledger:v1", parentIds: (root, lock) => [snapshot id, house-incumbent-candidacy-v1, the five House primary artifact ids, the four state-legislative catalog ids, "state-legislative-roster-v1", governor v01 id, congressLegislatorsId ?? baseline] }`; `SeatOutcomeRow = PreElectionSeatRow fields (minus rowSha256) & Resolution & { observedAt: string; rowSha256 }`; `SeatOutcomeLedger = { schema: "seat-outcome-ledger-v1"; version: 1; snapshotId; observedAt; methodology: { winnerInference: false; resolutionOrder: ["stage","candidacy","primary","general","roster_change"]; certifiedCountStatuses: [...allowlist] }; rows; summary: { seats; upIn2026; byOutcome: Record<Outcome, number>; byChamber: Record<chamber, Record<Outcome, number>> }; comparison: { bands: ["70+", "50-69.9", "<50"]; byChamberRoute: { chamber; route; band; counts: Record<Outcome, number> }[]; byRankQuartile: { quartile: 1|2|3|4; counts: Record<Outcome, number> }[] }; rowSetSha256; packageSha256 }`; `buildSeatOutcomeLedger(root, lock)`, `readSeatOutcomeLedger(root, lock)`.
- Holder name parts: House and Senate from the Congress roster (`name.last`, `name.first`) by bioguide, baseline roster first then current; governors and state legislators from the pinned roster/projection rows (`familyName`/`givenName`; governors split `governorName` on the last space).

- [ ] **Step 1: Write the failing tests**

```ts
it("joins every frozen seat to its evidence", () => {
  const value = buildSeatOutcomeLedger();
  expect(value.rows).toHaveLength(7916);
  expect(value.summary.byOutcome.not_up_in_2026).toBe(7916 - value.summary.upIn2026);
  expect(Object.values(value.summary.byOutcome).reduce((a, b) => a + b, 0)).toBe(7916);
  expect(value.rows.find((row) => row.seatLabel === "IN-01")).toMatchObject({ primary: { status: "won", evidence: "primary_source_marked_winner" }, outcome: "unknown" });
  expect(value.rows.find((row) => row.seatLabel === "TN-09")).toMatchObject({ candidacy: "not_on_primary_ballot", outcome: "unknown" });
  expect(value.rows.filter((row) => row.outcome === "incumbent_ran_for_other_office")).toHaveLength(16);
  const sumBands = value.comparison.byChamberRoute.reduce((sum, cell) => sum + Object.values(cell.counts).reduce((a, b) => a + b, 0), 0);
  expect(sumBands).toBe(value.rows.filter((row) => row.score !== null).length);
});
it("matches the pinned artifact", ...);
```

- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement the builder and register it;** `npm run rapid:intake -- derive seat-outcome-ledger-v1` to pin. Add the publish note line: `2026 outcomes: ${upIn2026} seats up; ${byOutcome.unknown} unknown; ${lost primary count} lost a primary; ...`.
- [ ] **Step 4: Run the test, `npm run data:verify`, `npx vitest run src/rapid-acquisition/state-legislative-roster.test.ts`** — expected: PASS.
- [ ] **Step 5: Commit** `feat: build and pin the seat outcome ledger`.

### Task 7: Read model for the site

**Files:**
- Create: `src/lib/outcome-ledger-view.ts`
- Test: `src/lib/outcome-ledger-view.test.ts`

**Interfaces:**
- Produces: `loadOutcomeLedger(): SeatOutcomeLedger` (cached); `outcomeLabel(outcome: Outcome): string` (copy: "Not on the 2026 ballot", "Ran for another office", "Did not run", "Lost the primary", "Lost the general", "Won", "Open seat held by the same party", "Open seat changed party", "No retained evidence yet"); `evidenceLabel(grade: EvidenceGrade): string`; `outcomeFor(seatId: string): SeatOutcomeRow | undefined`; `filterOutcomeRows(rows, { chamber, route, outcome, state, query }): SeatOutcomeRow[]` (up_in_2026 only, sorted by rank then seatId); `coverageTable(ledger): { chamber; seats; scored; unscored: { reason; count }[] }[]`.

- [ ] **Step 1: Write the failing tests** for each label (every enum value has copy and none is empty), for `filterOutcomeRows` on a three-row fixture (chamber and outcome filters, rank order, up-in-2026 only), and for `coverageTable` on the pinned ledger (`state_house` unscored reasons sum to the summary).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat: outcome ledger read model`.

### Task 8: `/outcomes` page and brief line

**Files:**
- Create: `src/app/outcomes/page.tsx`
- Modify: `src/app/priorities/[id]/page.tsx:71` (after `districtSummary`: one `<p className="outcome-line">` with the stage, outcome label, evidence label and `observedAt`, or "No retained 2026 evidence yet for this seat."), `src/app/methodology/page.tsx` (new section "2026 outcomes" describing grades and resolution order), `src/app/sources/page.tsx` (list `seat-outcome-ledger-v1` and `priority-index-pre-election-2026-v1` with digests), `src/lib/seo.ts` or the sitemap if routes are enumerated there, `src/components/presentational.tsx` if a status chip helper is needed
- Test: `src/app/outcomes/page.test.tsx` (render with `InMemory` ledger fixture where every outcome occurs; assert unknown count renders first and each row links to `/priorities/<seatId>`), extend `tests/e2e/nationwide-mvp.spec.ts` route list with `["/outcomes", "How the index did in 2026"]`

Page structure: heading "How the index did in 2026"; intro naming `observedAt` and the frozen release; coverage table; summary by chamber with `unknown` first; comparison bands table per chamber and route; filters (chamber, route, outcome, state, q) mirroring `/priorities`; paginated list with rank, seat, holder, party, route, pre-election score, outcome chip, evidence. Filters are GET params; no client JS.

- [ ] **Step 1: Write the failing page test** (vitest + `@testing-library/react` or the project's existing page-test pattern; check `src/app/**/*.test.tsx` for one and mirror it).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement the page, the brief line, the methodology section, the sources entries.** **Step 4: `npm run typecheck && npm run lint && npx vitest run src/app src/lib`** — PASS. **Step 5: Commit** `feat: publish the 2026 outcomes page`.

### Task 9: Docs and runbook

**Files:**
- Create: `docs/data/outcome-ledger.md` (what the two artifacts are, the resolution order, the certified-count allowlist, how to add a general-result source, how the ledger changes after the January rosters)
- Modify: `docs/operations/post-election-runbook.md` (timeline steps 2–5: after each certified file and each roster refresh, the publish rebuilds the ledger; what to check), `docs/data/rapid-intake.md` (one paragraph pointing to the ledger doc)

- [ ] **Step 1: Write the docs.** **Step 2: `npm run lint`** (markdown is not linted; run `npm run data:verify` to be sure nothing else moved). **Step 3: Commit** `docs: outcome ledger and post-election updates`.

### Task 10: Whole-branch verification

- [ ] `npm run typecheck`, `npm run lint`, `npm run data:verify`, `npm run test:fast`, `npx vitest run src/rapid-acquisition/seat-outcome-* src/rapid-acquisition/pre-election-snapshot-2026.test.ts src/rapid-acquisition/holder-name-match.test.ts src/rapid-acquisition/state-legislative-roster.test.ts src/lib src/app`, then the full `npm run test:run` in the background.
- [ ] `npm run rapid:publish -- --version v1.17 --date 2026-11-03` dry run: the frozen snapshot's lock digest unchanged, the ledger rebuilt identically, the review note carries the outcomes line; revert the regenerated note.
- [ ] Open the PR with the verification list; link and watch it.
