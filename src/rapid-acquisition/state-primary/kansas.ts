import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Kansas: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const KANSAS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "KS",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
