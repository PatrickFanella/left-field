import type { PriorityChamber, PriorityRoute } from "@/lib/house-priority-index";
import { PRIORITY_INDEX_RELEASE, readPriorityIndexRelease } from "@/lib/priority-index-release";
import { FilesystemPriorityIndexRepository } from "@/lib/priority-index-store";

import { GOVERNOR_SCORE_V01, readGovernorScoreV01Projection } from "./governor-score-v01";
import { HOUSE_SCORE_V11 } from "./house-score-v11-active";
import { readPinnedPackage, readSourceLock, type SourceLock } from "./intake/source-lock";
import { readSenateScoreV01Projection, SENATE_SCORE_V01 } from "./senate-score-v01";
import { byteCompare, hash } from "./shared";
import { readStateLegislativeScoreV01Projection, STATE_LEGISLATIVE_SCORE_V01, type StateLegislativeScoreStatus } from "./state-legislative-score-v01";

/**
 * The Priority Index as it stood on election day, frozen once.
 *
 * Every seat of the v1.17 release (published 2026-11-03) with its holder, score,
 * route and rank, including the state-legislative seats the index carried
 * unscored with a reason. The weekly refresh keeps moving the live index as
 * rosters change and winners are seated; this file does not move, so the
 * outcome ledger can compare what the index said before the election with
 * what happened. It is pinned by `rapid:freeze-pre-election` exactly once and
 * is never re-derived by `rapid:publish`; its test reproduces it from the
 * four pinned projections.
 */
export const PRE_ELECTION_SNAPSHOT_2026 = {
  id: "priority-index-pre-election-2026-v1",
  path: "data/metadata/priority-index-pre-election-2026-v1.json",
  url: "urn:dsa-seats:priority-index-pre-election-2026:v1",
  parentIds: [HOUSE_SCORE_V11.id, SENATE_SCORE_V01.id, GOVERNOR_SCORE_V01.id, STATE_LEGISLATIVE_SCORE_V01.id, PRIORITY_INDEX_RELEASE.id],
} as const;

export const PRE_ELECTION_MODEL_VERSION = "v1.17";
const PACKAGE_DOMAIN = "dsa-seats:pre-election-snapshot-2026-package:v1";

export type HolderParty = "Democratic" | "Republican" | "Independent" | "Other";

export interface PreElectionSeatRow {
  readonly chamber: PriorityChamber;
  readonly seatId: string;
  readonly seatLabel: string;
  readonly stateCode: string;
  readonly holderName: string;
  /** Bioguide id for Congress, Open States id for governors and state legislators. */
  readonly holderId: string;
  readonly holderParty: HolderParty;
  readonly scoreStatus: StateLegislativeScoreStatus;
  readonly route: PriorityRoute | null;
  readonly score: number | null;
  /** Cross-chamber rank as the published index listed it; null for unscored seats. */
  readonly rank: number | null;
  readonly chamberRank: number | null;
  readonly nextElectionYear: number | null;
  readonly openSeatSignal: string | null;
  readonly rowSha256: string;
}

export interface PreElectionSnapshot2026 {
  readonly schema: "priority-index-pre-election-2026-v1";
  readonly version: 1;
  readonly modelVersion: string;
  readonly publishedAt: string;
  readonly rows: readonly PreElectionSeatRow[];
  readonly summary: Readonly<{ seats: number; scored: number; byChamber: Readonly<Record<PriorityChamber, Readonly<{ seats: number; scored: number }>>> }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const fail = (code: string): never => { throw new Error(`PRE_ELECTION_${code}`); };

/** The holder's party as the roster names it: a state affiliate counts as its national party; anything else is Independent or Other. */
export const holderPartyOf = (raw: string): HolderParty => {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("democrat")) return "Democratic";
  if (value.startsWith("republican")) return "Republican";
  if (value.startsWith("independent")) return "Independent";
  return "Other";
};

const CHAMBERS: readonly PriorityChamber[] = ["house", "senate", "governor", "state_house", "state_senate"];

export function buildPreElectionSnapshot2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): PreElectionSnapshot2026 {
  const release = readPriorityIndexRelease(root, lock);
  if (release.modelVersion !== PRE_ELECTION_MODEL_VERSION) fail(`MODEL_VERSION:${release.modelVersion}`);
  // The brief layer reads the checkout it runs in; the snapshot is frozen once from this one.
  const briefs = new FilesystemPriorityIndexRepository().getBriefs();
  const byId = new Map(briefs.map((brief) => [brief.seatCycleId, brief]));
  const chamberRanks = new Map<string, number>();
  const counters = new Map<PriorityChamber, number>();
  for (const brief of briefs) {
    const next = (counters.get(brief.chamber) ?? 0) + 1;
    counters.set(brief.chamber, next);
    chamberRanks.set(brief.seatCycleId, next);
  }
  const scoredFields = (seatId: string) => {
    const brief = byId.get(seatId) ?? fail(`BRIEF_MISSING:${seatId}`);
    return { scoreStatus: "scored" as const, route: brief.qualifyingRoute, score: brief.provisionalTargetScore, rank: brief.rank, chamberRank: chamberRanks.get(seatId) ?? null, nextElectionYear: brief.nextElectionYear, openSeatSignal: brief.openSeatSignal };
  };
  const sign = (row: Omit<PreElectionSeatRow, "rowSha256">): PreElectionSeatRow => ({ ...row, rowSha256: hash("dsa-seats:pre-election-seat-row:v1", row) });

  const house = briefs.filter((brief) => brief.chamber === "house").map((brief) => sign({
    chamber: "house", seatId: brief.seatCycleId, seatLabel: brief.districtLabel, stateCode: brief.stateCode, holderName: brief.incumbentName, holderId: brief.bioguideId, holderParty: holderPartyOf(brief.incumbentParty), ...scoredFields(brief.seatCycleId),
  }));
  const senate = readSenateScoreV01Projection(root, lock).rows.map((row) => sign({
    chamber: "senate", seatId: row.seatId, seatLabel: row.seatLabel, stateCode: row.stateCode, holderName: row.officialName, holderId: row.bioguideId, holderParty: holderPartyOf(row.incumbentParty), ...scoredFields(row.seatId),
  }));
  const governor = readGovernorScoreV01Projection(root, lock).rows.map((row) => sign({
    chamber: "governor", seatId: row.seatId, seatLabel: row.seatLabel, stateCode: row.stateCode, holderName: row.governorName, holderId: row.openStatesId, holderParty: holderPartyOf(row.incumbentParty), ...scoredFields(row.seatId),
  }));
  const stateLegislative = readStateLegislativeScoreV01Projection(root, lock).rows.map((row) => sign({
    chamber: row.chamber === "lower" ? "state_house" : "state_senate", seatId: row.seatId, seatLabel: row.seatLabel, stateCode: row.stateCode, holderName: row.holderName, holderId: row.openStatesId, holderParty: holderPartyOf(row.incumbentParty),
    ...(row.status === "scored" ? scoredFields(row.seatId) : { scoreStatus: row.status, route: null, score: null, rank: null, chamberRank: null, nextElectionYear: row.nextElectionYear, openSeatSignal: null }),
  }));
  const rows = [...house, ...senate, ...governor, ...stateLegislative].sort((left, right) => byteCompare(left.chamber, right.chamber) || byteCompare(left.seatId, right.seatId));
  if (rows.filter((row) => row.scoreStatus === "scored").length !== briefs.length) fail(`CLOSURE_INVALID:${rows.length}:${briefs.length}`);
  const byChamber = Object.fromEntries(CHAMBERS.map((chamber) => {
    const own = rows.filter((row) => row.chamber === chamber);
    return [chamber, { seats: own.length, scored: own.filter((row) => row.scoreStatus === "scored").length }];
  })) as Record<PriorityChamber, { seats: number; scored: number }>;
  const unsigned = {
    schema: "priority-index-pre-election-2026-v1" as const, version: 1 as const,
    modelVersion: release.modelVersion, publishedAt: release.publishedAt, rows,
    summary: { seats: rows.length, scored: briefs.length, byChamber },
    rowSetSha256: hash("dsa-seats:pre-election-seat-row-set:v1", rows.map((row) => row.rowSha256)),
  };
  return { ...unsigned, packageSha256: hash(PACKAGE_DOMAIN, unsigned) };
}

export function readPreElectionSnapshot2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): PreElectionSnapshot2026 {
  const { value } = readPinnedPackage<PreElectionSnapshot2026>(lock, PRE_ELECTION_SNAPSHOT_2026.id, PACKAGE_DOMAIN, root);
  if (value.schema !== "priority-index-pre-election-2026-v1" || value.version !== 1 || value.modelVersion !== PRE_ELECTION_MODEL_VERSION || value.rows.length !== value.summary.seats) fail("PINNED_INVALID");
  return value;
}
