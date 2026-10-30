/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial persisted candidate mutations */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  buildTexasPrimaryGeographyCandidate,
  validateTexasPrimaryGeographyCandidate,
} from "./texas-primary-geography-compatibility-candidate";

const sha256 = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string =>
  createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const json = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
};
const dbf = (path: string, member: string): Buffer =>
  execFileSync("unzip", ["-p", path, member], { maxBuffer: 8 * 1024 * 1024 });

function build(options?: { cd118Dbf?: Buffer; cd119Dbf?: Buffer; sourceLock?: unknown }) {
  const proposal = json("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = json("data/metadata/texas-house-democratic-primary-results-2022-2026-v1.json");
  const identity = json("data/metadata/texas-current-incumbent-primary-event-identity-candidate-v1.json");
  const authority = readFileSync("data/source/elections/primary-results/geography/census-119-congressional-district-bef.html");
  const cd118Path = "data/source/tiger2022/tl_2022_48_cd118.zip";
  const cd119Path = "data/source/tiger2025/tl_2025_48_cd119.zip";
  const cd118Zip = readFileSync(cd118Path);
  const cd119Zip = readFileSync(cd119Path);
  return buildTexasPrimaryGeographyCandidate({
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
    cd118Dbf: options?.cd118Dbf ?? dbf(cd118Path, "tl_2022_48_cd118.dbf"),
    cd119Zip,
    cd119FileSha256: sha256(cd119Zip),
    cd119Dbf: options?.cd119Dbf ?? dbf(cd119Path, "tl_2025_48_cd119.dbf"),
    sourceLock: options?.sourceLock ?? json("data/source-lock.json").value,
  });
}

describe("Texas primary geography compatibility candidate", () => {
  it("rebuilds the persisted reviewer candidate exactly", () => {
    expect(build()).toEqual(validateTexasPrimaryGeographyCandidate(
      json("data/metadata/texas-primary-geography-compatibility-candidate-v1.json").value,
    ));
  });

  it("retains the immutable candidate with its exact six-parent lineage", () => {
    const lock = json("data/source-lock.json").value as any;
    const artifact = json("data/metadata/texas-primary-geography-compatibility-candidate-v1.json");
    const matches = lock.entries.filter((entry: any) =>
      entry.id === "texas-primary-geography-compatibility-candidate-v1"
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      id: "texas-primary-geography-compatibility-candidate-v1",
      url: "urn:dsa-seats:texas-primary-geography-compatibility-candidate:v1:2026-08-05",
      retainedPath: "data/metadata/texas-primary-geography-compatibility-candidate-v1.json",
      retainedStatus: "retained",
      byteSize: artifact.bytes.byteLength,
      sha256: artifact.sha256,
      kind: "review_candidate",
      parentIds: [
        "house-democratic-primary-source-selection-proposal-20260804-v1",
        "texas-house-democratic-primary-results-2022-2026-v1",
        "texas-current-incumbent-primary-event-identity-candidate-v1",
        "census-cd119-plan-change-authority-20260805",
        "tiger-cd118-48",
        "tiger-cd119-48",
      ],
    license: "unknown", });
  });

  it("closes the event universe without changing result dispositions", () => {
    const value = build();
    expect(value.summary).toEqual({
      eventObservations: 78,
      regularEventObservations: 39,
      runoffEventObservations: 39,
      reportedContestObservations: 44,
      sourceUnobservedEventObservations: 34,
      cd118ToCd119PlanContinuityCandidates: 26,
      exactCd119SessionKeyCandidates: 26,
      cd120AuthorityAndCrosswalkPending: 26,
      numberedDistrictsPerRetainedLayer: 38,
      specialDistrictRowsPerRetainedLayer: 0,
      compatibilityCandidates: 52,
      authorityPendingRows: 26,
      automaticallyApprovedRows: 0,
      scoreEligibleRows: 0,
    });
    expect(value.rows).toHaveLength(78);
    expect(value.rows.filter((row) => row.sourceObservationStatus === "reported_contest")).toHaveLength(44);
    expect(value.rows.filter((row) =>
      row.sourceObservationStatus === "not_observed_in_retained_official_canvass_report_disposition_unresolved"
    )).toHaveLength(34);
    expect(value.rows.every((row) =>
      !row.compatibilityApproved && !row.identityApproved && !row.scoreEligible &&
      row.resultDispositionPreserved &&
      row.certificationStatus === "official_canvass_report_retained_certification_not_separately_bound"
    )).toBe(true);
  });

  it("distinguishes CD118 continuity, exact CD119 keys, and pending CD120 authority", () => {
    const value = build();
    const rows2022 = value.rows.filter((row) => row.cycleYear === 2022);
    const rows2024 = value.rows.filter((row) => row.cycleYear === 2024);
    const rows2026 = value.rows.filter((row) => row.cycleYear === 2026);
    expect(rows2022).toHaveLength(26);
    expect(rows2022.every((row) =>
      row.historicalCongressSession === "118" && row.historicalGeoid === row.targetCd119Geoid &&
      row.compatibilityDisposition === "official_no_plan_change_declaration_same_geoid_key_candidate" &&
      row.evidenceClass === "direct_official_plan_continuity_and_derived_key" &&
      row.confidence === "high" && row.compatibilityCandidate
    )).toBe(true);
    expect(rows2024).toHaveLength(26);
    expect(rows2024.every((row) =>
      row.historicalCongressSession === "119" && row.historicalGeoid === row.targetCd119Geoid &&
      row.compatibilityDisposition === "same_cd119_session_and_geoid_exact_key_candidate" &&
      row.evidenceClass === "derived_exact_session_and_key" && row.compatibilityCandidate
    )).toBe(true);
    expect(rows2024.filter((row) => row.electionStage === "runoff").every((row) =>
      row.sourceObservationStatus === "not_observed_in_retained_official_canvass_report_disposition_unresolved"
    )).toBe(true);
    expect(rows2026).toHaveLength(26);
    expect(rows2026.every((row) =>
      row.historicalCongressSession === "120" && row.historicalGeoid === null &&
      row.compatibilityDisposition === "unassessed_cd120_authority_and_crosswalk_collection_pending" &&
      row.evidenceClass === "authority_pending" && row.confidence === null && !row.compatibilityCandidate
    )).toBe(true);
    expect(value.methodology).toMatchObject({
      rawTigerGeometryEqualityAssessed: false,
      overlapThresholdUsed: false,
      populationEquivalenceAssessed: false,
      cd119SubstitutedForCd120: false,
    });
  });

  it("enforces the exact Texas 38-district inventories with no special row", () => {
    const value = build();
    expect(value.rows.some((row) =>
      row.districtCode === "ZZ" || row.districtCode === "00" || row.targetCd119Geoid.endsWith("ZZ")
    )).toBe(false);
    const cd119Dbf = dbf("data/source/tiger2025/tl_2025_48_cd119.zip", "tl_2025_48_cd119.dbf");
    const forged = Buffer.from(cd119Dbf);
    const geoid = Buffer.from("4838", "ascii");
    const offset = forged.indexOf(geoid);
    expect(offset).toBeGreaterThan(0);
    Buffer.from("48ZZ", "ascii").copy(forged, offset);
    expect(() => build({ cd119Dbf: forged })).toThrow("INPUT_HASH_MISMATCH");
  });

  it("rejects source-lock ancestry drift", () => {
    const sourceLock = json("data/source-lock.json").value as any;
    const drifted = structuredClone(sourceLock);
    drifted.entries.find((entry: any) => entry.id === "tiger-cd118-48").parentIds = ["fabricated"];
    expect(() => build({ sourceLock: drifted })).toThrow("SOURCE_LOCK_MISMATCH");
  });

  it("rejects fully rehashed CD119 substitution for CD120", () => {
    const drifted = structuredClone(build()) as any;
    const row = drifted.rows.find((candidate: any) => candidate.cycleYear === 2026);
    row.historicalGeoid = row.targetCd119Geoid;
    row.compatibilityDisposition = "same_cd119_session_and_geoid_exact_key_candidate";
    row.evidenceClass = "derived_exact_session_and_key";
    row.confidence = "high";
    row.compatibilityCandidate = true;
    const unsignedRow = structuredClone(row);
    delete unsignedRow.rowSha256;
    row.rowSha256 = digest("dsa-seats:tx-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:tx-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:tx-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateTexasPrimaryGeographyCandidate(drifted)).toThrow("ROW_INVALID");
  });

  it("rejects fully rehashed approval, publication, and scoring escalation", () => {
    const drifted = structuredClone(build()) as any;
    drifted.publicationEligible = true;
    drifted.review.status = "approved";
    drifted.review.reviewer = "fabricated-reviewer";
    drifted.rows[0].compatibilityApproved = true;
    drifted.rows[0].scoreEligible = true;
    const unsignedRow = structuredClone(drifted.rows[0]);
    delete unsignedRow.rowSha256;
    drifted.rows[0].rowSha256 = digest("dsa-seats:tx-primary-geography-row:v1\0", unsignedRow);
    drifted.rowSetSha256 = digest("dsa-seats:tx-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted);
    delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:tx-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateTexasPrimaryGeographyCandidate(drifted)).toThrow("LIFECYCLE_INVALID");
  });
});
