import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Idaho: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const IDAHO_PRIMARY: StatePrimaryAdapter = {
  stateCode: "ID",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
