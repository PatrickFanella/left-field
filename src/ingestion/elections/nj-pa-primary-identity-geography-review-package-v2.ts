import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  validateNjPaPrimaryGeographyCompatibilityCandidateV2,
  type NjPaPrimaryGeographyCompatibilityCandidateV2,
  type NjPaPrimaryGeographyV2Input,
} from "./nj-pa-primary-geography-compatibility-candidate-v2";
import { validateNjPaPrimaryIdentityGeographyReviewPackage } from "./nj-pa-primary-identity-geography-review-package";

export const NJ_PA_PRIMARY_JOINT_REVIEW_V2 = "nj-pa-primary-identity-geography-review-package-v2" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type NjPaPrimaryJointReviewV2Input = NjPaPrimaryGeographyV2Input & Readonly<{ jointV1Json: string; geographyV2Json: string }>;

const JOINT_V1_SHA = "78ef074c54a36b2a62af851d210212b3b03f0e2d4b8c4950c7999ffd5598dd46";
const GEOGRAPHY_V2_SHA = "50ca543dcf9ff39cbb712ad19246d7bc3154da2c593b3cf4ff106468ed84f083";
const PARENTS = ["nj-pa-primary-identity-geography-review-package-v1", "nj-pa-primary-geography-compatibility-candidate-v2"] as const;
const REQUIRED_ENTRIES: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:nj-pa-primary-identity-geography-review-package:v1:2026-08-05", retainedPath: "data/metadata/nj-pa-primary-identity-geography-review-package-v1.json", retainedStatus: "retained", byteSize: 68839, sha256: JOINT_V1_SHA, kind: "review_proposal", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "current-incumbent-primary-candidate-linkage-candidate-v1", "nj-pa-primary-geography-compatibility-candidate-v1"] },
  { id: PARENTS[1], url: "urn:dsa-seats:nj-pa-primary-geography-compatibility-candidate:v2:2026-08-06", retainedPath: "data/metadata/nj-pa-primary-geography-compatibility-candidate-v2.json", retainedStatus: "retained", byteSize: 61612, sha256: GEOGRAPHY_V2_SHA, kind: "review_candidate", parentIds: ["nj-pa-primary-geography-compatibility-candidate-v1", "new-jersey-2026-congressional-plan-authority-receipt-v1"] },
];
const OUTPUT_ENTRY: LockEntry = { id: NJ_PA_PRIMARY_JOINT_REVIEW_V2, url: "urn:dsa-seats:nj-pa-primary-identity-geography-review-package:v2:2026-08-06", retainedPath: "data/metadata/nj-pa-primary-identity-geography-review-package-v2.json", retainedStatus: "retained", byteSize: 100437, sha256: "ce6afdd2686d1bd03ae09f7fa6c1c7e154fc23c9bc06ac71f520ad8b1d6e568b", kind: "review_proposal", parentIds: [...PARENTS] };

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`NJ_PA_PRIMARY_JOINT_REVIEW_V2_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function assemble(input: NjPaPrimaryJointReviewV2Input) {
  if (input.sourceLock.version !== 1 || sha(input.jointV1Json) !== JOINT_V1_SHA || sha(input.geographyV2Json) !== GEOGRAPHY_V2_SHA) fail("input_bytes");
  const joint = validateNjPaPrimaryIdentityGeographyReviewPackage(JSON.parse(input.jointV1Json));
  const geographyInput: NjPaPrimaryGeographyV2Input = {
    geographyV1Json: input.geographyV1Json,
    authorityReceiptJson: input.authorityReceiptJson,
    publicationsBytes: input.publicationsBytes,
    mapBytes: input.mapBytes,
    mapTextBytes: input.mapTextBytes,
    statuteBytes: input.statuteBytes,
    componentsBytes: input.componentsBytes,
    componentsTextBytes: input.componentsTextBytes,
    currentBlocksBytes: input.currentBlocksBytes,
    sourceLock: input.sourceLock,
  };
  const geography = validateNjPaPrimaryGeographyCompatibilityCandidateV2(JSON.parse(input.geographyV2Json) as NjPaPrimaryGeographyCompatibilityCandidateV2, geographyInput);
  if (
    joint.packageSha256 !== "63f3e0fa2e5514a5a91c10e75c641e81cc7b765ae71258480b2e1969c24f3666"
    || joint.rowSetSha256 !== "17d99573a6cc298dae70de7fe878847266dbeb5a5fbca549d6436e522ef7ccf8"
    || joint.reviewRecordSetSha256 !== "855d5ad49098dffe0405781cd963c6055d95d3868b1cfcdcaac528aa133b11a3"
    || geography.packageSha256 !== "cabffbdea11fddf17d4f63fc57f4d9c89cb9eaa202fceb2b5da6c92d841ecb5b"
    || geography.rowSetSha256 !== "c69cfe00727b4c69c60f4331069346467d015eb69f45b495480790b064facc45"
  ) fail("parent_identity");
  for (const entry of REQUIRED_ENTRIES) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);

  const geographyById = new Map(geography.rows.map((row) => [row.linkageId, row]));
  const rows = joint.rows.map((parent) => {
    const geographyRow = geographyById.get(parent.linkageId) ?? fail("missing_geography_row");
    if (
      geographyRow.contestSha256 !== parent.contestSha256
      || geographyRow.seatCycleId !== parent.seatCycleId
      || geographyRow.stateCode !== parent.stateCode
      || geographyRow.districtCode !== parent.districtCode
      || geographyRow.cycleYear !== parent.cycleYear
      || geographyRow.parentGeographyRowSha256 !== parent.geography.parentRowSha256
    ) fail("geography_join");
    const identityCandidate = parent.identity.relationshipDisposition === "proposed_identity_link_pending_documented_review";
    const jointCategory = identityCandidate
      ? "both_candidates_pending_independent_reviews" as const
      : "geography_candidate_identity_unresolved" as const;
    const recommendedAction = identityCandidate
      ? "review_identity_and_geography_under_existing_decisions" as const
      : "review_geography_retain_identity_unresolved" as const;
    const rationaleCode = identityCandidate
      ? "IDENTITY_CANDIDATE_AND_GEOGRAPHY_CANDIDATE_REQUIRE_SEPARATE_APPROVALS" as const
      : "GEOGRAPHY_CANDIDATE_PRESENT_NO_UNIQUE_IDENTITY_CANDIDATE" as const;
    const { rowSha256: parentReviewRowSha256, geography: parentGeography, ...preserved } = parent;
    const unsigned = {
      ...preserved,
      parentReviewRowSha256,
      geography: {
        compatibilityDisposition: geographyRow.compatibilityDisposition,
        evidenceClass: geographyRow.evidenceClass,
        confidence: geographyRow.confidence,
        compatibilityCandidate: geographyRow.compatibilityCandidate,
        targetCd119Geoid: geographyRow.targetCd119Geoid,
        historicalCongressSession: geographyRow.historicalCongressSession,
        historicalGeoid: geographyRow.historicalGeoid,
        rationaleCodes: geographyRow.rationaleCodes,
        planContinuityEvidence: geographyRow.planContinuityEvidence,
        parentRowSha256: geographyRow.rowSha256,
        parentV1GeographyRowSha256: parentGeography.parentRowSha256,
      },
      jointCategory,
      recommendedAction,
      rationaleCode,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:nj-pa-primary-joint-review-row:v2\0", unsigned) };
  }).sort((left, right) => order(left.linkageId, right.linkageId));
  if (geographyById.size !== rows.length || new Set(rows.map((row) => row.linkageId)).size !== 41) fail("row_set_join");

  const current = rows.filter((row) => row.cycleYear === 2026);
  if (
    rows.length !== 41
    || current.length !== 9
    || current.map((row) => row.districtCode).join(",") !== "01,03,05,06,08,09,10,11,12"
    || current.some((row) => row.stateCode !== "NJ" || row.geography.historicalCongressSession !== "120" || row.geography.historicalGeoid !== null || !row.geography.compatibilityCandidate || row.geography.planContinuityEvidence === null || row.geography.planContinuityEvidence.componentsReportUsedAsMembershipEvidence)
    || rows.filter((row) => row.cycleYear !== 2026).some((row) => row.geography.planContinuityEvidence !== null)
    || rows.some((row) => !row.geography.compatibilityCandidate || row.identityApproved || row.geographyApproved || row.jointApproved || row.scoreEligible)
  ) fail("row_closure");

  const categorySet = [...new Set(rows.map((row) => row.jointCategory))].sort(order);
  const categorySetSha256 = digest("dsa-seats:nj-pa-primary-joint-review-category-set:v2\0", categorySet);
  const parentDecisionReviews = joint.parentDecisionReviews.map((parent) => {
    const { reviewRecordSha256: parentReviewRecordSha256, ...preserved } = parent;
    const geographyDecision = parent.reviewOfDecisionId === "approve-historical-district-cd119-compatibility-v1";
    const unsigned = {
      ...preserved,
      parentReviewRecordSha256,
      evidenceSha256s: geographyDecision
        ? [parent.evidenceSha256s[0]!, geography.packageSha256, geography.rowSetSha256, categorySetSha256]
        : [parent.evidenceSha256s[0]!, parent.evidenceSha256s[1]!, parent.evidenceSha256s[2]!, categorySetSha256],
      categorySet,
    };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:nj-pa-primary-parent-decision-review:v2\0", unsigned) };
  }).sort((left, right) => order(left.reviewOfDecisionId, right.reviewOfDecisionId));
  if (parentDecisionReviews.some((review) => review.parentResolution !== null || review.proposedResolution !== null || review.reviewer !== null || review.reviewedAt !== null || !review.inherited || review.createsIndependentDecision)) fail("decision_closure");

  const count = (category: string) => rows.filter((row) => row.jointCategory === category).length;
  const summary = {
    observations: 41 as const,
    bothCandidatesPendingIndependentReviews: count("both_candidates_pending_independent_reviews"),
    geographyCandidateIdentityUnresolved: count("geography_candidate_identity_unresolved"),
    exactIdentityCandidates: rows.filter((row) => row.identity.evidenceClass === "exact_name_observation").length,
    derivedIdentityCandidates: rows.filter((row) => row.identity.evidenceClass === "derived_name_relationship").length,
    inferredIdentityCandidates: rows.filter((row) => row.identity.evidenceClass === "inferred_name_relationship").length,
    unresolvedIdentityRows: rows.filter((row) => row.identity.evidenceClass === "unresolved").length,
    geographyCandidates: rows.filter((row) => row.geography.compatibilityCandidate).length,
    cd120PendingRows: rows.filter((row) => row.geography.confidence === "none").length,
    parentDecisionReviews: 2 as const,
    automaticApprovals: 0 as const,
    scoreEligibleRows: 0 as const,
  };
  if (canonicalJson(summary) !== canonicalJson({ observations: 41, bothCandidatesPendingIndependentReviews: 33, geographyCandidateIdentityUnresolved: 8, exactIdentityCandidates: 18, derivedIdentityCandidates: 9, inferredIdentityCandidates: 6, unresolvedIdentityRows: 8, geographyCandidates: 41, cd120PendingRows: 0, parentDecisionReviews: 2, automaticApprovals: 0, scoreEligibleRows: 0 })) fail("category_closure");

  const unsigned = {
    schema: NJ_PA_PRIMARY_JOINT_REVIEW_V2,
    version: 2 as const,
    generatedAt: "2026-08-06T23:15:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: joint.defaultUse,
    review: joint.review,
    parents: {
      jointV1: { sourceLockId: PARENTS[0], fileSha256: JOINT_V1_SHA, packageSha256: joint.packageSha256, rowSetSha256: joint.rowSetSha256, reviewRecordSetSha256: joint.reviewRecordSetSha256, superseded: false as const },
      geographyV2: { sourceLockId: PARENTS[1], fileSha256: GEOGRAPHY_V2_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 },
    },
    methodology: {
      compositionOnly: true as const,
      identityProjectionPreserved: true as const,
      geographyProjectionSource: PARENTS[1],
      nj2026Treatment: "retain_nine_explicit_state_plan_continuity_candidates_with_cd120_geoid_null" as const,
      componentsReportUsedAsMembershipEvidence: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    privacy: joint.privacy,
    summary,
    rows,
    rowSetSha256: digest("dsa-seats:nj-pa-primary-joint-review-row-set:v2\0", rows),
    parentDecisionReviews,
    reviewRecordSetSha256: digest("dsa-seats:nj-pa-primary-parent-decision-review-set:v2\0", parentDecisionReviews),
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:nj-pa-primary-joint-review-package:v2\0", unsigned) };
}

export type NjPaPrimaryIdentityGeographyReviewPackageV2 = ReturnType<typeof assemble>;
export function buildNjPaPrimaryIdentityGeographyReviewPackageV2(input: NjPaPrimaryJointReviewV2Input) { return assemble(input); }
export function validateNjPaPrimaryIdentityGeographyReviewPackageV2(value: NjPaPrimaryIdentityGeographyReviewPackageV2, input: NjPaPrimaryJointReviewV2Input) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
