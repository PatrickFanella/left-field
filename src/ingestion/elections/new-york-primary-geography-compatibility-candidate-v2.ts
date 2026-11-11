import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateNewYork2022PrimaryBlockCrosswalkCandidate, type NewYork2022PrimaryBlockCrosswalkCandidate } from "./new-york-2022-primary-block-crosswalk-candidate";
import { validateNewYorkPrimaryGeographyCandidate } from "./new-york-primary-geography-compatibility-candidate";

export const NEW_YORK_PRIMARY_GEOGRAPHY_V2 = "new-york-primary-geography-compatibility-candidate-v2" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type NewYorkPrimaryGeographyV2Input = Readonly<{
  geographyV1Json: string;
  crosswalkJson: string;
  receiptJson: string;
  authorityBytes: Buffer;
  assignmentBytes: Buffer;
  cd118Bytes: Buffer;
  cd119Bytes: Buffer;
  sourceLock: { version: 1; entries: LockEntry[] };
}>;

const GEOGRAPHY_V1_SHA = "8f0410959243684b03a2575eb989d23839854c17d3b4b4fe4e6416be932f5096";
const CROSSWALK_SHA = "c32be7bff97fc9c26342c3f03830676dddb2d0058c7b204ce53ee1d34b2c2e33";
const PARENTS = ["new-york-primary-geography-compatibility-candidate-v1", "new-york-2022-primary-block-crosswalk-candidate-v1"] as const;
const requiredEntries: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:new-york-primary-geography-compatibility-candidate:v1:2026-08-06", retainedPath: "data/metadata/new-york-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: 67071, sha256: GEOGRAPHY_V1_SHA, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "new-york-house-democratic-primary-dispositions-2022-2024-v2", "new-york-current-incumbent-primary-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-36", "tiger-cd119-36"] },
  { id: PARENTS[1], url: "urn:dsa-seats:new-york-2022-primary-block-crosswalk-candidate:v1:2026-08-06", retainedPath: "data/metadata/new-york-2022-primary-block-crosswalk-candidate-v1.json", retainedStatus: "retained", byteSize: 41967, sha256: CROSSWALK_SHA, kind: "review_candidate", parentIds: ["new-york-primary-geography-compatibility-candidate-v1", "new-york-2022-congressional-block-assignment-receipt-v1", "census-cd119-new-york-block-equivalency-extract-20260805"] },
];
const OUTPUT_SIZE = 90500, OUTPUT_SHA = "d2403c86107b131aa073c3aa26f267f50aad57b88122c517ac633413e93ab018";
const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`NY_PRIMARY_GEOGRAPHY_V2_INVALID:${reason}`); };
const parse = (value: string, reason: string): unknown => { try { return JSON.parse(value); } catch { return fail(reason); } };
const exactEntry = (entries: LockEntry[], expected: LockEntry): LockEntry => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
  return matches[0]!;
};

function assemble(input: NewYorkPrimaryGeographyV2Input) {
  if (input.sourceLock.version !== 1 || sha(input.geographyV1Json) !== GEOGRAPHY_V1_SHA || sha(input.crosswalkJson) !== CROSSWALK_SHA) fail("input_bytes");
  const geography = validateNewYorkPrimaryGeographyCandidate(parse(input.geographyV1Json, "geography_json"));
  const crosswalkInput = { geographyJson: input.geographyV1Json, receiptJson: input.receiptJson, authorityBytes: input.authorityBytes, assignmentBytes: input.assignmentBytes, cd118Bytes: input.cd118Bytes, cd119Bytes: input.cd119Bytes, sourceLock: input.sourceLock };
  const crosswalk = validateNewYork2022PrimaryBlockCrosswalkCandidate(parse(input.crosswalkJson, "crosswalk_json") as NewYork2022PrimaryBlockCrosswalkCandidate, crosswalkInput);
  if (geography.packageSha256 !== "c5839d2fb9dd4cc6f463a3adf2520a43b1c6484e2f7d95c6b2e1eb0470611b5d" || geography.rowSetSha256 !== "81d251dbbc6bbd9c1e3185abb7e161ab01b0332ec8439df69edb02a739aa85fb" || crosswalk.packageSha256 !== "f13dce59a56dce2e34e223601828b4ff29886f1c090a391682d205de0b9077af" || crosswalk.rowSetSha256 !== "c3b4a7ca00b3658832a9884d97f937d3b2ab2223501e054fda99370eca89cbc5") fail("parent_identity");
  for (const entry of requiredEntries) exactEntry(input.sourceLock.entries, entry);
  const output = input.sourceLock.entries.filter((entry) => entry.id === NEW_YORK_PRIMARY_GEOGRAPHY_V2);
  if (!OUTPUT_SHA) {
    if (output.length) fail("unexpected_output_lock");
  } else exactEntry(input.sourceLock.entries, { id: NEW_YORK_PRIMARY_GEOGRAPHY_V2, url: "urn:dsa-seats:new-york-primary-geography-compatibility-candidate:v2:2026-08-06", retainedPath: "data/metadata/new-york-primary-geography-compatibility-candidate-v2.json", retainedStatus: "retained", byteSize: OUTPUT_SIZE, sha256: OUTPUT_SHA, kind: "review_candidate", parentIds: [...PARENTS] });

  const crosswalkByObservation = new Map(crosswalk.rows.map((row) => [row.observationId, row]));
  const rows = geography.rows.map((parent) => {
    const historical = parent.cycleYear === 2022 ? crosswalkByObservation.get(parent.observationId) ?? fail("missing_crosswalk_row") : null;
    if (historical && (historical.parentGeographyRowSha256 !== parent.rowSha256 || historical.districtCode !== parent.districtCode || historical.seatCycleId !== parent.seatCycleId || historical.historicalCongressSession !== parent.historicalCongressSession)) fail("crosswalk_join");
    const exactBlock = historical?.compatibilityDisposition === "exact_block_membership_candidate";
    const { rowSha256: parentGeographyRowSha256, ...parentUnsigned } = parent;
    const unsigned = {
      ...parentUnsigned,
      compatibilityDisposition: historical ? (exactBlock ? "exact_2020_block_membership_candidate" as const : "crosswalk_review_required" as const) : parent.compatibilityDisposition,
      evidenceClass: historical ? (exactBlock ? "derived_exact_2020_block_membership" as const : "derived_split_2020_block_crosswalk_review_required" as const) : parent.evidenceClass,
      confidence: historical ? (exactBlock ? "high" as const : "none" as const) : parent.confidence,
      compatibilityCandidate: historical ? exactBlock : parent.compatibilityCandidate,
      rationaleCodes: historical ? (exactBlock ? ["identical_2020_tabulation_block_membership", "crosswalk_candidate_not_approved", "identity_and_result_dispositions_preserved"] : ["source_district_splits_across_current_cd119_districts", "no_overlap_threshold_or_district_number_continuity", "identity_and_result_dispositions_preserved"]) : parent.rationaleCodes,
      parentGeographyRowSha256,
      historicalBlockCrosswalk: historical ? {
        sourceLockId: PARENTS[1], packageSha256: crosswalk.packageSha256, rowSha256: historical.rowSha256,
        sourcePlanId: historical.sourcePlanId, targetPlanId: historical.targetPlanId,
        sourceBlockCount: historical.sourceBlockCount, targetBlockCount: historical.targetBlockCount, sameDistrictBlockCount: historical.sameDistrictBlockCount,
        sourceRetentionPpm: historical.sourceRetentionPpm, targetCoveragePpm: historical.targetCoveragePpm,
        sourceToTargetSplits: historical.sourceToTargetSplits, blockCountMeaning: historical.blockCountMeaning,
      } : null,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:ny-primary-geography-row:v2\0", unsigned) };
  }).sort((left, right) => order(left.observationId, right.observationId));
  if (crosswalkByObservation.size !== 19 || rows.length !== 38 || rows.filter((row) => row.cycleYear === 2022 && row.compatibilityCandidate).map((row) => row.districtCode).join(",") !== "04,05,12,13" || rows.filter((row) => row.cycleYear === 2024 && row.compatibilityCandidate).length !== 19) fail("row_closure");
  const unsigned = {
    schema: NEW_YORK_PRIMARY_GEOGRAPHY_V2,
    version: 2 as const,
    generatedAt: "2026-08-06T18:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_identity_historical_geography_disposition_review_and_publication_approval" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    parents: {
      geographyV1: { sourceLockId: PARENTS[0], fileSha256: GEOGRAPHY_V1_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256, superseded: false as const },
      historicalBlockCrosswalk: { sourceLockId: PARENTS[1], fileSha256: CROSSWALK_SHA, packageSha256: crosswalk.packageSha256, rowSetSha256: crosswalk.rowSetSha256 },
    },
    methodology: {
      compositionOnly: true as const,
      historicalTreatment: "exact_block_membership_candidate_only" as const,
      currentTreatment: "exact_cd119_session_and_key_candidate" as const,
      blockJoinKey: "2020_census_tabulation_block_geoid" as const,
      crosswalkBlockUniverse: 288819 as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityAssumed: false as const,
      populationEquivalenceAssessed: false as const,
      voterOrElectoralWeightUsed: false as const,
      rawGeometryEqualityAssessed: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary: {
      identityObservations: 38 as const,
      identityProposedLinkRows: 12 as const,
      identityReportedNoMatchRows: 4 as const,
      identityNonreportedRows: 22 as const,
      historicalExactBlockMembershipCandidates: 4 as const,
      historicalCrosswalkReviewRequired: 15 as const,
      currentExactCd119SessionKeyCandidates: 19 as const,
      compatibilityCandidates: 23 as const,
      automaticallyApprovedRows: 0 as const,
      scoreEligibleRows: 0 as const,
    },
    rows,
    rowSetSha256: digest("dsa-seats:ny-primary-geography-row-set:v2\0", rows),
    decisionSupport: {
      informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const,
      status: "proposed" as const,
      recommendedResolution: "accept_nineteen_current_exact_session_keys_and_four_historical_exact_block_membership_candidates_retain_fifteen_split_rows_for_review" as const,
      defaultAssumption: "exclude_all_rows_until_identity_geography_disposition_review" as const,
      reviewerResolution: null,
      reviewer: null,
      reviewedAt: null,
    },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ny-primary-geography-candidate:v2\0", unsigned) };
}

export type NewYorkPrimaryGeographyCandidateV2 = ReturnType<typeof assemble>;
export function buildNewYorkPrimaryGeographyCandidateV2(input: NewYorkPrimaryGeographyV2Input): NewYorkPrimaryGeographyCandidateV2 { return assemble(input); }
export function validateNewYorkPrimaryGeographyCandidateV2(value: NewYorkPrimaryGeographyCandidateV2, input: NewYorkPrimaryGeographyV2Input): NewYorkPrimaryGeographyCandidateV2 {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
