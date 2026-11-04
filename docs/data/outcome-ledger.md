# Seat outcome ledger

Status: active, 2026-11-04. Two artifacts answer what the Priority Index covered before the 2026 general election and what happened to each seat afterwards. Design: `docs/superpowers/specs/2026-11-04-seat-outcome-ledger-design.md`.

## The two artifacts

| Artifact | Built by | Rebuilt | Parents |
|---|---|---|---|
| `priority-index-pre-election-2026-v1` | `npm run rapid:freeze-pre-election`, once | never; the script refuses to run again | the four v1.17 projections and the release descriptor |
| `seat-outcome-ledger-v1` | `rapid:intake derive seat-outcome-ledger-v1`; every `rapid:publish` | weekly | the snapshot, `house-incumbent-candidacy-v1`, the 2026 House primary artifacts, the 2026 state-legislative primary catalogs, the state-legislative roster, the governor projection, and the Congress rosters |

The snapshot holds every seat of the v1.17 release (7,916: 430 House, 100 Senate, 50 governors, 7,336 state legislative) with holder, party, score status, route, score, cross-chamber and chamber rank, and the unscored reason where there is one. Its test reproduces it from its parents; its digest never changes, so `/outcomes` always compares the same pre-election scores with the latest evidence.

The ledger joins each frozen row to the evidence retained at the refresh snapshot (`observedAt`) and writes a `comparison` block: outcome counts by chamber, route and score band (70+, 50–69.9, under 50) and by cross-chamber rank quartile. The site reads it through `src/lib/outcome-ledger-view.ts`.

## Outcomes and evidence

| Outcome | Set when |
|---|---|
| `not_up_in_2026` | the seat's `nextElectionYear` is not 2026 |
| `incumbent_ran_for_other_office` | the FEC candidate master shows the House holder filed for the Senate |
| `incumbent_lost_primary` | the holder's own-party primary names the holder and the state marks another winner, or a certified count puts the holder outside the winning places |
| `incumbent_lost_general`, `incumbent_won` | the same rule on a retained general, or the roster after the election names a new holder (`roster_change`) |
| `open_seat_held`, `open_seat_flipped` | the holder was not on the ballot and the winner's party, from a retained general or the roster, matches or differs from the holder's |
| `unknown` | nothing settling is retained |

Every settled row carries `evidence` (one of `fec_filing`, `primary_source_marked_winner`, `primary_vote_order_certified`, `general_source_marked_winner`, `general_vote_order_certified`, `roster_change`), `evidenceSourceIds` (lock ids) and `observedAt`. `candidacy` says what the filings and the primary ballot showed (`filed_for_seat`, `filed_for_other_office`, `not_on_primary_ballot`, `not_observed`); `primary` and `general` carry their own status, contest id, count status and grade.

The rules run in this order and a later rule never overrides an earlier one: stage, candidacy, primary, general, roster change.

## What never settles an outcome

- An unofficial count. `countStatusOf` accepts only the certification statuses listed in `CERTIFIED_COUNT_STATUSES` (`src/rapid-acquisition/seat-outcome-evidence.ts`); anything else, including an absent status, is unofficial and leaves the contest `pending`.
- A first round in a state with primary runoffs (`PRIMARY_RUNOFF_THRESHOLDS` in `seat-outcome-resolver.ts`: AL, AR, GA, MS, OK, SC, TX at 50%; NC 30%; SD 35%) while the leader is at or under the threshold and the holder is in the top two. A holder outside the top two is out whatever the runoff decides.
- A holder matched to no candidate, or to more than one. The match is the roster rule: every family-name token present, and the given name absent, first, or present. A `LAST, First` ballot name is reordered; `(I)` and `*` markers are stripped.
- Vote totals alone. Winners come from a source mark, a certified count, or the roster; the artifact's methodology records `winnerInference: false`.

## Adding evidence

- **A certified state-legislative general file.** Add it to the state's adapter (see `docs/operations/post-election-runbook.md`); `readStateLegislativeGeneralResults` carries it, and the next step is to feed those 2026 contests into the ledger as `GeneralEvidence` with per-candidate `party` so the open-seat rule can compare parties. That reader is not written yet; until it is, generals resolve through the roster.
- **A House, Senate or governor canvass.** Needs a per-state adapter like the state-legislative ones; none exists.
- **A new primary catalog.** Register it in the primary context; `stateLegislativePrimaryCatalogIds2026` picks up any 2026 catalog whose id contains `-state-legislative-`. A catalog that marks winners needs its winner field read in `readStateLegislativePrimaryEvidence2026`, which currently refuses such a catalog rather than guessing.
- **Rosters.** `readSuccessors` compares each frozen holder with the current Congress roster (by state and district or class), the governor projection (by state) and the state-legislative roster (by district, pairing departed and arriving holders in id order). After the 120th Congress is seated on 2027-01-03 and states seat their legislatures, the weekly publish turns most House, Senate and state rows from `unknown` into `roster_change` outcomes.

## Reading the comparison honestly

A band whose rows are mostly `unknown` says nothing yet. The page prints the unknown column first for that reason. Compare routes within a chamber, not across chambers: the routes measure different things.
