import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Arizona: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const ARIZONA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AZ",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
