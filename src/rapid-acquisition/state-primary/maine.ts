import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Maine: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const MAINE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "ME",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
