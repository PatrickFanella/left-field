/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial persisted candidate mutations */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildMichiganPrimaryGeographyCandidate,
  validateMichiganPrimaryGeographyCandidate,
} from "./michigan-primary-geography-compatibility-candidate";

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
  const receipt = json("data/metadata/michigan-house-democratic-primary-results-2022-2026-v1.json");
  const identity = json("data/metadata/michigan-current-incumbent-primary-linkage-candidate-v1.json");
  const authority = readFileSync("data/source/elections/primary-results/geography/census-119-congressional-district-bef.html");
  const cd118Path = "data/source/tiger2022/tl_2022_26_cd118.zip";
  const cd119Path = "data/source/tiger2025/tl_2025_26_cd119.zip";
  const cd118Zip = readFileSync(cd118Path);
  const cd119Zip = readFileSync(cd119Path);
  return buildMichiganPrimaryGeographyCandidate({
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
    cd118Dbf: options?.cd118Dbf ?? dbf(cd118Path, "tl_2022_26_cd118.dbf"),
    cd119Zip,
    cd119FileSha256: sha256(cd119Zip),
    cd119Dbf: dbf(cd119Path, "tl_2025_26_cd119.dbf"),
    sourceLock: options?.sourceLock ?? json("data/source-lock.json").value,
  });
}

describe("Michigan primary geography compatibility candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateMichiganPrimaryGeographyCandidate(
      json("data/metadata/michigan-primary-geography-compatibility-candidate-v1.json").value,
    ));
  });

  it("closes the twelve identity observations without changing identity disposition", () => {
    const value = build();
    expect(value.summary).toEqual({
      contestCycleObservations: 12,
      identityProposedLinkRows: 11,
      identityNoMatchRows: 1,
      cd118ToCd119PlanContinuityCandidates: 6,
      exactCd119SessionKeyCandidates: 6,
      numberedDistrictsPerRetainedLayer: 13,
      specialDistrictRowsPerRetainedLayer: 0,
      compatibilityCandidates: 12,
      automaticallyApprovedRows: 0,
      scoreEligibleRows: 0,
    });
    const mi08 = value.rows.find((row) => row.observationId === "mi:geography:2022:08");
    expect(mi08).toMatchObject({
      identityObservationId: "mi:identity:2022:08",
      identityStatus: "reported_contest_no_unique_candidate_match",
      compatibilityCandidate: true,
      compatibilityApproved: false,
      identityApproved: false,
    });
  });

  it("keeps continuity and exact-session evidence distinct from geometry equality", () => {
    const value = build();
    expect(value.rows.filter((row) => row.cycleYear === 2022)).toHaveLength(6);
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
    const cd118Dbf = dbf("data/source/tiger2022/tl_2022_26_cd118.zip", "tl_2022_26_cd118.dbf");
    expect(() => build({ cd118Dbf: Buffer.concat([cd118Dbf, Buffer.from([0])]) })).toThrow("INPUT_HASH_MISMATCH");
    const sourceLock = structuredClone(json("data/source-lock.json").value) as any;
    sourceLock.entries.find((entry: any) => entry.id === "michigan-current-incumbent-primary-linkage-candidate-v1").parentIds = [];
    expect(() => build({ sourceLock })).toThrow("SOURCE_LOCK_MISMATCH");
    const outputDrift = structuredClone(json("data/source-lock.json").value) as any;
    outputDrift.entries.find((entry: any) => entry.id === "michigan-primary-geography-compatibility-candidate-v1").parentIds = [];
    expect(() => build({ sourceLock: outputDrift })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("rejects fully rehashed identity-disposition and lifecycle escalation", () => {
    const drifted = structuredClone(build()) as any;
    const row = drifted.rows.find((candidate: any) => candidate.observationId === "mi:geography:2022:08");
    row.identityStatus = "proposed_identity_link";
    row.identityApproved = true;
    row.compatibilityApproved = true;
    row.scoreEligible = true;
    const unsignedRow = structuredClone(row);
    delete unsignedRow.rowSha256;
    row.rowSha256 = digest("dsa-seats:mi-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:mi-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:mi-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateMichiganPrimaryGeographyCandidate(drifted)).toThrow("ROW_INVALID");
  });

  it("rejects fully rehashed unknown row semantics", () => {
    const drifted = structuredClone(build()) as any;
    drifted.rows[0].geometryEqualityOverride = true;
    const unsignedRow = structuredClone(drifted.rows[0]);
    delete unsignedRow.rowSha256;
    drifted.rows[0].rowSha256 = digest("dsa-seats:mi-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:mi-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:mi-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateMichiganPrimaryGeographyCandidate(drifted)).toThrow("ROW_FIELDS_INVALID");
  });

  it("retains the exact six-parent output lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/michigan-primary-geography-compatibility-candidate-v1.json");
    expect(lock.entries.filter((entry: any) => entry.id === "michigan-primary-geography-compatibility-candidate-v1")).toEqual([{
      id: "michigan-primary-geography-compatibility-candidate-v1",
      url: "urn:dsa-seats:michigan-primary-geography-compatibility-candidate:v1:2026-08-05",
      retainedPath: "data/metadata/michigan-primary-geography-compatibility-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "michigan-house-democratic-primary-results-2022-2026-v1",
        "michigan-current-incumbent-primary-linkage-candidate-v1",
        "census-cd119-plan-change-authority-20260805",
        "tiger-cd118-26",
        "tiger-cd119-26",
      ],
    license: "unknown", }]);
  });
});
