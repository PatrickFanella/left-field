import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Rhode Island: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const RHODE_ISLAND_PRIMARY: StatePrimaryAdapter = {
  stateCode: "RI",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
