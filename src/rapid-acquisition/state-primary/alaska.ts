import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/** Alaska: no 2026 primary source retained yet. An adapter with no sources is left out of the build. */
export const ALASKA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AK",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
