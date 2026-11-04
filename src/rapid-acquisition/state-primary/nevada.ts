import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Nevada: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const NEVADA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NV",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
