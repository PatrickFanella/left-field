import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash, sha, exact } from "./shared";

export interface VermontPrimaryResult {
  readonly resultId: `vt:primary:${2022 | 2024}:al:democratic`;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: "2022-08-09" | "2024-08-13";
  readonly districtLabel: "VT-AL";
  readonly sourceLockIds: readonly string[];
  readonly sourceCandidateNames: readonly string[];
  readonly candidateVotes: readonly number[];
  readonly candidateVoteSum: number;
  readonly writeInVotes: number;
  readonly overvotes: number;
  readonly blankVotes: number;
  readonly sourceTotalVotesCounted: number;
  readonly sourceWinnerStatus: "not_marked_by_source" | "marked_by_source";
  readonly sourceWinnerCandidateName: null | "Becca Balint";
  readonly resultAuthorityStatus: "official_secretary_canvass_report_retained";
  readonly certificationStatus: "official_canvassing_committee_report_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}
export interface VermontPrimaryResults {
  readonly schema: "rapid-house-primary-vermont-results-v1";
  readonly version: 1;
  readonly results: readonly VermontPrimaryResult[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ reportedContests: 2; candidateRows: 5; candidateVotes: 148407; sourceTotalVotesCounted: 154377; sourceMarkedWinnerContests: 1; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { year: 2022 as const, pdfId: "vt-2022-primary-official-canvass", textId: "vt-2022-primary-official-canvass-text", pdfPath: "data/source/rapid/house-primary/vt/2022/official-primary-canvass.pdf", textPath: "data/source/rapid/house-primary/vt/2022/official-primary-canvass-layout.txt", pdfUrl: "https://outside.vermont.gov/dept/sos/Elections_Division/election_info_resources/elections_results_data/2022_primary_election_official_report_canvassing_committee_united_states_vermont_statewide_offices.pdf", pdfBytes: 817821, pdfSha256: "9e297acae57327843f07c278e1b438eb40d73650fd89262569aa806564054087", textBytes: 1297652, textSha256: "5da75e57b23fb5ebc42271461c966ade091d92fb3ba4454d66b7911c14358bf1" },
  { year: 2024 as const, pdfId: "vt-2024-primary-official-canvass", textId: "vt-2024-primary-official-canvass-text", pdfPath: "data/source/rapid/house-primary/vt/2024/official-primary-canvass.pdf", textPath: "data/source/rapid/house-primary/vt/2024/official-primary-canvass-layout.txt", pdfUrl: "https://outside.vermont.gov/dept/sos/Elections_Division/election_info_resources/elections_results_data/2024_primary_election_official_report_canvassing_committee_united_states_vermont_statewide_offices.pdf", pdfBytes: 875263, pdfSha256: "a414c1dc46e1fa3ff5544dee58993e16e0cf02f0b626abb82ba665fd2face8e6", textBytes: 1315055, textSha256: "542447cd506a17f901ec8eafb24fb48185ea383a9862bee653cee13412f7588d" },
] as const;
const EXPECTED = {
  2022: { date: "2022-08-09" as const, candidates: [["Becca Balint", 61025], ["Sianay Chase Clifford", 885], ["Molly Gray", 37266], ["Louis Meyers", 1593]] as const, writeIn: 145, overvotes: 74, blank: 1420, total: 102408, winnerStatus: "not_marked_by_source" as const, winner: null },
  2024: { date: "2024-08-13" as const, candidates: [["Becca Balint", 47638]] as const, writeIn: 465, overvotes: 13, blank: 3853, total: 51969, winnerStatus: "marked_by_source" as const, winner: "Becca Balint" as const },
} as const;

function requireText(year: 2022 | 2024, text: string) {
  const common = ["OFFICIAL REPORT OF THE CANVASSING COMMITTEE", "UNITED STATES AND VERMONT STATEWIDE OFFICES", "For REPRESENTATIVE TO CONGRESS", "STATEWIDE TOTALS", "DEMOCRATIC"];
  const specific = year === 2022
    ? ["2022 AUGUST PRIMARY, AUGUST 9, 2022", "Becca Balint                61,025", "Sianay Chase Clifford         885", "Molly Gray                  37,266", "Louis Meyers                 1,593", "Write-In                      145", "Overvotes                      74", "Blank votes                  1,420", "Total votes counted        102,408"]
    : ["PRIMARY ELECTION, AUGUST 13, 2024", "Becca Balint*              47,638", "Write-In                     465", "Overvotes                     13", "Blank votes                 3,853", "Total votes counted        51,969"];
  if (![...common, ...specific].every((needle) => text.includes(needle))) throw new Error(`VERMONT_CANVASS_TEXT_INVALID:${year}`);
}

export function buildVermontPrimaryResults(root = process.cwd()): VermontPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const results: VermontPrimaryResult[] = [];
  for (const source of SOURCES) {
    const pdf = readFileSync(join(root, source.pdfPath)), textBytes = readFileSync(join(root, source.textPath));
    const pdfLock = { id: source.pdfId, url: source.pdfUrl, retainedPath: source.pdfPath, retainedStatus: "retained", byteSize: source.pdfBytes, sha256: source.pdfSha256, kind: "source", parentIds: [] };
    const textLock = { id: source.textId, url: `urn:dsa-seats:vt-${source.year}-primary-official-canvass:pdftotext-layout`, retainedPath: source.textPath, retainedStatus: "retained", byteSize: source.textBytes, sha256: source.textSha256, kind: "derived_extract", parentIds: [source.pdfId] };
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || pdf.length !== source.pdfBytes || sha(pdf) !== source.pdfSha256 || textBytes.length !== source.textBytes || sha(textBytes) !== source.textSha256 || lock.entries.filter((entry) => entry.id === source.pdfId).length !== 1 || lock.entries.filter((entry) => entry.id === source.textId).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.pdfId)), pdfLock) || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.textId)), textLock)) throw new Error(`VERMONT_SOURCE_BINDING_INVALID:${source.year}`);
    requireText(source.year, textBytes.toString("utf8"));
    const expected = EXPECTED[source.year], sourceCandidateNames = expected.candidates.map((row) => row[0]), candidateVotes = expected.candidates.map((row) => row[1]), candidateVoteSum = candidateVotes.reduce((sum, value) => sum + value, 0);
    if (candidateVoteSum + expected.writeIn + expected.overvotes + expected.blank !== expected.total) throw new Error(`VERMONT_CONTEST_ARITHMETIC_INVALID:${source.year}`);
    const unsigned = { resultId: `vt:primary:${source.year}:al:democratic` as const, cycleYear: source.year, electionDate: expected.date, districtLabel: "VT-AL" as const, sourceLockIds: [source.pdfId, source.textId], sourceCandidateNames, candidateVotes, candidateVoteSum, writeInVotes: expected.writeIn, overvotes: expected.overvotes, blankVotes: expected.blank, sourceTotalVotesCounted: expected.total, sourceWinnerStatus: expected.winnerStatus, sourceWinnerCandidateName: expected.winner, resultAuthorityStatus: "official_secretary_canvass_report_retained" as const, certificationStatus: "official_canvassing_committee_report_retained" as const, winnerIdentity: null, identity: null, scoreEligible: false as const };
    results.push({ ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-vermont-result:v1", unsigned) });
  }
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-vermont-result-set:v1", results), summary = { reportedContests: 2 as const, candidateRows: 5 as const, candidateVotes: 148407 as const, sourceTotalVotesCounted: 154377 as const, sourceMarkedWinnerContests: 1 as const, scoreEligibleRows: 0 as const }, unsigned = { schema: "rapid-house-primary-vermont-results-v1" as const, version: 1 as const, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-vermont-package:v1", unsigned) };
}
export function validateVermontPrimaryResults(value: unknown, root = process.cwd()): VermontPrimaryResults { const expected = buildVermontPrimaryResults(root); if (!exact(value, expected)) throw new Error("VERMONT_RESULTS_INVALID"); return value as VermontPrimaryResults; }
