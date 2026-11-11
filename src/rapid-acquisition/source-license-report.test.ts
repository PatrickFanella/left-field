import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { validateSourceRights } from "../../scripts/lib/source-license.mjs";
import type { SourceLock, SourceLockEntry } from "./intake/source-lock";
import { buildCurrentSourceLicenseReport, buildSourceLicenseReport, serializeSourceLicenseReport } from "./source-license-report";

const pin = (id: string, parentIds: readonly string[] = []): SourceLockEntry => ({ id, url: `https://example.test/${id}`, retainedPath: null, retainedStatus: "nonretained", byteSize: 0, sha256: "a".repeat(64), kind: parentIds.length ? "derived_artifact" : "source", parentIds, license: "unknown" });
const evidence = { url: "https://example.test/terms", scope: "dataset" as const, reviewedAt: "2026-10-30", notes: "Explicit dataset grant.", retainedSourceId: "terms" };
const terms = { ...pin("terms"), retainedStatus: "retained" as const, retainedPath: "data/source/terms", license: "CC0-1.0", licenseEvidence: evidence };

describe("source rights and dependency reporting", () => {
  it("reports transitive unknown MEDSL ancestry even when a derived output records terms", () => {
    const source = { ...pin("medsl"), url: "https://raw.githubusercontent.com/MEDSL/2024-elections-official/pin/results.csv" };
    const derived = { ...pin("published", ["middle"]), license: "CC0-1.0", licenseEvidence: evidence };
    const lock: SourceLock = { version: 1, entries: [derived, source, pin("middle", ["medsl"]), pin("unrelated"), terms] };
    const report = buildSourceLicenseReport(lock, [{ label: "house", id: "published" }]);
    expect(report.publishedOutputs[0]).toMatchObject({ unknownLicenseIds: ["medsl", "middle"], unknownMedslLicenseIds: ["medsl"], unknownUpstreamLicenseIds: ["medsl", "middle"] });
    expect(report.publishedOutputs[0].dependencyIds).not.toContain("unrelated");
    expect(buildSourceLicenseReport({ ...lock, entries: [...lock.entries].reverse() }, [{ label: "house", id: "published" }])).toEqual(report);
  });

  it("requires explicit terms and scoped review evidence; software terms cannot license data", () => {
    expect(() => validateSourceRights({ version: 1, entries: [{ ...pin("x"), license: undefined }] })).toThrow("LICENSE_INVALID:x");
    expect(() => validateSourceRights({ version: 1, entries: [{ ...pin("x"), license: "MIT" }] })).toThrow("EVIDENCE_MISSING:x");
    expect(() => validateSourceRights({ version: 1, entries: [{ ...pin("x"), license: "MIT", licenseEvidence: { ...evidence, scope: "software" } }, terms] })).toThrow("SCOPE_MISMATCH:x");
    expect(() => validateSourceRights({ version: 1, entries: [{ ...pin("x"), licenseEvidence: { ...evidence, reviewedAt: "2026-02-30" } }, terms] })).toThrow("EVIDENCE_INVALID:x");
    expect(() => validateSourceRights({ version: 1, entries: [{ ...pin("x"), licenseEvidence: { ...evidence, retainedSourceId: "absent" } }] })).toThrow("EVIDENCE_INVALID:x");
    expect(() => validateSourceRights({ version: 1, entries: [{ ...pin("x"), license: "CC0-1.0", licenseEvidence: { ...evidence, retainedSourceId: undefined } }] })).toThrow("RETAINED_EVIDENCE_MISSING:x");
  });

  it("rejects missing lineage, cycles, duplicate ids, and absent published roots", () => {
    expect(() => buildSourceLicenseReport({ version: 1, entries: [pin("a", ["missing"])] }, [])).toThrow("PARENT_MISSING:missing");
    expect(() => buildSourceLicenseReport({ version: 1, entries: [pin("a", ["b"]), pin("b", ["a"])] }, [])).toThrow("LINEAGE_CYCLE");
    expect(() => buildSourceLicenseReport({ version: 1, entries: [pin("a"), pin("a")] }, [])).toThrow("DUPLICATE_ID");
    expect(() => buildSourceLicenseReport({ version: 1, entries: [pin("a")] }, [{ label: "house", id: "missing" }])).toThrow("ROOT_MISSING:missing");
  });

  it("keeps refresh configuration ancestry separate from published chamber ancestry", () => {
    const lock: SourceLock = { version: 1, entries: [pin("house"), pin("refresh", ["medsl"]), { ...pin("medsl"), url: "https://github.com/MEDSL/2024-elections-official/results.csv" }] };
    const report = buildSourceLicenseReport(lock, [{ label: "house", id: "house" }, { label: "refreshInputs", id: "refresh", role: "refresh_configuration" }]);
    expect(report.summary).toMatchObject({ publishedOutputs: 1, publishedOutputsWithUnknownMedslTerms: 0, supportingInputsWithUnknownMedslTerms: 1 });
    expect(report.supportingInputs[0].unknownMedslLicenseIds).toEqual(["medsl"]);
  });

  it("reproduces the committed active-release rights report from current pins", () => {
    expect(readFileSync("docs/reviews/source-license-dependency-report-v1.json", "utf8")).toBe(serializeSourceLicenseReport(buildCurrentSourceLicenseReport()));
  });
});
