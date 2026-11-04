# 2026 primary coverage

Status: 2026-11-04. `state-primary-results-2026-v1` holds 9,550 contests from 49 jurisdictions' official 2026 primary returns (135 sources). Of the 6,271 seats on the 2026 ballot, the ledger settles the holder's primary for 5,551 (won, lost, pending, or not on the ballot) and records 169 incumbent primary losses. The rest are unsettled: 669 seats have no contest and 51 have a contest whose candidates the holder cannot be matched to.

How the layer works, and how to add a state, is in `docs/data/outcome-ledger.md`.

## Gaps

| State | Seats unsettled | Why |
|---|---|---|
| NH | 408 of 409 | sos.nh.gov refuses this project's network (HTTP 403). The Internet Archive holds only the Democratic 2nd District workbook; every other 2026 file returns 404 there, and Save Page Now refuses new captures from this network. |
| AZ | 100 of 100 | apps.azsos.gov refuses this network. The certified canvass is a 19 MB scan with no text layer; archive captures exist (20260807005831, 20260828005914, 20260906221650) but the archive throttled the download. It also needs a reviewed transcription, as the 2024 general did. |
| OH | 85 of 130 | Only the Democratic canvass workbook is retained. The Republican and Libertarian workbooks are refused by the official host and the archive holds only 404 captures. |
| MI | 53 of 53 | mvic.sos.state.mi.us and mielections.us refuse this network; no usable capture was found. |
| ME | 11 of 190 | Four seats with no contest, seven name mismatches. |
| LA | 6 of 7 | The May 16 House party primaries were suspended for a redraw; those races moved to the November open primary, so no primary exists. |
| others | 57 in total | Name matches the matcher leaves open on purpose (a different candidate with the holder's family name, as in TX-22 and AK-S2), nicknames outside the table (Bud, Arnie, Misha, Gus), roster names that differ from the ballot (TX House 87 "Caroline Fairly", NY Assembly 3 "De Stefano"), primaries in which the only line was a write-in, and independents who have no primary. |

The runbook's residential network route for refusing publishers (a network namespace on Kvant) no longer exists. Retaining NH, AZ, OH and MI needs that route restored or another network path; the adapters and contract are ready for the files.

## Source caveats

- **TX**: the Civix API serves each canvass PDF base64-encoded in a JSON body; the retained bytes are the decoded PDFs, so `--probe` reports these sources as changed. Re-retaining means decoding again.
- **AK**: the results host omits its intermediate certificate; fetching needs `NODE_EXTRA_CA_CERTS` pointing at the GlobalSign intermediate.
- **TN**: the host's bot filter answers Node's fetch with an empty 202; the file was fetched with curl. Retention now refuses an empty or 202 response rather than saving it.
- **OK**: the race-level CSV export sits behind the results site's public app; the files were fetched once and placed at their paths.
- **CT, AR**: unopposed nominations come from the state's election-night reporting site's ballot listing (candidate names and parties only; its vote counts are not read). **NY** uses the State Board's certification of the general-election ballot, through an archive capture.
- **FL**: the candidate list was retained on November 4; the Division may later change statuses to Elected or Defeated, so the probe will report it changed.
- **HI**: the certified summary was re-issued at the URL the earlier House artifact pinned; the statewide adapter retains the current bytes under its own id.
- **AL**: Districts 1, 2, 6 and 7 re-ran their nominations on August 11 under the new map. Those contests carry `special` so their ids do not collide with May's.
