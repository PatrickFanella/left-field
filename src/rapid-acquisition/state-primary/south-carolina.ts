import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** South Carolina: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const SOUTH_CAROLINA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "SC",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
