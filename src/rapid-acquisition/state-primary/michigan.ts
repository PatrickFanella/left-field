import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Michigan: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const MICHIGAN_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MI",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
