import { familyMatches, holderMatches, normalizeName, type HolderName } from "./holder-name-match";
import type { HolderParty, PreElectionSeatRow } from "./pre-election-snapshot-2026";
import type { CandidacyStatus, ContestEvidence, CountStatus, HolderCandidacy, Successor } from "./seat-outcome-evidence";

/**
 * Resolve one seat's 2026 outcome from graded evidence.
 *
 * Pure: no I/O, no inference. The rules run in the spec's order and a later
 * rule never overrides an earlier one. A count settles an outcome only when
 * it is certified or when the source itself marks the winner; an unofficial
 * count is `pending`. A seat with no evidence is `unknown`, and the grade
 * beside every outcome says what it rests on.
 */
export type Stage = "not_up_in_2026" | "up_in_2026";
export type Outcome = "not_up_in_2026" | "incumbent_ran_for_other_office" | "incumbent_lost_primary" | "incumbent_lost_general" | "incumbent_won" | "open_seat_held" | "open_seat_flipped" | "seat_changed_hands" | "unknown";
export type EvidenceGrade = "fec_filing" | "primary_source_marked_winner" | "primary_vote_order_certified" | "general_source_marked_winner" | "general_vote_order_certified" | "roster_change" | "none";
export type ContestStatus = "won" | "lost" | "pending" | "unknown" | "not_applicable";

export interface ContestResolution {
  readonly status: ContestStatus;
  readonly contestId: string | null;
  readonly countStatus: CountStatus | null;
  readonly evidence: EvidenceGrade;
}

export interface Resolution {
  readonly stage: Stage;
  readonly candidacy: CandidacyStatus;
  readonly primary: ContestResolution;
  readonly general: ContestResolution;
  readonly successorParty: HolderParty | null;
  readonly outcome: Outcome;
  readonly evidence: EvidenceGrade;
  readonly evidenceSourceIds: readonly string[];
}

export interface ResolveInput {
  readonly row: PreElectionSeatRow;
  readonly holder: HolderName;
  readonly candidacy: HolderCandidacy | null;
  readonly primaries: readonly ContestEvidence[];
  readonly generals: readonly ContestEvidence[];
  readonly successor: Successor | null;
}

export const OUTCOMES: readonly Outcome[] = ["not_up_in_2026", "incumbent_ran_for_other_office", "incumbent_lost_primary", "incumbent_lost_general", "incumbent_won", "open_seat_held", "open_seat_flipped", "seat_changed_hands", "unknown"];
export const RESOLUTION_ORDER = ["stage", "candidacy", "primary", "general", "roster_change"] as const;

const unknown: ContestResolution = { status: "unknown", contestId: null, countStatus: null, evidence: "none" };
const notApplicable: ContestResolution = { status: "not_applicable", contestId: null, countStatus: null, evidence: "none" };

/** What one retained contest says about the holder, and whether the holder was on that ballot at all. */
interface Assessment {
  readonly resolution: ContestResolution;
  /** false when the contest names no candidate matching the holder; null when none is retained or the match is ambiguous. */
  readonly holderOnBallot: boolean | null;
  /** The party of the first settled winner, when the source records candidate parties. */
  readonly winnerParty: HolderParty | null;
  /** The grade a settled result from this contest carries. */
  readonly grade: EvidenceGrade;
  readonly sourceIds: readonly string[];
}

/**
 * States whose primaries send the top two to a runoff unless the leader clears
 * a share of the vote. A certified first-round count there settles the holder
 * only when the leader clears it or the holder finishes outside the top two.
 */
export const PRIMARY_RUNOFF_THRESHOLDS: Readonly<Record<string, number>> = { AL: 0.5, AR: 0.5, GA: 0.5, MS: 0.5, OK: 0.5, SC: 0.5, TX: 0.5, NC: 0.3, SD: 0.35 };

function assessOne(kind: "primary" | "general", contest: ContestEvidence, holder: HolderName, runoffThreshold: number | null): Assessment {
  const base = { contestId: contest.contestId, countStatus: contest.countStatus };
  const matching = contest.candidates.filter((candidate) => holderMatches(holder, candidate.name));
  const sameFamily = contest.candidates.filter((candidate) => familyMatches(holder, candidate.name));
  const marked = contest.sourceMarkedWinners;
  const sorted = [...contest.candidates].sort((left, right) => right.votes - left.votes);
  const total = sorted.reduce((sum, candidate) => sum + candidate.votes, 0);
  // A first round in a runoff state is open while the leader is at or under the threshold.
  // Runoffs follow party primaries only; an all-party ballot already sends its leading places on.
  const runoffOpen = marked === null && contest.countStatus === "certified" && runoffThreshold !== null && contest.party !== null && contest.seats === 1 && (total === 0 || (sorted[0]?.votes ?? 0) / total <= runoffThreshold);
  // The places that win: the seats in a party primary, the advancing places on a top-two or top-four ballot.
  const winners = marked !== null
    ? contest.candidates.filter((candidate) => marked.some((winner) => normalizeName(winner) === normalizeName(candidate.name)))
    : contest.countStatus === "certified" && !runoffOpen ? sorted.slice(0, contest.advance) : null;
  const grade: EvidenceGrade = marked !== null ? `${kind}_source_marked_winner` : contest.countStatus === "certified" ? `${kind}_vote_order_certified` : "none";
  const winnerParty = winners !== null && winners.length > 0 ? winners[0]!.party ?? null : null;
  const settled = (status: ContestStatus, evidence: EvidenceGrade, holderOnBallot: boolean | null, party: HolderParty | null = winnerParty): Assessment => ({ resolution: { ...base, status, evidence }, holderOnBallot, winnerParty: party, grade, sourceIds: contest.sourceIds });
  // Absence is claimed only when no candidate carries the holder's family name; a family-name match with a
  // different given name is an open question, never evidence that the holder stayed off the ballot.
  if (sameFamily.length === 0) return settled("not_applicable", "none", false);
  if (matching.length !== 1) return settled("unknown", "none", null, null);
  const line = matching[0]!;
  // Outside the runoff places, the holder is out whatever the runoff decides.
  if (runoffOpen) return sorted.indexOf(line) >= 2 ? settled("lost", grade, true, null) : settled("pending", "none", true, null);
  if (winners === null) return settled("pending", "none", true, null);
  const won = marked !== null ? marked.some((winner) => holderMatches(holder, winner)) : winners.includes(line);
  return settled(won ? "won" : "lost", grade, true);
}

/**
 * Over every retained round in date order: a round that settles the holder as lost stands whatever a later
 * runoff file says, since the holder is not in it; otherwise the latest round speaks. A holder named in an
 * earlier round but absent from the latest was on a ballot, so the latest round's absence is not a retirement.
 */
function assess(kind: "primary" | "general", contests: readonly ContestEvidence[], holder: HolderName, runoffThreshold: number | null): Assessment {
  if (contests.length === 0) return { resolution: unknown, holderOnBallot: null, winnerParty: null, grade: "none", sourceIds: [] };
  const ordered = [...contests].sort((left, right) => left.electionDate.localeCompare(right.electionDate) || left.contestId.localeCompare(right.contestId));
  const assessments = ordered.map((contest) => assessOne(kind, contest, holder, runoffThreshold));
  const lost = assessments.find((assessment) => assessment.resolution.status === "lost");
  if (lost) return lost;
  const latest = assessments.at(-1)!;
  if (latest.holderOnBallot === false && assessments.some((assessment) => assessment.holderOnBallot === true)) return { ...latest, resolution: { ...latest.resolution, status: "unknown", evidence: "none" }, holderOnBallot: true, winnerParty: null };
  return latest;
}

export function resolveOutcome(input: ResolveInput): Resolution {
  const { row, holder } = input;
  if (row.nextElectionYear !== 2026) return { stage: "not_up_in_2026", candidacy: "not_applicable", primary: notApplicable, general: notApplicable, successorParty: null, outcome: "not_up_in_2026", evidence: "none", evidenceSourceIds: [] };
  const sources: string[] = [];
  const cite = (ids: readonly string[]) => { for (const id of ids) if (!sources.includes(id)) sources.push(id); };
  let candidacy: CandidacyStatus = input.candidacy?.status ?? "not_observed";
  if (input.candidacy) cite(input.candidacy.sourceIds);
  const done = (outcome: Outcome, evidence: EvidenceGrade, primary: ContestResolution, general: ContestResolution, successorParty: HolderParty | null = null): Resolution =>
    ({ stage: "up_in_2026", candidacy, primary, general, successorParty, outcome, evidence, evidenceSourceIds: sources });

  if (candidacy === "filed_for_other_office") return done("incumbent_ran_for_other_office", "fec_filing", notApplicable, notApplicable);

  // The holder's own party primary, or the all-party ballot every holder faces whatever their party. A holder the
  // roster lists outside the major parties counts a major-party primary only where it names them.
  const majorParty = row.holderParty === "Democratic" || row.holderParty === "Republican";
  const ownPrimaries = input.primaries.filter((contest) => contest.party === null || (majorParty ? contest.party === row.holderParty : contest.candidates.some((candidate) => holderMatches(holder, candidate.name))));
  const primary = assess("primary", ownPrimaries, holder, PRIMARY_RUNOFF_THRESHOLDS[row.stateCode] ?? null);
  cite(primary.sourceIds);
  if (primary.holderOnBallot === false) candidacy = "not_on_primary_ballot";
  if (primary.resolution.status === "lost") return done("incumbent_lost_primary", primary.resolution.evidence, primary.resolution, notApplicable);

  const general = assess("general", input.generals, holder, null);
  cite(general.sourceIds);
  if (general.resolution.status === "lost") return done("incumbent_lost_general", general.resolution.evidence, primary.resolution, general.resolution);
  if (general.resolution.status === "won") return done("incumbent_won", general.resolution.evidence, primary.resolution, general.resolution);
  if (general.holderOnBallot === false && general.winnerParty !== null) {
    return done(general.winnerParty === row.holderParty ? "open_seat_held" : "open_seat_flipped", general.grade, primary.resolution, general.resolution, general.winnerParty);
  }

  const successor = input.successor;
  if (successor !== null) {
    cite([successor.sourceId]);
    const viaRoster = (status: ContestStatus): ContestResolution => ({ ...general.resolution, status, evidence: "roster_change" });
    if (successor.holderId === row.holderId) return done("incumbent_won", "roster_change", primary.resolution, viaRoster("won"), successor.party);
    if (candidacy === "not_on_primary_ballot" || general.holderOnBallot === false) return done(successor.party === row.holderParty ? "open_seat_held" : "open_seat_flipped", "roster_change", primary.resolution, general.resolution, successor.party);
    // Only a holder known to have reached the general ballot can have lost it there. A filing alone does not
    // show that: a retirement after filing and an unretained primary loss both end as a new holder seated.
    if (primary.resolution.status === "won" || general.holderOnBallot === true) return done("incumbent_lost_general", "roster_change", primary.resolution, viaRoster("lost"), successor.party);
    return done("seat_changed_hands", "roster_change", primary.resolution, general.resolution, successor.party);
  }
  return done("unknown", "none", primary.resolution, general.resolution);
}
