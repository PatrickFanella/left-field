import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Ohio: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const OHIO_PRIMARY: StatePrimaryAdapter = {
  stateCode: "OH",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
