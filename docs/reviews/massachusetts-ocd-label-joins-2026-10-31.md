# Massachusetts district-label joins

The September 24 roster and retained OCD OpenStates role mapping spell fourteen
Massachusetts district labels differently only in their use of the standalone
word `and`. The crosswalk now resolves those observations: one House district
and thirteen Senate districts. It still preserves each raw district label,
seat ID, person ID, and seat slot.

Examples from the retained sources:

| Roster district | Retained OpenStates role | OCD division suffix |
| --- | --- | --- |
| Barnstable, Dukes and Nantucket | `ma-lower-barnstable-dukes-nantucket` | `sldl:barnstable_dukes_and_nantucket` |
| First Essex and Middlesex | `ma-upper-first-essex-middlesex` | `sldu:1st_essex_and_middlesex` |
| Second Essex and Middlesex | `ma-upper-second-essex-middlesex` | `sldu:2nd_essex_and_middlesex` |
| Cape and Islands | `ma-upper-cape-islands` | `sldu:cape_and_islands` |

Exact and existing normalized matches take precedence. The additional fallback
applies only to Massachusetts and removes only a standalone conjunction token.
It does not reorder counties, remove ordinals, merge chambers, or strip `and`
from words such as `Andover`. Multiple candidate division IDs remain ambiguous.

The regenerated [review crosswalk](state-legislative-ocd-crosswalk-v1.json)
contains 7,108 mapped and 236 unmapped observations out of the same 7,344 roster
observations, with no ambiguous rows. Massachusetts still has two unmatched
House observations and fourteen unmatched Senate observations. These require
further source work; similar names do not establish equivalent districts.
The roster is a dated observation, not a complete current authorized-seat list.

Evidence uses the already retained, hash-verified
[Massachusetts mapping](../../data/source/identity/ocd/ocd-division-ids-f1ab837/state-ma-openstates.csv)
from revision `f1ab837759a241279c66b066d2fc40190a0eb3de`, with its retained
[CC0 dedication](../../data/source/identity/ocd/ocd-division-ids-f1ab837/LICENSE.md).
No new source, rights grant, officeholder, or seat is inferred. Plan compatibility
remains `unreviewed`; the frozen roster and published scores are unchanged.

Reproduce with `npm run data:identity:state-seats:check`. The identity tests cover
the retained labels, distinct ordinals, reordered names, chamber isolation,
ambiguous candidates, and state-specific scope.
