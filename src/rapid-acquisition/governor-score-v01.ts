import { scoreSeat, type SeatRoute, type SeatScoreDriver } from "@/lib/seat-score";

import { readPinnedPackage, readSourceLock, type SourceLock } from "./intake/source-lock";
import { readStateExecutives } from "./openstates-executive";
import { readRefreshInputs, REFRESH_INPUTS } from "./refresh-inputs";
import { byteCompare, hash } from "./shared";
import { readStatewidePresidential2024Pinned, STATEWIDE_PRESIDENTIAL_2024 } from "./statewide-presidential-2024";
import { STATE_LEGISLATIVE_PRIMARY_CONTEXT, type StateLegislativePrimaryContext } from "./state-legislative-primary-context";
import { SENATE_STATE_CODES } from "./us-states";

/**
 * Governor score v0.1: the fifty sitting governors on the two-route model.
 *
 * Inputs: Open States executive rosters (holder, party, term end), the
 * statewide 2024 presidential result, and state Democratic primary
 * contestation. No governor finance, alignment, or primary evidence is
 * retained, so those weights are omitted and the rest renormalized; the
 * Democratic route reduces to the blue baseline and the Republican route to
 * competitiveness plus state contestation. Rows say so.
 */
export interface GovernorScoreV01Row {
  readonly seatId: string;
  readonly seatLabel: string;
  readonly stateCode: string;
  readonly governorName: string;
  readonly openStatesId: string;
  readonly incumbentParty: string;
  readonly caucus: "Democratic" | "Republican";
  readonly termStart: string | null;
  readonly termEnd: string;
  readonly nextElectionYear: number;
  readonly presidentialDemocraticMargin2024: number;
  readonly stateContestation: number | null;
  readonly stateContestationCycleYear: number | null;
  readonly route: SeatRoute;
  readonly score: number;
  readonly blueBaseline: number | null;
  readonly competitiveness: number | null;
  readonly availableWeight: number;
  readonly coverageMultiplier: number;
  readonly drivers: readonly SeatScoreDriver[];
  readonly formula: string;
  readonly sourceId: string;
  readonly rowSha256: string;
}

export interface GovernorScoreV01Projection {
  readonly schema: "governor-score-v01-projection-v1";
  readonly version: 1;
  readonly methodology: Readonly<{ status: "active"; roster: "openstates_executive_yaml_cc0"; governorSelection: "governor_role_current_at_snapshot_date"; nextElection: "year_before_term_end_when_term_ends_in_january_else_term_end_year"; omitted: "finance_alignment_primary_feasibility_local_context"; winnerInference: false }>;
  readonly parents: readonly Readonly<{ id: string; packageSha256: string | null }>[];
  readonly sourceIds: readonly string[];
  readonly rows: readonly GovernorScoreV01Row[];
  readonly summary: Readonly<{ seats: 50; democraticCaucus: number; republicanCaucus: number; upIn2026: number; stateContestationValues: number; democraticMaxScore: number; republicanMaxScore: number }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

export const GOVERNOR_SCORE_V01 = {
  id: "governor-score-v01-projection-v1",
  path: "data/metadata/governor-score-v01-projection-v1.json",
  url: "urn:dsa-seats:governor-score-v01-projection:v1",
  staticParentIds: [REFRESH_INPUTS.id, STATEWIDE_PRESIDENTIAL_2024.id, STATE_LEGISLATIVE_PRIMARY_CONTEXT.id],
  parentIds: (root: string, lock: SourceLock): string[] => [...GOVERNOR_SCORE_V01.staticParentIds, ...(readRefreshInputs(root, lock).stateExecutiveIds ?? fail("EXECUTIVE_POINTER_MISSING"))],
} as const;

const fail = (code: string): never => { throw new Error(`GOVERNOR_V01_${code}`); };

export function buildGovernorScoreV01Projection(root = process.cwd(), lock: SourceLock = readSourceLock(root)): GovernorScoreV01Projection {
  const inputs = readRefreshInputs(root, lock);
  const executiveIds = inputs.stateExecutiveIds ?? fail("EXECUTIVE_POINTER_MISSING");
  const people = readStateExecutives(lock, executiveIds, root);
  const presidential = readStatewidePresidential2024Pinned(root, lock);
  const margins = new Map(presidential.rows.map((row) => [row.stateCode, row.democraticMarginPercentagePoints]));
  const context = readPinnedPackage<StateLegislativePrimaryContext>(lock, STATE_LEGISLATIVE_PRIMARY_CONTEXT.id, "dsa-seats:rapid-state-legislative-primary-context-package:v1", root).value;
  const contestation = new Map(context.stateContext.map((row) => [row.state, row]));
  const snapshot = inputs.snapshotDate;

  const rows = SENATE_STATE_CODES.map((state): GovernorScoreV01Row => {
    const jurisdiction = `ocd-jurisdiction/country:us/state:${state.toLowerCase()}/government`;
    const covering = people.flatMap((person) => person.roles.filter((role) => role.type === "governor" && role.jurisdiction === jurisdiction && (role.endDate === null || role.endDate >= snapshot) && (role.startDate === null || role.startDate <= snapshot)).map((role) => ({ person, role })));
    // On inauguration day the outgoing term ends the day the incoming one starts; the incoming governor holds the seat.
    const holders = covering.length > 1 && covering.some(({ role }) => role.endDate !== snapshot) ? covering.filter(({ role }) => role.endDate !== snapshot) : covering;
    if (holders.length !== 1) fail(`GOVERNOR_NOT_UNIQUE:${state}:${holders.length}`);
    const { person, role } = holders[0]!;
    if (role.endDate === null) fail(`TERM_END_MISSING:${state}`);
    const party = person.parties[person.parties.length - 1] ?? fail(`PARTY_MISSING:${state}`);
    // State party affiliates (Democratic-Farmer-Labor, Democratic-NPL) caucus with their national party.
    const caucus: "Democratic" | "Republican" = party.startsWith("Democratic") ? "Democratic" : party.startsWith("Republican") ? "Republican" : fail(`PARTY_UNMAPPED:${state}:${party}`);
    const end = new Date(role.endDate!);
    const nextElectionYear = end.getUTCMonth() === 0 ? end.getUTCFullYear() - 1 : end.getUTCFullYear();
    const margin = margins.get(state) ?? fail(`MARGIN_MISSING:${state}`);
    const stateRow = caucus === "Republican" ? contestation.get(state) ?? null : null;
    const scored = scoreSeat({ caucus, presidentialDemocraticMargin2024: margin, primaryFeasibility: null, alignmentGap: null, cashOnHand: null, localContext: null, stateContestation: stateRow?.contestationScore ?? null });
    const unsigned = {
      seatId: `seat_governor_${state.toLowerCase()}_current`, seatLabel: `${state}-Gov`, stateCode: state, governorName: person.name, openStatesId: person.id, incumbentParty: party, caucus,
      termStart: role.startDate, termEnd: role.endDate!, nextElectionYear, presidentialDemocraticMargin2024: margin,
      stateContestation: stateRow?.contestationScore ?? null, stateContestationCycleYear: stateRow?.cycleYear ?? null,
      route: scored.route, score: scored.score, blueBaseline: scored.blueBaseline, competitiveness: scored.competitiveness, availableWeight: scored.availableWeight, coverageMultiplier: scored.coverageMultiplier, drivers: scored.drivers, formula: scored.formula, sourceId: person.sourceId,
    };
    return { ...unsigned, rowSha256: hash("dsa-seats:governor-score-v01-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.seatId, right.seatId));
  if (rows.length !== 50) fail(`CLOSURE_INVALID:${rows.length}`);
  const democrats = rows.filter((row) => row.caucus === "Democratic"), republicans = rows.filter((row) => row.caucus === "Republican");
  const summary = { seats: 50 as const, democraticCaucus: democrats.length, republicanCaucus: republicans.length, upIn2026: rows.filter((row) => row.nextElectionYear === 2026).length, stateContestationValues: rows.filter((row) => row.stateContestation !== null).length, democraticMaxScore: Math.max(...democrats.map((row) => row.score)), republicanMaxScore: Math.max(...republicans.map((row) => row.score)) };
  const unsigned = {
    schema: "governor-score-v01-projection-v1" as const, version: 1 as const,
    methodology: { status: "active" as const, roster: "openstates_executive_yaml_cc0" as const, governorSelection: "governor_role_current_at_snapshot_date" as const, nextElection: "year_before_term_end_when_term_ends_in_january_else_term_end_year" as const, omitted: "finance_alignment_primary_feasibility_local_context" as const, winnerInference: false as const },
    parents: [{ id: STATEWIDE_PRESIDENTIAL_2024.id, packageSha256: presidential.packageSha256 }, { id: STATE_LEGISLATIVE_PRIMARY_CONTEXT.id, packageSha256: context.packageSha256 }, { id: REFRESH_INPUTS.id, packageSha256: null }],
    sourceIds: GOVERNOR_SCORE_V01.parentIds(root, lock), rows, summary, rowSetSha256: hash("dsa-seats:governor-score-v01-row-set:v1", rows),
  };
  return { ...unsigned, packageSha256: hash("dsa-seats:governor-score-v01-package:v1", unsigned) };
}

export function readGovernorScoreV01Projection(root = process.cwd(), lock: SourceLock = readSourceLock(root)): GovernorScoreV01Projection {
  const { value } = readPinnedPackage<GovernorScoreV01Projection>(lock, GOVERNOR_SCORE_V01.id, "dsa-seats:governor-score-v01-package:v1", root);
  if (value.schema !== "governor-score-v01-projection-v1" || value.summary.seats !== 50 || value.rows.length !== 50 || value.methodology.winnerInference !== false) fail("PROJECTION_INVALID");
  return value;
}
