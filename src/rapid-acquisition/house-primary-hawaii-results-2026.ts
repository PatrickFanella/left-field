import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface HawaiiPrimaryResult2026 {
  readonly resultId: `hi:primary:2026:${"01" | "02"}:democratic`;
  readonly cycleYear: 2026;
  readonly electionDate: "2026-08-08";
  readonly districtLabel: "HI-01" | "HI-02";
  readonly sourceLockIds: readonly ["hi-2026-primary-summary"];
  readonly sourceContestId: string;
  readonly sourceOfficeTitle: string;
  readonly sourceCandidateNames: readonly string[];
  readonly candidateVotes: readonly number[];
  readonly totalVotes: number;
  readonly totalPrecincts: number;
  readonly countedPrecincts: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_state_election_result_snapshot_retained_not_claimed_certified";
  readonly certificationStatus: "official_report_snapshot_no_certification_claim";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}

export interface HawaiiPrimaryResults2026 {
  readonly schema: "rapid-house-primary-hawaii-results-2026-v1";
  readonly version: 1;
  readonly sourceLockId: "hi-2026-primary-summary";
  readonly results: readonly HawaiiPrimaryResult2026[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ reportedContests: 2; candidateRows: 9; candidateVotes: 185586; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCE = {
  id: "hi-2026-primary-summary",
  url: "https://elections.hawaii.gov/wp-content/results/2026%20Primary/summary.txt",
  path: "data/source/rapid/house-primary/hi/2026/summary.txt",
  bytes: 31_544,
  sha256: "d21d1c0e7932cc105c78a3949bbc3387222d8193d37cc8f4faba16e57746e100",
} as const;
const EXPECTED = [
  ["HI-01", "266", 223, 1, [["CASE, Ed", 58_853], ["KEOHOKALOLE, Jarrett K.", 35_371], ["BOOKER, Jennifer", 2_158], ["KISWANTO, Nicholas (Nick)", 859], ["FATULA, Ben", 837]]],
  ["HI-02", "70", 273, 0, [["TOKUDA, Jill N.", 80_133], ["KING, Steven", 3_434], ["GUITHUES, Greg", 2_621], ["BASIN, Kirill", 1_320]]],
] as const;

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const exact = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const integer = (value: string, code: string) => { const parsed = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed)) throw new Error(code); return parsed; };
const unquote = (value: string) => value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).split('""').join('"') : value;

export function buildHawaiiPrimaryResults2026(root = process.cwd()): HawaiiPrimaryResults2026 {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const sourceBytes = readFileSync(join(root, SOURCE.path));
  const expectedLock = { id: SOURCE.id, url: SOURCE.url, retainedPath: SOURCE.path, retainedStatus: "retained", byteSize: SOURCE.bytes, sha256: SOURCE.sha256, kind: "official_result_snapshot", parentIds: [] };
  if (sourceBytes.length !== SOURCE.bytes || sha(sourceBytes) !== SOURCE.sha256 || lock.entries.filter((entry) => entry.id === SOURCE.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === SOURCE.id)), expectedLock)) throw new Error("HAWAII_2026_SOURCE_BINDING_INVALID");

  const rows = sourceBytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => line.split("\t").map(unquote));
  if (rows.length !== 295 || rows[0]?.[0] !== "#FormatVersion 1" || rows[1]?.[0] !== "#Contest ID" || rows[1]?.[20] !== "Total Votes" || rows.slice(2).some((row) => row.length !== 21)) throw new Error("HAWAII_2026_SCHEMA_INVALID");
  const target = rows.slice(2).filter((row) => row[1]?.startsWith("U.S. Representative, Dist ") && row[4] === "D");
  const grouped = new Map<string, string[][]>();
  for (const row of target) grouped.set(row[0]!, [...(grouped.get(row[0]!) ?? []), row]);
  if (grouped.size !== 2 || target.length !== 9) throw new Error("HAWAII_2026_CONTEST_CLOSURE_INVALID");

  const results = EXPECTED.map(([districtLabel, sourceContestId, totalPrecincts, countedPrecincts, expectedCandidates]) => {
    const contestRows = grouped.get(sourceContestId);
    if (!contestRows) throw new Error(`HAWAII_2026_CONTEST_MISSING:${sourceContestId}`);
    const sourceOfficeTitle = districtLabel === "HI-01" ? "U.S. Representative, Dist I" : "U.S. Representative, Dist II";
    const candidates = contestRows.map((row) => [row[15]!, integer(row[20]!, "HAWAII_2026_VOTE_INVALID")] as const);
    if (contestRows.some((row) => row[1] !== sourceOfficeTitle || row[4] !== "D" || integer(row[12]!, "HAWAII_2026_PRECINCT_INVALID") !== totalPrecincts || integer(row[13]!, "HAWAII_2026_PRECINCT_INVALID") !== countedPrecincts) || !exact(candidates, expectedCandidates)) throw new Error(`HAWAII_2026_CONTEST_INVALID:${sourceContestId}`);
    const sourceCandidateNames = candidates.map((row) => row[0]);
    const candidateVotes = candidates.map((row) => row[1]);
    const totalVotes = candidateVotes.reduce((sum, value) => sum + value, 0);
    const district = districtLabel.slice(-2) as "01" | "02";
    const unsigned = { resultId: `hi:primary:2026:${district}:democratic` as const, cycleYear: 2026 as const, electionDate: "2026-08-08" as const, districtLabel, sourceLockIds: [SOURCE.id] as const, sourceContestId, sourceOfficeTitle, sourceCandidateNames, candidateVotes, totalVotes, totalPrecincts, countedPrecincts, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_state_election_result_snapshot_retained_not_claimed_certified" as const, certificationStatus: "official_report_snapshot_no_certification_claim" as const, winnerIdentity: null, identity: null, scoreEligible: false as const };
    return { ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-hawaii-result:2026:v1", unsigned) } as HawaiiPrimaryResult2026;
  });
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-hawaii-result-set:2026:v1", results);
  const summary = { reportedContests: 2 as const, candidateRows: 9 as const, candidateVotes: 185586 as const, scoreEligibleRows: 0 as const };
  const unsigned = { schema: "rapid-house-primary-hawaii-results-2026-v1" as const, version: 1 as const, sourceLockId: SOURCE.id, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-hawaii-package:2026:v1", unsigned) };
}

export function validateHawaiiPrimaryResults2026(value: unknown, root = process.cwd()): HawaiiPrimaryResults2026 {
  const expected = buildHawaiiPrimaryResults2026(root);
  if (!exact(value, expected)) throw new Error("HAWAII_2026_RESULTS_INVALID");
  return value as HawaiiPrimaryResults2026;
}
