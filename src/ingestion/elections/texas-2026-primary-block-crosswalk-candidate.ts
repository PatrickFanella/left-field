import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateTexasPrimaryGeographyCandidate } from "./texas-primary-geography-compatibility-candidate";

export const TEXAS_2026_PRIMARY_BLOCK_CROSSWALK_V1 = "texas-2026-primary-block-crosswalk-candidate-v1" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type Texas2026PrimaryBlockCrosswalkInput = Readonly<{
  geographyJson: string;
  currentStatusBytes: Buffer;
  enrolledLawBytes: Buffer;
  datasetBytes: Buffer;
  planBlocksBytes: Buffer;
  currentBlocksBytes: Buffer;
  sourceLock: { version: 1; entries: LockEntry[] };
}>;

const HASHES = {
  geography: "66ee61783980ebca966a6d9c70abba9cc2d2616ae91129870d3d398a90026ed8",
  currentStatus: "626b36b109ad33163e01063f31bce526ff7e499ac8a85268d992725bf03ae6d8",
  enrolledLaw: "ac6ade738a107c395f61edb78787e1e1cf677081e55d49552fe717b1dffedb1c",
  dataset: "7e0dbec7cd044701772fb6f20de033513337dc2a4331efd93a75d367def64683",
  planBlocks: "ff34cb7e7464f7ed55eff83bd2a86f3812e446167e488456c5e5c2376d8883b5",
  currentBlocks: "4eec50a54cf0dca2e6126a12f84a619bbeadbe68b5b23005030a82c78f5069df",
} as const;
const TARGETS = ["07", "09", "16", "18", "20", "28", "29", "30", "32", "33", "34", "35", "37"] as const;
const PARENTS = [
  "texas-primary-geography-compatibility-candidate-v1",
  "tx-plan-c2333-current-election-use-status-20260806",
  "tx-hb4-enrolled-plan-c2333-2025",
  "tx-planc2333-dataset-metadata-20260806",
  "tx-planc2333-block-equivalency-extract-20260806",
  "census-cd119-texas-block-equivalency-extract-20260806",
] as const;
const OUTPUT_ENTRY: LockEntry = { id: TEXAS_2026_PRIMARY_BLOCK_CROSSWALK_V1, url: "urn:dsa-seats:texas-2026-primary-block-crosswalk-candidate:v1:2026-08-06", retainedPath: "data/metadata/texas-2026-primary-block-crosswalk-candidate-v1.json", retainedStatus: "retained", byteSize: 83408, sha256: "801184e7330ffa1db233d9699e2b4bb308fc0fa941cc8aba0df800ec542794d5", kind: "review_candidate", parentIds: [...PARENTS] };
const requiredEntries: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:texas-primary-geography-compatibility-candidate:v1:2026-08-05", retainedPath: "data/metadata/texas-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: 138039, sha256: HASHES.geography, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "texas-house-democratic-primary-results-2022-2026-v1", "texas-current-incumbent-primary-event-identity-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-48", "tiger-cd119-48"] },
  { id: PARENTS[1], url: "https://redistricting.capitol.texas.gov/Current-districts", retainedPath: "data/source/elections/primary-results/geography/texas/2026/texas-current-districts-status.html", retainedStatus: "retained", byteSize: 27609, sha256: HASHES.currentStatus, kind: "official_current_authority", parentIds: [] },
  { id: PARENTS[2], url: "https://capitol.texas.gov/tlodocs/892/billtext/html/HB00004F.htm", retainedPath: "data/source/elections/primary-results/geography/texas/2026/hb4-enrolled.html", retainedStatus: "retained", byteSize: 1262192, sha256: HASHES.enrolledLaw, kind: "official_enrolled_law", parentIds: [] },
  { id: PARENTS[3], url: "https://data.capitol.texas.gov/api/3/action/package_show?id=planc2333", retainedPath: "data/source/elections/primary-results/geography/texas/2026/planc2333-dataset.json", retainedStatus: "retained", byteSize: 170392, sha256: HASHES.dataset, kind: "official_dataset_metadata", parentIds: [] },
  { id: PARENTS[4], url: "urn:dsa-seats:tx-planc2333:PLANC2333.csv", retainedPath: "data/source/elections/primary-results/geography/texas/2026/PLANC2333.csv", retainedStatus: "retained", byteSize: 14581459, sha256: HASHES.planBlocks, kind: "derived_extract", parentIds: ["tx-planc2333-block-equivalency-20250818"] },
  { id: PARENTS[5], url: "urn:dsa-seats:census-cd119-bef:NationalCD119.txt:state-fips-48", retainedPath: "data/source/elections/primary-results/geography/texas/current/48_TX_CD119.txt", retainedStatus: "retained", byteSize: 13375152, sha256: HASHES.currentBlocks, kind: "derived_extract", parentIds: ["census-cd119-block-equivalency-bundle-20260805"] },
];
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`TX_2026_PRIMARY_BLOCK_CROSSWALK_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => { const matches = entries.filter((entry) => entry.id === expected.id); if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`); return matches[0]!; };

function parseBlocks(bytes: Buffer, source: "planc2333" | "cd119") {
  const expectedHash = source === "planc2333" ? HASHES.planBlocks : HASHES.currentBlocks;
  if (sha(bytes) !== expectedHash) fail(`${source}_bytes`);
  const lines = bytes.toString("utf8").trim().split(/\r?\n/);
  if (lines.shift() !== (source === "planc2333" ? '"SCTBKEY","DISTRICT"' : "GEOID,CDFP")) fail(`${source}_header`);
  const blocks = new Map<string, string>(), byDistrict = new Map<string, string[]>();
  for (const line of lines) {
    const match = source === "planc2333" ? /^"(48\d{13})",(\d{1,2})$/.exec(line) : /^(48\d{13}),(\d{2})$/.exec(line);
    const parsed = match ?? fail(`${source}_row`);
    if (blocks.has(parsed[1]!)) fail(`${source}_row`);
    const district = parsed[2]!.padStart(2, "0");
    if (!/^(?:0[1-9]|[12]\d|3[0-8])$/.test(district)) fail(`${source}_district`);
    blocks.set(parsed[1]!, district); const group = byDistrict.get(district) ?? []; group.push(parsed[1]!); byDistrict.set(district, group);
  }
  if (blocks.size !== 668757 || byDistrict.size !== 38 || Array.from({ length: 38 }, (_, index) => String(index + 1).padStart(2, "0")).some((district) => !byDistrict.has(district))) fail(`${source}_inventory`);
  return { blocks, byDistrict };
}

function apportionedSplits(counts: Map<string, number>, total: number) {
  const values = [...counts].map(([targetDistrictCode, blockCount]) => { const scaled = blockCount * 1_000_000; return { targetDistrictCode, blockCount, sourceSharePpm: Math.floor(scaled / total), remainder: scaled % total }; });
  let remaining = 1_000_000 - values.reduce((sum, row) => sum + row.sourceSharePpm, 0);
  for (const row of [...values].sort((left, right) => right.remainder - left.remainder || order(left.targetDistrictCode, right.targetDistrictCode))) { if (remaining-- <= 0) break; row.sourceSharePpm++; }
  return values.sort((left, right) => order(left.targetDistrictCode, right.targetDistrictCode)).map((row) => ({ targetDistrictCode: row.targetDistrictCode, blockCount: row.blockCount, sourceSharePpm: row.sourceSharePpm }));
}

function assemble(input: Texas2026PrimaryBlockCrosswalkInput) {
  if (input.sourceLock.version !== 1 || sha(input.geographyJson) !== HASHES.geography || sha(input.currentStatusBytes) !== HASHES.currentStatus || sha(input.enrolledLawBytes) !== HASHES.enrolledLaw || sha(input.datasetBytes) !== HASHES.dataset) fail("input_bytes");
  const geography = validateTexasPrimaryGeographyCandidate(JSON.parse(input.geographyJson));
  if (geography.packageSha256 !== "cc4aad571b826b10176846e7571bf598eebc245f8f88ef02626c5d50d0fd9335" || geography.rowSetSha256 !== "d8b06725f87143c95e7ce24debcca3d51353f51097c06b61283cd75a54d445c4") fail("geography_parent");
  for (const entry of requiredEntries) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);
  const status = input.currentStatusBytes.toString("utf8"), law = input.enrolledLawBytes.toString("utf8"), metadata = JSON.parse(input.datasetBytes.toString("utf8"));
  if (!status.includes("again in effect for congressional elections") || !status.includes("beginning with the 2026 primaries") || !status.includes("pending the Supreme Court’s action on the appeal") || !law.includes("and general elections in 2026 for members of the 120th Congress") || metadata?.result?.title !== "PLANC2333" || metadata?.result?.notes !== "ENACTED BY 89TH LEGISLATURE, 2ND C.S., 2025" || metadata?.result?.license_id !== null || metadata?.result?.license_title !== null) fail("authority_claims");
  const source = parseBlocks(input.planBlocksBytes, "planc2333"), target = parseBlocks(input.currentBlocksBytes, "cd119");
  if ([...source.blocks.keys()].some((geoid) => !target.blocks.has(geoid)) || [...target.blocks.keys()].some((geoid) => !source.blocks.has(geoid))) fail("block_universe");
  const parents = geography.rows.filter((row) => row.cycleYear === 2026);
  if (parents.length !== 26 || parents.some((row) => row.historicalCongressSession !== "120" || row.historicalGeoid !== null || row.compatibilityCandidate || row.compatibilityDisposition !== "unassessed_cd120_authority_and_crosswalk_collection_pending")) fail("parent_row_closure");
  const sourceMetrics = new Map<string, { sourceBlockCount: number; targetBlockCount: number; sameDistrictBlockCount: number; exact: boolean; sourceToTargetSplits: Array<{ targetDistrictCode: string; blockCount: number; sourceSharePpm: number }> }>(TARGETS.map((districtCode) => {
    const sourceBlocks = source.byDistrict.get(districtCode) ?? fail("missing_source_district"), targetBlocks = target.byDistrict.get(districtCode) ?? fail("missing_target_district"), counts = new Map<string, number>();
    for (const geoid of sourceBlocks) { const targetDistrict = target.blocks.get(geoid) ?? fail("missing_target_block"); counts.set(targetDistrict, (counts.get(targetDistrict) ?? 0) + 1); }
    const sameDistrictBlockCount = counts.get(districtCode) ?? 0, exact = sourceBlocks.length === targetBlocks.length && sameDistrictBlockCount === sourceBlocks.length && counts.size === 1;
    return [districtCode, { sourceBlockCount: sourceBlocks.length, targetBlockCount: targetBlocks.length, sameDistrictBlockCount, exact, sourceToTargetSplits: apportionedSplits(counts, sourceBlocks.length) }] as const;
  }));
  const rows = parents.map((parent) => {
    const metric = sourceMetrics.get(parent.districtCode) ?? fail("parent_target_scope");
    const unsigned = {
      observationId: parent.observationId,
      parentGeographyRowSha256: parent.rowSha256,
      identityObservationId: parent.identityObservationId,
      identityRowSha256: parent.identityRowSha256,
      eventId: parent.eventId,
      cycleYear: 2026 as const,
      electionStage: parent.electionStage,
      electionDate: parent.electionDate,
      seatCycleId: parent.seatCycleId,
      districtCode: parent.districtCode,
      sourceObservationStatus: parent.sourceObservationStatus,
      sourceContestId: parent.sourceContestId,
      sourceContestSha256: parent.sourceContestSha256,
      sourceWinnerStatus: parent.sourceWinnerStatus,
      targetCd119Geoid: parent.targetCd119Geoid,
      historicalCongressSession: "120" as const,
      sourcePlanId: "texas-planc2333-hb4-89th-legislature-2nd-called-session-2025" as const,
      targetPlanId: "census-cd119-texas" as const,
      sourceBlockCount: metric.sourceBlockCount,
      targetBlockCount: metric.targetBlockCount,
      sameDistrictBlockCount: metric.sameDistrictBlockCount,
      sourceRetentionPpm: Math.round(metric.sameDistrictBlockCount * 1_000_000 / metric.sourceBlockCount),
      targetCoveragePpm: Math.round(metric.sameDistrictBlockCount * 1_000_000 / metric.targetBlockCount),
      sourceToTargetSplits: metric.sourceToTargetSplits,
      blockCountMeaning: "2020_census_tabulation_blocks_not_population_voters_or_electoral_weight" as const,
      compatibilityDisposition: metric.exact ? "exact_block_membership_candidate" as const : "crosswalk_review_required" as const,
      compatibilityCandidate: metric.exact,
      confidence: metric.exact ? "high" as const : "none" as const,
      compatibilityApproved: false as const,
      identityApproved: false as const,
      authorityStatus: "enacted_and_in_effect_for_2026_primaries_at_cutoff_pending_supreme_court_appeal" as const,
      authorityCutoff: "2026-08-06" as const,
      identityDispositionPreserved: true as const,
      resultDispositionPreserved: true as const,
      certificationStatus: parent.certificationStatus,
      scoreEligible: false as const,
      evaluatorUse: "excluded_pending_certification_identity_historical_geography_disposition_classification_review_and_publication_approval" as const,
      rationaleCodes: metric.exact ? ["identical_2020_tabulation_block_membership", "operative_plan_status_time_bounded_pending_appeal", "parent_identity_and_result_dispositions_preserved"] : ["source_district_splits_across_current_cd119_districts", "same_district_number_and_overlap_are_not_continuity_thresholds", "operative_plan_status_time_bounded_pending_appeal", "block_counts_are_not_population_voter_or_electoral_weights", "parent_identity_and_result_dispositions_preserved"],
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:tx-2026-primary-block-crosswalk-row:v1\0", unsigned) };
  }).sort((left, right) => order(left.observationId, right.observationId));
  if (rows.some((row) => row.compatibilityCandidate) || new Set(rows.map((row) => row.districtCode)).size !== 13) fail("candidate_closure");
  let changedAssignments = 0; for (const [geoid, district] of source.blocks) if (target.blocks.get(geoid) !== district) changedAssignments++;
  if (changedAssignments !== 192131) fail("assignment_change_closure");
  const unsigned = {
    schema: TEXAS_2026_PRIMARY_BLOCK_CROSSWALK_V1,
    version: 1 as const,
    generatedAt: "2026-08-06T12:30:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_certification_identity_historical_geography_disposition_classification_review_and_publication_approval" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    inputs: { geographyCandidate: { sourceLockId: PARENTS[0], fileSha256: HASHES.geography, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 }, currentElectionUseAuthority: { sourceLockId: PARENTS[1], fileSha256: HASHES.currentStatus }, enrolledLaw: { sourceLockId: PARENTS[2], fileSha256: HASHES.enrolledLaw }, planDataset: { sourceLockId: PARENTS[3], fileSha256: HASHES.dataset, reuseLicenseAssessed: false as const, publicationPermissionAssessed: false as const }, sourceBlockAssignment: { sourceLockId: PARENTS[4], fileSha256: HASHES.planBlocks }, targetBlockAssignment: { sourceLockId: PARENTS[5], fileSha256: HASHES.currentBlocks } },
    methodology: { joinKey: "2020_census_tabulation_block_geoid" as const, sourcePlan: "texas-planc2333-hb4-89th-legislature-2nd-called-session-2025" as const, targetPlan: "census-cd119-texas" as const, sourceAndTargetBlockUniverseEqual: true as const, blockUniverse: 668757 as const, exactMembershipRule: "source_and_target_district_block_sets_must_be_identical" as const, splitDispositionRule: "crosswalk_review_required_regardless_of_overlap_share" as const, overlapThresholdUsed: false as const, districtNumberContinuityAssumed: false as const, blockCountsArePopulationWeighted: false as const, blockCountsAreVoterWeighted: false as const, blockCountsAreElectoralWeighted: false as const, splitShareRounding: "largest_remainder_exactly_one_million_ppm" as const, rawGeometryEqualityAssessed: false as const, censusCd120BefAvailableAtCutoff: false as const, legalPermanenceAssessed: false as const, automaticDecisionClosure: false as const, evaluatorNumericValues: 0 as const },
    summary: { targetObservations: 26 as const, uniqueSourceDistricts: 13 as const, exactBlockMembershipCandidates: 0 as const, crosswalkReviewRequired: 26 as const, sourceBlocks: 668757 as const, targetBlocks: 668757 as const, sharedBlocks: 668757 as const, changedDistrictAssignments: 192131 as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const },
    rows,
    rowSetSha256: digest("dsa-seats:tx-2026-primary-block-crosswalk-row-set:v1\0", rows),
    decisionSupport: { informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const, recommendedResolution: "retain_all_twenty_six_2026_event_rows_for_split_crosswalk_review" as const, defaultAssumption: "exclude_all_rows_until_authorized_identity_geography_review" as const, consequenceIfAccepted: "authority_pending_is_resolved_but_no_2026_compatibility_candidate_is_created" as const, consequenceIfRejected: "all_twenty_six_2026_rows_remain_authority_and_crosswalk_pending" as const, blocksOtherWork: false as const },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:tx-2026-primary-block-crosswalk-candidate:v1\0", unsigned) };
}

export type Texas2026PrimaryBlockCrosswalkCandidate = ReturnType<typeof assemble>;
export function buildTexas2026PrimaryBlockCrosswalkCandidate(input: Texas2026PrimaryBlockCrosswalkInput) { return assemble(input); }
export function validateTexas2026PrimaryBlockCrosswalkCandidate(value: Texas2026PrimaryBlockCrosswalkCandidate, input: Texas2026PrimaryBlockCrosswalkInput) { if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift"); return value; }
