/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-candidate mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildTexasCurrentIncumbentPrimaryEventIdentityCandidate,
  validateTexasCurrentIncumbentPrimaryEventIdentityCandidate,
} from "./texas-current-incumbent-primary-event-identity-candidate";

const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") };
};
const text = (path: string): string => readFileSync(path, "utf8");
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

function build(options?: { receipt?: unknown; sourceLock?: unknown }) {
  const roster = json("data/metadata/dsa-target-incumbent-roster-20260804-v1.json");
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/texas-house-democratic-primary-results-2022-2026-v1.json");
  const house = readFileSync("data/source/identity/house-member-data.xml");
  const congress = readFileSync("data/source/identity/congress-legislators-current-20260804.json");
  return buildTexasCurrentIncumbentPrimaryEventIdentityCandidate({
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

describe("Texas current-incumbent primary event identity candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateTexasCurrentIncumbentPrimaryEventIdentityCandidate(
      json("data/metadata/texas-current-incumbent-primary-event-identity-candidate-v1.json").value,
    ));
  });

  it("closes all 13 incumbents across all six events without selecting a winner", () => {
    const value = build();
    expect(value.summary).toEqual({
      targetSeats: 13,
      eventObservations: 78,
      regularEventObservations: 39,
      runoffEventObservations: 39,
      reportedContestObservations: 44,
      reportedCandidateRows: 115,
      reportedCandidateVotes: 2_041_818,
      unobservedDistrictEventObservations: 34,
      proposedIdentityLinks: 33,
      exactNameObservations: 25,
      derivedNameRelationships: 8,
      reportedContestNoUniqueMatch: 11,
      regularIdentityCandidates: 30,
      runoffIdentityCandidates: 3,
      sourceIncumbentMarkedIdentityCandidates: 25,
      directIdentifierBridges: 0,
      automaticallyApprovedRows: 0,
      selectedRows: 0,
      scoreEligibleRows: 0,
    });
    expect(value.observations).toHaveLength(78);
    expect(value.observations.every((row) =>
      !row.identityApproved && row.selectionStatus === "unselected_no_source_winner_or_disposition_resolution" &&
      !row.scoreEligible
    )).toBe(true);
  });

  it("keeps reported no-match and unobserved event dispositions distinct", () => {
    const value = build();
    const noMatch = value.observations.filter((row) => row.identityStatus === "reported_contest_no_unique_candidate_match");
    expect(noMatch).toHaveLength(11);
    expect(noMatch.every((row) =>
      row.sourceContestId !== null && row.sourceContestSha256 !== null && row.sourceCandidate === null &&
      row.sourceContestCandidateVotes !== null &&
      row.relationshipDisposition === "not_linked_no_unique_current_incumbent_candidate_same_district"
    )).toBe(true);
    const unobserved = value.observations.filter((row) => row.identityStatus === "unobserved_district_event");
    expect(unobserved).toHaveLength(34);
    expect(unobserved.every((row) =>
      row.sourceContestId === null && row.sourceContestSha256 === null && row.sourceCandidate === null &&
      row.sourceContestCandidateVotes === null &&
      row.sourceObservationStatus === "not_observed_in_retained_official_canvass_report_disposition_unresolved" &&
      row.relationshipDisposition === "not_linked_no_reported_contest_disposition_unresolved"
    )).toBe(true);
  });

  it("does not cross-link 2026 redistricted candidates before geography review", () => {
    const value = build();
    for (const stage of ["regular", "runoff"] as const) {
      const tx18 = value.observations.find((row) =>
        row.cycleYear === 2026 && row.electionStage === stage && row.targetDistrictCode === "18"
      );
      expect([tx18?.rosterIdentity.bioguideId, tx18?.sourceCandidate?.sourceCandidateName]).toEqual([
        "M001245", "CHRISTIAN DASHAUN MENEFEE",
      ]);
      const tx09 = value.observations.find((row) =>
        row.cycleYear === 2026 && row.electionStage === stage && row.targetDistrictCode === "09"
      );
      expect(tx09?.sourceCandidate).toBeNull();
      const tx33 = value.observations.find((row) =>
        row.cycleYear === 2026 && row.electionStage === stage && row.targetDistrictCode === "33"
      );
      expect([tx33?.rosterIdentity.bioguideId, tx33?.sourceCandidate]).toEqual(["V000131", null]);
    }
    expect(value.observations.find((row) =>
      row.cycleYear === 2026 && row.electionStage === "regular" && row.targetDistrictCode === "32"
    )?.sourceCandidate).toBeNull();
    expect(value.observations.find((row) =>
      row.cycleYear === 2026 && row.electionStage === "regular" && row.targetDistrictCode === "35"
    )?.sourceCandidate).toBeNull();
    const tx37 = value.observations.find((row) =>
      row.cycleYear === 2026 && row.electionStage === "regular" && row.targetDistrictCode === "37"
    );
    expect([tx37?.rosterIdentity.bioguideId, tx37?.sourceCandidate]).toEqual(["D000399", null]);
  });

  it("rejects invented winners and fully rehashed unresolved identity fabrication", () => {
    const receipt = structuredClone(json("data/metadata/texas-house-democratic-primary-results-2022-2026-v1.json").value) as any;
    receipt.contests[0].sourceWinnerStatus = "inferred_from_vote_rank";
    expect(() => build({ receipt })).toThrow();

    const drifted = structuredClone(build()) as any;
    const unresolved = drifted.observations.find((row: any) => row.identityStatus === "unobserved_district_event");
    unresolved.sourceCandidate = { sourceCandidateName: "FABRICATED", rowIdentity: "fabricated" };
    const unsignedRow = structuredClone(unresolved);
    delete unsignedRow.rowSha256;
    unresolved.rowSha256 = digest("dsa-seats:tx-primary-event-identity-row:v1\0", unsignedRow);
    drifted.observationSetSha256 = digest("dsa-seats:tx-primary-event-identity-row-set:v1\0", drifted.observations);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:tx-primary-event-identity-candidate:v1\0", unsigned);
    expect(() => validateTexasCurrentIncumbentPrimaryEventIdentityCandidate(drifted)).toThrow("SOURCE_CANDIDATE_FIELDS_INVALID");
  });

  it("rejects exact source-lock lineage drift", () => {
    const lock = structuredClone(json("data/source-lock.json").value) as any;
    lock.entries.find((entry: any) => entry.id === "texas-house-democratic-primary-results-2022-2026-v1").parentIds = [];
    expect(() => build({ sourceLock: lock })).toThrow("SOURCE_LOCK_MISMATCH");
    const outputDrift = structuredClone(json("data/source-lock.json").value) as any;
    outputDrift.entries.find((entry: any) =>
      entry.id === "texas-current-incumbent-primary-event-identity-candidate-v1"
    ).parentIds = [];
    expect(() => build({ sourceLock: outputDrift })).toThrow("SOURCE_LOCK_MISMATCH");
    expect(text("data/source/identity/house-member-data.xml")).toContain("<bioguideID>G000553</bioguideID>");
  });

  it("retains the immutable output with its exact five-parent lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/texas-current-incumbent-primary-event-identity-candidate-v1.json");
    const matches = lock.entries.filter((entry: any) => entry.id === "texas-current-incumbent-primary-event-identity-candidate-v1");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      id: "texas-current-incumbent-primary-event-identity-candidate-v1",
      url: "urn:dsa-seats:texas-current-incumbent-primary-event-identity-candidate:v1:2026-08-05",
      retainedPath: "data/metadata/texas-current-incumbent-primary-event-identity-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "dsa-target-incumbent-roster-20260804-v1",
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "house-xml",
        "congress-legislators-current-20260804",
        "texas-house-democratic-primary-results-2022-2026-v1",
      ],
    license: "unknown", });
  });
});
