import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** New York: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NEW_YORK_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NY",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
