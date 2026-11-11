import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";

const SOURCES = [
  { year: 2022 as const, date: "2022-05-17" as const, id: "nc-2022-primary-official-results-archive", url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2022_05_17/results_pct_20220517.zip", path: "data/source/elections/primary-results/north-carolina/2022/official-results.zip", bytes: 2181778, sha256: "705b203290e4131455d3e1d3bb31cf496260c68c88cbe734b84bda5318ede3c1", member: "results_pct_20220517.txt", contests: 505, candidates: 1709, rows: 45616, blankRows: 12, votes: 4754030 },
  { year: 2024 as const, date: "2024-03-05" as const, id: "nc-2024-primary-official-results-archive", url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_03_05/results_pct_20240305.zip", path: "data/source/elections/primary-results/north-carolina/2024/official-results.zip", bytes: 4464845, sha256: "0b0475a6df5ecd0d47a21ee51c96782934de768f8ef60eb3a9ae7d83021fea30", member: "results_pct_20240305.txt", contests: 236, candidates: 851, rows: 21365, blankRows: 0, votes: 3400353 },
  { year: 2026 as const, date: "2026-03-03" as const, id: "nc-2026-primary-official-results-archive", url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2026_03_03/results_pct_20260303.zip", path: "data/source/elections/primary-results/north-carolina/2026/official-results.zip", bytes: 1427371, sha256: "d5450bfad8386ab12cf69f558776c79bc2301f89d33cce510de0fb7a26add484", member: "results_pct_20260303.txt", contests: 354, candidates: 1198, rows: 32633, blankRows: 2, votes: 4119543 },
] as const;
const COUNTY_SOURCE = { id: "rapid-county-demographics-projection-v1", path: "data/metadata/rapid-county-demographics-projection-v1.json", bytes: 2441846, sha256: "ebbeb1127151a78985e97a7971d580edd637f746b63b6845353c63407989c8fc", packageSha256: "f3285added7c4fcc1ef713c1a279bec90f918e12204ef184fb085895395cfceb" } as const;
type OfficeFamily = "county_commissioner" | "board_of_education" | "register_of_deeds" | "clerk_of_superior_court" | "county_sheriff" | "municipal_council" | "municipal_mayor";
type RawParty = "D" | "R" | "NONPARTISAN";
type Candidate = Readonly<{ sourceName: string; votes: number }>;
export interface NorthCarolinaLocalOfficeContest { readonly contestId: string; readonly cycleYear: 2022 | 2024 | 2026; readonly electionDate: "2022-05-17" | "2024-03-05" | "2026-03-03"; readonly countyFips: string; readonly sourceCountyName: string; readonly officeFamily: OfficeFamily; readonly sourceContestGroupId: string; readonly rawOfficeTitle: string; readonly seats: number; readonly rawParty: RawParty; readonly candidates: readonly Candidate[]; readonly precinctCandidateRows: number; readonly totalVotes: number; readonly reportingCompleteness: "vote_channels_sum_to_row_total_and_candidate_aggregation_complete"; readonly sourceWinnerStatus: "not_marked_by_source"; readonly currentHolderIdentity: null; readonly formulaEligible: false; readonly formulaIneligibleReasons: readonly ["local_office_formula_not_defined", "current_holder_identity_not_collected"]; readonly sourceLockIds: readonly string[]; readonly contestSha256: string }
type CycleSummary = Readonly<{ cycleYear: 2022 | 2024 | 2026; officeContests: number; candidateRows: number; precinctCandidateRows: number; blankChoiceRowsExcluded: number; candidateVotes: number }>;
export interface NorthCarolinaLocalOfficeResults { readonly schema: "rapid-north-carolina-local-office-primary-results-v1"; readonly version: 1; readonly authority: "official_north_carolina_state_board_precinct_results_archives"; readonly contests: readonly NorthCarolinaLocalOfficeContest[]; readonly cycles: readonly CycleSummary[]; readonly summary: Readonly<{ officeFamilies: 7; officeContests: 1095; democraticContests: 228; republicanContests: 546; nonpartisanContests: 321; candidateRows: 3758; precinctCandidateRows: 99614; blankChoiceRowsExcluded: 14; candidateVotes: 12273926; formulaEligibleContests: 0 }>; readonly contestSetSha256: string; readonly packageSha256: string }

const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(cmp).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const fail = (code: string): never => { throw new Error(`NORTH_CAROLINA_LOCAL_OFFICE_${code}`); };
const clean = (value: string) => value.replace(/\0+$/, "").trim();
const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fail("INTEGER_INVALID");
const voteChannel = (value: string) => value === "" ? 0 : integer(value);
const normalizeCounty = (value: string) => value.toUpperCase().replace(/ COUNTY$/, "").replace(/[^A-Z0-9]/g, "");
function classify(title: string): OfficeFamily | null {
  if (/REFERENDUM|BOND|TAX|BEVERAGE ELECTION/.test(title)) return null;
  if (/COUNTY BOARD OF COMMISSIONERS/.test(title) || title === "PASQUOTANK COUNTY COMMISSIONERS SOUTHERN INSIDE (UNEXPIRED) (DEM)") return "county_commissioner";
  if (/BOARD OF EDUCATION/.test(title) || title === "DURHAM CO BD OF EDUCATION CONSOLIDATED DIST B (UNEXPIRED)") return "board_of_education";
  if (/REGISTER OF DEEDS/.test(title)) return "register_of_deeds";
  if (/CLERK OF SUPERIOR COURT/.test(title)) return "clerk_of_superior_court";
  if (/COUNTY SHERIFF/.test(title)) return "county_sheriff";
  if (/^(?:CITY|TOWN|VILLAGE) OF .* (?:CITY )?(?:COUNCIL|COUNCIL MEMBER|COUNCILMAN|ALDERMAN|COMMISSIONER)/.test(title)) return "municipal_council";
  if (/^(?:CITY|TOWN|VILLAGE) OF .* MAYOR/.test(title) || title === "MOREHEAD CITY MAYOR") return "municipal_mayor";
  return null;
}
function sourceParty(title: string): RawParty { return /\(DEM\)$/.test(title) ? "D" : /\(REP\)$/.test(title) ? "R" : "NONPARTISAN"; }

type Group = { countyFips: string; county: string; family: OfficeFamily; sourceId: string; title: string; seats: number; party: RawParty; rows: number; totals: Map<string, number> };
function parseArchive(bytes: Buffer, source: typeof SOURCES[number], countyFips: ReadonlyMap<string, string>): NorthCarolinaLocalOfficeContest[] {
  let files: Record<string, Uint8Array>; try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("ARCHIVE_INVALID"); }
  if (canonical(Object.keys(files)) !== canonical([source.member])) fail(`MEMBER_INVALID:${source.year}`);
  const lines = Buffer.from(files[source.member]!).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean), headers = lines[0]!.split("\t").map(clean);
  const early = source.year === 2022 ? "One Stop" : "Early Voting", expected = ["County","Election Date","Precinct","Contest Group ID","Contest Type","Contest Name","Choice","Choice Party","Vote For","Election Day",early,"Absentee by Mail","Provisional","Total Votes","Real Precinct",...(source.year === 2022 ? [] : [""])];
  if (canonical(headers) !== canonical(expected)) fail(`HEADER_INVALID:${source.year}`);
  const grouped = new Map<string, Group>(); let blankRows = 0;
  for (const line of lines.slice(1)) {
    const fields = line.split("\t").map(clean); if (fields.length !== headers.length) fail(`ROW_WIDTH_INVALID:${source.year}`);
    const row = Object.fromEntries(headers.map((header, index) => [header, fields[index]!])), family = classify(row["Contest Name"]!); if (row["Contest Type"] !== "C" || !family) continue;
    const county = row.County!, countyFipsValue = countyFips.get(normalizeCounty(county)); if (typeof countyFipsValue !== "string") fail(`COUNTY_INVALID:${source.year}:${county}`); const fips = countyFipsValue as string;
    if (row["Election Date"] !== source.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1")) fail(`DATE_INVALID:${source.year}`);
    const party = sourceParty(row["Contest Name"]!), candidateParty = row["Choice Party"]!; if (candidateParty && candidateParty !== (party === "D" ? "DEM" : party === "R" ? "REP" : "")) fail(`PARTY_INVALID:${source.year}`);
    const channels = [row["Election Day"]!, row[early]!, row["Absentee by Mail"]!, row.Provisional!].map(voteChannel), total = integer(row["Total Votes"]!); if (channels.reduce((sum, value) => sum + value, 0) !== total) fail(`ROW_RECONCILIATION_INVALID:${source.year}`); if (!row.Choice) { if (total !== 0) fail(`BLANK_CHOICE_INVALID:${source.year}`); blankRows++; continue; }
    const key = `${fips}:${row["Contest Group ID"]}`, seats = integer(row["Vote For"]!), existing = grouped.get(key), group = existing ?? { countyFips: fips, county, family, sourceId: row["Contest Group ID"]!, title: row["Contest Name"]!, seats, party, rows: 0, totals: new Map() };
    if (group.county !== county || group.family !== family || group.title !== row["Contest Name"] || group.seats !== seats || group.party !== party) fail(`CONTEST_IDENTITY_INVALID:${source.year}`);
    group.rows++; group.totals.set(row.Choice, (group.totals.get(row.Choice) ?? 0) + total); grouped.set(key, group);
  }
  const contests = [...grouped.values()].map((group) => {
    const candidates = [...group.totals].sort(([a], [b]) => cmp(a, b)).map(([sourceName, votes]) => ({ sourceName, votes }));
    const unsigned = { contestId: `nc:local-primary:${source.year}:${group.countyFips}:${group.sourceId}`, cycleYear: source.year, electionDate: source.date, countyFips: group.countyFips, sourceCountyName: group.county, officeFamily: group.family, sourceContestGroupId: group.sourceId, rawOfficeTitle: group.title, seats: group.seats, rawParty: group.party, candidates, precinctCandidateRows: group.rows, totalVotes: candidates.reduce((sum, row) => sum + row.votes, 0), reportingCompleteness: "vote_channels_sum_to_row_total_and_candidate_aggregation_complete" as const, sourceWinnerStatus: "not_marked_by_source" as const, currentHolderIdentity: null, formulaEligible: false as const, formulaIneligibleReasons: ["local_office_formula_not_defined", "current_holder_identity_not_collected"] as const, sourceLockIds: [source.id, COUNTY_SOURCE.id] };
    return { ...unsigned, contestSha256: hash("dsa-seats:rapid-north-carolina-local-office-contest:v1", unsigned) };
  }).sort((a, b) => cmp(a.countyFips, b.countyFips) || cmp(a.officeFamily, b.officeFamily) || cmp(a.sourceContestGroupId, b.sourceContestGroupId));
  if (contests.length !== source.contests || contests.reduce((sum, row) => sum + row.candidates.length, 0) !== source.candidates || contests.reduce((sum, row) => sum + row.precinctCandidateRows, 0) !== source.rows || blankRows !== source.blankRows || contests.reduce((sum, row) => sum + row.totalVotes, 0) !== source.votes) fail(`CYCLE_CLOSURE_INVALID:${source.year}`);
  return contests;
}

export function buildNorthCarolinaLocalOfficeResults(root = process.cwd()): NorthCarolinaLocalOfficeResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, countyBytes = readFileSync(join(root, COUNTY_SOURCE.path)), countyEntry = lock.entries.find((row) => row.id === COUNTY_SOURCE.id);
  if (countyBytes.length !== COUNTY_SOURCE.bytes || sha(countyBytes) !== COUNTY_SOURCE.sha256 || !countyEntry || countyEntry.retainedPath !== COUNTY_SOURCE.path || countyEntry.byteSize !== COUNTY_SOURCE.bytes || countyEntry.sha256 !== COUNTY_SOURCE.sha256) fail("COUNTY_SOURCE_INVALID");
  const countyData = JSON.parse(countyBytes.toString("utf8")) as { packageSha256?: unknown; rows?: readonly { stateCode?: unknown; countyName?: unknown; countyFips?: unknown }[] }; if (countyData.packageSha256 !== COUNTY_SOURCE.packageSha256 || !Array.isArray(countyData.rows)) fail("COUNTY_PACKAGE_INVALID"); const countyRows = countyData.rows as readonly { stateCode?: unknown; countyName?: unknown; countyFips?: unknown }[];
  const countyFips = new Map<string, string>(countyRows.filter((row) => row.stateCode === "NC").map((row) => { if (typeof row.countyName !== "string" || typeof row.countyFips !== "string") fail("COUNTY_ROW_INVALID"); const countyName = row.countyName as string, fips = row.countyFips as string; return [normalizeCounty(countyName), fips] as const; })); if (countyFips.size !== 100) fail("COUNTY_CLOSURE_INVALID");
  const contests: NorthCarolinaLocalOfficeContest[] = [], cycles: CycleSummary[] = [];
  for (const source of SOURCES) { const bytes = readFileSync(join(root, source.path)), expected = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] }, matches = lock.entries.filter((row) => row.id === source.id); if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || matches.length !== 1 || canonical(sourceLockContent(matches[0])) !== canonical(expected)) fail(`SOURCE_INVALID:${source.year}`); const parsed = parseArchive(bytes, source, countyFips); contests.push(...parsed); cycles.push({ cycleYear: source.year, officeContests: source.contests, candidateRows: source.candidates, precinctCandidateRows: source.rows, blankChoiceRowsExcluded: source.blankRows, candidateVotes: source.votes }); }
  contests.sort((a, b) => a.cycleYear - b.cycleYear || cmp(a.countyFips, b.countyFips) || cmp(a.officeFamily, b.officeFamily) || cmp(a.sourceContestGroupId, b.sourceContestGroupId));
  const summary = { officeFamilies: 7 as const, officeContests: 1095 as const, democraticContests: 228 as const, republicanContests: 546 as const, nonpartisanContests: 321 as const, candidateRows: 3758 as const, precinctCandidateRows: 99614 as const, blankChoiceRowsExcluded: 14 as const, candidateVotes: 12273926 as const, formulaEligibleContests: 0 as const };
  const actual = { officeFamilies: new Set(contests.map((row) => row.officeFamily)).size, officeContests: contests.length, democraticContests: contests.filter((row) => row.rawParty === "D").length, republicanContests: contests.filter((row) => row.rawParty === "R").length, nonpartisanContests: contests.filter((row) => row.rawParty === "NONPARTISAN").length, candidateRows: contests.reduce((sum, row) => sum + row.candidates.length, 0), precinctCandidateRows: contests.reduce((sum, row) => sum + row.precinctCandidateRows, 0), blankChoiceRowsExcluded: cycles.reduce((sum, row) => sum + row.blankChoiceRowsExcluded, 0), candidateVotes: contests.reduce((sum, row) => sum + row.totalVotes, 0), formulaEligibleContests: 0 };
  if (canonical(actual) !== canonical(summary)) fail("SUMMARY_INVALID");
  const contestSetSha256 = hash("dsa-seats:rapid-north-carolina-local-office-contest-set:v1", contests), unsigned = { schema: "rapid-north-carolina-local-office-primary-results-v1" as const, version: 1 as const, authority: "official_north_carolina_state_board_precinct_results_archives" as const, contests, cycles, summary, contestSetSha256 }; return { ...unsigned, packageSha256: hash("dsa-seats:rapid-north-carolina-local-office-package:v1", unsigned) };
}
export function validateNorthCarolinaLocalOfficeResults(value: unknown, root = process.cwd()): NorthCarolinaLocalOfficeResults { const expected = buildNorthCarolinaLocalOfficeResults(root); if (canonical(value) !== canonical(expected)) throw new Error("NORTH_CAROLINA_LOCAL_OFFICE_RESULTS_INVALID"); return value as NorthCarolinaLocalOfficeResults; }
