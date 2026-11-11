import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { byteCompare, hash, sha, exact } from "./shared";

export interface IndianaStateLegislativeCandidate { readonly sourceName: string; readonly votes: number; readonly sourceWinnerMarked: boolean; }
export interface IndianaStateLegislativeContest {
  readonly contestId: string;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: "2022-05-03" | "2024-05-07";
  readonly chamber: "upper" | "lower";
  readonly district: string;
  readonly rawOfficeTitle: string;
  readonly rawParty: "D" | "R";
  readonly candidates: readonly IndianaStateLegislativeCandidate[];
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "marked_by_source";
  readonly resultAuthorityStatus: "official_archive_state_legislative_json_retained";
  readonly certificationStatus: "settings_certified_false_no_separate_certificate" | "settings_certified_true_no_separate_certificate";
  readonly sourceLockIds: readonly string[];
  readonly formulaEligible: false;
  readonly contestSha256: string;
}
export interface IndianaStateLegislativeResults {
  readonly schema: "rapid-indiana-state-legislative-primary-results-v1";
  readonly version: 1;
  readonly contests: readonly IndianaStateLegislativeContest[];
  readonly contestSetSha256: string;
  readonly summary: Readonly<{ officeDistrictRows: 250; partyContests: 361; candidateRows: 486; candidateVotes: 1683754; sourceMarkedWinnerCandidates: 361; formulaEligibleContests: 0 }>;
  readonly packageSha256: string;
}

const SETTINGS = {
  2022: { id: "in-2022-primary-settings", url: "https://enr.indianavoters.in.gov/archive/2022Primary/data/settings.json", path: "data/source/rapid/house-primary/in/2022/settings.json", bytes: 2233, sha256: "de8fe508d6a8ede457ecb37cdb98d44c53c377f5548abdc5eb8171425729499e", certified: "F", date: "2022-05-03" },
  2024: { id: "in-2024-primary-settings", url: "https://enr.indianavoters.in.gov/archive/2024Primary/data/settings.json", path: "data/source/rapid/house-primary/in/2024/settings.json", bytes: 3028, sha256: "430de937a82b87f5320a5047d37877f44612f824e3fc3696d650bbcfc61692cb", certified: "T", date: "2024-05-07" },
} as const;
const SOURCES = [
  { cycleYear: 2022 as const, chamber: "upper" as const, id: "in-2022-primary-state-senate-results", url: "https://enr.indianavoters.in.gov/archive/2022Primary/data/OffCatC_1018_A.json", path: "data/source/rapid/state-legislative/in/2022/state-senate-results.json", bytes: 91339, sha256: "df629e92fc223a76142707b3c86b0a0d53465031ac09ccf3e692ac590d621528", races: 25 },
  { cycleYear: 2022 as const, chamber: "lower" as const, id: "in-2022-primary-state-house-results", url: "https://enr.indianavoters.in.gov/archive/2022Primary/data/OffCatC_1039_A.json", path: "data/source/rapid/state-legislative/in/2022/state-house-results.json", bytes: 308947, sha256: "102ba50fe341f1b30f17ac69f80c0f26dbcc59de62ebbd313817c0904b854c67", races: 100 },
  { cycleYear: 2024 as const, chamber: "upper" as const, id: "in-2024-primary-state-senate-results", url: "https://enr.indianavoters.in.gov/archive/2024Primary/data/OffCatC_1018_B.json", path: "data/source/rapid/state-legislative/in/2024/state-senate-results.json", bytes: 76767, sha256: "ab4459eb9167726633102e447814af7dea2903b394b872685f9aec51ddb69bd6", races: 25 },
  { cycleYear: 2024 as const, chamber: "lower" as const, id: "in-2024-primary-state-house-results", url: "https://enr.indianavoters.in.gov/archive/2024Primary/data/OffCatC_1039_B.json", path: "data/source/rapid/state-legislative/in/2024/state-house-results.json", bytes: 296437, sha256: "63aca0ab21d7296dc54362d53197912a24d31b97af42e8051f3a3a3ceaab4fd8", races: 100 },
] as const;
type RawCandidate = { NAME_ON_BALLOT: string; isWinner: string; PARTY?: string; PARTY_ABBREV?: string; TOTAL?: number; TOTAL_VOTES?: number };
type RawRace = { OFFICE_TITLE: string; NumofSeats: string; Candidates: { Candidate: RawCandidate | RawCandidate[] } };

export function buildIndianaStateLegislativeResults(root = process.cwd()): IndianaStateLegislativeResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, contests: IndianaStateLegislativeContest[] = [];
  for (const source of SOURCES) {
    const setting = SETTINGS[source.cycleYear], settingBytes = readFileSync(join(root, setting.path)), sourceBytes = readFileSync(join(root, source.path));
    const settingsExpected = { id: setting.id, url: setting.url, retainedPath: setting.path, retainedStatus: "retained", byteSize: setting.bytes, sha256: setting.sha256, kind: "source", parentIds: [] };
    const sourceExpected = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [setting.id] };
    if (settingBytes.length !== setting.bytes || sha(settingBytes) !== setting.sha256 || sourceBytes.length !== source.bytes || sha(sourceBytes) !== source.sha256 || lock.entries.filter((entry) => entry.id === setting.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === setting.id)), settingsExpected) || lock.entries.filter((entry) => entry.id === source.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.id)), sourceExpected)) throw new Error(`INDIANA_STATE_LEGISLATIVE_SOURCE_INVALID:${source.id}`);
    const settings = JSON.parse(settingBytes.toString("utf8")) as { Root?: { ElectionType?: string; Certified?: string } }; if (settings.Root?.ElectionType !== "P" || settings.Root.Certified !== setting.certified) throw new Error("INDIANA_STATE_LEGISLATIVE_SETTINGS_INVALID");
    const parsed = JSON.parse(sourceBytes.toString("utf8")) as { Root?: { StatewideSummary?: { Race?: RawRace | RawRace[] } } }, raw = parsed.Root?.StatewideSummary?.Race, races = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (races.length !== source.races) throw new Error("INDIANA_STATE_LEGISLATIVE_RACE_CLOSURE_INVALID");
    const districts = new Set<string>();
    for (const race of races) {
      const match = race.OFFICE_TITLE.match(source.chamber === "lower" ? /^State Representative, District (\d{2,3})$/ : /^State Senator, District (\d{2})$/), district = match ? match[1]!.padStart(source.chamber === "lower" ? 3 : 2, "0") : null; if (!district || race.NumofSeats !== "1" || districts.has(district)) throw new Error("INDIANA_STATE_LEGISLATIVE_OFFICE_INVALID"); districts.add(district);
      const rawCandidates = Array.isArray(race.Candidates.Candidate) ? race.Candidates.Candidate : [race.Candidates.Candidate];
      for (const rawParty of ["D", "R"] as const) {
        const partyCandidates = rawCandidates.filter((candidate) => (candidate.PARTY ?? candidate.PARTY_ABBREV) === rawParty); if (partyCandidates.length === 0) continue;
        const candidates = partyCandidates.map((candidate) => { const votes = candidate.TOTAL ?? candidate.TOTAL_VOTES; if (!candidate.NAME_ON_BALLOT || !Number.isSafeInteger(votes) || votes! < 0 || !["T", "F", "1", "0"].includes(candidate.isWinner)) throw new Error("INDIANA_STATE_LEGISLATIVE_CANDIDATE_INVALID"); return { sourceName: candidate.NAME_ON_BALLOT, votes: votes!, sourceWinnerMarked: ["T", "1"].includes(candidate.isWinner) }; });
        if (candidates.filter((candidate) => candidate.sourceWinnerMarked).length !== 1) throw new Error("INDIANA_STATE_LEGISLATIVE_WINNER_MARKER_INVALID");
        const unsigned = { contestId: `in:state-leg-primary:${source.cycleYear}:${source.chamber}:${district}:${rawParty}`, cycleYear: source.cycleYear, electionDate: setting.date, chamber: source.chamber, district, rawOfficeTitle: race.OFFICE_TITLE, rawParty, candidates, totalVotes: candidates.reduce((sum, candidate) => sum + candidate.votes, 0), sourceWinnerStatus: "marked_by_source" as const, resultAuthorityStatus: "official_archive_state_legislative_json_retained" as const, certificationStatus: source.cycleYear === 2022 ? "settings_certified_false_no_separate_certificate" as const : "settings_certified_true_no_separate_certificate" as const, sourceLockIds: [setting.id, source.id], formulaEligible: false as const };
        contests.push({ ...unsigned, contestSha256: hash("dsa-seats:rapid-indiana-state-legislative-contest:v1", unsigned) });
      }
    }
  }
  contests.sort((left, right) => left.cycleYear - right.cycleYear || byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
  const summary = { officeDistrictRows: 250 as const, partyContests: 361 as const, candidateRows: 486 as const, candidateVotes: 1683754 as const, sourceMarkedWinnerCandidates: 361 as const, formulaEligibleContests: 0 as const };
  if (contests.length !== summary.partyContests || contests.reduce((sum, row) => sum + row.candidates.length, 0) !== summary.candidateRows || contests.reduce((sum, row) => sum + row.totalVotes, 0) !== summary.candidateVotes || contests.reduce((sum, row) => sum + row.candidates.filter((candidate) => candidate.sourceWinnerMarked).length, 0) !== summary.sourceMarkedWinnerCandidates || contests.some((row) => row.formulaEligible)) throw new Error("INDIANA_STATE_LEGISLATIVE_SUMMARY_INVALID");
  const contestSetSha256 = hash("dsa-seats:rapid-indiana-state-legislative-contest-set:v1", contests), unsigned = { schema: "rapid-indiana-state-legislative-primary-results-v1" as const, version: 1 as const, contests, contestSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-indiana-state-legislative-package:v1", unsigned) };
}
export function validateIndianaStateLegislativeResults(value: unknown, root = process.cwd()): IndianaStateLegislativeResults { const expected = buildIndianaStateLegislativeResults(root); if (!exact(value, expected)) throw new Error("INDIANA_STATE_LEGISLATIVE_RESULTS_INVALID"); return value as IndianaStateLegislativeResults; }
