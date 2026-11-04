import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Louisiana: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const LOUISIANA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "LA",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
