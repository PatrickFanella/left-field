import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Texas: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const TEXAS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "TX",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
