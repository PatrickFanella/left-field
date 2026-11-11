import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildNewYork2022PrimaryBlockCrosswalkCandidate, validateNewYork2022PrimaryBlockCrosswalkCandidate } from "./new-york-2022-primary-block-crosswalk-candidate";

const input = () => ({
  geographyJson: readFileSync("data/metadata/new-york-primary-geography-compatibility-candidate-v1.json", "utf8"),
  receiptJson: readFileSync("data/metadata/new-york-2022-congressional-block-assignment-receipt-v1.json", "utf8"),
  authorityBytes: readFileSync("data/source/elections/primary-results/geography/new-york/2022/latfor-2022-congressional-maps.html"),
  assignmentBytes: readFileSync("data/source/elections/primary-results/geography/new-york/2022/court-ordered-congressional-block-assignment.dbf"),
  cd118Bytes: readFileSync("data/source/elections/primary-results/geography/new-york/historical/36_NY_CD118.txt"),
  cd119Bytes: readFileSync("data/source/elections/primary-results/geography/new-york/current/36_NY_CD119.txt"),
  sourceLock: JSON.parse(readFileSync("data/source-lock.json", "utf8")),
});
type MutableCandidate = { rows: Array<Record<string, unknown>>; methodology: Record<string, unknown>; publicationEligible: boolean; [key: string]: unknown };

describe("New York 2022 primary block crosswalk candidate", () => {
  it("produces four exact membership candidates and retains fifteen split rows for review", () => {
    const value = buildNewYork2022PrimaryBlockCrosswalkCandidate(input());
    expect(value.summary).toEqual({ targetObservations: 19, exactBlockMembershipCandidates: 4, crosswalkReviewRequired: 15, sourceBlocks: 288819, targetBlocks: 288819, sharedBlocks: 288819, changedDistrictAssignments: 25881, automaticallyApprovedRows: 0, scoreEligibleRows: 0 });
    expect(value.rows.filter((row) => row.compatibilityCandidate).map((row) => row.districtCode)).toEqual(["04", "05", "12", "13"]);
    expect(value.rows.every((row) => row.sourceToTargetSplits.reduce((sum, split) => sum + split.blockCount, 0) === row.sourceBlockCount && row.sourceToTargetSplits.reduce((sum, split) => sum + split.sourceSharePpm, 0) === 1_000_000)).toBe(true);
    expect(value.rows.find((row) => row.districtCode === "03")).toMatchObject({ sourceBlockCount: 10889, sameDistrictBlockCount: 9985, compatibilityDisposition: "crosswalk_review_required", compatibilityCandidate: false, compatibilityApproved: false, scoreEligible: false });
    expect(value.rows.every((row) => row.blockCountMeaning === "2020_census_tabulation_blocks_not_population_voters_or_electoral_weight")).toBe(true);
    expect(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).toEqual(readFileSync("data/metadata/new-york-2022-primary-block-crosswalk-candidate-v1.json"));
  });

  it("rejects parent bytes, source-lock drift, and block-universe substitution", () => {
    const geography = input(); geography.geographyJson += " "; expect(() => buildNewYork2022PrimaryBlockCrosswalkCandidate(geography)).toThrow("NY_2022_PRIMARY_BLOCK_CROSSWALK_INVALID");
    const receipt = input(); receipt.receiptJson += " "; expect(() => buildNewYork2022PrimaryBlockCrosswalkCandidate(receipt)).toThrow("NY_2022_PRIMARY_BLOCK_CROSSWALK_INVALID");
    const current = input(); current.cd119Bytes = Buffer.concat([current.cd119Bytes, Buffer.from(" ")]); expect(() => buildNewYork2022PrimaryBlockCrosswalkCandidate(current)).toThrow("NY_2022_BLOCK_ASSIGNMENT_RECEIPT_INVALID");
    const lock = input(); lock.sourceLock.entries.find((entry: { id: string }) => entry.id === "census-cd119-new-york-block-equivalency-extract-20260805").parentIds = []; expect(() => buildNewYork2022PrimaryBlockCrosswalkCandidate(lock)).toThrow("NY_2022_PRIMARY_BLOCK_CROSSWALK_INVALID");
    const outputLock = input(); outputLock.sourceLock.entries.find((entry: { id: string }) => entry.id === "new-york-2022-primary-block-crosswalk-candidate-v1").parentIds = []; expect(() => buildNewYork2022PrimaryBlockCrosswalkCandidate(outputLock)).toThrow("NY_2022_PRIMARY_BLOCK_CROSSWALK_INVALID");
  });

  it("rejects threshold promotion, population claims, approval, scoring, publication, 2024 rows, and unknown fields", () => {
    const currentInput = input();
    const mutations: Array<(value: MutableCandidate) => void> = [
      (value) => { const row = value.rows.find((candidate) => candidate.districtCode === "03"); if (!row) throw new Error("missing fixture row"); row.compatibilityDisposition = "exact_block_membership_candidate"; row.compatibilityCandidate = true; },
      (value) => { value.methodology.overlapThresholdUsed = true; },
      (value) => { value.methodology.blockCountsArePopulationWeighted = true; },
      (value) => { value.rows[0].compatibilityApproved = true; },
      (value) => { value.rows[0].scoreEligible = true; },
      (value) => { value.publicationEligible = true; },
      (value) => { value.rows[0].cycleYear = 2024; },
      (value) => { value.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(buildNewYork2022PrimaryBlockCrosswalkCandidate(currentInput)) as unknown as MutableCandidate;
      mutate(value);
      expect(() => validateNewYork2022PrimaryBlockCrosswalkCandidate(value as never, currentInput)).toThrow("NY_2022_PRIMARY_BLOCK_CROSSWALK_INVALID:semantic_or_hash_drift");
    }
  }, 120_000);
});
