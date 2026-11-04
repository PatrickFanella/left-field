import { GOVERNOR_SCORE_V01, readGovernorScoreV01Projection, type GovernorScoreV01Row } from "./governor-score-v01";
import { readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { holderPartyOf, type HolderParty, type PreElectionSeatRow, type PreElectionSnapshot2026 } from "./pre-election-snapshot-2026";
import { CONGRESS_LEGISLATORS_BASELINE_ID, readRefreshInputs } from "./refresh-inputs";
import { byteCompare } from "./shared";
import { districtKey, readStateLegislativeRoster, STATE_LEGISLATIVE_ROSTER, type StateChamber, type StateLegislativeRosterRow } from "./state-legislative-roster";

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
  /** `party` is set when the source records one per candidate (general-election returns); primaries leave it out. */
  readonly candidates: readonly Readonly<{ name: string; votes: number; party?: HolderParty | null }>[];
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

export type CandidacyStatus = "filed_for_seat" | "filed_for_other_office" | "not_on_primary_ballot" | "not_observed" | "not_applicable";
export interface HolderCandidacy {
  readonly status: CandidacyStatus;
  readonly sourceIds: readonly string[];
}

export const HOUSE_INCUMBENT_CANDIDACY_ID = "house-incumbent-candidacy-v1";

/** What the FEC candidate master says about each House holder's 2026 filing. Retirement is not observable here. */
export function readHouseCandidacyEvidence(root = process.cwd(), lock: SourceLock = readSourceLock(root)): ReadonlyMap<string, HolderCandidacy> {
  const artifact = readJson<{ rows: { seatCycleId: string; houseStatutoryCandidate2026: boolean; openSeatSignal: string | null }[] }>(lock, HOUSE_INCUMBENT_CANDIDACY_ID, root);
  return new Map(artifact.rows.map((row) => [row.seatCycleId, {
    status: row.openSeatSignal !== null ? "filed_for_other_office" : row.houseStatutoryCandidate2026 ? "filed_for_seat" : "not_observed",
    sourceIds: [HOUSE_INCUMBENT_CANDIDACY_ID],
  }]));
}

export interface Successor {
  readonly holderId: string;
  readonly holderName: string;
  readonly party: HolderParty;
  readonly sourceId: string;
}

export type Legislator = Readonly<{ id?: { bioguide?: string }; name?: { first?: string; last?: string; official_full?: string }; terms: readonly Readonly<{ type: string; state: string; district?: number; class?: number; party?: string }>[] }>;
export type SuccessorRosters = Readonly<{
  congress?: readonly Legislator[];
  governors?: readonly Pick<GovernorScoreV01Row, "stateCode" | "openStatesId" | "governorName" | "incumbentParty">[];
  stateLegislative?: readonly Pick<StateLegislativeRosterRow, "stateCode" | "chamber" | "districtKey" | "openStatesId" | "name" | "party">[];
}>;

const legislatorName = (person: Legislator): string => person.name?.official_full ?? `${person.name?.first ?? ""} ${person.name?.last ?? ""}`.trim();

/**
 * For every frozen seat, the holder the current rosters name in its place, or
 * null while the frozen holder is still there (or the seat is vacant). In a
 * multi-member district the departed holders and the arrivals are paired in
 * holder-id order; a district with more departures than arrivals leaves the
 * rest null. The pairing carries a party, which is what the resolver reads.
 */
export function readSuccessors(root = process.cwd(), lock: SourceLock = readSourceLock(root), snapshot: PreElectionSnapshot2026, rosters: SuccessorRosters = {}): ReadonlyMap<string, Successor | null> {
  const congressId = readRefreshInputs(root, lock).congressLegislatorsId ?? CONGRESS_LEGISLATORS_BASELINE_ID;
  const congress = rosters.congress ?? readJson<Legislator[]>(lock, congressId, root);
  const governors = rosters.governors ?? readGovernorScoreV01Projection(root, lock).rows;
  const legislators = rosters.stateLegislative ?? readStateLegislativeRoster(root, lock).rows;
  const reps = new Map<string, Legislator>(), senators = new Map<string, Legislator>();
  for (const person of congress) {
    const term = person.terms.at(-1);
    if (!term) continue;
    if (term.type === "rep") reps.set(`${term.state}|${term.district ?? 0}`, person);
    else if (term.type === "sen") senators.set(`${term.state}|${term.class ?? ""}`, person);
  }
  const governorsByState = new Map(governors.map((row) => [row.stateCode, row]));
  const districts = new Map<string, NonNullable<SuccessorRosters["stateLegislative"]>[number][]>();
  for (const row of legislators) {
    const key = `${row.stateCode}|${row.chamber}|${row.districtKey}`;
    districts.set(key, [...(districts.get(key) ?? []), row]);
  }
  const fromCongress = (person: Legislator | undefined, frozen: PreElectionSeatRow): Successor | null => {
    const bioguide = person?.id?.bioguide;
    if (!bioguide || bioguide === frozen.holderId) return null;
    return { holderId: bioguide, holderName: legislatorName(person!), party: holderPartyOf(person!.terms.at(-1)?.party ?? ""), sourceId: congressId };
  };

  const result = new Map<string, Successor | null>();
  const frozenDistricts = new Map<string, PreElectionSeatRow[]>();
  for (const row of snapshot.rows) {
    const house = row.seatId.match(/^seat_house_([a-z]{2})_(al|\d{2})_current$/), senate = row.seatId.match(/^seat_senate_([a-z]{2})_(\d)_current$/), governor = row.seatId.match(/^seat_governor_([a-z]{2})_current$/), state = row.seatId.match(/^seat_state_([a-z]{2})_(lower|upper|unicameral)_(.+)_(\d+)$/);
    if (house) result.set(row.seatId, fromCongress(reps.get(`${house[1]!.toUpperCase()}|${house[2] === "al" ? 0 : Number(house[2])}`), row));
    else if (senate) result.set(row.seatId, fromCongress(senators.get(`${senate[1]!.toUpperCase()}|${senate[2]}`), row));
    else if (governor) {
      const current = governorsByState.get(governor[1]!.toUpperCase());
      result.set(row.seatId, !current || current.openStatesId === row.holderId ? null : { holderId: current.openStatesId, holderName: current.governorName, party: holderPartyOf(current.incumbentParty), sourceId: GOVERNOR_SCORE_V01.id });
    } else if (state) {
      const key = `${state[1]!.toUpperCase()}|${state[2]}|${state[3]!.replace(/-/g, " ")}`;
      frozenDistricts.set(key, [...(frozenDistricts.get(key) ?? []), row]);
    } else fail(`SEAT_ID_UNRECOGNISED:${row.seatId}`);
  }
  for (const [key, frozen] of frozenDistricts) {
    const current = districts.get(key) ?? [];
    const currentIds = new Set(current.map((row) => row.openStatesId)), frozenIds = new Set(frozen.map((row) => row.holderId));
    const departed = frozen.filter((row) => !currentIds.has(row.holderId)).sort((left, right) => byteCompare(left.holderId, right.holderId));
    const arrivals = current.filter((row) => !frozenIds.has(row.openStatesId)).sort((left, right) => byteCompare(left.openStatesId, right.openStatesId));
    for (const row of frozen) result.set(row.seatId, null);
    departed.forEach((row, index) => {
      const arrival = arrivals[index];
      result.set(row.seatId, arrival ? { holderId: arrival.openStatesId, holderName: arrival.name, party: holderPartyOf(arrival.party), sourceId: STATE_LEGISLATIVE_ROSTER.id } : null);
    });
  }
  return result;
}
