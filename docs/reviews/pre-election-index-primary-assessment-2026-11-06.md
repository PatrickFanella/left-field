# Pre-election index against the 2026 primaries

Written 2026-11-06, three days after the general election. It reads `seat-outcome-ledger-v1` (lock sha256 `572bf472e0bec5c521ea9411a42c015a5acca314dcdd98047f41d9bf3a681ad0`, evidence as of the 2026-11-03 refresh) against the frozen `priority-index-pre-election-2026-v1` (v1.17). The numbers below are the ledger's `primaryComparison` block, which `/outcomes` prints as the primary record.

## What can be assessed now

Only primaries. No 2026 general result is retained for any chamber: the project waits for certified canvasses, and most states certify in late November or December (`docs/operations/post-election-runbook.md`). Every general-election outcome is `unknown` until then, so nothing here says how the Republican-held flip route did.

The Democratic-held routes are about primaries: `deep_blue` and `aipac_supported_blue` in the House, `democratic_incumbent_primary` everywhere else. For those seats the question is whether a higher pre-election score went with more holders losing their primary.

## Primary record, Democratic-held routes

Scored seats on the 2026 ballot. "Settled" means won or lost; pending, unknown, not on the ballot and filed for another office are left out of the share.

| Group | Band | Won | Lost | Lost, of settled | Not on ballot | Unknown |
|---|---|---|---|---|---|---|
| House, Senate, governor | 70+ | 27 | 4 | 12.9% | 8 | 2 |
| | 50–69.9 | 102 | 2 | 1.9% | 7 | 7 |
| | under 50 | 61 | 1 | 1.6% | 8 | 7 |
| State legislative | 70+ | 1,142 | 34 | 2.9% | 182 | 140 |
| | 50–69.9 | 281 | 6 | 2.1% | 32 | 17 |
| | under 50 | 556 | 8 | 1.4% | 115 | 101 |
| All | 70+ | 1,169 | 38 | 3.1% | 190 | 142 |
| | 50–69.9 | 383 | 8 | 2.0% | 39 | 24 |
| | under 50 | 617 | 9 | 1.4% | 123 | 108 |

By cross-chamber rank quartile, the same seats lost 3.2%, 2.1%, 1.2% and 0% of their settled primaries (37, 15, 3 and 0 losses).

A two-sided Fisher exact test of the 70+ band against the rest gives p ≈ 0.013 for federal and governor seats, 0.076 for state-legislative seats and 0.028 pooled. These are descriptive checks on one cycle, not a validation of the weights.

## Federal and governor holders who lost

| Seat | Holder | Route | Score | Rank |
|---|---|---|---|---|
| NY-13 | Adriano Espaillat | AIPAC-supported blue | 83.8 | 1,623 |
| NY-10 | Daniel Goldman | Deep blue | 79.5 | 1,670 |
| CO-01 | Diana DeGette | Deep blue | 74.6 | 1,804 |
| TX-09 | Al Green (ran in TX-18) | Deep blue | 72.4 | 1,877 |
| CT-01 | John Larson | AIPAC-supported blue | 68.1 | 2,032 |
| TX-32 | Julie Johnson | Deep blue | 64.6 | 2,174 |
| RI-Gov | Dan McKee | Democratic incumbent | 30.2 | 3,452 |

Each rests on a certified count (`primary_vote_order_certified`). Six Republican holders also lost primaries (FL-07, TN-05, TX-S2, TX-02, LA-S2, KY-04); their route scores the general, so their primaries are context, not a test.

State-legislative Democratic holders lost 48 primaries, led by NY (7), DE (5) and MD (4).

## What this does not show

- **Who won.** The ledger records that the holder lost, not who beat them or on what platform. A loss to a more conservative Democrat counts the same as a loss to a left challenger. Telling them apart needs challenger data the project does not retain.
- **Cause.** The score may partly track things that go with contested primaries anyway, such as safe-seat margins or redistricting (TX-09's holder ran in a redrawn TX-18).
- **Missing seats.** 142 seats in the 70+ band have no retained primary; 128 of them are in NH (87), AZ (32) and MI (9), where the official hosts refuse this project's network (`docs/data/state-primaries-2026.md`). If losses there differ from the rest, the shares move.
- **Small bands.** Federal and governor 70+ is 31 settled primaries; one seat moves it by about three points.

## Next

- The general-election half waits for certified canvasses. State-legislative 2026 general files go in through the state adapters as states certify, and the ledger reads them as general evidence on the next publish. House, Senate and governor generals have no canvass adapter yet; they resolve through roster changes after the new holders are seated.
- Retaining NH, AZ, MI and Ohio's Republican primary files needs a network route the official hosts accept.
