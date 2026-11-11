import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { housePriorityBriefsV03 } from "@/lib/house-priority-index";
import { validateCountyHouseResultsProjection } from "./county-house-results";
import { validateHouseScoreV04ShadowProjection } from "./house-score-v04-shadow";
import { validateHouseScoreV05ActiveProjection } from "./house-score-v05-active";
import { validateSouthDakotaCountyFipsNormalization } from "./south-dakota-county-fips-normalization";
import { byteCompare, exact, hash, houseRoute, sha } from "./shared";

type CountyHouseRow = Readonly<{ countyFips: string; stateCode: string; districtRaw: string | null; candidateName: string; candidateParty: string; specialElection: boolean; writeIn: boolean; votes: number | null; suppressedSourceRows: number; sourceLockId: string; authority: string; winnerIdentity: null; formulaEligible: false }>;

export interface HouseScoreV06ActiveRow {
  readonly seatCycleId: string;
  readonly districtLabel: string;
  readonly incumbentParty: "Democratic" | "Republican";
  readonly qualifyingRoute: "deep_blue" | "aipac_supported_blue" | "republican_fringe_general";
  readonly previousScoreVersion: "v0.5";
  readonly previousScore: number;
  readonly activeScoreVersion: "v0.6";
  readonly activeScore: number;
  readonly localContext: number | null;
  readonly localContextAvailableWeight: number;
  readonly downBallotDemocraticOverperformance: number | null;
  readonly houseDemocraticShare: number | null;
  readonly presidentialDemocraticShare: number | null;
  readonly houseMinusPresidentPercentagePoints: number | null;
  readonly exactGeographyJoin: "at_large_statewide" | "not_yet_eligible";
  readonly evidenceConfidence: "research_fallback_exact_at_large" | "research_fallback_exact_at_large_official_fips_normalization" | "not_available";
  readonly officialCountyFipsNormalizationApplied: boolean;
  readonly movementFromV05: number;
  readonly sourceLockIds: readonly string[];
  readonly parentV05ActiveRowSha256: string;
  readonly parentV04ShadowRowSha256: string;
  readonly rowSha256: string;
}

export interface HouseScoreV06ActiveProjection {
  readonly schema: "house-score-v06-active-projection-v1";
  readonly version: 1;
  readonly generatedAt: "2026-08-09T10:45:00.000Z";
  readonly methodology: Readonly<{
    status: "active";
    basis: "product_owner_directive_to_use_retained_county_election_context";
    scope: "exact_at_large_geography_with_official_identifier_normalization";
    houseShare: "democratic_candidate_votes_divided_by_all_candidate_votes_including_write_ins_excluding_overvotes_and_undervotes";
    overperformance: "house_democratic_share_minus_harris_share_percentage_points";
    transform: "clamp_50_plus_5_times_percentage_point_difference_zero_to_one_hundred";
    localFormula: "0.40_inverse_ballots_cvap_0.30_inverse_registration_cvap_0.20_downballot_overperformance_0.10_demographics";
    missingBehavior: "preserve_v05_score_exactly";
    countyIdentifierNormalization: "only_official_census_documented_46113_to_46102_change";
    splitCountyAllocation: false;
    researchFallbackScoreInputs: true;
    winnerInference: false;
  }>;
  readonly parents: readonly Readonly<{ id: string; fileSha256: string; packageSha256: string | null; rowSetSha256: string | null }>[];
  readonly rows: readonly HouseScoreV06ActiveRow[];
  readonly summary: Readonly<{ seats: 430; downBallotActiveSeats: 3; newlyActivatedSeats: 1; unchangedSeats: 429; normalizedFipsSeats: 1; routeChanges: 0; movementCapBreaches: 0 }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const FILES = {
  active: ["house-score-v05-active-projection-v1", "data/metadata/house-score-v05-active-projection-v1.json", 431_813, "ffca4e473569876bc54044d778e7d804308b485f00034f5c86e56c00a597df74"],
  shadow: ["house-score-v04-shadow-projection-v1", "data/metadata/house-score-v04-shadow-projection-v1.json", 540_469, "9f11120f810c8eebb5f1c13e069113e3cbfa965c5db4930f89ba698f13dbc80b"],
  house: ["rapid-county-house-results-projection-v1", "data/metadata/rapid-county-house-results-projection-v1.json", 7_846_238, "00d16ab390a8d4569ea0ab2fd13e235dd9ec750c46238865dc49e1e1ab7618bb"],
  normalization: ["rapid-south-dakota-county-fips-normalization-v1", "data/metadata/rapid-south-dakota-county-fips-normalization-v1.json", 2_949, "aaf06b4ee41499e4d78eab4154035f04a31f310544e541b8dab77fbb0f969543"],
  president: ["downballot-presidential-cd-2024-csv", "data/source/elections/downballot-presidential-cd-2024.csv", 55_833, "938410ae6b42104eb6ee73ff1fcb4de13f39c2aefa607c73b5664eec9ade974e"],
  geography: ["rapid-at-large-cd119-county-universe-v1", "data/metadata/rapid-at-large-cd119-county-universe-v1.json", 6_685, "9c4505a7aeebbfe59e25ca2b90d7e6e4f23628220f343f1b0ab46cf2bb62e54f"],
} as const;
const OUTPUT = { id: "house-score-v06-active-projection-v1", path: "data/metadata/house-score-v06-active-projection-v1.json", url: "urn:dsa-seats:house-score-v06-active-projection:v1:2026-08-09" } as const;
const one = (value: number) => Math.round(value * 10) / 10;
const two = (value: number) => Math.round(value * 100) / 100;

function csvRows(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (char === '"') { if (quoted && input[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if (char === "\n" && !quoted) { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function sourceBytes(root: string) {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, bytes = new Map<string, Buffer>();
  for (const [id, path, size, digest] of Object.values(FILES)) {
    const value = readFileSync(join(root, path)), matches = lock.entries.filter((entry) => entry.id === id);
    if (value.length !== size || sha(value) !== digest || matches.length !== 1 || matches[0]!.retainedPath !== path || matches[0]!.retainedStatus !== "retained" || matches[0]!.byteSize !== size || matches[0]!.sha256 !== digest) throw new Error(`HOUSE_V06_SOURCE_INVALID:${id}`);
    bytes.set(id, value);
  }
  return { lock, bytes };
}

function score(brief: ReturnType<typeof housePriorityBriefsV03>[number], local: number): number {
  if (brief.incumbentParty === "Democratic") {
    const alignment = brief.scoreDrivers.find((driver) => driver.key === "incumbent_alignment_gap")?.score, cash = brief.scoreDrivers.find((driver) => driver.key === "cash_vulnerability")?.score;
    if (alignment === undefined || alignment === null) throw new Error(`HOUSE_V06_ALIGNMENT_MISSING:${brief.seatCycleId}`);
    const structural = 0.8 * brief.baselineTargetScore + 0.2 * local;
    return cash === undefined || cash === null ? one((0.65 * structural + 0.2 * alignment) / 0.85) : one(0.65 * structural + 0.2 * alignment + 0.15 * cash);
  }
  const competitiveness = brief.scoreDrivers.find((driver) => driver.key === "general_election_competitiveness")?.score, cash = brief.scoreDrivers.find((driver) => driver.key === "cash_vulnerability")?.score;
  if (competitiveness === undefined || competitiveness === null) throw new Error(`HOUSE_V06_COMPETITIVENESS_MISSING:${brief.seatCycleId}`);
  const parts = [[competitiveness, 0.6], [cash ?? null, 0.2], [local, 0.2]] as const, available = parts.reduce((sum, [value, weight]) => sum + (value === null ? 0 : weight), 0);
  return one(0.7 * parts.reduce((sum, [value, weight]) => sum + (value === null ? 0 : value * weight), 0) / available);
}

export function buildHouseScoreV06ActiveProjection(root = process.cwd()): HouseScoreV06ActiveProjection {
  const { lock, bytes } = sourceBytes(root);
  const active = validateHouseScoreV05ActiveProjection(JSON.parse(bytes.get(FILES.active[0])!.toString("utf8")), root);
  const shadow = validateHouseScoreV04ShadowProjection(JSON.parse(bytes.get(FILES.shadow[0])!.toString("utf8")), root);
  const house = validateCountyHouseResultsProjection(JSON.parse(bytes.get(FILES.house[0])!.toString("utf8")), root) as unknown as { rows: readonly CountyHouseRow[]; packageSha256: string; rowSetSha256: string };
  const normalization = validateSouthDakotaCountyFipsNormalization(JSON.parse(bytes.get(FILES.normalization[0])!.toString("utf8")), root);
  const geography = JSON.parse(bytes.get(FILES.geography[0])!.toString("utf8")) as { rows: readonly { stateCode: string; countyFips: readonly string[]; exactCountyUniverseMatch: boolean }[]; packageSha256: string; rowSetSha256: string };
  const president = csvRows(bytes.get(FILES.president[0])!.toString("utf8")).find((row) => row[0] === "SD-AL");
  if (!president || Number(president[6]!.replace("%", "")) !== 34.24) throw new Error("HOUSE_V06_PRESIDENTIAL_INVALID");
  const geo = geography.rows.find((row) => row.stateCode === "SD");
  if (!geo?.exactCountyUniverseMatch || geo.countyFips.length !== 66 || !geo.countyFips.includes("46102") || geo.countyFips.includes("46113")) throw new Error("HOUSE_V06_GEOGRAPHY_INVALID");
  const retained = house.rows.filter((row) => row.stateCode === "SD" && row.districtRaw === "AT-LARGE" && !row.specialElection), normalized: CountyHouseRow[] = normalization.rows.map((row) => ({ ...row, countyFips: row.currentCountyFips, suppressedSourceRows: 0, sourceLockId: FILES.normalization[0] }));
  const sourceRows = [...retained, ...normalized];
  if (!exact([...new Set(sourceRows.map((row) => row.countyFips))].sort(byteCompare), geo.countyFips) || sourceRows.some((row) => row.votes === null || row.suppressedSourceRows !== undefined && row.suppressedSourceRows !== 0 || row.winnerIdentity !== null || row.formulaEligible !== false)) throw new Error("HOUSE_V06_COUNTY_CLOSURE_INVALID");
  for (const countyFips of geo.countyFips) {
    const county = sourceRows.filter((row) => row.countyFips === countyFips);
    if (county.length !== 2 || county.filter((row) => row.candidateParty === "DEMOCRAT" && !row.writeIn).length !== 1 || county.filter((row) => row.candidateParty === "REPUBLICAN" && !row.writeIn).length !== 1) throw new Error(`HOUSE_V06_PARTY_CLOSURE_INVALID:${countyFips}`);
  }
  const democraticVotes = sourceRows.filter((row) => row.candidateParty === "DEMOCRAT").reduce((sum, row) => sum + row.votes!, 0), candidateVotes = sourceRows.reduce((sum, row) => sum + row.votes!, 0);
  if (democraticVotes !== 117_818 || candidateVotes !== 421_448) throw new Error("HOUSE_V06_VOTE_CLOSURE_INVALID");
  const houseShare = two(100 * democraticVotes / candidateVotes), presidentialShare = 34.24, difference = two(houseShare - presidentialShare), component = one(Math.max(0, Math.min(100, 50 + 5 * difference)));
  if (!exact([houseShare, difference, component], [27.96, -6.28, 18.6])) throw new Error("HOUSE_V06_COMPONENT_INVALID");
  const activeById = new Map(active.rows.map((row) => [row.seatCycleId, row])), shadowById = new Map(shadow.rows.map((row) => [row.seatCycleId, row]));
  const rows = housePriorityBriefsV03().map((brief) => {
    const parentActive = activeById.get(brief.seatCycleId), parentShadow = shadowById.get(brief.seatCycleId);
    if (!parentActive || !parentShadow || parentActive.parentV04ShadowRowSha256 !== parentShadow.rowSha256) throw new Error(`HOUSE_V06_PARENT_JOIN_INVALID:${brief.seatCycleId}`);
    const newlyEligible = brief.districtLabel === "SD-AL" && parentActive.downBallotDemocraticOverperformance === null && parentActive.exactGeographyJoin === "at_large_statewide" && parentShadow.localContext !== null;
    const localContext = newlyEligible ? one(0.4 * parentShadow.localContextComponents.inverseBallotsCastToCvap! + 0.3 * parentShadow.localContextComponents.inverseActiveRegistrationToCvap! + 0.2 * component + 0.1 * parentShadow.localContextComponents.demographicOpportunity!) : parentActive.localContext;
    const activeScore = newlyEligible ? score(brief, localContext!) : parentActive.activeScore;
    const unsigned = { seatCycleId: brief.seatCycleId, districtLabel: brief.districtLabel, incumbentParty: brief.incumbentParty, qualifyingRoute: houseRoute(brief.qualifyingRoute), previousScoreVersion: "v0.5" as const, previousScore: parentActive.activeScore, activeScoreVersion: "v0.6" as const, activeScore, localContext, localContextAvailableWeight: newlyEligible ? 1 : parentActive.localContextAvailableWeight, downBallotDemocraticOverperformance: newlyEligible ? component : parentActive.downBallotDemocraticOverperformance, houseDemocraticShare: newlyEligible ? houseShare : parentActive.houseDemocraticShare, presidentialDemocraticShare: newlyEligible ? presidentialShare : parentActive.presidentialDemocraticShare, houseMinusPresidentPercentagePoints: newlyEligible ? difference : parentActive.houseMinusPresidentPercentagePoints, exactGeographyJoin: parentActive.exactGeographyJoin, evidenceConfidence: newlyEligible ? "research_fallback_exact_at_large_official_fips_normalization" as const : parentActive.evidenceConfidence, officialCountyFipsNormalizationApplied: newlyEligible, movementFromV05: one(activeScore - parentActive.activeScore), sourceLockIds: newlyEligible ? [FILES.house[0], FILES.normalization[0], FILES.president[0], FILES.geography[0], "medsl-2024-house-state-sd", "census-county-changes-2010s-20260809"] : parentActive.sourceLockIds, parentV05ActiveRowSha256: parentActive.rowSha256, parentV04ShadowRowSha256: parentShadow.rowSha256 };
    return { ...unsigned, rowSha256: hash("dsa-seats:house-score-v06-active-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.seatCycleId, right.seatCycleId));
  const activeRows = rows.filter((row) => row.downBallotDemocraticOverperformance !== null), changed = rows.filter((row) => row.movementFromV05 !== 0), breaches = changed.filter((row) => Math.abs(row.movementFromV05) > 3).length;
  if (rows.length !== 430 || new Set(rows.map((row) => row.seatCycleId)).size !== 430 || activeRows.map((row) => row.districtLabel).join(",") !== "DE-AL,SD-AL,WY-AL" || changed.map((row) => row.districtLabel).join(",") !== "SD-AL" || breaches !== 0) throw new Error("HOUSE_V06_CLOSURE_INVALID");
  const methodology = { status: "active" as const, basis: "product_owner_directive_to_use_retained_county_election_context" as const, scope: "exact_at_large_geography_with_official_identifier_normalization" as const, houseShare: "democratic_candidate_votes_divided_by_all_candidate_votes_including_write_ins_excluding_overvotes_and_undervotes" as const, overperformance: "house_democratic_share_minus_harris_share_percentage_points" as const, transform: "clamp_50_plus_5_times_percentage_point_difference_zero_to_one_hundred" as const, localFormula: "0.40_inverse_ballots_cvap_0.30_inverse_registration_cvap_0.20_downballot_overperformance_0.10_demographics" as const, missingBehavior: "preserve_v05_score_exactly" as const, countyIdentifierNormalization: "only_official_census_documented_46113_to_46102_change" as const, splitCountyAllocation: false as const, researchFallbackScoreInputs: true as const, winnerInference: false as const };
  const parents = [
    { id: FILES.active[0], fileSha256: FILES.active[3], packageSha256: active.packageSha256, rowSetSha256: active.rowSetSha256 },
    { id: FILES.shadow[0], fileSha256: FILES.shadow[3], packageSha256: shadow.packageSha256, rowSetSha256: shadow.rowSetSha256 },
    { id: FILES.house[0], fileSha256: FILES.house[3], packageSha256: house.packageSha256, rowSetSha256: house.rowSetSha256 },
    { id: FILES.normalization[0], fileSha256: FILES.normalization[3], packageSha256: normalization.packageSha256, rowSetSha256: normalization.rowSetSha256 },
    { id: FILES.president[0], fileSha256: FILES.president[3], packageSha256: null, rowSetSha256: null },
    { id: FILES.geography[0], fileSha256: FILES.geography[3], packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 },
  ];
  const summary = { seats: 430 as const, downBallotActiveSeats: 3 as const, newlyActivatedSeats: 1 as const, unchangedSeats: 429 as const, normalizedFipsSeats: 1 as const, routeChanges: 0 as const, movementCapBreaches: 0 as const };
  const rowSetSha256 = hash("dsa-seats:house-score-v06-active-row-set:v1", rows), unsigned = { schema: "house-score-v06-active-projection-v1" as const, version: 1 as const, generatedAt: "2026-08-09T10:45:00.000Z" as const, methodology, parents, rows, summary, rowSetSha256 };
  const result = { ...unsigned, packageSha256: hash("dsa-seats:house-score-v06-active-package:v1", unsigned) };
  const output = lock.entries.filter((entry) => entry.id === OUTPUT.id);
  if (output.length === 1) {
    const outputBytes = readFileSync(join(root, OUTPUT.path)), expected = { id: OUTPUT.id, url: OUTPUT.url, retainedPath: OUTPUT.path, retainedStatus: "retained", byteSize: outputBytes.length, sha256: sha(outputBytes), kind: "derived_artifact", parentIds: parents.map((row) => row.id) };
    if (!exact(sourceLockContent(output[0]), expected)) throw new Error("HOUSE_V06_OUTPUT_LOCK_INVALID");
  } else if (output.length !== 0) throw new Error("HOUSE_V06_OUTPUT_LOCK_INVALID");
  return result;
}

export function validateHouseScoreV06ActiveProjection(value: unknown, root = process.cwd()): HouseScoreV06ActiveProjection {
  const expected = buildHouseScoreV06ActiveProjection(root);
  if (!exact(value, expected)) throw new Error("HOUSE_V06_ACTIVE_INVALID");
  return value as HouseScoreV06ActiveProjection;
}
