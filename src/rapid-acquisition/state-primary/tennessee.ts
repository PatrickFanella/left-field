import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Tennessee: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const TENNESSEE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "TN",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
