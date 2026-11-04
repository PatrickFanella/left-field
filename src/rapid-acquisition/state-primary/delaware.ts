import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Delaware: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const DELAWARE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "DE",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
