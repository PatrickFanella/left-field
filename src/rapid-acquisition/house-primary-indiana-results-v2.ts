import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type IndianaPrimaryResults,
  validateIndianaPrimaryResults,
} from "./house-primary-indiana-results";

type PriorResult = IndianaPrimaryResults["results"][number];
export type IndianaPrimaryResultV2 = PriorResult | Readonly<{
  resultId: "in:primary:2026:01:democratic" | "in:primary:2026:07:democratic";
  cycleYear: 2026;
  electionDate: "2026-05-05";
  districtLabel: "IN-01" | "IN-07";
  sourceLockIds: readonly ["in-2026-primary-settings", "in-2026-primary-us-house-results"];
  rawParty: "D";
  sourceCandidateNames: readonly string[];
  candidateVotes: readonly number[];
  sourceWinnerNames: readonly string[];
  totalVotes: number;
  resultAuthorityStatus: "official_current_house_json_retained";
  certificationStatus: "settings_certified_true_no_separate_certificate";
  sourceWinnerStatus: "marked_by_source";
  winnerIdentity: null;
  identity: null;
  scoreEligible: false;
  resultSha256: string;
}>;

export interface IndianaPrimaryResultsV2 {
  readonly schema: "rapid-house-primary-indiana-results-v2";
  readonly version: 2;
  readonly parentPackageSha256: string;
  readonly results: readonly IndianaPrimaryResultV2[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ observations: 6; candidateRows: 15; candidateVotes: 268396; sourceMarkedWinnerCandidates: 6; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SETTINGS = { id: "in-2026-primary-settings", url: "https://enr.indianavoters.in.gov/site/data/settings.json", path: "data/source/rapid/house-primary/in/2026/settings.json", bytes: 3249, sha256: "a5fc6ec16d7ff91492ebc8b1d2d58959ee38f21bf0daeec87abb67d006122601", parents: [] } as const;
const RESULTS = { id: "in-2026-primary-us-house-results", url: "https://enr.indianavoters.in.gov/site/data/OffCatC_1005_A.json", path: "data/source/rapid/house-primary/in/2026/us-house-results.json", bytes: 192012, sha256: "422cb0a21cd53eaf24177c97f8c4b4b8f6a30e2420264a2db4d1785ed610b65d", parents: [SETTINGS.id] } as const;
const EXPECTED = {
  "IN-01": [["Frank J. Mrvan", 42519, "T"], ["LaVetta Sparks-Wade", 10467, "F"]],
  "IN-07": [["André Carson", 44849, "T"], ["Destiny Wells", 16852, "F"], ["George Hornedo", 7517, "F"], ["Denise Paul Hatch", 2646, "F"]],
} as const;
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const exact = (left: unknown, right: unknown) => canonical(left) === canonical(right);
type Candidate = { NAME_ON_BALLOT: string; isWinner: string; PARTY: string; TOTAL: number };
type Race = { OFFICE_TITLE: string; Candidates: { Candidate: Candidate | Candidate[] } };

export function buildIndianaPrimaryResultsV2(root = process.cwd()): IndianaPrimaryResultsV2 {
  const parent = validateIndianaPrimaryResults(JSON.parse(readFileSync(join(root, "data/metadata/rapid-house-primary-indiana-results-v1.json"), "utf8")), root);
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const settingsBytes = readFileSync(join(root, SETTINGS.path));
  const resultsBytes = readFileSync(join(root, RESULTS.path));
  for (const [pin, bytes] of [[SETTINGS, settingsBytes], [RESULTS, resultsBytes]] as const) {
    const expected = { id: pin.id, url: pin.url, retainedPath: pin.path, retainedStatus: "retained", byteSize: pin.bytes, sha256: pin.sha256, kind: "source", parentIds: [...pin.parents] };
    const matches = lock.entries.filter((entry) => entry.id === pin.id);
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) throw new Error(`INDIANA_2026_SOURCE_BINDING_INVALID:${pin.id}`);
  }
  const settings = JSON.parse(settingsBytes.toString("utf8")) as { Root?: Record<string, unknown> };
  if (!exact({ CurrentElection: settings.Root?.CurrentElection, ElectionType: settings.Root?.ElectionType, Certified: settings.Root?.Certified, VersionType: settings.Root?.VersionType, JSONContainer: settings.Root?.JSONContainer }, { CurrentElection: "05/05/2026", ElectionType: "P", Certified: "T", VersionType: "A", JSONContainer: "site" })) throw new Error("INDIANA_2026_SETTINGS_INVALID");
  const parsed = JSON.parse(resultsBytes.toString("utf8")) as { Root?: { StatewideSummary?: { Race?: Race[] } } };
  const races = parsed.Root?.StatewideSummary?.Race;
  const titles = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth"].map((word) => `United States Representative, ${word} District`);
  if (!Array.isArray(races) || races.length !== 9 || !exact(races.map((race) => race.OFFICE_TITLE).sort(compare), titles.sort(compare))) throw new Error("INDIANA_2026_HOUSE_CLOSURE_INVALID");
  const additions: IndianaPrimaryResultV2[] = [];
  for (const [districtLabel, expectedCandidates] of Object.entries(EXPECTED) as ["IN-01" | "IN-07", readonly (readonly [string, number, string])[]][]) {
    const ordinal = districtLabel === "IN-01" ? "First" : "Seventh";
    const race = races.find((item) => item.OFFICE_TITLE === `United States Representative, ${ordinal} District`);
    if (!race) throw new Error("INDIANA_2026_TARGET_RACE_MISSING");
    const all = Array.isArray(race.Candidates.Candidate) ? race.Candidates.Candidate : [race.Candidates.Candidate];
    const democratic = all.filter((candidate) => candidate.PARTY === "D").map((candidate) => [candidate.NAME_ON_BALLOT, candidate.TOTAL, candidate.isWinner] as const);
    if (!exact(democratic, expectedCandidates)) throw new Error(`INDIANA_2026_TARGET_CANDIDATES_INVALID:${districtLabel}`);
    const sourceCandidateNames = democratic.map((candidate) => candidate[0]);
    const candidateVotes = democratic.map((candidate) => candidate[1]);
    const sourceWinnerNames = democratic.filter((candidate) => candidate[2] === "T").map((candidate) => candidate[0]);
    if (sourceWinnerNames.length !== 1 || candidateVotes.some((votes) => !Number.isSafeInteger(votes) || votes < 0)) throw new Error("INDIANA_2026_WINNER_OR_VOTE_INVALID");
    const unsigned = { resultId: `in:primary:2026:${districtLabel.slice(-2)}:democratic` as "in:primary:2026:01:democratic" | "in:primary:2026:07:democratic", cycleYear: 2026 as const, electionDate: "2026-05-05" as const, districtLabel, sourceLockIds: [SETTINGS.id, RESULTS.id] as const, rawParty: "D" as const, sourceCandidateNames, candidateVotes, sourceWinnerNames, totalVotes: candidateVotes.reduce((sum, value) => sum + value, 0), resultAuthorityStatus: "official_current_house_json_retained" as const, certificationStatus: "settings_certified_true_no_separate_certificate" as const, sourceWinnerStatus: "marked_by_source" as const, winnerIdentity: null, identity: null, scoreEligible: false as const };
    additions.push({ ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-indiana-result:v2", unsigned) });
  }
  const results = [...parent.results, ...additions];
  const summary = { observations: 6 as const, candidateRows: 15 as const, candidateVotes: 268396 as const, sourceMarkedWinnerCandidates: 6 as const, scoreEligibleRows: 0 as const };
  if (results.reduce((sum, row) => sum + row.totalVotes, 0) !== summary.candidateVotes || results.reduce((sum, row) => sum + row.sourceCandidateNames.length, 0) !== summary.candidateRows || results.reduce((sum, row) => sum + row.sourceWinnerNames.length, 0) !== summary.sourceMarkedWinnerCandidates) throw new Error("INDIANA_RESULTS_V2_CLOSURE_INVALID");
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-indiana-result-set:v2", results);
  const unsigned = { schema: "rapid-house-primary-indiana-results-v2" as const, version: 2 as const, parentPackageSha256: parent.packageSha256, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-indiana-package:v2", unsigned) };
}

export function validateIndianaPrimaryResultsV2(value: unknown, root = process.cwd()): IndianaPrimaryResultsV2 {
  const expected = buildIndianaPrimaryResultsV2(root);
  if (!exact(value, expected)) throw new Error("INDIANA_RESULTS_V2_INVALID");
  return value as IndianaPrimaryResultsV2;
}
