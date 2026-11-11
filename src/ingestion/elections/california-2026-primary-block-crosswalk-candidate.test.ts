import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCalifornia2026PrimaryBlockCrosswalkCandidate, validateCalifornia2026PrimaryBlockCrosswalkCandidate } from "./california-2026-primary-block-crosswalk-candidate";

const input = () => ({
  geographyJson: readFileSync("data/metadata/california-primary-geography-compatibility-candidate-v1.json", "utf8"),
  currentStatusBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/california-redistricting-status.html"),
  voterGuideBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/prop50-official-voter-guide.pdf"),
  sourcePageBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/2025-congressional-districts.html"),
  planBlocksBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/06_CA_CD120_AB604.txt"),
  currentBlocksBytes: readFileSync("data/source/elections/primary-results/geography/california/current/06_CA_CD119.txt"),
  sourceLock: JSON.parse(readFileSync("data/source-lock.json", "utf8")),
});
type MutableCandidate = {
  rows: Array<Record<string, unknown>>;
  methodology: Record<string, unknown>;
  review: Record<string, unknown>;
  publicationEligible: boolean;
  [key: string]: unknown;
};

describe("California 2026 primary block crosswalk candidate", () => {
  it("binds all 52 top-two contests and distinguishes four exact memberships from 48 splits", () => {
    const value = buildCalifornia2026PrimaryBlockCrosswalkCandidate(input());

    expect(value.summary).toEqual({
      targetObservations: 52,
      uniqueSourceDistricts: 52,
      exactBlockMembershipCandidates: 4,
      crosswalkReviewRequired: 48,
      sourceBlocks: 519723,
      targetBlocks: 519723,
      sharedBlocks: 519723,
      changedDistrictAssignments: 133426,
      automaticallyApprovedRows: 0,
      scoreEligibleRows: 0,
    });
    expect(value.rows.filter((row) => row.compatibilityCandidate).map((row) => row.districtCode)).toEqual(["34", "36", "37", "43"]);
    expect(value.rows.every((row) => row.formulaApplicability === "confirmed_incompatible_with_party_primary_metrics" && !row.compatibilityApproved && !row.identityApproved && !row.scoreEligible)).toBe(true);
    expect(value.rows.every((row) => row.sourceToTargetSplits.reduce((sum, split) => sum + split.blockCount, 0) === row.sourceBlockCount && row.sourceToTargetSplits.reduce((sum, split) => sum + split.sourceSharePpm, 0) === 1_000_000)).toBe(true);
    expect(value.rows.find((row) => row.districtCode === "12")).toMatchObject({ sourceBlockCount: 8894, targetBlockCount: 8895, sameDistrictBlockCount: 8894, compatibilityDisposition: "crosswalk_review_required", compatibilityCandidate: false });
    expect(value.rows.find((row) => row.districtCode === "41")).toMatchObject({ sourceBlockCount: 6975, sameDistrictBlockCount: 0, compatibilityDisposition: "crosswalk_review_required" });
    expect(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).toEqual(readFileSync("data/metadata/california-2026-primary-block-crosswalk-candidate-v1.json"));
  }, 30_000);

  it("rejects parent, authority, block, and source-lock drift", () => {
    for (const mutate of [
      (value: ReturnType<typeof input>) => { value.geographyJson += " "; },
      (value: ReturnType<typeof input>) => { value.currentStatusBytes = Buffer.concat([value.currentStatusBytes, Buffer.from(" ")]); },
      (value: ReturnType<typeof input>) => { value.voterGuideBytes = Buffer.concat([value.voterGuideBytes, Buffer.from(" ")]); },
      (value: ReturnType<typeof input>) => { value.sourcePageBytes = Buffer.concat([value.sourcePageBytes, Buffer.from(" ")]); },
      (value: ReturnType<typeof input>) => { value.planBlocksBytes = Buffer.concat([value.planBlocksBytes, Buffer.from(" ")]); },
      (value: ReturnType<typeof input>) => { value.currentBlocksBytes = Buffer.concat([value.currentBlocksBytes, Buffer.from(" ")]); },
      (value: ReturnType<typeof input>) => { value.sourceLock.entries.find((row: { id: string }) => row.id === "ca-ab604-block-equivalency-extract-20260806").parentIds = []; },
    ]) {
      const value = input();
      mutate(value);
      expect(() => buildCalifornia2026PrimaryBlockCrosswalkCandidate(value)).toThrow("CA_2026_PRIMARY_BLOCK_CROSSWALK_INVALID");
    }
  });

  it("rejects near-match promotion, approval, scoring, publication, formula conversion, reviewer fabrication, and unknown fields", () => {
    const currentInput = input();
    const mutations: Array<(value: MutableCandidate) => void> = [
      (value) => { const row = value.rows.find((candidate) => candidate.districtCode === "12")!; row.compatibilityDisposition = "exact_block_membership_candidate"; row.compatibilityCandidate = true; },
      (value) => { value.methodology.overlapThresholdUsed = true; },
      (value) => { value.methodology.blockCountsArePopulationWeighted = true; },
      (value) => { value.rows[0]!.compatibilityApproved = true; },
      (value) => { value.rows[0]!.scoreEligible = true; },
      (value) => { value.publicationEligible = true; },
      (value) => { value.rows[0]!.formulaApplicability = "party_primary_metrics_compatible"; },
      (value) => { value.review.reviewer = "fabricated-reviewer"; },
      (value) => { value.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(buildCalifornia2026PrimaryBlockCrosswalkCandidate(currentInput)) as unknown as MutableCandidate;
      mutate(value);
      expect(() => validateCalifornia2026PrimaryBlockCrosswalkCandidate(value as never, currentInput)).toThrow("CA_2026_PRIMARY_BLOCK_CROSSWALK_INVALID:semantic_or_hash_drift");
    }
  }, 60_000);
});
