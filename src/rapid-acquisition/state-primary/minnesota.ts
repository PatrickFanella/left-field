import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Minnesota: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const MINNESOTA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MN",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
