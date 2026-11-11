import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateCaliforniaPrimaryGeographyCandidateV2, type CaliforniaPrimaryGeographyCandidateV2, type CaliforniaPrimaryGeographyV2Input } from "./california-primary-geography-compatibility-candidate-v2";
import { validateCaliforniaPrimaryIdentityGeographyReviewPackage } from "./california-primary-identity-geography-review-package";

export const CALIFORNIA_PRIMARY_JOINT_REVIEW_V2 = "california-primary-identity-geography-review-package-v2" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type CaliforniaPrimaryJointReviewV2Input = CaliforniaPrimaryGeographyV2Input & Readonly<{ jointV1Json: string; geographyV2Json: string }>;
const JOINT_V1_SHA = "39a812f0d7ec0b1ea7530df48aa55f0f4621e5237d633bb6f5e643e6ee6a2391";
const GEOGRAPHY_V2_SHA = "1c47fdba328c2930a99ce8d0dde9a33bb974433295b70d7109c462c47be76eba";
const PARENTS = ["california-primary-identity-geography-review-package-v1", "california-primary-geography-compatibility-candidate-v2"] as const;
const OUTPUT_ENTRY: LockEntry = { id: CALIFORNIA_PRIMARY_JOINT_REVIEW_V2, url: "urn:dsa-seats:california-primary-identity-geography-review-package:v2:2026-08-06", retainedPath: "data/metadata/california-primary-identity-geography-review-package-v2.json", retainedStatus: "retained", byteSize: 369996, sha256: "ec9a76edea1caf3a3704f4762ab12afb826392c05c8128a1755614453f981ab7", kind: "review_proposal", parentIds: [...PARENTS] };
const REQUIRED_ENTRIES: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:california-primary-identity-geography-review-package:v1:2026-08-05", retainedPath: "data/metadata/california-primary-identity-geography-review-package-v1.json", retainedStatus: "retained", byteSize: 243302, sha256: JOINT_V1_SHA, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "california-current-incumbent-primary-linkage-candidate-v1", "california-primary-geography-compatibility-candidate-v1"] },
  { id: PARENTS[1], url: "urn:dsa-seats:california-primary-geography-compatibility-candidate:v2:2026-08-06", retainedPath: "data/metadata/california-primary-geography-compatibility-candidate-v2.json", retainedStatus: "retained", byteSize: 278231, sha256: GEOGRAPHY_V2_SHA, kind: "review_candidate", parentIds: ["california-primary-geography-compatibility-candidate-v1", "california-2026-primary-block-crosswalk-candidate-v1"] },
];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`CA_PRIMARY_JOINT_REVIEW_V2_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function assemble(input: CaliforniaPrimaryJointReviewV2Input) {
  if (input.sourceLock.version !== 1 || sha(input.jointV1Json) !== JOINT_V1_SHA || sha(input.geographyV2Json) !== GEOGRAPHY_V2_SHA) fail("input_bytes");
  const jointV1 = validateCaliforniaPrimaryIdentityGeographyReviewPackage(JSON.parse(input.jointV1Json));
  const geographyInput = {
    geographyV1Json: input.geographyV1Json,
    crosswalkJson: input.crosswalkJson,
    currentStatusBytes: input.currentStatusBytes,
    voterGuideBytes: input.voterGuideBytes,
    sourcePageBytes: input.sourcePageBytes,
    planBlocksBytes: input.planBlocksBytes,
    currentBlocksBytes: input.currentBlocksBytes,
    sourceLock: input.sourceLock,
  };
  const geography = validateCaliforniaPrimaryGeographyCandidateV2(JSON.parse(input.geographyV2Json) as CaliforniaPrimaryGeographyCandidateV2, geographyInput);
  if (
    jointV1.packageSha256 !== "07c0935ab49783ae697ff7f7b395d16fccca00ee5f4bd688b6ac76fe677d0a2f"
    || jointV1.reviewRecordSetSha256 !== "cf7080937aae4351277c8a7314b104bc0fca6e3f66208451a3649060eab217a8"
    || geography.packageSha256 !== "daf19746a654ac9343daf434e3462bbfde31f1e3a09ec9b8f8ebc1136fd41c16"
    || geography.rowSetSha256 !== "215d3eb8156113e3830f458407651640af6e5d6fb2059654ddfabd162a9bee86"
  ) fail("parent_identity");
  for (const entry of REQUIRED_ENTRIES) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);

  const geographyByContest = new Map(geography.rows.map((row) => [row.contestId, row]));
  const records = jointV1.records.map((parent) => {
    const geographyRow = geographyByContest.get(parent.contestId) ?? fail("missing_geography_row");
    if (
      geographyRow.contestSha256 !== parent.contestSha256
      || geographyRow.seatCycleId !== parent.seatCycleId
      || geographyRow.districtCode !== parent.districtCode
      || geographyRow.cycleYear !== parent.cycleYear
      || geographyRow.parentGeographyRowSha256 !== parent.geography.parentRowSha256
      || geographyRow.formulaApplicability !== parent.formulaApplicability
      || geographyRow.evaluatorUse !== "excluded_pending_authorized_identity_historical_geography_and_top_two_review"
      || parent.evaluatorUse !== "excluded_pending_authorized_identity_geography_and_top_two_review"
    ) fail("geography_join");
    const identityCandidate = parent.identity.candidate;
    const geographyCandidate = geographyRow.compatibilityCandidate;
    const reviewCategory = identityCandidate && geographyCandidate
      ? "identity_and_geography_candidates" as const
      : !identityCandidate && geographyCandidate
        ? "geography_candidate_identity_unresolved" as const
        : identityCandidate
          ? "identity_candidate_crosswalk_review_required" as const
          : "identity_unresolved_crosswalk_review_required" as const;
    const reviewerAction = geographyCandidate
      ? identityCandidate ? "review_identity_and_geography_independently" as const : "review_geography_and_retain_identity_unresolved" as const
      : identityCandidate ? "review_identity_and_retain_geography_crosswalk_review_required" as const : "retain_identity_unresolved_and_geography_crosswalk_review_required" as const;
    const { rowSha256: parentReviewRecordSha256, geography: parentGeography, ...preserved } = parent;
    const unsigned = {
      ...preserved,
      parentReviewRecordSha256,
      geography: {
        parentRowSha256: geographyRow.rowSha256,
        parentV1RowSha256: parentGeography.parentRowSha256,
        status: geographyCandidate ? "candidate" as const : "crosswalk_review_required" as const,
        targetCd119Geoid: geographyRow.targetCd119Geoid,
        historicalCongressSession: geographyRow.historicalCongressSession,
        historicalGeoid: geographyRow.historicalGeoid,
        evidenceClass: geographyRow.evidenceClass,
        confidence: geographyRow.confidence,
        compatibilityDisposition: geographyRow.compatibilityDisposition,
        candidate: geographyCandidate,
        approved: false as const,
        planBlockCrosswalk: geographyRow.planBlockCrosswalk,
      },
      reviewCategory,
      reviewerAction,
      rationaleCodes: [reviewCategory, "parent_candidates_not_approved_by_join", "identity_and_top_two_dispositions_preserved", "all_independent_review_gates_remain_open"],
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:ca-primary-joint-review-row:v2\0", unsigned) };
  }).sort((left, right) => order(left.reviewRecordId, right.reviewRecordId));
  const count = (category: string) => records.filter((record) => record.reviewCategory === category).length;
  const current = records.filter((record) => record.cycleYear === 2026);
  if (
    records.length !== 126
    || geographyByContest.size !== 156
    || new Set(records.map((record) => record.contestId)).size !== 126
    || current.length !== 42
    || current.filter((record) => record.geography.candidate).map((record) => record.districtCode).join(",") !== "34,36,37,43"
    || current.some((record) => record.geography.planBlockCrosswalk === null)
    || records.some((record) => record.identity.approved || record.geography.approved || record.jointApproved || record.scoreEligible || record.formulaApplicability !== "confirmed_incompatible_with_party_primary_metrics")
  ) fail("record_closure");
  const summary = {
    reviewRecords: 126 as const,
    identityAndGeographyCandidates: count("identity_and_geography_candidates"),
    geographyCandidateIdentityUnresolved: count("geography_candidate_identity_unresolved"),
    identityCandidateCrosswalkReviewRequired: count("identity_candidate_crosswalk_review_required"),
    identityUnresolvedCrosswalkReviewRequired: count("identity_unresolved_crosswalk_review_required"),
    identityCandidates: records.filter((record) => record.identity.candidate).length,
    geographyCandidates: records.filter((record) => record.geography.candidate).length,
    jointApprovedRecords: 0 as const,
    scoreEligibleRecords: 0 as const,
  };
  if (canonicalJson(summary) !== canonicalJson({ reviewRecords: 126, identityAndGeographyCandidates: 80, geographyCandidateIdentityUnresolved: 8, identityCandidateCrosswalkReviewRequired: 34, identityUnresolvedCrosswalkReviewRequired: 4, identityCandidates: 114, geographyCandidates: 88, jointApprovedRecords: 0, scoreEligibleRecords: 0 })) fail("category_closure");
  const unsigned = {
    schema: CALIFORNIA_PRIMARY_JOINT_REVIEW_V2,
    version: 2 as const,
    generatedAt: "2026-08-06T21:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: jointV1.defaultUse,
    review: jointV1.review,
    parents: {
      jointV1: { sourceLockId: PARENTS[0], fileSha256: JOINT_V1_SHA, packageSha256: jointV1.packageSha256, reviewRecordSetSha256: jointV1.reviewRecordSetSha256, superseded: false as const },
      geographyV2: { sourceLockId: PARENTS[1], fileSha256: GEOGRAPHY_V2_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 },
    },
    methodology: {
      compositionOnly: true as const,
      identityAndTopTwoProjectionPreserved: true as const,
      geographyProjectionSource: PARENTS[1],
      splitRowsPromotedByThreshold: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary,
    records,
    reviewRecordSetSha256: digest("dsa-seats:ca-primary-joint-review-row-set:v2\0", records),
    decisionSupport: jointV1.decisionSupport,
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ca-primary-joint-review-package:v2\0", unsigned) };
}

export type CaliforniaPrimaryIdentityGeographyReviewPackageV2 = ReturnType<typeof assemble>;
export function buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(input: CaliforniaPrimaryJointReviewV2Input) { return assemble(input); }
export function validateCaliforniaPrimaryIdentityGeographyReviewPackageV2(value: CaliforniaPrimaryIdentityGeographyReviewPackageV2, input: CaliforniaPrimaryJointReviewV2Input) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
