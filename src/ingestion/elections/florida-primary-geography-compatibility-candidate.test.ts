/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial persisted candidate mutations */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { buildFloridaPrimaryGeographyCandidate, validateFloridaPrimaryGeographyCandidate } from "./florida-primary-geography-compatibility-candidate";

const sha = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const load = (path: string) => { const bytes = readFileSync(path); return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha(bytes) }; };
const dbf = (path: string, member: string): Buffer => execFileSync("unzip", ["-p", path, member]);

function build(sourceLock?: unknown) {
  const proposal = load("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json");
  const receipt = load("data/metadata/florida-house-democratic-primary-results-2022-2026-v1.json");
  const identity = load("data/metadata/florida-current-incumbent-primary-linkage-candidate-v1.json");
  const authority = readFileSync("data/source/elections/primary-results/geography/census-119-congressional-district-bef.html");
  const cd118 = readFileSync("data/source/tiger2022/tl_2022_12_cd118.zip");
  const cd119 = readFileSync("data/source/tiger2025/tl_2025_12_cd119.zip");
  return buildFloridaPrimaryGeographyCandidate({ proposal: proposal.value, proposalFileSha256: proposal.sha256,
    receipt: receipt.value, receiptFileSha256: receipt.sha256, identity: identity.value, identityFileSha256: identity.sha256,
    authorityHtml: authority.toString("utf8"), authorityFileSha256: sha(authority), cd118Zip: cd118, cd118FileSha256: sha(cd118),
    cd118Dbf: dbf("data/source/tiger2022/tl_2022_12_cd118.zip", "tl_2022_12_cd118.dbf"), cd119Zip: cd119,
    cd119FileSha256: sha(cd119), cd119Dbf: dbf("data/source/tiger2025/tl_2025_12_cd119.zip", "tl_2025_12_cd119.dbf"),
    sourceLock: sourceLock ?? load("data/source-lock.json").value });
}

describe("Florida primary geography compatibility candidate", () => {
  it("rebuilds the persisted candidate and closes all fourteen identity observations", () => {
    const value = build();
    expect(value).toEqual(validateFloridaPrimaryGeographyCandidate(load("data/metadata/florida-primary-geography-compatibility-candidate-v1.json").value));
    expect(value.summary).toEqual({ contestCycleObservations: 14, identityProposedLinkRows: 7, identitySourceUnobservedRows: 7,
      cd118ToCd119PlanContinuityCandidates: 7, exactCd119SessionKeyCandidates: 7, numberedDistrictsPerRetainedLayer: 28,
      specialDistrictRowsPerRetainedLayer: 0, compatibilityCandidates: 14, automaticallyApprovedRows: 0, scoreEligibleRows: 0 });
    expect(value.rows.filter((row) => row.identityStatus === "source_unobserved_district_cycle_unresolved")).toHaveLength(7);
  });

  it("keeps continuity separate from exact-session keys and raw geometry equality", () => {
    const value = build();
    expect(value.rows.filter((row) => row.cycleYear === 2022).every((row) => row.historicalCongressSession === "118" &&
      row.compatibilityDisposition === "official_no_plan_change_declaration_same_geoid_key_candidate")).toBe(true);
    expect(value.rows.filter((row) => row.cycleYear === 2024).every((row) => row.historicalCongressSession === "119" &&
      row.compatibilityDisposition === "same_cd119_session_and_geoid_exact_key_candidate")).toBe(true);
    expect(value.methodology).toMatchObject({ rawTigerGeometryEqualityAssessed: false, overlapThresholdUsed: false,
      populationEquivalenceAssessed: false, automaticDecisionClosure: false, evaluatorNumericValues: 0 });
  });

  it("rejects fully rehashed approval escalation", () => {
    const drifted = structuredClone(build()) as any;
    drifted.rows[0].compatibilityApproved = true; drifted.rows[0].identityApproved = true; drifted.rows[0].scoreEligible = true;
    const row = structuredClone(drifted.rows[0]); delete row.rowSha256;
    drifted.rows[0].rowSha256 = digest("dsa-seats:fl-primary-geography-row:v1\0", row);
    drifted.rowSetSha256 = digest("dsa-seats:fl-primary-geography-row-set:v1\0", drifted.rows);
    const unsigned = structuredClone(drifted); delete unsigned.packageSha256;
    drifted.packageSha256 = digest("dsa-seats:fl-primary-geography-candidate:v1\0", unsigned);
    expect(() => validateFloridaPrimaryGeographyCandidate(drifted)).toThrow("ROW_INVALID");
  });

  it("retains exact six-parent output lineage", () => {
    const lock = load("data/source-lock.json").value as any;
    const artifact=load("data/metadata/florida-primary-geography-compatibility-candidate-v1.json");
    expect(lock.entries.filter((entry:any)=>entry.id==="florida-primary-geography-compatibility-candidate-v1")).toEqual([{id:"florida-primary-geography-compatibility-candidate-v1",url:"urn:dsa-seats:florida-primary-geography-compatibility-candidate:v1:2026-08-06",retainedPath:"data/metadata/florida-primary-geography-compatibility-candidate-v1.json",retainedStatus:"retained",byteSize:artifact.bytes.length,sha256:artifact.sha256,kind:"review_candidate",parentIds:["house-democratic-primary-source-selection-proposal-20260804-v1","florida-house-democratic-primary-results-2022-2026-v1","florida-current-incumbent-primary-linkage-candidate-v1","census-cd119-plan-change-authority-20260805","tiger-cd118-12","tiger-fl"],license:"unknown"}]);
    const drifted=structuredClone(lock); drifted.entries.find((entry:any)=>entry.id==="florida-current-incumbent-primary-linkage-candidate-v1").parentIds=[];
    expect(()=>build(drifted)).toThrow("SOURCE_LOCK_MISMATCH");
  });
});
