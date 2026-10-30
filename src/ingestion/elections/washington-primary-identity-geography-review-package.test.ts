/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-package mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { buildWashingtonPrimaryJointReviewPackage, validateWashingtonPrimaryJointReviewPackage } from "./washington-primary-identity-geography-review-package";

const text = (path: string): string => readFileSync(path, "utf8");
const json = (path: string) => { const bytes = readFileSync(path); return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") }; };
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const build = (options?: { geographyJson?: string; sourceLockJson?: string }) => buildWashingtonPrimaryJointReviewPackage({
  proposalJson: text("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json"),
  formulaAuthorityJson: text("data/metadata/filing-runway-exception-authority-proposal-20260804-v1.json"),
  identityJson: text("data/metadata/washington-current-incumbent-top-two-linkage-candidate-v1.json"),
  geographyJson: options?.geographyJson ?? text("data/metadata/washington-primary-geography-compatibility-candidate-v1.json"),
  sourceLockJson: options?.sourceLockJson ?? text("data/source-lock.json"),
});

describe("Washington primary identity/geography joint reviewer package", () => {
  it("rebuilds the persisted package exactly", () => {
    expect(build()).toEqual(validateWashingtonPrimaryJointReviewPackage(json("data/metadata/washington-primary-identity-geography-review-package-v1.json").value));
  });

  it("joins fifteen identity/geography candidates and one geography-only identity no-match", () => {
    const value = build();
    expect(value.summary).toEqual({ reviewRecords: 16, identityAndGeographyCandidates: 15, geographyCandidateIdentityUnresolved: 1, identityCandidates: 15, geographyCandidates: 16, certifiedTopTwoRecords: 16, proposedDecisions: 5, jointApprovedRecords: 0, scoreEligibleRecords: 0 });
    expect(value.records.filter((row) => row.reviewCategory === "geography_candidate_identity_unresolved").map((row) => row.reviewRecordId)).toEqual(["wa-primary-joint:2022:06"]);
    expect(value.records.every((row) => row.certificationStatus === "certified" && row.nominationSystem === "top_two" && row.formulaApplicability === "confirmed_incompatible" && row.sourceWinnerStatus === "not_established" && !row.jointApproved && !row.scoreEligible)).toBe(true);
  });

  it("keeps five independently sourced review decisions unresolved with exact evidence scopes", () => {
    const value = build();
    expect(value.decisions.map((row) => [row.decisionId, row.parentDecisionId, row.evidenceRecordIds.length])).toEqual([
      ["wa-primary:accept-geography-compatibility-v1", "approve-historical-district-cd119-compatibility-v1", 16],
      ["wa-primary:accept-identity-links-v1", "approve-historic-primary-candidate-identity-resolution-v1", 15],
      ["wa-primary:retain-certified-top-two-result-authority-v1", "collect-official-state-primary-results-and-certification-v1", 16],
      ["wa-primary:retain-progressive-classification-exclusion-v1", "approve-progressive-candidate-classification-method-v1", 16],
      ["wa-primary:retain-top-two-formula-exclusion-v1", "exclude-washington-top-two-from-partisan-primary-v01", 16],
    ]);
    expect(value.decisions.every((row) => row.review.status === "proposed" && row.review.reviewer === null && row.review.reviewedAt === null && row.review.resolution === null && row.blocksAffectedPublication && !row.blocksOtherWork)).toBe(true);
    expect(value.inputs.formulaAuthority).toMatchObject({ decisionId: "exclude-washington-top-two-from-partisan-primary-v01", resolution: null, electionPath: "top_two_non_nominating", formulaApplicability: "confirmed_incompatible" });
  });

  it("retains exact four-parent proposal lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/washington-primary-identity-geography-review-package-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "washington-primary-identity-geography-review-package-v1")).toEqual([{
      id: "washington-primary-identity-geography-review-package-v1",
      url: "urn:dsa-seats:washington-primary-identity-geography-review-package:v1:2026-08-06",
      retainedPath: "data/metadata/washington-primary-identity-geography-review-package-v1.json",
      retainedStatus: "retained", byteSize: artifact.bytes.length, sha256: artifact.sha256, kind: "review_proposal",
      parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "filing-runway-exception-authority-proposal-20260804-v1", "washington-current-incumbent-top-two-linkage-candidate-v1", "washington-primary-geography-compatibility-candidate-v1"],
    license: "unknown", }]);
  });

  it("rejects parent join drift, source-lock drift, and fully rehashed fabricated approval", () => {
    const geography = json("data/metadata/washington-primary-geography-compatibility-candidate-v1.json").value as any;
    geography.rows[0].identityRowSha256 = "0".repeat(64);
    expect(() => build({ geographyJson: `${JSON.stringify(geography, null, 2)}\n` })).toThrow();

    const lock = json("data/source-lock.json").value as any;
    lock.entries.find((entry: any) => entry.id === "filing-runway-exception-authority-proposal-20260804-v1").parentIds = [];
    expect(() => build({ sourceLockJson: `${JSON.stringify(lock, null, 2)}\n` })).toThrow("SOURCE_LOCK_MISMATCH");

    const drifted = structuredClone(build()) as any;
    drifted.review.status = "approved";
    drifted.review.reviewer = "fabricated-reviewer";
    drifted.decisions[0].review.status = "approved";
    drifted.decisions[0].review.resolution = "approved";
    drifted.records[0].jointApproved = true;
    const unsignedRecord = structuredClone(drifted.records[0]); delete unsignedRecord.reviewRecordSha256;
    drifted.records[0].reviewRecordSha256 = digest("dsa-seats:wa-primary-joint-review-row:v1\0", unsignedRecord);
    drifted.reviewRecordSetSha256 = digest("dsa-seats:wa-primary-joint-review-row-set:v1\0", drifted.records);
    drifted.decisionSetSha256 = digest("dsa-seats:wa-primary-joint-decision-set:v1\0", drifted.decisions);
    const unsigned = structuredClone(drifted); delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:wa-primary-joint-review-package:v1\0", unsigned);
    expect(() => validateWashingtonPrimaryJointReviewPackage(drifted)).toThrow("LIFECYCLE_INVALID");
  });
});
