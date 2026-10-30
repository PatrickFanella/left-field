import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { housePriorityBriefsV03 } from "@/lib/house-priority-index";
import { validateAtLargeCd119CountyUniverse } from "./at-large-cd119-county-universe";
import { validateCountyCvapProjection } from "./county-cvap";
import { validateCountyDemographicsProjection } from "./county-demographics";
import { validateCountyElectionContextProjection } from "./county-election-context";
import { validateCountyHouseResultsProjection } from "./county-house-results";
import { validateHouseScoreV06ActiveProjection } from "./house-score-v06-active";
import { byteCompare, exact, hash, houseRoute, sha } from "./shared";

type ActivationContext = Readonly<{
  inverseBallotsCastToCvap: number;
  inverseActiveRegistrationToCvap: null;
  downBallotDemocraticOverperformance: number;
  demographicOpportunity: number;
}>;

export interface HouseScoreV07ActiveRow {
  readonly seatCycleId: string;
  readonly districtLabel: string;
  readonly incumbentParty: "Democratic" | "Republican";
  readonly qualifyingRoute: "deep_blue" | "aipac_supported_blue" | "republican_fringe_general";
  readonly previousScoreVersion: "v0.6";
  readonly previousScore: number;
  readonly activeScoreVersion: "v0.7";
  readonly activeScore: number;
  readonly localContext: number | null;
  readonly localContextAvailableWeight: number;
  readonly downBallotDemocraticOverperformance: number | null;
  readonly houseDemocraticShare: number | null;
  readonly presidentialDemocraticShare: number | null;
  readonly houseMinusPresidentPercentagePoints: number | null;
  readonly exactGeographyJoin: "at_large_statewide" | "not_yet_eligible";
  readonly evidenceConfidence: "research_fallback_exact_at_large" | "research_fallback_exact_at_large_official_fips_normalization" | "research_fallback_exact_at_large_partial_election_administration" | "not_available";
  readonly officialCountyFipsNormalizationApplied: boolean;
  readonly activationContextComponents: ActivationContext | null;
  readonly movementFromV06: number;
  readonly sourceLockIds: readonly string[];
  readonly parentV06ActiveRowSha256: string;
  readonly rowSha256: string;
}

export interface HouseScoreV07ActiveProjection {
  readonly schema: "house-score-v07-active-projection-v1";
  readonly version: 1;
  readonly generatedAt: "2026-08-09T11:15:00.000Z";
  readonly methodology: Readonly<{
    status: "active";
    basis: "product_owner_directive_to_use_retained_county_election_context";
    scope: "exact_at_large_geography_with_partial_component_renormalization";
    houseShare: "democratic_candidate_votes_divided_by_all_candidate_votes_including_write_ins_excluding_explicit_administrative_totals";
    overperformance: "house_democratic_share_minus_harris_share_percentage_points";
    transform: "clamp_50_plus_5_times_percentage_point_difference_zero_to_one_hundred";
    localFormula: "available_weights_renormalized_from_0.40_inverse_ballots_cvap_0.30_inverse_registration_cvap_0.20_downballot_overperformance_0.10_demographics";
    minimumAvailableWeight: 0.6;
    directElectionAdministrationMeasureRequired: true;
    missingBehavior: "preserve_v06_score_exactly";
    splitCountyAllocation: false;
    researchFallbackScoreInputs: true;
    winnerInference: false;
  }>;
  readonly parents: readonly Readonly<{ id: string; fileSha256: string; packageSha256: string | null; rowSetSha256: string | null }> [];
  readonly rows: readonly HouseScoreV07ActiveRow[];
  readonly summary: Readonly<{ seats: 430; downBallotActiveSeats: 4; newlyActivatedSeats: 1; unchangedSeats: 429; normalizedFipsSeats: 1; partialComponentSeats: 1; routeChanges: 0; movementCapBreaches: 0 }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const FILES = {
  active: ["house-score-v06-active-projection-v1", "data/metadata/house-score-v06-active-projection-v1.json", 456_292, "70a67d1bc6d6e85343868ce25afd5efb53148061cee82c9ca890a6479e0a7a02"],
  demographics: ["rapid-county-demographics-projection-v1", "data/metadata/rapid-county-demographics-projection-v1.json", 2_441_846, "ebbeb1127151a78985e97a7971d580edd637f746b63b6845353c63407989c8fc"],
  election: ["rapid-county-election-context-projection-v1", "data/metadata/rapid-county-election-context-projection-v1.json", 3_252_284, "84e768271bbc09d57f2f08f7d9d6d29150083919dd6e8e2414a117fa003e0bf9"],
  cvap: ["rapid-county-cvap-projection-v1", "data/metadata/rapid-county-cvap-projection-v1.json", 1_601_784, "7245c27c31bdd588a613ccf3d897a8c3b4545a6fe57fb81ac1f3191b4f5e3583"],
  house: ["rapid-county-house-results-projection-v1", "data/metadata/rapid-county-house-results-projection-v1.json", 7_846_238, "00d16ab390a8d4569ea0ab2fd13e235dd9ec750c46238865dc49e1e1ab7618bb"],
  president: ["downballot-presidential-cd-2024-csv", "data/source/elections/downballot-presidential-cd-2024.csv", 55_833, "938410ae6b42104eb6ee73ff1fcb4de13f39c2aefa607c73b5664eec9ade974e"],
  geography: ["rapid-at-large-cd119-county-universe-v1", "data/metadata/rapid-at-large-cd119-county-universe-v1.json", 6_685, "9c4505a7aeebbfe59e25ca2b90d7e6e4f23628220f343f1b0ab46cf2bb62e54f"],
} as const;
const OUTPUT = { id: "house-score-v07-active-projection-v1", path: "data/metadata/house-score-v07-active-projection-v1.json", url: "urn:dsa-seats:house-score-v07-active-projection:v1:2026-08-09" } as const;
const one = (value: number) => Math.round(value * 10) / 10;
const two = (value: number) => Math.round(value * 100) / 100;

function midranks(values: readonly number[], inverse = false): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const output = Array<number>(values.length);
  for (let index = 0; index < sorted.length;) {
    let end = index + 1;
    while (end < sorted.length && sorted[end]!.value === sorted[index]!.value) end++;
    const rank = (index + end - 1) / 2, score = sorted.length === 1 ? 50 : 100 * rank / (sorted.length - 1);
    for (let cursor = index; cursor < end; cursor++) output[sorted[cursor]!.index] = inverse ? 100 - score : score;
    index = end;
  }
  return output;
}
const weighted = (values: readonly number[], weights: readonly number[]) => values.reduce((sum, value, index) => sum + value * weights[index]!, 0) / weights.reduce((sum, value) => sum + value, 0);

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
    if (value.length !== size || sha(value) !== digest || matches.length !== 1 || matches[0]!.retainedPath !== path || matches[0]!.retainedStatus !== "retained" || matches[0]!.byteSize !== size || matches[0]!.sha256 !== digest) throw new Error(`HOUSE_V07_SOURCE_INVALID:${id}`);
    bytes.set(id, value);
  }
  return { lock, bytes };
}

function score(brief: ReturnType<typeof housePriorityBriefsV03>[number], local: number): number {
  const competitiveness = brief.scoreDrivers.find((driver) => driver.key === "general_election_competitiveness")?.score, cash = brief.scoreDrivers.find((driver) => driver.key === "cash_vulnerability")?.score;
  if (brief.incumbentParty !== "Republican" || competitiveness === undefined || competitiveness === null) throw new Error("HOUSE_V07_ROUTE_INVALID");
  const parts = [[competitiveness, 0.6], [cash ?? null, 0.2], [local, 0.2]] as const, available = parts.reduce((sum, [value, weight]) => sum + (value === null ? 0 : weight), 0);
  return one(0.7 * parts.reduce((sum, [value, weight]) => sum + (value === null ? 0 : value * weight), 0) / available);
}

export function buildHouseScoreV07ActiveProjection(root = process.cwd()): HouseScoreV07ActiveProjection {
  const { lock, bytes } = sourceBytes(root);
  const active = validateHouseScoreV06ActiveProjection(JSON.parse(bytes.get(FILES.active[0])!.toString("utf8")), root);
  const demographics = validateCountyDemographicsProjection(JSON.parse(bytes.get(FILES.demographics[0])!.toString("utf8")), root);
  const election = validateCountyElectionContextProjection(JSON.parse(bytes.get(FILES.election[0])!.toString("utf8")), root);
  const cvap = validateCountyCvapProjection(JSON.parse(bytes.get(FILES.cvap[0])!.toString("utf8")), root);
  const house = validateCountyHouseResultsProjection(JSON.parse(bytes.get(FILES.house[0])!.toString("utf8")), root);
  const geography = validateAtLargeCd119CountyUniverse(JSON.parse(bytes.get(FILES.geography[0])!.toString("utf8")), root);
  const geo = geography.rows.find((row) => row.stateCode === "ND");
  if (!geo?.exactCountyUniverseMatch || geo.countyFips.length !== 53) throw new Error("HOUSE_V07_GEOGRAPHY_INVALID");

  const houseRows = house.rows.filter((row) => row.stateCode === "ND" && row.districtRaw === "STATEWIDE" && row.specialElection === false);
  if (!exact([...new Set(houseRows.map((row) => row.countyFips as string))].sort(byteCompare), geo.countyFips) || houseRows.some((row) => row.votes === null || row.suppressedSourceRows !== 0 || row.winnerIdentity !== null || row.formulaEligible !== false)) throw new Error("HOUSE_V07_HOUSE_CLOSURE_INVALID");
  for (const countyFips of geo.countyFips) {
    const county = houseRows.filter((row) => row.countyFips === countyFips);
    if (county.filter((row) => row.candidateParty === "DEMOCRAT" && row.writeIn === false).length !== 1 || county.filter((row) => row.candidateParty === "REPUBLICAN" && row.writeIn === false).length !== 1 || county.some((row) => !["", "DEMOCRAT", "REPUBLICAN"].includes(row.candidateParty as string))) throw new Error(`HOUSE_V07_PARTY_CLOSURE_INVALID:${countyFips}`);
  }
  const democraticVotes = houseRows.filter((row) => row.candidateParty === "DEMOCRAT" && row.writeIn === false).reduce((sum, row) => sum + (row.votes as number), 0), candidateVotes = houseRows.reduce((sum, row) => sum + (row.votes as number), 0);
  if (democraticVotes !== 109_231 || candidateVotes !== 359_787) throw new Error("HOUSE_V07_VOTE_CLOSURE_INVALID");
  const presidential = csvRows(bytes.get(FILES.president[0])!.toString("utf8")).find((row) => row[0] === "ND-AL"), presidentialShare = Number(presidential?.[6]?.replace("%", ""));
  if (presidentialShare !== 30.77) throw new Error("HOUSE_V07_PRESIDENTIAL_INVALID");
  const houseShare = two(100 * democraticVotes / candidateVotes), difference = two(houseShare - presidentialShare), component = one(Math.max(0, Math.min(100, 50 + 5 * difference)));
  if (!exact([houseShare, difference, component], [30.36, -0.41, 48])) throw new Error("HOUSE_V07_COMPONENT_INVALID");

  const counties = demographics.rows.filter((row) => row.stateCode === "ND").sort((left, right) => byteCompare(left.countyFips, right.countyFips));
  if (!exact(counties.map((row) => row.countyFips), geo.countyFips) || counties.some((row) => row.renterShare === null || row.age18To34Share === null || row.medianHouseholdIncome === null)) throw new Error("HOUSE_V07_DEMOGRAPHICS_INVALID");
  const weights = counties.map((row) => row.population), demographicInputs = [counties.map((row) => row.renterShare!), counties.map((row) => row.age18To34Share!), counties.map((row) => row.medianHouseholdIncome!), counties.map((row) => row.populationDensityPerSquareMile)];
  const demographicOpportunityRaw = weighted(counties.map((_, index) => 0.35 * midranks(demographicInputs[0]!)[index]! + 0.25 * midranks(demographicInputs[1]!)[index]! + 0.25 * midranks(demographicInputs[2]!, true)[index]! + 0.15 * midranks(demographicInputs[3]!)[index]!), weights);
  const electionByCounty = new Map(election.rows.filter((row) => row.cycleYear === 2024).map((row) => [row.countyFips, row])), cvapByCounty = new Map(cvap.rows.map((row) => [row.countyFips, row]));
  const ballotRatios = counties.map((county) => {
    const context = electionByCounty.get(county.countyFips), denominator = cvapByCounty.get(county.countyFips)?.citizenVotingAgePopulation;
    if (context?.registeredVoters !== null || context.ballotsCast === null || denominator === undefined || denominator <= 0) throw new Error(`HOUSE_V07_ELECTION_BOUNDARY_INVALID:${county.countyFips}`);
    return context.ballotsCast / denominator;
  });
  const inverseBallotsRaw = weighted(midranks(ballotRatios, true), weights), availableWeight = 0.7, localContext = one((0.4 * inverseBallotsRaw + 0.2 * component + 0.1 * demographicOpportunityRaw) / availableWeight);
  const activationContextComponents = { inverseBallotsCastToCvap: two(inverseBallotsRaw), inverseActiveRegistrationToCvap: null, downBallotDemocraticOverperformance: component, demographicOpportunity: two(demographicOpportunityRaw) } as const;
  if (localContext !== 63.3 || !exact(activationContextComponents, { inverseBallotsCastToCvap: 69.08, inverseActiveRegistrationToCvap: null, downBallotDemocraticOverperformance: 48, demographicOpportunity: 70.61 })) throw new Error("HOUSE_V07_LOCAL_CONTEXT_INVALID");

  const activeById = new Map(active.rows.map((row) => [row.seatCycleId, row]));
  const rows = housePriorityBriefsV03().map((brief) => {
    const parent = activeById.get(brief.seatCycleId);
    if (!parent || parent.districtLabel !== brief.districtLabel) throw new Error(`HOUSE_V07_PARENT_JOIN_INVALID:${brief.seatCycleId}`);
    const newlyEligible = brief.districtLabel === "ND-AL" && parent.downBallotDemocraticOverperformance === null && parent.exactGeographyJoin === "at_large_statewide";
    const activeScore = newlyEligible ? score(brief, localContext) : parent.activeScore;
    const unsigned = {
      seatCycleId: brief.seatCycleId, districtLabel: brief.districtLabel, incumbentParty: brief.incumbentParty, qualifyingRoute: houseRoute(brief.qualifyingRoute),
      previousScoreVersion: "v0.6" as const, previousScore: parent.activeScore, activeScoreVersion: "v0.7" as const, activeScore,
      localContext: newlyEligible ? localContext : parent.localContext, localContextAvailableWeight: newlyEligible ? availableWeight : parent.localContextAvailableWeight,
      downBallotDemocraticOverperformance: newlyEligible ? component : parent.downBallotDemocraticOverperformance,
      houseDemocraticShare: newlyEligible ? houseShare : parent.houseDemocraticShare, presidentialDemocraticShare: newlyEligible ? presidentialShare : parent.presidentialDemocraticShare,
      houseMinusPresidentPercentagePoints: newlyEligible ? difference : parent.houseMinusPresidentPercentagePoints, exactGeographyJoin: parent.exactGeographyJoin,
      evidenceConfidence: newlyEligible ? "research_fallback_exact_at_large_partial_election_administration" as const : parent.evidenceConfidence,
      officialCountyFipsNormalizationApplied: parent.officialCountyFipsNormalizationApplied,
      activationContextComponents: newlyEligible ? activationContextComponents : null,
      movementFromV06: one(activeScore - parent.activeScore),
      sourceLockIds: newlyEligible ? [FILES.demographics[0], FILES.election[0], FILES.cvap[0], FILES.house[0], FILES.president[0], FILES.geography[0], "medsl-2024-house-state-nd", "eac-2024-eavs-public-release-v2-csv"] : parent.sourceLockIds,
      parentV06ActiveRowSha256: parent.rowSha256,
    };
    return { ...unsigned, rowSha256: hash("dsa-seats:house-score-v07-active-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.seatCycleId, right.seatCycleId));
  const activeRows = rows.filter((row) => row.downBallotDemocraticOverperformance !== null), changed = rows.filter((row) => row.movementFromV06 !== 0), breaches = changed.filter((row) => Math.abs(row.movementFromV06) > (row.incumbentParty === "Democratic" ? 13 : 14)).length;
  if (rows.length !== 430 || new Set(rows.map((row) => row.seatCycleId)).size !== 430 || activeRows.map((row) => row.districtLabel).join(",") !== "DE-AL,ND-AL,SD-AL,WY-AL" || changed.map((row) => row.districtLabel).join(",") !== "ND-AL" || breaches !== 0) throw new Error("HOUSE_V07_CLOSURE_INVALID");
  const methodology = { status: "active" as const, basis: "product_owner_directive_to_use_retained_county_election_context" as const, scope: "exact_at_large_geography_with_partial_component_renormalization" as const, houseShare: "democratic_candidate_votes_divided_by_all_candidate_votes_including_write_ins_excluding_explicit_administrative_totals" as const, overperformance: "house_democratic_share_minus_harris_share_percentage_points" as const, transform: "clamp_50_plus_5_times_percentage_point_difference_zero_to_one_hundred" as const, localFormula: "available_weights_renormalized_from_0.40_inverse_ballots_cvap_0.30_inverse_registration_cvap_0.20_downballot_overperformance_0.10_demographics" as const, minimumAvailableWeight: 0.6 as const, directElectionAdministrationMeasureRequired: true as const, missingBehavior: "preserve_v06_score_exactly" as const, splitCountyAllocation: false as const, researchFallbackScoreInputs: true as const, winnerInference: false as const };
  const parsed = [active, demographics, election, cvap, house, geography];
  const parents = Object.values(FILES).map(([id, , , digest], index) => ({ id, fileSha256: digest, packageSha256: id === FILES.president[0] ? null : parsed[index > 4 ? 5 : index]?.packageSha256 ?? null, rowSetSha256: id === FILES.president[0] ? null : parsed[index > 4 ? 5 : index]?.rowSetSha256 ?? null }));
  const summary = { seats: 430 as const, downBallotActiveSeats: 4 as const, newlyActivatedSeats: 1 as const, unchangedSeats: 429 as const, normalizedFipsSeats: 1 as const, partialComponentSeats: 1 as const, routeChanges: 0 as const, movementCapBreaches: 0 as const };
  const rowSetSha256 = hash("dsa-seats:house-score-v07-active-row-set:v1", rows), unsigned = { schema: "house-score-v07-active-projection-v1" as const, version: 1 as const, generatedAt: "2026-08-09T11:15:00.000Z" as const, methodology, parents, rows, summary, rowSetSha256 };
  const result = { ...unsigned, packageSha256: hash("dsa-seats:house-score-v07-active-package:v1", unsigned) };
  const output = lock.entries.filter((entry) => entry.id === OUTPUT.id);
  if (output.length === 1) {
    const outputBytes = readFileSync(join(root, OUTPUT.path)), expected = { id: OUTPUT.id, url: OUTPUT.url, retainedPath: OUTPUT.path, retainedStatus: "retained", byteSize: outputBytes.length, sha256: sha(outputBytes), kind: "derived_artifact", parentIds: parents.map((row) => row.id) };
    if (!exact(sourceLockContent(output[0]), expected)) throw new Error("HOUSE_V07_OUTPUT_LOCK_INVALID");
  } else if (output.length !== 0) throw new Error("HOUSE_V07_OUTPUT_LOCK_INVALID");
  return result;
}

export function validateHouseScoreV07ActiveProjection(value: unknown, root = process.cwd()): HouseScoreV07ActiveProjection {
  const expected = buildHouseScoreV07ActiveProjection(root);
  if (!exact(value, expected)) throw new Error("HOUSE_V07_ACTIVE_INVALID");
  return value as HouseScoreV07ActiveProjection;
}
