import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Kentucky: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const KENTUCKY_PRIMARY: StatePrimaryAdapter = {
  stateCode: "KY",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
