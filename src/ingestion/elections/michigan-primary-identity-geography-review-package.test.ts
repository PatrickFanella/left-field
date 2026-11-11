/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-package mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildMichiganPrimaryJointReviewPackage,
  validateMichiganPrimaryJointReviewPackage,
} from "./michigan-primary-identity-geography-review-package";

const text = (path: string): string => readFileSync(path, "utf8");
const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") };
};
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const build = (options?: { geographyJson?: string; sourceLockJson?: string }) =>
  buildMichiganPrimaryJointReviewPackage({
    proposalJson: text("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json"),
    identityJson: text("data/metadata/michigan-current-incumbent-primary-linkage-candidate-v1.json"),
    geographyJson: options?.geographyJson ?? text("data/metadata/michigan-primary-geography-compatibility-candidate-v1.json"),
    sourceLockJson: options?.sourceLockJson ?? text("data/source-lock.json"),
  });

describe("Michigan primary identity/geography joint reviewer package", () => {
  it("rebuilds the persisted package exactly", () => {
    expect(build()).toEqual(validateMichiganPrimaryJointReviewPackage(
      json("data/metadata/michigan-primary-identity-geography-review-package-v1.json").value,
    ));
  });

  it("joins eleven identity/geography candidates and one geography-only identity-unresolved row", () => {
    const value = build();
    expect(value.summary).toEqual({
      reviewRecords: 12,
      identityAndGeographyCandidates: 11,
      geographyCandidateIdentityUnresolved: 1,
      identityCandidates: 11,
      geographyCandidates: 12,
      stateBoardCertifiedRecords: 12,
      reportedContestRecords: 12,
      proposedDecisions: 5,
      jointApprovedRecords: 0,
      scoreEligibleRecords: 0,
    });
    const mi08 = value.records.find((row) => row.reviewRecordId === "mi-primary-joint:2022:08");
    expect(mi08).toMatchObject({
      reviewCategory: "geography_candidate_identity_unresolved",
      identity: { status: "unresolved", identityStatus: "reported_contest_no_unique_candidate_match", sourceCandidateName: null, candidate: false, approved: false },
      geography: { status: "candidate", candidate: true, approved: false },
      certificationStatus: "state_board_event_certification_retained",
      sourceWinnerStatus: "not_marked_by_source",
      jointApproved: false,
      scoreEligible: false,
    });
  });

  it("keeps five review decisions independent and unresolved", () => {
    const value = build();
    expect(value.decisions.map((row) => [row.decisionId, row.evidenceRecordIds.length])).toEqual([
      ["mi-primary:accept-certification-authority-v1", 12],
      ["mi-primary:accept-geography-compatibility-v1", 12],
      ["mi-primary:accept-identity-links-v1", 11],
      ["mi-primary:retain-primary-disposition-exclusion-v1", 12],
      ["mi-primary:retain-progressive-classification-exclusion-v1", 12],
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
    const geography = json("data/metadata/michigan-primary-geography-compatibility-candidate-v1.json").value as any;
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
    drifted.records[0].reviewRecordSha256 = digest("dsa-seats:mi-primary-joint-review-row:v1\0", unsignedRecord);
    drifted.reviewRecordSetSha256 = digest("dsa-seats:mi-primary-joint-review-row-set:v1\0", drifted.records);
    drifted.decisionSetSha256 = digest("dsa-seats:mi-primary-joint-decision-set:v1\0", drifted.decisions);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:mi-primary-joint-review-package:v1\0", unsigned);
    expect(() => validateMichiganPrimaryJointReviewPackage(drifted)).toThrow("LIFECYCLE_INVALID");
  });

  it("retains the exact three-parent proposal lineage and rejects output drift", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/michigan-primary-identity-geography-review-package-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "michigan-primary-identity-geography-review-package-v1")).toEqual([{
      id: "michigan-primary-identity-geography-review-package-v1",
      url: "urn:dsa-seats:michigan-primary-identity-geography-review-package:v1:2026-08-05",
      retainedPath: "data/metadata/michigan-primary-identity-geography-review-package-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_proposal",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "michigan-current-incumbent-primary-linkage-candidate-v1",
        "michigan-primary-geography-compatibility-candidate-v1",
      ],
    license: "unknown", }]);
    const drifted = structuredClone(lock);
    drifted.entries.find((entry: any) => entry.id === "michigan-primary-identity-geography-review-package-v1").parentIds = [];
    expect(() => build({ sourceLockJson: `${JSON.stringify(drifted, null, 2)}\n` })).toThrow("SOURCE_LOCK_MISMATCH");
  });
});
