/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial persisted package mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildTexasPrimaryIdentityGeographyReviewPackage,
  validateTexasPrimaryIdentityGeographyReviewPackage,
} from "./texas-primary-identity-geography-review-package";

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const load = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, text: bytes.toString("utf8"), value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
};

function build(options?: { identityJson?: string; geographyJson?: string; sourceLockJson?: string }) {
  const proposal = load("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const identity = load("data/metadata/texas-current-incumbent-primary-event-identity-candidate-v1.json");
  const geography = load("data/metadata/texas-primary-geography-compatibility-candidate-v1.json");
  const sourceLock = load("data/source-lock.json");
  return buildTexasPrimaryIdentityGeographyReviewPackage({
    proposalJson: proposal.text,
    identityJson: options?.identityJson ?? identity.text,
    geographyJson: options?.geographyJson ?? geography.text,
    sourceLockJson: options?.sourceLockJson ?? sourceLock.text,
  });
}

describe("Texas primary identity-geography joint reviewer package", () => {
  it("rebuilds the persisted reviewer package exactly", () => {
    expect(build()).toEqual(validateTexasPrimaryIdentityGeographyReviewPackage(
      load("data/metadata/texas-primary-identity-geography-review-package-v1.json").value,
    ));
  });

  it("retains the immutable package with its exact three-parent lineage", () => {
    const lock = load("data/source-lock.json").value as any;
    const artifact = load("data/metadata/texas-primary-identity-geography-review-package-v1.json");
    const matches = lock.entries.filter((entry: any) => entry.id === "texas-primary-identity-geography-review-package-v1");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      id: "texas-primary-identity-geography-review-package-v1",
      url: "urn:dsa-seats:texas-primary-identity-geography-review-package:v1:2026-08-05",
      retainedPath: "data/metadata/texas-primary-identity-geography-review-package-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_proposal",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "texas-current-incumbent-primary-event-identity-candidate-v1",
        "texas-primary-geography-compatibility-candidate-v1",
      ],
    license: "unknown", });
  });

  it("closes all seventy-eight event records across four review categories", () => {
    const value = build();
    expect(value.summary).toEqual({
      reviewRecords: 78,
      identityAndGeographyCandidates: 25,
      geographyCandidateIdentityUnresolved: 27,
      identityCandidateCd120GeographyPending: 8,
      identityUnresolvedCd120GeographyPending: 18,
      identityCandidates: 33,
      geographyCandidates: 52,
      reportedContestRecords: 44,
      sourceUnobservedEventRecords: 34,
      proposedDecisions: 5,
      jointApprovedRecords: 0,
      scoreEligibleRecords: 0,
    });
    expect(value.records).toHaveLength(78);
    expect(value.records.filter((row) => row.sourceObservationStatus === "reported_contest")).toHaveLength(44);
    expect(value.records.filter((row) =>
      row.sourceObservationStatus === "not_observed_in_retained_official_canvass_report_disposition_unresolved"
    )).toHaveLength(34);
    expect(value.records.every((row) =>
      !row.identity.approved && !row.geography.approved && !row.jointApproved && !row.scoreEligible &&
      row.resultDispositionPreserved && row.dispositionDecisionStatus === "unresolved" &&
      row.progressiveClassificationStatus === "not_retained"
    )).toBe(true);
  });

  it("presents five independent proposed decisions with bounded evidence", () => {
    const value = build();
    expect(value.decisions.map((decision) => decision.decisionId)).toEqual([
      "tx-primary:accept-geography-compatibility-v1",
      "tx-primary:accept-identity-links-v1",
      "tx-primary:retain-certification-exclusion-v1",
      "tx-primary:retain-primary-disposition-exclusion-v1",
      "tx-primary:retain-progressive-classification-exclusion-v1",
    ]);
    expect(value.decisions).toHaveLength(5);
    expect(value.decisions.every((decision) =>
      decision.defaultReversibleAssumption === "exclude_affected_records_from_evaluator_and_publication" &&
      decision.blocksAffectedPublication && !decision.blocksOtherWork && decision.review.status === "proposed" &&
      decision.review.reviewer === null && decision.review.reviewedAt === null && decision.review.resolution === null
    )).toBe(true);
    expect(value.decisions.find((decision) => decision.decisionId === "tx-primary:accept-identity-links-v1")?.evidenceRecordIds)
      .toHaveLength(33);
    expect(value.decisions.filter((decision) => decision.decisionId !== "tx-primary:accept-identity-links-v1")
      .every((decision) => decision.evidenceRecordIds.length === 78)).toBe(true);
    expect(value.inheritedDecisionResolutions).toEqual({
      certification: null,
      identity: null,
      geography: null,
      disposition: null,
      progressiveClassification: null,
    });
  });

  it("preserves unresolved identity, CD120, certification, and result states independently", () => {
    const value = build();
    const pending2026 = value.records.filter((row) => row.cycleYear === 2026);
    expect(pending2026).toHaveLength(26);
    expect(pending2026.every((row) =>
      row.geography.status === "authority_pending" && row.geography.historicalGeoid === null &&
      !row.geography.candidate && row.certificationStatus ===
        "official_canvass_report_retained_certification_not_separately_bound"
    )).toBe(true);
    expect(value.records.filter((row) => row.identity.status === "candidate")).toHaveLength(33);
    expect(value.records.filter((row) => row.identity.status === "unresolved")).toHaveLength(45);
    expect(value.methodology).toMatchObject({
      parentCandidatesApprovedByJoin: false,
      regularRunoffCollapseAllowed: false,
      cd119SubstitutedForCd120: false,
      evaluatorNumericValues: 0,
    });
  });

  it("rejects source-lock ancestry and parent join drift", () => {
    const lock = load("data/source-lock.json").value as any;
    const driftedLock = structuredClone(lock);
    driftedLock.entries.find((entry: any) => entry.id === "texas-primary-geography-compatibility-candidate-v1").parentIds = [];
    expect(() => build({ sourceLockJson: `${JSON.stringify(driftedLock)}\n` })).toThrow("SOURCE_LOCK_MISMATCH");

    const geography = load("data/metadata/texas-primary-geography-compatibility-candidate-v1.json").value as any;
    const driftedGeography = structuredClone(geography);
    driftedGeography.rows[0].identityObservationId = "tx:identity:2022:regular:99";
    expect(() => build({ geographyJson: `${JSON.stringify(driftedGeography)}\n` })).toThrow();
  });

  it("rejects fully rehashed cross-parent escalation", () => {
    const drifted = structuredClone(build()) as any;
    const row = drifted.records.find((record: any) => record.cycleYear === 2026);
    row.geography.status = "candidate";
    row.geography.candidate = true;
    row.geography.approved = true;
    row.geography.historicalGeoid = row.geography.targetCd119Geoid;
    row.geography.compatibilityDisposition = "same_cd119_session_and_geoid_exact_key_candidate";
    row.jointApproved = true;
    row.scoreEligible = true;
    const unsignedRow = structuredClone(row);
    delete unsignedRow.reviewRecordSha256;
    row.reviewRecordSha256 = digest("dsa-seats:tx-primary-joint-review-record:v1\0", unsignedRow);
    drifted.reviewRecordSetSha256 = digest("dsa-seats:tx-primary-joint-review-record-set:v1\0", drifted.records);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:tx-primary-joint-review-package:v1\0", unsigned);
    expect(() => validateTexasPrimaryIdentityGeographyReviewPackage(drifted)).toThrow("RECORD_INVALID");
  });

  it("rejects fully rehashed fabricated reviewer approval", () => {
    const drifted = structuredClone(build()) as any;
    drifted.review.status = "approved";
    drifted.review.reviewer = "fabricated-reviewer";
    drifted.decisions[0].review.status = "approved";
    drifted.decisions[0].review.reviewer = "fabricated-reviewer";
    drifted.decisions[0].review.resolution = "approved";
    drifted.decisionSetSha256 = digest("dsa-seats:tx-primary-joint-review-decision-set:v1\0", drifted.decisions);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:tx-primary-joint-review-package:v1\0", unsigned);
    expect(() => validateTexasPrimaryIdentityGeographyReviewPackage(drifted)).toThrow("LIFECYCLE_INVALID");
  });
});
