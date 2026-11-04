import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Montana: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const MONTANA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MT",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
