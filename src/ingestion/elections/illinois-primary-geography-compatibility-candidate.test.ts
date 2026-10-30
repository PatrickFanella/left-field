/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial persisted candidate mutations */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildIllinoisPrimaryGeographyCandidate,
  validateIllinoisPrimaryGeographyCandidate,
} from "./illinois-primary-geography-compatibility-candidate";

const sha256 = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
};
const dbf = (path: string, member: string): Buffer => execFileSync("unzip", ["-p", path, member], { maxBuffer: 4 * 1024 * 1024 });

function build(options?: { cd118Zip?: Buffer; cd119Dbf?: Buffer; sourceLock?: unknown }) {
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/illinois-house-democratic-primary-results-receipt-2022-2024-v1.json");
  const authority = readFileSync("data/source/elections/primary-results/geography/census-119-congressional-district-bef.html");
  const cd118Zip = readFileSync("data/source/tiger2022/tl_2022_17_cd118.zip");
  const cd119Zip = readFileSync("data/source/tiger2025/tl_2025_17_cd119.zip");
  return buildIllinoisPrimaryGeographyCandidate({
    proposal: proposal.value,
    proposalFileSha256: proposal.sha256,
    receipt: receipt.value,
    receiptFileSha256: receipt.sha256,
    authorityHtml: authority.toString("utf8"),
    authorityFileSha256: sha256(authority),
    cd118Zip: options?.cd118Zip ?? cd118Zip,
    cd118FileSha256: sha256(cd118Zip),
    cd118Dbf: dbf("data/source/tiger2022/tl_2022_17_cd118.zip", "tl_2022_17_cd118.dbf"),
    cd119Zip,
    cd119FileSha256: sha256(cd119Zip),
    cd119Dbf: options?.cd119Dbf ?? dbf("data/source/tiger2025/tl_2025_17_cd119.zip", "tl_2025_17_cd119.dbf"),
    sourceLock: options?.sourceLock ?? json("data/source-lock.json").value,
  });
}

describe("Illinois primary geography compatibility candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateIllinoisPrimaryGeographyCandidate(
      json("data/metadata/illinois-primary-geography-compatibility-candidate-v1.json").value,
    ));
  });

  it("retains the immutable candidate with its exact five-parent lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/illinois-primary-geography-compatibility-candidate-v1.json");
    const matches = lock.entries.filter((entry: any) =>
      entry.id === "illinois-primary-geography-compatibility-candidate-v1"
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      id: "illinois-primary-geography-compatibility-candidate-v1",
      url: "urn:dsa-seats:illinois-primary-geography-compatibility-candidate:v1:2026-08-05",
      retainedPath: "data/metadata/illinois-primary-geography-compatibility-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "illinois-house-democratic-primary-results-receipt-2022-2024-v1",
        "census-cd119-plan-change-authority-20260805",
        "tiger-cd118-17",
        "tiger-cd119-17",
      ],
    license: "unknown", });
  });

  it("closes all thirty-four retained contests while preserving all four evaluator gates", () => {
    const value = build();
    expect(value.summary).toEqual({
      contestCycleObservations: 34,
      cd118ToCd119PlanContinuityCandidates: 17,
      exactCd119SessionKeyCandidates: 17,
      numberedDistrictsPerLayer: 17,
      sentinelRowsPerLayer: 1,
      compatibilityCandidates: 34,
      automaticallyApprovedRows: 0,
      scoreEligibleRows: 0,
    });
    expect(value.inheritedUnresolvedGates).toEqual([
      "retain_final_state_canvass_or_certification",
      "review_incumbent_candidate_identity",
      "review_historical_district_compatibility",
      "review_progressive_candidate_classification",
    ]);
    expect(value.rows).toHaveLength(34);
    expect(value.rows.every((row) =>
      row.compatibilityCandidate && !row.compatibilityApproved && !row.identityApproved && !row.scoreEligible &&
      row.certificationStatus === "not_retained" && row.districtCode !== "ZZ" &&
      row.evaluatorUse === "excluded_pending_certification_identity_historical_geography_and_progressive_classification_review"
    )).toBe(true);
    expect(validateIllinoisPrimaryGeographyCandidate(value)).toEqual(value);
  });

  it("keeps plan continuity and exact-session key evidence distinct from geometry equality", () => {
    const value = build();
    expect(value.rows.filter((row) => row.cycleYear === 2022)).toHaveLength(17);
    expect(value.rows.filter((row) => row.cycleYear === 2022).every((row) =>
      row.historicalCongressSession === "118" &&
      row.compatibilityDisposition === "official_no_plan_change_declaration_same_geoid_key_candidate" &&
      row.evidenceClass === "direct_official_plan_continuity_and_derived_key"
    )).toBe(true);
    expect(value.rows.filter((row) => row.cycleYear === 2024)).toHaveLength(17);
    expect(value.rows.filter((row) => row.cycleYear === 2024).every((row) =>
      row.historicalCongressSession === "119" &&
      row.compatibilityDisposition === "same_cd119_session_and_geoid_exact_key_candidate" &&
      row.evidenceClass === "derived_exact_session_and_key"
    )).toBe(true);
    expect(value.methodology).toMatchObject({
      rawTigerGeometryEqualityAssessed: false,
      overlapThresholdUsed: false,
      populationEquivalenceAssessed: false,
      future2026Rows: 0,
    });
  });

  it("rejects geography byte substitution and source-lock parent drift", () => {
    const cd118Zip = readFileSync("data/source/tiger2022/tl_2022_17_cd118.zip");
    expect(() => build({ cd118Zip: Buffer.concat([cd118Zip, Buffer.from([0])]) })).toThrow("INPUT_HASH_MISMATCH");

    const sourceLock = json("data/source-lock.json").value as any;
    const drifted = structuredClone(sourceLock);
    drifted.entries.find((entry: any) => entry.id === "illinois-house-democratic-primary-results-receipt-2022-2024-v1").parentIds = [];
    expect(() => build({ sourceLock: drifted })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("requires exactly one valid ZZ sentinel but never emits it as a contest", () => {
    const cd119Dbf = dbf("data/source/tiger2025/tl_2025_17_cd119.zip", "tl_2025_17_cd119.dbf");
    const sentinelGeoid = Buffer.from("17ZZ", "ascii");
    const offset = cd119Dbf.indexOf(sentinelGeoid);
    expect(offset).toBeGreaterThan(0);
    const substituted = Buffer.from(cd119Dbf);
    const headerLength = substituted.readUInt16LE(8);
    const recordLength = substituted.readUInt16LE(10);
    const recordStart = headerLength + Math.floor((offset - headerLength) / recordLength) * recordLength;
    for (let cursor = recordStart; cursor < recordStart + recordLength;) {
      const match = substituted.indexOf(sentinelGeoid, cursor);
      if (match < 0 || match >= recordStart + recordLength) break;
      Buffer.from("1717", "ascii").copy(substituted, match);
      cursor = match + sentinelGeoid.length;
    }
    expect(() => build({ cd119Dbf: substituted })).toThrow("INPUT_HASH_MISMATCH");

    const value = build();
    expect(value.rows.some((row) =>
      row.districtCode === "ZZ" || row.targetCd119Geoid === "17ZZ" || row.historicalGeoid === "17ZZ"
    )).toBe(false);
  });

  it("rejects fully rehashed removal of inherited gates and evaluator exclusions", () => {
    const missingGate = structuredClone(build()) as any;
    missingGate.inheritedUnresolvedGates.pop();
    const missingGateUnsigned = structuredClone(missingGate);
    delete missingGateUnsigned.packageSha256;
    missingGate.packageSha256 = digest("dsa-seats:il-primary-geography-candidate:v1\0", missingGateUnsigned);
    expect(() => validateIllinoisPrimaryGeographyCandidate(missingGate)).toThrow("LIFECYCLE_INVALID");

    const promoted = structuredClone(build()) as any;
    promoted.rows[0].certificationStatus = "retained";
    promoted.rows[0].evaluatorUse = "included";
    const unsignedRow = structuredClone(promoted.rows[0]);
    delete unsignedRow.rowSha256;
    promoted.rows[0].rowSha256 = digest("dsa-seats:il-primary-geography-row:v1\0", unsignedRow);
    promoted.rowSetSha256 = digest("dsa-seats:il-primary-geography-row-set:v1\0", promoted.rows);
    const unsigned = structuredClone(promoted);
    delete unsigned.packageSha256;
    promoted.packageSha256 = digest("dsa-seats:il-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateIllinoisPrimaryGeographyCandidate(promoted)).toThrow("ROW_INVALID");
  });

  it("rejects fully rehashed drift from retained contest facts", () => {
    const drifted = structuredClone(build()) as any;
    drifted.rows[0].contestSha256 = "0".repeat(64);
    const unsignedRow = structuredClone(drifted.rows[0]);
    delete unsignedRow.rowSha256;
    drifted.rows[0].rowSha256 = digest("dsa-seats:il-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:il-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:il-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateIllinoisPrimaryGeographyCandidate(drifted)).toThrow("RETAINED_FACT_INVALID");
  });

  it("rejects fully rehashed unknown row semantics", () => {
    const drifted = structuredClone(build()) as any;
    drifted.rows[0].geometryEqualityOverride = true;
    const unsignedRow = structuredClone(drifted.rows[0]);
    delete unsignedRow.rowSha256;
    drifted.rows[0].rowSha256 = digest("dsa-seats:il-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:il-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:il-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateIllinoisPrimaryGeographyCandidate(drifted)).toThrow("ROW_FIELDS_INVALID");
  });
});
