import { readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { byteCompare } from "./shared";
import { districtKey, type StateChamber } from "./state-legislative-roster";

/**
 * Evidence readers for the seat outcome ledger.
 *
 * Each reader turns a pinned artifact into the one shape the resolver
 * understands, and says how far the evidence goes: a source-marked winner, a
 * certified count, or an unofficial count. Nothing here decides an outcome.
 */

export type CountStatus = "certified" | "unofficial";
export type EvidenceParty = "Democratic" | "Republican";

export interface ContestEvidence {
  readonly contestId: string;
  readonly sourceIds: readonly string[];
  readonly party: EvidenceParty;
  readonly electionDate: string;
  readonly seats: number;
  readonly candidates: readonly Readonly<{ name: string; votes: number }>[];
  /** Names the source itself marks as winners; null when the source marks none. */
  readonly sourceMarkedWinners: readonly string[] | null;
  readonly countStatus: CountStatus;
}
export type PrimaryEvidence = ContestEvidence;
export type GeneralEvidence = ContestEvidence;

/**
 * Certification statuses that count as a certified count. Every other value,
 * including an absent one, is unofficial: a count settles an outcome only
 * when the retained file says it is the certified or official canvass.
 */
export const CERTIFIED_COUNT_STATUSES: readonly string[] = [
  "settings_certified_true_no_separate_certificate",
  "official_results_flag_retained_no_separate_signed_certificate",
  "official_canvass_workbook_separate_certificate_not_retained",
  "official_statewide_vote_totals_certification_pdf_retained",
];

export const countStatusOf = (certificationStatus: string | null | undefined, _resultAuthorityStatus: string): CountStatus =>
  certificationStatus !== null && certificationStatus !== undefined && CERTIFIED_COUNT_STATUSES.includes(certificationStatus) ? "certified" : "unofficial";

const fail = (code: string): never => { throw new Error(`OUTCOME_EVIDENCE_${code}`); };
const readJson = <T,>(lock: SourceLock, id: string, root: string): T => JSON.parse(readRetainedSource(lock, id, root).bytes.toString("utf8")) as T;

/** A major party from a source label; null for anything else. */
export const evidencePartyOf = (raw: string | undefined): EvidenceParty | null => {
  const key = (raw ?? "").trim().toLowerCase();
  if (/^(d|dem|democrat|democratic)\b/.test(key) || key.startsWith("democratic")) return "Democratic";
  if (/^(r|rep|gop|republican)\b/.test(key)) return "Republican";
  return null;
};

export const HOUSE_PRIMARY_2026_ARTIFACT_IDS: readonly string[] = [
  "rapid-house-primary-hawaii-results-2026-v1",
  "rapid-house-primary-indiana-results-v2",
  "rapid-house-primary-mississippi-results-v3",
  "rapid-house-primary-south-carolina-results-v3",
  "rapid-house-primary-tennessee-results-v2",
];

type HousePrimaryResult = {
  resultId: string; cycleYear: number; electionDate: string; districtLabel: string; sourceLockIds?: string[]; rawParty?: string;
  sourceCandidateNames: string[]; candidateVotes: number[]; sourceWinnerStatus?: string; sourceWinnerNames?: string[]; sourceWinnerCandidateName?: string;
  resultAuthorityStatus: string; certificationStatus?: string | null;
};

/** The 2026 House Democratic primaries retained as rapid artifacts, keyed by district label. Every pinned file is a Democratic target file. */
export function readHousePrimaryEvidence2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): ReadonlyMap<string, readonly PrimaryEvidence[]> {
  const byDistrict = new Map<string, PrimaryEvidence[]>();
  for (const id of HOUSE_PRIMARY_2026_ARTIFACT_IDS) {
    const artifact = readJson<{ results: HousePrimaryResult[] }>(lock, id, root);
    for (const result of artifact.results.filter((row) => row.cycleYear === 2026)) {
      if (result.sourceCandidateNames.length !== result.candidateVotes.length) fail(`CANDIDATE_ROWS:${result.resultId}`);
      const marked = result.sourceWinnerStatus === "marked_by_source" ? result.sourceWinnerNames ?? (result.sourceWinnerCandidateName ? [result.sourceWinnerCandidateName] : null) : null;
      const evidence: PrimaryEvidence = {
        contestId: result.resultId, sourceIds: result.sourceLockIds ?? [id], party: evidencePartyOf(result.rawParty ?? "D") ?? "Democratic", electionDate: result.electionDate, seats: 1,
        candidates: result.sourceCandidateNames.map((name, index) => ({ name, votes: result.candidateVotes[index]! })),
        sourceMarkedWinners: marked, countStatus: countStatusOf(result.certificationStatus, result.resultAuthorityStatus),
      };
      byDistrict.set(result.districtLabel, [...(byDistrict.get(result.districtLabel) ?? []), evidence]);
    }
  }
  return byDistrict;
}

export const STATE_LEGISLATIVE_PRIMARY_CONTEXT_ID = "rapid-state-legislative-primary-context-v1";

type StateLegislativePrimaryContest = {
  contestId: string; cycleYear: number; electionDate: string; chamber: string; district?: string; districtCode?: string; rawParty?: string; seats?: number;
  candidates: { sourceName: string; votes: number }[]; sourceWinnerStatus?: string; resultAuthorityStatus: string; certificationStatus?: string | null; sourceLockIds?: string[];
};

const chamberOf = (raw: string): StateChamber | null => raw === "lower" || raw === "state_house" ? "lower" : raw === "upper" || raw === "state_senate" ? "upper" : raw === "unicameral" ? "unicameral" : null;

/** The 2026 state-legislative primaries in the retained catalogs (GA, KY, NC, OH), keyed by `${state}|${chamber}|${districtKey}`. */
export function readStateLegislativePrimaryEvidence2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): ReadonlyMap<string, readonly PrimaryEvidence[]> {
  const context = readJson<{ rows: { cycleYear: number; sourceArtifactId?: string }[] }>(lock, STATE_LEGISLATIVE_PRIMARY_CONTEXT_ID, root);
  const catalogIds = [...new Set(context.rows.filter((row) => row.cycleYear === 2026).map((row) => row.sourceArtifactId).filter((id): id is string => typeof id === "string" && id.includes("-state-legislative-")))].sort(byteCompare);
  const byDistrict = new Map<string, PrimaryEvidence[]>();
  for (const id of catalogIds) {
    const catalog = readJson<{ contests: StateLegislativePrimaryContest[] }>(lock, id, root);
    for (const contest of catalog.contests.filter((row) => row.cycleYear === 2026)) {
      const party = evidencePartyOf(contest.rawParty), chamber = chamberOf(contest.chamber);
      if (party === null || chamber === null) continue;
      const stateCode = contest.contestId.slice(0, 2).toUpperCase(), district = contest.district ?? contest.districtCode ?? fail(`DISTRICT_MISSING:${contest.contestId}`);
      const key = `${stateCode}|${chamber}|${districtKey(district)}`;
      // No retained state-legislative catalog marks winners; a future one needs its winner field read here, not guessed.
      if (contest.sourceWinnerStatus === "marked_by_source") fail(`WINNER_MARK_UNHANDLED:${contest.contestId}`);
      const evidence: PrimaryEvidence = {
        contestId: contest.contestId, sourceIds: contest.sourceLockIds ?? [id], party, electionDate: contest.electionDate, seats: contest.seats ?? 1,
        candidates: contest.candidates.map((candidate) => ({ name: candidate.sourceName, votes: candidate.votes })),
        sourceMarkedWinners: null, countStatus: countStatusOf(contest.certificationStatus, contest.resultAuthorityStatus),
      };
      byDistrict.set(key, [...(byDistrict.get(key) ?? []), evidence]);
    }
  }
  return byDistrict;
}
