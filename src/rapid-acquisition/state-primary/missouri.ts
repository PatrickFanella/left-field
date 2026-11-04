import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Missouri: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const MISSOURI_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MO",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
