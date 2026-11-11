import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { byteCompare, hash, sha, exact } from "./shared";

export interface NorthCarolinaStateLegislativeCandidate { readonly sourceName: string; readonly rawCandidateParty: "DEM" | "REP"; readonly votes: number }
export interface NorthCarolinaStateLegislativeContest {
  readonly contestId: string; readonly cycleYear: 2022 | 2024 | 2026; readonly electionDate: "2022-05-17" | "2024-03-05" | "2026-03-03"; readonly chamber: "upper" | "lower"; readonly district: string; readonly rawOfficeTitle: string; readonly sourceContestGroupId: string; readonly rawParty: "D" | "R"; readonly candidates: readonly NorthCarolinaStateLegislativeCandidate[]; readonly precinctCandidateRows: number; readonly totalVotes: number; readonly reportingCompleteness: "vote_channels_sum_to_row_total_and_candidate_aggregation_complete"; readonly sourceWinnerStatus: "not_marked_by_source"; readonly resultAuthorityStatus: "official_state_board_precinct_results_archive_retained"; readonly certificationStatus: "separate_state_canvass_instrument_not_bound_for_state_legislative_contests"; readonly winnerIdentity: null; readonly identity: null; readonly sourceLockIds: readonly string[]; readonly formulaEligible: false; readonly contestSha256: string;
}
type CycleSummary = Readonly<{ cycleYear: 2022 | 2024 | 2026; officeDistrictRows: number; partyContests: number; candidateRows: number; precinctCandidateRows: number; candidateVotes: number }>;
export interface NorthCarolinaStateLegislativeResults { readonly schema: "rapid-north-carolina-state-legislative-primary-results-v1"; readonly version: 1; readonly contests: readonly NorthCarolinaStateLegislativeContest[]; readonly cycles: readonly CycleSummary[]; readonly contestSetSha256: string; readonly summary: Readonly<{ officeDistrictRows: 164; partyContests: 176; candidateRows: 404; precinctCandidateRows: 14848; candidateVotes: 1829202; formulaEligibleContests: 0 }>; readonly packageSha256: string }

const SOURCES = [
  { year: 2022 as const, date: "2022-05-17" as const, id: "nc-2022-primary-official-results-archive", url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2022_05_17/results_pct_20220517.zip", path: "data/source/elections/primary-results/north-carolina/2022/official-results.zip", bytes: 2181778, sha256: "705b203290e4131455d3e1d3bb31cf496260c68c88cbe734b84bda5318ede3c1", member: "results_pct_20220517.txt", offices: 66, contests: 73, candidates: 170, rows: 6806, votes: 739964 },
  { year: 2024 as const, date: "2024-03-05" as const, id: "nc-2024-primary-official-results-archive", url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_03_05/results_pct_20240305.zip", path: "data/source/elections/primary-results/north-carolina/2024/official-results.zip", bytes: 4464845, sha256: "0b0475a6df5ecd0d47a21ee51c96782934de768f8ef60eb3a9ae7d83021fea30", member: "results_pct_20240305.txt", offices: 42, contests: 43, candidates: 102, rows: 3270, votes: 488918 },
  { year: 2026 as const, date: "2026-03-03" as const, id: "nc-2026-primary-official-results-archive", url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2026_03_03/results_pct_20260303.zip", path: "data/source/elections/primary-results/north-carolina/2026/official-results.zip", bytes: 1427371, sha256: "d5450bfad8386ab12cf69f558776c79bc2301f89d33cce510de0fb7a26add484", member: "results_pct_20260303.txt", offices: 56, contests: 60, candidates: 132, rows: 4772, votes: 600320 },
] as const;
const fail = (code: string): never => { throw new Error(`NORTH_CAROLINA_STATE_LEGISLATIVE_${code}`); };
const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fail("INTEGER_INVALID");

function parseArchive(bytes: Buffer, source: typeof SOURCES[number]): NorthCarolinaStateLegislativeContest[] {
  let files: Record<string, Uint8Array>; try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("ARCHIVE_INVALID"); }
  if (!exact(Object.keys(files), [source.member])) fail(`MEMBER_INVALID:${source.year}`);
  const lines = Buffer.from(files[source.member]!).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0), headers = lines[0]!.split("\t");
  const early = source.year === 2022 ? "One Stop" : "Early Voting", expected = ["County","Election Date","Precinct","Contest Group ID","Contest Type","Contest Name","Choice","Choice Party","Vote For","Election Day",early,"Absentee by Mail","Provisional","Total Votes","Real Precinct",...(source.year === 2022 ? [] : [""])];
  if (!exact(headers, expected)) fail(`HEADER_INVALID:${source.year}`);
  const grouped = new Map<string, { chamber: "upper" | "lower"; district: string; title: string; sourceId: string; party: "D" | "R"; rows: number; totals: Map<string, number> }>();
  for (const line of lines.slice(1)) {
    const fields = line.split("\t"); if (fields.length !== headers.length) fail(`ROW_WIDTH_INVALID:${source.year}`);
    const row = Object.fromEntries(headers.map((header, index) => [header, fields[index]!])), match = row["Contest Name"]!.match(/^NC (HOUSE OF REPRESENTATIVES DISTRICT|STATE SENATE DISTRICT) (\d+) \((DEM|REP)\)$/); if (!match) continue;
    const chamber = match[1]!.startsWith("HOUSE") ? "lower" as const : "upper" as const, district = String(Number(match[2])).padStart(chamber === "upper" ? 2 : 3, "0"), sourceParty = match[3] as "DEM" | "REP", party = sourceParty === "DEM" ? "D" as const : "R" as const;
    if (row["Election Date"] !== source.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1") || row["Contest Type"] !== "S" || row["Choice Party"] !== sourceParty || row["Vote For"] !== "1") fail(`ROW_SEMANTICS_INVALID:${source.year}`);
    const channels = [row["Election Day"]!, row[early]!, row["Absentee by Mail"]!, row["Provisional"]!].map(integer), total = integer(row["Total Votes"]!); if (channels.reduce((sum, value) => sum + value, 0) !== total) fail(`ROW_RECONCILIATION_INVALID:${source.year}`);
    const key = `${chamber}:${district}:${party}`, group = grouped.get(key) ?? { chamber, district, title: row["Contest Name"]!, sourceId: row["Contest Group ID"]!, party, rows: 0, totals: new Map<string, number>() };
    if (group.title !== row["Contest Name"] || group.sourceId !== row["Contest Group ID"] || !row["Choice"]!.trim()) fail(`CONTEST_IDENTITY_INVALID:${source.year}`);
    group.rows++; group.totals.set(row["Choice"]!, (group.totals.get(row["Choice"]!) ?? 0) + total); grouped.set(key, group);
  }
  const contests = [...grouped.values()].map((group) => {
    const rawCandidateParty = group.party === "D" ? "DEM" as const : "REP" as const, candidates = [...group.totals].sort(([left], [right]) => byteCompare(left, right)).map(([sourceName, votes]) => ({ sourceName, rawCandidateParty, votes }));
    const unsigned = { contestId: `nc:state-leg-primary:${source.year}:${group.chamber}:${group.district}:${group.party}`, cycleYear: source.year, electionDate: source.date, chamber: group.chamber, district: group.district, rawOfficeTitle: group.title, sourceContestGroupId: group.sourceId, rawParty: group.party, candidates, precinctCandidateRows: group.rows, totalVotes: candidates.reduce((sum, row) => sum + row.votes, 0), reportingCompleteness: "vote_channels_sum_to_row_total_and_candidate_aggregation_complete" as const, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_state_board_precinct_results_archive_retained" as const, certificationStatus: "separate_state_canvass_instrument_not_bound_for_state_legislative_contests" as const, winnerIdentity: null, identity: null, sourceLockIds: [source.id], formulaEligible: false as const };
    return { ...unsigned, contestSha256: hash("dsa-seats:rapid-north-carolina-state-legislative-contest:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
  if (new Set(contests.map((row) => `${row.chamber}:${row.district}`)).size !== source.offices || contests.length !== source.contests || contests.reduce((sum, row) => sum + row.candidates.length, 0) !== source.candidates || contests.reduce((sum, row) => sum + row.precinctCandidateRows, 0) !== source.rows || contests.reduce((sum, row) => sum + row.totalVotes, 0) !== source.votes) fail(`CYCLE_CLOSURE_INVALID:${source.year}`);
  return contests;
}

export function buildNorthCarolinaStateLegislativeResults(root = process.cwd()): NorthCarolinaStateLegislativeResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, contests: NorthCarolinaStateLegislativeContest[] = [], cycles: CycleSummary[] = [];
  for (const source of SOURCES) { const bytes = readFileSync(join(root, source.path)), expected = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] }; if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || lock.entries.filter((row) => row.id === source.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((row) => row.id === source.id)), expected)) fail(`SOURCE_INVALID:${source.year}`); const rows = parseArchive(bytes, source); contests.push(...rows); cycles.push({ cycleYear: source.year, officeDistrictRows: source.offices, partyContests: source.contests, candidateRows: source.candidates, precinctCandidateRows: source.rows, candidateVotes: source.votes }); }
  contests.sort((left, right) => left.cycleYear - right.cycleYear || byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
  const summary = { officeDistrictRows: 164 as const, partyContests: 176 as const, candidateRows: 404 as const, precinctCandidateRows: 14848 as const, candidateVotes: 1829202 as const, formulaEligibleContests: 0 as const }; if (contests.some((row) => row.formulaEligible || row.sourceWinnerStatus !== "not_marked_by_source")) fail("LIFECYCLE_INVALID");
  const contestSetSha256 = hash("dsa-seats:rapid-north-carolina-state-legislative-contest-set:v1", contests), unsigned = { schema: "rapid-north-carolina-state-legislative-primary-results-v1" as const, version: 1 as const, contests, cycles, contestSetSha256, summary }; return { ...unsigned, packageSha256: hash("dsa-seats:rapid-north-carolina-state-legislative-package:v1", unsigned) };
}
export function validateNorthCarolinaStateLegislativeResults(value: unknown, root = process.cwd()): NorthCarolinaStateLegislativeResults { const expected = buildNorthCarolinaStateLegislativeResults(root); if (!exact(value, expected)) throw new Error("NORTH_CAROLINA_STATE_LEGISLATIVE_RESULTS_INVALID"); return value as NorthCarolinaStateLegislativeResults; }
