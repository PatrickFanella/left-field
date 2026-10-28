import { unzipSync } from "fflate";

import type { IntakeCandidate, IntakeSpec, OfficeLevel, ParsedContest } from "../package";

/** Positive office allowlist: ballot questions and other office families stay out. */
export function classifyNorthCarolinaLocalOffice(title: string): { office: string; officeLevel: OfficeLevel } | null {
  if (/REFERENDUM|BOND|TAX|BEVERAGE|WINE ELECTION|ELECTION METHOD/.test(title)) return null;
  if (/COUNTY BOARD OF COMMISSIONERS/.test(title) || title === "PASQUOTANK COUNTY COMMISSIONERS SOUTHERN INSIDE (UNEXPIRED)") return { office: "county_commissioner", officeLevel: "county" };
  if (/BOARD OF EDUCATION/.test(title)) return { office: "board_of_education", officeLevel: "school_board" };
  if (/COUNTY REGISTER OF DEEDS/.test(title)) return { office: "register_of_deeds", officeLevel: "county" };
  if (/COUNTY CLERK OF SUPERIOR COURT/.test(title)) return { office: "clerk_of_superior_court", officeLevel: "county" };
  if (/COUNTY SHERIFF/.test(title)) return { office: "county_sheriff", officeLevel: "county" };
  if (/^(?:CITY|TOWN|VILLAGE) OF /.test(title) || title === "CHIMNEY ROCK VILLAGE COUNCILMAN") {
    if (/MAYOR/.test(title)) return { office: "municipal_mayor", officeLevel: "municipal" };
    if (/COUNCIL|COMMISSIONER|ALDERM[AE]N/.test(title)) return { office: "municipal_council", officeLevel: "municipal" };
  }
  return null;
}

export function parseNorthCarolinaLocalGeneral(
  bytes: Buffer,
  fail: (code: string) => never,
  classifyOffice: typeof classifyNorthCarolinaLocalOffice = classifyNorthCarolinaLocalOffice,
): readonly ParsedContest[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { return fail("ZIP_INVALID"); }
  const file = files["results_pct_20241105.txt"] ?? fail("RESULTS_MEMBER_MISSING");
  const lines = Buffer.from(file).toString("latin1").split(/\r?\n/).filter((line) => line.trim());
  const header = lines.shift()!.split("\t");
  const column = (name: string) => { const index = header.indexOf(name); return index < 0 ? fail(`COLUMN_MISSING:${name}`) : index; };
  const columns = Object.fromEntries(["County", "Election Date", "Precinct", "Contest Group ID", "Contest Name", "Choice", "Choice Party", "Vote For", "Election Day", "Early Voting", "Absentee by Mail", "Provisional", "Total Votes"].map((name) => [name, column(name)]));
  const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fail("INTEGER_INVALID");
  type Group = { office: string; officeLevel: OfficeLevel; seats: number; counties: Set<string>; candidates: Map<string, IntakeCandidate>; rows: number };
  const groups = new Map<string, Group>();
  const seen = new Set<string>();
  for (const line of lines) {
    const cells = line.split("\t");
    if (cells.length !== header.length) fail("ROW_WIDTH_INVALID");
    const at = (name: string) => cells[columns[name]!]!.trim();
    const title = at("Contest Name"), office = classifyOffice(title);
    if (!office) continue;
    if (at("Election Date") !== "11/05/2024") fail("ELECTION_DATE_INVALID");
    const county = at("County"), name = at("Choice"), party = at("Choice Party");
    if (!county || !at("Precinct") || !at("Contest Group ID")) fail("ROW_IDENTITY_MISSING");
    const key = JSON.stringify([county, at("Precinct"), at("Contest Group ID"), title, name, party]);
    if (seen.has(key)) fail("PRECINCT_CANDIDATE_DUPLICATE");
    seen.add(key);
    const votes = integer(at("Total Votes"));
    if (["Election Day", "Early Voting", "Absentee by Mail", "Provisional"].reduce((sum, field) => sum + (at(field) === "" ? 0 : integer(at(field))), 0) !== votes) fail("VOTE_CHANNELS_DO_NOT_RECONCILE");
    // Blank zero rows are placeholders, not candidates. A positive blank is invalid.
    if (!name) { if (votes !== 0) fail("BLANK_CHOICE_WITH_VOTES"); continue; }
    const seats = integer(at("Vote For"));
    if (seats < 1) fail("SEATS_INVALID");
    const group = groups.get(title) ?? { ...office, seats, counties: new Set<string>(), candidates: new Map<string, IntakeCandidate>(), rows: 0 };
    if (group.seats !== seats) fail("SEATS_CONFLICT");
    group.counties.add(county);
    group.rows++;
    const candidateKey = JSON.stringify([name, party]);
    const prior = group.candidates.get(candidateKey);
    const candidacyKind = name === "Write-In (Miscellaneous)" ? "unnamed_write_in" : /\(Write-In\)$/.test(name) ? "named_write_in" : "named_candidate";
    group.candidates.set(candidateKey, { sourceName: name, rawParty: party, candidacyKind, votes: (prior?.votes ?? 0) + votes });
    groups.set(title, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([title, group]) => ({
    office: group.office, officeLevel: group.officeLevel, districtCode: null,
    // The exact full title keeps wards, seats, districts and unexpired terms distinct.
    jurisdiction: title, rawOfficeTitle: title, rawParty: "ALL_SOURCE_PARTIES",
    seats: group.seats, reportingJurisdictions: [...group.counties].sort(),
    candidates: [...group.candidates.values()].sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.rawParty!.localeCompare(b.rawParty!)),
    reconciliation: "all_vote_channels_equal_row_totals_then_sum_all_reporting_counties_and_precinct_types",
    notes: [`precinct_candidate_rows:${group.rows}`, "exact_source_title_is_contest_key_not_normalized_current_office_identity"],
  }));
}

export const northCarolinaLocalGeneralSpec: IntakeSpec = {
  id: "rapid-north-carolina-local-office-general-results-v1", version: 1, state: "NC",
  label: "North Carolina local-office general results",
  scope: "2024 general election county commissioner, school-board, register-of-deeds, court-clerk, sheriff, municipal council and mayor results",
  authority: "north_carolina_state_board_of_elections_precinct_results_archive",
  limitations: ["retained_2024_archive_snapshot_not_current_holder_roster", "source_does_not_mark_winners", "no_rank_based_winner_inference", "other_local_office_families_and_ballot_questions_excluded", "municipal_odd_year_elections_not_in_this_archive", "current_holder_identity_and_local_office_scoring_not_defined"],
  sources: [{ lockId: "nc-2024-general-results-pct-zip", cycleYear: 2024, electionDate: "2024-11-05", expect: { contests: 635, candidateRows: 1793, candidateVotes: 22_219_489 } }],
  parse: (bytes, _source, { fail }) => parseNorthCarolinaLocalGeneral(bytes, fail),
};
