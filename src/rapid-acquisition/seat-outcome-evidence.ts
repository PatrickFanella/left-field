import { GOVERNOR_SCORE_V01, readGovernorScoreV01Projection, type GovernorScoreV01Row } from "./governor-score-v01";
import { readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { holderPartyOf, type HolderParty, type PreElectionSeatRow, type PreElectionSnapshot2026 } from "./pre-election-snapshot-2026";
import { CONGRESS_LEGISLATORS_BASELINE_ID, readRefreshInputs } from "./refresh-inputs";
import { familyMatches, holderMatches, type HolderName } from "./holder-name-match";
import { byteCompare } from "./shared";
import { STATE_PRIMARY_RESULTS_2026, type PrimaryOffice, type StatePrimaryResults2026 } from "./state-primary-results-2026";
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
  /** The party whose nominee this contest chooses; null on a top-two or top-four ballot open to every party. */
  readonly party: EvidenceParty | null;
  readonly electionDate: string;
  readonly seats: number;
  /** Places that win or advance: the seats in a partisan primary, two or four on an all-party ballot. */
  readonly advance: number;
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
  // The House primary files retained for review, each an official canvass, statement of vote or abstract.
  "certified_statement_of_vote",
  "signed_secretary_certificate_bound_to_abstract",
  "official_canvass_report_retained_certification_not_separately_bound",
  "division_labeled_official_result_not_separate_seal",
  "state_canvass_certification_announcement_retained_exact_certificate_bytes_not_retained",
  "final_labeled_workbook_retained_separate_signed_certification_not_retained",
  "rcv_central_count_summary_retained_separate_signed_certification_not_retained",
  "official_statewide_abstract_retained",
  "official_statewide_archive_retained_certification_instrument_not_retained",
];

export const countStatusOf = (certificationStatus: string | null | undefined): CountStatus =>
  certificationStatus !== null && certificationStatus !== undefined && CERTIFIED_COUNT_STATUSES.includes(certificationStatus) ? "certified" : "unofficial";

const fail = (code: string): never => { throw new Error(`OUTCOME_EVIDENCE_${code}`); };
const readJson = <T,>(lock: SourceLock, id: string, root: string): T => JSON.parse(readRetainedSource(lock, id, root).bytes.toString("utf8")) as T;

/** A major party from a source label; null for anything else. */
export const evidencePartyOf = (raw: string | undefined): EvidenceParty | null => {
  const key = (raw ?? "").trim().toLowerCase();
  if (/^(d|dem|democrat|democratic|dfl)\b/.test(key) || key.startsWith("democratic")) return "Democratic";
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
        contestId: result.resultId, sourceIds: result.sourceLockIds ?? [id], party: evidencePartyOf(result.rawParty ?? "D") ?? "Democratic", electionDate: result.electionDate, seats: 1, advance: 1,
        candidates: result.sourceCandidateNames.map((name, index) => ({ name, votes: result.candidateVotes[index]! })),
        sourceMarkedWinners: marked, countStatus: countStatusOf(result.certificationStatus),
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

/** The 2026 state-legislative primary catalogs the primary context lists (GA, KY, NC, OH), eligible for the formula or not. */
export function stateLegislativePrimaryCatalogIds2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): readonly string[] {
  const context = readJson<{ rows: { cycleYear: number; sourceArtifactId?: string }[] }>(lock, STATE_LEGISLATIVE_PRIMARY_CONTEXT_ID, root);
  return [...new Set(context.rows.filter((row) => row.cycleYear === 2026).map((row) => row.sourceArtifactId).filter((id): id is string => typeof id === "string" && id.includes("-state-legislative-")))].sort(byteCompare);
}

/** The 2026 state-legislative primaries in the retained catalogs (GA, KY, NC, OH), keyed by `${state}|${chamber}|${districtKey}`. */
export function readStateLegislativePrimaryEvidence2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): ReadonlyMap<string, readonly PrimaryEvidence[]> {
  const byDistrict = new Map<string, PrimaryEvidence[]>();
  for (const id of stateLegislativePrimaryCatalogIds2026(root, lock)) {
    const catalog = readJson<{ contests: StateLegislativePrimaryContest[] }>(lock, id, root);
    for (const contest of catalog.contests.filter((row) => row.cycleYear === 2026)) {
      const party = evidencePartyOf(contest.rawParty), chamber = chamberOf(contest.chamber);
      if (party === null || chamber === null) continue;
      const stateCode = contest.contestId.slice(0, 2).toUpperCase(), district = contest.district ?? contest.districtCode ?? fail(`DISTRICT_MISSING:${contest.contestId}`);
      const key = `${stateCode}|${chamber}|${districtKey(district)}`;
      // No retained state-legislative catalog marks winners; a future one needs its winner field read here, not guessed.
      if (contest.sourceWinnerStatus === "marked_by_source") fail(`WINNER_MARK_UNHANDLED:${contest.contestId}`);
      const evidence: PrimaryEvidence = {
        contestId: contest.contestId, sourceIds: contest.sourceLockIds ?? [id], party, electionDate: contest.electionDate, seats: contest.seats ?? 1, advance: contest.seats ?? 1,
        candidates: contest.candidates.map((candidate) => ({ name: candidate.sourceName, votes: candidate.votes })),
        sourceMarkedWinners: null, countStatus: countStatusOf(contest.certificationStatus),
      };
      byDistrict.set(key, [...(byDistrict.get(key) ?? []), evidence]);
    }
  }
  return byDistrict;
}

/**
 * The 2026 House primary files retained for review, approved on 2026-11-04 for the outcome ledger only, not for
 * scoring. Each is the latest version for its state; a state with a statewide primary adapter reads that instead.
 * CA is a top-two ballot; every other file is the Democratic primary.
 */
export const REVIEWED_HOUSE_PRIMARY_2026_IDS: readonly string[] = [
  "california-house-top-two-results-2022-2026-v1",
  "colorado-house-democratic-primary-results-2022-2026-v1",
  "georgia-house-democratic-primary-results-2022-2026-v1",
  "maine-house-democratic-primary-results-2022-2026-v1",
  "new-jersey-house-democratic-primary-results-2022-2026-v1",
  "new-mexico-house-democratic-primary-results-2022-2026-v1",
  "north-carolina-house-democratic-primary-results-2022-2026-v1",
  "ohio-house-democratic-primary-results-2022-2026-v4",
  "oregon-house-democratic-primary-results-2022-2026-v1",
  "texas-house-democratic-primary-results-2022-2026-v1",
  "virginia-house-democratic-primary-results-2022-2026-v1",
];

type ReviewedCandidate = { sourceCandidateName: string; votes?: number; workbookFirstChoiceVotes?: number; winnerMarker?: boolean; sourceNomineeMarker?: boolean; sourceWinnerMarker?: boolean };
type ReviewedContest = {
  contestId: string; cycleYear?: number; electionDate: string; stateCode: string; districtCode: string; party?: string; rawParty?: string; electionStage?: string; eventKind?: string;
  certificationStatus?: string; resultAuthorityStatus?: string; sourceLockId?: string; sourceLockIds?: string[]; sourceWinnerStatus?: string; winnerSourceCandidateName?: string | null; candidates: ReviewedCandidate[];
};

/** The 2026 contests of the reviewed House primary files, keyed by district label ("TX-18"). */
export function readReviewedHousePrimaryEvidence2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): ReadonlyMap<string, readonly PrimaryEvidence[]> {
  const byDistrict = new Map<string, PrimaryEvidence[]>();
  for (const id of REVIEWED_HOUSE_PRIMARY_2026_IDS) {
    const topTwo = id.startsWith("california-");
    for (const contest of readJson<{ contests: ReviewedContest[] }>(lock, id, root).contests) {
      if (!(contest.cycleYear === 2026 || contest.electionDate.startsWith("2026"))) continue;
      const party = topTwo ? null : evidencePartyOf(contest.party ?? contest.rawParty) ?? fail(`REVIEWED_PARTY:${contest.contestId}`);
      const marks = contest.candidates.filter((candidate) => candidate.winnerMarker === true || candidate.sourceNomineeMarker === true || candidate.sourceWinnerMarker === true).map((candidate) => candidate.sourceCandidateName);
      const explicit = (contest.sourceWinnerStatus === "marked_by_source" || contest.sourceWinnerStatus === "explicit_rcv_summary_winner") && contest.winnerSourceCandidateName ? [contest.winnerSourceCandidateName] : [];
      const marked = [...new Set([...marks, ...explicit])];
      const label = `${contest.stateCode}-${/^(0+|al)$/i.test(contest.districtCode) ? "AL" : contest.districtCode.padStart(2, "0")}`;
      const evidence: PrimaryEvidence = {
        contestId: contest.contestId, sourceIds: [id, ...(contest.sourceLockIds ?? (contest.sourceLockId ? [contest.sourceLockId] : []))], party, electionDate: contest.electionDate,
        seats: 1, advance: topTwo ? 2 : 1,
        candidates: contest.candidates.map((candidate) => ({ name: candidate.sourceCandidateName, votes: candidate.votes ?? candidate.workbookFirstChoiceVotes ?? fail(`REVIEWED_VOTES:${contest.contestId}`) })),
        sourceMarkedWinners: marked.length > 0 ? marked : null, countStatus: countStatusOf(contest.certificationStatus ?? contest.resultAuthorityStatus),
      };
      byDistrict.set(label, [...(byDistrict.get(label) ?? []), evidence]);
    }
  }
  return byDistrict;
}

/** Primary evidence by `${state}|${office}|${district}`, and by `${state}|${office}` for a holder who ran elsewhere. */
export interface PrimaryEvidenceIndex {
  readonly byDistrict: ReadonlyMap<string, readonly PrimaryEvidence[]>;
  readonly byOffice: ReadonlyMap<string, readonly PrimaryEvidence[]>;
}
export type PrimaryEvidenceEntry = Readonly<{ stateCode: string; office: PrimaryOffice; district: string | null; evidence: PrimaryEvidence }>;

export function buildPrimaryEvidenceIndex(entries: Iterable<PrimaryEvidenceEntry>): PrimaryEvidenceIndex {
  const byDistrict = new Map<string, PrimaryEvidence[]>(), byOffice = new Map<string, PrimaryEvidence[]>();
  for (const { stateCode, office, district, evidence } of entries) {
    const districtKeyed = `${stateCode}|${office}|${district ?? ""}`, officeKeyed = `${stateCode}|${office}`;
    byDistrict.set(districtKeyed, [...(byDistrict.get(districtKeyed) ?? []), evidence]);
    byOffice.set(officeKeyed, [...(byOffice.get(officeKeyed) ?? []), evidence]);
  }
  return { byDistrict, byOffice };
}

/** The statewide layer's contests as index entries. A third party's primary never decides a major-party holder's nomination, so it is left out. */
export function statePrimaryEntries(results: Pick<StatePrimaryResults2026, "contests">): PrimaryEvidenceEntry[] {
  return results.contests.filter((contest) => contest.system !== "partisan" || contest.party !== null).map((contest) => ({
    stateCode: contest.stateCode, office: contest.office, district: contest.district,
    evidence: {
      contestId: contest.contestId, sourceIds: [STATE_PRIMARY_RESULTS_2026.id, contest.sourceId], party: contest.party, electionDate: contest.electionDate, seats: contest.seats, advance: contest.advance,
      candidates: contest.candidates.filter((candidate) => !candidate.writeIn).map((candidate) => ({ name: candidate.name, votes: candidate.votes })),
      sourceMarkedWinners: contest.sourceMarkedWinners, countStatus: contest.countStatus,
    },
  }));
}

/** House evidence keyed by district label ("TX-18") as index entries. */
export const houseLabelEntries = (byLabel: ReadonlyMap<string, readonly PrimaryEvidence[]>): PrimaryEvidenceEntry[] =>
  [...byLabel].flatMap(([label, list]) => list.map((evidence) => ({ stateCode: label.slice(0, 2), office: "us_house" as const, district: label.slice(3), evidence })));

/** State-legislative evidence keyed `${state}|${chamber}|${districtKey}` as index entries. */
export const stateDistrictEntries = (byKey: ReadonlyMap<string, readonly PrimaryEvidence[]>): PrimaryEvidenceEntry[] =>
  [...byKey].flatMap(([key, list]) => {
    const [stateCode, chamber, district] = key.split("|") as [string, StateChamber, string];
    const office: PrimaryOffice = chamber === "lower" ? "state_lower" : chamber === "upper" ? "state_upper" : "state_unicameral";
    return list.map((evidence) => ({ stateCode, office, district, evidence }));
  });

/** The primary office that fills a frozen seat, and its district in the statewide layer's terms (null statewide). */
export function seatPrimaryKey(row: Pick<PreElectionSeatRow, "seatId" | "chamber" | "seatLabel">): Readonly<{ office: PrimaryOffice; district: string | null }> {
  if (row.chamber === "house") return { office: "us_house", district: row.seatLabel.split("-")[1] ?? fail(`HOUSE_LABEL:${row.seatLabel}`) };
  if (row.chamber === "senate") return { office: "us_senate", district: null };
  if (row.chamber === "governor") return { office: "governor", district: null };
  const match = row.seatId.match(/^seat_state_[a-z]{2}_(lower|upper|unicameral)_(.+)_\d+$/) ?? fail(`SEAT_ID_UNRECOGNISED:${row.seatId}`);
  return { office: match[1] === "lower" ? "state_lower" : match[1] === "upper" ? "state_upper" : "state_unicameral", district: match[2]!.replace(/-/g, " ") };
}

/**
 * The contests that speak to one holder: the holder's own party (or the all-party ballot) in the seat's district,
 * plus any contest for the same office elsewhere in the state that names the holder, since a redrawn map can move
 * a holder to another district number. When any of those carries the holder's family name only those are kept,
 * so a district the holder left is not read as a retirement; otherwise the district's contests stand as evidence
 * that the holder was not on that ballot.
 */
export function primaryEvidenceForSeat(index: PrimaryEvidenceIndex, row: Pick<PreElectionSeatRow, "seatId" | "chamber" | "stateCode" | "seatLabel" | "holderParty">, holder: HolderName): readonly PrimaryEvidence[] {
  const { office, district } = seatPrimaryKey(row);
  // A holder the roster lists outside the two major parties still counts a major-party primary that names them.
  const major = row.holderParty === "Democratic" || row.holderParty === "Republican";
  const own = (contest: PrimaryEvidence): boolean => contest.party === null || contest.party === row.holderParty || (!major && contest.candidates.some((candidate) => holderMatches(holder, candidate.name)));
  const local = (index.byDistrict.get(`${row.stateCode}|${office}|${district ?? ""}`) ?? []).filter(own);
  if (district === null) return local;
  const elsewhere = (index.byOffice.get(`${row.stateCode}|${office}`) ?? []).filter((contest) => own(contest) && !local.includes(contest) && contest.candidates.some((candidate) => holderMatches(holder, candidate.name)));
  const named = local.filter((contest) => contest.candidates.some((candidate) => familyMatches(holder, candidate.name)));
  return named.length + elsewhere.length > 0 ? [...named, ...elsewhere] : local;
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
    // Pair each departure with an arrival of the same party first, so a district that swapped one Democrat and
    // one Republican for another pair is not read as two party flips; the rest pair in id order.
    const unpaired = [...arrivals];
    const take = (party: HolderParty | null) => {
      const index = unpaired.findIndex((arrival) => party === null || holderPartyOf(arrival.party) === party);
      return index >= 0 ? unpaired.splice(index, 1)[0]! : undefined;
    };
    const paired = new Map(departed.map((row) => [row.seatId, take(row.holderParty)] as const));
    for (const row of departed) {
      const arrival = paired.get(row.seatId) ?? take(null);
      result.set(row.seatId, arrival ? { holderId: arrival.openStatesId, holderName: arrival.name, party: holderPartyOf(arrival.party), sourceId: STATE_LEGISLATIVE_ROSTER.id } : null);
    }
  }
  return result;
}
