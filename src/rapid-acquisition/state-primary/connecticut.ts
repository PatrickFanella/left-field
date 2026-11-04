import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Connecticut: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const CONNECTICUT_PRIMARY: StatePrimaryAdapter = {
  stateCode: "CT",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
