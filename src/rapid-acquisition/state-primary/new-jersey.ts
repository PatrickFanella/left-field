import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** New Jersey: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NEW_JERSEY_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NJ",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
