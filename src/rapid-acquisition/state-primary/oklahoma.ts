import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Oklahoma: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const OKLAHOMA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "OK",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
