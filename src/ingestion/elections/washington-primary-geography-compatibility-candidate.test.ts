/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-candidate mutations */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { buildWashingtonPrimaryGeographyCandidate, validateWashingtonPrimaryGeographyCandidate } from "./washington-primary-geography-compatibility-candidate";

const bytes = (path: string): Buffer => readFileSync(path);
const sha = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const json = (path: string) => JSON.parse(bytes(path).toString("utf8"));
const dbf = (path: string): Buffer => execFileSync("unzip", ["-p", path, "*.dbf"]);
const build = (mutateLock?: (lock: any) => void) => {
  const identityPath = "data/metadata/washington-current-incumbent-top-two-linkage-candidate-v1.json";
  const proposalPath = "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json";
  const receiptPath = "data/metadata/washington-house-top-two-results-receipt-20220802-20240806-v1.json";
  const authorityPath = "data/source/elections/primary-results/geography/census-119-congressional-district-bef.html";
  const cd118Path = "data/source/tiger2022/tl_2022_53_cd118.zip";
  const cd119Path = "data/source/tiger2025/tl_2025_53_cd119.zip";
  const sourceLock = structuredClone(json("data/source-lock.json"));
  mutateLock?.(sourceLock);
  return buildWashingtonPrimaryGeographyCandidate({
    proposal: json(proposalPath), proposalFileSha256: sha(bytes(proposalPath)),
    receipt: json(receiptPath), receiptFileSha256: sha(bytes(receiptPath)),
    identity: json(identityPath), identityFileSha256: sha(bytes(identityPath)),
    authorityHtml: bytes(authorityPath).toString("utf8"), authorityFileSha256: sha(bytes(authorityPath)),
    cd118Zip: bytes(cd118Path), cd118FileSha256: sha(bytes(cd118Path)), cd118Dbf: dbf(cd118Path),
    cd119Zip: bytes(cd119Path), cd119FileSha256: sha(bytes(cd119Path)), cd119Dbf: dbf(cd119Path),
    sourceLock,
  });
};

describe("Washington primary geography compatibility candidate", () => {
  it("closes eight CD118 continuity and eight exact CD119 candidates without approval", () => {
    const value = build();
    expect(value.summary).toEqual({ contestCycleObservations: 16, cd118ToCd119PlanContinuityCandidates: 8, exactCd119SessionKeyCandidates: 8, compatibilityCandidates: 16, automaticallyApprovedRows: 0, scoreEligibleRows: 0 });
    expect(value.rows.filter((row) => row.cycleYear === 2022).every((row) => row.historicalCongressSession === "118" && row.compatibilityDisposition === "official_no_plan_change_declaration_same_geoid_key_candidate")).toBe(true);
    expect(value.rows.filter((row) => row.cycleYear === 2024).every((row) => row.historicalCongressSession === "119" && row.compatibilityDisposition === "same_cd119_session_and_geoid_exact_key_candidate")).toBe(true);
    expect(value.rows.every((row) => row.compatibilityCandidate && !row.compatibilityApproved && !row.identityApproved && !row.scoreEligible && row.formulaApplicability === "confirmed_incompatible")).toBe(true);
  });

  it("preserves the identity parent joins and persisted package exactly", () => {
    const value = build();
    const identity = json("data/metadata/washington-current-incumbent-top-two-linkage-candidate-v1.json");
    expect(value.rows.map((row) => row.identityObservationId)).toEqual(identity.observations.map((row: any) => row.observationId));
    expect(value).toEqual(validateWashingtonPrimaryGeographyCandidate(json("data/metadata/washington-primary-geography-compatibility-candidate-v1.json")));
  });

  it("retains exact six-parent output lineage", () => {
    const lock = json("data/source-lock.json");
    const artifact = bytes("data/metadata/washington-primary-geography-compatibility-candidate-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "washington-primary-geography-compatibility-candidate-v1")).toEqual([{
      id: "washington-primary-geography-compatibility-candidate-v1",
      url: "urn:dsa-seats:washington-primary-geography-compatibility-candidate:v1:2026-08-06",
      retainedPath: "data/metadata/washington-primary-geography-compatibility-candidate-v1.json",
      retainedStatus: "retained", byteSize: artifact.length, sha256: sha(artifact), kind: "review_candidate",
      parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "washington-house-top-two-results-receipt-20220802-20240806-v1", "washington-current-incumbent-top-two-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-53", "tiger-cd119-53"],
    license: "unknown", }]);
  });

  it("rejects fully rehashed approval and evidence escalation plus source-lock drift", () => {
    const approved = structuredClone(build()) as any;
    approved.rows[0].compatibilityApproved = true;
    let unsignedRow = structuredClone(approved.rows[0]); delete unsignedRow.rowSha256;
    approved.rows[0].rowSha256 = digest("dsa-seats:wa-primary-geography-row:v1\0", unsignedRow);
    approved.rowSetSha256 = digest("dsa-seats:wa-primary-geography-row-set:v1\0", approved.rows);
    let unsigned = structuredClone(approved); delete unsigned.packageSha256;
    approved.packageSha256 = digest("dsa-seats:wa-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateWashingtonPrimaryGeographyCandidate(approved)).toThrow("LIFECYCLE_INVALID");

    const relabeled = structuredClone(build()) as any;
    relabeled.rows[0].historicalCongressSession = "119";
    relabeled.rows[0].compatibilityDisposition = "same_cd119_session_and_geoid_exact_key_candidate";
    unsignedRow = structuredClone(relabeled.rows[0]); delete unsignedRow.rowSha256;
    relabeled.rows[0].rowSha256 = digest("dsa-seats:wa-primary-geography-row:v1\0", unsignedRow);
    relabeled.rowSetSha256 = digest("dsa-seats:wa-primary-geography-row-set:v1\0", relabeled.rows);
    unsigned = structuredClone(relabeled); delete unsigned.packageSha256;
    relabeled.packageSha256 = digest("dsa-seats:wa-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateWashingtonPrimaryGeographyCandidate(relabeled)).toThrow("ROW_INVALID");

    expect(() => build((lock) => { lock.entries.find((entry: any) => entry.id === "tiger-cd118-53").kind = "derived_artifact"; })).toThrow("SOURCE_LOCK_MISMATCH");
  });
});
