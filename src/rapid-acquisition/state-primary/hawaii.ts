import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Hawaii: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const HAWAII_PRIMARY: StatePrimaryAdapter = {
  stateCode: "HI",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
