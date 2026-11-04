import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** District of Columbia: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const DISTRICT_OF_COLUMBIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "DC",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
