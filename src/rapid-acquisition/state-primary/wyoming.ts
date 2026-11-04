import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Wyoming: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const WYOMING_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WY",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
