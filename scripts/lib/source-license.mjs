/** Validate rights separately from content pins. Unknown is an assessment gap. */
export function validateSourceRights(lock) {
  const byId = new Map(lock.entries.map((entry) => [entry.id, entry]));
  if (byId.size !== lock.entries.length) throw new Error("SOURCE_RIGHTS_DUPLICATE_ID");
  for (const entry of lock.entries) {
    const license = entry.license;
    if (typeof license !== "string" || !/^(?:[A-Za-z0-9][A-Za-z0-9.+-]*|https:\/\/\S+)$/.test(license)) {
      throw new Error(`SOURCE_RIGHTS_LICENSE_INVALID:${entry.id}`);
    }
    const evidence = entry.licenseEvidence;
    if (license !== "unknown" && !evidence) throw new Error(`SOURCE_RIGHTS_EVIDENCE_MISSING:${entry.id}`);
    if (evidence !== undefined) {
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) ||
          Object.keys(evidence).some((key) => !["url", "scope", "reviewedAt", "notes", "retainedSourceId"].includes(key)) ||
          typeof evidence.url !== "string" || !/^https:\/\/\S+$/.test(evidence.url) ||
          !["dataset", "software", "derived_artifact"].includes(evidence.scope) ||
          typeof evidence.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.reviewedAt) ||
          !Number.isFinite(Date.parse(`${evidence.reviewedAt}T00:00:00Z`)) ||
          new Date(`${evidence.reviewedAt}T00:00:00Z`).toISOString().slice(0, 10) !== evidence.reviewedAt ||
          typeof evidence.notes !== "string" || !evidence.notes.trim() ||
          (evidence.retainedSourceId !== undefined && !byId.has(evidence.retainedSourceId))) {
        throw new Error(`SOURCE_RIGHTS_EVIDENCE_INVALID:${entry.id}`);
      }
      // A software repository's license cannot authorize its separate data inputs.
      if (license !== "unknown" && evidence.scope === "software" && entry.kind !== "software_source") {
        throw new Error(`SOURCE_RIGHTS_SCOPE_MISMATCH:${entry.id}`);
      }
      if (license !== "unknown") {
        const retainedEvidence = byId.get(evidence.retainedSourceId);
        if (!retainedEvidence || retainedEvidence.retainedStatus !== "retained" || !retainedEvidence.retainedPath) {
          throw new Error(`SOURCE_RIGHTS_RETAINED_EVIDENCE_MISSING:${entry.id}`);
        }
      }
    }
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`SOURCE_RIGHTS_LINEAGE_CYCLE:${id}`);
    if (visited.has(id)) return;
    const entry = byId.get(id);
    if (!entry) throw new Error(`SOURCE_RIGHTS_PARENT_MISSING:${id}`);
    visiting.add(id);
    for (const parentId of entry.parentIds) visit(parentId);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
}
