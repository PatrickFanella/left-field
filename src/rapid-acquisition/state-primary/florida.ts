import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Florida: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const FLORIDA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "FL",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
