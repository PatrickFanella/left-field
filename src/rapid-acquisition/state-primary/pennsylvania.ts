import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Pennsylvania: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const PENNSYLVANIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "PA",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
