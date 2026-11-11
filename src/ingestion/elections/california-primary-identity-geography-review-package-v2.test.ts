import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCaliforniaPrimaryIdentityGeographyReviewPackageV2, validateCaliforniaPrimaryIdentityGeographyReviewPackageV2 } from "./california-primary-identity-geography-review-package-v2";

const input = () => ({
  jointV1Json: readFileSync("data/metadata/california-primary-identity-geography-review-package-v1.json", "utf8"),
  geographyV2Json: readFileSync("data/metadata/california-primary-geography-compatibility-candidate-v2.json", "utf8"),
  geographyV1Json: readFileSync("data/metadata/california-primary-geography-compatibility-candidate-v1.json", "utf8"),
  crosswalkJson: readFileSync("data/metadata/california-2026-primary-block-crosswalk-candidate-v1.json", "utf8"),
  currentStatusBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/california-redistricting-status.html"),
  voterGuideBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/prop50-official-voter-guide.pdf"),
  sourcePageBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/2025-congressional-districts.html"),
  planBlocksBytes: readFileSync("data/source/elections/primary-results/geography/california/2026/06_CA_CD120_AB604.txt"),
  currentBlocksBytes: readFileSync("data/source/elections/primary-results/geography/california/current/06_CA_CD119.txt"),
  sourceLock: JSON.parse(readFileSync("data/source-lock.json", "utf8")),
});
type MutablePackage = { records: Array<Record<string, unknown>>; methodology: Record<string, unknown>; review: Record<string, unknown>; decisionSupport: { resolutions: Record<string, unknown> }; publicationEligible: boolean; [key: string]: unknown };

describe("California primary identity-geography review package v2", () => {
  it("promotes only the four exact CD120 geography candidates and retains 38 crosswalk-review rows", () => {
    const value = buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(input());
    expect(value.summary).toEqual({
      reviewRecords: 126,
      identityAndGeographyCandidates: 80,
      geographyCandidateIdentityUnresolved: 8,
      identityCandidateCrosswalkReviewRequired: 34,
      identityUnresolvedCrosswalkReviewRequired: 4,
      identityCandidates: 114,
      geographyCandidates: 88,
      jointApprovedRecords: 0,
      scoreEligibleRecords: 0,
    });
    const current = value.records.filter((record) => record.cycleYear === 2026);
    expect(current).toHaveLength(42);
    expect(current.filter((record) => record.geography.candidate).map((record) => record.districtCode)).toEqual(["34", "36", "37", "43"]);
    expect(current.filter((record) => record.geography.candidate).map((record) => record.linkageId)).toEqual([
      "ca:2026:regular:us-house:34:top-two:G000585",
      "ca:2026:regular:us-house:36:top-two:L000582",
      "ca:2026:regular:us-house:37:top-two:K000400",
      "ca:2026:regular:us-house:43:top-two:W000187",
    ]);
    expect(current.filter((record) => !record.geography.candidate)).toHaveLength(38);
    expect(current.every((record) => record.geography.planBlockCrosswalk !== null)).toBe(true);
    const district12 = current.find((record) => record.districtCode === "12");
    expect(district12?.geography).toMatchObject({ status: "crosswalk_review_required", candidate: false, planBlockCrosswalk: { sourceBlockCount: 8894, targetBlockCount: 8895, sameDistrictBlockCount: 8894 } });
    const parent = JSON.parse(readFileSync("data/metadata/california-primary-identity-geography-review-package-v1.json", "utf8"));
    const parentById = new Map(parent.records.map((record: { reviewRecordId: string }) => [record.reviewRecordId, record]));
    for (const record of value.records) {
      const parentRecord = parentById.get(record.reviewRecordId) as { identity: unknown; nominationSystem: string; formulaApplicability: string; evaluatorUse: string; rowSha256: string };
      expect(record.identity).toEqual(parentRecord.identity);
      expect(record.parentReviewRecordSha256).toBe(parentRecord.rowSha256);
      expect(record.nominationSystem).toBe(parentRecord.nominationSystem);
      expect(record.formulaApplicability).toBe(parentRecord.formulaApplicability);
      expect(record.evaluatorUse).toBe(parentRecord.evaluatorUse);
    }
    expect(value.decisionSupport.resolutions).toEqual({ identity: null, geography: null, topTwo: null });
    expect(value.records.every((record) => !record.identity.approved && !record.geography.approved && !record.jointApproved && !record.scoreEligible)).toBe(true);
    expect(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).toEqual(readFileSync("data/metadata/california-primary-identity-geography-review-package-v2.json"));
  }, 15_000);

  it("rejects parent bytes, authority bytes, parent lineage drift, and output-lock drift", () => {
    const joint = input(); joint.jointV1Json += " "; expect(() => buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(joint)).toThrow("CA_PRIMARY_JOINT_REVIEW_V2_INVALID:input_bytes");
    const geography = input(); geography.geographyV2Json += " "; expect(() => buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(geography)).toThrow("CA_PRIMARY_JOINT_REVIEW_V2_INVALID:input_bytes");
    const authority = input(); authority.sourcePageBytes = Buffer.concat([authority.sourcePageBytes, Buffer.from(" ")]); expect(() => buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(authority)).toThrow();
    const parentLock = input(); parentLock.sourceLock.entries.find((entry: { id: string }) => entry.id === "california-primary-geography-compatibility-candidate-v2").parentIds = []; expect(() => buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(parentLock)).toThrow();
    const outputLock = input(); outputLock.sourceLock.entries.find((entry: { id: string }) => entry.id === "california-primary-identity-geography-review-package-v2").parentIds = []; expect(() => buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(outputLock)).toThrow("CA_PRIMARY_JOINT_REVIEW_V2_INVALID");
  });

  it("rejects threshold claims, approvals, scoring, formula conversion, publication, fabricated review, decision closure, and unknown fields", () => {
    const currentInput = input();
    const base = buildCaliforniaPrimaryIdentityGeographyReviewPackageV2(currentInput);
    const mutations: Array<(value: MutablePackage) => void> = [
      (value) => { value.methodology.splitRowsPromotedByThreshold = true; },
      (value) => { value.records[0]!.jointApproved = true; },
      (value) => { (value.records[0]!.identity as Record<string, unknown>).approved = true; },
      (value) => { (value.records[0]!.geography as Record<string, unknown>).approved = true; },
      (value) => { value.records[0]!.scoreEligible = true; },
      (value) => { value.records[0]!.formulaApplicability = "applicable"; },
      (value) => { value.records[0]!.nominationSystem = "party_primary"; },
      (value) => { value.publicationEligible = true; },
      (value) => { value.review.reviewer = "fabricated"; },
      (value) => { value.decisionSupport.resolutions.geography = "approved"; },
      (value) => { value.unexpected = true; },
      (value) => { value.records[0]!.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(base) as unknown as MutablePackage;
      mutate(value);
      expect(() => validateCaliforniaPrimaryIdentityGeographyReviewPackageV2(value as never, currentInput)).toThrow("CA_PRIMARY_JOINT_REVIEW_V2_INVALID:semantic_or_hash_drift");
    }
  }, 60_000);
});
