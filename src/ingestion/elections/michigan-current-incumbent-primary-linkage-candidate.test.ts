/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-candidate mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildMichiganPrimaryIdentityCandidate,
  validateMichiganPrimaryIdentityCandidate,
} from "./michigan-current-incumbent-primary-linkage-candidate";

const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") };
};
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

function build(options?: { receipt?: unknown; sourceLock?: unknown }) {
  const roster = json("data/metadata/dsa-target-incumbent-roster-20260804-v1.json");
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/michigan-house-democratic-primary-results-2022-2026-v1.json");
  const house = readFileSync("data/source/identity/house-member-data.xml");
  const congress = readFileSync("data/source/identity/congress-legislators-current-20260804.json");
  return buildMichiganPrimaryIdentityCandidate({
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

describe("Michigan current-incumbent primary linkage candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateMichiganPrimaryIdentityCandidate(
      json("data/metadata/michigan-current-incumbent-primary-linkage-candidate-v1.json").value,
    ));
  });

  it("closes twelve target observations while preserving one predecessor non-link", () => {
    const value = build();
    expect(value.summary).toEqual({
      targetSeats: 6,
      contestObservations: 12,
      reportedCandidateRows: 32,
      reportedCandidateVotes: 1_041_347,
      proposedIdentityLinks: 11,
      exactNameObservations: 7,
      derivedNameRelationships: 4,
      reportedContestNoUniqueMatch: 1,
      directIdentifierBridges: 0,
      automaticallyApprovedRows: 0,
      selectedRows: 0,
      scoreEligibleRows: 0,
    });
    const predecessor = value.observations.find((row) => row.observationId === "mi:identity:2022:08");
    expect(predecessor).toMatchObject({
      sourceCandidateCount: 1,
      sourceContestCandidateVotes: 70_791,
      sourceCandidate: null,
      identityStatus: "reported_contest_no_unique_candidate_match",
      relationshipDisposition: "not_linked_no_unique_current_incumbent_candidate_same_district",
    });
    expect(value.observations.filter((row) => row.identityStatus === "proposed_identity_link")).toHaveLength(11);
  });

  it("preserves certification without inventing source winners, selections, or 2026 rows", () => {
    const value = build();
    expect(value.observations).toHaveLength(12);
    expect(value.observations.some((row) => Number(row.cycleYear) === 2026)).toBe(false);
    expect(value.observations.every((row) =>
      row.certificationStatus === "state_board_event_certification_retained" &&
      row.sourceWinnerStatus === "not_marked_by_source" &&
      row.selectionStatus === "unselected_source_winner_unmarked" &&
      !row.identityApproved && !row.scoreEligible
    )).toBe(true);
  });

  it("rejects parent winner fabrication and fully rehashed lifecycle escalation", () => {
    const receipt = structuredClone(json("data/metadata/michigan-house-democratic-primary-results-2022-2026-v1.json").value) as any;
    receipt.contests.find((row: any) => row.contestId === "mi:2022:regular:us-house:03:democratic").sourceWinnerStatus = "inferred_from_vote_rank";
    expect(() => build({ receipt })).toThrow();

    const drifted = structuredClone(build()) as any;
    drifted.observations[0].identityApproved = true;
    const unsignedRow = structuredClone(drifted.observations[0]);
    delete unsignedRow.rowSha256;
    drifted.observations[0].rowSha256 = digest("dsa-seats:mi-primary-identity-row:v1\0", unsignedRow);
    drifted.observationSetSha256 = digest("dsa-seats:mi-primary-identity-row-set:v1\0", drifted.observations);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:mi-primary-identity-candidate:v1\0", unsigned);
    expect(() => validateMichiganPrimaryIdentityCandidate(drifted)).toThrow("LIFECYCLE_INVALID");
  });

  it("rejects source-lock lineage drift and retains exact five-parent output lineage", () => {
    const lock = structuredClone(json("data/source-lock.json").value) as any;
    lock.entries.find((entry: any) => entry.id === "michigan-house-democratic-primary-results-2022-2026-v1").parentIds = [];
    expect(() => build({ sourceLock: lock })).toThrow("SOURCE_LOCK_MISMATCH");

    const outputDrift = structuredClone(json("data/source-lock.json").value) as any;
    outputDrift.entries.find((entry: any) =>
      entry.id === "michigan-current-incumbent-primary-linkage-candidate-v1"
    ).parentIds = [];
    expect(() => build({ sourceLock: outputDrift })).toThrow("SOURCE_LOCK_MISMATCH");

    const persisted = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/michigan-current-incumbent-primary-linkage-candidate-v1.json");
    const matches = persisted.entries.filter((entry: any) => entry.id === "michigan-current-incumbent-primary-linkage-candidate-v1");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      license: "unknown",
      id: "michigan-current-incumbent-primary-linkage-candidate-v1",
      url: "urn:dsa-seats:michigan-current-incumbent-primary-linkage-candidate:v1:2026-08-05",
      retainedPath: "data/metadata/michigan-current-incumbent-primary-linkage-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "dsa-target-incumbent-roster-20260804-v1",
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "house-xml",
        "congress-legislators-current-20260804",
        "michigan-house-democratic-primary-results-2022-2026-v1",
      ],
    });
  });
});
