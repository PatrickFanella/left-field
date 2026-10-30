import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateSourceRights } from "../../scripts/lib/source-license.mjs";
import { readPriorityIndexRelease, PRIORITY_INDEX_RELEASE } from "../lib/priority-index-release";
import { readSourceLock, SOURCE_LOCK_PATH, type SourceLock, type SourceLockEntry } from "./intake/source-lock";
import { byteCompare, sha } from "./shared";

export interface PublishedLicenseRoot {
  readonly label: string;
  readonly id: string;
  readonly role?: "published_chamber" | "refresh_configuration";
}

/** All ancestry is reported, even after a derived artifact has its own license. */
export function buildSourceLicenseReport(lock: SourceLock, publishedRoots: readonly PublishedLicenseRoot[]) {
  validateSourceRights(lock);
  const byId = new Map(lock.entries.map((entry) => [entry.id, entry]));
  const ordered = (ids: Iterable<string>) => [...ids].sort(byteCompare);
  const closure = (root: string): string[] => {
    const result = new Set<string>();
    const visit = (id: string) => {
      if (result.has(id)) return;
      const entry = byId.get(id);
      if (!entry) throw new Error(`SOURCE_LICENSE_REPORT_ROOT_MISSING:${id}`);
      result.add(id);
      for (const parent of entry.parentIds) visit(parent);
    };
    visit(root);
    return ordered(result);
  };
  const isMedsl = (entry: SourceLockEntry) => /^https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/MEDSL\//i.test(entry.url);
  const dependencies = (id: string) => {
    const ids = closure(id), unknownLicenseIds = ids.filter((key) => byId.get(key)!.license === "unknown");
    return {
      id,
      dependencyIds: ids,
      unknownLicenseIds,
      unknownUpstreamLicenseIds: unknownLicenseIds.filter((key) => key !== id),
      unknownMedslLicenseIds: unknownLicenseIds.filter((key) => isMedsl(byId.get(key)!)),
      rightsReviewStatus: unknownLicenseIds.length ? "unknown_terms_in_dependency_chain" as const : "terms_recorded_requires_scope_review" as const,
    };
  };
  const roots = [...publishedRoots].sort((a, b) => byteCompare(a.label, b.label));
  const publishedOutputs = roots.filter((root) => root.role !== "refresh_configuration").map((root) => ({ label: root.label, ...dependencies(root.id) }));
  const supportingInputs = roots.filter((root) => root.role === "refresh_configuration").map((root) => ({ label: root.label, ...dependencies(root.id) }));
  const derivedOutputs = lock.entries.filter((entry) => entry.kind === "derived_artifact").sort((a, b) => byteCompare(a.id, b.id)).map((entry) => dependencies(entry.id));
  const unknownEntries = lock.entries.filter((entry) => entry.license === "unknown").sort((a, b) => byteCompare(a.id, b.id)).map((entry) => ({ id: entry.id, url: entry.url, sha256: entry.sha256, byteSize: entry.byteSize, kind: entry.kind, medsl: isMedsl(entry), ...(entry.licenseEvidence ? { evidence: entry.licenseEvidence } : {}) }));
  return {
    schema: "source-license-dependency-report-v1" as const,
    version: 1 as const,
    interpretation: "Recorded terms are evidence for review, not legal approval. Unknown terms remain unknown; derived licenses do not remove upstream terms. Published roots come from the byte-verified active release descriptor, not its empty parentIds.",
    summary: {
      entries: lock.entries.length,
      unknownLicenses: unknownEntries.length,
      unknownMedslLicenses: unknownEntries.filter((entry) => entry.medsl).length,
      publishedOutputs: publishedOutputs.length,
      publishedOutputsWithUnknownTerms: publishedOutputs.filter((entry) => entry.unknownLicenseIds.length).length,
      publishedOutputsWithUnknownMedslTerms: publishedOutputs.filter((entry) => entry.unknownMedslLicenseIds.length).length,
      supportingInputsWithUnknownMedslTerms: supportingInputs.filter((entry) => entry.unknownMedslLicenseIds.length).length,
      derivedOutputs: derivedOutputs.length,
      derivedOutputsWithUnknownTerms: derivedOutputs.filter((entry) => entry.unknownLicenseIds.length).length,
    },
    publishedOutputs,
    supportingInputs,
    derivedOutputs,
    unknownEntries,
  };
}

export function buildCurrentSourceLicenseReport(root = process.cwd()) {
  const lockBytes = readFileSync(join(root, SOURCE_LOCK_PATH)), lock = readSourceLock(root);
  const release = readPriorityIndexRelease(root, lock);
  const roots: PublishedLicenseRoot[] = Object.entries(release.chambers).map(([label, chamber]) => ({ label, id: chamber.artifactId, role: "published_chamber" }));
  roots.push({ label: "refreshInputs", id: release.refreshInputsId, role: "refresh_configuration" });
  return {
    ...buildSourceLicenseReport(lock, roots),
    sourceLockSha256: sha(lockBytes),
    activeRelease: { id: PRIORITY_INDEX_RELEASE.id, modelVersion: release.modelVersion, sha256: lock.entries.find((entry) => entry.id === PRIORITY_INDEX_RELEASE.id)!.sha256 },
  };
}

/** One dependency/assessment per line keeps regenerated review diffs readable. */
export function serializeSourceLicenseReport(report: ReturnType<typeof buildSourceLicenseReport>): string {
  const fields = Object.entries(report).map(([key, value]) => {
    const serialized = Array.isArray(value)
      ? `[\n${value.map((row) => `    ${JSON.stringify(row)}`).join(",\n")}\n  ]`
      : JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
    return `  ${JSON.stringify(key)}: ${serialized}`;
  });
  return `{\n${fields.join(",\n")}\n}\n`;
}
