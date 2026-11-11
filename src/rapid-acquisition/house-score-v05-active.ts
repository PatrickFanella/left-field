import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { housePriorityBriefsV03 } from "@/lib/house-priority-index";
import { validateCountyHouseResultsProjection } from "./county-house-results";
import { validateHouseScoreV04ActiveProjection } from "./house-score-v04-active";
import { validateHouseScoreV04ShadowProjection } from "./house-score-v04-shadow";
import { byteCompare, exact, hash, houseRoute, sha } from "./shared";

type CountyHouseRow = Readonly<{
  countyFips: string;
  stateCode: string;
  districtRaw: string | null;
  candidateName: string;
  candidateParty: string;
  candidatePartyDetailed: string;
  specialElection: boolean;
  writeIn: boolean;
  votes: number | null;
  suppressedSourceRows: number;
  sourceLockId: string;
  authority: string;
  winnerIdentity: null;
  formulaEligible: false;
}>;

export interface HouseScoreV05ActiveRow {
  readonly seatCycleId: string;
  readonly districtLabel: string;
  readonly incumbentParty: "Democratic" | "Republican";
  readonly qualifyingRoute: "deep_blue" | "aipac_supported_blue" | "republican_fringe_general";
  readonly previousScoreVersion: "v0.4";
  readonly previousScore: number;
  readonly activeScoreVersion: "v0.5";
  readonly activeScore: number;
  readonly localContext: number | null;
  readonly localContextAvailableWeight: number;
  readonly downBallotDemocraticOverperformance: number | null;
  readonly houseDemocraticShare: number | null;
  readonly presidentialDemocraticShare: number | null;
  readonly houseMinusPresidentPercentagePoints: number | null;
  readonly exactGeographyJoin: "at_large_statewide" | "not_yet_eligible";
  readonly evidenceConfidence: "research_fallback_exact_at_large" | "not_available";
  readonly movementFromV04: number;
  readonly sourceLockIds: readonly string[];
  readonly parentV04ActiveRowSha256: string;
  readonly parentV04ShadowRowSha256: string;
  readonly rowSha256: string;
}

export interface HouseScoreV05ActiveProjection {
  readonly schema: "house-score-v05-active-projection-v1";
  readonly version: 1;
  readonly generatedAt: "2026-08-09T10:15:00.000Z";
  readonly methodology: Readonly<{
    status: "active";
    basis: "product_owner_directive_to_use_retained_county_election_context";
    scope: "exact_at_large_geography_only";
    houseShare: "democratic_candidate_votes_divided_by_all_candidate_votes_including_write_ins_excluding_overvotes_and_undervotes";
    overperformance: "house_democratic_share_minus_harris_share_percentage_points";
    transform: "clamp_50_plus_5_times_percentage_point_difference_zero_to_one_hundred";
    localFormula: "0.40_inverse_ballots_cvap_0.30_inverse_registration_cvap_0.20_downballot_overperformance_0.10_demographics";
    missingBehavior: "preserve_v04_score_exactly";
    splitCountyAllocation: false;
    researchFallbackScoreInputs: true;
    winnerInference: false;
  }>;
  readonly parents: readonly Readonly<{ id: string; fileSha256: string; packageSha256: string | null; rowSetSha256: string | null }>[];
  readonly rows: readonly HouseScoreV05ActiveRow[];
  readonly summary: Readonly<{ seats: 430; downBallotActiveSeats: 2; unchangedSeats: 428; geographyExcludedSeats: 1; routeChanges: 0; movementCapBreaches: 0 }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const FILES = {
  active: ["house-score-v04-active-projection-v1", "data/metadata/house-score-v04-active-projection-v1.json", 272_726, "8bd0a866867330a16f4fd2e5e1eea37d7a06f0650671e55831317ceb9941cc80"],
  shadow: ["house-score-v04-shadow-projection-v1", "data/metadata/house-score-v04-shadow-projection-v1.json", 540_469, "9f11120f810c8eebb5f1c13e069113e3cbfa965c5db4930f89ba698f13dbc80b"],
  house: ["rapid-county-house-results-projection-v1", "data/metadata/rapid-county-house-results-projection-v1.json", 7_846_238, "00d16ab390a8d4569ea0ab2fd13e235dd9ec750c46238865dc49e1e1ab7618bb"],
  president: ["downballot-presidential-cd-2024-csv", "data/source/elections/downballot-presidential-cd-2024.csv", 55_833, "938410ae6b42104eb6ee73ff1fcb4de13f39c2aefa607c73b5664eec9ade974e"],
  geography: ["rapid-at-large-cd119-county-universe-v1", "data/metadata/rapid-at-large-cd119-county-universe-v1.json", 6_685, "9c4505a7aeebbfe59e25ca2b90d7e6e4f23628220f343f1b0ab46cf2bb62e54f"],
} as const;
const OUTPUT = { id: "house-score-v05-active-projection-v1", path: "data/metadata/house-score-v05-active-projection-v1.json", url: "urn:dsa-seats:house-score-v05-active-projection:v1:2026-08-09" } as const;
const STATES = ["DE", "WY"] as const;
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

function sourceBytes(root: string): { lock: { entries: readonly Record<string, unknown>[] }; bytes: Map<string, Buffer> } {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const bytes = new Map<string, Buffer>();
  for (const [id, path, size, digest] of Object.values(FILES)) {
    const value = readFileSync(join(root, path));
    const matches = lock.entries.filter((entry) => entry.id === id);
    if (value.length !== size || sha(value) !== digest || matches.length !== 1 || matches[0]!.retainedPath !== path || matches[0]!.retainedStatus !== "retained" || matches[0]!.byteSize !== size || matches[0]!.sha256 !== digest) throw new Error(`HOUSE_V05_SOURCE_INVALID:${id}`);
    bytes.set(id, value);
  }
  return { lock, bytes };
}

function score(brief: ReturnType<typeof housePriorityBriefsV03>[number], local: number): number {
  if (brief.incumbentParty === "Democratic") {
    const alignment = brief.scoreDrivers.find((driver) => driver.key === "incumbent_alignment_gap")?.score;
    const cash = brief.scoreDrivers.find((driver) => driver.key === "cash_vulnerability")?.score;
    if (alignment === undefined || alignment === null) throw new Error(`HOUSE_V05_ALIGNMENT_MISSING:${brief.seatCycleId}`);
    const structural = 0.8 * brief.baselineTargetScore + 0.2 * local;
    return cash === undefined || cash === null ? one((0.65 * structural + 0.2 * alignment) / 0.85) : one(0.65 * structural + 0.2 * alignment + 0.15 * cash);
  }
  const competitiveness = brief.scoreDrivers.find((driver) => driver.key === "general_election_competitiveness")?.score;
  const cash = brief.scoreDrivers.find((driver) => driver.key === "cash_vulnerability")?.score;
  if (competitiveness === undefined || competitiveness === null) throw new Error(`HOUSE_V05_COMPETITIVENESS_MISSING:${brief.seatCycleId}`);
  const parts = [[competitiveness, 0.6], [cash ?? null, 0.2], [local, 0.2]] as const;
  const available = parts.reduce((sum, [value, weight]) => sum + (value === null ? 0 : weight), 0);
  return one(0.7 * parts.reduce((sum, [value, weight]) => sum + (value === null ? 0 : value * weight), 0) / available);
}

export function buildHouseScoreV05ActiveProjection(root = process.cwd()): HouseScoreV05ActiveProjection {
  const { lock, bytes } = sourceBytes(root);
  const active = validateHouseScoreV04ActiveProjection(JSON.parse(bytes.get(FILES.active[0])!.toString("utf8")), root);
  const shadow = validateHouseScoreV04ShadowProjection(JSON.parse(bytes.get(FILES.shadow[0])!.toString("utf8")), root);
  const house = validateCountyHouseResultsProjection(JSON.parse(bytes.get(FILES.house[0])!.toString("utf8")), root) as unknown as { rows: readonly CountyHouseRow[]; packageSha256: string; rowSetSha256: string };
  const geography = JSON.parse(bytes.get(FILES.geography[0])!.toString("utf8")) as { rows: readonly { stateCode: string; countyFips: readonly string[]; exactCountyUniverseMatch: boolean }[]; packageSha256: string; rowSetSha256: string };
  const presidential = csvRows(bytes.get(FILES.president[0])!.toString("utf8"));
  const presidentShares = new Map<string, number>();
  for (const row of presidential) if (STATES.some((state) => row[0] === `${state}-AL`)) presidentShares.set(row[0]!, Number(row[6]!.replace("%", "")));
  if (!exact([...presidentShares], [["DE-AL", 56.63], ["WY-AL", 26.1]])) throw new Error("HOUSE_V05_PRESIDENTIAL_INVALID");
  const geographyByState = new Map(geography.rows.map((row) => [row.stateCode, row]));
  const evidence = new Map<string, { houseShare: number; presidentShare: number; difference: number; component: number; sourceLockIds: readonly string[] }>();
  for (const stateCode of STATES) {
    const geo = geographyByState.get(stateCode);
    if (!geo?.exactCountyUniverseMatch) throw new Error(`HOUSE_V05_GEOGRAPHY_INVALID:${stateCode}`);
    const rows = house.rows.filter((row) => row.stateCode === stateCode && row.districtRaw === "AT-LARGE" && !row.specialElection);
    if (!rows.length || !exact([...new Set(rows.map((row) => row.countyFips))].sort(byteCompare), geo.countyFips) || rows.some((row) => row.votes === null || row.suppressedSourceRows !== 0 || row.authority !== "research_fallback" || row.winnerIdentity !== null || row.formulaEligible !== false)) throw new Error(`HOUSE_V05_COUNTY_CLOSURE_INVALID:${stateCode}`);
    for (const countyFips of geo.countyFips) {
      const county = rows.filter((row) => row.countyFips === countyFips);
      if (county.filter((row) => row.candidateParty === "DEMOCRAT" && !row.writeIn).length !== 1 || county.filter((row) => row.candidateParty === "REPUBLICAN" && !row.writeIn).length !== 1) throw new Error(`HOUSE_V05_PARTY_CLOSURE_INVALID:${stateCode}:${countyFips}`);
      if (county.some((row) => !["", "DEMOCRAT", "REPUBLICAN", "LIBERTARIAN", "OTHER"].includes(row.candidateParty))) throw new Error(`HOUSE_V05_PARTY_INVALID:${stateCode}:${countyFips}`);
    }
    const valid = rows.filter((row) => row.candidateName !== "OVERVOTES" && row.candidateName !== "UNDERVOTES");
    const democraticVotes = valid.filter((row) => row.candidateParty === "DEMOCRAT" && !row.writeIn).reduce((sum, row) => sum + row.votes!, 0);
    const candidateVotes = valid.reduce((sum, row) => sum + row.votes!, 0);
    if (!(democraticVotes > 0 && candidateVotes >= democraticVotes)) throw new Error(`HOUSE_V05_VOTE_CLOSURE_INVALID:${stateCode}`);
    const houseShare = two(100 * democraticVotes / candidateVotes), presidentShare = presidentShares.get(`${stateCode}-AL`)!;
    const difference = two(houseShare - presidentShare), component = one(Math.max(0, Math.min(100, 50 + 5 * difference)));
    evidence.set(stateCode, { houseShare, presidentShare, difference, component, sourceLockIds: [...new Set(rows.map((row) => row.sourceLockId))].sort(byteCompare) });
  }
  const activeById = new Map(active.rows.map((row) => [row.seatCycleId, row])), shadowById = new Map(shadow.rows.map((row) => [row.seatCycleId, row]));
  const rows = housePriorityBriefsV03().map((brief) => {
    const parentActive = activeById.get(brief.seatCycleId), parentShadow = shadowById.get(brief.seatCycleId);
    if (!parentActive || !parentShadow || parentActive.parentShadowRowSha256 !== parentShadow.rowSha256) throw new Error(`HOUSE_V05_PARENT_JOIN_INVALID:${brief.seatCycleId}`);
    const item = evidence.get(brief.stateCode), eligible = item !== undefined && brief.districtLabel === `${brief.stateCode}-AL` && parentActive.exactGeographyJoin === "at_large_statewide" && parentShadow.localContext !== null;
    const localContext = eligible ? one(0.4 * parentShadow.localContextComponents.inverseBallotsCastToCvap! + 0.3 * parentShadow.localContextComponents.inverseActiveRegistrationToCvap! + 0.2 * item.component + 0.1 * parentShadow.localContextComponents.demographicOpportunity!) : parentActive.localContext;
    const activeScore = eligible ? score(brief, localContext!) : parentActive.activeScore;
    const unsigned = {
      seatCycleId: brief.seatCycleId, districtLabel: brief.districtLabel, incumbentParty: brief.incumbentParty, qualifyingRoute: houseRoute(brief.qualifyingRoute),
      previousScoreVersion: "v0.4" as const, previousScore: parentActive.activeScore, activeScoreVersion: "v0.5" as const, activeScore,
      localContext, localContextAvailableWeight: eligible ? 1 : parentActive.localContextAvailableWeight,
      downBallotDemocraticOverperformance: eligible ? item.component : null, houseDemocraticShare: eligible ? item.houseShare : null,
      presidentialDemocraticShare: eligible ? item.presidentShare : null, houseMinusPresidentPercentagePoints: eligible ? item.difference : null,
      exactGeographyJoin: parentActive.exactGeographyJoin, evidenceConfidence: eligible ? "research_fallback_exact_at_large" as const : "not_available" as const,
      movementFromV04: one(activeScore - parentActive.activeScore), sourceLockIds: eligible ? [FILES.house[0], FILES.president[0], FILES.geography[0], ...item.sourceLockIds] : [],
      parentV04ActiveRowSha256: parentActive.rowSha256, parentV04ShadowRowSha256: parentShadow.rowSha256,
    };
    return { ...unsigned, rowSha256: hash("dsa-seats:house-score-v05-active-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.seatCycleId, right.seatCycleId));
  const changed = rows.filter((row) => row.downBallotDemocraticOverperformance !== null), breaches = rows.filter((row) => Math.abs(row.movementFromV04) > 3).length;
  if (rows.length !== 430 || new Set(rows.map((row) => row.seatCycleId)).size !== 430 || changed.map((row) => row.districtLabel).join(",") !== "DE-AL,WY-AL" || rows.some((row) => row.downBallotDemocraticOverperformance === null && (row.activeScore !== row.previousScore || row.movementFromV04 !== 0)) || breaches !== 0) throw new Error("HOUSE_V05_CLOSURE_INVALID");
  const methodology = { status: "active" as const, basis: "product_owner_directive_to_use_retained_county_election_context" as const, scope: "exact_at_large_geography_only" as const, houseShare: "democratic_candidate_votes_divided_by_all_candidate_votes_including_write_ins_excluding_overvotes_and_undervotes" as const, overperformance: "house_democratic_share_minus_harris_share_percentage_points" as const, transform: "clamp_50_plus_5_times_percentage_point_difference_zero_to_one_hundred" as const, localFormula: "0.40_inverse_ballots_cvap_0.30_inverse_registration_cvap_0.20_downballot_overperformance_0.10_demographics" as const, missingBehavior: "preserve_v04_score_exactly" as const, splitCountyAllocation: false as const, researchFallbackScoreInputs: true as const, winnerInference: false as const };
  const parents = [
    { id: FILES.active[0], fileSha256: FILES.active[3], packageSha256: active.packageSha256, rowSetSha256: active.rowSetSha256 },
    { id: FILES.shadow[0], fileSha256: FILES.shadow[3], packageSha256: shadow.packageSha256, rowSetSha256: shadow.rowSetSha256 },
    { id: FILES.house[0], fileSha256: FILES.house[3], packageSha256: house.packageSha256, rowSetSha256: house.rowSetSha256 },
    { id: FILES.president[0], fileSha256: FILES.president[3], packageSha256: null, rowSetSha256: null },
    { id: FILES.geography[0], fileSha256: FILES.geography[3], packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 },
  ];
  const summary = { seats: 430 as const, downBallotActiveSeats: 2 as const, unchangedSeats: 428 as const, geographyExcludedSeats: 1 as const, routeChanges: 0 as const, movementCapBreaches: 0 as const };
  const rowSetSha256 = hash("dsa-seats:house-score-v05-active-row-set:v1", rows);
  const unsigned = { schema: "house-score-v05-active-projection-v1" as const, version: 1 as const, generatedAt: "2026-08-09T10:15:00.000Z" as const, methodology, parents, rows, summary, rowSetSha256 };
  const result = { ...unsigned, packageSha256: hash("dsa-seats:house-score-v05-active-package:v1", unsigned) };
  const output = lock.entries.filter((entry) => entry.id === OUTPUT.id);
  if (output.length === 1) {
    const outputBytes = readFileSync(join(root, OUTPUT.path));
    const expected = { id: OUTPUT.id, url: OUTPUT.url, retainedPath: OUTPUT.path, retainedStatus: "retained", byteSize: outputBytes.length, sha256: sha(outputBytes), kind: "derived_artifact", parentIds: parents.map((row) => row.id) };
    if (!exact(sourceLockContent(output[0]), expected)) throw new Error("HOUSE_V05_OUTPUT_LOCK_INVALID");
  } else if (output.length !== 0) throw new Error("HOUSE_V05_OUTPUT_LOCK_INVALID");
  return result;
}

export function validateHouseScoreV05ActiveProjection(value: unknown, root = process.cwd()): HouseScoreV05ActiveProjection {
  const expected = buildHouseScoreV05ActiveProjection(root);
  if (!exact(value, expected)) throw new Error("HOUSE_V05_ACTIVE_INVALID");
  return value as HouseScoreV05ActiveProjection;
}
