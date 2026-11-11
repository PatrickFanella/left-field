import { createHash } from "node:crypto";

import type { PrototypeManifest, SnapshotId } from "@/domain/contracts";
import { prototypeManifestSchema } from "@/domain/contracts";
import { nationwideManifestSchema, releaseManifestSchema, type NationwideManifest, type ReleaseManifest } from "@/domain/manifest";

export interface ManifestIssue {
  readonly path: string;
  readonly message: string;
}
/** Pure status-to-coverage contract; persistence later binds status to decision bytes. */
export function electionDecisionCoverageIsCoherent(
  status: "unassessed" | "approved" | "unavailable",
  record: { status: string; expectedCount: number; observedCount: number; missingByReason: readonly { reason: string; count: number }[]; quarantinedCount: number; incompatibleCount: number },
): boolean {
  const noExcludedRecords = record.quarantinedCount === 0 && record.incompatibleCount === 0;
  const onlyReason = (reason: string) => record.missingByReason.length === 1 && record.missingByReason[0]!.reason === reason && record.missingByReason[0]!.count === 1;
  if (status === "unassessed") return record.status === "not_collected" && record.expectedCount === 1 && record.observedCount === 0 && noExcludedRecords && onlyReason("not_collected");
  if (status === "unavailable") return record.status === "unavailable" && record.expectedCount === 1 && record.observedCount === 0 && noExcludedRecords && onlyReason("not_defensibly_modeled");
  return record.status === "complete" && record.expectedCount === 1 && record.observedCount === 1 && noExcludedRecords && record.missingByReason.length === 0;
}
/** Relational core shared by v1 profiles and v2 nationwide releases. */
type BaseManifest = Omit<PrototypeManifest, "schemaVersion" | "profileSeatCycleIds">;

function canonicalize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const children = value.map((child) => canonicalize(child));
    return key === "profileSeatCycleIds" || key === "catalogSeatCycleIds"
      ? children
      : children.sort((left, right) => {
        const a = JSON.stringify(left); const b = JSON.stringify(right);
        return a < b ? -1 : a > b ? 1 : 0;
      });
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([childKey, child]) => [childKey, canonicalize(child, childKey)]),
    );
  }
  // Date-only values deliberately retain their calendar representation.  Every
  // accepted ISO instant, however, is canonicalized to PostgreSQL's UTC form.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  return value;
}

export function computeCanonicalDataChecksum(
  manifest: Omit<ReleaseManifest, "canonicalDataChecksumSha256"> | ReleaseManifest,
): string {
  return (manifest as ReleaseManifest).schemaVersion === 1
    ? computeV1CanonicalDataChecksum(manifest as ReleaseManifest)
    : computeV2CanonicalDataChecksum(manifest as ReleaseManifest);
}

/** Kept byte-for-byte compatible with the original v1 checksum contract. */
function computeV1CanonicalDataChecksum(manifest: ReleaseManifest): string {
  return computeChecksumContent(manifest);
}

function computeV2CanonicalDataChecksum(manifest: ReleaseManifest): string {
  // Unlike v1, v2 names its projection so future schemas cannot silently share
  // checksum bytes. `catalogSeatCycleIds` remains ordered in canonicalize.
  return computeChecksumContent(manifest, 2);
}

function computeChecksumContent(manifest: ReleaseManifest, projectionVersion?: 2): string {
  const { canonicalDataChecksumSha256: _ignored, release, ...rest } = manifest as ReleaseManifest;
  void _ignored;
  const { status: _status, publishedAt: _publishedAt, previousReleaseId: _previousReleaseId, ...releaseContent } = release;
  void _status; void _publishedAt; void _previousReleaseId;
  const content = projectionVersion === undefined ? { ...rest, release: releaseContent } : { projectionVersion, ...rest, release: releaseContent };
  return createHash("sha256").update(JSON.stringify(canonicalize(content))).digest("hex");
}

/** Current nationwide release policy. Future Congresses supply a new policy, not weaker checks. */
export const CURRENT_RELEASE_UNIVERSE_POLICY = { votingHouse: 435, delegates: 5, residentCommissioners: 1, senateOfficeTerms: 100, totalOfficeTerms: 541 } as const;
/** 2020 census apportionment and the two constitutional Senate classes held by each state. */
export const NATIONWIDE_SEAT_POLICY = {
  AL: [7, [2, 3]], AK: [1, [2, 3]], AZ: [9, [1, 3]], AR: [4, [2, 3]], CA: [52, [1, 3]], CO: [8, [2, 3]], CT: [5, [1, 3]], DE: [1, [1, 2]], FL: [28, [1, 3]], GA: [14, [2, 3]], HI: [2, [1, 3]], IA: [4, [2, 3]], ID: [2, [2, 3]], IL: [17, [2, 3]], IN: [9, [1, 3]], KS: [4, [2, 3]], KY: [6, [2, 3]], LA: [6, [2, 3]], MA: [9, [1, 2]], MD: [8, [1, 3]], ME: [2, [1, 2]], MI: [13, [1, 2]], MN: [8, [1, 2]], MO: [8, [1, 3]], MS: [4, [1, 2]], MT: [2, [1, 2]], NC: [14, [2, 3]], ND: [1, [1, 3]], NE: [3, [1, 2]], NH: [2, [2, 3]], NJ: [12, [1, 2]], NM: [3, [1, 2]], NV: [4, [1, 3]], NY: [26, [1, 3]], OH: [15, [1, 3]], OK: [5, [2, 3]], OR: [6, [2, 3]], PA: [17, [1, 3]], RI: [2, [1, 2]], SC: [7, [2, 3]], SD: [1, [2, 3]], TN: [9, [1, 2]], TX: [38, [1, 2]], UT: [4, [1, 3]], VA: [11, [1, 2]], VT: [1, [1, 3]], WA: [10, [1, 3]], WI: [8, [1, 3]], WV: [2, [1, 2]], WY: [1, [1, 2]],
} as const satisfies Record<string, readonly [number, readonly [number, number]]>;
const VOTING_STATES = new Set(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"]);
const DELEGATE_JURISDICTIONS = new Set(["DC", "AS", "GU", "MP", "VI"]);
const REQUIRED_COVERAGE_DOMAINS = ["identity", "geography", "member", "acs", "finance", "election_2020", "election_2022", "election_2024", "maps"] as const;

function validateNationwideManifest(input: unknown):
  | { readonly success: true; readonly data: NationwideManifest }
  | { readonly success: false; readonly issues: readonly ManifestIssue[] } {
  const parsed = nationwideManifestSchema.safeParse(input);
  if (!parsed.success) return { success: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  const manifest = parsed.data;
  const issues: ManifestIssue[] = [];
  // v2 deliberately shares the v1 relational/provenance validator, but not its
  // profile-product policy (the 10--12 profile rules).
  issues.push(...validateManifestIntegrity(manifest, false));
  if (computeCanonicalDataChecksum(manifest) !== manifest.canonicalDataChecksumSha256) issues.push({ path: "canonicalDataChecksumSha256", message: "Canonical data checksum does not match manifest content" });
  const catalog = new Set(manifest.catalogSeatCycleIds);
  if (catalog.size !== manifest.catalogSeatCycleIds.length) issues.push({ path: "catalogSeatCycleIds", message: "Catalog seat-cycle IDs must be unique" });
  const cycleById = new Map(manifest.seatCycles.map((cycle) => [cycle.id, cycle]));
  if ([...catalog].some((id) => !cycleById.has(id))) issues.push({ path: "catalogSeatCycleIds", message: "Catalog seat cycles must resolve" });
  const officeById = new Map(manifest.offices.map((office) => [office.id, office]));
  const termById = new Map(manifest.officeTerms.map((term) => [term.id, term]));
  const cutoff = new Date(manifest.release.sourceCutoff).toISOString().slice(0, 10);
  const active = manifest.catalogSeatCycleIds.map((id) => cycleById.get(id)).filter((cycle): cycle is NationwideManifest["seatCycles"][number] => cycle !== undefined && (() => { const term = termById.get(cycle.officeTermId); return term !== undefined && term.startsAt <= cutoff && cutoff < term.endsAt; })());
  if (active.length !== manifest.catalogSeatCycleIds.length) issues.push({ path: "catalogSeatCycleIds", message: "Every catalog term must cover the release source cutoff" });
  const cutoffTerms = manifest.officeTerms.filter((term) => term.startsAt <= cutoff && cutoff < term.endsAt);
  if (new Set(cutoffTerms.map((term) => term.id)).size !== catalog.size || cutoffTerms.some((term) => !new Set(active.map((cycle) => cycle.officeTermId)).has(term.id))) issues.push({ path: "catalogSeatCycleIds", message: "Catalog must contain exactly all cutoff-active office terms" });
  if (new Set(active.map((cycle) => cycle.officeId)).size !== 541 || new Set(active.map((cycle) => cycle.officeTermId)).size !== 541) issues.push({ path: "catalogSeatCycleIds", message: "Catalog must resolve to 541 distinct offices and office terms" });
  const activeOffices = active.map((cycle) => officeById.get(cycle.officeId));
  const votingHouseCount = activeOffices.filter((office) => office?.kind === "house_voting").length;
  const delegateCount = activeOffices.filter((office) => office?.kind === "house_delegate").length;
  const commissionerCount = activeOffices.filter((office) => office?.kind === "resident_commissioner").length;
  const senateCount = activeOffices.filter((office) => office?.chamber === "senate").length;
  if (active.length !== CURRENT_RELEASE_UNIVERSE_POLICY.totalOfficeTerms || votingHouseCount !== 435 || delegateCount !== 5 || commissionerCount !== 1 || senateCount !== CURRENT_RELEASE_UNIVERSE_POLICY.senateOfficeTerms) issues.push({ path: "catalogSeatCycleIds", message: "Catalog must contain the configured nationwide office-term universe" });
  const expectedOfficeKeys = new Set<string>();
  for (const [state, [districts, senateClasses]] of Object.entries(NATIONWIDE_SEAT_POLICY)) {
    for (let district = 1; district <= districts; district += 1) expectedOfficeKeys.add(`house:${state}:${districts === 1 ? "AL" : String(district).padStart(2, "0")}:`);
    senateClasses.forEach((senateClass) => expectedOfficeKeys.add(`senate:${state}::${senateClass}`));
  }
  ["DC", "AS", "GU", "MP", "VI"].forEach((state) => expectedOfficeKeys.add(`house:${state}:AL:`));
  expectedOfficeKeys.add("house:PR:AL:");
  const actualOfficeKeys = new Set(activeOffices.filter(Boolean).map((office) => `${office!.chamber}:${office!.stateCode}:${office!.districtCode ?? ""}:${office!.senateClass ?? ""}`));
  if (actualOfficeKeys.size !== expectedOfficeKeys.size || [...actualOfficeKeys].some((key) => !expectedOfficeKeys.has(key))) issues.push({ path: "offices", message: "Catalog office natural keys must exactly match the nationwide seat policy" });
  const jurisdictions = new Map(manifest.jurisdictions.map((jurisdiction) => [jurisdiction.jurisdictionCode, jurisdiction]));
  if (jurisdictions.size !== manifest.jurisdictions.length) issues.push({ path: "jurisdictions", message: "Jurisdiction codes must be unique" });
  const coverageDomains = new Set(manifest.coverageRecords.map((record) => record.domain));
  if (REQUIRED_COVERAGE_DOMAINS.some((domain) => !coverageDomains.has(domain))) issues.push({ path: "coverageRecords", message: "Coverage records must include every required domain" });
  const snapshotIds = new Set(manifest.snapshots.map((snapshot) => snapshot.id));
  const approvedSnapshotIds = new Set(manifest.snapshots.filter((snapshot) => snapshot.usageStatus === "approved").map((snapshot) => snapshot.id));
  const requireApprovedSnapshots = (name: string, rows: readonly { inputSnapshotIds?: readonly SnapshotId[]; provenance?: readonly { snapshotId: SnapshotId }[]; lineage?: { inputs: readonly { snapshotId: SnapshotId }[] } }[]) => rows.forEach((row, index) => {
    const references = [...(row.inputSnapshotIds ?? []), ...(row.provenance ?? []).map((reference) => reference.snapshotId), ...(row.lineage?.inputs ?? []).map((reference) => reference.snapshotId)];
    if (references.some((id) => !approvedSnapshotIds.has(id))) issues.push({ path: `${name}.${index}`, message: "Public v2 records require approved snapshots" });
  });
  const personIds = new Set(manifest.people.map((person) => person.id));
  const committeeIds = new Set(manifest.committees.map((committee) => committee.id));
  const geographyIds = new Set(manifest.geographyVersions.map((geography) => geography.id));
  const artifactIds = new Set(manifest.geometryArtifacts.map((artifact) => artifact.id));
  const cycleIds = new Set(manifest.seatCycles.map((cycle) => cycle.id));
  const duplicateValues = (values: readonly string[], path: string) => { if (new Set(values).size !== values.length) issues.push({ path, message: "Duplicate reference" }); };
  const scopeKey = (scope: NationwideManifest["coverageRecords"][number]["scope"]) => JSON.stringify(scope);
  const coverageKey = new Map<string, number>();
  const cycleJurisdiction = (seatCycleId: NationwideManifest["seatCycles"][number]["id"]) => { const cycle = cycleById.get(seatCycleId); return cycle && officeById.get(cycle.officeId)?.stateCode; };
  const geographyJurisdiction = (geographyVersionId: NationwideManifest["geographyVersions"][number]["id"]) => manifest.geographyVersions.find((geography) => geography.id === geographyVersionId)?.stateCode;
  const memberJurisdictions = (personId: NationwideManifest["people"][number]["id"]) => new Set(manifest.memberships.filter((membership) => membership.personId === personId).map((membership) => manifest.officeTerms.find((term) => term.id === membership.officeTermId)).flatMap((term) => term ? [officeById.get(term.officeId)?.stateCode] : []));
  const financeCount = (seatCycleId?: string, fundingKind?: "summary" | "category" | "organization" | "outside_spending") => {
    const count = <T extends { seatCycleId: string }>(rows: readonly T[]) => rows.filter((row) => seatCycleId === undefined || row.seatCycleId === seatCycleId).length;
    if (fundingKind === "summary") return count(manifest.financeAggregates);
    if (fundingKind === "category") return count(manifest.fundingCategoryAggregates);
    if (fundingKind === "organization") return count(manifest.fundingOrganizationAggregates);
    if (fundingKind === "outside_spending") return count(manifest.outsideSpendingAggregates);
    return count(manifest.financeAggregates) + count(manifest.fundingCategoryAggregates) + count(manifest.fundingOrganizationAggregates) + count(manifest.outsideSpendingAggregates);
  };
  const coverageObserved = (record: NationwideManifest["coverageRecords"][number]): number | undefined => {
    const scope = record.scope;
    if (record.domain === "identity") return scope.kind === "release" ? manifest.catalogSeatCycleIds.length : scope.kind === "jurisdiction" ? manifest.catalogSeatCycleIds.filter((id) => cycleJurisdiction(id) === scope.jurisdictionCode).length : undefined;
    if (record.domain === "geography") return scope.kind === "release" ? new Set(active.map((cycle) => cycle.geographyVersionId)).size : scope.kind === "jurisdiction" ? new Set(active.filter((cycle) => cycleJurisdiction(cycle.id) === scope.jurisdictionCode).map((cycle) => cycle.geographyVersionId)).size : undefined;
    if (record.domain === "member") {
      const currentPeople = new Set(manifest.memberships.filter((membership) => membership.startsAt <= cutoff && (membership.endsAt === null || cutoff < membership.endsAt)).map((membership) => membership.personId));
      const matchedPeople = new Set(manifest.biographicalFacts.filter((row) => row.fact === "bioguide_id" && row.value.kind === "value" && currentPeople.has(row.personId) && manifest.people.find((person) => person.id === row.personId)?.bioguideId === row.value.value).map((row) => row.personId));
      return scope.kind === "release" ? matchedPeople.size : scope.kind === "jurisdiction" ? [...matchedPeople].filter((personId) => memberJurisdictions(personId).has(scope.jurisdictionCode)).length : undefined;
    }
    if (record.domain === "maps") return scope.kind === "release" ? manifest.mapArtifacts.length : scope.kind === "jurisdiction" ? manifest.mapArtifacts.filter((row) => geographyJurisdiction(row.geographyVersionId) === scope.jurisdictionCode).length : undefined;
    if (record.domain === "acs") return scope.kind === "release" ? manifest.acsObservations.length : scope.kind === "jurisdiction" ? manifest.acsObservations.filter((row) => geographyJurisdiction(row.geographyVersionId) === scope.jurisdictionCode).length : scope.kind === "acs_indicator" ? manifest.acsObservations.filter((row) => row.variable === scope.variable && row.surveyPeriod === scope.surveyPeriod).length : undefined;
    if (record.domain === "finance") return scope.kind === "release" ? financeCount() : scope.kind === "seat_cycle" ? financeCount(scope.seatCycleId) : scope.kind === "funding" ? financeCount(scope.seatCycleId, scope.fundingKind) : undefined;
    const electionYear = Number(record.domain.slice("election_".length));
    return scope.kind === "release" ? manifest.electionDecisions.filter((row) => row.electionYear === electionYear && row.status === "approved").length : scope.kind === "jurisdiction" ? manifest.electionDecisions.filter((row) => row.electionYear === electionYear && row.jurisdictionCode === scope.jurisdictionCode && row.status === "approved").length : scope.kind === "election" && scope.electionYear === electionYear ? manifest.electionDecisions.filter((row) => row.jurisdictionCode === scope.jurisdictionCode && row.electionYear === scope.electionYear && row.status === "approved").length : undefined;
  };
  manifest.coverageRecords.forEach((record, index) => {
    const key = `${record.domain}:${scopeKey(record.scope)}`; if (coverageKey.has(key)) { issues.push({ path: `coverageRecords.${index}`, message: "Duplicate coverage scope natural key" }); issues.push({ path: "coverageRecords", message: "Coverage records must close exactly over the Phase 1 domains" }); } coverageKey.set(key, (coverageKey.get(key) ?? 0) + 1);
    const missing = record.missingByReason.reduce((total, item) => total + item.count, 0);
    const observed = coverageObserved(record);
    const scoped = record.scope;
    let validScope: boolean;
    switch (scoped.kind) {
      case "release": validScope = true; break;
      case "jurisdiction": validScope = manifest.jurisdictions.some((j) => j.jurisdictionCode === scoped.jurisdictionCode); break;
      case "seat_cycle": validScope = cycleIds.has(scoped.seatCycleId); break;
      case "acs_indicator": validScope = manifest.acsVariables.some((v) => v.variable === scoped.variable && v.surveyPeriod === scoped.surveyPeriod); break;
      case "election": validScope = manifest.jurisdictions.some((j) => j.jurisdictionCode === scoped.jurisdictionCode); break;
      case "funding": validScope = cycleIds.has(scoped.seatCycleId); break;
    }
    const explicitAbsence = record.missingByReason.length > 0;
    const restrictedAbsence = (record.status === "not_collected" || record.status === "unavailable") && record.observedCount === 0 && record.missingByReason.some((item) => item.reason === "license_unavailable");
    if (!validScope || observed === undefined || record.releaseId !== manifest.release.id || record.inputSnapshotIds.some((id) => !snapshotIds.has(id)) || (!restrictedAbsence && record.inputSnapshotIds.some((id) => !approvedSnapshotIds.has(id))) || new Set(record.inputSnapshotIds).size !== record.inputSnapshotIds.length || new Set(record.missingByReason.map((item) => item.reason)).size !== record.missingByReason.length || record.observedCount !== observed || record.observedCount + missing + record.quarantinedCount + record.incompatibleCount !== record.expectedCount || (record.status === "complete" && (record.observedCount !== record.expectedCount || record.quarantinedCount !== 0 || record.incompatibleCount !== 0)) || (record.status === "partial" && (record.observedCount === 0 || (record.observedCount === record.expectedCount && record.quarantinedCount === 0 && record.incompatibleCount === 0))) || ((record.status === "not_collected" || record.status === "unavailable") && (record.observedCount !== 0 || !explicitAbsence))) { issues.push({ path: `coverageRecords.${index}`, message: "Invalid scoped coverage record" }); issues.push({ path: `coverageRecords.${index}`, message: "Invalid coverage record" }); }
  });
  const hasCoverage = (domain: string, scope: object) => coverageKey.get(`${domain}:${JSON.stringify(scope)}`) === 1;
  manifest.acsVariables.forEach((definition) => {
    if (!hasCoverage("acs", { kind: "acs_indicator", variable: definition.variable, surveyPeriod: definition.surveyPeriod })) issues.push({ path: "coverageRecords", message: "Every ACS definition requires one indicator coverage record" });
  });
  for (const seatCycleId of manifest.catalogSeatCycleIds) for (const fundingKind of ["summary", "category", "organization", "outside_spending"] as const) {
    if (!hasCoverage("finance", { kind: "funding", seatCycleId, fundingKind })) issues.push({ path: "coverageRecords", message: "Every catalog seat cycle requires funding coverage" });
  }
  manifest.electionDecisions.forEach((decision) => {
    if (!hasCoverage(`election_${decision.electionYear}`, { kind: "election", jurisdictionCode: decision.jurisdictionCode, electionYear: decision.electionYear })) issues.push({ path: "coverageRecords", message: "Every election decision requires election coverage" });
  });
  manifest.coverageRecords.forEach((record) => {
    const scope = record.scope;
    if (scope.kind !== "election") return;
    const decisions = manifest.electionDecisions.filter((decision) => decision.jurisdictionCode === scope.jurisdictionCode && decision.electionYear === scope.electionYear);
    if (record.domain !== `election_${scope.electionYear}` || decisions.length !== 1 || !electionDecisionCoverageIsCoherent(decisions[0]?.status ?? "unassessed", record)) issues.push({ path: "coverageRecords", message: "Every election coverage requires one matching election decision" });
  });
  for (const domain of ["identity", "geography"] as const) {
    const releaseCoverage = manifest.coverageRecords.filter((record) => record.domain === domain && record.scope.kind === "release");
    if (releaseCoverage.length !== 1 || releaseCoverage[0]?.status !== "complete") issues.push({ path: "coverageRecords", message: "Release identity and geography coverage must be complete" });
  }
  const natural = <T>(name: string, rows: readonly T[], key: (row: T) => string) => { const seen = new Set<string>(); rows.forEach((row, index) => { const value = key(row); if (seen.has(value)) issues.push({ path: `${name}.${index}`, message: `Duplicate ${name} natural key` }); seen.add(value); }); };
  issues.push(...duplicateIssues(manifest.acsVariables, "acsVariables", (row) => row.id), ...duplicateIssues(manifest.financeAggregates, "financeAggregates", (row) => row.id), ...duplicateIssues(manifest.fundingOrganizationAggregates, "fundingOrganizationAggregates", (row) => row.id), ...duplicateIssues(manifest.electionDecisions, "electionDecisions", (row) => row.id), ...duplicateIssues(manifest.mapArtifacts, "mapArtifacts", (row) => row.id));
  natural("biographicalFacts", manifest.biographicalFacts, (row) => `${row.personId}:${row.fact}:${row.effectiveAt}`);
  natural("committeeAssignments", manifest.committeeAssignments, (row) => `${row.personId}:${row.committeeId}:${row.role}:${row.effectiveFrom}`);
  natural("acsVariables", manifest.acsVariables, (row) => `${row.variable}:${row.surveyPeriod}`);
  natural("financeAggregates", manifest.financeAggregates, (row) => `${row.seatCycleId}:${row.asOf}:${row.coverageThrough}:${row.methodologyVersion}`);
  natural("fundingCategoryAggregates", manifest.fundingCategoryAggregates, (row) => `${row.seatCycleId}:${row.category}:${row.coverageThrough}:${row.methodologyVersion}`);
  natural("fundingOrganizationAggregates", manifest.fundingOrganizationAggregates, (row) => `${row.seatCycleId}:${row.organizationExternalId ?? row.organizationName}:${row.coverageThrough}:${row.methodologyVersion}`);
  natural("outsideSpendingAggregates", manifest.outsideSpendingAggregates, (row) => `${row.seatCycleId}:${row.coverageThrough}:${row.methodologyVersion}`);
  natural("electionDecisions", manifest.electionDecisions, (row) => `${row.jurisdictionCode}:${row.electionYear}`);
  natural("mapArtifacts", manifest.mapArtifacts, (row) => `${row.geographyVersionId}:${row.artifactId}`);
  natural("snapshotDerivations", manifest.snapshotDerivations, (row) => row.outputSnapshotId);
  const checkNewRows = (name: string, rows: readonly { releaseId: string; inputSnapshotIds?: readonly string[] }[]) => rows.forEach((row, index) => {
    if (row.releaseId !== manifest.release.id || row.inputSnapshotIds?.some((id) => !snapshotIds.has(id as SnapshotId))) issues.push({ path: `${name}.${index}`, message: "New record has invalid release ownership or input snapshot" });
    if (row.inputSnapshotIds) duplicateValues(row.inputSnapshotIds, `${name}.${index}.inputSnapshotIds`);
  });
  checkNewRows("coverageRecords", manifest.coverageRecords); checkNewRows("acsVariables", manifest.acsVariables); checkNewRows("fundingCategoryAggregates", manifest.fundingCategoryAggregates); checkNewRows("fundingOrganizationAggregates", manifest.fundingOrganizationAggregates); checkNewRows("outsideSpendingAggregates", manifest.outsideSpendingAggregates); checkNewRows("electionDecisions", manifest.electionDecisions); checkNewRows("mapArtifacts", manifest.mapArtifacts); checkNewRows("snapshotDerivations", manifest.snapshotDerivations);
  requireApprovedSnapshots("districtPlans", manifest.districtPlans); requireApprovedSnapshots("geographyVersions", manifest.geographyVersions); requireApprovedSnapshots("offices", manifest.offices); requireApprovedSnapshots("people", manifest.people); requireApprovedSnapshots("officeTerms", manifest.officeTerms); requireApprovedSnapshots("memberships", manifest.memberships); requireApprovedSnapshots("seatCycles", manifest.seatCycles); requireApprovedSnapshots("contests", manifest.contests); requireApprovedSnapshots("candidacies", manifest.candidacies); requireApprovedSnapshots("resultOptions", manifest.resultOptions); requireApprovedSnapshots("committees", manifest.committees); requireApprovedSnapshots("committeeRelationships", manifest.committeeRelationships); requireApprovedSnapshots("electionResults", manifest.electionResults); requireApprovedSnapshots("fecFilingSummaries", manifest.fecFilingSummaries); requireApprovedSnapshots("biographicalFacts", manifest.biographicalFacts); requireApprovedSnapshots("committeeAssignments", manifest.committeeAssignments); requireApprovedSnapshots("acsVariables", manifest.acsVariables); requireApprovedSnapshots("acsObservations", manifest.acsObservations); requireApprovedSnapshots("fundingCategoryAggregates", manifest.fundingCategoryAggregates); requireApprovedSnapshots("fundingOrganizationAggregates", manifest.fundingOrganizationAggregates); requireApprovedSnapshots("outsideSpendingAggregates", manifest.outsideSpendingAggregates); requireApprovedSnapshots("electionDecisions", manifest.electionDecisions); requireApprovedSnapshots("mapArtifacts", manifest.mapArtifacts);
  manifest.financeSummaries.forEach((summary, index) => { if (summary.kind === "missing" && summary.inputs.some((input) => !approvedSnapshotIds.has(input.snapshotId))) issues.push({ path: `financeSummaries.${index}`, message: "Public v2 records require approved snapshots" }); });
  manifest.geometryArtifacts.forEach((artifact, index) => { if (!approvedSnapshotIds.has(artifact.snapshotId)) issues.push({ path: `geometryArtifacts.${index}`, message: "Public v2 records require approved snapshots" }); });
  const isCalendarDate = (value: string) => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.valueOf()) && date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]); };
  manifest.biographicalFacts.forEach((row, index) => { const person = manifest.people.find((candidate) => candidate.id === row.personId); const invalidValue = row.value.kind === "value" && ((row.fact === "bioguide_id" && (!/^[A-Z][0-9]{6}$/.test(row.value.value) || person?.bioguideId !== row.value.value)) || (row.fact === "birth_date" && (!isCalendarDate(row.value.value) || row.value.value > cutoff))); if (row.releaseId !== manifest.release.id || !personIds.has(row.personId) || row.effectiveAt > cutoff || row.provenance.some((p) => !snapshotIds.has(p.snapshotId)) || invalidValue) issues.push({ path: `biographicalFacts.${index}`, message: "Invalid biographical fact reference or cutoff" }); duplicateValues(row.provenance.map((reference) => `${reference.snapshotId}:${reference.role}`), `biographicalFacts.${index}.provenance`); });
  manifest.committeeAssignments.forEach((row, index) => { if (row.releaseId !== manifest.release.id || !personIds.has(row.personId) || !committeeIds.has(row.committeeId) || (row.effectiveTo !== null && row.effectiveFrom >= row.effectiveTo) || row.provenance.some((p) => !snapshotIds.has(p.snapshotId))) issues.push({ path: `committeeAssignments.${index}`, message: "Invalid committee assignment" }); duplicateValues(row.provenance.map((reference) => `${reference.snapshotId}:${reference.role}`), `committeeAssignments.${index}.provenance`); });
  manifest.financeAggregates.forEach((row, index) => { const attributable = new Set(manifest.committeeRelationships.filter((relationship) => { const candidacy = manifest.candidacies.find((c) => c.id === relationship.candidacyId); const contest = candidacy && manifest.contests.find((c) => c.id === candidacy.contestId); return contest?.seatCycleId === row.seatCycleId && relationship.effectiveFrom <= row.coverageThrough && (relationship.effectiveTo === null || row.reportingPeriodStart < relationship.effectiveTo); }).map((r) => r.committeeId)); const inputs = new Map(row.committeeInputs.map((input) => [input.committeeId, input])); const missingInput = row.committeeInputs.some((input) => input.kind === "missing"); const numeric = [row.cashOnHand, row.receipts, row.disbursements].some((value) => value.kind === "value"); const invalidIncluded = row.committeeInputs.some((input) => { if (input.kind === "missing") return false; const filing = manifest.fecFilingSummaries.find((candidate) => candidate.id === input.filingId); return !filing || filing.committeeId !== input.committeeId || filing.seatCycleId !== row.seatCycleId || filing.reportingPeriodStart !== row.reportingPeriodStart || filing.reportingPeriodEnd !== row.coverageThrough || filing.amendmentStatus === "superseded" || manifest.fecFilingSummaries.some((candidate) => candidate.amendsFilingId === filing.id) || filing.filedAt.slice(0, 10) > row.asOf || filing.lineage.inputs.some((lineageInput) => !approvedSnapshotIds.has(lineageInput.snapshotId)); }); if (row.releaseId !== manifest.release.id || !cycleIds.has(row.seatCycleId) || row.reportingPeriodStart > row.coverageThrough || row.coverageThrough > row.asOf || row.asOf > cutoff || inputs.size !== row.committeeInputs.length || attributable.size !== inputs.size || [...attributable].some((id) => !inputs.has(id)) || invalidIncluded || (missingInput && numeric)) { issues.push({ path: `financeAggregates.${index}`, message: "Invalid finance aggregate committee closure" }); issues.push({ path: `financeAggregates.${index}`, message: "Invalid finance aggregate" }); } });
  for (const [name, rows] of [["fundingCategoryAggregates", manifest.fundingCategoryAggregates], ["fundingOrganizationAggregates", manifest.fundingOrganizationAggregates], ["outsideSpendingAggregates", manifest.outsideSpendingAggregates]] as const) rows.forEach((row, index) => { if (!cycleIds.has(row.seatCycleId) || row.coverageThrough > cutoff) issues.push({ path: `${name}.${index}`, message: "Unknown seat cycle or coverage beyond release cutoff" }); if (row.inputSnapshotIds.some((id) => !approvedSnapshotIds.has(id))) issues.push({ path: `${name}.${index}`, message: "Public funding aggregates require approved snapshots" }); });
  manifest.electionDecisions.forEach((row, index) => { if (!manifest.jurisdictions.some((jurisdiction) => jurisdiction.jurisdictionCode === row.jurisdictionCode) || ![2020, 2022, 2024].includes(row.electionYear)) issues.push({ path: `electionDecisions.${index}`, message: "Unknown jurisdiction or invalid election year" }); else if (row.status === "unassessed" ? row.inputSnapshotIds.length !== 0 : row.inputSnapshotIds.length !== 1 || !approvedSnapshotIds.has(row.inputSnapshotIds[0]!)) issues.push({ path: `electionDecisions.${index}`, message: "Invalid election decision evidence closure" }); });
  for (const year of [2020, 2024] as const) { const actual = new Set(manifest.electionDecisions.filter(row => row.electionYear === year).map(row => row.jurisdictionCode)); const required = new Set([...VOTING_STATES, "DC"]); if (actual.size !== required.size || [...required].some(code => !actual.has(code)) || [...actual].some(code => !required.has(code))) issues.push({ path: "electionDecisions", message: `Election ${year} decisions must close over exactly 50 states and DC` }); }
  { const actual = new Set(manifest.electionDecisions.filter(row => row.electionYear === 2022).map(row => row.jurisdictionCode)); const required = new Set([...VOTING_STATES, ...DELEGATE_JURISDICTIONS, "PR"]); if (actual.size !== required.size || [...required].some(code => !actual.has(code)) || [...actual].some(code => !required.has(code))) issues.push({ path: "electionDecisions", message: "Election 2022 decisions must close over all nationwide jurisdictions" }); }
  manifest.mapArtifacts.forEach((row, index) => { if (!geographyIds.has(row.geographyVersionId) || !artifactIds.has(row.artifactId)) issues.push({ path: `mapArtifacts.${index}`, message: "Invalid map artifact reference" }); });
  // Maps are an all-or-nothing release closure.  Old nationwide releases are
  // intentionally mapless, but must say so explicitly rather than silently
  // omitting the domain.
  const mapCoverage = manifest.coverageRecords.filter((record) => record.domain === "maps");
  const activeHouseGeographies = new Set(active
    .filter((cycle) => officeById.get(cycle.officeId)?.chamber === "house")
    .map((cycle) => cycle.geographyVersionId));
  if (manifest.mapArtifacts.length === 0) {
    const legacy = mapCoverage[0];
    // There are exactly two retained mapless contracts.  The original
    // nationwide compiler emitted the 497/TIGER profile; later staging uses
    // the corrected 441 profile with no artificial map input.  Do not turn
    // this into a permissive "any absent maps" escape hatch.
    const exactLegacy = legacy?.status === "not_collected" && legacy.expectedCount === 497 && legacy.observedCount === 0 && legacy.quarantinedCount === 0 && legacy.incompatibleCount === 0 && legacy.missingByReason.length === 1 && legacy.missingByReason[0]?.reason === "not_collected" && legacy.missingByReason[0]?.count === 497 && legacy.inputSnapshotIds.length === 1 && approvedSnapshotIds.has(legacy.inputSnapshotIds[0]!);
    const exactCurrent = legacy?.status === "not_collected" && legacy.expectedCount === 441 && legacy.observedCount === 0 && legacy.quarantinedCount === 0 && legacy.incompatibleCount === 0 && legacy.missingByReason.length === 1 && legacy.missingByReason[0]?.reason === "not_collected" && legacy.missingByReason[0]?.count === 441 && legacy.inputSnapshotIds.length === 0;
    if (mapCoverage.length !== 1 || !legacy || legacy.scope.kind !== "release" || (!exactLegacy && !exactCurrent)) issues.push({ path: "coverageRecords", message: "Mapless releases require an exact retained maps coverage profile" });
  } else {
    const mapByGeography = new Map(manifest.mapArtifacts.map((row) => [row.geographyVersionId, row]));
    const mapIds = new Set(manifest.mapArtifacts.map((row) => row.id));
    if (manifest.mapArtifacts.length !== 441 || mapByGeography.size !== 441 || activeHouseGeographies.size !== 441 || [...activeHouseGeographies].some((id) => !mapByGeography.has(id)) || [...mapByGeography.keys()].some((id) => !activeHouseGeographies.has(id))) issues.push({ path: "mapArtifacts", message: "Maps must exactly close over 441 active House geographies" });
    const outputSnapshots = new Set<string>();
    for (const row of manifest.mapArtifacts) {
      const geography = manifest.geographyVersions.find((item) => item.id === row.geographyVersionId);
      const original = geography && manifest.geometryArtifacts.find((item) => item.id === geography.geometryArtifactId);
      const artifact = manifest.geometryArtifacts.find((item) => item.id === row.artifactId);
      if (!geography || geography.kind !== "house_district" || row.inputSnapshotIds.length !== 1 || !artifact || artifact.format !== "geojson" || artifact.srid !== 4326 || artifact.objectKey !== `maps/${manifest.release.id}/${geography.id}.geojson`) { issues.push({ path: "mapArtifacts", message: "Map artifact has invalid dedicated geometry closure" }); continue; }
      const output = manifest.snapshots.find((item) => item.id === row.inputSnapshotIds[0]);
      const source = output && manifest.sources.find((item) => item.id === output.sourceId);
      const derivations = manifest.snapshotDerivations.filter((item) => item.outputSnapshotId === output?.id);
      const derivationInputId = derivations[0]?.inputSnapshotIds[0];
      const derivationInput = manifest.snapshots.find((item) => item.id === derivationInputId);
      const derivationSource = derivationInput && manifest.sources.find((item) => item.id === derivationInput.sourceId);
      if (!original || !output || !source || source.authority !== "derived" || output.usageStatus !== "approved" || output.checksumSha256 !== artifact.checksumSha256 || artifact.snapshotId !== output.id || derivations.length !== 1 || derivations[0]!.inputSnapshotIds.length !== 1 || derivationInputId !== original.snapshotId || !derivationInput || derivationInput.usageStatus !== "approved" || !derivationSource) issues.push({ path: "mapArtifacts", message: "Map artifact has invalid source snapshot derivation" });
      outputSnapshots.add(row.inputSnapshotIds[0]!);
    }
    const complete = mapCoverage[0];
    if (mapCoverage.length !== 1 || !complete || complete.scope.kind !== "release" || complete.status !== "complete" || complete.expectedCount !== 441 || complete.observedCount !== 441 || complete.quarantinedCount !== 0 || complete.incompatibleCount !== 0 || complete.missingByReason.length !== 0 || complete.inputSnapshotIds.length !== 441 || new Set(complete.inputSnapshotIds).size !== 441 || complete.inputSnapshotIds.some((id) => !outputSnapshots.has(id)) || [...outputSnapshots].some((id) => !complete.inputSnapshotIds.includes(id as never)) || mapIds.size !== 441) issues.push({ path: "coverageRecords", message: "Maps coverage must be the exact complete 441-map closure" });
  }
  manifest.acsVariables.forEach((definition, index) => { const inputsApproved = definition.inputSnapshotIds.every((id) => approvedSnapshotIds.has(id)); if (!inputsApproved) issues.push({ path: `acsVariables.${index}`, message: "Public ACS definitions require approved snapshots" }); if (definition.definitionKind === "derived_ratio") { const numerator = manifest.acsVariables.find((row) => row.id === definition.numeratorDefinitionId); const denominator = manifest.acsVariables.find((row) => row.id === definition.denominatorDefinitionId); if (!numerator || !denominator || numerator.id === denominator.id || numerator.variable === denominator.variable || numerator.id === definition.id || denominator.id === definition.id || numerator.definitionKind !== "source" || denominator.definitionKind !== "source" || numerator.releaseId !== definition.releaseId || denominator.releaseId !== definition.releaseId || numerator.surveyPeriod !== definition.surveyPeriod || denominator.surveyPeriod !== definition.surveyPeriod || numerator.universe !== definition.universe || denominator.universe !== definition.universe) issues.push({ path: `acsVariables.${index}`, message: "Invalid derived ACS definition references" }); } });
  manifest.acsObservations.forEach((row, index) => { const definitions = manifest.acsVariables.filter((definition) => definition.variable === row.variable && definition.label === row.label && definition.unit === row.unit && definition.surveyPeriod === row.surveyPeriod && definition.universe === row.universe); if (definitions.length !== 1) issues.push({ path: `acsObservations.${index}`, message: "ACS observation must resolve to exactly one variable definition" }); if (row.lineage.inputs.some((input) => !approvedSnapshotIds.has(input.snapshotId))) issues.push({ path: `acsObservations.${index}`, message: "Public ACS observations require approved snapshots" }); const definition = definitions[0]; if (definition?.definitionKind === "derived_ratio") { const source = (id: string) => manifest.acsVariables.find((candidate) => candidate.id === id); const numerator = source(definition.numeratorDefinitionId); const denominator = source(definition.denominatorDefinitionId); const sourceObservation = (sourceDefinition: typeof numerator) => manifest.acsObservations.filter((candidate) => candidate.geographyVersionId === row.geographyVersionId && candidate.surveyPeriod === row.surveyPeriod && candidate.variable === sourceDefinition?.variable); const numeratorObservations = sourceObservation(numerator); const denominatorObservations = sourceObservation(denominator); if (numeratorObservations.length !== 1 || denominatorObservations.length !== 1) issues.push({ path: `acsObservations.${index}`, message: "Derived ACS observation requires paired source observations" }); else if (row.estimate.kind === "value" || row.marginOfError.kind === "value") { const numeratorObservation = numeratorObservations[0]!; const denominatorObservation = denominatorObservations[0]!; if (numeratorObservation.estimate.kind !== "value" || numeratorObservation.marginOfError.kind !== "value" || denominatorObservation.estimate.kind !== "value" || denominatorObservation.marginOfError.kind !== "value" || denominatorObservation.estimate.value === 0) issues.push({ path: `acsObservations.${index}`, message: "Numeric derived ACS observation requires numeric nonzero source inputs" }); } } });
  const derivationInputs = new Map(manifest.snapshotDerivations.map((row) => [row.outputSnapshotId, row.inputSnapshotIds]));
  manifest.snapshotDerivations.forEach((row, index) => { if (!snapshotIds.has(row.outputSnapshotId) || !approvedSnapshotIds.has(row.outputSnapshotId) || row.inputSnapshotIds.some((id) => !snapshotIds.has(id)) || row.inputSnapshotIds.includes(row.outputSnapshotId)) issues.push({ path: `snapshotDerivations.${index}`, message: "Invalid snapshot derivation" }); });
  const visited = new Set<SnapshotId>(); const visiting = new Set<SnapshotId>();
  const visitDerivation = (snapshotId: SnapshotId): boolean => {
    if (visiting.has(snapshotId)) return true;
    if (visited.has(snapshotId)) return false;
    visiting.add(snapshotId);
    const cyclic = (derivationInputs.get(snapshotId) ?? []).some((input) => visitDerivation(input));
    visiting.delete(snapshotId); visited.add(snapshotId);
    return cyclic;
  };
  if ([...derivationInputs.keys()].some((snapshotId) => visitDerivation(snapshotId))) issues.push({ path: "snapshotDerivations", message: "Snapshot derivations cannot contain directed cycles" });
  if (jurisdictions.size !== 56 || [...VOTING_STATES, ...DELEGATE_JURISDICTIONS, "PR"].some((code) => !jurisdictions.has(code)) || [...jurisdictions.keys()].some((code) => !VOTING_STATES.has(code) && !DELEGATE_JURISDICTIONS.has(code) && code !== "PR")) issues.push({ path: "jurisdictions", message: "Jurisdictions must match the current fixed policy" });
  for (const [code, jurisdiction] of jurisdictions) {
    const expected = VOTING_STATES.has(code) ? ["voting", "two_seats"] : DELEGATE_JURISDICTIONS.has(code) ? ["delegate", "none"] : code === "PR" ? ["resident_commissioner", "none"] : undefined;
    if (!expected || jurisdiction.houseRepresentation !== expected[0] || jurisdiction.senateRepresentation !== expected[1]) issues.push({ path: "jurisdictions", message: `Jurisdiction ${code} violates the fixed policy` });
    const offices = active.map((cycle) => officeById.get(cycle.officeId)).filter((office) => office?.stateCode === code);
    const senate = offices.filter((office) => office?.chamber === "senate");
    const house = offices.filter((office) => office?.chamber === "house");
    const expectedHouseKind = jurisdiction.houseRepresentation === "voting" ? "house_voting" : jurisdiction.houseRepresentation === "delegate" ? "house_delegate" : "resident_commissioner";
    if (house.length === 0 || house.some((office) => office?.kind !== expectedHouseKind)) issues.push({ path: "jurisdictions", message: `Jurisdiction ${code} has incompatible House representation` });
    if ((jurisdiction.senateRepresentation === "none" && senate.length !== 0) || (jurisdiction.senateRepresentation === "two_seats" && (senate.length !== 2 || new Set(senate.map((office) => office?.senateClass)).size !== 2))) issues.push({ path: "jurisdictions", message: `Jurisdiction ${code} has incompatible Senate representation` });
  }
  activeOffices.forEach((office) => { if (office && !jurisdictions.has(office.stateCode)) issues.push({ path: "offices", message: "Office belongs to an undeclared jurisdiction" }); });
  active.forEach((cycle) => {
    const memberships = manifest.memberships.filter((membership) => membership.officeTermId === cycle.officeTermId && membership.startsAt <= cutoff && (membership.endsAt === null || cutoff < membership.endsAt));
    if (cycle.occupancy.asOf !== cutoff || cycle.occupancy.status === "unknown" || (cycle.occupancy.status === "occupied" && memberships.length !== 1) || (cycle.occupancy.status === "vacant" && memberships.length !== 0)) issues.push({ path: "seatCycles.occupancy", message: "Catalog occupancy must truthfully match the release cutoff" });
  });
  return issues.length === 0 ? { success: true, data: manifest } : { success: false, issues };
}

export function validateReleaseManifest(input: unknown):
  | { readonly success: true; readonly data: ReleaseManifest }
  | { readonly success: false; readonly issues: readonly ManifestIssue[] } {
  const version = releaseManifestSchema.safeParse(input);
  if (!version.success) return { success: false, issues: version.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  return version.data.schemaVersion === 1 ? validatePrototypeManifest(version.data) : validateNationwideManifest(version.data);
}

function duplicateIssues<T>(
  records: readonly T[],
  collection: string,
  getId: (record: T) => string,
): ManifestIssue[] {
  const seen = new Set<string>();
  const issues: ManifestIssue[] = [];

  records.forEach((record, index) => {
    const id = getId(record);
    if (seen.has(id)) {
      issues.push({ path: `${collection}.${index}.id`, message: `Duplicate identifier ${id}` });
    }
    seen.add(id);
  });

  return issues;
}

function validateManifestIntegrity(manifest: BaseManifest, validateProfile: boolean): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const releaseId = manifest.release.id;
  const sourceCutoffDate = new Date(manifest.release.sourceCutoff).toISOString().slice(0, 10);

  const collections: ReadonlyArray<
    readonly [string, readonly { id: string; releaseId: string }[]]
  > = [
    ["sources", manifest.sources],
    ["snapshots", manifest.snapshots],
    ["districtPlans", manifest.districtPlans],
    ["geometryArtifacts", manifest.geometryArtifacts],
    ["geographyVersions", manifest.geographyVersions],
    ["offices", manifest.offices],
    ["people", manifest.people],
    ["officeTerms", manifest.officeTerms],
    ["memberships", manifest.memberships],
    ["seatCycles", manifest.seatCycles],
    ["contests", manifest.contests],
    ["candidacies", manifest.candidacies],
    ["resultOptions", manifest.resultOptions],
    ["committees", manifest.committees],
    ["committeeRelationships", manifest.committeeRelationships],
    ["fecFilingSummaries", manifest.fecFilingSummaries],
  ];

  for (const [name, records] of collections) {
    issues.push(...duplicateIssues(records, name, (record) => record.id));
  }
  const districtPlanNaturalKeys = new Set<string>();
  manifest.districtPlans.forEach((plan, index) => {
    const key = [plan.jurisdictionStateCode, plan.congress, plan.name].join(":");
    if (districtPlanNaturalKeys.has(key)) {
      issues.push({ path: `districtPlans.${index}`, message: "Duplicate district-plan natural key" });
    }
    districtPlanNaturalKeys.add(key);
  });

  const sources = new Set(manifest.sources.map((record) => record.id));
  const snapshots = new Set<SnapshotId>(manifest.snapshots.map((record) => record.id));
  const plans = new Set(manifest.districtPlans.map((record) => record.id));
  const planRecords = new Map(manifest.districtPlans.map((record) => [record.id, record]));
  const artifacts = new Map(manifest.geometryArtifacts.map((record) => [record.id, record]));
  const geographies = new Map(manifest.geographyVersions.map((record) => [record.id, record]));
  const offices = new Map(manifest.offices.map((record) => [record.id, record]));
  const people = new Set(manifest.people.map((record) => record.id));
  const terms = new Map(manifest.officeTerms.map((record) => [record.id, record]));
  const cycleRecords = new Map(manifest.seatCycles.map((record) => [record.id, record]));
  const cycles = new Set(cycleRecords.keys());
  const contestRecords = new Map(manifest.contests.map((record) => [record.id, record]));
  const contests = new Set(contestRecords.keys());
  const candidacies = new Map(manifest.candidacies.map((record) => [record.id, record]));
  const resultOptions = new Map(manifest.resultOptions.map((record) => [record.id, record]));
  const committees = new Set(manifest.committees.map((record) => record.id));
  const filings = new Set(manifest.fecFilingSummaries.map((record) => record.id));

  const checkRelease = (records: readonly { releaseId: string }[], collection: string) => {
    records.forEach((record, index) => {
      if (record.releaseId !== releaseId) {
        issues.push({ path: `${collection}.${index}.releaseId`, message: "Record belongs to another release" });
      }
    });
  };

  const checkProvenance = (
    records: readonly { provenance: readonly { snapshotId: SnapshotId }[] }[],
    collection: string,
  ) => {
    records.forEach((record, index) => {
      record.provenance.forEach((reference, referenceIndex) => {
        if (!snapshots.has(reference.snapshotId)) {
          issues.push({
            path: `${collection}.${index}.provenance.${referenceIndex}.snapshotId`,
            message: "Unknown source snapshot",
          });
        }
      });
    });
  };

  const checkLineage = (
    records: readonly { lineage: { inputs: readonly { snapshotId: SnapshotId }[] } }[],
    collection: string,
  ) => {
    records.forEach((record, index) => {
      record.lineage.inputs.forEach((input, inputIndex) => {
        if (!snapshots.has(input.snapshotId)) {
          issues.push({
            path: `${collection}.${index}.lineage.inputs.${inputIndex}.snapshotId`,
            message: "Unknown source snapshot",
          });
        }
      });
    });
  };

  for (const [name, records] of collections) {
    checkRelease(records, name);
  }
  checkRelease(manifest.electionResults, "electionResults");
  checkRelease(manifest.acsObservations, "acsObservations");
  checkRelease(manifest.financeSummaries, "financeSummaries");

  const sourcedCollections: ReadonlyArray<
    readonly [string, readonly { provenance: readonly { snapshotId: SnapshotId }[] }[]]
  > = [
    ["districtPlans", manifest.districtPlans],
    ["geographyVersions", manifest.geographyVersions],
    ["offices", manifest.offices],
    ["people", manifest.people],
    ["officeTerms", manifest.officeTerms],
    ["memberships", manifest.memberships],
    ["seatCycles", manifest.seatCycles],
    ["contests", manifest.contests],
    ["candidacies", manifest.candidacies],
    ["resultOptions", manifest.resultOptions],
    ["committees", manifest.committees],
    ["committeeRelationships", manifest.committeeRelationships],
  ];
  for (const [name, records] of sourcedCollections) {
    checkProvenance(records, name);
  }
  checkLineage(manifest.contests, "contests");
  checkLineage(manifest.electionResults, "electionResults");
  checkLineage(manifest.acsObservations, "acsObservations");
  checkLineage(manifest.fecFilingSummaries, "fecFilingSummaries");


  manifest.snapshots.forEach((snapshot, index) => {
    if (!sources.has(snapshot.sourceId)) {
      issues.push({ path: `snapshots.${index}.sourceId`, message: "Unknown source" });
    }
  });

  manifest.geometryArtifacts.forEach((artifact, index) => {
    if (!snapshots.has(artifact.snapshotId)) {
      issues.push({ path: `geometryArtifacts.${index}.snapshotId`, message: "Unknown geometry snapshot" });
    }
  });

  manifest.geographyVersions.forEach((geography, index) => {
    if (!artifacts.has(geography.geometryArtifactId)) {
      issues.push({ path: `geographyVersions.${index}.geometryArtifactId`, message: "Unknown geometry artifact" });
    }
    if (geography.kind === "house_district") {
      const plan = planRecords.get(geography.districtPlanId);
      if (!plans.has(geography.districtPlanId)) {
        issues.push({ path: `geographyVersions.${index}.districtPlanId`, message: "Unknown district plan" });
      } else if (plan && plan.jurisdictionStateCode !== geography.stateCode) {
        issues.push({ path: `geographyVersions.${index}.districtPlanId`, message: "Geography is outside district-plan jurisdiction" });
      }
    }
  });

  const geographyNaturalKeys = new Set<string>();
  manifest.geographyVersions.forEach((geography, index) => {
    const key = [geography.kind, geography.sourceGeoid, geography.vintage].join(":");
    if (geographyNaturalKeys.has(key)) issues.push({ path: `geographyVersions.${index}`, message: "Duplicate geography natural key" });
    geographyNaturalKeys.add(key);
  });

  manifest.offices.forEach((office, index) => {
    const invalidHouse = office.chamber === "house" && (office.kind === "senate" || office.districtCode === null || office.senateClass !== null);
    const invalidSenate = office.chamber === "senate" && (office.kind !== "senate" || office.districtCode !== null || office.senateClass === null);
    if (invalidHouse || invalidSenate) {
      issues.push({ path: `offices.${index}`, message: "Office fields are incompatible with chamber" });
    }
  });

  const officeNaturalKeys = new Set<string>();
  manifest.offices.forEach((office, index) => {
    const key = [office.chamber, office.stateCode, office.districtCode ?? "", office.senateClass ?? ""].join(":");
    if (officeNaturalKeys.has(key)) {
      issues.push({ path: `offices.${index}`, message: "Duplicate office natural key" });
    }
    officeNaturalKeys.add(key);
  });

  const bioguideIds = new Set<string>();
  manifest.people.forEach((person, index) => {
    if (person.bioguideId === null) return;
    if (bioguideIds.has(person.bioguideId)) {
      issues.push({ path: `people.${index}.bioguideId`, message: "Duplicate Bioguide ID" });
    }
    bioguideIds.add(person.bioguideId);
  });

  manifest.officeTerms.forEach((term, index) => {
    if (!offices.has(term.officeId)) {
      issues.push({ path: `officeTerms.${index}.officeId`, message: "Unknown office" });
    }
    if (term.startsAt >= term.endsAt) {
      issues.push({ path: `officeTerms.${index}`, message: "Office term must end after it starts" });
    }
  });
  for (let left = 0; left < manifest.officeTerms.length; left += 1) {
    for (let right = left + 1; right < manifest.officeTerms.length; right += 1) {
      const a = manifest.officeTerms[left];
      const b = manifest.officeTerms[right];
      if (a.officeId === b.officeId && a.startsAt < b.endsAt && b.startsAt < a.endsAt) {
        issues.push({ path: `officeTerms.${right}`, message: "Overlapping office terms" });
      }
    }
  }

  const termNaturalKeys = new Set<string>();
  manifest.officeTerms.forEach((term, index) => {
    const key = [term.officeId, term.startsAt, term.endsAt].join(":");
    if (termNaturalKeys.has(key)) issues.push({ path: `officeTerms.${index}`, message: "Duplicate office-term natural key" });
    termNaturalKeys.add(key);
  });

  manifest.memberships.forEach((membership, index) => {
    const term = terms.get(membership.officeTermId);
    if (!term) {
      issues.push({ path: `memberships.${index}.officeTermId`, message: "Unknown office term" });
    }
    if (!people.has(membership.personId)) {
      issues.push({ path: `memberships.${index}.personId`, message: "Unknown person" });
    }
    if (membership.endsAt !== null && membership.startsAt >= membership.endsAt) {
      issues.push({ path: `memberships.${index}`, message: "Membership must end after it starts" });
    }
    if (term && (membership.startsAt < term.startsAt || (membership.endsAt ?? term.endsAt) > term.endsAt)) {
      issues.push({ path: `memberships.${index}`, message: "Membership falls outside its office term" });
    }
  });
  for (let left = 0; left < manifest.memberships.length; left += 1) {
    for (let right = left + 1; right < manifest.memberships.length; right += 1) {
      const a = manifest.memberships[left];
      const b = manifest.memberships[right];
      const term = terms.get(a.officeTermId);
      const aEnd = a.endsAt ?? term?.endsAt ?? "9999-12-31";
      const bEnd = b.endsAt ?? term?.endsAt ?? "9999-12-31";
      if (a.officeTermId === b.officeTermId && a.startsAt < bEnd && b.startsAt < aEnd) {
        issues.push({ path: `memberships.${right}`, message: "Overlapping memberships" });
      }
    }
  }

  const cycleNaturalKeys = new Set<string>();
  manifest.seatCycles.forEach((cycle, index) => {
    const office = offices.get(cycle.officeId);
    const term = terms.get(cycle.officeTermId);
    const geography = geographies.get(cycle.geographyVersionId);
    if (!office) issues.push({ path: `seatCycles.${index}.officeId`, message: "Unknown office" });
    if (!term || term.officeId !== cycle.officeId) {
      issues.push({ path: `seatCycles.${index}.officeTermId`, message: "Unknown or incompatible office term" });
    }
    if (!geography) {
      issues.push({ path: `seatCycles.${index}.geographyVersionId`, message: "Unknown geography" });
    } else if (office && ((office.chamber === "house") !== (geography.kind === "house_district"))) {
      issues.push({ path: `seatCycles.${index}.geographyVersionId`, message: "Geography is incompatible with chamber" });
    } else if (office && office.stateCode !== geography.stateCode) {
      issues.push({ path: `seatCycles.${index}.geographyVersionId`, message: "Office and geography states do not match" });
    } else if (office && geography.kind === "house_district" && office.districtCode !== geography.districtCode) {
      issues.push({ path: `seatCycles.${index}.geographyVersionId`, message: "Office and geography districts do not match" });
    }
    const key = [cycle.officeId, cycle.cycleYear, cycle.electionKind].join(":");
    if (cycleNaturalKeys.has(key)) {
      issues.push({ path: `seatCycles.${index}`, message: "Duplicate seat-cycle natural key" });
    }
    cycleNaturalKeys.add(key);
    if (cycle.occupancy.asOf > sourceCutoffDate) {
      issues.push({ path: `seatCycles.${index}.occupancy.asOf`, message: "Occupancy date is after release source cutoff" });
    }
    if (term) {
      const activeMemberships = manifest.memberships.filter((membership) =>
        membership.officeTermId === cycle.officeTermId &&
        membership.startsAt <= cycle.occupancy.asOf &&
        (membership.endsAt === null || cycle.occupancy.asOf < membership.endsAt),
      );
      if (cycle.occupancy.status === "occupied" && activeMemberships.length !== 1) {
        issues.push({ path: `seatCycles.${index}.occupancy`, message: "Occupied seat must have exactly one active membership" });
      }
      if (cycle.occupancy.status === "vacant" && activeMemberships.length !== 0) {
        issues.push({ path: `seatCycles.${index}.occupancy`, message: "Vacant seat cannot have an active membership" });
      }
      if (cycle.occupancy.status !== "unknown" && (cycle.occupancy.asOf < term.startsAt || cycle.occupancy.asOf >= term.endsAt)) {
        issues.push({ path: `seatCycles.${index}.occupancy.asOf`, message: "Occupancy date falls outside office term" });
      }
    }
  });

  manifest.contests.forEach((contest, index) => {
    if (!cycles.has(contest.seatCycleId)) {
      issues.push({ path: `contests.${index}.seatCycleId`, message: "Unknown seat cycle" });
    }
    if (!geographies.has(contest.geographyVersionId)) {
      issues.push({ path: `contests.${index}.geographyVersionId`, message: "Unknown geography" });
    }
    const cycle = manifest.seatCycles.find((candidate) => candidate.id === contest.seatCycleId);
    if (cycle && cycle.geographyVersionId !== contest.geographyVersionId) {
      issues.push({ path: `contests.${index}.geographyVersionId`, message: "Contest and seat-cycle geography do not match" });
    }
    const results = manifest.electionResults.filter((result) => result.contestId === contest.id);
    if (contest.certificationStatus === "modeled") {
      if (contest.allocationMethod === "none" || contest.lineage.status !== "modeled") {
        issues.push({ path: `contests.${index}`, message: "Modeled contest requires modeled lineage and an allocation method" });
      }
      if (contest.allocationCoveragePercent.kind !== "value" || contest.allocationCoveragePercent.value <= 0) {
        issues.push({ path: `contests.${index}.allocationCoveragePercent`, message: "Modeled contest requires positive numeric allocation coverage" });
      }
      if (!results.some((result) => result.votes.kind === "value")) {
        issues.push({ path: `contests.${index}`, message: "Modeled contest requires at least one numeric result" });
      }
    } else if (contest.allocationMethod !== "none") {
      issues.push({ path: `contests.${index}.allocationMethod`, message: "Non-modeled contest cannot use an allocation method" });
    }
    if (contest.certificationStatus === "unavailable") {
      if (contest.reportingCompletenessPercent !== 0 || contest.denominatorVotes.kind !== "missing" || contest.denominatorVotes.reason !== "not_defensibly_modeled" || contest.allocationMethod !== "none" || contest.allocationCoveragePercent.kind !== "missing" || contest.allocationCoveragePercent.reason !== "not_applicable" || contest.lineage.status !== "reported" || !results.every((result) => result.votes.kind === "missing" && result.votes.reason === "not_defensibly_modeled")) {
        issues.push({ path: `contests.${index}`, message: "Unavailable contest must use the explicit unavailable facts and results" });
      }
    }
    if (contest.certificationStatus === "certified" && contest.lineage.status !== "certified") {
      issues.push({ path: `contests.${index}.lineage.status`, message: "Certified contest requires certified lineage" });
    }
    if (contest.allocationMethod === "none" && !(
      contest.allocationCoveragePercent.kind === "missing" &&
      contest.allocationCoveragePercent.reason === "not_applicable"
    )) {
      issues.push({ path: `contests.${index}.allocationCoveragePercent`, message: "Unallocated contest must mark allocation coverage not applicable" });
    }
  });

  const contestNaturalKeys = new Set<string>();
  manifest.contests.forEach((contest, index) => {
    const key = [contest.seatCycleId, contest.kind, contest.round, contest.electionDate].join(":");
    if (contestNaturalKeys.has(key)) issues.push({ path: `contests.${index}`, message: "Duplicate contest natural key" });
    contestNaturalKeys.add(key);
  });

  manifest.candidacies.forEach((candidacy, index) => {
    if (!contests.has(candidacy.contestId)) issues.push({ path: `candidacies.${index}.contestId`, message: "Unknown contest" });
    if (candidacy.personId !== null && !people.has(candidacy.personId)) issues.push({ path: `candidacies.${index}.personId`, message: "Unknown person" });
  });

  manifest.resultOptions.forEach((option, index) => {
    if (!contests.has(option.contestId)) issues.push({ path: `resultOptions.${index}.contestId`, message: "Unknown contest" });
    if (option.candidacyId !== null) {
      const candidacy = candidacies.get(option.candidacyId);
      if (!candidacy || candidacy.contestId !== option.contestId) {
        issues.push({ path: `resultOptions.${index}.candidacyId`, message: "Unknown or incompatible candidacy" });
      }
    }
  });

  manifest.electionResults.forEach((result, index) => {
    if (!contests.has(result.contestId)) {
      issues.push({ path: `electionResults.${index}.contestId`, message: "Unknown contest" });
    }
    const option = resultOptions.get(result.resultOptionId);
    if (!option || option.contestId !== result.contestId) {
      issues.push({ path: `electionResults.${index}.resultOptionId`, message: "Unknown or incompatible result option" });
    }
    const contest = manifest.contests.find((candidate) => candidate.id === result.contestId);
    if (contest && result.lineage.status !== contest.lineage.status) {
      issues.push({ path: `electionResults.${index}.lineage.status`, message: "Result and contest lineage statuses do not match" });
    }
  });

  const resultNaturalKeys = new Set<string>();
  manifest.electionResults.forEach((result, index) => {
    const key = `${result.contestId}:${result.resultOptionId}`;
    if (resultNaturalKeys.has(key)) issues.push({ path: `electionResults.${index}`, message: "Duplicate election-result natural key" });
    resultNaturalKeys.add(key);
  });

  manifest.contests.forEach((contest, contestIndex) => {
    if (contest.denominatorVotes.kind !== "value") return;
    const results = manifest.electionResults.filter((result) => result.contestId === contest.id);
    if (results.some((result) => result.votes.kind === "missing")) return;
    const resultTotal = results.reduce(
      (total, result) => total + (result.votes.kind === "value" ? result.votes.value : 0),
      0,
    );
    if (resultTotal > contest.denominatorVotes.value) {
      issues.push({ path: `contests.${contestIndex}.denominatorVotes`, message: "Result votes exceed contest denominator" });
    } else if (contest.reportingCompletenessPercent === 100 && resultTotal !== contest.denominatorVotes.value) {
      issues.push({ path: `contests.${contestIndex}.denominatorVotes`, message: "Complete contest results do not reconcile to denominator" });
    }
  });

  manifest.acsObservations.forEach((observation, index) => {
    if (!geographies.has(observation.geographyVersionId)) {
      issues.push({ path: `acsObservations.${index}.geographyVersionId`, message: "Unknown geography" });
    }
  });

  const acsNaturalKeys = new Set<string>();
  manifest.acsObservations.forEach((observation, index) => {
    const key = [observation.geographyVersionId, observation.variable, observation.surveyPeriod].join(":");
    if (acsNaturalKeys.has(key)) issues.push({ path: `acsObservations.${index}`, message: "Duplicate ACS natural key" });
    acsNaturalKeys.add(key);
  });

  if (validateProfile) {
   const profileManifest = manifest as PrototypeManifest;
   const profileIds = new Set(profileManifest.profileSeatCycleIds);
  if (profileIds.size !== profileManifest.profileSeatCycleIds.length) {
    issues.push({ path: "profileSeatCycleIds", message: "Profile seat-cycle IDs must be unique" });
  }
  const representedStates = new Set<string>();
  const profileGeographyIds = new Set<string>();
  const profileVintages = new Set<string>();
  profileManifest.profileSeatCycleIds.forEach((profileId, index) => {
    const cycle = cycleRecords.get(profileId);
    const office = cycle ? offices.get(cycle.officeId) : undefined;
    if (!cycle || !office || office.chamber !== "house") {
      issues.push({ path: `profileSeatCycleIds.${index}`, message: "Profile must reference a House seat cycle" });
      return;
    }
    representedStates.add(office.stateCode);
    if (profileGeographyIds.has(cycle.geographyVersionId)) {
      issues.push({ path: `profileSeatCycleIds.${index}`, message: "Profile cycles must have unique House geographies" });
    }
    profileGeographyIds.add(cycle.geographyVersionId);
    const geography = geographies.get(cycle.geographyVersionId);
    if (geography) profileVintages.add(geography.vintage);
    const term = terms.get(cycle.officeTermId);
    if (term && !(term.startsAt <= sourceCutoffDate && sourceCutoffDate < term.endsAt)) {
      issues.push({ path: `profileSeatCycleIds.${index}`, message: "Profile office term must cover the release source cutoff" });
    }
    if (!terms.has(cycle.officeTermId) || !geographies.has(cycle.geographyVersionId)) {
      issues.push({ path: `profileSeatCycleIds.${index}`, message: "Profile lacks relational closure" });
    }
    const presidentialContests = manifest.contests.filter((contest) =>
      contest.seatCycleId === profileId &&
      contest.kind === "president_general" &&
      contest.electionDate.startsWith("2024-"),
    );
    if (presidentialContests.length !== 1 || !manifest.electionResults.some((result) => result.contestId === presidentialContests[0]?.id)) {
      issues.push({ path: `profileSeatCycleIds.${index}`, message: "Profile requires one explicit 2024 presidential result" });
    }
    if (!manifest.acsObservations.some((observation) => observation.geographyVersionId === cycle.geographyVersionId)) {
      issues.push({ path: `profileSeatCycleIds.${index}`, message: "Profile requires an ACS observation or explicit missing observation" });
    }
    if (manifest.financeSummaries.filter((summary) => summary.seatCycleId === profileId).length !== 1) {
      issues.push({ path: `profileSeatCycleIds.${index}`, message: "Profile requires exactly one finance summary" });
    }
  });

  if (profileVintages.size !== 1 || profileVintages.has("")) {
    issues.push({ path: "profileSeatCycleIds", message: "Profile House geographies must share one nonempty vintage" });
  }
  const [productVintage] = profileVintages;

  representedStates.forEach((stateCode) => {
    const stateGeographies = manifest.geographyVersions.filter((geography) =>
      geography.kind === "state" && geography.stateCode === stateCode && geography.vintage === productVintage,
    );
    if (stateGeographies.length !== 1) {
      issues.push({ path: "geographyVersions", message: `State ${stateCode} requires exactly one state geography at the product vintage` });
    }
    const activeSenateCandidates = manifest.seatCycles
      .map((cycle) => ({ cycle, office: offices.get(cycle.officeId), term: terms.get(cycle.officeTermId) }))
      .filter(({ office, term }) => office?.chamber === "senate" && office.stateCode === stateCode && term && term.startsAt <= sourceCutoffDate && sourceCutoffDate < term.endsAt);
    const officesInCandidates = new Set(activeSenateCandidates.map(({ cycle }) => cycle.officeId));
    const termsInCandidates = new Set(activeSenateCandidates.map(({ cycle }) => cycle.officeTermId));
    const senateClasses = new Set(activeSenateCandidates.map(({ office }) => office?.senateClass));
    if (activeSenateCandidates.length !== 2 || officesInCandidates.size !== 2 || termsInCandidates.size !== 2 || senateClasses.size !== 2 || senateClasses.has(null) || senateClasses.has(undefined)) {
      issues.push({ path: "seatCycles", message: `State ${stateCode} requires two distinct current Senate classes` });
    }
  });
  }

  const financeSummaryCycles = new Set<string>();
  manifest.financeSummaries.forEach((summary, index) => {
    if (!cycles.has(summary.seatCycleId)) {
      issues.push({ path: `financeSummaries.${index}.seatCycleId`, message: "Unknown seat cycle" });
    }
    if (financeSummaryCycles.has(summary.seatCycleId)) {
      issues.push({ path: `financeSummaries.${index}`, message: "Duplicate seat finance summary" });
    }
    financeSummaryCycles.add(summary.seatCycleId);
    if (summary.kind === "value") {
      const filing = manifest.fecFilingSummaries.find((candidate) => candidate.id === summary.filingId);
      if (!filing) {
        issues.push({ path: `financeSummaries.${index}.filingId`, message: "Unknown finance filing" });
      } else {
        const isLeaf = !manifest.fecFilingSummaries.some((candidate) => candidate.amendsFilingId === filing.id);
        const highestAmendment = Math.max(
          ...manifest.fecFilingSummaries
            .filter((candidate) =>
              candidate.seatCycleId === filing.seatCycleId &&
              candidate.committeeId === filing.committeeId &&
              candidate.reportType === filing.reportType &&
              candidate.reportingPeriodStart === filing.reportingPeriodStart &&
              candidate.reportingPeriodEnd === filing.reportingPeriodEnd,
            )
            .map((candidate) => candidate.amendmentNumber),
        );
        if (
          filing.releaseId !== summary.releaseId ||
          filing.seatCycleId !== summary.seatCycleId ||
          filing.amendmentStatus === "superseded" ||
          !isLeaf ||
          filing.amendmentNumber !== highestAmendment
        ) {
          issues.push({ path: `financeSummaries.${index}.filingId`, message: "Finance summary must reference the canonical filing for its seat cycle" });
        }
      }
    }
    if (summary.kind === "missing") {
      summary.inputs.forEach((input, inputIndex) => {
        if (!snapshots.has(input.snapshotId)) issues.push({ path: `financeSummaries.${index}.inputs.${inputIndex}`, message: "Unknown source snapshot" });
      });
    }
  });

  const sourceCommitteeKeys = new Set<string>();
  manifest.committees.forEach((committee, index) => {
    if (sourceCommitteeKeys.has(committee.sourceCommitteeId)) issues.push({ path: `committees.${index}.sourceCommitteeId`, message: "Duplicate source committee ID" });
    sourceCommitteeKeys.add(committee.sourceCommitteeId);
  });

  manifest.committeeRelationships.forEach((relationship, index) => {
    if (!committees.has(relationship.committeeId)) issues.push({ path: `committeeRelationships.${index}.committeeId`, message: "Unknown committee" });
    if (!candidacies.has(relationship.candidacyId)) issues.push({ path: `committeeRelationships.${index}.candidacyId`, message: "Unknown candidacy" });
    if (relationship.effectiveTo !== null && relationship.effectiveFrom >= relationship.effectiveTo) {
      issues.push({ path: `committeeRelationships.${index}`, message: "Committee relationship must end after it starts" });
    }
  });

  manifest.fecFilingSummaries.forEach((filing, index) => {
    if (!cycles.has(filing.seatCycleId)) {
      issues.push({ path: `fecFilingSummaries.${index}.seatCycleId`, message: "Unknown seat cycle" });
    }
    if (filing.reportingPeriodStart > filing.reportingPeriodEnd) {
      issues.push({ path: `fecFilingSummaries.${index}`, message: "Reporting period is inverted" });
    }
    if (!committees.has(filing.committeeId)) {
      issues.push({ path: `fecFilingSummaries.${index}.committeeId`, message: "Unknown committee" });
    }
    const hasAttributableRelationship = manifest.committeeRelationships.some((relationship) => {
      if (relationship.committeeId !== filing.committeeId) return false;
      if (relationship.effectiveFrom > filing.reportingPeriodEnd) return false;
      if (relationship.effectiveTo !== null && relationship.effectiveTo <= filing.reportingPeriodStart) return false;
      const candidacy = candidacies.get(relationship.candidacyId);
      const contest = candidacy ? contestRecords.get(candidacy.contestId) : undefined;
      return contest?.seatCycleId === filing.seatCycleId;
    });
    if (!hasAttributableRelationship) {
      issues.push({ path: `fecFilingSummaries.${index}.committeeId`, message: "Committee is not attributable to filing seat cycle" });
    }
    if (filing.amendsFilingId !== null && !filings.has(filing.amendsFilingId)) {
      issues.push({ path: `fecFilingSummaries.${index}.amendsFilingId`, message: "Unknown amended filing" });
    }
  });

  const sourceFilingKeys = new Set<string>();
  const filingScopeSequenceKeys = new Set<string>();
  const amendmentChildren = new Map<string, number>();
  manifest.fecFilingSummaries.forEach((filing, index) => {
    if (sourceFilingKeys.has(filing.sourceFilingId)) issues.push({ path: `fecFilingSummaries.${index}.sourceFilingId`, message: "Duplicate source filing ID" });
    sourceFilingKeys.add(filing.sourceFilingId);
    const scopeSequenceKey = [
      filing.seatCycleId,
      filing.committeeId,
      filing.reportType,
      filing.reportingPeriodStart,
      filing.reportingPeriodEnd,
      filing.amendmentNumber,
    ].join(":");
    if (filingScopeSequenceKeys.has(scopeSequenceKey)) {
      issues.push({ path: `fecFilingSummaries.${index}`, message: "Duplicate filing amendment sequence within reporting scope" });
    }
    filingScopeSequenceKeys.add(scopeSequenceKey);
    if (filing.amendsFilingId === filing.id) issues.push({ path: `fecFilingSummaries.${index}.amendsFilingId`, message: "Filing cannot amend itself" });
    if (filing.amendmentNumber === 0 && filing.amendsFilingId !== null) issues.push({ path: `fecFilingSummaries.${index}`, message: "Original filing cannot amend another filing" });
    if (filing.amendmentNumber > 0 && filing.amendsFilingId === null) issues.push({ path: `fecFilingSummaries.${index}`, message: "Amendment must reference its predecessor" });
    if (filing.amendsFilingId !== null) {
      amendmentChildren.set(filing.amendsFilingId, (amendmentChildren.get(filing.amendsFilingId) ?? 0) + 1);
      const previous = manifest.fecFilingSummaries.find((candidate) => candidate.id === filing.amendsFilingId);
      if (previous && (
        previous.seatCycleId !== filing.seatCycleId ||
        previous.committeeId !== filing.committeeId ||
        previous.reportType !== filing.reportType ||
        previous.reportingPeriodStart !== filing.reportingPeriodStart ||
        previous.reportingPeriodEnd !== filing.reportingPeriodEnd ||
        previous.amendmentNumber + 1 !== filing.amendmentNumber ||
        previous.filedAt >= filing.filedAt
      )) {
        issues.push({ path: `fecFilingSummaries.${index}`, message: "Invalid amendment sequence or reporting scope" });
      }
    }
  });
  amendmentChildren.forEach((count, parentId) => {
    if (count > 1) issues.push({ path: "fecFilingSummaries", message: `Branching amendment chain at ${parentId}` });
  });
  manifest.fecFilingSummaries.forEach((filing, index) => {
    const hasChild = amendmentChildren.has(filing.id);
    if (hasChild && filing.amendmentStatus !== "superseded") {
      issues.push({ path: `fecFilingSummaries.${index}.amendmentStatus`, message: "Amended predecessor must be superseded" });
    }
    if (!hasChild && filing.amendmentStatus === "superseded") {
      issues.push({ path: `fecFilingSummaries.${index}.amendmentStatus`, message: "Leaf filing cannot be superseded" });
    }
    if (!hasChild && filing.amendmentNumber === 0 && filing.amendmentStatus !== "new") {
      issues.push({ path: `fecFilingSummaries.${index}.amendmentStatus`, message: "Original leaf filing must be new" });
    }
    if (!hasChild && filing.amendmentNumber > 0 && filing.amendmentStatus !== "amended") {
      issues.push({ path: `fecFilingSummaries.${index}.amendmentStatus`, message: "Amended leaf filing must be marked amended" });
    }
  });

  return issues;
}

export function validatePrototypeManifest(input: unknown):
  | { readonly success: true; readonly data: PrototypeManifest }
  | { readonly success: false; readonly issues: readonly ManifestIssue[] } {
  const parsed = prototypeManifestSchema.safeParse(input);
  if (!parsed.success) return { success: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  const issues = validateManifestIntegrity(parsed.data, true);
  if (computeV1CanonicalDataChecksum(parsed.data) !== parsed.data.canonicalDataChecksumSha256) issues.push({ path: "canonicalDataChecksumSha256", message: "Canonical data checksum does not match manifest content" });
  return issues.length === 0 ? { success: true, data: parsed.data } : { success: false, issues };
}
