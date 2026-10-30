import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateNewJersey2026CongressionalPlanAuthorityReceipt, type NewJersey2026PlanAuthorityInput, type NewJersey2026CongressionalPlanAuthorityReceipt } from "./new-jersey-2026-congressional-plan-authority";
import { validateNjPaPrimaryGeographyCompatibilityCandidate } from "./nj-pa-primary-geography-compatibility-candidate";

export const NJ_PA_PRIMARY_GEOGRAPHY_V2 = "nj-pa-primary-geography-compatibility-candidate-v2" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type NjPaPrimaryGeographyV2Input = NewJersey2026PlanAuthorityInput & Readonly<{ geographyV1Json: string; authorityReceiptJson: string }>;
const GEOGRAPHY_V1_SHA = "e4f5594d073524b13bfd0e950cb897fdfae60f866489712b7a3c000efc81f9cf";
const AUTHORITY_RECEIPT_SHA = "8d9256e823b9ad0157dcfc7c1f47f3b45c557f50069a82fe063ae4b0704541da";
const PARENTS = ["nj-pa-primary-geography-compatibility-candidate-v1", "new-jersey-2026-congressional-plan-authority-receipt-v1"] as const;
const REQUIRED: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:nj-pa-primary-geography-compatibility-candidate:v1:2026-08-05", retainedPath: "data/metadata/nj-pa-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: 47544, sha256: GEOGRAPHY_V1_SHA, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "current-incumbent-primary-candidate-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-34", "tiger-cd118-42", "tiger-cd119-34", "tiger-cd119-42"] },
  { id: PARENTS[1], url: "urn:dsa-seats:new-jersey-2026-congressional-plan-authority-receipt:v1:2026-08-06", retainedPath: "data/metadata/new-jersey-2026-congressional-plan-authority-receipt-v1.json", retainedStatus: "retained", byteSize: 4294, sha256: AUTHORITY_RECEIPT_SHA, kind: "evidence_receipt", parentIds: ["nj-division-elections-current-publications-20260806", "nj-congressional-districts-2022-2031-map", "nj-congressional-districts-2022-2031-map-text", "nj-njsa-19-46-12-current-statute-20260806", "nj-congressional-2022-plan-components-report", "nj-congressional-2022-plan-components-report-text", "census-cd119-new-jersey-block-equivalency-extract-20260806"] },
];
const OUTPUT_ENTRY: LockEntry = { id: NJ_PA_PRIMARY_GEOGRAPHY_V2, url: "urn:dsa-seats:nj-pa-primary-geography-compatibility-candidate:v2:2026-08-06", retainedPath: "data/metadata/nj-pa-primary-geography-compatibility-candidate-v2.json", retainedStatus: "retained", byteSize: 61612, sha256: "50ca543dcf9ff39cbb712ad19246d7bc3154da2c593b3cf4ff106468ed84f083", kind: "review_candidate", parentIds: [...PARENTS] };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`NJ_PA_PRIMARY_GEOGRAPHY_V2_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function assemble(input: NjPaPrimaryGeographyV2Input) {
  if (input.sourceLock.version !== 1 || sha(input.geographyV1Json) !== GEOGRAPHY_V1_SHA || sha(input.authorityReceiptJson) !== AUTHORITY_RECEIPT_SHA) fail("input_bytes");
  const geography = validateNjPaPrimaryGeographyCompatibilityCandidate(JSON.parse(input.geographyV1Json));
  const receipt = validateNewJersey2026CongressionalPlanAuthorityReceipt(JSON.parse(input.authorityReceiptJson) as NewJersey2026CongressionalPlanAuthorityReceipt, input);
  if (geography.packageSha256 !== "cb662d10fcec1726518ac4329b16e2110ed4776d047b6b838421deb633f62a52" || geography.rowSetSha256 !== "727b279d2ab5318bf79ea094ec8b47fc90073181c82049d90bcd12c16f7239a5" || receipt.packageSha256 !== "8bc2c27ba242db9161dc50deae74cf57436a75684f9dbe63ef9da03b09712327") fail("parent_identity");
  for (const entry of REQUIRED) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);
  const rows = geography.rows.map((parent) => {
    const currentNj = parent.stateCode === "NJ" && parent.cycleYear === 2026;
    if (parent.cycleYear === 2026 && !currentNj) fail("unexpected_2026_state");
    const { rowSha256: parentGeographyRowSha256, ...preserved } = parent;
    const unsigned = {
      ...preserved,
      compatibilityDisposition: currentNj ? "explicit_2022_2031_state_election_plan_continuity_candidate" as const : parent.compatibilityDisposition,
      evidenceClass: currentNj ? "direct_current_state_plan_continuity_and_complete_cd119_block_membership" as const : parent.evidenceClass,
      confidence: currentNj ? "high" as const : parent.confidence,
      compatibilityCandidate: currentNj ? true : parent.compatibilityCandidate,
      rationaleCodes: currentNj ? ["current_division_publication_names_2022_2031_plan", "njsa_19_46_12_requires_continuing_use_absent_invalidation", "complete_cd119_new_jersey_block_inventory_retained", "census_cd120_product_not_claimed", "candidate_not_approved"] : parent.rationaleCodes,
      parentGeographyRowSha256,
      planContinuityEvidence: currentNj ? {
        sourceLockId: PARENTS[1],
        fileSha256: AUTHORITY_RECEIPT_SHA,
        packageSha256: receipt.packageSha256,
        currentPlanLabel: receipt.authority.currentPlanLabel,
        adoptedOn: receipt.authority.adoptedOn,
        continuityStatute: receipt.authority.continuityStatute,
        stateFips: receipt.blockInventory.stateFips,
        uniqueBlocks: receipt.blockInventory.uniqueBlocks,
        districtInventory: receipt.blockInventory.districts,
        assignmentSetSha256: receipt.blockInventory.assignmentSetSha256,
        componentsReportUsedAsMembershipEvidence: receipt.planComponentsAssessment.useAsAdoptedMembershipEvidence,
        courtInvalidationAssessment: receipt.methodology.courtInvalidationAssessment,
      } : null,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:nj-pa-primary-geography-row:v2\0", unsigned) };
  }).sort((left, right) => order(left.linkageId, right.linkageId));
  const current = rows.filter((row) => row.cycleYear === 2026);
  if (
    rows.length !== 41
    || current.length !== 9
    || current.map((row) => row.districtCode).join(",") !== "01,03,05,06,08,09,10,11,12"
    || current.some((row) => row.stateCode !== "NJ" || row.historicalCongressSession !== "120" || row.historicalGeoid !== null || !row.compatibilityCandidate || row.planContinuityEvidence === null)
    || rows.filter((row) => row.cycleYear !== 2026).some((row) => !row.compatibilityCandidate || row.planContinuityEvidence !== null)
    || rows.some((row) => row.compatibilityApproved || row.identityApproved || row.scoreEligible)
  ) fail("row_closure");
  const unsigned = {
    schema: NJ_PA_PRIMARY_GEOGRAPHY_V2,
    version: 2 as const,
    generatedAt: "2026-08-06T22:30:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: geography.defaultUse,
    review: geography.review,
    parents: {
      geographyV1: { sourceLockId: PARENTS[0], fileSha256: GEOGRAPHY_V1_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256, superseded: false as const },
      newJersey2026Authority: { sourceLockId: PARENTS[1], fileSha256: AUTHORITY_RECEIPT_SHA, packageSha256: receipt.packageSha256 },
    },
    methodology: {
      compositionOnly: true as const,
      nj2026Treatment: "explicit_current_2022_2031_state_plan_continuity_candidate" as const,
      historicalGeoidForCd120: "remain_null_without_census_cd120_product" as const,
      componentsReportUsedAsMembershipEvidence: false as const,
      rawGeometryEqualityAssessed: false as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityAloneUsed: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary: { seatCycleObservations: 41 as const, inheritedCandidates: 32 as const, nj2026StatePlanContinuityCandidates: 9 as const, compatibilityCandidates: 41 as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const },
    rows,
    rowSetSha256: digest("dsa-seats:nj-pa-primary-geography-row-set:v2\0", rows),
    decisionSupport: { informsDecisionId: geography.decisionSupport.informsDecisionId, status: "proposed" as const, recommendedResolution: "accept_thirty_two_inherited_and_nine_explicit_new_jersey_state_plan_continuity_candidates" as const, defaultAssumption: "exclude_all_rows_until_authorized_identity_and_geography_review" as const, reviewerResolution: null, reviewer: null, reviewedAt: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:nj-pa-primary-geography-candidate:v2\0", unsigned) };
}

export type NjPaPrimaryGeographyCompatibilityCandidateV2 = ReturnType<typeof assemble>;
export function buildNjPaPrimaryGeographyCompatibilityCandidateV2(input: NjPaPrimaryGeographyV2Input) { return assemble(input); }
export function validateNjPaPrimaryGeographyCompatibilityCandidateV2(value: NjPaPrimaryGeographyCompatibilityCandidateV2, input: NjPaPrimaryGeographyV2Input) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
