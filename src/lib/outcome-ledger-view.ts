import { findSourceLockEntry, readSourceLock } from "@/rapid-acquisition/intake/source-lock";
import { PRE_ELECTION_SNAPSHOT_2026 } from "@/rapid-acquisition/pre-election-snapshot-2026";
import { readSeatOutcomeLedger, SEAT_OUTCOME_LEDGER, type SeatOutcomeLedger, type SeatOutcomeRow } from "@/rapid-acquisition/seat-outcome-ledger";
import type { CandidacyStatus } from "@/rapid-acquisition/seat-outcome-evidence";
import type { ContestStatus, EvidenceGrade, Outcome } from "@/rapid-acquisition/seat-outcome-resolver";
import type { StateLegislativeScoreStatus } from "@/rapid-acquisition/state-legislative-score-v01";

import type { PriorityChamber } from "./house-priority-index";

/**
 * Read model for the 2026 outcomes page and the brief line. Copy lives here so
 * the page, the brief and the methodology section say the same thing; every
 * outcome names its evidence grade beside it, and "unknown" stays visible.
 */
const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  not_up_in_2026: "Not on the 2026 ballot",
  incumbent_ran_for_other_office: "Ran for another office",
  incumbent_lost_primary: "Lost the primary",
  incumbent_lost_general: "Lost the general",
  incumbent_won: "Won re-election",
  open_seat_held: "Open seat held by the same party",
  open_seat_flipped: "Open seat changed party",
  unknown: "No retained evidence yet",
};

const EVIDENCE_LABELS: Readonly<Record<EvidenceGrade, string>> = {
  fec_filing: "FEC candidate filing",
  primary_source_marked_winner: "primary winner marked by the state",
  primary_vote_order_certified: "certified primary count",
  general_source_marked_winner: "general-election winner marked by the state",
  general_vote_order_certified: "certified general-election count",
  roster_change: "the seat's roster names a new holder",
  none: "no settling evidence",
};

const CONTEST_STATUS_LABELS: Readonly<Record<ContestStatus, string>> = {
  won: "won",
  lost: "lost",
  pending: "pending (count not certified or runoff ahead)",
  unknown: "no retained contest",
  not_applicable: "not on this ballot",
};

const CANDIDACY_LABELS: Readonly<Record<CandidacyStatus, string>> = {
  filed_for_seat: "filed for this seat",
  filed_for_other_office: "filed for another office",
  not_on_primary_ballot: "not on the primary ballot",
  not_observed: "no filing observed",
  not_applicable: "not applicable",
};

export const outcomeLabel = (outcome: Outcome): string => OUTCOME_LABELS[outcome];
export const evidenceLabel = (grade: EvidenceGrade): string => EVIDENCE_LABELS[grade];
export const contestStatusLabel = (status: ContestStatus): string => CONTEST_STATUS_LABELS[status];
export const candidacyLabel = (status: CandidacyStatus): string => CANDIDACY_LABELS[status];

export const CHAMBER_ORDER: readonly PriorityChamber[] = ["house", "senate", "governor", "state_house", "state_senate"];

let cache: SeatOutcomeLedger | undefined;
export function loadOutcomeLedger(): SeatOutcomeLedger {
  if (!cache) cache = readSeatOutcomeLedger();
  return cache;
}

export function outcomeFor(seatId: string): SeatOutcomeRow | undefined {
  return loadOutcomeLedger().rows.find((row) => row.seatId === seatId);
}

export interface OutcomeFilters {
  readonly chamber?: string;
  readonly route?: string;
  readonly outcome?: string;
  readonly state?: string;
  readonly query?: string;
}

/** Seats on the 2026 ballot that match the filters, in pre-election rank order with unranked seats last. */
export function filterOutcomeRows(rows: readonly SeatOutcomeRow[], filters: OutcomeFilters): SeatOutcomeRow[] {
  const query = (filters.query ?? "").trim().toLocaleLowerCase("en-US");
  return rows
    .filter((row) => row.stage === "up_in_2026"
      && (!filters.chamber || row.chamber === filters.chamber)
      && (!filters.route || row.route === filters.route)
      && (!filters.outcome || row.outcome === filters.outcome)
      && (!filters.state || row.stateCode === filters.state)
      && (!query || `${row.seatLabel} ${row.holderName}`.toLocaleLowerCase("en-US").includes(query)))
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) || left.seatId.localeCompare(right.seatId));
}

export interface CoverageRow {
  readonly chamber: PriorityChamber;
  readonly seats: number;
  readonly scored: number;
  readonly unscored: readonly Readonly<{ reason: Exclude<StateLegislativeScoreStatus, "scored">; count: number }>[];
}

/** Seats and scored seats per chamber, with the unscored reasons the index recorded. */
/** The two outcome artifacts as the lock pins them, for the sources page. */
export function ledgerSources(): readonly Readonly<{ id: string; label: string; sha256: string; byteSize: number }>[] {
  const lock = readSourceLock();
  return [
    { id: PRE_ELECTION_SNAPSHOT_2026.id, label: "Pre-election index, frozen 2026-11-03" },
    { id: SEAT_OUTCOME_LEDGER.id, label: "Seat outcome ledger, rebuilt by each publish" },
  ].map((artifact) => {
    const entry = findSourceLockEntry(lock, artifact.id);
    return { ...artifact, sha256: entry?.sha256 ?? "not pinned", byteSize: entry?.byteSize ?? 0 };
  });
}

export function coverageTable(ledger: SeatOutcomeLedger): CoverageRow[] {
  return CHAMBER_ORDER.map((chamber) => {
    const rows = ledger.rows.filter((row) => row.chamber === chamber);
    const reasons = new Map<Exclude<StateLegislativeScoreStatus, "scored">, number>();
    for (const row of rows) if (row.scoreStatus !== "scored") reasons.set(row.scoreStatus, (reasons.get(row.scoreStatus) ?? 0) + 1);
    return { chamber, seats: rows.length, scored: rows.filter((row) => row.scoreStatus === "scored").length, unscored: [...reasons.entries()].sort((left, right) => right[1] - left[1]).map(([reason, count]) => ({ reason, count })) };
  });
}
