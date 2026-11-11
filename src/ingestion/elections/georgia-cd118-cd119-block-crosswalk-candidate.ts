import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";

export const GEORGIA_CD118_CD119_BLOCK_CROSSWALK_V1 = "georgia-cd118-cd119-block-crosswalk-candidate-v1" as const;

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type GeorgiaCd118Cd119BlockCrosswalkInput = Readonly<{
  authorityBytes: Buffer;
  cd118Bytes: Buffer;
  cd119Bytes: Buffer;
  sourceLock: { version: 1; entries: LockEntry[] };
}>;

const HASHES = {
  authority: "66a0551a6c3c6432bff0a6a6db23f221fbe02ead1d15221d7050633898914670",
  cd118: "074a7d3f7757b4daf606d1686d51f0736a2747e4b55aa151bb48a0bb4f23f70c",
  cd119: "fce46d16aa6cfd4ff0166c74ffd9a013775630688463544dcae613bd4a9e156d",
} as const;
const DISTRICTS = Array.from({ length: 14 }, (_, index) => String(index + 1).padStart(2, "0"));
const EXACT_DISTRICTS = ["01", "02", "03", "08", "12"] as const;
const PARENTS = [
  "census-cd119-plan-change-authority-20260805",
  "census-cd118-georgia-block-equivalency-extract-20260807",
  "census-cd119-georgia-block-equivalency-extract-20260807",
] as const;
const REQUIRED_ENTRIES: LockEntry[] = [
  { id: PARENTS[0], url: "https://www.census.gov/geographies/mapping-files/2025/dec/rdo/119-congressional-district-bef.html", retainedPath: "data/source/elections/primary-results/geography/census-119-congressional-district-bef.html", retainedStatus: "retained", byteSize: 324827, sha256: HASHES.authority, kind: "source", parentIds: [] },
  { id: PARENTS[1], url: "urn:dsa-seats:census-cd118-bef:13_GA_CD118.txt", retainedPath: "data/source/elections/primary-results/geography/georgia/historical/13_GA_CD118.txt", retainedStatus: "retained", byteSize: 4654353, sha256: HASHES.cd118, kind: "derived_extract", parentIds: ["census-cd118-block-equivalency-bundle-20260806"] },
  { id: PARENTS[2], url: "urn:dsa-seats:census-cd119-bef:13_GA_CD119.txt", retainedPath: "data/source/elections/primary-results/geography/georgia/current/13_GA_CD119.txt", retainedStatus: "retained", byteSize: 4654352, sha256: HASHES.cd119, kind: "derived_extract", parentIds: ["census-cd119-block-equivalency-bundle-20260805"] },
];
const OUTPUT_SIZE = 43102;
const OUTPUT_SHA = "b485a7dc92a37d00fc84c88dd583cada37edb21a501bfb69d69959e2c6270741";

const sha = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`GA_CD118_CD119_BLOCK_CROSSWALK_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry): void => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function parseBlocks(bytes: Buffer, session: "118" | "119") {
  if (sha(bytes) !== (session === "118" ? HASHES.cd118 : HASHES.cd119)) fail(`cd${session}_bytes`);
  const lines = bytes.toString("utf8").trim().split(/\r?\n/);
  if (lines.shift()?.replace(/\s/g, "") !== "GEOID,CDFP") fail(`cd${session}_header`);
  const blocks = new Map<string, string>();
  const byDistrict = new Map<string, string[]>();
  for (const line of lines) {
    const match = /^(13\d{13}),\s?(\d{2})$/.exec(line) ?? fail(`cd${session}_row`);
    const geoid = match[1]!;
    const district = match[2]!;
    if (!DISTRICTS.includes(district) || blocks.has(geoid)) fail(`cd${session}_row`);
    blocks.set(geoid, district);
    const group = byDistrict.get(district) ?? [];
    group.push(geoid);
    byDistrict.set(district, group);
  }
  if (blocks.size !== 232717 || byDistrict.size !== 14 || DISTRICTS.some((district) => !byDistrict.has(district))) fail(`cd${session}_inventory`);
  return { blocks, byDistrict };
}

function apportionedSplits(counts: Map<string, number>, total: number) {
  const rows = DISTRICTS.map((targetDistrictCode) => {
    const blockCount = counts.get(targetDistrictCode) ?? 0;
    const scaled = blockCount * 1_000_000;
    return { targetDistrictCode, blockCount, sourceSharePpm: Math.floor(scaled / total), remainder: scaled % total };
  });
  let remaining = 1_000_000 - rows.reduce((sum, row) => sum + row.sourceSharePpm, 0);
  for (const row of [...rows].sort((left, right) => right.remainder - left.remainder || order(left.targetDistrictCode, right.targetDistrictCode))) {
    if (remaining-- <= 0) break;
    row.sourceSharePpm += 1;
  }
  return rows.map(({ targetDistrictCode, blockCount, sourceSharePpm }) => ({ targetDistrictCode, blockCount, sourceSharePpm }));
}

function assemble(input: GeorgiaCd118Cd119BlockCrosswalkInput) {
  if (input.sourceLock.version !== 1 || sha(input.authorityBytes) !== HASHES.authority) fail("input_bytes");
  for (const entry of REQUIRED_ENTRIES) exactEntry(input.sourceLock.entries, entry);
  const outputs = input.sourceLock.entries.filter((entry) => entry.id === GEORGIA_CD118_CD119_BLOCK_CROSSWALK_V1);
  if (OUTPUT_SHA) {
    exactEntry(input.sourceLock.entries, { id: GEORGIA_CD118_CD119_BLOCK_CROSSWALK_V1, url: "urn:dsa-seats:georgia-cd118-cd119-block-crosswalk-candidate:v1:2026-08-07", retainedPath: "data/metadata/georgia-cd118-cd119-block-crosswalk-candidate-v1.json", retainedStatus: "retained", byteSize: OUTPUT_SIZE, sha256: OUTPUT_SHA, kind: "review_candidate", parentIds: [...PARENTS] });
  } else if (outputs.length) fail("unexpected_output_lock");
  const authority = input.authorityBytes.toString("utf8");
  if (!authority.includes("individual state files for the five states (Alabama, Georgia, Louisiana, New York, and North Carolina) that redrew their congressional district plans for the 119th Congress")) fail("authority_claim");
  const source = parseBlocks(input.cd118Bytes, "118");
  const target = parseBlocks(input.cd119Bytes, "119");
  if ([...source.blocks].some(([geoid]) => !target.blocks.has(geoid)) || [...target.blocks].some(([geoid]) => !source.blocks.has(geoid))) fail("block_universe");

  const rows = DISTRICTS.map((sourceDistrictCode) => {
    const sourceBlocks = source.byDistrict.get(sourceDistrictCode) ?? fail("source_district");
    const targetSameNumberBlocks = target.byDistrict.get(sourceDistrictCode) ?? fail("target_district");
    const counts = new Map<string, number>();
    for (const geoid of sourceBlocks) {
      const targetDistrict = target.blocks.get(geoid) ?? fail("target_block");
      counts.set(targetDistrict, (counts.get(targetDistrict) ?? 0) + 1);
    }
    const sameDistrictBlockCount = counts.get(sourceDistrictCode) ?? 0;
    const exact = counts.size === 1 && sameDistrictBlockCount === sourceBlocks.length && sourceBlocks.length === targetSameNumberBlocks.length;
    const unsigned = {
      crosswalkId: `ga:cd118-cd119:${sourceDistrictCode}`,
      stateFips: "13" as const,
      sourceCongressSession: "118" as const,
      targetCongressSession: "119" as const,
      sourceDistrictCode,
      sourceGeoid: `13${sourceDistrictCode}`,
      targetSameNumberGeoid: `13${sourceDistrictCode}`,
      sourceBlockCount: sourceBlocks.length,
      targetSameNumberBlockCount: targetSameNumberBlocks.length,
      sameDistrictBlockCount,
      sourceRetentionPpm: Math.round(sameDistrictBlockCount * 1_000_000 / sourceBlocks.length),
      targetCoveragePpm: Math.round(sameDistrictBlockCount * 1_000_000 / targetSameNumberBlocks.length),
      sourceToTargetSplits: apportionedSplits(counts, sourceBlocks.length),
      blockCountMeaning: "2020_census_tabulation_blocks_not_population_voters_or_electoral_weight" as const,
      compatibilityDisposition: exact ? "exact_block_membership_candidate" as const : "crosswalk_review_required" as const,
      compatibilityCandidate: exact,
      confidence: exact ? "high" as const : "none" as const,
      compatibilityApproved: false as const,
      scoreEligible: false as const,
      evaluatorUse: "excluded_pending_authorized_geography_review" as const,
      rationaleCodes: exact
        ? ["identical_2020_tabulation_block_membership", "official_census_cd118_and_cd119_bef_extracts", "candidate_still_requires_authorized_geography_review"]
        : ["source_district_splits_across_cd119_districts", "same_district_number_and_overlap_are_not_continuity_thresholds", "block_counts_are_not_population_voter_or_electoral_weights", "no_alternate_target_district_selected"],
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:ga-cd118-cd119-block-crosswalk-row:v1\0", unsigned) };
  });
  if (canonicalJson(rows.filter((row) => row.compatibilityCandidate).map((row) => row.sourceDistrictCode)) !== canonicalJson(EXACT_DISTRICTS)) fail("candidate_closure");
  const source07 = rows.find((row) => row.sourceDistrictCode === "07") ?? fail("source07");
  if (source07.sourceToTargetSplits.find((split) => split.targetDistrictCode === "06")?.blockCount !== 0) fail("source07_target06_boundary");
  let changedDistrictAssignments = 0;
  for (const [geoid, district] of source.blocks) if (target.blocks.get(geoid) !== district) changedDistrictAssignments += 1;
  if (changedDistrictAssignments !== 34108) fail("assignment_change_closure");

  const unsigned = {
    schema: GEORGIA_CD118_CD119_BLOCK_CROSSWALK_V1,
    version: 1 as const,
    generatedAt: "2026-08-07T07:00:00.000Z" as const,
    sourceCutoff: "2026-08-07" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_authorized_geography_review" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    inputs: {
      planChangeAuthority: { sourceLockId: PARENTS[0], fileSha256: HASHES.authority, authorityFinding: "georgia_named_by_census_as_cd119_redraw_state" as const },
      cd118BlockEquivalency: { sourceLockId: PARENTS[1], fileSha256: HASHES.cd118, parentBundleId: "census-cd118-block-equivalency-bundle-20260806" as const },
      cd119BlockEquivalency: { sourceLockId: PARENTS[2], fileSha256: HASHES.cd119, parentBundleId: "census-cd119-block-equivalency-bundle-20260805" as const },
    },
    methodology: {
      joinKey: "2020_census_tabulation_block_geoid" as const,
      sourcePlan: "census_cd118_georgia_state_submitted_plan" as const,
      targetPlan: "census_cd119_georgia_state_submitted_plan" as const,
      sourceAndTargetBlockUniverseEqual: true as const,
      blockUniverse: 232717 as const,
      exactMembershipRule: "source_and_same_number_target_district_block_sets_must_be_identical" as const,
      splitDispositionRule: "crosswalk_review_required_regardless_of_overlap_share" as const,
      zeroOverlapAlternateTargetRule: "do_not_select_an_alternate_target_district" as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityAssumed: false as const,
      blockCountsArePopulationWeighted: false as const,
      blockCountsAreVoterWeighted: false as const,
      blockCountsAreElectoralWeighted: false as const,
      rawGeometryEqualityAssessed: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary: {
      sourceDistricts: 14 as const,
      targetDistricts: 14 as const,
      exactBlockMembershipCandidates: 5 as const,
      crosswalkReviewRequired: 9 as const,
      sourceBlocks: 232717 as const,
      targetBlocks: 232717 as const,
      sharedBlocks: 232717 as const,
      changedDistrictAssignments: 34108 as const,
      automaticallyApprovedRows: 0 as const,
      scoreEligibleRows: 0 as const,
    },
    rows,
    rowSetSha256: digest("dsa-seats:ga-cd118-cd119-block-crosswalk-row-set:v1\0", rows),
    decisionSupport: {
      informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const,
      lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" as const,
      recommendedResolution: "accept_five_exact_membership_candidates_and_retain_nine_split_rows_for_crosswalk_review" as const,
      defaultAssumption: "exclude_all_rows_until_authorized_geography_review" as const,
      consequenceIfAccepted: "a_later_geography_package_may_consume_only_exact_membership_candidates_without_treating_them_as_approved" as const,
      consequenceIfRejected: "all_fourteen_cd118_rows_remain_redraw_crosswalk_required" as const,
      blocksOtherWork: false as const,
      inheritedResolution: null,
    },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ga-cd118-cd119-block-crosswalk-candidate:v1\0", unsigned) };
}

export type GeorgiaCd118Cd119BlockCrosswalkCandidate = ReturnType<typeof assemble>;
export function buildGeorgiaCd118Cd119BlockCrosswalkCandidate(input: GeorgiaCd118Cd119BlockCrosswalkInput) { return assemble(input); }
export function validateGeorgiaCd118Cd119BlockCrosswalkCandidate(value: GeorgiaCd118Cd119BlockCrosswalkCandidate, input: GeorgiaCd118Cd119BlockCrosswalkInput) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
