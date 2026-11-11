import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
/* eslint-disable @typescript-eslint/no-explicit-any -- immutable persisted v2 and assessment schemas are composed without widening their public types */
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateNjPaPrimaryCertificationAvailabilityAssessment } from "./nj-pa-primary-certification-availability-assessment";

export const NJ_PA_PRIMARY_JOINT_REVIEW_V3 = "nj-pa-primary-identity-geography-review-package-v3" as const;
export const NJ_PA_PRIMARY_JOINT_V3_RECORD_SET_SHA256 = "71c1dd05e24b0ca6eab339720f58b0b93c915d90ce3ddfb29c7d55b88ee0e2be";
export const NJ_PA_PRIMARY_JOINT_V3_AUTHORITY_SET_SHA256 = "cab363d2a2be192cac12fb0706bbe0fcf28537e6eee9a7951d114590c6714a92";
export const NJ_PA_PRIMARY_JOINT_V3_REVIEW_SET_SHA256 = "0c20132c804063e93e50c86ceb0f334e8ad85c4b630a4ec3365e121ef8dd6493";
export const NJ_PA_PRIMARY_JOINT_V3_PACKAGE_SHA256 = "5b83a62806ccbefe2993812f46006b0848aca983d507250b5331bcdc7c0400fb";
export const NJ_PA_PRIMARY_JOINT_V3_OUTPUT_SHA256 = "fadb205f2749aad2ef8de6984d0d8e515743fc335359f23bde7d34ebdee8a4cb";
export const NJ_PA_PRIMARY_JOINT_V3_OUTPUT_BYTES = 156_043;

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: string; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type NjPaPrimaryJointV3Input = Readonly<{ jointV2Json: string; assessmentJson: string; sourceLock: { version: 1; entries: LockEntry[] } }>;
const V2 = { id: "nj-pa-primary-identity-geography-review-package-v2", file: "ce6afdd2686d1bd03ae09f7fa6c1c7e154fc23c9bc06ac71f520ad8b1d6e568b", package: "5524a9d24519cb34a9d0e270f669eddb7a16abf17c4fc3f49dc0f6e50eae6192", rowSet: "e0f735c67ade78a9209df181e15e2ae049967083d6f5510a37952c926a658af8", reviewSet: "2aad472ad63c3319cd7ee928a93d7448024b375a9bc20c852d2c47b99add49b5" } as const;
const ASSESSMENT = { id: "nj-pa-primary-certification-availability-assessment-v1", file: "49ef2ecf530cd3f76de03c780b343d49837171dfe6e0f76acac1405b735301ef", package: "7cf437c67e4b457e110ae03cc0ef0f88afc004fb0c19a279d4646fa8a163fa4a", rowSet: "7c91368a0e77c29cc9fd593cbf1d3d27f0d4eaafba07435662222067e9c4612a" } as const;
const PARENTS = [V2.id, ASSESSMENT.id] as const;
const review = { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null };
const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value)).digest("hex");
const order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`NJ_PA_PRIMARY_JOINT_REVIEW_V3_INVALID:${reason}`); };

function exactEntry(input: NjPaPrimaryJointV3Input, expected: LockEntry): void {
  const matches = input.sourceLock.entries.filter((entry) => entry.id === expected.id), entry = matches[0];
  if (matches.length !== 1 || !entry || canonicalJson(sourceLockContent(entry)) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
}

function validateLocks(input: NjPaPrimaryJointV3Input): void {
  if (input.sourceLock.version !== 1) fail("source_lock_version");
  exactEntry(input, { id: V2.id, url: "urn:dsa-seats:nj-pa-primary-identity-geography-review-package:v2:2026-08-06", retainedPath: "data/metadata/nj-pa-primary-identity-geography-review-package-v2.json", retainedStatus: "retained", byteSize: 100_437, sha256: V2.file, kind: "review_proposal", parentIds: ["nj-pa-primary-identity-geography-review-package-v1", "nj-pa-primary-geography-compatibility-candidate-v2"] });
  exactEntry(input, { id: ASSESSMENT.id, url: "urn:dsa-seats:nj-pa-primary-certification-availability-assessment:v1:2026-08-05", retainedPath: "data/metadata/nj-pa-primary-certification-availability-assessment-v1.json", retainedStatus: "retained", byteSize: 12_114, sha256: ASSESSMENT.file, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "new-jersey-house-democratic-primary-results-2022-2026-v1", "pennsylvania-house-democratic-primary-results-2022-2024-v1", "nj-primary-post-canvass-certification-statute-20260805", "pa-election-result-authority-boundary-20260805", "pa-2024-primary-certification-announcement", "pa-2026-primary-certification-announcement"] });
  const output = input.sourceLock.entries.filter((entry) => entry.id === NJ_PA_PRIMARY_JOINT_REVIEW_V3);
  if (!NJ_PA_PRIMARY_JOINT_V3_OUTPUT_SHA256) {
    if (output.length !== 0) fail("source_lock:premature_output");
  } else {
    exactEntry(input, { id: NJ_PA_PRIMARY_JOINT_REVIEW_V3, url: "urn:dsa-seats:nj-pa-primary-identity-geography-review-package:v3:2026-08-07", retainedPath: "data/metadata/nj-pa-primary-identity-geography-review-package-v3.json", retainedStatus: "retained", byteSize: NJ_PA_PRIMARY_JOINT_V3_OUTPUT_BYTES, sha256: NJ_PA_PRIMARY_JOINT_V3_OUTPUT_SHA256, kind: "review_proposal", parentIds: [...PARENTS] });
  }
}

function assemble(input: NjPaPrimaryJointV3Input) {
  if (sha(input.jointV2Json) !== V2.file || sha(input.assessmentJson) !== ASSESSMENT.file) fail("input_bytes");
  validateLocks(input);
  const parent = JSON.parse(input.jointV2Json) as any;
  const assessment = validateNjPaPrimaryCertificationAvailabilityAssessment(JSON.parse(input.assessmentJson));
  if (parent.schema !== "nj-pa-primary-identity-geography-review-package-v2" || parent.version !== 2 || parent.packageSha256 !== V2.package || parent.rowSetSha256 !== V2.rowSet || parent.reviewRecordSetSha256 !== V2.reviewSet || parent.rows?.length !== 41 || canonicalJson(parent.review) !== canonicalJson(review) || parent.publicationEligible !== false || assessment.packageSha256 !== ASSESSMENT.package || assessment.rowSetSha256 !== ASSESSMENT.rowSet || canonicalJson(assessment.review) !== canonicalJson(review) || assessment.publicationEligible !== false) fail("parent_identity");
  const authorityByCycle = new Map<string, any>(assessment.rows.map((row) => [row.stateCycleId, row]));
  const rows = parent.rows.map((prior: any) => {
    const authority = authorityByCycle.get(`${prior.stateCode}:${prior.cycleYear}`) as any;
    if (!authority || authority.stateCode !== prior.stateCode || authority.cycleYear !== prior.cycleYear || authority.exactResultCertificationReconciled || authority.automaticApproval || authority.scoreEligible) fail("authority_join");
    const priorUnsigned = structuredClone(prior);
    delete priorUnsigned.rowSha256;
    const certificationAvailability = {
      stateCycleId: authority.stateCycleId,
      assessmentRowSha256: authority.rowSha256,
      resultReceiptSourceLockId: authority.resultReceiptSourceLockId,
      resultArtifactStatus: authority.resultArtifactStatus,
      certificationContextStatus: authority.certificationContextStatus,
      certificationContextSourceLockIds: authority.certificationContextSourceLockIds,
      exactResultBytesRetained: authority.exactResultBytesRetained,
      cycleCertificationContextRetained: authority.cycleCertificationContextRetained,
      exactResultCertificationReconciled: false as const,
      unresolvedNoRowDistrictCodes: authority.unresolvedNoRowDistrictCodes,
      authorityApproved: false as const,
      evaluatorUse: "excluded_pending_complete_state_result_and_certification_closure" as const,
      scoreEligible: false as const,
      rationaleCodes: authority.rationaleCodes,
    };
    const unsigned = { ...priorUnsigned, parentV2RowSha256: prior.rowSha256, certificationAvailability, jointApproved: false as const, evaluatorUse: prior.evaluatorUse, scoreEligible: false as const };
    return { ...unsigned, rowSha256: digest("dsa-seats:nj-pa-primary-joint-review-row:v3\0", unsigned) };
  }).sort((left: any, right: any) => order(left.linkageId, right.linkageId));
  const parentIds = parent.rows.map((row: any) => row.linkageId).sort(order), ids = rows.map((row: any) => row.linkageId);
  if (rows.length !== 41 || canonicalJson(ids) !== canonicalJson(parentIds) || new Set(ids).size !== 41 || rows.some((row: any) => row.certificationAvailability.exactResultCertificationReconciled || row.certificationAvailability.authorityApproved || row.identityApproved || row.geographyApproved || row.jointApproved || row.scoreEligible)) fail("record_closure");
  const authorityOnlyStateCycles = assessment.rows.filter((row) => !rows.some((record: any) => record.stateCode === row.stateCode && record.cycleYear === row.cycleYear)).map((row) => ({ stateCycleId: row.stateCycleId, assessmentRowSha256: row.rowSha256, resultReceiptSourceLockId: row.resultReceiptSourceLockId, resultArtifactStatus: row.resultArtifactStatus, certificationContextStatus: row.certificationContextStatus, exactResultBytesRetained: row.exactResultBytesRetained, exactResultCertificationReconciled: row.exactResultCertificationReconciled, automaticApproval: row.automaticApproval, scoreEligible: row.scoreEligible }));
  if (authorityOnlyStateCycles.length !== 1 || authorityOnlyStateCycles[0]?.stateCycleId !== "PA:2026" || authorityOnlyStateCycles[0].resultReceiptSourceLockId !== null || authorityOnlyStateCycles[0].exactResultBytesRetained || authorityOnlyStateCycles[0].exactResultCertificationReconciled) fail("assessment_only_cycle");
  const owner = parent.parentDecisionReviews[0];
  const authorityReviewUnsigned = {
    reviewOfDecisionId: "collect-official-state-primary-results-and-certification-v1" as const,
    ownerSourceLockId: owner.ownerSourceLockId,
    ownerFileSha256: owner.ownerFileSha256,
    ownerPackageSha256: owner.ownerPackageSha256,
    inherited: true as const,
    createsIndependentDecision: false as const,
    supersedesDecisionIds: [] as const,
    parentQuestion: "Should official state primary results and exact certification evidence be retained before the records are eligible for scoring?" as const,
    parentRecommendedDecision: "Retain complete official result and certification evidence without treating availability context as certification reconciliation." as const,
    parentDefaultReversibleAssumption: "retain_plan_exclude_from_evaluator_and_publication" as const,
    parentResolution: null,
    evidenceSha256s: [ASSESSMENT.package, ASSESSMENT.rowSet] as const,
    categorySet: ["both_candidates_pending_independent_reviews", "geography_candidate_identity_unresolved"] as const,
    assessmentConclusion: assessment.decisionSupport.analysisConclusion,
    proposedResolution: null,
    reviewer: null,
    reviewedAt: null,
  };
  const authorityReview = { ...authorityReviewUnsigned, reviewRecordSha256: digest("dsa-seats:nj-pa-primary-joint-review-decision:v3\0", authorityReviewUnsigned) };
  const parentDecisionReviews = [...parent.parentDecisionReviews, authorityReview];
  const summary = {
    observations: 41 as const, bothCandidatesPendingIndependentReviews: 33 as const, geographyCandidateIdentityUnresolved: 8 as const,
    exactIdentityCandidates: 18 as const, derivedIdentityCandidates: 9 as const, inferredIdentityCandidates: 6 as const, unresolvedIdentityRows: 8 as const, geographyCandidates: 41 as const, cd120PendingRows: 0 as const,
    certificationAvailabilityAttachedRecords: 41 as const, njOfficialResultCandidateRecords: 27 as const, paDepartmentExtractCandidateRecords: 14 as const, statewideCertificationContextRetainedRecords: 7 as const,
    exactResultCertificationReconciledRecords: 0 as const, stateCyclesAssessed: 6 as const, jointStateCyclesCovered: 5 as const, assessmentOnlyStateCycles: 1 as const, missingResultStateCycles: 1 as const,
    parentDecisionReviews: 3 as const, authorityApprovals: 0 as const, automaticApprovals: 0 as const, scoreEligibleRows: 0 as const,
  };
  const unsigned = {
    schema: NJ_PA_PRIMARY_JOINT_REVIEW_V3, version: 3 as const, generatedAt: "2026-08-07T06:10:00.000Z" as const, sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const, publicationEligible: false as const, defaultUse: parent.defaultUse, review,
    parents: { jointV2: { sourceLockId: V2.id, fileSha256: V2.file, packageSha256: V2.package, rowSetSha256: V2.rowSet, reviewRecordSetSha256: V2.reviewSet, superseded: false as const }, certificationAvailabilityAssessment: { sourceLockId: ASSESSMENT.id, fileSha256: ASSESSMENT.file, packageSha256: ASSESSMENT.package, rowSetSha256: ASSESSMENT.rowSet } },
    methodology: { compositionOnly: true as const, parentRowsSemanticallyPreserved: true as const, authorityJoinedByStateAndCycleOnly: true as const, availabilityIsNotCertification: true as const, exactResultCertificationReconciliationClaimed: false as const, pa2026ResultRowCreated: false as const, automaticDecisionClosure: false as const, evaluatorNumericValues: 0 as const },
    privacy: parent.privacy, summary, rows,
    reviewRecordSetSha256: digest("dsa-seats:nj-pa-primary-joint-review-row-set:v3\0", rows),
    authorityOnlyStateCycles, authorityProjectionSetSha256: digest("dsa-seats:nj-pa-primary-joint-review-authority-set:v3\0", [rows.map((row: any) => row.certificationAvailability), authorityOnlyStateCycles]),
    parentDecisionReviews, parentDecisionReviewSetSha256: digest("dsa-seats:nj-pa-primary-joint-review-decision-set:v3\0", parentDecisionReviews),
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:nj-pa-primary-joint-review-package:v3\0", unsigned) };
}

export type NjPaPrimaryIdentityGeographyReviewPackageV3 = ReturnType<typeof assemble>;
export function buildNjPaPrimaryIdentityGeographyReviewPackageV3(input: NjPaPrimaryJointV3Input) { return assemble(input); }
export function validateNjPaPrimaryIdentityGeographyReviewPackageV3(value: NjPaPrimaryIdentityGeographyReviewPackageV3, input: NjPaPrimaryJointV3Input) {
  const expected = assemble(input);
  if (canonicalJson(value) !== canonicalJson(expected) || (NJ_PA_PRIMARY_JOINT_V3_RECORD_SET_SHA256 && value.reviewRecordSetSha256 !== NJ_PA_PRIMARY_JOINT_V3_RECORD_SET_SHA256) || (NJ_PA_PRIMARY_JOINT_V3_AUTHORITY_SET_SHA256 && value.authorityProjectionSetSha256 !== NJ_PA_PRIMARY_JOINT_V3_AUTHORITY_SET_SHA256) || (NJ_PA_PRIMARY_JOINT_V3_REVIEW_SET_SHA256 && value.parentDecisionReviewSetSha256 !== NJ_PA_PRIMARY_JOINT_V3_REVIEW_SET_SHA256) || (NJ_PA_PRIMARY_JOINT_V3_PACKAGE_SHA256 && value.packageSha256 !== NJ_PA_PRIMARY_JOINT_V3_PACKAGE_SHA256)) fail("semantic_or_hash_drift");
  return value;
}
