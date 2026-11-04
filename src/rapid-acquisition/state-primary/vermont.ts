import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Vermont: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const VERMONT_PRIMARY: StatePrimaryAdapter = {
  stateCode: "VT",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
