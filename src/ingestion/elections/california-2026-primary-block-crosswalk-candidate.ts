import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateCaliforniaPrimaryGeographyCompatibilityCandidate } from "./california-primary-geography-compatibility-candidate";

export const CALIFORNIA_2026_PRIMARY_BLOCK_CROSSWALK_V1 = "california-2026-primary-block-crosswalk-candidate-v1" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type California2026PrimaryBlockCrosswalkInput = Readonly<{
  geographyJson: string;
  currentStatusBytes: Buffer;
  voterGuideBytes: Buffer;
  sourcePageBytes: Buffer;
  planBlocksBytes: Buffer;
  currentBlocksBytes: Buffer;
  sourceLock: { version: 1; entries: LockEntry[] };
}>;

const HASHES = {
  geography: "26bf6010c411d6895c6d307788ec203e75ad1e60f947773ac9ed6283ddccb8c6",
  currentStatus: "37c47e69d57a1fa134313ff6a46a5d416d7970881f8d1e6735f94cf27e5a19fd",
  voterGuide: "245e774a9b1f860585043fca34a33602c3c1c07b73d0332b710d217d54e4fd22",
  sourcePage: "fab27772b3385efa15bd0c21a23892a513a4ea1426c1d0b5d7d6e9d68bd87a5e",
  planBlocks: "280f47703360ac4c9c59341a6a4317fe039ad4d20173cc4f00bfc9438e0505fc",
  currentBlocks: "f9c68edcf53483aa1c83315180bcc5d88b1db0b55869c443f755e1dcd61fcfc4",
} as const;
const PARENTS = [
  "california-primary-geography-compatibility-candidate-v1",
  "ca-proposition-50-current-election-use-status-20260806",
  "ca-proposition-50-official-voter-guide-2025",
  "ca-ab604-official-plan-source-page-20260806",
  "ca-ab604-block-equivalency-extract-20260806",
  "census-cd119-california-block-equivalency-extract-20260806",
] as const;
const OUTPUT_ENTRY: LockEntry = {
  id: CALIFORNIA_2026_PRIMARY_BLOCK_CROSSWALK_V1,
  url: "urn:dsa-seats:california-2026-primary-block-crosswalk-candidate:v1:2026-08-06",
  retainedPath: "data/metadata/california-2026-primary-block-crosswalk-candidate-v1.json",
  retainedStatus: "retained",
  byteSize: 128492,
  sha256: "7682fbebc52f2c86c83675ceef2c1e5fc6367d8a3a2674b47becda942ec2f044",
  kind: "review_candidate",
  parentIds: [...PARENTS],
};
const requiredEntries: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:california-primary-geography-compatibility-candidate:v1:2026-08-05", retainedPath: "data/metadata/california-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: 174978, sha256: HASHES.geography, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "california-house-top-two-results-2022-2026-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-06", "tiger-cd119-06"] },
  { id: PARENTS[1], url: "https://www.sos.ca.gov/elections/california-redistricting", retainedPath: "data/source/elections/primary-results/geography/california/2026/california-redistricting-status.html", retainedStatus: "retained", byteSize: 62964, sha256: HASHES.currentStatus, kind: "official_current_authority", parentIds: [] },
  { id: PARENTS[2], url: "https://vig.cdn.sos.ca.gov/2025/special/pdf/prop50.pdf", retainedPath: "data/source/elections/primary-results/geography/california/2026/prop50-official-voter-guide.pdf", retainedStatus: "retained", byteSize: 4872403, sha256: HASHES.voterGuide, kind: "official_measure_authority", parentIds: [] },
  { id: PARENTS[3], url: "https://sdmg.senate.ca.gov/committeehome/2025-congressional-districts", retainedPath: "data/source/elections/primary-results/geography/california/2026/2025-congressional-districts.html", retainedStatus: "retained", byteSize: 87789, sha256: HASHES.sourcePage, kind: "official_plan_source_page", parentIds: [PARENTS[2]] },
  { id: PARENTS[4], url: "urn:dsa-seats:ca-ab604:block-equivalency:normalized", retainedPath: "data/source/elections/primary-results/geography/california/2026/06_CA_CD120_AB604.txt", retainedStatus: "retained", byteSize: 10394472, sha256: HASHES.planBlocks, kind: "derived_extract", parentIds: ["ca-ab604-block-equivalency-20250818"] },
  { id: PARENTS[5], url: "urn:dsa-seats:census-cd119-bef:NationalCD119.txt:state-fips-06", retainedPath: "data/source/elections/primary-results/geography/california/current/06_CA_CD119.txt", retainedStatus: "retained", byteSize: 10394472, sha256: HASHES.currentBlocks, kind: "derived_extract", parentIds: ["census-cd119-block-equivalency-bundle-20260805"] },
];
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`CA_2026_PRIMARY_BLOCK_CROSSWALK_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function parseBlocks(bytes: Buffer, source: "ab604" | "cd119") {
  if (sha(bytes) !== (source === "ab604" ? HASHES.planBlocks : HASHES.currentBlocks)) fail(`${source}_bytes`);
  const lines = bytes.toString("utf8").trim().split(/\r?\n/);
  if (lines.shift() !== "GEOID,CDFP") fail(`${source}_header`);
  const blocks = new Map<string, string>();
  const byDistrict = new Map<string, string[]>();
  for (const line of lines) {
    const match = /^(06\d{13}),(\d{2})$/.exec(line) ?? fail(`${source}_row`);
    if (!/^(?:0[1-9]|[1-4]\d|5[0-2])$/.test(match[2]!) || blocks.has(match[1]!)) fail(`${source}_row`);
    blocks.set(match[1]!, match[2]!);
    const group = byDistrict.get(match[2]!) ?? [];
    group.push(match[1]!);
    byDistrict.set(match[2]!, group);
  }
  const expectedDistricts = Array.from({ length: 52 }, (_, index) => String(index + 1).padStart(2, "0"));
  if (blocks.size !== 519723 || byDistrict.size !== 52 || expectedDistricts.some((district) => !byDistrict.has(district))) fail(`${source}_inventory`);
  return { blocks, byDistrict };
}

function apportionedSplits(counts: Map<string, number>, total: number) {
  const values = [...counts].map(([targetDistrictCode, blockCount]) => {
    const scaled = blockCount * 1_000_000;
    return { targetDistrictCode, blockCount, sourceSharePpm: Math.floor(scaled / total), remainder: scaled % total };
  });
  let remaining = 1_000_000 - values.reduce((sum, row) => sum + row.sourceSharePpm, 0);
  for (const row of [...values].sort((left, right) => right.remainder - left.remainder || order(left.targetDistrictCode, right.targetDistrictCode))) {
    if (remaining-- <= 0) break;
    row.sourceSharePpm += 1;
  }
  return values.sort((left, right) => order(left.targetDistrictCode, right.targetDistrictCode)).map((row) => ({ targetDistrictCode: row.targetDistrictCode, blockCount: row.blockCount, sourceSharePpm: row.sourceSharePpm }));
}

function assemble(input: California2026PrimaryBlockCrosswalkInput) {
  if (
    input.sourceLock.version !== 1
    || sha(input.geographyJson) !== HASHES.geography
    || sha(input.currentStatusBytes) !== HASHES.currentStatus
    || sha(input.voterGuideBytes) !== HASHES.voterGuide
    || sha(input.sourcePageBytes) !== HASHES.sourcePage
  ) fail("input_bytes");
  const geography = validateCaliforniaPrimaryGeographyCompatibilityCandidate(JSON.parse(input.geographyJson));
  if (geography.packageSha256 !== "59ee4593076e81829dbb576f70230b0c50744d473c80c57b050ce5e9884b3f94" || geography.rowSetSha256 !== "ea829f1b57dc8f494676d9a9991546e9d08887eaf36cd06e422339d27519dcea") fail("geography_parent");
  for (const entry of requiredEntries) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);
  const status = input.currentStatusBytes.toString("utf8");
  const sourcePage = input.sourcePageBytes.toString("utf8");
  if (
    !status.includes("temporarily use legislatively drawn Congressional district maps starting in 2026 and through 2030")
    || !status.includes("2026 primary and general election ballots will include candidates for the new district")
    || !status.includes("until noon on January 3, 2027")
    || !input.voterGuideBytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
    || !sourcePage.includes("Proposition 50 (2025)")
    || !sourcePage.includes("AB 604 Districts Equivalency File")
    || !sourcePage.includes("AB 604 - Chaptered 8/21/2025")
  ) fail("authority_claims");
  const source = parseBlocks(input.planBlocksBytes, "ab604");
  const target = parseBlocks(input.currentBlocksBytes, "cd119");
  if ([...source.blocks].some(([geoid]) => !target.blocks.has(geoid)) || [...target.blocks].some(([geoid]) => !source.blocks.has(geoid))) fail("block_universe");
  const parents = geography.rows.filter((row) => row.cycleYear === 2026);
  if (parents.length !== 52 || parents.some((row) => row.historicalCongressSession !== "120" || row.historicalGeoid !== null || row.compatibilityCandidate || row.compatibilityDisposition !== "unassessed_cd120_authority_collection_pending" || row.formulaApplicability !== "confirmed_incompatible_with_party_primary_metrics")) fail("parent_row_closure");

  const rows = parents.map((parent) => {
    const sourceBlocks = source.byDistrict.get(parent.districtCode) ?? fail("missing_source_district");
    const targetBlocks = target.byDistrict.get(parent.districtCode) ?? fail("missing_target_district");
    const counts = new Map<string, number>();
    for (const geoid of sourceBlocks) {
      const targetDistrict = target.blocks.get(geoid) ?? fail("missing_target_block");
      counts.set(targetDistrict, (counts.get(targetDistrict) ?? 0) + 1);
    }
    const sameDistrictBlockCount = counts.get(parent.districtCode) ?? 0;
    const exact = counts.size === 1 && sameDistrictBlockCount === sourceBlocks.length && sourceBlocks.length === targetBlocks.length;
    const unsigned = {
      contestId: parent.contestId,
      parentGeographyRowSha256: parent.rowSha256,
      contestSha256: parent.contestSha256,
      seatCycleId: parent.seatCycleId,
      districtCode: parent.districtCode,
      cycleYear: 2026 as const,
      targetCd119Geoid: parent.targetCd119Geoid,
      historicalCongressSession: "120" as const,
      sourcePlanId: "california-proposition50-ab604-2025" as const,
      targetPlanId: "census-cd119-california" as const,
      sourceBlockCount: sourceBlocks.length,
      targetBlockCount: targetBlocks.length,
      sameDistrictBlockCount,
      sourceRetentionPpm: Math.round(sameDistrictBlockCount * 1_000_000 / sourceBlocks.length),
      targetCoveragePpm: Math.round(sameDistrictBlockCount * 1_000_000 / targetBlocks.length),
      sourceToTargetSplits: apportionedSplits(counts, sourceBlocks.length),
      blockCountMeaning: "2020_census_tabulation_blocks_not_population_voters_or_electoral_weight" as const,
      compatibilityDisposition: exact ? "exact_block_membership_candidate" as const : "crosswalk_review_required" as const,
      compatibilityCandidate: exact,
      confidence: exact ? "high" as const : "none" as const,
      compatibilityApproved: false as const,
      identityApproved: false as const,
      formulaApplicability: parent.formulaApplicability,
      authorityStatus: "approved_by_voters_and_in_use_for_2026_primary_and_general_ballots_at_cutoff" as const,
      authorityCutoff: "2026-08-06" as const,
      representationTransition: "current_representation_until_noon_2027_01_03" as const,
      scoreEligible: false as const,
      evaluatorUse: parent.evaluatorUse,
      rationaleCodes: exact
        ? ["identical_2020_tabulation_block_membership", "proposition50_ab604_used_for_2026_ballots_at_cutoff", "top_two_formula_incompatibility_preserved"]
        : ["source_district_splits_across_current_cd119_districts", "same_district_number_and_overlap_are_not_continuity_thresholds", "proposition50_ab604_used_for_2026_ballots_at_cutoff", "block_counts_are_not_population_voter_or_electoral_weights", "top_two_formula_incompatibility_preserved"],
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:ca-2026-primary-block-crosswalk-row:v1\0", unsigned) };
  }).sort((left, right) => order(left.contestId, right.contestId));
  if (rows.filter((row) => row.compatibilityCandidate).map((row) => row.districtCode).join(",") !== "34,36,37,43") fail("candidate_closure");
  let changedAssignments = 0;
  for (const [geoid, district] of source.blocks) if (target.blocks.get(geoid) !== district) changedAssignments += 1;
  if (changedAssignments !== 133426) fail("assignment_change_closure");

  const unsigned = {
    schema: CALIFORNIA_2026_PRIMARY_BLOCK_CROSSWALK_V1,
    version: 1 as const,
    generatedAt: "2026-08-06T13:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_authorized_identity_historical_geography_and_top_two_review" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    inputs: {
      geographyCandidate: { sourceLockId: PARENTS[0], fileSha256: HASHES.geography, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 },
      currentElectionUseAuthority: { sourceLockId: PARENTS[1], fileSha256: HASHES.currentStatus, authorityCutoff: "2026-08-06" as const },
      measureAuthority: { sourceLockId: PARENTS[2], fileSha256: HASHES.voterGuide },
      planSourcePage: { sourceLockId: PARENTS[3], fileSha256: HASHES.sourcePage, reuseLicenseAssessed: false as const, publicationPermissionAssessed: false as const },
      sourceBlockAssignment: { sourceLockId: PARENTS[4], fileSha256: HASHES.planBlocks },
      targetBlockAssignment: { sourceLockId: PARENTS[5], fileSha256: HASHES.currentBlocks },
    },
    methodology: {
      joinKey: "2020_census_tabulation_block_geoid" as const,
      sourcePlan: "california-proposition50-ab604-2025" as const,
      targetPlan: "census-cd119-california" as const,
      sourceAndTargetBlockUniverseEqual: true as const,
      blockUniverse: 519723 as const,
      exactMembershipRule: "source_and_target_district_block_sets_must_be_identical" as const,
      splitDispositionRule: "crosswalk_review_required_regardless_of_overlap_share" as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityAssumed: false as const,
      blockCountsArePopulationWeighted: false as const,
      blockCountsAreVoterWeighted: false as const,
      blockCountsAreElectoralWeighted: false as const,
      splitShareRounding: "largest_remainder_exactly_one_million_ppm" as const,
      rawGeometryEqualityAssessed: false as const,
      legalPermanenceAssessed: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary: {
      targetObservations: 52 as const,
      uniqueSourceDistricts: 52 as const,
      exactBlockMembershipCandidates: 4 as const,
      crosswalkReviewRequired: 48 as const,
      sourceBlocks: 519723 as const,
      targetBlocks: 519723 as const,
      sharedBlocks: 519723 as const,
      changedDistrictAssignments: 133426 as const,
      automaticallyApprovedRows: 0 as const,
      scoreEligibleRows: 0 as const,
    },
    rows,
    rowSetSha256: digest("dsa-seats:ca-2026-primary-block-crosswalk-row-set:v1\0", rows),
    decisionSupport: {
      informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const,
      recommendedResolution: "retain_four_exact_membership_candidates_and_forty_eight_split_rows_for_review" as const,
      defaultAssumption: "exclude_all_rows_until_authorized_identity_geography_and_top_two_review" as const,
      consequenceIfAccepted: "four_2026_geography_candidates_are_available_but_no_row_is_approved_or_formula_eligible" as const,
      consequenceIfRejected: "all_fifty_two_2026_rows_remain_authority_collection_pending" as const,
      blocksOtherWork: false as const,
    },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ca-2026-primary-block-crosswalk-candidate:v1\0", unsigned) };
}

export type California2026PrimaryBlockCrosswalkCandidate = ReturnType<typeof assemble>;
export function buildCalifornia2026PrimaryBlockCrosswalkCandidate(input: California2026PrimaryBlockCrosswalkInput) { return assemble(input); }
export function validateCalifornia2026PrimaryBlockCrosswalkCandidate(value: California2026PrimaryBlockCrosswalkCandidate, input: California2026PrimaryBlockCrosswalkInput) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
