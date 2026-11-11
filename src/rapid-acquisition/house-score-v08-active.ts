import { sourceLockContent } from "./intake/source-lock-content";
import { houseRoute } from "./shared";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { housePriorityBriefsV03 } from "@/lib/house-priority-index";
import { validateHousePrimaryIncumbentEvidence } from "./house-primary-incumbent-evidence";
import { validateHouseScoreV07ActiveProjection } from "./house-score-v07-active";

export interface HouseScoreV08ActiveRow {
  readonly seatCycleId: string;
  readonly districtLabel: string;
  readonly incumbentParty: "Democratic" | "Republican";
  readonly qualifyingRoute: "deep_blue" | "aipac_supported_blue" | "republican_fringe_general";
  readonly previousScoreVersion: "v0.7";
  readonly previousScore: number;
  readonly activeScoreVersion: "v0.8";
  readonly activeScore: number;
  readonly previousPrimaryFeasibility: number | null;
  readonly activePrimaryFeasibility: number | null;
  readonly directPrimaryEvidence: boolean;
  readonly primaryEvidenceId: string | null;
  readonly primaryIdentityStatus: string | null;
  readonly primaryGeographyStatus: string | null;
  readonly incumbentPrimaryVotes: number | null;
  readonly primaryContestVotes: number | null;
  readonly incumbentPrimaryVoteShare: number | null;
  readonly localContext: number | null;
  readonly localContextAvailableWeight: number;
  readonly downBallotDemocraticOverperformance: number | null;
  readonly houseDemocraticShare: number | null;
  readonly presidentialDemocraticShare: number | null;
  readonly houseMinusPresidentPercentagePoints: number | null;
  readonly structuralBaseline: number | null;
  readonly movementFromV07: number;
  readonly parentV07ActiveRowSha256: string;
  readonly sourceLockIds: readonly string[];
  readonly rowSha256: string;
}

export interface HouseScoreV08ActiveProjection {
  readonly schema: "house-score-v08-active-projection-v1";
  readonly version: 1;
  readonly generatedAt: "2026-08-09T14:45:00.000Z";
  readonly methodology: Readonly<{
    status: "active";
    primaryMetric: "one_hundred_minus_incumbent_vote_share_in_retained_2024_democratic_primary_contest";
    deepBlueStructuralFormula: "0.70_blue_baseline_plus_0.30_direct_primary_feasibility";
    aipacSupportedStructuralFormula: "0.60_aipac_support_plus_0.25_blue_baseline_plus_0.15_direct_primary_feasibility";
    localContextFormula: "0.80_recomputed_structural_baseline_plus_0.20_existing_exact_local_context_when_present";
    finalFormula: "0.65_structural_plus_0.20_alignment_plus_0.15_cash_vulnerability_with_available_weight_renormalization";
    unresolvedIdentityBehavior: "preserve_v07_score_and_inferred_primary_component";
    sourceWinnerInference: false;
  }>;
  readonly parents: readonly Readonly<{ id: string; fileSha256: string; packageSha256: string; rowSetSha256: string }>[];
  readonly rows: readonly HouseScoreV08ActiveRow[];
  readonly summary: Readonly<{ seats: 430; directPrimaryActiveSeats: 21; unresolvedPrimaryRows: 1; changedSeats: number; unchangedSeats: number; routeChanges: 0; movementCapBreaches: 0 }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const FILES = {
  active: ["house-score-v07-active-projection-v1", "data/metadata/house-score-v07-active-projection-v1.json", 431_952, "db9552a2b5e8b0be19f8f6ba0678f4f6a21f6b2534fc85876bc2dfb679641f93", "92c62343504d61c526422ebf2f2dad284bd813ff5f626ea2a22916ca133b745a", "e2aaf539ff8a3f976f08e09bdc0459a57d6a31d6b9984b3118e57f3d29607780"],
  evidence: ["rapid-house-primary-2024-incumbent-evidence-v1", "data/metadata/rapid-house-primary-2024-incumbent-evidence-v1.json", 24_686, "9a264ecc89b3c07581d523a7c6fc5af02f150bb90cac08cf0cbcaa8727f3c8d5", "39a7c3d8b27a0a1631c72a1ea66b6b64bb77a5e24a5c515d1ae29992c1e66017", "223db58efed35118e45580c7bb1d1247f065a822a5ee64b993c88e1d8f2439ca"],
} as const;
const OUTPUT = { id: "house-score-v08-active-projection-v1", path: "data/metadata/house-score-v08-active-projection-v1.json", url: "urn:dsa-seats:house-score-v08-active-projection:v1:2026-08-09" } as const;
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const one = (value: number) => Math.round(value * 10) / 10;

function driver(brief: ReturnType<typeof housePriorityBriefsV03>[number], key: string): number | null {
  const value = brief.scoreDrivers.find((item) => item.key === key)?.score;
  if (value === undefined) throw new Error(`HOUSE_V08_DRIVER_MISSING:${brief.districtLabel}:${key}`);
  return value;
}

function sourceBytes(root: string) {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, bytes = new Map<string, Buffer>();
  for (const [id, path, size, digest] of Object.values(FILES)) {
    const value = readFileSync(join(root, path)), entries = lock.entries.filter((entry) => entry.id === id);
    if (value.length !== size || sha(value) !== digest || entries.length !== 1 || entries[0]!.retainedPath !== path || entries[0]!.retainedStatus !== "retained" || entries[0]!.byteSize !== size || entries[0]!.sha256 !== digest) throw new Error(`HOUSE_V08_SOURCE_INVALID:${id}`);
    bytes.set(id, value);
  }
  return { lock, bytes };
}

export function buildHouseScoreV08ActiveProjection(root = process.cwd()): HouseScoreV08ActiveProjection {
  const { lock, bytes } = sourceBytes(root);
  const active = validateHouseScoreV07ActiveProjection(JSON.parse(bytes.get(FILES.active[0])!.toString("utf8")), root);
  const evidence = validateHousePrimaryIncumbentEvidence(JSON.parse(bytes.get(FILES.evidence[0])!.toString("utf8")), root);
  const activeById = new Map(active.rows.map((row) => [row.seatCycleId, row])), evidenceBySeat = new Map(evidence.rows.map((row) => [row.targetSeatId, row]));
  const rows = housePriorityBriefsV03().map((brief) => {
    const parent = activeById.get(brief.seatCycleId), primary = evidenceBySeat.get(brief.seatCycleId), previousPrimaryFeasibility = driver(brief, "primary_feasibility");
    if (!parent || parent.districtLabel !== brief.districtLabel || parent.activeScoreVersion !== "v0.7") throw new Error(`HOUSE_V08_PARENT_JOIN_INVALID:${brief.seatCycleId}`);
    const directPrimaryEvidence = primary?.formulaEligible === true;
    let structuralBaseline: number | null = null, activeScore = parent.activeScore;
    if (directPrimaryEvidence) {
      if (brief.incumbentParty !== "Democratic" || primary?.primaryVulnerability === null || primary?.winnerInference !== null || primary?.historicalGeographyStatus !== "exact_cd119_session_and_district_key") throw new Error(`HOUSE_V08_PRIMARY_INVALID:${brief.seatCycleId}`);
      const blue = driver(brief, "blue_baseline"), aipac = driver(brief, "aipac_support"), alignment = driver(brief, "incumbent_alignment_gap"), cash = driver(brief, "cash_vulnerability");
      if (blue === null || alignment === null) throw new Error(`HOUSE_V08_STRUCTURAL_INPUT_INVALID:${brief.seatCycleId}`);
      const recomputed = brief.qualifyingRoute === "deep_blue" ? 0.7 * blue + 0.3 * primary.primaryVulnerability : brief.qualifyingRoute === "aipac_supported_blue" && aipac !== null ? 0.6 * aipac + 0.25 * blue + 0.15 * primary.primaryVulnerability : null;
      if (recomputed === null) throw new Error(`HOUSE_V08_ROUTE_INVALID:${brief.seatCycleId}`);
      structuralBaseline = parent.localContext === null ? one(recomputed) : one(0.8 * recomputed + 0.2 * parent.localContext);
      activeScore = cash === null ? one((0.65 * structuralBaseline + 0.2 * alignment) / 0.85) : one(0.65 * structuralBaseline + 0.2 * alignment + 0.15 * cash);
    }
    const unsigned = {
      seatCycleId: brief.seatCycleId, districtLabel: brief.districtLabel, incumbentParty: brief.incumbentParty, qualifyingRoute: houseRoute(brief.qualifyingRoute),
      previousScoreVersion: "v0.7" as const, previousScore: parent.activeScore, activeScoreVersion: "v0.8" as const, activeScore,
      previousPrimaryFeasibility, activePrimaryFeasibility: directPrimaryEvidence ? primary!.primaryVulnerability : previousPrimaryFeasibility,
      directPrimaryEvidence, primaryEvidenceId: directPrimaryEvidence ? primary!.evidenceId : null,
      primaryIdentityStatus: primary?.identityStatus ?? null, primaryGeographyStatus: primary?.historicalGeographyStatus ?? null,
      incumbentPrimaryVotes: directPrimaryEvidence ? primary!.incumbentVotes : null, primaryContestVotes: directPrimaryEvidence ? primary!.contestVotes : null,
      incumbentPrimaryVoteShare: directPrimaryEvidence ? primary!.incumbentVoteShare : null,
      localContext: parent.localContext, localContextAvailableWeight: parent.localContextAvailableWeight,
      downBallotDemocraticOverperformance: parent.downBallotDemocraticOverperformance, houseDemocraticShare: parent.houseDemocraticShare,
      presidentialDemocraticShare: parent.presidentialDemocraticShare, houseMinusPresidentPercentagePoints: parent.houseMinusPresidentPercentagePoints,
      structuralBaseline,
      movementFromV07: one(activeScore - parent.activeScore), parentV07ActiveRowSha256: parent.rowSha256,
      sourceLockIds: directPrimaryEvidence ? [FILES.evidence[0]] : parent.sourceLockIds,
    };
    return { ...unsigned, rowSha256: hash("dsa-seats:house-score-v08-active-row:v1", unsigned) };
  }).sort((left, right) => compare(left.seatCycleId, right.seatCycleId));
  const direct = rows.filter((row) => row.directPrimaryEvidence), unresolved = evidence.rows.filter((row) => !row.formulaEligible), changed = rows.filter((row) => row.movementFromV07 !== 0);
  const movementCapBreaches = changed.filter((row) => Math.abs(row.movementFromV07) > 13).length;
  if (rows.length !== 430 || new Set(rows.map((row) => row.seatCycleId)).size !== 430 || direct.length !== 21 || unresolved.map((row) => row.districtLabel).join(",") !== "RI-01" || movementCapBreaches !== 0) throw new Error("HOUSE_V08_CLOSURE_INVALID");
  const methodology = { status: "active" as const, primaryMetric: "one_hundred_minus_incumbent_vote_share_in_retained_2024_democratic_primary_contest" as const, deepBlueStructuralFormula: "0.70_blue_baseline_plus_0.30_direct_primary_feasibility" as const, aipacSupportedStructuralFormula: "0.60_aipac_support_plus_0.25_blue_baseline_plus_0.15_direct_primary_feasibility" as const, localContextFormula: "0.80_recomputed_structural_baseline_plus_0.20_existing_exact_local_context_when_present" as const, finalFormula: "0.65_structural_plus_0.20_alignment_plus_0.15_cash_vulnerability_with_available_weight_renormalization" as const, unresolvedIdentityBehavior: "preserve_v07_score_and_inferred_primary_component" as const, sourceWinnerInference: false as const };
  const parents = Object.values(FILES).map(([id, , , fileSha256, packageSha256, rowSetSha256]) => ({ id, fileSha256, packageSha256, rowSetSha256 }));
  const summary = { seats: 430 as const, directPrimaryActiveSeats: 21 as const, unresolvedPrimaryRows: 1 as const, changedSeats: changed.length, unchangedSeats: rows.length - changed.length, routeChanges: 0 as const, movementCapBreaches: 0 as const };
  const rowSetSha256 = hash("dsa-seats:house-score-v08-active-row-set:v1", rows), unsigned = { schema: "house-score-v08-active-projection-v1" as const, version: 1 as const, generatedAt: "2026-08-09T14:45:00.000Z" as const, methodology, parents, rows, summary, rowSetSha256 };
  const result = { ...unsigned, packageSha256: hash("dsa-seats:house-score-v08-active-package:v1", unsigned) };
  const output = lock.entries.filter((entry) => entry.id === OUTPUT.id);
  if (output.length === 1) { const outputBytes = readFileSync(join(root, OUTPUT.path)), expected = { id: OUTPUT.id, url: OUTPUT.url, retainedPath: OUTPUT.path, retainedStatus: "retained", byteSize: outputBytes.length, sha256: sha(outputBytes), kind: "derived_artifact", parentIds: parents.map((row) => row.id) }; if (canonical(sourceLockContent(output[0])) !== canonical(expected)) throw new Error("HOUSE_V08_OUTPUT_LOCK_INVALID"); }
  else if (output.length !== 0) throw new Error("HOUSE_V08_OUTPUT_LOCK_INVALID");
  return result;
}

export function validateHouseScoreV08ActiveProjection(value: unknown, root = process.cwd()): HouseScoreV08ActiveProjection {
  const expected = buildHouseScoreV08ActiveProjection(root);
  if (canonical(value) !== canonical(expected)) throw new Error("HOUSE_V08_ACTIVE_INVALID");
  return value as HouseScoreV08ActiveProjection;
}
