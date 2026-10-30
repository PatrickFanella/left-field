/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial lifecycle mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildArizonaPrimaryIdentityCandidate,
  validateArizonaPrimaryIdentityCandidate,
} from "./arizona-current-incumbent-primary-linkage-candidate";

const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") };
};
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

function build(options?: { receipt?: unknown; sourceLock?: unknown }) {
  const roster = json("data/metadata/dsa-target-incumbent-roster-20260804-v1.json");
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/arizona-house-democratic-primary-results-2022-2026-v1.json");
  const house = readFileSync("data/source/identity/house-member-data.xml");
  const congress = readFileSync("data/source/identity/congress-legislators-current-20260804.json");
  return buildArizonaPrimaryIdentityCandidate({
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

describe("Arizona current-incumbent primary linkage candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateArizonaPrimaryIdentityCandidate(
      json("data/metadata/arizona-current-incumbent-primary-linkage-candidate-v1.json").value,
    ));
  });

  it("closes six target observations with three exact links and three predecessor non-links", () => {
    const value = build();
    expect(value.summary).toEqual({
      targetSeats: 3,
      contestObservations: 6,
      reportedCandidateRows: 8,
      reportedCandidateVotes: 318_970,
      aggregateWriteInVotes: 93,
      proposedIdentityLinks: 3,
      exactNameObservations: 3,
      reportedContestNoUniqueMatch: 3,
      directIdentifierBridges: 0,
      automaticallyApprovedRows: 0,
      selectedRows: 0,
      scoreEligibleRows: 0,
    });
    expect(value.observations.filter((row) => row.identityStatus === "proposed_identity_link").map((row) => row.observationId)).toEqual([
      "az:identity:2022:04", "az:identity:2024:03", "az:identity:2024:04",
    ]);
    expect(value.observations.filter((row) => row.identityStatus === "reported_contest_no_unique_candidate_match").map((row) => row.observationId)).toEqual([
      "az:identity:2022:03", "az:identity:2022:07", "az:identity:2024:07",
    ]);
  });

  it("preserves source winner and recount facts without turning them into selection or approval", () => {
    const value = build();
    const recount = value.observations.find((row) => row.observationId === "az:identity:2024:03");
    expect(recount).toMatchObject({
      resultAuthorityStatus: "certified_final_recount_and_court_order",
      resultRevisionStatus: "final_recount_supersedes_initial_canvass",
      sourceWinnerStatus: "marked_by_source",
      sourceCandidate: { sourceCandidateName: "Yassamin Ansari", votes: 19_087, sourceWinnerMarker: true },
      aggregateWriteInVotes: 93,
      selectionStatus: "unselected_source_winner_marker_not_identity_or_review_approval",
      identityApproved: false,
      scoreEligible: false,
    });
    expect(value.observations).toHaveLength(6);
    expect(value.observations.some((row) => Number(row.cycleYear) === 2026)).toBe(false);
    expect(value.observations.every((row) => !row.identityApproved && !row.scoreEligible)).toBe(true);
  });

  it("rejects parent winner fabrication and fully rehashed lifecycle escalation", () => {
    const receipt = structuredClone(json("data/metadata/arizona-house-democratic-primary-results-2022-2026-v1.json").value) as any;
    receipt.contests.find((row: any) => row.contestId === "az:2024:regular:us-house:03:democratic").winnerSourceCandidateName = "Raquel Terán";
    expect(() => build({ receipt })).toThrow();

    const drifted = structuredClone(build()) as any;
    drifted.observations[0].identityApproved = true;
    const unsignedRow = structuredClone(drifted.observations[0]);
    delete unsignedRow.rowSha256;
    drifted.observations[0].rowSha256 = digest("dsa-seats:az-primary-identity-row:v1\0", unsignedRow);
    drifted.observationSetSha256 = digest("dsa-seats:az-primary-identity-row-set:v1\0", drifted.observations);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:az-primary-identity-candidate:v1\0", unsigned);
    expect(() => validateArizonaPrimaryIdentityCandidate(drifted)).toThrow("LIFECYCLE_INVALID");
  });

  it("rejects source-lock lineage drift and retains exact five-parent output lineage", () => {
    const lock = structuredClone(json("data/source-lock.json").value) as any;
    lock.entries.find((entry: any) => entry.id === "arizona-house-democratic-primary-results-2022-2026-v1").parentIds = [];
    expect(() => build({ sourceLock: lock })).toThrow("SOURCE_LOCK_MISMATCH");

    const persisted = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/arizona-current-incumbent-primary-linkage-candidate-v1.json");
    const matches = persisted.entries.filter((entry: any) => entry.id === "arizona-current-incumbent-primary-linkage-candidate-v1");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      license: "unknown",
      id: "arizona-current-incumbent-primary-linkage-candidate-v1",
      url: "urn:dsa-seats:arizona-current-incumbent-primary-linkage-candidate:v1:2026-08-06",
      retainedPath: "data/metadata/arizona-current-incumbent-primary-linkage-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "dsa-target-incumbent-roster-20260804-v1",
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "house-xml",
        "congress-legislators-current-20260804",
        "arizona-house-democratic-primary-results-2022-2026-v1",
      ],
    });
  });
});
