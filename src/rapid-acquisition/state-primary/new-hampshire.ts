import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** New Hampshire: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NEW_HAMPSHIRE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NH",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
