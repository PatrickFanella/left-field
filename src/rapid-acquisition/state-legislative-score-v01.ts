import { scoreSeat, type SeatRoute, type SeatScoreDriver } from "@/lib/seat-score";

import { readPinnedPackage, readSourceLock, type SourceLock } from "./intake/source-lock";
import { REFRESH_INPUTS } from "./refresh-inputs";
import { byteCompare, hash } from "./shared";
import { readStateLegislativeGeneralResults, STATE_LEGISLATIVE_GENERAL_RESULTS, type StateGeneralContest } from "./state-legislative-general-results";
import { STATE_LEGISLATIVE_PRIMARY_CONTEXT, type StateLegislativePrimaryContext } from "./state-legislative-primary-context";
import { readStateLegislativeRoster, STATE_LEGISLATIVE_ROSTER, type StateChamber, type StateLegislativeRosterRow } from "./state-legislative-roster";

/**
 * State-legislative score v0.1: every sitting legislator in a covered state on
 * the two-route model, with the seat's own most recent general-election
 * margin as the district baseline.
 *
 * Inputs: the Open States roster (holder, party, chamber, district), the
 * retained official general returns for the state, the roster's Democratic
 * primary evidence where a catalog exists, and state Democratic primary
 * contestation. No state campaign-finance or alignment evidence is retained,
 * so those weights are omitted and the rest renormalized; rows say so.
 *
 * Seats in states without retained returns, districts with no retained
 * contest, and holders who are neither Democratic nor Republican are carried
 * unscored with the reason, never imputed.
 *
 * Returns can be retained before Open States seats the winners. When a
 * seat's contest was held after the roster snapshot and the roster's holder
 * did not finish in the winning places, the roster is stale for that seat:
 * it is carried as `roster_predates_contest` rather than scoring the outgoing
 * holder on their successor's race.
 */
export type StateLegislativeScoreStatus = "scored" | "state_not_covered" | "no_contest_for_district" | "no_major_party_in_contest" | "holder_party_not_scored" | "roster_predates_contest";

export interface StateLegislativeScoreV01Row {
  readonly seatId: string;
  readonly seatLabel: string;
  readonly stateCode: string;
  readonly chamber: StateChamber;
  readonly district: string;
  readonly seatSlot: number;
  readonly holderName: string;
  readonly openStatesId: string;
  readonly incumbentParty: string;
  readonly caucus: "Democratic" | "Republican" | null;
  readonly status: StateLegislativeScoreStatus;
  readonly baselineContestId: string | null;
  readonly baselineCycleYear: number | null;
  readonly baselineElectionDate: string | null;
  readonly baselineContested: boolean | null;
  readonly baselineSeats: number | null;
  /** Present only when the baseline contest comes from unofficial returns. */
  readonly baselineResultStatus?: "unofficial";
  /** Own-race Democratic margin over Republican share of all votes cast, in percentage points. */
  readonly ownRaceDemocraticMargin: number | null;
  /** Party the holder ran under in the baseline contest, when the holder is named in it; null otherwise. */
  readonly holderBaselineParty: string | null;
  /** The roster's caucus differs from the major party the holder ran under: a party switch since the election, or a roster error. */
  readonly partyMismatch: boolean;
  readonly primaryFeasibility: number | null;
  readonly primaryEvidenceStatus: StateLegislativeRosterRow["primaryEvidence"]["status"];
  readonly stateContestation: number | null;
  readonly nextElectionYear: number | null;
  readonly termYears: number;
  readonly route: SeatRoute | null;
  readonly score: number | null;
  readonly blueBaseline: number | null;
  readonly competitiveness: number | null;
  readonly structuralBaseline: number | null;
  readonly availableWeight: number | null;
  readonly coverageMultiplier: number | null;
  readonly drivers: readonly SeatScoreDriver[];
  readonly formula: string | null;
  readonly rowSha256: string;
}

export interface StateLegislativeScoreV01Projection {
  readonly schema: "state-legislative-score-v01-projection-v1";
  readonly version: 1;
  readonly methodology: Readonly<{
    status: "active";
    roster: "openstates_people_current_csv_cc0";
    baseline: "own_race_general_election_democratic_margin_from_official_state_returns";
    baselineSelection: "latest_retained_general_contest_for_the_chamber_and_district";
    nextElection: "baseline_cycle_year_plus_chamber_term_length";
    omitted: "finance_alignment_local_context";
    winnerInference: false;
  }>;
  readonly parents: readonly Readonly<{ id: string; packageSha256: string | null }>[];
  readonly sourceIds: readonly string[];
  readonly coveredStates: readonly string[];
  readonly rows: readonly StateLegislativeScoreV01Row[];
  readonly summary: Readonly<{
    seats: number; coveredStates: number; scored: number; stateNotCovered: number; noContestForDistrict: number; noMajorPartyInContest: number; holderPartyNotScored: number; partyMismatches: number;
    democraticScored: number; republicanScored: number; primaryFeasibilityValues: number; uncontestedBaselines: number; democraticMaxScore: number | null; republicanMaxScore: number | null;
    /** Seats whose contest postdates the roster and whose holder did not win it; absent when there are none. */
    rosterPredatesContest?: number;
  }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

export const STATE_LEGISLATIVE_SCORE_V01 = {
  id: "state-legislative-score-v01-projection-v1",
  path: "data/metadata/state-legislative-score-v01-projection-v1.json",
  url: "urn:dsa-seats:state-legislative-score-v01-projection:v1",
  parentIds: (): string[] => [REFRESH_INPUTS.id, STATE_LEGISLATIVE_ROSTER.id, STATE_LEGISLATIVE_GENERAL_RESULTS.id, STATE_LEGISLATIVE_PRIMARY_CONTEXT.id],
} as const;

const fail = (code: string): never => { throw new Error(`STATE_LEG_SCORE_V01_${code}`); };

/** Term lengths in years. Lower houses serve two years except where noted; senates four except where noted. */
const FOUR_YEAR_LOWER = new Set(["AL", "LA", "MD", "MS", "ND"]);
const TWO_YEAR_UPPER = new Set(["AZ", "CT", "GA", "ID", "ME", "MA", "NH", "NY", "NC", "RI", "SD", "VT"]);
export const termYearsFor = (stateCode: string, chamber: StateChamber): number =>
  chamber === "lower" ? (FOUR_YEAR_LOWER.has(stateCode) ? 4 : 2) : chamber === "unicameral" ? 4 : TWO_YEAR_UPPER.has(stateCode) ? 2 : 4;

export const stateSeatLabel = (stateCode: string, chamber: StateChamber, district: string): string =>
  `${stateCode} ${chamber === "lower" ? "House" : "Senate"} ${district}`;

export function buildStateLegislativeScoreV01Projection(root = process.cwd(), lock: SourceLock = readSourceLock(root)): StateLegislativeScoreV01Projection {
  const roster = readStateLegislativeRoster(root, lock);
  const general = readStateLegislativeGeneralResults(root, lock);
  const context = readPinnedPackage<StateLegislativePrimaryContext>(lock, STATE_LEGISLATIVE_PRIMARY_CONTEXT.id, "dsa-seats:rapid-state-legislative-primary-context-package:v1", root).value;
  const contestation = new Map(context.stateContext.map((row) => [row.state, row.contestationScore]));
  const covered = new Set(general.states.map((state) => state.stateCode));

  // Latest retained contest per state, chamber, district and position; a later special general supersedes the regular one.
  const latest = new Map<string, StateGeneralContest>();
  for (const contest of general.contests) {
    const key = `${contest.stateCode}|${contest.chamber}|${contest.districtKey}|${contest.position ?? ""}`, current = latest.get(key);
    if (!current || byteCompare(contest.electionDate, current.electionDate) > 0) latest.set(key, contest);
  }
  const byDistrict = new Map<string, StateGeneralContest[]>();
  for (const contest of latest.values()) {
    const key = `${contest.stateCode}|${contest.chamber}|${contest.districtKey}`;
    byDistrict.set(key, [...(byDistrict.get(key) ?? []), contest]);
  }
  const familyToken = (value: string): string => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const namesHolder = (contest: StateGeneralContest, seat: StateLegislativeRosterRow): boolean => {
    const family = familyToken(seat.familyName).split(" ").filter(Boolean), given = familyToken(seat.givenName).split(" ")[0] ?? "";
    return family.length > 0 && contest.candidates.some((candidate) => {
      const tokens = familyToken(candidate.name).split(" ");
      return !candidate.writeIn && family.every((part) => tokens.includes(part)) && (given === "" || tokens.includes(given) || tokens[0]?.[0] === given[0]);
    });
  };
  const directMatch = (seat: StateLegislativeRosterRow, contests: readonly StateGeneralContest[]): StateGeneralContest | null => {
    const named = contests.filter((contest) => namesHolder(contest, seat));
    return named.length === 1 ? named[0]! : null;
  };
  const districtSeats = new Map<string, StateLegislativeRosterRow[]>();
  for (const seat of roster.rows) {
    const key = `${seat.stateCode}|${seat.chamber}|${seat.districtKey}`;
    districtSeats.set(key, [...(districtSeats.get(key) ?? []), seat]);
  }
  /**
   * Where a district elects several positions separately, the holder's contest is the one naming them.
   * A holder named in none (an appointee since the election) takes the one position no colleague matched.
   */
  const contestFor = (seat: StateLegislativeRosterRow): StateGeneralContest | null => {
    const key = `${seat.stateCode}|${seat.chamber}|${seat.districtKey}`;
    const contests = byDistrict.get(key) ?? [];
    if (contests.length <= 1) return contests[0] ?? null;
    const direct = directMatch(seat, contests);
    if (direct) return direct;
    if (contests.some((contest) => namesHolder(contest, seat))) return null;
    const colleagues = (districtSeats.get(key) ?? []).filter((other) => other.seatId !== seat.seatId);
    const claimed = new Set(colleagues.map((other) => directMatch(other, contests)?.contestId).filter((id): id is string => id !== undefined));
    const open = contests.filter((contest) => !claimed.has(contest.contestId));
    return open.length === 1 && colleagues.length === contests.length - 1 ? open[0]! : null;
  };

  const rows = roster.rows.map((seat): StateLegislativeScoreV01Row => {
    const termYears = termYearsFor(seat.stateCode, seat.chamber);
    const base = {
      seatId: seat.seatId, seatLabel: stateSeatLabel(seat.stateCode, seat.chamber, seat.district), stateCode: seat.stateCode, chamber: seat.chamber, district: seat.district, seatSlot: seat.seatSlot,
      holderName: seat.name, openStatesId: seat.openStatesId, incumbentParty: seat.rawParty,
      primaryFeasibility: seat.primaryEvidence.primaryFeasibility, primaryEvidenceStatus: seat.primaryEvidence.status, termYears,
    };
    const holderLine = (contest: StateGeneralContest | null): StateGeneralContest["candidates"][number] | null => {
      if (!contest) return null;
      const family = familyToken(seat.familyName).split(" ").filter(Boolean), given = familyToken(seat.givenName).split(" ")[0] ?? "";
      const named = contest.candidates.filter((candidate) => { const tokens = familyToken(candidate.name).split(" "); return !candidate.writeIn && family.length > 0 && family.every((part) => tokens.includes(part)) && (given === "" || tokens.includes(given) || tokens[0]?.[0] === given[0]); });
      return named.length === 1 ? named[0]! : null;
    };
    // The holder is among the contest's `seats` highest named candidates. Used only for contests held after the roster snapshot.
    const holderWon = (contest: StateGeneralContest): boolean => {
      const line = holderLine(contest);
      return line !== null && contest.candidates.filter((candidate) => !candidate.writeIn).slice(0, contest.seats).includes(line);
    };
    const identity = (contest: StateGeneralContest | null, caucus: "Democratic" | "Republican" | null) => {
      const line = holderLine(contest);
      const ranAs = line && (line.party === "Democratic" || line.party === "Republican") ? line.party : null;
      return { holderBaselineParty: line ? line.rawParty : null, partyMismatch: caucus !== null && ranAs !== null && ranAs !== caucus };
    };
    const unscored = (status: Exclude<StateLegislativeScoreStatus, "scored">, contest: StateGeneralContest | null, caucus: "Democratic" | "Republican" | null) => {
      const unsigned = {
        ...base, caucus, status, ...identity(contest, caucus),
        baselineContestId: contest?.contestId ?? null, baselineCycleYear: contest?.cycleYear ?? null, baselineElectionDate: contest?.electionDate ?? null, baselineContested: contest?.contested ?? null, baselineSeats: contest?.seats ?? null,
        ...(contest?.resultStatus ? { baselineResultStatus: contest.resultStatus } : {}),
        ownRaceDemocraticMargin: contest?.democraticMarginPercentagePoints ?? null, stateContestation: null, nextElectionYear: contest ? contest.cycleYear + termYears : null,
        route: null, score: null, blueBaseline: null, competitiveness: null, structuralBaseline: null, availableWeight: null, coverageMultiplier: null, drivers: [] as SeatScoreDriver[], formula: null,
      };
      return { ...unsigned, rowSha256: hash("dsa-seats:state-legislative-score-v01-row:v1", unsigned) };
    };
    const caucus: "Democratic" | "Republican" | null = seat.party === "Democratic" ? "Democratic" : seat.party === "Republican" ? "Republican" : null;
    if (!covered.has(seat.stateCode)) return unscored("state_not_covered", null, caucus);
    const contest = contestFor(seat);
    if (!contest) return unscored("no_contest_for_district", null, caucus);
    if (byteCompare(contest.electionDate, roster.snapshotDate) > 0 && !holderWon(contest)) return unscored("roster_predates_contest", contest, caucus);
    if (contest.democraticMarginPercentagePoints === null) return unscored("no_major_party_in_contest", contest, caucus);
    if (caucus === null) return unscored("holder_party_not_scored", contest, null);
    const stateContestation = caucus === "Republican" ? contestation.get(seat.stateCode) ?? null : null;
    const scored = scoreSeat({ caucus, presidentialDemocraticMargin2024: contest.democraticMarginPercentagePoints, primaryFeasibility: caucus === "Democratic" ? seat.primaryEvidence.primaryFeasibility : null, alignmentGap: null, cashOnHand: null, localContext: null, stateContestation });
    const unsigned = {
      ...base, caucus, status: "scored" as const, ...identity(contest, caucus),
      baselineContestId: contest.contestId, baselineCycleYear: contest.cycleYear, baselineElectionDate: contest.electionDate, baselineContested: contest.contested, baselineSeats: contest.seats,
      ...(contest.resultStatus ? { baselineResultStatus: contest.resultStatus } : {}),
      ownRaceDemocraticMargin: contest.democraticMarginPercentagePoints, stateContestation, nextElectionYear: contest.cycleYear + termYears,
      route: scored.route, score: scored.score, blueBaseline: scored.blueBaseline, competitiveness: scored.competitiveness, structuralBaseline: scored.structuralBaseline,
      availableWeight: scored.availableWeight, coverageMultiplier: scored.coverageMultiplier, drivers: scored.drivers, formula: scored.formula,
    };
    return { ...unsigned, rowSha256: hash("dsa-seats:state-legislative-score-v01-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.seatId, right.seatId));
  if (rows.length !== roster.rows.length) fail("CLOSURE_INVALID");

  const scored = rows.filter((row) => row.status === "scored");
  const democrats = scored.filter((row) => row.caucus === "Democratic"), republicans = scored.filter((row) => row.caucus === "Republican");
  const max = (list: readonly StateLegislativeScoreV01Row[]): number | null => list.length ? Math.max(...list.map((row) => row.score ?? 0)) : null;
  const summary = {
    seats: rows.length, coveredStates: covered.size, scored: scored.length,
    stateNotCovered: rows.filter((row) => row.status === "state_not_covered").length, noContestForDistrict: rows.filter((row) => row.status === "no_contest_for_district").length, noMajorPartyInContest: rows.filter((row) => row.status === "no_major_party_in_contest").length, partyMismatches: rows.filter((row) => row.partyMismatch).length, holderPartyNotScored: rows.filter((row) => row.status === "holder_party_not_scored").length,
    // Present only when some seat has it, so packages built before the status existed keep their digests.
    ...(rows.some((row) => row.status === "roster_predates_contest") ? { rosterPredatesContest: rows.filter((row) => row.status === "roster_predates_contest").length } : {}),
    democraticScored: democrats.length, republicanScored: republicans.length, primaryFeasibilityValues: democrats.filter((row) => row.primaryFeasibility !== null).length,
    uncontestedBaselines: scored.filter((row) => row.baselineContested === false).length, democraticMaxScore: max(democrats), republicanMaxScore: max(republicans),
  };
  const unsigned = {
    schema: "state-legislative-score-v01-projection-v1" as const, version: 1 as const,
    methodology: { status: "active" as const, roster: "openstates_people_current_csv_cc0" as const, baseline: "own_race_general_election_democratic_margin_from_official_state_returns" as const, baselineSelection: "latest_retained_general_contest_for_the_chamber_and_district" as const, nextElection: "baseline_cycle_year_plus_chamber_term_length" as const, omitted: "finance_alignment_local_context" as const, winnerInference: false as const },
    parents: [{ id: STATE_LEGISLATIVE_ROSTER.id, packageSha256: roster.packageSha256 }, { id: STATE_LEGISLATIVE_GENERAL_RESULTS.id, packageSha256: general.packageSha256 }, { id: STATE_LEGISLATIVE_PRIMARY_CONTEXT.id, packageSha256: context.packageSha256 }, { id: REFRESH_INPUTS.id, packageSha256: null }],
    sourceIds: STATE_LEGISLATIVE_SCORE_V01.parentIds(), coveredStates: [...covered].sort(), rows, summary,
    rowSetSha256: hash("dsa-seats:state-legislative-score-v01-row-set:v1", rows),
  };
  return { ...unsigned, packageSha256: hash("dsa-seats:state-legislative-score-v01-package:v1", unsigned) };
}

export function readStateLegislativeScoreV01Projection(root = process.cwd(), lock: SourceLock = readSourceLock(root)): StateLegislativeScoreV01Projection {
  const { value } = readPinnedPackage<StateLegislativeScoreV01Projection>(lock, STATE_LEGISLATIVE_SCORE_V01.id, "dsa-seats:state-legislative-score-v01-package:v1", root);
  if (value.schema !== "state-legislative-score-v01-projection-v1" || value.rows.length !== value.summary.seats || value.methodology.winnerInference !== false) fail("PROJECTION_INVALID");
  return value;
}
