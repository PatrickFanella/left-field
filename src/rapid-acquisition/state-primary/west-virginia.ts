import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** West Virginia: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const WEST_VIRGINIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WV",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
