/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-candidate mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildMarylandPrimaryIdentityCandidate,
  validateMarylandPrimaryIdentityCandidate,
} from "./maryland-current-incumbent-primary-linkage-candidate";

const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") };
};
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

function build(options?: { receipt?: unknown; sourceLock?: unknown }) {
  const roster = json("data/metadata/dsa-target-incumbent-roster-20260804-v1.json");
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/maryland-house-democratic-primary-results-2022-2024-v1.json");
  const house = readFileSync("data/source/identity/house-member-data.xml");
  const congress = readFileSync("data/source/identity/congress-legislators-current-20260804.json");
  return buildMarylandPrimaryIdentityCandidate({
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

describe("Maryland current-incumbent primary linkage candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateMarylandPrimaryIdentityCandidate(
      json("data/metadata/maryland-current-incumbent-primary-linkage-candidate-v1.json").value,
    ));
  });

  it("closes the exact fourteen target observations without importing MD-01 or inventing 2026", () => {
    const value = build();
    expect(value.summary).toEqual({
      targetSeats: 7,
      contestObservations: 14,
      reportedCandidateRows: 84,
      reportedCandidateVotes: 1_210_215,
      proposedIdentityLinks: 11,
      exactNameObservations: 6,
      derivedNameRelationships: 5,
      reportedContestNoUniqueMatch: 3,
      directIdentifierBridges: 0,
      automaticallyApprovedRows: 0,
      selectedRows: 0,
      scoreEligibleRows: 0,
    });
    expect(value.observations.map((row) => row.observationId)).toEqual(
      [2022, 2024].flatMap((year) => ["02", "03", "04", "05", "06", "07", "08"].map((district) => `md:identity:${year}:${district}`)),
    );
    expect(value.observations.some((row) => Number(row.cycleYear) === 2026 || row.districtCode === "01")).toBe(false);
  });

  it("uses only the four documented exact or narrowly derived name methods", () => {
    const value = build();
    expect(value.observations.filter((row) => row.matchMethod === "derived_source_middle_initial_not_in_official_house_name_same_district").map((row) => row.observationId)).toEqual([
      "md:identity:2022:04", "md:identity:2024:04",
    ]);
    expect(value.observations.filter((row) => row.matchMethod === "derived_official_middle_initial_not_in_source_name_same_district").map((row) => row.observationId)).toEqual([
      "md:identity:2022:05", "md:identity:2024:05",
    ]);
    expect(value.observations.filter((row) => row.matchMethod === "derived_source_quoted_nickname_matches_official_first_name_same_district").map((row) => row.observationId)).toEqual([
      "md:identity:2024:02",
    ]);
    expect(value.observations.filter((row) => row.evidenceClass === "exact_name_observation")).toHaveLength(6);
    expect(value.observations.filter((row) => row.identityStatus === "reported_contest_no_unique_candidate_match").map((row) => row.observationId)).toEqual([
      "md:identity:2022:02", "md:identity:2022:03", "md:identity:2022:06",
    ]);
  });

  it("preserves state-board, certification, and winner-marker boundaries without approval", () => {
    const value = build();
    expect(value.observations.every((row) =>
      row.resultAuthorityStatus === "state_board_official_result_candidate" &&
      row.certificationStatus === "not_independently_retained" && row.sourceWinnerStatus === "marked_by_source" &&
      row.selectionStatus === "unselected_source_winner_marker_not_identity_or_review_approval" &&
      !row.identityApproved && !row.scoreEligible
    )).toBe(true);
    expect(value.observations.filter((row) => row.sourceCandidate !== null).every((row) => row.sourceCandidate?.sourceWinnerMarker === true)).toBe(true);
  });

  it("rejects fully rehashed lifecycle escalation and source-lock drift", () => {
    const drifted = structuredClone(build()) as any;
    drifted.observations[0].identityApproved = true;
    const unsignedRow = structuredClone(drifted.observations[0]);
    delete unsignedRow.rowSha256;
    drifted.observations[0].rowSha256 = digest("dsa-seats:md-primary-identity-row:v1\0", unsignedRow);
    drifted.observationSetSha256 = digest("dsa-seats:md-primary-identity-row-set:v1\0", drifted.observations);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:md-primary-identity-candidate:v1\0", unsigned);
    expect(() => validateMarylandPrimaryIdentityCandidate(drifted)).toThrow("LIFECYCLE_INVALID");

    const lock = structuredClone(json("data/source-lock.json").value) as any;
    lock.entries.find((entry: any) => entry.id === "maryland-house-democratic-primary-results-2022-2024-v1").parentIds = [];
    expect(() => build({ sourceLock: lock })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("retains exact five-parent output lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/maryland-current-incumbent-primary-linkage-candidate-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "maryland-current-incumbent-primary-linkage-candidate-v1")).toEqual([{
      id: "maryland-current-incumbent-primary-linkage-candidate-v1",
      url: "urn:dsa-seats:maryland-current-incumbent-primary-linkage-candidate:v1:2026-08-06",
      retainedPath: "data/metadata/maryland-current-incumbent-primary-linkage-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "dsa-target-incumbent-roster-20260804-v1",
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "house-xml",
        "congress-legislators-current-20260804",
        "maryland-house-democratic-primary-results-2022-2024-v1",
      ],
    license: "unknown", }]);
  });
});
