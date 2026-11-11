import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildNewYorkPrimaryJointReviewPackageV2, validateNewYorkPrimaryJointReviewPackageV2 } from "./new-york-primary-identity-geography-review-package-v2";
const input = () => ({
  jointV1Json: readFileSync("data/metadata/new-york-primary-identity-geography-review-package-v1.json", "utf8"), geographyV2Json: readFileSync("data/metadata/new-york-primary-geography-compatibility-candidate-v2.json", "utf8"), geographyV1Json: readFileSync("data/metadata/new-york-primary-geography-compatibility-candidate-v1.json", "utf8"), crosswalkJson: readFileSync("data/metadata/new-york-2022-primary-block-crosswalk-candidate-v1.json", "utf8"), receiptJson: readFileSync("data/metadata/new-york-2022-congressional-block-assignment-receipt-v1.json", "utf8"), authorityBytes: readFileSync("data/source/elections/primary-results/geography/new-york/2022/latfor-2022-congressional-maps.html"), assignmentBytes: readFileSync("data/source/elections/primary-results/geography/new-york/2022/court-ordered-congressional-block-assignment.dbf"), cd118Bytes: readFileSync("data/source/elections/primary-results/geography/new-york/historical/36_NY_CD118.txt"), cd119Bytes: readFileSync("data/source/elections/primary-results/geography/new-york/current/36_NY_CD119.txt"), sourceLock: JSON.parse(readFileSync("data/source-lock.json", "utf8")),
});
type MutablePackage = { records: Array<Record<string, unknown>>; decisions: Array<Record<string, unknown>>; review: Record<string, unknown>; methodology: Record<string, unknown>; publicationEligible: boolean; [key: string]: unknown };
describe("New York primary identity/geography joint reviewer package v2", () => {
  it("recomposes the exact seven-category matrix without approval", () => {
    const value = buildNewYorkPrimaryJointReviewPackageV2(input());
    expect(value.summary).toMatchObject({ reviewRecords: 38, identityAndExactBlockMembershipCandidates: 2, exactBlockMembershipCandidateIdentityNotApplicable: 2, identityCandidateBlockCrosswalkPending: 6, blockCrosswalkPendingIdentityNoMatch: 4, blockCrosswalkPendingIdentityNotApplicable: 5, identityAndGeographyCandidates: 4, geographyCandidateIdentityNotApplicable: 15, historicalExactBlockMembershipCandidates: 4, historicalCrosswalkReviewRequired: 15, geographyCandidates: 23, jointApprovedRecords: 0, scoreEligibleRecords: 0 });
    expect(value.records.filter((row) => row.cycleYear === 2022 && row.geography.candidate).map((row) => row.districtCode)).toEqual(["04", "05", "12", "13"]);
    expect(value.records.every((row) => !row.jointApproved && !row.identity.approved && !row.geography.approved && !row.historicalBlockCrosswalk?.approved && !row.scoreEligible)).toBe(true);
    expect(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).toEqual(readFileSync("data/metadata/new-york-primary-identity-geography-review-package-v2.json"));
  }, 15_000);
  it("keeps five scoped decisions and all reviewer state null", () => {
    const value = buildNewYorkPrimaryJointReviewPackageV2(input());
    expect(value.decisions.map((row) => [row.decisionId, row.evidenceRecordIds.length])).toEqual([["ny-primary:accept-identity-links-v2", 12], ["ny-primary:retain-primary-disposition-exclusion-v2", 38], ["ny-primary:retain-progressive-classification-exclusion-v2", 38], ["ny-primary:retain-reported-result-authority-boundaries-v2", 16], ["ny-primary:review-2022-block-crosswalk-and-retain-2024-session-keys-v2", 38]]);
    expect(value.decisions.every((row) => row.review.reviewer === null && row.review.reviewedAt === null && row.review.resolution === null)).toBe(true);
  }, 15_000);
  it("rejects parent drift, fabricated approval, scoring, legal-use claims, and unknown fields", () => {
    const currentInput = input(), base = buildNewYorkPrimaryJointReviewPackageV2(currentInput);
    const parent = input(); parent.geographyV2Json += " "; expect(() => buildNewYorkPrimaryJointReviewPackageV2(parent)).toThrow("NY_PRIMARY_JOINT_REVIEW_V2_INVALID");
    const outputLock = input(); outputLock.sourceLock.entries.find((entry: { id: string }) => entry.id === "new-york-primary-identity-geography-review-package-v2").parentIds = []; expect(() => buildNewYorkPrimaryJointReviewPackageV2(outputLock)).toThrow("NY_PRIMARY_JOINT_REVIEW_V2_INVALID");
    const mutations: Array<(value: MutablePackage) => void> = [(value) => { value.records[0]!.jointApproved = true; }, (value) => { value.records[0]!.scoreEligible = true; }, (value) => { value.decisions[0]!.review = { status: "approved" }; }, (value) => { value.methodology.electionUseAssessed = true; }, (value) => { value.publicationEligible = true; }, (value) => { value.unexpected = true; }];
    for (const mutate of mutations) { const value = structuredClone(base) as unknown as MutablePackage; mutate(value); expect(() => validateNewYorkPrimaryJointReviewPackageV2(value as never, currentInput)).toThrow("NY_PRIMARY_JOINT_REVIEW_V2_INVALID:semantic_or_hash_drift"); }
  }, 60_000);
});
