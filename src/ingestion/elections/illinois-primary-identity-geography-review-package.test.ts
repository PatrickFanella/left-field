/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial persisted package mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildIllinoisPrimaryIdentityGeographyReviewPackage,
  validateIllinoisPrimaryIdentityGeographyReviewPackage,
} from "./illinois-primary-identity-geography-review-package";

const text = (path: string): string => readFileSync(path, "utf8");
const file = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
};
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

function build(options?: { identityJson?: string; sourceLockJson?: string }) {
  return buildIllinoisPrimaryIdentityGeographyReviewPackage({
    proposalJson: text("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json"),
    identityJson: options?.identityJson ?? text("data/metadata/illinois-current-incumbent-primary-linkage-candidate-v1.json"),
    geographyJson: text("data/metadata/illinois-primary-geography-compatibility-candidate-v1.json"),
    sourceLockJson: options?.sourceLockJson ?? text("data/source-lock.json"),
  });
}

describe("Illinois primary identity/geography joint reviewer package", () => {
  it("rebuilds the persisted reviewer package exactly", () => {
    expect(build()).toEqual(validateIllinoisPrimaryIdentityGeographyReviewPackage(
      JSON.parse(text("data/metadata/illinois-primary-identity-geography-review-package-v1.json")),
    ));
  });

  it("accounts for all 34 geography rows without inventing six out-of-scope identities", () => {
    const value = build();
    expect(value.summary).toEqual({
      reviewRecords: 34,
      identityAndGeographyCandidates: 28,
      geographyCandidateIdentityOutsideCurrentTargetScope: 6,
      identityCandidates: 28,
      exactIdentityCandidates: 20,
      derivedIdentityCandidates: 8,
      identityOutsideCurrentTargetScope: 6,
      geographyCandidates: 34,
      proposedDecisions: 4,
      jointApprovedRecords: 0,
      scoreEligibleRecords: 0,
    });
    const outside = value.records.filter((record) => record.identity.status === "outside_current_target_identity_scope");
    expect(outside.map((record) => `${record.cycleYear}:${record.districtCode}`)).toEqual([
      "2022:12", "2022:15", "2022:16", "2024:12", "2024:15", "2024:16",
    ]);
    expect(outside.every((record) =>
      record.identity.parentObservationId === null && record.identity.bioguideId === null &&
      record.geography.compatibilityCandidate && !record.geography.compatibilityApproved
    )).toBe(true);
    expect(value.records.every((record) =>
      record.certificationStatus === "not_retained" && record.progressiveClassificationStatus === "not_retained" &&
      !record.identity.identityApproved && !record.geography.compatibilityApproved &&
      !record.jointApproved && !record.scoreEligible &&
      record.evaluatorUse === "excluded_pending_certification_identity_historical_geography_and_progressive_classification_review"
    )).toBe(true);
  });

  it("inherits the exact four gates as four concrete unresolved decisions", () => {
    const value = build();
    expect(value.inheritedUnresolvedGates).toEqual([
      "retain_final_state_canvass_or_certification",
      "review_incumbent_candidate_identity",
      "review_historical_district_compatibility",
      "review_progressive_candidate_classification",
    ]);
    expect(value.decisions.map((decision) => [decision.decisionId, decision.parentDecisionId])).toEqual([
      ["il-primary:accept-geography-compatibility-v1", "approve-historical-district-cd119-compatibility-v1"],
      ["il-primary:accept-identity-links-v1", "approve-historic-primary-candidate-identity-resolution-v1"],
      ["il-primary:retain-certification-exclusion-v1", "collect-official-state-primary-results-and-certification-v1"],
      ["il-primary:retain-progressive-classification-exclusion-v1", "approve-progressive-candidate-classification-method-v1"],
    ]);
    expect(value.decisions.every((decision) =>
      decision.review.resolution === null &&
      decision.defaultReversibleAssumption === "exclude_affected_records_from_evaluator_and_publication" &&
      decision.blocksAffectedPublication && !decision.blocksOtherWork
    )).toBe(true);
    expect(value.methodology).toMatchObject({
      decisionsReviewedIndependently: true,
      jointPackageApprovesParents: false,
      automaticApprovals: 0,
      evaluatorNumericValues: 0,
    });
  });

  it("retains the package with the exact three-parent output lineage", () => {
    const lock = JSON.parse(text("data/source-lock.json")) as any;
    const artifact = file("data/metadata/illinois-primary-identity-geography-review-package-v1.json");
    const matches = lock.entries.filter((entry: any) => entry.id === "illinois-primary-identity-geography-review-package-v1");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      id: "illinois-primary-identity-geography-review-package-v1",
      url: "urn:dsa-seats:illinois-primary-identity-geography-review-package:v1:2026-08-05",
      retainedPath: "data/metadata/illinois-primary-identity-geography-review-package-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_proposal",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "illinois-current-incumbent-primary-linkage-candidate-v1",
        "illinois-primary-geography-compatibility-candidate-v1",
      ],
    license: "unknown", });
  });

  it("rejects parent-byte substitution and exact input lineage drift", () => {
    const identityJson = text("data/metadata/illinois-current-incumbent-primary-linkage-candidate-v1.json");
    expect(() => build({ identityJson: `${identityJson} ` })).toThrow("INPUT_HASH_MISMATCH");

    const lock = JSON.parse(text("data/source-lock.json")) as any;
    lock.entries.find((entry: any) => entry.id === "illinois-primary-geography-compatibility-candidate-v1").parentIds = [];
    expect(() => build({ sourceLockJson: JSON.stringify(lock) })).toThrow("SOURCE_LOCK_MISMATCH");

    const outputDrift = JSON.parse(text("data/source-lock.json")) as any;
    const output = outputDrift.entries.find((entry: any) =>
      entry.id === "illinois-primary-identity-geography-review-package-v1"
    );
    if (output) output.parentIds = [];
    expect(() => build({ sourceLockJson: JSON.stringify(outputDrift) })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("rejects fully rehashed joined-parent and unknown decision drift", () => {
    const parentDrift = structuredClone(build()) as any;
    parentDrift.records[0].geography.parentRowSha256 = "0".repeat(64);
    const unsignedRecord = structuredClone(parentDrift.records[0]);
    delete unsignedRecord.reviewRecordSha256;
    parentDrift.records[0].reviewRecordSha256 = digest("dsa-seats:il-primary-joint-review-row:v1\0", unsignedRecord);
    parentDrift.reviewRecordSetSha256 = digest("dsa-seats:il-primary-joint-review-row-set:v1\0", parentDrift.records);
    const parentUnsigned = structuredClone(parentDrift);
    delete parentUnsigned.packageSha256;
    parentDrift.packageSha256 = digest("dsa-seats:il-primary-joint-review-package:v1\0", parentUnsigned);
    expect(() => validateIllinoisPrimaryIdentityGeographyReviewPackage(parentDrift)).toThrow("PARENT_FACT_INVALID");

    const decisionDrift = structuredClone(build()) as any;
    decisionDrift.decisions[0].automaticApproval = true;
    decisionDrift.decisionSetSha256 = digest("dsa-seats:il-primary-joint-review-decision-set:v1\0", decisionDrift.decisions);
    const decisionUnsigned = structuredClone(decisionDrift);
    delete decisionUnsigned.packageSha256;
    decisionDrift.packageSha256 = digest("dsa-seats:il-primary-joint-review-package:v1\0", decisionUnsigned);
    expect(() => validateIllinoisPrimaryIdentityGeographyReviewPackage(decisionDrift)).toThrow("DECISION_FIELDS_INVALID");
  });

  it("rejects fabricated out-of-scope identities and four-gate promotion after full rehashing", () => {
    const fabricated = structuredClone(build()) as any;
    const outside = fabricated.records.find((record: any) => record.identity.status === "outside_current_target_identity_scope");
    outside.identity.bioguideId = "F000000";
    const fabricatedRow = structuredClone(outside);
    delete fabricatedRow.reviewRecordSha256;
    outside.reviewRecordSha256 = digest("dsa-seats:il-primary-joint-review-row:v1\0", fabricatedRow);
    fabricated.reviewRecordSetSha256 = digest("dsa-seats:il-primary-joint-review-row-set:v1\0", fabricated.records);
    const fabricatedUnsigned = structuredClone(fabricated);
    delete fabricatedUnsigned.packageSha256;
    fabricated.packageSha256 = digest("dsa-seats:il-primary-joint-review-package:v1\0", fabricatedUnsigned);
    expect(() => validateIllinoisPrimaryIdentityGeographyReviewPackage(fabricated)).toThrow("RECORD_INVALID");

    const promoted = structuredClone(build()) as any;
    promoted.inheritedUnresolvedGates.pop();
    promoted.records[0].certificationStatus = "retained";
    promoted.records[0].evaluatorUse = "included";
    const promotedRow = structuredClone(promoted.records[0]);
    delete promotedRow.reviewRecordSha256;
    promoted.records[0].reviewRecordSha256 = digest("dsa-seats:il-primary-joint-review-row:v1\0", promotedRow);
    promoted.reviewRecordSetSha256 = digest("dsa-seats:il-primary-joint-review-row-set:v1\0", promoted.records);
    const promotedUnsigned = structuredClone(promoted);
    delete promotedUnsigned.packageSha256;
    promoted.packageSha256 = digest("dsa-seats:il-primary-joint-review-package:v1\0", promotedUnsigned);
    expect(() => validateIllinoisPrimaryIdentityGeographyReviewPackage(promoted)).toThrow("LIFECYCLE_INVALID");
  });
});
