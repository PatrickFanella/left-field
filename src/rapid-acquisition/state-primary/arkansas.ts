import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Arkansas: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const ARKANSAS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AR",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
