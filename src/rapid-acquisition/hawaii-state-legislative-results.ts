import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { byteCompare, hash, sha, exact } from "./shared";

export interface HawaiiStateLegislativeCandidate {
  readonly sourceCandidateId: string;
  readonly sourceName: string;
  readonly candidateSequence: number;
  readonly mailVotes: number;
  readonly inPersonVotes: number;
  readonly totalVotes: number;
}
export interface HawaiiStateLegislativeContest {
  readonly contestId: string;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: "2022-08-13" | "2024-08-10";
  readonly chamber: "upper" | "lower";
  readonly district: string;
  readonly rawOfficeTitle: string;
  readonly sourceContestId: string;
  readonly rawParty: "D" | "R";
  readonly registeredVoters: number;
  readonly totalPrecincts: number;
  readonly countedPrecincts: number;
  readonly blankVotes: number;
  readonly overVotes: number;
  readonly invalidVotes: number;
  readonly candidates: readonly HawaiiStateLegislativeCandidate[];
  readonly totalVotes: number;
  readonly reportingCompleteness: "candidate_channels_reconcile_to_source_total_votes";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_statewide_primary_summary_retained";
  readonly certificationStatus: "separate_candidate_level_certification_instrument_not_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly sourceLockIds: readonly string[];
  readonly formulaEligible: false;
  readonly contestSha256: string;
}
type CycleSummary = Readonly<{ cycleYear: 2022 | 2024; reportedPartyContests: number; candidateRows: number; candidateVotes: number }>;
export interface HawaiiStateLegislativeResults {
  readonly schema: "rapid-hawaii-state-legislative-primary-results-v1";
  readonly version: 1;
  readonly sourceScope: "reported_candidate_bearing_democratic_and_republican_state_legislative_primary_contests_only";
  readonly contests: readonly HawaiiStateLegislativeContest[];
  readonly cycles: readonly CycleSummary[];
  readonly contestSetSha256: string;
  readonly summary: Readonly<{ cycles: 2; reportedPartyContests: 243; upperChamberContests: 67; lowerChamberContests: 176; democraticContests: 136; republicanContests: 107; candidateRows: 352; candidateVotes: 807154; inferredNoContestRows: 0; formulaEligibleContests: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { year: 2022 as const, date: "2022-08-13" as const, id: "hi-2022-primary-summary", url: "https://files.hawaii.gov/elections/files/results/2022/primary/summary.txt", path: "data/source/rapid/house-primary/hi/2022/summary.txt", bytes: 109758, sha256: "26e5a0d6ab3c5ca94be40de9218f43eb9f2973acb0361d08ff8a957dec3819da", contests: 137, candidates: 205, votes: 511495 },
  { year: 2024 as const, date: "2024-08-10" as const, id: "hi-2024-primary-summary", url: "https://files.hawaii.gov/elections/files/results/2024/Primary/summary.txt", path: "data/source/rapid/house-primary/hi/2024/summary.txt", bytes: 77898, sha256: "e5a0f37a2f5a3c6d29b48d76375f901b8926a8c907ad3d3d1ffb4c893a943915", contests: 106, candidates: 147, votes: 295659 },
] as const;
const HEADER = ["#Contest ID","Contest Title","Contest Seq Nbr","Contest Type","Contest Party","Mail Blank Votes","In-Person Blank Votes","Mail Over Votes","In-Person Over Votes","Mail Invalid Votes","In-Person Invalid Votes","Registered Voters","Total Precincts","Counted Precincts","Candidate ID","Candidate Name","Candidate Seq Nbr","Candidate Party","Mail Votes","In-Person Votes","Total Votes"];
const fail = (code: string): never => { throw new Error(`HAWAII_STATE_LEGISLATIVE_${code}`); };
const integer = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fail("INTEGER_INVALID");

function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index++) { const character = text[index]!; if (quoted) { if (character === '"' && text[index + 1] === '"') { field += '"'; index++; } else if (character === '"') quoted = false; else field += character; } else if (character === '"') quoted = true; else if (character === ",") { row.push(field); field = ""; } else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; } else field += character; }
  if (quoted) fail("CSV_UNTERMINATED_QUOTE"); if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); } return rows.filter((value) => value.some((item) => item.length));
}

function parse(bytes: Buffer, source: typeof SOURCES[number]): HawaiiStateLegislativeContest[] {
  const decoded = new TextDecoder("utf-16le", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""), rows = csvRows(decoded);
  if (rows[0]?.length !== 1 || rows[0][0] !== "Format#1" || !exact(rows[1], HEADER)) fail(`HEADER_INVALID:${source.year}`);
  const grouped = new Map<string, string[][]>();
  for (const raw of rows.slice(2)) { const row = raw.at(-1) === "" ? raw.slice(0, -1) : raw; if (row.length !== 21) fail(`ROW_INVALID:${source.year}`); if (!/^(?:State Senator|State Representative), Dist \d+(?: Vacancy)?$/.test(row[1]!) || (row[4] !== "D" && row[4] !== "R")) continue; grouped.set(row[0]!, [...grouped.get(row[0]!) ?? [], row]); }
  const contests = [...grouped.values()].map((group) => {
    const first = group[0]!, title = first[1]!, chamber = title.startsWith("State Senator") ? "upper" as const : "lower" as const, districtMatch = title.match(/Dist (\d+)/), rawPartyInput = first[4];
    if (!districtMatch || (rawPartyInput !== "D" && rawPartyInput !== "R")) return fail("CONTEST_INVALID");
    const rawParty: "D" | "R" = rawPartyInput, district = String(Number(districtMatch[1])).padStart(chamber === "upper" ? 2 : 3, "0");
    const repeated = [1,2,3,4,5,6,7,8,9,10,11,12,13]; if (group.some((row) => repeated.some((index) => row[index] !== first[index]))) fail("CONTEST_METADATA_CONFLICT");
    const candidates = group.map((row) => { const mailVotes = integer(row[18]!), inPersonVotes = integer(row[19]!), totalVotes = integer(row[20]!); if (!row[14] || !row[15] || mailVotes + inPersonVotes !== totalVotes) fail("CANDIDATE_INVALID"); return { sourceCandidateId: row[14]!, sourceName: row[15]!, candidateSequence: integer(row[16]!), mailVotes, inPersonVotes, totalVotes }; });
    if (!candidates.length || new Set(candidates.map((row) => row.sourceCandidateId)).size !== candidates.length || new Set(candidates.map((row) => row.sourceName)).size !== candidates.length) fail("CANDIDATE_DUPLICATE");
    const unsigned = { contestId: `hi:state-leg-primary:${source.year}:${chamber}:${district}:${rawParty}`, cycleYear: source.year, electionDate: source.date, chamber, district, rawOfficeTitle: title, sourceContestId: first[0]!, rawParty, registeredVoters: integer(first[11]!), totalPrecincts: integer(first[12]!), countedPrecincts: integer(first[13]!), blankVotes: integer(first[5]!) + integer(first[6]!), overVotes: integer(first[7]!) + integer(first[8]!), invalidVotes: integer(first[9]!) + integer(first[10]!), candidates, totalVotes: candidates.reduce((sum, row) => sum + row.totalVotes, 0), reportingCompleteness: "candidate_channels_reconcile_to_source_total_votes" as const, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_statewide_primary_summary_retained" as const, certificationStatus: "separate_candidate_level_certification_instrument_not_retained" as const, winnerIdentity: null, identity: null, sourceLockIds: [source.id], formulaEligible: false as const };
    return { ...unsigned, contestSha256: hash("dsa-seats:rapid-hawaii-state-legislative-contest:v1", unsigned) };
  });
  contests.sort((left, right) => byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
  if (contests.length !== source.contests || contests.reduce((sum, row) => sum + row.candidates.length, 0) !== source.candidates || contests.reduce((sum, row) => sum + row.totalVotes, 0) !== source.votes) fail(`CYCLE_CLOSURE_INVALID:${source.year}`); return contests;
}

export function buildHawaiiStateLegislativeResults(root = process.cwd()): HawaiiStateLegislativeResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, contests: HawaiiStateLegislativeContest[] = [], cycles: CycleSummary[] = [];
  for (const source of SOURCES) { const bytes = readFileSync(join(root, source.path)), expected = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] }; if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || lock.entries.filter((row) => row.id === source.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((row) => row.id === source.id)), expected)) fail(`SOURCE_INVALID:${source.year}`); const parsed = parse(bytes, source); contests.push(...parsed); cycles.push({ cycleYear: source.year, reportedPartyContests: source.contests, candidateRows: source.candidates, candidateVotes: source.votes }); }
  contests.sort((left, right) => left.cycleYear - right.cycleYear || byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
  const summary = { cycles: 2 as const, reportedPartyContests: 243 as const, upperChamberContests: 67 as const, lowerChamberContests: 176 as const, democraticContests: 136 as const, republicanContests: 107 as const, candidateRows: 352 as const, candidateVotes: 807154 as const, inferredNoContestRows: 0 as const, formulaEligibleContests: 0 as const }, actual = { cycles: cycles.length, reportedPartyContests: contests.length, upperChamberContests: contests.filter((row) => row.chamber === "upper").length, lowerChamberContests: contests.filter((row) => row.chamber === "lower").length, democraticContests: contests.filter((row) => row.rawParty === "D").length, republicanContests: contests.filter((row) => row.rawParty === "R").length, candidateRows: contests.reduce((sum, row) => sum + row.candidates.length, 0), candidateVotes: contests.reduce((sum, row) => sum + row.totalVotes, 0), inferredNoContestRows: 0, formulaEligibleContests: 0 }; if (!exact(actual, summary)) fail("SUMMARY_INVALID");
  const contestSetSha256 = hash("dsa-seats:rapid-hawaii-state-legislative-contest-set:v1", contests), unsigned = { schema: "rapid-hawaii-state-legislative-primary-results-v1" as const, version: 1 as const, sourceScope: "reported_candidate_bearing_democratic_and_republican_state_legislative_primary_contests_only" as const, contests, cycles, contestSetSha256, summary }; return { ...unsigned, packageSha256: hash("dsa-seats:rapid-hawaii-state-legislative-package:v1", unsigned) };
}
export function validateHawaiiStateLegislativeResults(value: unknown, root = process.cwd()): HawaiiStateLegislativeResults { const expected = buildHawaiiStateLegislativeResults(root); if (!exact(value, expected)) throw new Error("HAWAII_STATE_LEGISLATIVE_RESULTS_INVALID"); return value as HawaiiStateLegislativeResults; }
