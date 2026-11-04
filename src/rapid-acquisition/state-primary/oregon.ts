import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Oregon: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const OREGON_PRIMARY: StatePrimaryAdapter = {
  stateCode: "OR",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
