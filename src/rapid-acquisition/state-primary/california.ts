import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** California: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const CALIFORNIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "CA",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
