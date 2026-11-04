import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Maryland: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const MARYLAND_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MD",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
