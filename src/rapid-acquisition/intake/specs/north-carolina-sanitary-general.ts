import type { IntakeSpec } from "../package";
import { parseNorthCarolinaLocalGeneral } from "./north-carolina-local-general";

/** Exact ballot titles in the retained 2024 snapshot; no geographic normalization. */
const SANITARY_TITLES = new Set([
  "CARTERET - HARKERS ISLAND SANITARY BOARD MEMBER",
  "COLUMBUS - REIGELWOOD SANITARY DISTRICT BOARD",
  "FIRST CRAVEN SANITARY DISTRICT BOARD MEMBER",
  "HANDY SANITARY DISTRICT SUPERVISOR",
  "HAYWOOD - JUNALUSKA SANITARY DISTRICT",
  "HAYWOOD - JUNALUSKA SANITARY DISTRICT (UNEXPIRED)",
  "HAYWOOD - MAGGIE VALLEY SANITARY DISTRICT",
  "HYDE - ENGELHARD SANITARY DISTRICT SUPERVISORS",
  "HYDE - ENGELHARD SANITARY DISTRICT SUPERVISORS (UNEXPIRED)",
  "HYDE - OCRACOKE SANITARY DISTRICT SUPERVISORS",
  "HYDE - SWAN QUARTER SANITARY DISTRICT SUPERVISORS",
  "PERQUIMANS - MINZIES CREEK SANITARY DISTRICT COMMISSIONER",
  "RUTHERFORD COUNTY - CLIFFSIDE SANITARY DISTRICT COMMISSIONER",
  "WHITTIER SANITARY DISTRICT BOARD MEMBERS",
]);

export function classifyNorthCarolinaSanitaryOffice(title: string) {
  return SANITARY_TITLES.has(title)
    ? { office: "sanitary_district_board", officeLevel: "other_local" as const }
    : null;
}

export const northCarolinaSanitaryGeneralSpec: IntakeSpec = {
  id: "rapid-north-carolina-sanitary-general-results-v1", version: 1, state: "NC",
  label: "North Carolina sanitary-district general results",
  scope: "2024 general election sanitary-district board, commissioner and supervisor results",
  authority: "north_carolina_state_board_of_elections_precinct_results_archive",
  limitations: ["retained_2024_archive_snapshot_not_current_holder_roster", "source_does_not_mark_winners", "no_rank_based_winner_inference", "source_ballot_title_not_normalized_district_boundary_or_governing_body", "appointed_positions_and_offices_not_on_this_ballot_not_enumerated", "current_holder_identity_and_local_office_scoring_not_defined"],
  sources: [{ lockId: "nc-2024-general-results-pct-zip", cycleYear: 2024, electionDate: "2024-11-05", expect: { contests: 14, candidateRows: 51, candidateVotes: 24_789 } }],
  parse: (bytes, _source, { fail }) => parseNorthCarolinaLocalGeneral(bytes, fail, classifyNorthCarolinaSanitaryOffice),
};
