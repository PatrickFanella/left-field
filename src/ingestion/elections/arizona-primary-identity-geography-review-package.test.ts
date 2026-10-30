/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-package mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildArizonaPrimaryJointReviewPackage,
  validateArizonaPrimaryJointReviewPackage,
} from "./arizona-primary-identity-geography-review-package";

const text = (path: string): string => readFileSync(path, "utf8");
const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") };
};
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const build = (options?: { geographyJson?: string; sourceLockJson?: string }) =>
  buildArizonaPrimaryJointReviewPackage({
    proposalJson: text("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json"),
    identityJson: text("data/metadata/arizona-current-incumbent-primary-linkage-candidate-v1.json"),
    geographyJson: options?.geographyJson ?? text("data/metadata/arizona-primary-geography-compatibility-candidate-v1.json"),
    sourceLockJson: options?.sourceLockJson ?? text("data/source-lock.json"),
  });

describe("Arizona primary identity/geography joint reviewer package", () => {
  it("rebuilds the persisted package exactly", () => {
    expect(build()).toEqual(validateArizonaPrimaryJointReviewPackage(
      json("data/metadata/arizona-primary-identity-geography-review-package-v1.json").value,
    ));
  });

  it("joins three identity/geography candidates and three geography-only identity-unresolved rows", () => {
    const value = build();
    expect(value.summary).toEqual({
      reviewRecords: 6,
      identityAndGeographyCandidates: 3,
      geographyCandidateIdentityUnresolved: 3,
      identityCandidates: 3,
      geographyCandidates: 6,
      certifiedCanvassAuthorityRecords: 6,
      reportedContestRecords: 6,
      proposedDecisions: 5,
      jointApprovedRecords: 0,
      scoreEligibleRecords: 0,
    });
    const predecessor = value.records.find((row) => row.reviewRecordId === "az-primary-joint:2022:07");
    expect(predecessor).toMatchObject({
      reviewCategory: "geography_candidate_identity_unresolved",
      identity: { status: "unresolved", identityStatus: "reported_contest_no_unique_candidate_match", sourceCandidateName: null, candidate: false, approved: false },
      geography: { status: "candidate", candidate: true, approved: false },
      resultAuthorityStatus: "certified_official_statewide_canvass",
      resultRevisionStatus: "initial_canvass_final_for_contest",
      sourceWinnerStatus: "marked_by_source",
      jointApproved: false,
      scoreEligible: false,
    });
  });

  it("keeps five review decisions independent and unresolved", () => {
    const value = build();
    expect(value.decisions.map((row) => [row.decisionId, row.evidenceRecordIds.length])).toEqual([
      ["az-primary:accept-certification-authority-v1", 6],
      ["az-primary:accept-geography-compatibility-v1", 6],
      ["az-primary:accept-identity-links-v1", 3],
      ["az-primary:retain-primary-disposition-exclusion-v1", 6],
      ["az-primary:retain-progressive-classification-exclusion-v1", 6],
    ]);
    expect(value.decisions.every((row) =>
      row.review.status === "proposed" && row.review.reviewer === null && row.review.reviewedAt === null &&
      row.review.resolution === null && row.blocksAffectedPublication && !row.blocksOtherWork
    )).toBe(true);
    expect(value.inheritedDecisionResolutions).toEqual({
      certification: null,
      identity: null,
      geography: null,
      disposition: null,
      progressiveClassification: null,
    });
  });

  it("rejects parent join drift and fully rehashed fabricated review approval", () => {
    const geography = json("data/metadata/arizona-primary-geography-compatibility-candidate-v1.json").value as any;
    geography.rows[0].identityRowSha256 = "0".repeat(64);
    expect(() => build({ geographyJson: `${JSON.stringify(geography, null, 2)}\n` })).toThrow();

    const drifted = structuredClone(build()) as any;
    drifted.review.status = "approved";
    drifted.review.reviewer = "fabricated-reviewer";
    drifted.decisions[0].review.status = "approved";
    drifted.decisions[0].review.resolution = "approved";
    drifted.records[0].jointApproved = true;
    const unsignedRecord = structuredClone(drifted.records[0]);
    delete unsignedRecord.reviewRecordSha256;
    drifted.records[0].reviewRecordSha256 = digest("dsa-seats:az-primary-joint-review-row:v1\0", unsignedRecord);
    drifted.reviewRecordSetSha256 = digest("dsa-seats:az-primary-joint-review-row-set:v1\0", drifted.records);
    drifted.decisionSetSha256 = digest("dsa-seats:az-primary-joint-decision-set:v1\0", drifted.decisions);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:az-primary-joint-review-package:v1\0", unsigned);
    expect(() => validateArizonaPrimaryJointReviewPackage(drifted)).toThrow("LIFECYCLE_INVALID");
  });

  it("retains the exact three-parent proposal lineage and rejects output drift", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/arizona-primary-identity-geography-review-package-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "arizona-primary-identity-geography-review-package-v1")).toEqual([{
      id: "arizona-primary-identity-geography-review-package-v1",
      url: "urn:dsa-seats:arizona-primary-identity-geography-review-package:v1:2026-08-06",
      retainedPath: "data/metadata/arizona-primary-identity-geography-review-package-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_proposal",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "arizona-current-incumbent-primary-linkage-candidate-v1",
        "arizona-primary-geography-compatibility-candidate-v1",
      ],
    license: "unknown", }]);
    const drifted = structuredClone(lock);
    drifted.entries.find((entry: any) => entry.id === "arizona-primary-identity-geography-review-package-v1").parentIds = [];
    expect(() => build({ sourceLockJson: `${JSON.stringify(drifted, null, 2)}\n` })).toThrow("SOURCE_LOCK_MISMATCH");
  });
});
