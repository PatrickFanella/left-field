import type { IntakeSpec } from "../package";
import { parseNorthCarolinaLocalGeneral } from "./north-carolina-local-general";

/** Match only the source's explicit supervisor contest family. */
export function classifyNorthCarolinaSoilWaterOffice(title: string) {
  return /^[A-Z ]+ SOIL AND WATER CONSERVATION DISTRICT SUPERVISOR$/.test(title)
    ? { office: "soil_water_conservation_district_supervisor", officeLevel: "other_local" as const }
    : null;
}

export const northCarolinaSoilWaterGeneralSpec: IntakeSpec = {
  id: "rapid-north-carolina-soil-water-general-results-v1", version: 1, state: "NC",
  label: "North Carolina soil-and-water supervisor general results",
  scope: "2024 general election soil-and-water conservation district supervisor results",
  authority: "north_carolina_state_board_of_elections_precinct_results_archive",
  limitations: ["retained_2024_archive_snapshot_not_current_holder_roster", "source_does_not_mark_winners", "no_rank_based_winner_inference", "source_ballot_title_not_normalized_district_boundary_or_governing_body", "appointed_positions_and_offices_not_on_this_ballot_not_enumerated", "current_holder_identity_and_local_office_scoring_not_defined"],
  sources: [{ lockId: "nc-2024-general-results-pct-zip", cycleYear: 2024, electionDate: "2024-11-05", expect: { contests: 100, candidateRows: 510, candidateVotes: 4_143_641 } }],
  parse: (bytes, _source, { fail }) => parseNorthCarolinaLocalGeneral(bytes, fail, classifyNorthCarolinaSoilWaterOffice),
};
