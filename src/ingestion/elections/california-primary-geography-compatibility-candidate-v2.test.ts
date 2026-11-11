import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCaliforniaPrimaryGeographyCandidateV2, validateCaliforniaPrimaryGeographyCandidateV2 } from "./california-primary-geography-compatibility-candidate-v2";

const input = () => ({
  geographyV1Json: readFileSync("data/metadata/california-primary-geography-compatibility-candidate-v1.json", "utf8"),
  crosswalkJson: readFileSync("data/metadata/california-2026-primary-block-crosswalk-candidate-v1.json", "utf8"),
  currentStatusBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/california-redistricting-status.html"),
  voterGuideBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/prop50-official-voter-guide.pdf"),
  sourcePageBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/2025-congressional-districts.html"),
  planBlocksBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/06_CA_CD120_AB604.txt"),
  currentBlocksBytes: readFileSync("data/source/elections/primary-results/geography/california/current/06_CA_CD119.txt"),
  sourceLock: JSON.parse(readFileSync("data/source-lock.json", "utf8")),
});
type MutablePackage = { rows: Array<Record<string, unknown>>; methodology: Record<string, unknown>; review: Record<string, unknown>; publicationEligible: boolean; [key: string]: unknown };

describe("California primary geography compatibility candidate v2", () => {
  it("replaces only the 52 collection-pending rows with four exact candidates and 48 split reviews", () => {
    const value = buildCaliforniaPrimaryGeographyCandidateV2(input());

    expect(value.summary).toEqual({
      contestCycleObservations: 156,
      cd118ToCd119PlanContinuityCandidates: 52,
      exactCd119SessionKeyCandidates: 52,
      cd120ExactBlockMembershipCandidates: 4,
      cd120CrosswalkReviewRequired: 48,
      compatibilityCandidates: 108,
      automaticallyApprovedRows: 0,
      scoreEligibleRows: 0,
    });
    const inherited = value.rows.filter((row) => row.cycleYear !== 2026);
    const current = value.rows.filter((row) => row.cycleYear === 2026);
    expect(inherited).toHaveLength(104);
    expect(inherited.every((row) => row.planBlockCrosswalk === null && row.compatibilityCandidate)).toBe(true);
    expect(current.filter((row) => row.compatibilityCandidate).map((row) => row.districtCode)).toEqual(["34", "36", "37", "43"]);
    expect(current.filter((row) => !row.compatibilityCandidate)).toHaveLength(48);
    expect(current.every((row) => row.historicalGeoid === null && row.planBlockCrosswalk !== null)).toBe(true);
    const district12 = current.find((row) => row.districtCode === "12");
    expect(district12?.compatibilityCandidate).toBe(false);
    expect(district12?.planBlockCrosswalk).toMatchObject({ sourceBlockCount: 8894, targetBlockCount: 8895, sameDistrictBlockCount: 8894 });
    expect(value.rows.every((row) => row.formulaApplicability === "confirmed_incompatible_with_party_primary_metrics" && !row.compatibilityApproved && !row.identityApproved && !row.scoreEligible)).toBe(true);
    expect(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).toEqual(readFileSync("data/metadata/california-primary-geography-compatibility-candidate-v2.json"));
  }, 15_000);

  it("rejects parent bytes, authority bytes, lineage drift, and output-lock drift", () => {
    const geography = input(); geography.geographyV1Json += " "; expect(() => buildCaliforniaPrimaryGeographyCandidateV2(geography)).toThrow("CA_PRIMARY_GEOGRAPHY_V2_INVALID:input_bytes");
    const crosswalk = input(); crosswalk.crosswalkJson += " "; expect(() => buildCaliforniaPrimaryGeographyCandidateV2(crosswalk)).toThrow("CA_PRIMARY_GEOGRAPHY_V2_INVALID:input_bytes");
    const authority = input(); authority.sourcePageBytes = Buffer.concat([authority.sourcePageBytes, Buffer.from(" ")]); expect(() => buildCaliforniaPrimaryGeographyCandidateV2(authority)).toThrow();
    const parentLock = input(); parentLock.sourceLock.entries.find((entry: { id: string }) => entry.id === "california-2026-primary-block-crosswalk-candidate-v1").parentIds = []; expect(() => buildCaliforniaPrimaryGeographyCandidateV2(parentLock)).toThrow();
    const outputLock = input(); outputLock.sourceLock.entries.find((entry: { id: string }) => entry.id === "california-primary-geography-compatibility-candidate-v2").parentIds = []; expect(() => buildCaliforniaPrimaryGeographyCandidateV2(outputLock)).toThrow("CA_PRIMARY_GEOGRAPHY_V2_INVALID");
  });

  it("rejects threshold promotion, approvals, scoring, publication, formula conversion, fabricated review, and unknown fields", () => {
    const currentInput = input();
    const base = buildCaliforniaPrimaryGeographyCandidateV2(currentInput);
    const mutations: Array<(value: MutablePackage) => void> = [
      (value) => { value.methodology.overlapThresholdUsed = true; },
      (value) => { const row = value.rows.find((candidate) => candidate.districtCode === "12" && candidate.cycleYear === 2026); if (!row) throw new Error("missing fixture"); row.compatibilityCandidate = true; },
      (value) => { const row = value.rows.find((candidate) => candidate.districtCode === "01" && candidate.cycleYear === 2026); if (!row) throw new Error("missing fixture"); row.compatibilityDisposition = "exact_2020_block_membership_candidate"; },
      (value) => { value.rows[0]!.compatibilityApproved = true; },
      (value) => { value.rows[0]!.identityApproved = true; },
      (value) => { value.rows[0]!.scoreEligible = true; },
      (value) => { value.rows[0]!.formulaApplicability = "applicable"; },
      (value) => { value.publicationEligible = true; },
      (value) => { value.review.reviewer = "fabricated"; },
      (value) => { value.unexpected = true; },
      (value) => { value.rows[0]!.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(base) as unknown as MutablePackage;
      mutate(value);
      expect(() => validateCaliforniaPrimaryGeographyCandidateV2(value as never, currentInput)).toThrow("CA_PRIMARY_GEOGRAPHY_V2_INVALID:semantic_or_hash_drift");
    }
  }, 60_000);
});
