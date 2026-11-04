import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Georgia: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const GEORGIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "GA",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
