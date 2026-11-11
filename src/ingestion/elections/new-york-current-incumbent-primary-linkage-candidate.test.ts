/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-candidate mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { buildNewYorkPrimaryIdentityCandidate, validateNewYorkPrimaryIdentityCandidate } from "./new-york-current-incumbent-primary-linkage-candidate";

const text = (path: string): string => readFileSync(path, "utf8");
const json = (path: string) => { const bytes = readFileSync(path); return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") }; };
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const build = (options?: { sourceLockJson?: string }) => buildNewYorkPrimaryIdentityCandidate({
  rosterJson: text("data/metadata/dsa-target-incumbent-roster-20260804-v1.json"),
  proposalJson: text("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json"),
  houseXml: text("data/source/identity/house-member-data.xml"),
  congressJson: text("data/source/identity/congress-legislators-current-20260804.json"),
  dispositionsJson: text("data/metadata/new-york-house-democratic-primary-dispositions-2022-2024-v2.json"),
  statewideResultsJson: text("data/metadata/new-york-house-democratic-primary-reported-results-2022-2024-v1.json"),
  nycResultsJson: text("data/metadata/new-york-city-house-democratic-primary-certified-results-2022-2024-v1.json"),
  sourceLockJson: options?.sourceLockJson ?? text("data/source-lock.json"),
});

describe("New York current-incumbent primary linkage candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateNewYorkPrimaryIdentityCandidate(json("data/metadata/new-york-current-incumbent-primary-linkage-candidate-v1.json").value));
  });

  it("closes the exact 38-row target universe without inventing evidence for nonreported rows", () => {
    const value = build();
    expect(value.summary).toEqual({
      targetSeats: 19, contestObservations: 38, reportedObservations: 16,
      statewideReportedObservations: 9, localCertifiedReportedObservations: 7,
      certifiedUncontestedObservations: 7, unresolvedObservations: 15,
      reportedCandidateRows: 55, reportedCandidateVotes: 652_367,
      proposedIdentityLinks: 12, exactNameObservations: 6, derivedNameRelationships: 6,
      reportedContestNoUniqueMatch: 4, directIdentifierBridges: 0,
      automaticallyApprovedRows: 0, selectedRows: 0, scoreEligibleRows: 0,
    });
    const nonreported = value.observations.filter((row) => row.disposition !== "reported_contest");
    expect(nonreported).toHaveLength(22);
    expect(nonreported.every((row) => row.contestId === null && row.contestSha256 === null && row.sourceCandidateCount === null && row.sourceContestCandidateVotes === null && row.sourceCandidate === null)).toBe(true);
  });

  it("keeps state and NYC authority distinct and infers no source winner", () => {
    const value = build();
    expect(value.observations.filter((row) => row.resultAuthorityStatus === "official_reported_contest_candidate")).toHaveLength(9);
    expect(value.observations.filter((row) => row.resultAuthorityStatus === "local_canvassing_board_certified_candidate")).toHaveLength(7);
    expect(value.observations.every((row) => row.sourceWinnerStatus === "not_established_by_composition" && !row.identityApproved && !row.scoreEligible)).toBe(true);
    expect(value.observations.some((row) => Number(row.cycleYear) === 2026 || row.districtCode === "01")).toBe(false);
  });

  it("uses only the finite audited identity methods and preserves four predecessor no-matches", () => {
    const value = build();
    expect(value.observations.filter((row) => row.evidenceClass === "exact_name_observation")).toHaveLength(6);
    expect(value.observations.filter((row) => row.evidenceClass === "derived_name_relationship")).toHaveLength(6);
    expect(value.observations.filter((row) => row.identityStatus === "reported_contest_no_unique_candidate_match").map((row) => row.observationId)).toEqual([
      "ny:identity:2022:03", "ny:identity:2022:16", "ny:identity:2022:22", "ny:identity:2022:26",
    ]);
    expect(value.observations.filter((row) => row.matchMethod === "derived_retained_public_alias_given_name_same_surname_and_district").map((row) => row.observationId)).toEqual(["ny:identity:2022:18"]);
  });

  it("rejects fully rehashed lifecycle escalation and source-lock drift", () => {
    const drifted = structuredClone(build()) as any;
    drifted.observations[0].identityApproved = true;
    const row = structuredClone(drifted.observations[0]); delete row.rowSha256;
    drifted.observations[0].rowSha256 = digest("dsa-seats:ny-primary-identity-row:v1\0", row);
    drifted.observationSetSha256 = digest("dsa-seats:ny-primary-identity-row-set:v1\0", drifted.observations);
    const unsigned = structuredClone(drifted); delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:ny-primary-identity-candidate:v1\0", unsigned);
    expect(() => validateNewYorkPrimaryIdentityCandidate(drifted)).toThrow("LIFECYCLE_INVALID");
    const lock = structuredClone(json("data/source-lock.json").value) as any;
    lock.entries.find((entry: any) => entry.id === "new-york-house-democratic-primary-dispositions-2022-2024-v2").parentIds = [];
    expect(() => build({ sourceLockJson: `${JSON.stringify(lock, null, 2)}\n` })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("retains exact seven-parent output lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/new-york-current-incumbent-primary-linkage-candidate-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "new-york-current-incumbent-primary-linkage-candidate-v1")).toEqual([{
      id: "new-york-current-incumbent-primary-linkage-candidate-v1",
      url: "urn:dsa-seats:new-york-current-incumbent-primary-linkage-candidate:v1:2026-08-06",
      retainedPath: "data/metadata/new-york-current-incumbent-primary-linkage-candidate-v1.json",
      retainedStatus: "retained", byteSize: artifact.bytes.byteLength, sha256: artifact.sha256, kind: "review_candidate",
      parentIds: ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "new-york-house-democratic-primary-dispositions-2022-2024-v2", "new-york-house-democratic-primary-reported-results-2022-2024-v1", "new-york-city-house-democratic-primary-certified-results-2022-2024-v1"],
    license: "unknown", }]);
  });
});
