import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
/* eslint-disable @typescript-eslint/no-explicit-any -- three independently validated persisted parent schemas are joined without widening their public APIs */
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";

export const CALIFORNIA_SPLIT_CROSSWALK_POLICY_DOSSIER_V1 = "california-split-crosswalk-policy-dossier-v1" as const;

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: string; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type CaliforniaSplitCrosswalkPolicyDossierInput = Readonly<{
  crosswalkJson: string;
  geographyJson: string;
  jointJson: string;
  sourceLock: { version: 1; entries: LockEntry[] };
}>;

const PARENTS = [
  {
    id: "california-2026-primary-block-crosswalk-candidate-v1",
    fileSha256: "7682fbebc52f2c86c83675ceef2c1e5fc6367d8a3a2674b47becda942ec2f044",
    packageSha256: "c4d1ace29f232c17248f2e348382c45d86f4fa9165d17dc03d47d2d108ab9cfd",
    setSha256: "969da6503a15a66c144a2d1cc88b26ad095d2f3cc103ac6daf07b9126e109cd8",
    url: "urn:dsa-seats:california-2026-primary-block-crosswalk-candidate:v1:2026-08-06",
    retainedPath: "data/metadata/california-2026-primary-block-crosswalk-candidate-v1.json",
    byteSize: 128492,
    kind: "review_candidate",
    parentIds: ["california-primary-geography-compatibility-candidate-v1", "ca-proposition-50-current-election-use-status-20260806", "ca-proposition-50-official-voter-guide-2025", "ca-ab604-official-plan-source-page-20260806", "ca-ab604-block-equivalency-extract-20260806", "census-cd119-california-block-equivalency-extract-20260806"],
  },
  {
    id: "california-primary-geography-compatibility-candidate-v2",
    fileSha256: "1c47fdba328c2930a99ce8d0dde9a33bb974433295b70d7109c462c47be76eba",
    packageSha256: "daf19746a654ac9343daf434e3462bbfde31f1e3a09ec9b8f8ebc1136fd41c16",
    setSha256: "215d3eb8156113e3830f458407651640af6e5d6fb2059654ddfabd162a9bee86",
    url: "urn:dsa-seats:california-primary-geography-compatibility-candidate:v2:2026-08-06",
    retainedPath: "data/metadata/california-primary-geography-compatibility-candidate-v2.json",
    byteSize: 278231,
    kind: "review_candidate",
    parentIds: ["california-primary-geography-compatibility-candidate-v1", "california-2026-primary-block-crosswalk-candidate-v1"],
  },
  {
    id: "california-primary-identity-geography-review-package-v2",
    fileSha256: "ec9a76edea1caf3a3704f4762ab12afb826392c05c8128a1755614453f981ab7",
    packageSha256: "1ec9bca50cfb6aee9747d804b28bd5a581a477226de8f52305e5af74453abeff",
    setSha256: "d0ce9f5d8cc96509a3b77a1d6b2a7dcbe55fcc2378b189eb5c7a6afce7b38550",
    url: "urn:dsa-seats:california-primary-identity-geography-review-package:v2:2026-08-06",
    retainedPath: "data/metadata/california-primary-identity-geography-review-package-v2.json",
    byteSize: 369996,
    kind: "review_proposal",
    parentIds: ["california-primary-identity-geography-review-package-v1", "california-primary-geography-compatibility-candidate-v2"],
  },
] as const;
const OUTPUT_LOCK = {
  id: CALIFORNIA_SPLIT_CROSSWALK_POLICY_DOSSIER_V1,
  url: "urn:dsa-seats:california-split-crosswalk-policy-dossier:v1:2026-08-06",
  retainedPath: "data/metadata/california-split-crosswalk-policy-dossier-v1.json",
  retainedStatus: "retained",
  byteSize: 95638,
  sha256: "2614f913e45e826d953f9ecc95595b2323b8e78c7db991c612c4807183b1422a",
  kind: "review_candidate",
  parentIds: PARENTS.map((parent) => parent.id),
} as const;

const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value)).digest("hex");
const order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`CA_SPLIT_CROSSWALK_POLICY_INVALID:${reason}`); };

function exactParentLock(entries: LockEntry[], parent: typeof PARENTS[number]): LockEntry {
  const matches = entries.filter((entry) => entry.id === parent.id);
  if (matches.length !== 1) fail(`source_lock:${parent.id}`);
  const entry = matches[0]!;
  if (
    entry.url !== parent.url || entry.retainedPath !== parent.retainedPath || entry.retainedStatus !== "retained"
    || entry.byteSize !== parent.byteSize || entry.sha256 !== parent.fileSha256 || entry.kind !== parent.kind
    || canonicalJson(entry.parentIds) !== canonicalJson(parent.parentIds)
  ) fail(`source_lock:${parent.id}`);
  return entry;
}

function assemble(input: CaliforniaSplitCrosswalkPolicyDossierInput) {
  if (input.sourceLock.version !== 1) fail("source_lock_version");
  const byteStreams = [input.crosswalkJson, input.geographyJson, input.jointJson];
  if (byteStreams.some((bytes, index) => sha(bytes) !== PARENTS[index]!.fileSha256)) fail("parent_bytes");
  const locks = PARENTS.map((parent) => exactParentLock(input.sourceLock.entries, parent));
  const outputMatches = input.sourceLock.entries.filter((entry) => entry.id === OUTPUT_LOCK.id);
  if (outputMatches.length !== 1 || canonicalJson(sourceLockContent(outputMatches[0])) !== canonicalJson(sourceLockContent(OUTPUT_LOCK))) fail("source_lock:output");
  const crosswalk = JSON.parse(input.crosswalkJson) as any;
  const geography = JSON.parse(input.geographyJson) as any;
  const joint = JSON.parse(input.jointJson) as any;
  if (
    crosswalk.packageSha256 !== PARENTS[0].packageSha256 || crosswalk.rowSetSha256 !== PARENTS[0].setSha256
    || geography.packageSha256 !== PARENTS[1].packageSha256 || geography.rowSetSha256 !== PARENTS[1].setSha256
    || joint.packageSha256 !== PARENTS[2].packageSha256 || joint.reviewRecordSetSha256 !== PARENTS[2].setSha256
  ) fail("parent_identity");
  const splitRows = crosswalk.rows.filter((row: any) => row.compatibilityDisposition === "crosswalk_review_required");
  const exactRows = crosswalk.rows.filter((row: any) => row.compatibilityDisposition === "exact_block_membership_candidate");
  const jointRows = joint.records.filter((row: any) => row.cycleYear === 2026 && row.geography.status === "crosswalk_review_required");
  const jointByDistrict = new Map(jointRows.map((row: any) => [row.districtCode, row]));
  if (splitRows.length !== 48 || exactRows.map((row: any) => row.districtCode).join(",") !== "34,36,37,43" || jointRows.length !== 38 || jointByDistrict.size !== 38) fail("scope_closure");
  if (geography.rows.filter((row: any) => row.cycleYear === 2026 && row.compatibilityDisposition === "crosswalk_review_required").length !== 48) fail("geography_closure");

  const rows = splitRows.map((row: any) => {
    const jointRow = jointByDistrict.get(row.districtCode) as any | undefined;
    const unsigned = {
      policyRecordId: `ca-split-policy:${row.contestId}`,
      contestId: row.contestId,
      seatCycleId: row.seatCycleId,
      districtCode: row.districtCode,
      scope: jointRow ? "current_incumbent_joint_review" as const : "statewide_geography_only" as const,
      crosswalkRowSha256: row.rowSha256,
      geographyV2RowSha256: geography.rows.find((candidate: any) => candidate.contestId === row.contestId)?.rowSha256 ?? fail("missing_geography_row"),
      jointReviewRecordSha256: jointRow?.rowSha256 ?? null,
      sourcePlanId: row.sourcePlanId,
      targetPlanId: row.targetPlanId,
      sourceBlockCount: row.sourceBlockCount,
      targetBlockCount: row.targetBlockCount,
      sameDistrictBlockCount: row.sameDistrictBlockCount,
      sourceRetentionPpm: row.sourceRetentionPpm,
      targetCoveragePpm: row.targetCoveragePpm,
      sourceToTargetSplits: row.sourceToTargetSplits,
      blockCountMeaning: row.blockCountMeaning,
      compatibilityDisposition: "crosswalk_review_required" as const,
      compatibilityCandidate: false as const,
      compatibilityApproved: false as const,
      scoreEligible: false as const,
      publicationEligible: false as const,
      deployed: false as const,
      policyResolutionRequiredBeforeRowReview: true as const,
      rowReviewRequiredAfterPolicyResolution: true as const,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:ca-split-crosswalk-policy-row:v1\0", unsigned) };
  }).sort((left: any, right: any) => order(left.contestId, right.contestId));
  const currentIncumbentJointScope = rows.filter((row: any) => row.scope === "current_incumbent_joint_review").length;
  if (currentIncumbentJointScope !== 38 || rows.length - currentIncumbentJointScope !== 10) fail("scope_partition");

  const unsigned = {
    schema: CALIFORNIA_SPLIT_CROSSWALK_POLICY_DOSSIER_V1,
    version: 1 as const,
    generatedAt: "2026-08-06T23:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    decisionId: "california-split-crosswalk-methodology-v1" as const,
    affectedComponent: "california_2026_historical_to_cd119_split_geography_relationships" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    scoreEligible: false as const,
    inputs: PARENTS.map((parent, index) => ({ sourceLockId: parent.id, fileSha256: parent.fileSha256, packageSha256: parent.packageSha256, setSha256: parent.setSha256, retainedPath: locks[index]!.retainedPath })),
    question: "Should any non-identical California AB 604-to-CD119 district relationship be eligible for row-level review under a separately specified crosswalk methodology?" as const,
    recommendedDecision: {
      choice: "retain_exact_block_membership_only_rule" as const,
      confidence: "high" as const,
      authorizesRowApproval: false as const,
      rationaleCodes: ["all_exact_block_membership_relationships_already_isolated", "split_block_counts_are_not_population_voter_or_electoral_weights", "no_crosswalk_compatibility_threshold_has_been_authorized"] as const,
      consequence: "the_forty_eight_split_relationships_remain_unavailable_for_evaluator_and_publication_use" as const,
    },
    defaultReversibleAssumption: {
      choice: "retain_exact_block_membership_only_rule" as const,
      splitRows: "remain_crosswalk_review_required" as const,
      evaluatorUse: "excluded" as const,
      publicationUse: "excluded" as const,
      blocksUnrelatedWork: false as const,
    },
    alternatives: [
      { choice: "authorize_separately_specified_crosswalk_methodology" as const, consequence: "requires_a_new_versioned_weighting_threshold_confidence_and_impact_specification_before_any_row_review" as const },
      { choice: "mark_split_historical_comparisons_unavailable_or_incompatible" as const, consequence: "closes_the_rows_without_deriving_a_geographic_relationship" as const },
    ],
    methodology: {
      evidenceOrganizationOnly: true as const,
      exactMembershipRuleChanged: false as const,
      populationWeightingUsed: false as const,
      voterWeightingUsed: false as const,
      turnoutWeightingUsed: false as const,
      partisanWeightingUsed: false as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityUsed: false as const,
      rawGeometryEqualityUsed: false as const,
      policyResolutionAutomaticallyApprovesRows: false as const,
      rowApprovalRemainsIndependent: true as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary: {
      splitRelationships: 48 as const,
      currentIncumbentJointScope: 38 as const,
      statewideGeographyOnlyScope: 10 as const,
      exactMembershipRelationshipsExcluded: 4 as const,
      policyApprovals: 0 as const,
      rowApprovals: 0 as const,
      scoreEligibleRows: 0 as const,
    },
    guardCases: {
      district12: "near_exact_block_count_does_not_establish_compatibility" as const,
      district41: "no_same_number_block_membership_does_not_select_an_alternate_target" as const,
    },
    rows,
    rowSetSha256: digest("dsa-seats:ca-split-crosswalk-policy-row-set:v1\0", rows),
    blocks: { blocksAffectedRows: true as const, blocksUnrelatedWork: false as const, doesNotResolve: ["row_level_geography_approval", "identity_approval", "california_top_two_formula", "evaluator_eligibility", "publication", "deployment"] as const },
    workCompletedWhileWaiting: ["retained_complete_official_ab604_and_cd119_block_assignments", "isolated_four_exact_and_forty_eight_split_relationships", "projected_thirty_eight_split_rows_into_the_current_incumbent_joint_queue", "kept_all_split_rows_unapproved_and_score_ineligible"] as const,
    resolution: { status: "proposed" as const, decision: null, reviewer: null, reviewedAt: null, rationale: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ca-split-crosswalk-policy-dossier:v1\0", unsigned) };
}

export type CaliforniaSplitCrosswalkPolicyDossier = ReturnType<typeof assemble>;
export function buildCaliforniaSplitCrosswalkPolicyDossier(input: CaliforniaSplitCrosswalkPolicyDossierInput) { return assemble(input); }
export function validateCaliforniaSplitCrosswalkPolicyDossier(value: CaliforniaSplitCrosswalkPolicyDossier, input: CaliforniaSplitCrosswalkPolicyDossierInput) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
