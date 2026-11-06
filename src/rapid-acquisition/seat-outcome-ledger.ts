import type { PriorityChamber, PriorityRoute } from "@/lib/house-priority-index";

import { GOVERNOR_SCORE_V01 } from "./governor-score-v01";
import type { HolderName } from "./holder-name-match";
import { readPinnedPackage, readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { PRE_ELECTION_SNAPSHOT_2026, readPreElectionSnapshot2026, type PreElectionSeatRow, type PreElectionSnapshot2026 } from "./pre-election-snapshot-2026";
import { CONGRESS_LEGISLATORS_BASELINE_ID, readRefreshInputs } from "./refresh-inputs";
import {
  buildPrimaryEvidenceIndex, CERTIFIED_COUNT_STATUSES, HOUSE_INCUMBENT_CANDIDACY_ID, HOUSE_PRIMARY_2026_ARTIFACT_IDS, houseLabelEntries, primaryEvidenceForSeat, readHouseCandidacyEvidence, readHousePrimaryEvidence2026,
  readReviewedHousePrimaryEvidence2026, readStateLegislativePrimaryEvidence2026, readSuccessors, REVIEWED_HOUSE_PRIMARY_2026_IDS, STATE_LEGISLATIVE_PRIMARY_CONTEXT_ID, stateDistrictEntries, stateLegislativePrimaryCatalogIds2026,
  stateLegislativeGeneralEntries, statePrimaryEntries, type Legislator,
} from "./seat-outcome-evidence";
import { OUTCOMES, RESOLUTION_ORDER, resolveOutcome, type Outcome, type Resolution } from "./seat-outcome-resolver";
import { byteCompare, hash } from "./shared";
import { readStateLegislativeGeneralResults, STATE_LEGISLATIVE_GENERAL_RESULTS } from "./state-legislative-general-results";
import { readStateLegislativeRoster, STATE_LEGISLATIVE_ROSTER } from "./state-legislative-roster";
import { readStatePrimaryResults2026, STATE_PRIMARY_RESULTS_2026 } from "./state-primary-results-2026";

/**
 * The seat outcome ledger: every seat the pre-election index carried, joined
 * to the 2026 evidence retained at the refresh snapshot and resolved to an
 * outcome with its grade. Rebuilt by every `rapid:publish`; the frozen
 * snapshot it joins to never changes, so the comparison block always reads
 * the same pre-election scores against the latest evidence.
 */
const congressRosterId = (root: string, lock: SourceLock): string => readRefreshInputs(root, lock).congressLegislatorsId ?? CONGRESS_LEGISLATORS_BASELINE_ID;

export const SEAT_OUTCOME_LEDGER = {
  id: "seat-outcome-ledger-v1",
  path: "data/metadata/seat-outcome-ledger-v1.json",
  url: "urn:dsa-seats:seat-outcome-ledger:v1",
  parentIds: (root: string, lock: SourceLock): readonly string[] => [
    PRE_ELECTION_SNAPSHOT_2026.id, HOUSE_INCUMBENT_CANDIDACY_ID, ...HOUSE_PRIMARY_2026_ARTIFACT_IDS, ...REVIEWED_HOUSE_PRIMARY_2026_IDS, STATE_PRIMARY_RESULTS_2026.id,
    STATE_LEGISLATIVE_PRIMARY_CONTEXT_ID, ...stateLegislativePrimaryCatalogIds2026(root, lock),
    STATE_LEGISLATIVE_GENERAL_RESULTS.id, STATE_LEGISLATIVE_ROSTER.id, GOVERNOR_SCORE_V01.id, CONGRESS_LEGISLATORS_BASELINE_ID, congressRosterId(root, lock),
  ],
} as const;

const PACKAGE_DOMAIN = "dsa-seats:seat-outcome-ledger-package:v1";
export type ScoreBand = "70+" | "50-69.9" | "<50";
export const SCORE_BANDS: readonly ScoreBand[] = ["70+", "50-69.9", "<50"];
export const scoreBandOf = (score: number): ScoreBand => score >= 70 ? "70+" : score >= 50 ? "50-69.9" : "<50";
const CHAMBERS: readonly PriorityChamber[] = ["house", "senate", "governor", "state_house", "state_senate"];
const ROUTES: readonly PriorityRoute[] = ["deep_blue", "aipac_supported_blue", "republican_fringe_general", "democratic_incumbent_primary"];

export type OutcomeCounts = Readonly<Record<Outcome, number>>;

/**
 * Where the holder's 2026 primary stands, for seats on the 2026 ballot. A won primary settles no outcome, so the
 * outcome comparison counts it as unknown; this record keeps it, which gives each band a settled denominator.
 */
export type PrimaryStage = "won" | "lost" | "pending" | "not_on_ballot" | "other_office" | "unknown";
export const PRIMARY_STAGES: readonly PrimaryStage[] = ["unknown", "won", "lost", "pending", "not_on_ballot", "other_office"];
export type PrimaryStageCounts = Readonly<Record<PrimaryStage, number>>;

export interface SeatOutcomeRow extends Omit<PreElectionSeatRow, "rowSha256">, Resolution {
  readonly observedAt: string;
  readonly rowSha256: string;
}

export interface SeatOutcomeLedger {
  readonly schema: "seat-outcome-ledger-v1";
  readonly version: 1;
  readonly snapshotId: string;
  readonly observedAt: string;
  readonly methodology: Readonly<{ winnerInference: false; resolutionOrder: readonly string[]; certifiedCountStatuses: readonly string[]; holderMatch: string; successorPairing: string }>;
  readonly rows: readonly SeatOutcomeRow[];
  readonly summary: Readonly<{ seats: number; upIn2026: number; byOutcome: OutcomeCounts; byChamber: Readonly<Record<PriorityChamber, OutcomeCounts>> }>;
  readonly comparison: Readonly<{
    bands: readonly ScoreBand[];
    byChamberRoute: readonly Readonly<{ chamber: PriorityChamber; route: PriorityRoute; band: ScoreBand; counts: OutcomeCounts }>[];
    byRankQuartile: readonly Readonly<{ quartile: 1 | 2 | 3 | 4; counts: OutcomeCounts }>[];
  }>;
  readonly primaryComparison: Readonly<{
    stages: readonly PrimaryStage[];
    byChamberRoute: readonly Readonly<{ chamber: PriorityChamber; route: PriorityRoute; band: ScoreBand; counts: PrimaryStageCounts }>[];
  }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const fail = (code: string): never => { throw new Error(`SEAT_OUTCOME_LEDGER_${code}`); };
const countOutcomes = (rows: readonly SeatOutcomeRow[]): OutcomeCounts => Object.fromEntries(OUTCOMES.map((outcome) => [outcome, rows.filter((row) => row.outcome === outcome).length])) as Record<Outcome, number>;

export function primaryStageOf(row: Pick<SeatOutcomeRow, "seatId" | "stage" | "candidacy" | "primary">): PrimaryStage {
  if (row.stage !== "up_in_2026") return fail(`PRIMARY_STAGE_NOT_UP:${row.seatId}`);
  if (row.candidacy === "filed_for_other_office") return "other_office";
  if (row.candidacy === "not_on_primary_ballot") return "not_on_ballot";
  const status = row.primary.status;
  return status === "not_applicable" ? fail(`PRIMARY_STAGE_UNEXPECTED:${row.seatId}`) : status;
}
const countPrimaryStages = (rows: readonly SeatOutcomeRow[]): PrimaryStageCounts => {
  const counts = Object.fromEntries(PRIMARY_STAGES.map((stage) => [stage, 0])) as Record<PrimaryStage, number>;
  for (const row of rows) counts[primaryStageOf(row)] += 1;
  return counts;
};
const splitName = (name: string): HolderName => { const tokens = name.trim().split(/\s+/); return { familyName: tokens.at(-1) ?? "", givenName: tokens.length > 1 ? tokens[0]! : "" }; };

/** Family and given names for every frozen holder, from the rosters that name them; a holder no roster names falls back to splitting the display name. */
export function holderNames(root: string, lock: SourceLock, snapshot: PreElectionSnapshot2026): ReadonlyMap<string, HolderName> {
  const congress = new Map<string, HolderName>();
  for (const id of [congressRosterId(root, lock), CONGRESS_LEGISLATORS_BASELINE_ID]) {
    for (const person of JSON.parse(readRetainedSource(lock, id, root).bytes.toString("utf8")) as (Legislator & { name?: { first?: string; last?: string; nickname?: string } })[]) {
      const bioguide = person.id?.bioguide;
      if (bioguide && !congress.has(bioguide) && person.name?.last) congress.set(bioguide, { familyName: person.name.last, givenName: person.name.first ?? "", ...(person.name.nickname ? { nickname: person.name.nickname } : {}) });
    }
  }
  const legislators = new Map(readStateLegislativeRoster(root, lock).rows.map((row) => [row.openStatesId, { familyName: row.familyName, givenName: row.givenName }]));
  return new Map(snapshot.rows.map((row) => [row.seatId, (row.chamber === "house" || row.chamber === "senate" ? congress.get(row.holderId) : legislators.get(row.holderId)) ?? splitName(row.holderName)]));
}

export function buildSeatOutcomeLedger(root = process.cwd(), lock: SourceLock = readSourceLock(root)): SeatOutcomeLedger {
  const snapshot = readPreElectionSnapshot2026(root, lock);
  const observedAt = readRefreshInputs(root, lock).snapshotDate;
  const candidacy = readHouseCandidacyEvidence(root, lock);
  // The statewide primary layer speaks for every office it covers in a state; the earlier per-office files fill
  // in only where it has no contest for that office yet.
  const statewide = statePrimaryEntries(readStatePrimaryResults2026(root, lock));
  const covered = new Set(statewide.map((entry) => `${entry.stateCode}|${entry.office}`));
  const earlier = [
    ...houseLabelEntries(readHousePrimaryEvidence2026(root, lock)), ...houseLabelEntries(readReviewedHousePrimaryEvidence2026(root, lock)), ...stateDistrictEntries(readStateLegislativePrimaryEvidence2026(root, lock)),
  ].filter((entry) => !covered.has(`${entry.stateCode}|${entry.office}`));
  const primaries = buildPrimaryEvidenceIndex([...statewide, ...earlier]);
  // November generals, state-legislative only until House, Senate and governor canvasses have adapters. The same
  // index and seat lookup serve: a general is an all-party contest, so every holder's party counts it.
  const generals = buildPrimaryEvidenceIndex(stateLegislativeGeneralEntries(readStateLegislativeGeneralResults(root, lock)));
  const successors = readSuccessors(root, lock, snapshot);
  const names = holderNames(root, lock, snapshot);
  const rows = snapshot.rows.map((frozen): SeatOutcomeRow => {
    const holder = names.get(frozen.seatId) ?? fail(`HOLDER_NAME_MISSING:${frozen.seatId}`);
    const resolution = resolveOutcome({
      row: frozen, holder, candidacy: frozen.chamber === "house" ? candidacy.get(frozen.seatId) ?? null : null,
      primaries: frozen.nextElectionYear === 2026 ? primaryEvidenceForSeat(primaries, frozen, holder) : [],
      generals: frozen.nextElectionYear === 2026 && frozen.chamber.startsWith("state_") ? primaryEvidenceForSeat(generals, frozen, holder) : [], successor: successors.get(frozen.seatId) ?? null,
    });
    // The frozen row's own hash is not carried; the ledger row signs the joined record.
    const { rowSha256, ...seat } = frozen;
    void rowSha256;
    const unsigned = { ...seat, ...resolution, observedAt };
    return { ...unsigned, rowSha256: hash("dsa-seats:seat-outcome-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.chamber, right.chamber) || byteCompare(left.seatId, right.seatId));

  const scored = rows.filter((row) => row.score !== null);
  const byChamberRoute = CHAMBERS.flatMap((chamber) => ROUTES.flatMap((route) => {
    const own = scored.filter((row) => row.chamber === chamber && row.route === route);
    return own.length === 0 ? [] : SCORE_BANDS.map((band) => ({ chamber, route, band, counts: countOutcomes(own.filter((row) => scoreBandOf(row.score!) === band)) }));
  }));
  const upScored = scored.filter((row) => row.stage === "up_in_2026");
  const primaryByChamberRoute = CHAMBERS.flatMap((chamber) => ROUTES.flatMap((route) => {
    const own = upScored.filter((row) => row.chamber === chamber && row.route === route);
    return own.length === 0 ? [] : SCORE_BANDS.map((band) => ({ chamber, route, band, counts: countPrimaryStages(own.filter((row) => scoreBandOf(row.score!) === band)) }));
  }));
  const quartileSize = scored.length / 4;
  const byRankQuartile = ([1, 2, 3, 4] as const).map((quartile) => ({ quartile, counts: countOutcomes(scored.filter((row) => Math.min(4, Math.ceil((row.rank ?? 0) / quartileSize)) === quartile)) }));
  const unsigned = {
    schema: "seat-outcome-ledger-v1" as const, version: 1 as const, snapshotId: PRE_ELECTION_SNAPSHOT_2026.id, observedAt,
    methodology: {
      winnerInference: false as const, resolutionOrder: [...RESOLUTION_ORDER], certifiedCountStatuses: [...CERTIFIED_COUNT_STATUSES],
      holderMatch: "family_name_tokens_plus_given_name_first_token_or_any_token", successorPairing: "departed_and_arriving_holders_paired_in_id_order_within_district",
    },
    rows,
    summary: { seats: rows.length, upIn2026: rows.filter((row) => row.stage === "up_in_2026").length, byOutcome: countOutcomes(rows), byChamber: Object.fromEntries(CHAMBERS.map((chamber) => [chamber, countOutcomes(rows.filter((row) => row.chamber === chamber))])) as Record<PriorityChamber, OutcomeCounts> },
    comparison: { bands: [...SCORE_BANDS], byChamberRoute, byRankQuartile },
    primaryComparison: { stages: [...PRIMARY_STAGES], byChamberRoute: primaryByChamberRoute },
    rowSetSha256: hash("dsa-seats:seat-outcome-row-set:v1", rows.map((row) => row.rowSha256)),
  };
  return { ...unsigned, packageSha256: hash(PACKAGE_DOMAIN, unsigned) };
}

export function readSeatOutcomeLedger(root = process.cwd(), lock: SourceLock = readSourceLock(root)): SeatOutcomeLedger {
  const { value } = readPinnedPackage<SeatOutcomeLedger>(lock, SEAT_OUTCOME_LEDGER.id, PACKAGE_DOMAIN, root);
  if (value.schema !== "seat-outcome-ledger-v1" || value.version !== 1 || value.methodology.winnerInference !== false || value.rows.length !== value.summary.seats) fail("PINNED_INVALID");
  return value;
}
