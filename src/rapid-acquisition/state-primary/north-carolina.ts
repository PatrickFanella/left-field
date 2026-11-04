import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** North Carolina: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NORTH_CAROLINA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NC",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
