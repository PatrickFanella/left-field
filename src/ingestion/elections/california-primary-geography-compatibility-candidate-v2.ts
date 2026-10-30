import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateCalifornia2026PrimaryBlockCrosswalkCandidate, type California2026PrimaryBlockCrosswalkCandidate, type California2026PrimaryBlockCrosswalkInput } from "./california-2026-primary-block-crosswalk-candidate";
import { validateCaliforniaPrimaryGeographyCompatibilityCandidate } from "./california-primary-geography-compatibility-candidate";

export const CALIFORNIA_PRIMARY_GEOGRAPHY_V2 = "california-primary-geography-compatibility-candidate-v2" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type CaliforniaPrimaryGeographyV2Input = Omit<California2026PrimaryBlockCrosswalkInput, "geographyJson"> & Readonly<{ geographyV1Json: string; crosswalkJson: string }>;
const GEOGRAPHY_SHA = "26bf6010c411d6895c6d307788ec203e75ad1e60f947773ac9ed6283ddccb8c6";
const CROSSWALK_SHA = "7682fbebc52f2c86c83675ceef2c1e5fc6367d8a3a2674b47becda942ec2f044";
const PARENTS = ["california-primary-geography-compatibility-candidate-v1", "california-2026-primary-block-crosswalk-candidate-v1"] as const;
const OUTPUT_ENTRY: LockEntry = { id: CALIFORNIA_PRIMARY_GEOGRAPHY_V2, url: "urn:dsa-seats:california-primary-geography-compatibility-candidate:v2:2026-08-06", retainedPath: "data/metadata/california-primary-geography-compatibility-candidate-v2.json", retainedStatus: "retained", byteSize: 278231, sha256: "1c47fdba328c2930a99ce8d0dde9a33bb974433295b70d7109c462c47be76eba", kind: "review_candidate", parentIds: [...PARENTS] };
const requiredEntries: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:california-primary-geography-compatibility-candidate:v1:2026-08-05", retainedPath: "data/metadata/california-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: 174978, sha256: GEOGRAPHY_SHA, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "california-house-top-two-results-2022-2026-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-06", "tiger-cd119-06"] },
  { id: PARENTS[1], url: "urn:dsa-seats:california-2026-primary-block-crosswalk-candidate:v1:2026-08-06", retainedPath: "data/metadata/california-2026-primary-block-crosswalk-candidate-v1.json", retainedStatus: "retained", byteSize: 128492, sha256: CROSSWALK_SHA, kind: "review_candidate", parentIds: ["california-primary-geography-compatibility-candidate-v1", "ca-proposition-50-current-election-use-status-20260806", "ca-proposition-50-official-voter-guide-2025", "ca-ab604-official-plan-source-page-20260806", "ca-ab604-block-equivalency-extract-20260806", "census-cd119-california-block-equivalency-extract-20260806"] },
];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`CA_PRIMARY_GEOGRAPHY_V2_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function assemble(input: CaliforniaPrimaryGeographyV2Input) {
  if (input.sourceLock.version !== 1 || sha(input.geographyV1Json) !== GEOGRAPHY_SHA || sha(input.crosswalkJson) !== CROSSWALK_SHA) fail("input_bytes");
  const geography = validateCaliforniaPrimaryGeographyCompatibilityCandidate(JSON.parse(input.geographyV1Json));
  const crosswalkInput = {
    geographyJson: input.geographyV1Json,
    currentStatusBytes: input.currentStatusBytes,
    voterGuideBytes: input.voterGuideBytes,
    sourcePageBytes: input.sourcePageBytes,
    planBlocksBytes: input.planBlocksBytes,
    currentBlocksBytes: input.currentBlocksBytes,
    sourceLock: input.sourceLock,
  };
  const crosswalk = validateCalifornia2026PrimaryBlockCrosswalkCandidate(JSON.parse(input.crosswalkJson) as California2026PrimaryBlockCrosswalkCandidate, crosswalkInput);
  if (
    geography.packageSha256 !== "59ee4593076e81829dbb576f70230b0c50744d473c80c57b050ce5e9884b3f94"
    || geography.rowSetSha256 !== "ea829f1b57dc8f494676d9a9991546e9d08887eaf36cd06e422339d27519dcea"
    || crosswalk.packageSha256 !== "c4d1ace29f232c17248f2e348382c45d86f4fa9165d17dc03d47d2d108ab9cfd"
    || crosswalk.rowSetSha256 !== "969da6503a15a66c144a2d1cc88b26ad095d2f3cc103ac6daf07b9126e109cd8"
  ) fail("parent_identity");
  for (const entry of requiredEntries) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);

  const byContest = new Map(crosswalk.rows.map((row) => [row.contestId, row]));
  const rows = geography.rows.map((parent) => {
    const evidence = parent.cycleYear === 2026 ? byContest.get(parent.contestId) ?? fail("missing_crosswalk_row") : null;
    if (evidence && (
      evidence.parentGeographyRowSha256 !== parent.rowSha256
      || evidence.contestSha256 !== parent.contestSha256
      || evidence.seatCycleId !== parent.seatCycleId
      || evidence.districtCode !== parent.districtCode
      || evidence.targetCd119Geoid !== parent.targetCd119Geoid
      || evidence.formulaApplicability !== parent.formulaApplicability
      || evidence.evaluatorUse !== parent.evaluatorUse
    )) fail("crosswalk_join");
    const exact = evidence?.compatibilityDisposition === "exact_block_membership_candidate";
    const { rowSha256: parentGeographyRowSha256, ...parentUnsigned } = parent;
    const unsigned = {
      ...parentUnsigned,
      historicalGeoid: evidence ? null : parent.historicalGeoid,
      compatibilityDisposition: evidence ? (exact ? "exact_2020_block_membership_candidate" as const : "crosswalk_review_required" as const) : parent.compatibilityDisposition,
      evidenceClass: evidence ? (exact ? "derived_exact_2020_block_membership" as const : "derived_split_2020_block_crosswalk_review_required" as const) : parent.evidenceClass,
      confidence: evidence ? (exact ? "high" as const : "none" as const) : parent.confidence,
      compatibilityCandidate: evidence ? exact : parent.compatibilityCandidate,
      rationaleCodes: evidence ? (exact
        ? ["identical_2020_tabulation_block_membership", "proposition50_ab604_used_for_2026_ballots_at_cutoff", "crosswalk_candidate_not_approved", "top_two_formula_incompatibility_preserved"]
        : ["source_district_splits_across_current_cd119_districts", "no_overlap_threshold_or_district_number_continuity", "proposition50_ab604_used_for_2026_ballots_at_cutoff", "top_two_formula_incompatibility_preserved"]
      ) : parent.rationaleCodes,
      parentGeographyRowSha256,
      planBlockCrosswalk: evidence ? {
        sourceLockId: PARENTS[1],
        packageSha256: crosswalk.packageSha256,
        rowSha256: evidence.rowSha256,
        sourcePlanId: evidence.sourcePlanId,
        targetPlanId: evidence.targetPlanId,
        authorityStatus: evidence.authorityStatus,
        authorityCutoff: evidence.authorityCutoff,
        representationTransition: evidence.representationTransition,
        sourceBlockCount: evidence.sourceBlockCount,
        targetBlockCount: evidence.targetBlockCount,
        sameDistrictBlockCount: evidence.sameDistrictBlockCount,
        sourceRetentionPpm: evidence.sourceRetentionPpm,
        targetCoveragePpm: evidence.targetCoveragePpm,
        sourceToTargetSplits: evidence.sourceToTargetSplits,
        blockCountMeaning: evidence.blockCountMeaning,
      } : null,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:ca-primary-geography-row:v2\0", unsigned) };
  }).sort((left, right) => order(left.contestId, right.contestId));
  const current = rows.filter((row) => row.cycleYear === 2026);
  if (
    byContest.size !== 52
    || rows.length !== 156
    || current.filter((row) => row.compatibilityCandidate).map((row) => row.districtCode).join(",") !== "34,36,37,43"
    || current.some((row) => row.historicalGeoid !== null)
    || current.filter((row) => !row.compatibilityCandidate).some((row) => row.compatibilityDisposition !== "crosswalk_review_required")
    || rows.filter((row) => row.cycleYear !== 2026).some((row) => !row.compatibilityCandidate || row.planBlockCrosswalk !== null)
    || rows.some((row) => row.compatibilityApproved || row.identityApproved || row.scoreEligible || row.formulaApplicability !== "confirmed_incompatible_with_party_primary_metrics")
  ) fail("row_closure");

  const unsigned = {
    schema: CALIFORNIA_PRIMARY_GEOGRAPHY_V2,
    version: 2 as const,
    generatedAt: "2026-08-06T13:30:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: geography.defaultUse,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    parents: {
      geographyV1: { sourceLockId: PARENTS[0], fileSha256: GEOGRAPHY_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256, superseded: false as const },
      planBlockCrosswalk: { sourceLockId: PARENTS[1], fileSha256: CROSSWALK_SHA, packageSha256: crosswalk.packageSha256, rowSetSha256: crosswalk.rowSetSha256 },
    },
    methodology: {
      compositionOnly: true as const,
      historicalTreatment: "retain_v1_cd118_to_cd119_plan_continuity_candidates" as const,
      currentTreatment: "retain_v1_exact_cd119_session_and_key_candidates" as const,
      cd120Treatment: "exact_block_membership_candidate_only_otherwise_crosswalk_review_required" as const,
      blockJoinKey: "2020_census_tabulation_block_geoid" as const,
      crosswalkBlockUniverse: 519723 as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityAssumed: false as const,
      populationEquivalenceAssessed: false as const,
      voterOrElectoralWeightUsed: false as const,
      rawGeometryEqualityAssessed: false as const,
      legalPermanenceAssessed: false as const,
      topTwoFormulaApplicabilityChanged: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary: {
      contestCycleObservations: 156 as const,
      cd118ToCd119PlanContinuityCandidates: 52 as const,
      exactCd119SessionKeyCandidates: 52 as const,
      cd120ExactBlockMembershipCandidates: 4 as const,
      cd120CrosswalkReviewRequired: 48 as const,
      compatibilityCandidates: 108 as const,
      automaticallyApprovedRows: 0 as const,
      scoreEligibleRows: 0 as const,
    },
    rows,
    rowSetSha256: digest("dsa-seats:ca-primary-geography-row-set:v2\0", rows),
    decisionSupport: {
      informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const,
      status: "proposed" as const,
      recommendedResolution: "accept_one_hundred_four_inherited_candidates_and_four_cd120_exact_block_membership_candidates_retain_forty_eight_split_rows_for_review" as const,
      defaultAssumption: "exclude_all_rows_until_authorized_identity_geography_and_top_two_review" as const,
      reviewerResolution: null,
      reviewer: null,
      reviewedAt: null,
    },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ca-primary-geography-candidate:v2\0", unsigned) };
}

export type CaliforniaPrimaryGeographyCandidateV2 = ReturnType<typeof assemble>;
export function buildCaliforniaPrimaryGeographyCandidateV2(input: CaliforniaPrimaryGeographyV2Input) { return assemble(input); }
export function validateCaliforniaPrimaryGeographyCandidateV2(value: CaliforniaPrimaryGeographyCandidateV2, input: CaliforniaPrimaryGeographyV2Input) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
