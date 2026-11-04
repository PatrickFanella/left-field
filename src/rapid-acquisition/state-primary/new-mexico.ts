import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** New Mexico: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NEW_MEXICO_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NM",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
