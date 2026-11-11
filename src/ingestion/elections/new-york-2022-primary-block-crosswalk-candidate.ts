import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateNewYorkPrimaryGeographyCandidate } from "./new-york-primary-geography-compatibility-candidate";
import {
  parseNewYork2022BlockAssignment,
  parseNewYorkCensusBef,
  validateNewYork2022BlockAssignmentReceipt,
  type NewYork2022BlockAssignmentReceipt,
} from "./new-york-2022-congressional-block-assignment-receipt";

export const NEW_YORK_2022_PRIMARY_BLOCK_CROSSWALK_V1 = "new-york-2022-primary-block-crosswalk-candidate-v1" as const;

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type NewYork2022PrimaryBlockCrosswalkInput = Readonly<{
  geographyJson: string;
  receiptJson: string;
  authorityBytes: Buffer;
  assignmentBytes: Buffer;
  cd118Bytes: Buffer;
  cd119Bytes: Buffer;
  sourceLock: { version: 1; entries: LockEntry[] };
}>;

const GEOGRAPHY_SHA = "8f0410959243684b03a2575eb989d23839854c17d3b4b4fe4e6416be932f5096";
const RECEIPT_SHA = "dd0d8f450b632ce1e043dfc6b861e22de957e30cf9f2e8cc9eb438f018befbc9";
const TARGETS = ["03", "04", "05", "06", "07", "08", "09", "10", "12", "13", "14", "15", "16", "18", "19", "20", "22", "25", "26"] as const;
const EXACT_TARGETS = ["04", "05", "12", "13"] as const;
const PARENTS = [
  "new-york-primary-geography-compatibility-candidate-v1",
  "new-york-2022-congressional-block-assignment-receipt-v1",
  "census-cd119-new-york-block-equivalency-extract-20260805",
] as const;
const requiredEntries: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:new-york-primary-geography-compatibility-candidate:v1:2026-08-06", retainedPath: "data/metadata/new-york-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: 67071, sha256: GEOGRAPHY_SHA, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "new-york-house-democratic-primary-dispositions-2022-2024-v2", "new-york-current-incumbent-primary-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-36", "tiger-cd119-36"] },
  { id: PARENTS[1], url: "urn:dsa-seats:new-york-2022-congressional-block-assignment-receipt:v1:2026-08-06", retainedPath: "data/metadata/new-york-2022-congressional-block-assignment-receipt-v1.json", retainedStatus: "retained", byteSize: 11669, sha256: RECEIPT_SHA, kind: "evidence_receipt", parentIds: ["ny-latfor-2022-congressional-map-authority", "ny-2022-court-ordered-congressional-block-assignment", "census-cd118-block-equivalency-bundle-20260806", "census-cd118-new-york-block-equivalency-extract-20260806"] },
  { id: PARENTS[2], url: "urn:dsa-seats:census-cd119-bef:36_NY_CD119.txt", retainedPath: "data/source/elections/primary-results/geography/new-york/current/36_NY_CD119.txt", retainedStatus: "retained", byteSize: 5776392, sha256: "670447571d72c0465cd27ac9769c2e969669d7decb06a4198c653b755ff2e46a", kind: "derived_extract", parentIds: ["census-cd119-block-equivalency-bundle-20260805"] },
];
const OUTPUT_SIZE = 41967;
const OUTPUT_SHA = "c32be7bff97fc9c26342c3f03830676dddb2d0058c7b204ce53ee1d34b2c2e33";

const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`NY_2022_PRIMARY_BLOCK_CROSSWALK_INVALID:${reason}`); };
const parse = (value: string, reason: string): unknown => { try { return JSON.parse(value); } catch { return fail(reason); } };
const exactEntry = (entries: LockEntry[], expected: LockEntry): LockEntry => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
  return matches[0]!;
};

function apportionedSplits(counts: Map<string, number>, total: number) {
  const values = [...counts].map(([targetDistrictCode, blockCount]) => {
    const scaled = blockCount * 1_000_000;
    return { targetDistrictCode, blockCount, sourceSharePpm: Math.floor(scaled / total), remainder: scaled % total };
  });
  let remaining = 1_000_000 - values.reduce((sum, row) => sum + row.sourceSharePpm, 0);
  for (const row of [...values].sort((left, right) => right.remainder - left.remainder || order(left.targetDistrictCode, right.targetDistrictCode))) {
    if (remaining-- <= 0) break;
    row.sourceSharePpm++;
  }
  return values.sort((left, right) => order(left.targetDistrictCode, right.targetDistrictCode)).map((row) => ({ targetDistrictCode: row.targetDistrictCode, blockCount: row.blockCount, sourceSharePpm: row.sourceSharePpm }));
}

function assemble(input: NewYork2022PrimaryBlockCrosswalkInput) {
  if (input.sourceLock.version !== 1 || sha(input.geographyJson) !== GEOGRAPHY_SHA || sha(input.receiptJson) !== RECEIPT_SHA) fail("input_bytes");
  const geography = validateNewYorkPrimaryGeographyCandidate(parse(input.geographyJson, "geography_json"));
  if (geography.packageSha256 !== "c5839d2fb9dd4cc6f463a3adf2520a43b1c6484e2f7d95c6b2e1eb0470611b5d" || geography.rowSetSha256 !== "81d251dbbc6bbd9c1e3185abb7e161ab01b0332ec8439df69edb02a739aa85fb") fail("geography_parent");
  const receiptInput = { authorityBytes: input.authorityBytes, assignmentBytes: input.assignmentBytes, cd118Bytes: input.cd118Bytes, sourceLock: input.sourceLock };
  const receipt = validateNewYork2022BlockAssignmentReceipt(parse(input.receiptJson, "receipt_json") as NewYork2022BlockAssignmentReceipt, receiptInput);
  if (receipt.packageSha256 !== "dc58cc56e0f1feb6424aafcf2e08f3433bb6559ad0dc432d32506f3d631878a8" || receipt.districtSetSha256 !== "9d5390b9df04bae0b065492424fac673a74624e927b36f5a1534c6817b4a9443") fail("receipt_parent");
  for (const entry of requiredEntries) exactEntry(input.sourceLock.entries, entry);
  const output = input.sourceLock.entries.filter((entry) => entry.id === NEW_YORK_2022_PRIMARY_BLOCK_CROSSWALK_V1);
  if (!OUTPUT_SHA) {
    if (output.length) fail("unexpected_output_lock");
  } else {
    exactEntry(input.sourceLock.entries, { id: NEW_YORK_2022_PRIMARY_BLOCK_CROSSWALK_V1, url: "urn:dsa-seats:new-york-2022-primary-block-crosswalk-candidate:v1:2026-08-06", retainedPath: "data/metadata/new-york-2022-primary-block-crosswalk-candidate-v1.json", retainedStatus: "retained", byteSize: OUTPUT_SIZE, sha256: OUTPUT_SHA, kind: "review_candidate", parentIds: [...PARENTS] });
  }

  const source = parseNewYork2022BlockAssignment(input.assignmentBytes), target = parseNewYorkCensusBef(input.cd119Bytes, "119");
  if (source.blocks.size !== target.blocks.size || [...source.blocks.keys()].some((geoid) => !target.blocks.has(geoid)) || [...target.blocks.keys()].some((geoid) => !source.blocks.has(geoid))) fail("block_universe");
  const parents = geography.rows.filter((row) => row.cycleYear === 2022);
  if (parents.length !== TARGETS.length || parents.some((row, index) => row.districtCode !== TARGETS[index] || row.observationId !== `ny:geography:2022:${TARGETS[index]}` || row.compatibilityDisposition !== "redraw_crosswalk_required" || row.compatibilityCandidate)) fail("parent_row_closure");

  const rows = parents.map((parent) => {
    const districtCode = parent.districtCode;
    const sourceBlocks = [...source.blocks].filter(([, district]) => district === districtCode).map(([geoid]) => geoid);
    const targetBlocks = [...target.blocks].filter(([, district]) => district === districtCode).map(([geoid]) => geoid);
    const counts = new Map<string, number>();
    for (const geoid of sourceBlocks) {
      const targetDistrict = target.blocks.get(geoid) ?? fail("missing_target_block");
      counts.set(targetDistrict, (counts.get(targetDistrict) ?? 0) + 1);
    }
    const sameDistrictBlockCount = counts.get(districtCode) ?? 0;
    const exact = sourceBlocks.length === targetBlocks.length && sameDistrictBlockCount === sourceBlocks.length && counts.size === 1;
    const unsigned = {
      observationId: parent.observationId,
      parentGeographyRowSha256: parent.rowSha256,
      identityObservationId: parent.identityObservationId,
      parentIdentityStatus: parent.identityStatus,
      parentResultDisposition: parent.resultDisposition,
      seatCycleId: parent.seatCycleId,
      districtCode,
      cycleYear: 2022 as const,
      historicalCongressSession: "118" as const,
      sourcePlanId: source.sourcePlanId,
      targetPlanId: "census-cd119-new-york" as const,
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
      identityDispositionPreserved: true as const,
      resultDispositionPreserved: true as const,
      scoreEligible: false as const,
      evaluatorUse: "excluded_pending_authorized_identity_geography_and_review" as const,
      rationaleCodes: exact
        ? ["identical_2020_tabulation_block_membership", "parent_identity_and_result_dispositions_preserved", "still_requires_authorized_identity_geography_review"]
        : ["source_district_splits_across_current_cd119_districts", "same_district_number_and_overlap_are_not_continuity_thresholds", "block_counts_are_not_population_voter_or_electoral_weights", "parent_identity_and_result_dispositions_preserved"],
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:ny-2022-primary-block-crosswalk-row:v1\0", unsigned) };
  }).sort((left, right) => order(left.observationId, right.observationId));
  const exactDistricts = rows.filter((row) => row.compatibilityCandidate).map((row) => row.districtCode);
  if (canonicalJson(exactDistricts) !== canonicalJson(EXACT_TARGETS)) fail("exact_candidate_closure");
  let changedAssignments = 0;
  for (const [geoid, district] of source.blocks) if (target.blocks.get(geoid) !== district) changedAssignments++;
  if (changedAssignments !== 25881) fail("assignment_change_closure");
  const unsigned = {
    schema: NEW_YORK_2022_PRIMARY_BLOCK_CROSSWALK_V1,
    version: 1 as const,
    generatedAt: "2026-08-06T17:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_authorized_identity_geography_and_review" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    inputs: {
      geographyCandidate: { sourceLockId: PARENTS[0], fileSha256: GEOGRAPHY_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 },
      historicalAssignmentReceipt: { sourceLockId: PARENTS[1], fileSha256: RECEIPT_SHA, packageSha256: receipt.packageSha256, districtSetSha256: receipt.districtSetSha256 },
      currentBlockEquivalency: { sourceLockId: PARENTS[2], fileSha256: requiredEntries[2]!.sha256, congressSession: "119" as const },
    },
    methodology: {
      joinKey: "2020_census_tabulation_block_geoid" as const,
      sourcePlan: source.sourcePlanId,
      targetPlan: "census-cd119-new-york" as const,
      sourceAndTargetBlockUniverseEqual: true as const,
      blockUniverse: 288819 as const,
      exactMembershipRule: "source_and_target_district_block_sets_must_be_identical" as const,
      splitDispositionRule: "crosswalk_review_required_regardless_of_overlap_share" as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityAssumed: false as const,
      blockCountsArePopulationWeighted: false as const,
      blockCountsAreVoterWeighted: false as const,
      blockCountsAreElectoralWeighted: false as const,
      splitShareRounding: "largest_remainder_exactly_one_million_ppm" as const,
      rawGeometryEqualityAssessed: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary: {
      targetObservations: 19 as const,
      exactBlockMembershipCandidates: 4 as const,
      crosswalkReviewRequired: 15 as const,
      sourceBlocks: 288819 as const,
      targetBlocks: 288819 as const,
      sharedBlocks: 288819 as const,
      changedDistrictAssignments: 25881 as const,
      automaticallyApprovedRows: 0 as const,
      scoreEligibleRows: 0 as const,
    },
    rows,
    rowSetSha256: digest("dsa-seats:ny-2022-primary-block-crosswalk-row-set:v1\0", rows),
    decisionSupport: {
      informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const,
      recommendedResolution: "accept_four_exact_block_membership_candidates_and_retain_fifteen_split_rows_for_crosswalk_review" as const,
      defaultAssumption: "exclude_all_rows_until_authorized_identity_geography_review" as const,
      consequenceIfAccepted: "a_later_geography_package_may_consume_only_the_four_exact_candidates_without_treating_them_as_approved" as const,
      consequenceIfRejected: "all_nineteen_2022_rows_remain_redraw_crosswalk_required" as const,
      blocksOtherWork: false as const,
    },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ny-2022-primary-block-crosswalk-candidate:v1\0", unsigned) };
}

export type NewYork2022PrimaryBlockCrosswalkCandidate = ReturnType<typeof assemble>;
export function buildNewYork2022PrimaryBlockCrosswalkCandidate(input: NewYork2022PrimaryBlockCrosswalkInput): NewYork2022PrimaryBlockCrosswalkCandidate { return assemble(input); }
export function validateNewYork2022PrimaryBlockCrosswalkCandidate(value: NewYork2022PrimaryBlockCrosswalkCandidate, input: NewYork2022PrimaryBlockCrosswalkInput): NewYork2022PrimaryBlockCrosswalkCandidate {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
