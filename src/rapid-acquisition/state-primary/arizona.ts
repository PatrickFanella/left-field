import type { StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Arizona: no 2026 primary source retained yet. An adapter with no sources is left out of the build.
 *
 * The official statewide canvass of the July 21, 2026 primary (certified August 6, 2026) is
 * apps.azsos.gov/election/2026/canvass/20260806_Primary_Canvass.pdf, 19,111,993 bytes, a scan
 * (JPEG page images, no text layer) that needs a reviewed transcription as for the 2024 general.
 * The host refuses this project's network (HTTP 403); full Internet Archive captures exist
 * (20260807005831, 20260828005914, 20260906221650), but the archive throttled this network to a
 * few kilobytes per connection, so the file could not be retained.
 */
export const ARIZONA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AZ",
  authority: "",
  system: "partisan",
  sources: [],
  expectedContests: {},
  parse: () => [],
};
