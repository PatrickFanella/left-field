import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateTexas2026PrimaryBlockCrosswalkCandidate, type Texas2026PrimaryBlockCrosswalkCandidate, type Texas2026PrimaryBlockCrosswalkInput } from "./texas-2026-primary-block-crosswalk-candidate";
import { validateTexasPrimaryGeographyCandidate } from "./texas-primary-geography-compatibility-candidate";

export const TEXAS_PRIMARY_GEOGRAPHY_V2 = "texas-primary-geography-compatibility-candidate-v2" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type TexasPrimaryGeographyV2Input = Omit<Texas2026PrimaryBlockCrosswalkInput, "geographyJson"> & Readonly<{ geographyV1Json: string; crosswalkJson: string }>;
const GEOGRAPHY_SHA = "66ee61783980ebca966a6d9c70abba9cc2d2616ae91129870d3d398a90026ed8", CROSSWALK_SHA = "801184e7330ffa1db233d9699e2b4bb308fc0fa941cc8aba0df800ec542794d5";
const PARENTS = ["texas-primary-geography-compatibility-candidate-v1", "texas-2026-primary-block-crosswalk-candidate-v1"] as const;
const OUTPUT_ENTRY: LockEntry = { id: TEXAS_PRIMARY_GEOGRAPHY_V2, url: "urn:dsa-seats:texas-primary-geography-compatibility-candidate:v2:2026-08-06", retainedPath: "data/metadata/texas-primary-geography-compatibility-candidate-v2.json", retainedStatus: "retained", byteSize: 187351, sha256: "8cf09b2b0f7250a7cca6acb2dc08ad67769b0837beaaa9b736cef51849eabf67", kind: "review_candidate", parentIds: [...PARENTS] };
const requiredEntries: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:texas-primary-geography-compatibility-candidate:v1:2026-08-05", retainedPath: "data/metadata/texas-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: 138039, sha256: GEOGRAPHY_SHA, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "texas-house-democratic-primary-results-2022-2026-v1", "texas-current-incumbent-primary-event-identity-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-48", "tiger-cd119-48"] },
  { id: PARENTS[1], url: "urn:dsa-seats:texas-2026-primary-block-crosswalk-candidate:v1:2026-08-06", retainedPath: "data/metadata/texas-2026-primary-block-crosswalk-candidate-v1.json", retainedStatus: "retained", byteSize: 83408, sha256: CROSSWALK_SHA, kind: "review_candidate", parentIds: ["texas-primary-geography-compatibility-candidate-v1", "tx-plan-c2333-current-election-use-status-20260806", "tx-hb4-enrolled-plan-c2333-2025", "tx-planc2333-dataset-metadata-20260806", "tx-planc2333-block-equivalency-extract-20260806", "census-cd119-texas-block-equivalency-extract-20260806"] },
];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`TX_PRIMARY_GEOGRAPHY_V2_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => { const matches = entries.filter((entry) => entry.id === expected.id); if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`); };

function assemble(input: TexasPrimaryGeographyV2Input) {
  if (input.sourceLock.version !== 1 || sha(input.geographyV1Json) !== GEOGRAPHY_SHA || sha(input.crosswalkJson) !== CROSSWALK_SHA) fail("input_bytes");
  const geography = validateTexasPrimaryGeographyCandidate(JSON.parse(input.geographyV1Json));
  const crosswalkInput = { geographyJson: input.geographyV1Json, currentStatusBytes: input.currentStatusBytes, enrolledLawBytes: input.enrolledLawBytes, datasetBytes: input.datasetBytes, planBlocksBytes: input.planBlocksBytes, currentBlocksBytes: input.currentBlocksBytes, sourceLock: input.sourceLock };
  const crosswalk = validateTexas2026PrimaryBlockCrosswalkCandidate(JSON.parse(input.crosswalkJson) as Texas2026PrimaryBlockCrosswalkCandidate, crosswalkInput);
  if (geography.packageSha256 !== "cc4aad571b826b10176846e7571bf598eebc245f8f88ef02626c5d50d0fd9335" || geography.rowSetSha256 !== "d8b06725f87143c95e7ce24debcca3d51353f51097c06b61283cd75a54d445c4" || crosswalk.packageSha256 !== "4d300b426ebf4bf9b25a13a4172f0121efc8932716ffb476550779a74b4f6e84" || crosswalk.rowSetSha256 !== "48b4dea1ff609b74c5a5faf325847650d90a82407b9a643e47a9c29f9f502046") fail("parent_identity");
  for (const entry of requiredEntries) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);
  const byObservation = new Map(crosswalk.rows.map((row) => [row.observationId, row]));
  const rows = geography.rows.map((parent) => {
    const evidence = parent.cycleYear === 2026 ? byObservation.get(parent.observationId) ?? fail("missing_crosswalk_row") : null;
    if (evidence && (evidence.parentGeographyRowSha256 !== parent.rowSha256 || evidence.identityObservationId !== parent.identityObservationId || evidence.identityRowSha256 !== parent.identityRowSha256 || evidence.eventId !== parent.eventId || evidence.electionStage !== parent.electionStage || evidence.sourceObservationStatus !== parent.sourceObservationStatus || evidence.sourceContestId !== parent.sourceContestId || evidence.sourceContestSha256 !== parent.sourceContestSha256 || evidence.sourceWinnerStatus !== parent.sourceWinnerStatus || evidence.certificationStatus !== parent.certificationStatus)) fail("crosswalk_join");
    const { rowSha256: parentGeographyRowSha256, ...parentUnsigned } = parent;
    const unsigned = {
      ...parentUnsigned,
      compatibilityDisposition: evidence ? "crosswalk_review_required" as const : parent.compatibilityDisposition,
      evidenceClass: evidence ? "derived_split_2020_block_crosswalk_review_required" as const : parent.evidenceClass,
      confidence: evidence ? "none" as const : parent.confidence,
      compatibilityCandidate: evidence ? false as const : parent.compatibilityCandidate,
      rationaleCodes: evidence ? ["source_district_splits_across_current_cd119_districts", "no_overlap_threshold_or_district_number_continuity", "operative_plan_status_time_bounded_pending_appeal", "identity_and_result_dispositions_preserved"] : parent.rationaleCodes,
      parentGeographyRowSha256,
      planBlockCrosswalk: evidence ? { sourceLockId: PARENTS[1], packageSha256: crosswalk.packageSha256, rowSha256: evidence.rowSha256, sourcePlanId: evidence.sourcePlanId, targetPlanId: evidence.targetPlanId, authorityStatus: evidence.authorityStatus, authorityCutoff: evidence.authorityCutoff, sourceBlockCount: evidence.sourceBlockCount, targetBlockCount: evidence.targetBlockCount, sameDistrictBlockCount: evidence.sameDistrictBlockCount, sourceRetentionPpm: evidence.sourceRetentionPpm, targetCoveragePpm: evidence.targetCoveragePpm, sourceToTargetSplits: evidence.sourceToTargetSplits, blockCountMeaning: evidence.blockCountMeaning } : null,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:tx-primary-geography-row:v2\0", unsigned) };
  }).sort((left, right) => order(left.observationId, right.observationId));
  if (byObservation.size !== 26 || rows.length !== 78 || rows.filter((row) => row.cycleYear === 2026).some((row) => row.compatibilityCandidate || row.compatibilityDisposition !== "crosswalk_review_required") || rows.filter((row) => row.cycleYear !== 2026).some((row) => !row.compatibilityCandidate || row.planBlockCrosswalk !== null)) fail("row_closure");
  const unsigned = {
    schema: TEXAS_PRIMARY_GEOGRAPHY_V2,
    version: 2 as const,
    generatedAt: "2026-08-06T13:30:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: geography.defaultUse,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    inheritedUnresolvedGates: geography.inheritedUnresolvedGates,
    parents: { geographyV1: { sourceLockId: PARENTS[0], fileSha256: GEOGRAPHY_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256, superseded: false as const }, planBlockCrosswalk: { sourceLockId: PARENTS[1], fileSha256: CROSSWALK_SHA, packageSha256: crosswalk.packageSha256, rowSetSha256: crosswalk.rowSetSha256 } },
    methodology: { compositionOnly: true as const, historicalTreatment: "retain_v1_cd118_to_cd119_plan_continuity_candidates" as const, currentTreatment: "retain_v1_exact_cd119_session_and_key_candidates" as const, cd120Treatment: "retain_split_plan_crosswalks_for_review_without_candidate_promotion" as const, blockJoinKey: "2020_census_tabulation_block_geoid" as const, crosswalkBlockUniverse: 668757 as const, overlapThresholdUsed: false as const, districtNumberContinuityAssumed: false as const, populationEquivalenceAssessed: false as const, voterOrElectoralWeightUsed: false as const, rawGeometryEqualityAssessed: false as const, legalPermanenceAssessed: false as const, automaticDecisionClosure: false as const, evaluatorNumericValues: 0 as const },
    summary: { eventObservations: 78 as const, regularEventObservations: 39 as const, runoffEventObservations: 39 as const, reportedContestObservations: 44 as const, sourceUnobservedEventObservations: 34 as const, cd118ToCd119PlanContinuityCandidates: 26 as const, exactCd119SessionKeyCandidates: 26 as const, cd120ExactBlockMembershipCandidates: 0 as const, cd120CrosswalkReviewRequired: 26 as const, compatibilityCandidates: 52 as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const },
    rows,
    rowSetSha256: digest("dsa-seats:tx-primary-geography-row-set:v2\0", rows),
    decisionSupport: { informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const, status: "proposed" as const, recommendedResolution: "accept_fifty_two_inherited_candidates_and_retain_twenty_six_cd120_split_rows_for_crosswalk_review" as const, defaultAssumption: "exclude_all_rows_until_certification_identity_geography_disposition_classification_review" as const, reviewerResolution: null, reviewer: null, reviewedAt: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:tx-primary-geography-candidate:v2\0", unsigned) };
}
export type TexasPrimaryGeographyCandidateV2 = ReturnType<typeof assemble>;
export function buildTexasPrimaryGeographyCandidateV2(input: TexasPrimaryGeographyV2Input) { return assemble(input); }
export function validateTexasPrimaryGeographyCandidateV2(value: TexasPrimaryGeographyCandidateV2, input: TexasPrimaryGeographyV2Input) { if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift"); return value; }
