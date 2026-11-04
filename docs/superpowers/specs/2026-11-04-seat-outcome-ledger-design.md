# Seat outcome ledger — design

Status: approved scope 2026-11-04 (owner: "both public and internal"). Written 2026-11-04, the day after the 2026 general election.

## Purpose

Answer two questions the Priority Index cannot answer today:

1. **Coverage.** Which seats carry a score, which do not, and why.
2. **Outcome.** For every seat the index scored before the election, what happened in 2026: not on the ballot, holder did not run, holder lost the primary, holder lost the general, holder won, open seat held or flipped. "Lost the primary" is its own outcome; it is the event the Democratic-incumbent-primary route is about, and it is settled months before the general.

The public reading is a page that shows how the index did, seat by seat and by route, with every unknown left visible. The internal reading is the same artifact used to check which routes and score bands preceded which outcomes before anyone tunes a weight.

## Constraints carried from the project

- **No winner inference.** A winner comes from an authority that marks one, from a certified count in which the holder is or is not among the seats-many highest named candidates (the rule the state-legislative layer already applies after a roster snapshot), or from the roster changing hands. Unofficial counts never settle an outcome; they appear as `pending` with the count's status.
- **Missing stays missing.** A seat with no retained evidence is `unknown`, never a guess, and the page says how many are unknown.
- **Provenance per row.** Every outcome names the lock ids of the files it rests on and the snapshot date it was observed.
- **Frozen comparison.** The index refreshes weekly and rosters change as winners are seated, so the pre-election scores must be frozen once, separately, and never rebuilt.

## Artifacts

### `priority-index-pre-election-2026-v1` (frozen, built once)

One row per seat in the v1.17 release (published 2026-11-03, the pre-election release): chamber, seat id and label, state, holder name, holder id (bioguide for Congress, Open States id otherwise), holder party, score status, route, score, cross-chamber rank and chamber rank as `rankAcrossChambers` would assign them, `nextElectionYear`, `openSeatSignal`. Unscored state-legislative seats are included with their reason and no score, so the coverage question is answered from the same file. 7,916 rows: 430 House, 100 Senate, 50 governor, 7,336 state legislative.

Pinned once with the four v1.17 projections as parents. Not registered in the publish loop; reproduced by its test from those parents like the frozen legacy artifacts.

### `seat-outcome-ledger-v1` (derived, rebuilt by every publish)

One row per pre-election row, joined to the evidence available at the refresh snapshot:

| Field | Values |
|---|---|
| `stage` | `not_up_in_2026`, `up_in_2026` |
| `candidacy` | `filed_for_seat`, `filed_for_other_office`, `not_on_primary_ballot`, `not_observed`, `not_applicable` |
| `primary` | `{ status: won \| lost \| pending \| unknown \| not_applicable, contestId, resultStatus, evidence }` |
| `general` | `{ status: won \| lost \| pending \| unknown \| not_applicable, contestId, resultStatus, evidence }` |
| `successorParty` | party of the seat's next holder when a roster snapshot after the election names one, else null |
| `outcome` | `not_up_in_2026`, `incumbent_ran_for_other_office`, `incumbent_lost_primary`, `incumbent_lost_general`, `incumbent_won`, `open_seat_held`, `open_seat_flipped`, `unknown` |
| `evidence` | one of `fec_filing`, `primary_source_marked_winner`, `primary_vote_order_certified`, `general_source_marked_winner`, `general_vote_order_certified`, `roster_change`, `none` |
| `evidenceSourceIds` | lock ids |
| `observedAt` | the refresh snapshot date |

Resolution order, first match wins, and a lower rule never overrides a higher one:

1. `nextElectionYear !== 2026` → `not_up_in_2026`.
2. Candidacy: the House candidacy artifact says the holder filed for the Senate → `incumbent_ran_for_other_office` (`fec_filing`). "Did not run" is not observable in federal filings; it is recorded as `candidacy: not_on_primary_ballot` when a retained primary for the seat and the holder's party does not name the holder, and the outcome then follows rule 4 or 5 as an open seat (`open_seat_held` / `open_seat_flipped`). Until then the outcome stays `unknown` with `candidacy` saying what was seen. (Revised 2026-11-04: an earlier draft listed a separate `incumbent_did_not_run` outcome that no rule produced; the candidacy field carries that fact.)
3. Primary: a retained 2026 primary contest for the seat and the holder's party, with the holder matched to a named candidate by the roster-matching rule already in `state-legislative-roster.ts` (family-name tokens plus given name or initial). Source-marked winner other than the holder, or a certified count with the holder outside the winning places → `incumbent_lost_primary`. Holder marked winner or inside the places on a certified count → `primary.status = won`, outcome still open. Unofficial count → `pending`.
4. General: a retained 2026 general contest for the seat (state-legislative adapters as they certify; House, Senate and governor when certified canvasses are retained). Same rule → `incumbent_lost_general` or `incumbent_won`; for a seat whose holder did not run, the winner's party against the holder's → `open_seat_held` / `open_seat_flipped`.
5. Roster change: when a roster snapshot dated after the election names a different holder, `successorParty` is set and, if no general contest is retained, outcome resolves from the parties with evidence `roster_change`. The Congress roster after 2027-01-03 and the Open States rosters as states seat members are the sources.

The build also writes a `comparison` block: for each chamber and route, outcome counts by score band (≥ 70, 50–69.9, < 50) and by cross-chamber rank quartile, with `unknown` counted, so the page and the internal check read the same numbers.

### Evidence available at first build (2026-11-04)

- FEC candidacy for the House (427 statutory candidates, 16 Senate filings; Senate and governor have none).
- 2026 House Democratic primaries parsed for HI (partial count, stays `pending`), IN and SC (source-marked winners), MS and TN (final counts, not source-marked; TN's holder is not on the ballot). Reviewer-only receipts for other states are `publicationEligible: false` and are not read.
- 2026 state-legislative Democratic primaries for GA and OH with roster matches (GA 83 matched / 21 not, OH 26 / 14); the GA source marks incumbents with "(I)".
- No 2026 general result for any chamber. Rosters dated 2026-11-03 predate seating.

So the first ledger is mostly `unknown` for `up_in_2026` seats, with a handful of settled primaries. That is the honest state of the world the day after the election, and the page must read that way.

## Public page

`/outcomes`: the coverage table (seats per chamber, scored, unscored by reason), then the outcome summary by chamber and route with the unknown share first, then the comparison bands, then a filterable list of `up_in_2026` seats with their pre-election score, rank, route and outcome. Each row links to its brief. Each brief page gains one line: the seat's 2026 stage and outcome with its evidence, or "no retained evidence yet". The methodology page gets a section describing the evidence grades and the resolution order; the sources page lists the ledger and its parents.

## Not in scope

Ingesting House, Senate or governor 2026 general results, which needs per-state canvass adapters like the state-legislative ones; re-weighting any score; inferring retirements from the absence of a filing.

## Testing

- The frozen snapshot reproduces from the four v1.17 projections and matches its pin.
- Resolution rules with fixtures for each outcome, each evidence grade, and each refusal (unofficial count stays pending; unmatched holder stays unknown; a lower rule never overrides a higher one).
- The comparison block sums to the row counts.
- The page renders with the current, mostly-unknown ledger and with a fixture ledger where every outcome occurs; the brief line renders for a seat with and without evidence.
- `rapid:publish` rebuilds the ledger; the frozen snapshot's digest is unchanged by a rebuild.
