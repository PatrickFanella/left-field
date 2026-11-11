import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildHousePrimaryCoverageLedger, buildHousePrimaryProjection, validateHousePrimaryCoverageLedger, validateHousePrimaryProjection } from "./house-primary-projection";

const temporary: string[] = [];
const copyRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "house-primary-projection-")); temporary.push(root);
  cpSync("data/rapid-acquisition", join(root, "data/rapid-acquisition"), { recursive: true });
  cpSync("data/source-lock.json", join(root, "data/source-lock.json"));
  cpSync("data/source/rapid/house-primary", join(root, "data/source/rapid/house-primary"), { recursive: true });
  return root;
};
const rehash = (value: ReturnType<typeof buildHousePrimaryProjection>) => {
  const copy = structuredClone(value) as unknown as Record<string, unknown>;
  copy.packageSha256 = "0".repeat(64);
  return copy;
};
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("House primary projection", () => {
  it("closes exact source, state-cycle, and target-district scopes without result claims", () => {
    const value = buildHousePrimaryProjection();
    expect(value.sources).toHaveLength(16);
    expect(value.coverageRows).toHaveLength(48);
    expect(value.observations).toHaveLength(78);
    expect(Object.values(value.summary.byStatus).reduce((sum, count) => sum + count, 0)).toBe(78);
    expect(value.observations.every((row) => row.sourceContestId === null && row.candidates === null && row.votes === null && row.winner === null && row.identity === null && !row.scoreEligible)).toBe(true);
    expect(validateHousePrimaryProjection(value)).toEqual(value);
    expect(buildHousePrimaryProjection().packageSha256).toBe(value.packageSha256);
    const ledger = buildHousePrimaryCoverageLedger(value);
    expect(ledger.rows).toHaveLength(48);
    expect(ledger.rows.flatMap((row) => row.expectedTargetDistricts)).toHaveLength(78);
    expect(validateHousePrimaryCoverageLedger(ledger, value)).toEqual(ledger);
  });

  it("rejects registry, source-lock, and retained-byte drift", () => {
    const registryRoot = copyRoot();
    const registryPath = join(registryRoot, "data/rapid-acquisition/house-primary-source-registry-v1.json");
    writeFileSync(registryPath, readFileSync(registryPath, "utf8").replace("Delaware Department of Elections", "Altered authority"));
    expect(() => buildHousePrimaryProjection(registryRoot)).toThrow();

    const lockRoot = copyRoot();
    const lockPath = join(lockRoot, "data/source-lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.entries.find((entry: { id: string }) => entry.id === "de-2022-primary-results").url = "https://example.invalid/drift";
    writeFileSync(lockPath, JSON.stringify(lock));
    expect(() => buildHousePrimaryProjection(lockRoot)).toThrow("HOUSE_PRIMARY_ARTIFACT_LOCK_MISMATCH");

    const bytesRoot = copyRoot();
    const sourcePath = join(bytesRoot, "data/source/rapid/house-primary/de/2022/primary-results.csv");
    writeFileSync(sourcePath, Buffer.concat([readFileSync(sourcePath), Buffer.from("drift")]));
    expect(() => buildHousePrimaryProjection(bytesRoot)).toThrow("HOUSE_PRIMARY_ARTIFACT_DRIFT");
  });

  it.each([
    ["votes", 1],
    ["winner", "fabricated"],
    ["scoreEligible", true],
    ["sourceContestId", "fabricated"],
  ])("rejects coherently presented %s escalation", (field, replacement) => {
    const value = rehash(buildHousePrimaryProjection());
    (value.observations as Record<string, unknown>[])[0]![field] = replacement;
    expect(() => validateHousePrimaryProjection(value)).toThrow("HOUSE_PRIMARY_PROJECTION_INVALID");
  });

  it("preserves authority-unavailable as distinct missingness", () => {
    const root = copyRoot();
    const registryPath = join(root, "data/rapid-acquisition/house-primary-source-registry-v1.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    const row = registry.rows.find((item: { stateCode: string; cycleYear: number }) => item.stateCode === "AL" && item.cycleYear === 2022);
    row.finalClosure = "authority_unavailable";
    row.districtAvailability = Object.fromEntries(Object.keys(row.districtAvailability).map((district) => [district, "authority_unavailable"]));
    writeFileSync(registryPath, JSON.stringify(registry));
    const value = buildHousePrimaryProjection(root);
    expect(value.observations.filter((item) => item.stateCode === "AL" && item.cycleYear === 2022).every((item) => item.parseStatus === "authority_unavailable" && item.missingReason === "authority_unavailable")).toBe(true);
  });
});
