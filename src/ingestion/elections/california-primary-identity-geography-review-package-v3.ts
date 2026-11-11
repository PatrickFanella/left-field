import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
/* eslint-disable @typescript-eslint/no-explicit-any -- two independently validated persisted parent schemas are composed without widening their public APIs */
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateCaliforniaPrimaryIdentityGeographyReviewPackageV2, type CaliforniaPrimaryJointReviewV2Input } from "./california-primary-identity-geography-review-package-v2";
import { validateCaliforniaSplitCrosswalkPolicyDossier } from "./california-split-crosswalk-policy-dossier";

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type CaliforniaPrimaryJointReviewV3Input = CaliforniaPrimaryJointReviewV2Input & Readonly<{ jointV2Json: string; policyDossierJson: string }>;

const FILES = {
  jointV2: "ec9a76edea1caf3a3704f4762ab12afb826392c05c8128a1755614453f981ab7",
  dossier: "2614f913e45e826d953f9ecc95595b2323b8e78c7db991c612c4807183b1422a",
} as const;
const PACKAGES = {
  jointV2: "1ec9bca50cfb6aee9747d804b28bd5a581a477226de8f52305e5af74453abeff",
  jointV2Rows: "d0ce9f5d8cc96509a3b77a1d6b2a7dcbe55fcc2378b189eb5c7a6afce7b38550",
  dossier: "3b0995a1378dc3fb5ab96612c31df8a39610ec07a667b38ba9bdc5ed5166da3a",
  dossierRows: "be90cf2fdcc573e7406f2892450a8165ffc20d0c3744c50a6af64cde3e9b1027",
} as const;
const OUTPUT = {
  file: "8e26f36a1a845061a7c3b7783e79aa85100cf3599b4373d753ef26df93667de1",
  bytes: 468576,
  package: "9350724227b439989b0db365ab63f28dad2f0446d32da5c07ae68d3d250185eb",
  records: "bdfa3b5b879e0245260b88ffcaea0da4d8658884c40a097393910c637f69e940",
  policy: "e7d6b9c638e84fd177be0ab23a463ea70f22f9bbd4a482f99fafe05d21e39589",
  decisions: "d113a0db58480276232fe2541d42b2e8727bf4bffc758af4ca7e334b2f2ce597",
} as const;
const parents: LockEntry[] = [
  { id: "california-primary-identity-geography-review-package-v2", url: "urn:dsa-seats:california-primary-identity-geography-review-package:v2:2026-08-06", retainedPath: "data/metadata/california-primary-identity-geography-review-package-v2.json", retainedStatus: "retained", byteSize: 369996, sha256: FILES.jointV2, kind: "review_proposal", parentIds: ["california-primary-identity-geography-review-package-v1", "california-primary-geography-compatibility-candidate-v2"] },
  { id: "california-split-crosswalk-policy-dossier-v1", url: "urn:dsa-seats:california-split-crosswalk-policy-dossier:v1:2026-08-06", retainedPath: "data/metadata/california-split-crosswalk-policy-dossier-v1.json", retainedStatus: "retained", byteSize: 95638, sha256: FILES.dossier, kind: "review_candidate", parentIds: ["california-2026-primary-block-crosswalk-candidate-v1", "california-primary-geography-compatibility-candidate-v2", "california-primary-identity-geography-review-package-v2"] },
];
const output: LockEntry = { id: "california-primary-identity-geography-review-package-v3", url: "urn:dsa-seats:california-primary-identity-geography-review-package:v3:2026-08-07", retainedPath: "data/metadata/california-primary-identity-geography-review-package-v3.json", retainedStatus: "retained", byteSize: OUTPUT.bytes, sha256: OUTPUT.file, kind: "review_proposal", parentIds: parents.map((parent) => parent.id) };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`CA_PRIMARY_JOINT_REVIEW_V3_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function assemble(input: CaliforniaPrimaryJointReviewV3Input) {
  if (input.sourceLock.version !== 1 || sha(input.jointV2Json) !== FILES.jointV2 || sha(input.policyDossierJson) !== FILES.dossier) fail("parent_bytes");
  const jointV2 = validateCaliforniaPrimaryIdentityGeographyReviewPackageV2(JSON.parse(input.jointV2Json), input);
  const dossier = validateCaliforniaSplitCrosswalkPolicyDossier(JSON.parse(input.policyDossierJson), { crosswalkJson: input.crosswalkJson, geographyJson: input.geographyV2Json, jointJson: input.jointV2Json, sourceLock: input.sourceLock });
  if (jointV2.packageSha256 !== PACKAGES.jointV2 || jointV2.reviewRecordSetSha256 !== PACKAGES.jointV2Rows || dossier.packageSha256 !== PACKAGES.dossier || dossier.rowSetSha256 !== PACKAGES.dossierRows) fail("parent_identity");
  for (const parent of parents) exactEntry(input.sourceLock.entries, parent);
  exactEntry(input.sourceLock.entries, output);

  const currentPolicyRows = dossier.rows.filter((row: any) => row.scope === "current_incumbent_joint_review");
  const policyByContest = new Map(currentPolicyRows.map((row: any) => [row.contestId, row]));
  if (currentPolicyRows.length !== 38 || policyByContest.size !== 38 || dossier.rows.filter((row: any) => row.scope === "statewide_geography_only").length !== 10) fail("policy_scope");
  const records = jointV2.records.map((parent: any) => {
    const policy = policyByContest.get(parent.contestId) as any | undefined;
    if (policy && (parent.cycleYear !== 2026 || parent.geography.status !== "crosswalk_review_required" || policy.jointReviewRecordSha256 !== parent.rowSha256 || policy.seatCycleId !== parent.seatCycleId || policy.districtCode !== parent.districtCode)) fail("policy_join");
    const { rowSha256: parentV2ReviewRecordSha256, ...preserved } = parent;
    const splitPolicyEvidence = policy ? {
      dossierSourceLockId: parents[1]!.id,
      dossierFileSha256: FILES.dossier,
      dossierPackageSha256: dossier.packageSha256,
      dossierRowSetSha256: dossier.rowSetSha256,
      policyRecordId: policy.policyRecordId,
      parentPolicyRowSha256: policy.rowSha256,
      jointReviewRecordSha256: policy.jointReviewRecordSha256,
      sourcePlanId: policy.sourcePlanId,
      targetPlanId: policy.targetPlanId,
      sourceBlockCount: policy.sourceBlockCount,
      targetBlockCount: policy.targetBlockCount,
      sameDistrictBlockCount: policy.sameDistrictBlockCount,
      sourceRetentionPpm: policy.sourceRetentionPpm,
      targetCoveragePpm: policy.targetCoveragePpm,
      sourceToTargetSplits: policy.sourceToTargetSplits,
      blockCountMeaning: policy.blockCountMeaning,
      compatibilityDisposition: policy.compatibilityDisposition,
      compatibilityCandidate: false as const,
      compatibilityApproved: false as const,
      policyResolutionRequiredBeforeRowReview: true as const,
      rowReviewRequiredAfterPolicyResolution: true as const,
      scoreEligible: false as const,
      publicationEligible: false as const,
      deployed: false as const,
    } : null;
    const unsigned = { ...preserved, parentV2ReviewRecordSha256, splitPolicyEvidence };
    return { ...unsigned, rowSha256: digest("dsa-seats:ca-primary-joint-review-row:v3\0", unsigned) };
  });
  const attached = records.filter((record: any) => record.splitPolicyEvidence !== null);
  const exact2026 = records.filter((record: any) => record.cycleYear === 2026 && record.geography.candidate).map((record: any) => record.districtCode);
  if (records.length !== 126 || new Set(records.map((record: any) => record.reviewRecordId)).size !== 126 || attached.length !== 38 || new Set(attached.map((record: any) => record.splitPolicyEvidence.parentPolicyRowSha256)).size !== 38 || canonicalJson(exact2026) !== canonicalJson(["34", "36", "37", "43"]) || records.some((record: any) => record.identity.approved || record.geography.approved || record.jointApproved || record.scoreEligible || record.formulaApplicability !== "confirmed_incompatible_with_party_primary_metrics")) fail("record_closure");

  const policyDecisionUnsigned = {
    decisionId: dossier.decisionId,
    inherited: true as const,
    createsIndependentDecision: false as const,
    question: dossier.question,
    recommendedDecision: dossier.recommendedDecision,
    defaultReversibleAssumption: dossier.defaultReversibleAssumption,
    alternatives: dossier.alternatives,
    methodology: dossier.methodology,
    blocks: dossier.blocks,
    resolution: dossier.resolution,
    evidenceReviewRecordIds: attached.map((record: any) => record.reviewRecordId),
  };
  const policyDecision = { ...policyDecisionUnsigned, decisionReviewSha256: digest("dsa-seats:ca-primary-joint-review-decision:v3\0", policyDecisionUnsigned) };
  const summary = {
    ...jointV2.summary,
    splitPolicyEvidenceAttachedRecords: 38 as const,
    splitPolicyRowsAssessed: 48 as const,
    currentIncumbentJointPolicyRows: 38 as const,
    statewideGeographyOnlyPolicyRows: 10 as const,
    exactMembershipRelationshipsExcludedFromPolicy: 4 as const,
    policyDecisions: 1 as const,
    policyResolutions: 0 as const,
    policyApprovals: 0 as const,
    rowApprovals: 0 as const,
    automaticApprovals: 0 as const,
    publicationEligibleRecords: 0 as const,
  };
  const unsigned = {
    schema: "california-primary-identity-geography-review-package-v3" as const,
    version: 3 as const,
    generatedAt: "2026-08-07T07:15:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: jointV2.defaultUse,
    review: jointV2.review,
    sources: (parents).map(sourceLockContent),
    methodology: {
      compositionOnly: true as const,
      allJointV2FieldsPreserved: true as const,
      policyJoinKey: "contest_id_seat_cycle_id_district_code_and_joint_row_hash" as const,
      statewideGeographyOnlyRowsCreateJointRecords: false as const,
      exactMembershipRuleChanged: false as const,
      policyResolutionAutomaticallyApprovesRows: false as const,
      populationVoterTurnoutPartisanOrThresholdWeightingUsed: false as const,
      districtNumberContinuityUsed: false as const,
      rawGeometryEqualityUsed: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary,
    records,
    inheritedDecisionSupport: jointV2.decisionSupport,
    policyDecision,
  };
  return {
    ...unsigned,
    reviewRecordSetSha256: digest("dsa-seats:ca-primary-joint-review-row-set:v3\0", records.map((record: any) => ({ reviewRecordId: record.reviewRecordId, rowSha256: record.rowSha256 }))),
    splitPolicyProjectionSetSha256: digest("dsa-seats:ca-primary-joint-review-policy-projection-set:v3\0", attached.map((record: any) => ({ reviewRecordId: record.reviewRecordId, splitPolicyEvidence: record.splitPolicyEvidence }))),
    decisionReviewSetSha256: digest("dsa-seats:ca-primary-joint-review-decision-set:v3\0", [{ decisionId: policyDecision.decisionId, decisionReviewSha256: policyDecision.decisionReviewSha256 }]),
    packageSha256: digest("dsa-seats:ca-primary-joint-review-package:v3\0", unsigned),
  };
}

export type CaliforniaPrimaryIdentityGeographyReviewPackageV3 = ReturnType<typeof assemble>;
export function buildCaliforniaPrimaryIdentityGeographyReviewPackageV3(input: CaliforniaPrimaryJointReviewV3Input) { return assemble(input); }
export function validateCaliforniaPrimaryIdentityGeographyReviewPackageV3(value: CaliforniaPrimaryIdentityGeographyReviewPackageV3, input: CaliforniaPrimaryJointReviewV3Input) {
  if (value.packageSha256 !== OUTPUT.package || value.reviewRecordSetSha256 !== OUTPUT.records || value.splitPolicyProjectionSetSha256 !== OUTPUT.policy || value.decisionReviewSetSha256 !== OUTPUT.decisions) fail("immutable_output_hashes");
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
