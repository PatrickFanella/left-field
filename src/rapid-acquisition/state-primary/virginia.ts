import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Virginia: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const VIRGINIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "VA",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
