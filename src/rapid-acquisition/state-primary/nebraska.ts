import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Nebraska: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NEBRASKA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NE",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
