import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Iowa: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const IOWA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "IA",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
