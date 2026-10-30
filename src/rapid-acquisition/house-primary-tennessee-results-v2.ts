import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { byteCompare, hash, sha, exact } from "./shared";

import {
  type TennesseePrimaryResult,
  validateTennesseePrimaryResults,
} from "./house-primary-tennessee-results";

export interface TennesseePrimaryResult2026 {
  readonly resultId: "tn:primary:2026:09:democratic";
  readonly cycleYear: 2026;
  readonly electionDate: "2026-08-06";
  readonly districtLabel: "TN-09";
  readonly sourceLockIds: readonly ["tn-2026-congressional-primary-enr"];
  readonly portalRaceCount: 18;
  readonly sourceCandidateNames: readonly string[];
  readonly candidateVotes: readonly number[];
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_state_enr_final_unofficial_result_snapshot_retained";
  readonly certificationStatus: "final_unofficial_no_separate_certification_instrument_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}

export interface TennesseePrimaryResultsV2 {
  readonly schema: "rapid-house-primary-tennessee-results-v2";
  readonly version: 2;
  readonly parentPackageSha256: string;
  readonly results: readonly (TennesseePrimaryResult | TennesseePrimaryResult2026)[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ reportedContests: 3; candidateRows: 11; candidateVotes: 160076; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCE = {
  id: "tn-2026-congressional-primary-enr",
  url: "https://www.elections.tn.gov/categories/congressional/offices",
  path: "data/source/rapid/house-primary/tn/2026/congressional-results.html",
  bytes: 70_586,
  sha256: "3bc6693f8f732a120ceb0c1e5cf947dfaa601b6fb8099a930a9c1245406cc9ea",
} as const;
const PARENT = {
  id: "rapid-house-primary-tennessee-results-v1",
  path: "data/metadata/rapid-house-primary-tennessee-results-v1.json",
  bytes: 2_195,
  sha256: "c1a3c5ea64031e028a0c0b3c094dcd4b9bc65d726df9e48384a8f6a09d79ffe0",
  packageSha256: "45db43e480800897d4f68a71c1d41ce6e166ac006934a10cf078a90bb05b7e9e",
} as const;
const EXPECTED_DEMOCRATIC = [
  [["Kristi Burke", 12_393], ["David S. Kerr, Jr.", 1_925], ["Hernan H. Garcia", 1_856]],
  [["Michaela Barnett", 38_877]],
  [["Anna Golladay", 27_725], ["Bryan Martin", 7_116]],
  [["Victoria Broderick", 12_422], ["Mike Cortese", 9_216], ["Joyce E. Neal", 7_224], ["Tim Lanier", 2_455], ["Cliff Huffman", 1_478]],
  [["Chaz Molder", 17_729], ["Yolanda Cooper-Sutton", 14_361], ["Rachel Hurley", 4_857], ["DeVante R. Hill", 4_324], ["Carrie Ann Iacomini", 2_491]],
  [["Mike Croley", 11_594], ["Chaney Mosley", 9_625], ["Lore Bergman", 9_216], ["Miriam Leibowitz", 6_832], ["Christopher Martin Finley", 2_855]],
  [["Darden Copeland", 16_641], ["Vincent Dixie", 11_385], ["Saletta Holloway", 9_980], ["Joshua Warren Sales", 3_741]],
  [["Heidi Kuhn", 23_783], ["Dewey Gordon Bryan", 9_609], ["Leonard Perkins", 7_716], ["Jordan D. Hinders", 4_670]],
  [["Justin J. Pearson", 32_092], ["London Lamar", 11_870], ["M. LaTroy A-Williams", 3_318], ["Jim Torino", 1_531]],
] as const;


function decodeAttribute(value: string): string {
  return value.split("&quot;").join('"').split("&#039;").join("'").split("&amp;").join("&").split("&lt;").join("<").split("&gt;").join(">");
}

function parseDemocraticHouseRaces(html: string): readonly (readonly (readonly [string, number])[])[] {
  if (!html.includes("August 6th, 2026 Unofficial Election Results") || !html.includes("Final Unofficial Results") || !html.includes("Results and reporting statistics are submitted by county election commissions")) throw new Error("TENNESSEE_2026_AUTHORITY_BOUNDARY_INVALID");
  const allHouseRaces = [...html.matchAll(/<div class="chart-container" data-race="United_States_House_of_Representatives_District_\d+_(?:Democratic|Republican)_Primary"/g)];
  if (allHouseRaces.length !== 18) throw new Error("TENNESSEE_2026_PORTAL_RACE_COUNT_INVALID");
  const races = new Map<number, readonly (readonly [string, number])[]>();
  const pattern = /<div class="chart-container" data-race="United_States_House_of_Representatives_District_(\d+)_Democratic_Primary"[^>]*data-candidates="([\s\S]*?)">/g;
  for (const match of html.matchAll(pattern)) {
    const district = Number(match[1]);
    const parsed = JSON.parse(decodeAttribute(match[2])) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`TENNESSEE_2026_CANDIDATES_INVALID:${district}`);
    const candidates = parsed.map((candidate) => {
      if (!candidate || typeof candidate !== "object") throw new Error(`TENNESSEE_2026_CANDIDATE_INVALID:${district}`);
      const value = candidate as Record<string, unknown>;
      if (typeof value.name !== "string" || value.party !== "Democratic" || !Number.isSafeInteger(value.votes) || (value.votes as number) < 0 || Object.keys(value).sort(byteCompare).join(",") !== "name,party,votes") throw new Error(`TENNESSEE_2026_CANDIDATE_INVALID:${district}`);
      return [value.name, value.votes as number] as const;
    });
    if (races.has(district)) throw new Error(`TENNESSEE_2026_DUPLICATE_RACE:${district}`);
    races.set(district, candidates);
  }
  const ordered = Array.from({ length: 9 }, (_, index) => races.get(index + 1));
  if (ordered.some((row) => !row) || races.size !== 9 || !exact(ordered, EXPECTED_DEMOCRATIC)) throw new Error("TENNESSEE_2026_HOUSE_INVENTORY_INVALID");
  return ordered as readonly (readonly (readonly [string, number])[])[];
}

export function buildTennesseePrimaryResultsV2(root = process.cwd()): TennesseePrimaryResultsV2 {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const parentBytes = readFileSync(join(root, PARENT.path));
  if (parentBytes.length !== PARENT.bytes || sha(parentBytes) !== PARENT.sha256) throw new Error("TENNESSEE_V2_PARENT_BYTES_INVALID");
  const parent = validateTennesseePrimaryResults(JSON.parse(parentBytes.toString("utf8")), root);
  if (parent.packageSha256 !== PARENT.packageSha256) throw new Error("TENNESSEE_V2_PARENT_PACKAGE_INVALID");

  const sourceBytes = readFileSync(join(root, SOURCE.path));
  const expectedLock = { id: SOURCE.id, url: SOURCE.url, retainedPath: SOURCE.path, retainedStatus: "retained", byteSize: SOURCE.bytes, sha256: SOURCE.sha256, kind: "official_unofficial_result_snapshot", parentIds: [] };
  if (sourceBytes.length !== SOURCE.bytes || sha(sourceBytes) !== SOURCE.sha256 || lock.entries.filter((entry) => entry.id === SOURCE.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === SOURCE.id)), expectedLock)) throw new Error("TENNESSEE_2026_SOURCE_BINDING_INVALID");
  const races = parseDemocraticHouseRaces(sourceBytes.toString("utf8"));
  const target = races[8];
  const sourceCandidateNames = target.map((row) => row[0]);
  const candidateVotes = target.map((row) => row[1]);
  const totalVotes = candidateVotes.reduce((sum, value) => sum + value, 0);
  const unsignedResult = { resultId: "tn:primary:2026:09:democratic" as const, cycleYear: 2026 as const, electionDate: "2026-08-06" as const, districtLabel: "TN-09" as const, sourceLockIds: [SOURCE.id] as const, portalRaceCount: 18 as const, sourceCandidateNames, candidateVotes, totalVotes, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_state_enr_final_unofficial_result_snapshot_retained" as const, certificationStatus: "final_unofficial_no_separate_certification_instrument_retained" as const, winnerIdentity: null, identity: null, scoreEligible: false as const };
  const result2026: TennesseePrimaryResult2026 = { ...unsignedResult, resultSha256: hash("dsa-seats:rapid-house-primary-tennessee-result:v2", unsignedResult) };
  const results = [...parent.results, result2026];
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-tennessee-result-set:v2", results);
  const summary = { reportedContests: 3 as const, candidateRows: 11 as const, candidateVotes: 160076 as const, scoreEligibleRows: 0 as const };
  const unsigned = { schema: "rapid-house-primary-tennessee-results-v2" as const, version: 2 as const, parentPackageSha256: parent.packageSha256, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-tennessee-package:v2", unsigned) };
}

export function validateTennesseePrimaryResultsV2(value: unknown, root = process.cwd()): TennesseePrimaryResultsV2 {
  const expected = buildTennesseePrimaryResultsV2(root);
  if (!exact(value, expected)) throw new Error("TENNESSEE_RESULTS_V2_INVALID");
  return value as TennesseePrimaryResultsV2;
}
