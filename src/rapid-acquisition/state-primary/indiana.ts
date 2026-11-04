import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Indiana: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const INDIANA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "IN",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
