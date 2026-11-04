import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Utah: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const UTAH_PRIMARY: StatePrimaryAdapter = {
  stateCode: "UT",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
