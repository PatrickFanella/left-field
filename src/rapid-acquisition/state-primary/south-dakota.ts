import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** South Dakota: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const SOUTH_DAKOTA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "SD",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
