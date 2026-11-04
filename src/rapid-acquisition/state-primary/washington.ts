import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Washington: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const WASHINGTON_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WA",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
