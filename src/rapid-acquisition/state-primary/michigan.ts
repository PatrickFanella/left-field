import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Michigan: no 2026 primary source retained yet. An adapter with no sources is left out of the build.
 *
 * The Board of State Canvassers certified the August 4, 2026 primary on August 24, 2026 (meeting agenda, item 2,
 * michigan.gov/sos/elections/bsc). Since 2024 the Secretary of State publishes results only through
 * mvic.sos.state.mi.us/votehistory (Index?type=C&electionDate=8-4-2026), which refuses this project's network
 * (HTTP 403) and which the Internet Archive holds only as a challenge page (HTTP 403 capture). mielections.us resets
 * this network's connections and the archive holds no 2026PRI_CENR page from it; michigan.gov links no statewide
 * 2026 results file. Checked November 4, 2026.
 */
export const MICHIGAN_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MI",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
