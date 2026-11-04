import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Wisconsin: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const WISCONSIN_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WI",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
