/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-candidate mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { buildWashingtonTopTwoIdentityCandidate, validateWashingtonTopTwoIdentityCandidate } from "./washington-current-incumbent-top-two-linkage-candidate";

const text = (path: string): string => readFileSync(path, "utf8");
const json = (path: string) => { const bytes = readFileSync(path); return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") }; };
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const build = (options?: { sourceLockJson?: string }) => buildWashingtonTopTwoIdentityCandidate({
  rosterJson: text("data/metadata/dsa-target-incumbent-roster-20260804-v1.json"),
  proposalJson: text("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json"),
  houseXml: text("data/source/identity/house-member-data.xml"),
  congressJson: text("data/source/identity/congress-legislators-current-20260804.json"),
  receiptJson: text("data/metadata/washington-house-top-two-results-receipt-20220802-20240806-v1.json"),
  sourceLockJson: options?.sourceLockJson ?? text("data/source-lock.json"),
});

describe("Washington current-incumbent top-two linkage candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateWashingtonTopTwoIdentityCandidate(json("data/metadata/washington-current-incumbent-top-two-linkage-candidate-v1.json").value));
  });

  it("closes 16 certified observations while preserving formula incompatibility", () => {
    const value = build();
    expect(value.summary).toEqual({
      targetSeats: 8,
      contestObservations: 16,
      reportedCandidateRows: 115,
      reportedContestVotes: 3_141_178,
      proposedIdentityLinks: 15,
      exactNameObservations: 13,
      derivedNameRelationships: 2,
      reportedContestNoUniqueMatch: 1,
      directIdentifierBridges: 0,
      automaticallyApprovedRows: 0,
      selectedRows: 0,
      scoreEligibleRows: 0,
    });
    expect(value.observations.filter((row) => row.identityStatus === "reported_contest_no_unique_candidate_match").map((row) => row.observationId)).toEqual(["wa:identity:2022:06"]);
    expect(value.observations.filter((row) => row.matchMethod === "derived_official_middle_initial_not_in_source_name_same_district").map((row) => row.observationId)).toEqual(["wa:identity:2022:01", "wa:identity:2024:01"]);
    expect(value.observations.every((row) => row.certificationStatus === "certified" && row.nominationSystem === "top_two" && row.formulaApplicability === "confirmed_incompatible" && row.sourceWinnerStatus === "not_established" && !row.identityApproved && !row.selected && !row.scoreEligible)).toBe(true);
  });

  it("preserves source values without treating party preference as nomination, endorsement, winner, or evaluator input", () => {
    const value = build();
    expect(value.observations.reduce((sum, row) => sum + row.sourceCandidateCount, 0)).toBe(115);
    expect(value.observations.reduce((sum, row) => sum + row.reportedContestVotes, 0)).toBe(3_141_178);
    expect(value.observations.every((row) => row.selectionStatus === "unselected_top_two_source_does_not_establish_nomination_winner_or_advancement" && row.evaluatorUse === "excluded_formula_incompatible_top_two_pending_identity_geography_review_and_publication_approval")).toBe(true);
    expect(value.methodology).toMatchObject({ nominationTreatment: "party_preference_is_not_nomination_or_endorsement", sourceWinnerTreatment: "not_established", formulaApplicability: "confirmed_incompatible", evaluatorNumericValues: 0 });
  });

  it("rejects fully rehashed lifecycle escalation and source-lock drift", () => {
    const drifted = structuredClone(build()) as any;
    drifted.observations[0].identityApproved = true;
    const row = structuredClone(drifted.observations[0]); delete row.rowSha256;
    drifted.observations[0].rowSha256 = digest("dsa-seats:wa-top-two-identity-row:v1\0", row);
    drifted.observationSetSha256 = digest("dsa-seats:wa-top-two-identity-row-set:v1\0", drifted.observations);
    const unsigned = structuredClone(drifted); delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:wa-top-two-identity-candidate:v1\0", unsigned);
    expect(() => validateWashingtonTopTwoIdentityCandidate(drifted)).toThrow("LIFECYCLE_INVALID");
    const lock = structuredClone(json("data/source-lock.json").value) as any;
    lock.entries.find((entry: any) => entry.id === "washington-house-top-two-results-receipt-20220802-20240806-v1").parentIds = [];
    expect(() => build({ sourceLockJson: `${JSON.stringify(lock, null, 2)}\n` })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("retains exact five-parent output lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/washington-current-incumbent-top-two-linkage-candidate-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "washington-current-incumbent-top-two-linkage-candidate-v1")).toEqual([{
      id: "washington-current-incumbent-top-two-linkage-candidate-v1",
      url: "urn:dsa-seats:washington-current-incumbent-top-two-linkage-candidate:v1:2026-08-06",
      retainedPath: "data/metadata/washington-current-incumbent-top-two-linkage-candidate-v1.json",
      retainedStatus: "retained", byteSize: artifact.bytes.byteLength, sha256: artifact.sha256, kind: "review_candidate",
      parentIds: ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "washington-house-top-two-results-receipt-20220802-20240806-v1"],
    license: "unknown", }]);
  });
});
