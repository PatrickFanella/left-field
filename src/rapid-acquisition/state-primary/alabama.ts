import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Alabama: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const ALABAMA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AL",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
