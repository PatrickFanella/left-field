/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial persisted candidate mutations */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildArizonaPrimaryGeographyCandidate,
  validateArizonaPrimaryGeographyCandidate,
} from "./arizona-primary-geography-compatibility-candidate";

const sha256 = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
};
const dbf = (path: string, member: string): Buffer =>
  execFileSync("unzip", ["-p", path, member], { maxBuffer: 4 * 1024 * 1024 });

function build(options?: { cd118Dbf?: Buffer; sourceLock?: unknown }) {
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/arizona-house-democratic-primary-results-2022-2026-v1.json");
  const identity = json("data/metadata/arizona-current-incumbent-primary-linkage-candidate-v1.json");
  const authority = readFileSync("data/source/elections/primary-results/geography/census-119-congressional-district-bef.html");
  const cd118Path = "data/source/tiger2022/tl_2022_04_cd118.zip";
  const cd119Path = "data/source/tiger2025/tl_2025_04_cd119.zip";
  const cd118Zip = readFileSync(cd118Path);
  const cd119Zip = readFileSync(cd119Path);
  return buildArizonaPrimaryGeographyCandidate({
    proposal: proposal.value,
    proposalFileSha256: proposal.sha256,
    receipt: receipt.value,
    receiptFileSha256: receipt.sha256,
    identity: identity.value,
    identityFileSha256: identity.sha256,
    authorityHtml: authority.toString("utf8"),
    authorityFileSha256: sha256(authority),
    cd118Zip,
    cd118FileSha256: sha256(cd118Zip),
    cd118Dbf: options?.cd118Dbf ?? dbf(cd118Path, "tl_2022_04_cd118.dbf"),
    cd119Zip,
    cd119FileSha256: sha256(cd119Zip),
    cd119Dbf: dbf(cd119Path, "tl_2025_04_cd119.dbf"),
    sourceLock: options?.sourceLock ?? json("data/source-lock.json").value,
  });
}

describe("Arizona primary geography compatibility candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateArizonaPrimaryGeographyCandidate(
      json("data/metadata/arizona-primary-geography-compatibility-candidate-v1.json").value,
    ));
  });

  it("closes the six identity observations without changing identity disposition", () => {
    const value = build();
    expect(value.summary).toEqual({
      contestCycleObservations: 6,
      identityProposedLinkRows: 3,
      identityNoMatchRows: 3,
      cd118ToCd119PlanContinuityCandidates: 3,
      exactCd119SessionKeyCandidates: 3,
      numberedDistrictsPerRetainedLayer: 9,
      specialDistrictRowsPerRetainedLayer: 0,
      compatibilityCandidates: 6,
      automaticallyApprovedRows: 0,
      scoreEligibleRows: 0,
    });
    const predecessor = value.rows.find((row) => row.observationId === "az:geography:2022:07");
    expect(predecessor).toMatchObject({
      identityObservationId: "az:identity:2022:07",
      identityStatus: "reported_contest_no_unique_candidate_match",
      compatibilityCandidate: true,
      compatibilityApproved: false,
      identityApproved: false,
    });
  });

  it("keeps continuity and exact-session evidence distinct from geometry equality", () => {
    const value = build();
    expect(value.rows.filter((row) => row.cycleYear === 2022)).toHaveLength(3);
    expect(value.rows.filter((row) => row.cycleYear === 2022).every((row) =>
      row.historicalCongressSession === "118" && row.historicalGeoid === row.targetCd119Geoid &&
      row.compatibilityDisposition === "official_no_plan_change_declaration_same_geoid_key_candidate" &&
      row.evidenceClass === "direct_official_plan_continuity_and_derived_key"
    )).toBe(true);
    expect(value.rows.filter((row) => row.cycleYear === 2024).every((row) =>
      row.historicalCongressSession === "119" && row.historicalGeoid === row.targetCd119Geoid &&
      row.compatibilityDisposition === "same_cd119_session_and_geoid_exact_key_candidate" &&
      row.evidenceClass === "derived_exact_session_and_key"
    )).toBe(true);
    expect(value.rows.some((row) => Number(row.cycleYear) === 2026)).toBe(false);
    expect(value.methodology).toMatchObject({
      rawTigerGeometryEqualityAssessed: false,
      overlapThresholdUsed: false,
      populationEquivalenceAssessed: false,
      future2026Rows: 0,
    });
  });

  it("rejects source byte substitution and source-lock ancestry drift", () => {
    const cd118Dbf = dbf("data/source/tiger2022/tl_2022_04_cd118.zip", "tl_2022_04_cd118.dbf");
    expect(() => build({ cd118Dbf: Buffer.concat([cd118Dbf, Buffer.from([0])]) })).toThrow("INPUT_HASH_MISMATCH");
    const sourceLock = structuredClone(json("data/source-lock.json").value) as any;
    sourceLock.entries.find((entry: any) => entry.id === "arizona-current-incumbent-primary-linkage-candidate-v1").parentIds = [];
    expect(() => build({ sourceLock })).toThrow("SOURCE_LOCK_MISMATCH");
    const outputDrift = structuredClone(json("data/source-lock.json").value) as any;
    outputDrift.entries.find((entry: any) => entry.id === "arizona-primary-geography-compatibility-candidate-v1").parentIds = [];
    expect(() => build({ sourceLock: outputDrift })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("rejects fully rehashed identity-disposition and lifecycle escalation", () => {
    const drifted = structuredClone(build()) as any;
    const row = drifted.rows.find((candidate: any) => candidate.observationId === "az:geography:2022:07");
    row.identityStatus = "proposed_identity_link";
    row.identityApproved = true;
    row.compatibilityApproved = true;
    row.scoreEligible = true;
    const unsignedRow = structuredClone(row);
    delete unsignedRow.rowSha256;
    row.rowSha256 = digest("dsa-seats:az-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:az-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:az-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateArizonaPrimaryGeographyCandidate(drifted)).toThrow("ROW_INVALID");
  });

  it("rejects fully rehashed unknown row semantics", () => {
    const drifted = structuredClone(build()) as any;
    drifted.rows[0].geometryEqualityOverride = true;
    const unsignedRow = structuredClone(drifted.rows[0]);
    delete unsignedRow.rowSha256;
    drifted.rows[0].rowSha256 = digest("dsa-seats:az-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:az-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:az-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateArizonaPrimaryGeographyCandidate(drifted)).toThrow("ROW_FIELDS_INVALID");
  });

  it("retains the exact six-parent output lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/arizona-primary-geography-compatibility-candidate-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "arizona-primary-geography-compatibility-candidate-v1")).toEqual([{
      id: "arizona-primary-geography-compatibility-candidate-v1",
      url: "urn:dsa-seats:arizona-primary-geography-compatibility-candidate:v1:2026-08-06",
      retainedPath: "data/metadata/arizona-primary-geography-compatibility-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "arizona-house-democratic-primary-results-2022-2026-v1",
        "arizona-current-incumbent-primary-linkage-candidate-v1",
        "census-cd119-plan-change-authority-20260805",
        "tiger-cd118-04",
        "tiger-az",
      ],
    license: "unknown", }]);
  });
});
