import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** North Dakota: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NORTH_DAKOTA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "ND",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
