/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-candidate mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildFloridaPrimaryIdentityCandidate,
  validateFloridaPrimaryIdentityCandidate,
} from "./florida-current-incumbent-primary-linkage-candidate";

const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") };
};
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

function build(options?: { receipt?: unknown; sourceLock?: unknown }) {
  const roster = json("data/metadata/dsa-target-incumbent-roster-20260804-v1.json");
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/florida-house-democratic-primary-results-2022-2026-v1.json");
  const house = readFileSync("data/source/identity/house-member-data.xml");
  const congress = readFileSync("data/source/identity/congress-legislators-current-20260804.json");
  return buildFloridaPrimaryIdentityCandidate({
    roster: roster.value,
    rosterFileSha256: roster.sha256,
    proposal: proposal.value,
    proposalFileSha256: proposal.sha256,
    receipt: options?.receipt ?? receipt.value,
    receiptFileSha256: receipt.sha256,
    houseXml: house.toString("utf8"),
    houseFileSha256: createHash("sha256").update(house).digest("hex"),
    congressJson: congress.toString("utf8"),
    congressFileSha256: createHash("sha256").update(congress).digest("hex"),
    sourceLock: options?.sourceLock ?? json("data/source-lock.json").value,
  });
}

describe("Florida current-incumbent primary linkage candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateFloridaPrimaryIdentityCandidate(
      json("data/metadata/florida-current-incumbent-primary-linkage-candidate-v1.json").value,
    ));
  });

  it("closes fourteen target observations without turning seven absent source blocks into zero", () => {
    const value = build();
    expect(value.summary).toEqual({
      targetSeats: 7,
      contestObservations: 14,
      reportedObservations: 7,
      sourceUnobservedObservations: 7,
      reportedCandidateRows: 27,
      reportedCandidateVotes: 393_063,
      proposedIdentityLinks: 7,
      exactNameObservations: 4,
      derivedNameRelationships: 3,
      reportedContestNoUniqueMatch: 0,
      directIdentifierBridges: 0,
      automaticallyApprovedRows: 0,
      selectedRows: 0,
      scoreEligibleRows: 0,
    });
    const absent = value.observations.filter((row) => row.identityStatus === "source_unobserved_district_cycle_unresolved");
    expect(absent).toHaveLength(7);
    expect(absent.every((row) =>
      row.contestId === null && row.contestSha256 === null && row.sourceCandidateCount === null &&
      row.sourceContestCandidateVotes === null && row.sourceCandidate === null && row.resultAuthorityStatus === null &&
      row.certificationStatus === null && row.relationshipDisposition === "not_linked_no_reported_contest_disposition_unresolved"
    )).toBe(true);
  });

  it("limits derived links to the three documented middle-name differences", () => {
    const value = build();
    expect(value.observations.filter((row) => row.matchMethod === "derived_source_middle_name_not_in_official_house_name_same_district").map((row) => row.observationId)).toEqual([
      "fl:identity:2022:10", "fl:identity:2024:10",
    ]);
    expect(value.observations.filter((row) => row.matchMethod === "derived_official_middle_initial_not_in_source_name_same_district").map((row) => row.observationId)).toEqual([
      "fl:identity:2022:24",
    ]);
    expect(value.observations.filter((row) => row.evidenceClass === "exact_name_observation")).toHaveLength(4);
  });

  it("preserves official-extract and missing-certificate boundaries without winner or 2026 inference", () => {
    const value = build();
    const reported = value.observations.filter((row) => row.identityStatus === "proposed_identity_link");
    expect(reported).toHaveLength(7);
    expect(reported.every((row) =>
      row.resultAuthorityStatus === "division_official_results_extract_retained" &&
      row.certificationStatus === "official_results_flag_retained_no_separate_signed_certificate" &&
      row.sourceWinnerStatus === "not_marked_by_source" && row.selectionStatus === "unselected_source_winner_unmarked" &&
      !row.identityApproved && !row.scoreEligible
    )).toBe(true);
    expect(value.observations.some((row) => Number(row.cycleYear) === 2026)).toBe(false);
  });

  it("rejects fully rehashed lifecycle escalation and source-lock drift", () => {
    const drifted = structuredClone(build()) as any;
    drifted.observations[0].identityApproved = true;
    const unsignedRow = structuredClone(drifted.observations[0]);
    delete unsignedRow.rowSha256;
    drifted.observations[0].rowSha256 = digest("dsa-seats:fl-primary-identity-row:v1\0", unsignedRow);
    drifted.observationSetSha256 = digest("dsa-seats:fl-primary-identity-row-set:v1\0", drifted.observations);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:fl-primary-identity-candidate:v1\0", unsigned);
    expect(() => validateFloridaPrimaryIdentityCandidate(drifted)).toThrow("LIFECYCLE_INVALID");

    const lock = structuredClone(json("data/source-lock.json").value) as any;
    lock.entries.find((entry: any) => entry.id === "florida-house-democratic-primary-results-2022-2026-v1").parentIds = [];
    expect(() => build({ sourceLock: lock })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("retains exact five-parent output lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/florida-current-incumbent-primary-linkage-candidate-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "florida-current-incumbent-primary-linkage-candidate-v1")).toEqual([{
      id: "florida-current-incumbent-primary-linkage-candidate-v1",
      url: "urn:dsa-seats:florida-current-incumbent-primary-linkage-candidate:v1:2026-08-06",
      retainedPath: "data/metadata/florida-current-incumbent-primary-linkage-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "dsa-target-incumbent-roster-20260804-v1",
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "house-xml",
        "congress-legislators-current-20260804",
        "florida-house-democratic-primary-results-2022-2026-v1",
      ],
    license: "unknown", }]);
  });
});
