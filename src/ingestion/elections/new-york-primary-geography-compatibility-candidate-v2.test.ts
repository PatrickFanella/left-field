import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildNewYorkPrimaryGeographyCandidateV2, validateNewYorkPrimaryGeographyCandidateV2 } from "./new-york-primary-geography-compatibility-candidate-v2";

const input = () => ({
  geographyV1Json: readFileSync("data/metadata/new-york-primary-geography-compatibility-candidate-v1.json", "utf8"),
  crosswalkJson: readFileSync("data/metadata/new-york-2022-primary-block-crosswalk-candidate-v1.json", "utf8"),
  receiptJson: readFileSync("data/metadata/new-york-2022-congressional-block-assignment-receipt-v1.json", "utf8"),
  authorityBytes: readFileSync("data/source/elections/primary-results/geography/new-york/2022/latfor-2022-congressional-maps.html"),
  assignmentBytes: readFileSync("data/source/elections/primary-results/geography/new-york/2022/court-ordered-congressional-block-assignment.dbf"),
  cd118Bytes: readFileSync("data/source/elections/primary-results/geography/new-york/historical/36_NY_CD118.txt"),
  cd119Bytes: readFileSync("data/source/elections/primary-results/geography/new-york/current/36_NY_CD119.txt"),
  sourceLock: JSON.parse(readFileSync("data/source-lock.json", "utf8")),
});
type MutablePackage = { rows: Array<Record<string, unknown>>; methodology: Record<string, unknown>; review: Record<string, unknown>; publicationEligible: boolean; [key: string]: unknown };

describe("New York primary geography compatibility candidate v2", () => {
  it("composes four historical exact-block candidates and retains fifteen split rows", () => {
    const value = buildNewYorkPrimaryGeographyCandidateV2(input());
    expect(value.summary).toEqual({ identityObservations: 38, identityProposedLinkRows: 12, identityReportedNoMatchRows: 4, identityNonreportedRows: 22, historicalExactBlockMembershipCandidates: 4, historicalCrosswalkReviewRequired: 15, currentExactCd119SessionKeyCandidates: 19, compatibilityCandidates: 23, automaticallyApprovedRows: 0, scoreEligibleRows: 0 });
    expect(value.rows.filter((row) => row.cycleYear === 2022 && row.compatibilityCandidate).map((row) => row.districtCode)).toEqual(["04", "05", "12", "13"]);
    expect(value.rows.filter((row) => row.cycleYear === 2022 && !row.compatibilityCandidate)).toHaveLength(15);
    expect(value.rows.filter((row) => row.cycleYear === 2024).every((row) => row.historicalBlockCrosswalk === null && row.compatibilityCandidate)).toBe(true);
    expect(value.rows.every((row) => !row.compatibilityApproved && !row.identityApproved && !row.scoreEligible)).toBe(true);
    expect(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).toEqual(readFileSync("data/metadata/new-york-primary-geography-compatibility-candidate-v2.json"));
  }, 15_000);

  it("rejects parent bytes, lineage drift, and output-lock drift", () => {
    const parent = input(); parent.crosswalkJson += " "; expect(() => buildNewYorkPrimaryGeographyCandidateV2(parent)).toThrow("NY_PRIMARY_GEOGRAPHY_V2_INVALID");
    const lock = input(); lock.sourceLock.entries.find((entry: { id: string }) => entry.id === "new-york-2022-primary-block-crosswalk-candidate-v1").parentIds = []; expect(() => buildNewYorkPrimaryGeographyCandidateV2(lock)).toThrow();
    const outputLock = input(); outputLock.sourceLock.entries.find((entry: { id: string }) => entry.id === "new-york-primary-geography-compatibility-candidate-v2").parentIds = []; expect(() => buildNewYorkPrimaryGeographyCandidateV2(outputLock)).toThrow("NY_PRIMARY_GEOGRAPHY_V2_INVALID");
  });

  it("rejects threshold promotion, approval, publication, parent-disposition drift, and unknown fields", () => {
    const currentInput = input(), base = buildNewYorkPrimaryGeographyCandidateV2(currentInput);
    const mutations: Array<(value: MutablePackage) => void> = [
      (value) => { value.methodology.overlapThresholdUsed = true; },
      (value) => { const row = value.rows.find((candidate) => candidate.districtCode === "03" && candidate.cycleYear === 2022); if (!row) throw new Error("missing fixture"); row.compatibilityCandidate = true; },
      (value) => { value.rows[0]!.compatibilityApproved = true; },
      (value) => { value.rows[0]!.resultDisposition = "certified_uncontested"; },
      (value) => { value.publicationEligible = true; },
      (value) => { value.review.reviewer = "fabricated"; },
      (value) => { value.unexpected = true; },
    ];
    for (const mutate of mutations) { const value = structuredClone(base) as unknown as MutablePackage; mutate(value); expect(() => validateNewYorkPrimaryGeographyCandidateV2(value as never, currentInput)).toThrow("NY_PRIMARY_GEOGRAPHY_V2_INVALID:semantic_or_hash_drift"); }
  }, 60_000);
});
