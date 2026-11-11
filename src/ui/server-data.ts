// Server-only import convention: this module imports database and canonical data adapters; do not import it from client components.
import { canonicalManifest } from "@/data/canonical-manifest";
import { seatPageRequestSchema, seatQuerySchema, seatRouteParamsSchema } from "@/domain/repository";
import type { DataRelease, ReleaseId, SeatCycleId, Source, SourceSnapshot } from "@/domain/contracts";
import type { ReleaseCoverageAggregate, SeatFacets, SeatListItem, SeatPage, SeatProfile, SeatPageRequest, SeatQuery, SeatResearchRepository } from "@/domain/repository";
import { getPool } from "@/db/client";
import { PostgresSeatResearchRepository } from "@/repositories/postgres";
import { getRuntimeOperationalSignalSink } from "@/operations/runtime-signals";
import type { BrowsePageViewModel, MethodologyPageViewModel, ProfilePageViewModel, PublishedEvidenceViewModel, SourcesPageViewModel } from "./view-models";

// ---- Public types ----

export type RouteDataResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: "invalid_request" | "not_found" | "unavailable" | "configuration" }>;
type UrlQuery = Record<string, string | readonly string[] | undefined>;

// ---- Query parsing ----

/** Rejects unknown and demographic keys before a repository can receive the query. */
export function parseBrowseQuery(input: UrlQuery): RouteDataResult<SeatPageRequest> {
  const allowed = new Set(["identitySearch", "chamber", "stateCode", "party", "incumbencyStatus", "electionYear", "sort", "direction", "cursor"]);
  if (Object.keys(input).some((key) => !allowed.has(key)) || Object.values(input).some((value) => Array.isArray(value))) return { ok: false, code: "invalid_request" };
  const normalized = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = seatPageRequestSchema.safeParse({ ...normalized, limit: 50, electionYear: normalized.electionYear === undefined ? undefined : Number(normalized.electionYear) });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: "invalid_request" };
}
function queryFromPageRequest(request: SeatPageRequest): SeatQuery {
  const { cursor, limit, ...query } = request;
  void cursor; void limit;
  return seatQuerySchema.parse(query);
}
export function classifyProfileRequest(releaseId: ReleaseId, params: Record<string, string>): RouteDataResult<Readonly<{ id: SeatCycleId }>> {
  const parsed = seatRouteParamsSchema.safeParse({ releaseId, ...params });
  return parsed.success ? { ok: true, value: { id: parsed.data.id } } : { ok: false, code: "invalid_request" };
}
export function classifyProfileLookup<T>(value: T | null | undefined): RouteDataResult<T> {
  return value === null || value === undefined ? { ok: false, code: "not_found" } : { ok: true, value };
}

// ---- Repository factory ----

async function repository(): Promise<SeatResearchRepository> {
  if (process.env.WEB_DATABASE_URL || (process.env.NODE_ENV !== "production" && process.env.DATABASE_URL)) return new PostgresSeatResearchRepository(getPool(), getRuntimeOperationalSignalSink());
  if (process.env.NODE_ENV === "production") throw new RouteDataConfigurationError();
  const { InMemorySeatResearchRepository } = await import("@/repositories/in-memory");
  return new InMemorySeatResearchRepository(canonicalManifest);
}
class RouteDataConfigurationError extends Error { public constructor() { super("WEB_DATABASE_URL is required in production for route data"); } }
async function safely<T>(load: () => Promise<T>): Promise<RouteDataResult<T>> { try { return { ok: true, value: await load() }; } catch (error) { return { ok: false, code: error instanceof RouteDataConfigurationError ? "configuration" : "unavailable" }; } }

// ---- Page loaders ----

export async function loadBrowsePage(query: UrlQuery, repositoryOverride?: SeatResearchRepository): Promise<RouteDataResult<BrowsePageViewModel>> {
  const parsed = parseBrowseQuery(query); if (!parsed.ok) return parsed;
  return safely(async () => { const repo = repositoryOverride ?? await repository(); const active = await repo.getActiveRelease(); const [page, facets] = await Promise.all([repo.listSeatPage(active.id, parsed.value), repo.getSeatFacets(active.id)]); return compileBrowsePage(active, page, queryFromPageRequest(parsed.value), facets); });
}
export async function loadProfilePage(params: Record<string, string>, repositoryOverride?: SeatResearchRepository): Promise<RouteDataResult<ProfilePageViewModel>> {
  let repo: SeatResearchRepository; let active;
  try { repo = repositoryOverride ?? await repository(); active = await repo.getActiveRelease(); } catch (error) { return { ok: false, code: error instanceof RouteDataConfigurationError ? "configuration" : "unavailable" }; }
  const parsed = classifyProfileRequest(active.id, params); if (!parsed.ok) return parsed;
  try { const [profile, seat] = await Promise.all([repo.getSeatProfile(active.id, parsed.value.id), repo.getSeatListItem(active.id, parsed.value.id)]); const foundProfile = classifyProfileLookup(profile); const foundSeat = classifyProfileLookup(seat); if (!foundProfile.ok) return foundProfile; if (!foundSeat.ok) return foundSeat; return { ok: true, value: compileProfilePage(foundProfile.value, foundSeat.value) }; } catch { return { ok: false, code: "unavailable" }; }
}
export async function loadSourcesPage(repositoryOverride?: SeatResearchRepository): Promise<RouteDataResult<SourcesPageViewModel>> {
  return safely(async () => { const repo = repositoryOverride ?? await repository(); const active = await repo.getActiveRelease(); const [sources, snapshots, coverage] = await Promise.all([repo.listSources(active.id), repo.listSourceSnapshots(active.id), repo.listReleaseCoverage(active.id)]); return compileSourcesPage(active, sources, snapshots, coverage); });
}
export async function loadMethodologyPage(repositoryOverride?: SeatResearchRepository): Promise<RouteDataResult<MethodologyPageViewModel>> { return safely(async () => compileMethodologyPage(await (repositoryOverride ?? await repository()).getActiveRelease())); }

// ---- View-model compilers ----

const release = (value: DataRelease): BrowsePageViewModel["release"] => ({ id: value.id, label: value.label, status: value.status, sourceCutoff: value.sourceCutoff, publishedAt: value.publishedAt });
const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)].sort();
const byteCompare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const sameSnapshot = (left: SourceSnapshot, right: SourceSnapshot): boolean => left.id === right.id && left.releaseId === right.releaseId && left.sourceId === right.sourceId && left.sourceUrl === right.sourceUrl && left.publishedAt === right.publishedAt && left.retrievedAt === right.retrievedAt && left.checksumSha256 === right.checksumSha256 && left.parserVersion === right.parserVersion && left.license === right.license && left.usageStatus === right.usageStatus;

export function compileBrowsePage(releaseValue: DataRelease, page: SeatPage, appliedQuery: SeatQuery, facets: SeatFacets): BrowsePageViewModel {
  return { release: release(releaseValue), appliedQuery: { ...appliedQuery }, rows: page.items.map((row) => ({ ...row })), total: page.total, nextCursor: page.nextCursor, available: { states: unique(facets.states), parties: unique(facets.parties), incumbencyStatuses: unique(facets.incumbencyStatuses), electionYears: unique(facets.electionYears) }, disclosure: { coverage: "Coverage is limited to the active release; missing values retain their stated reason.", rankings: "This catalog is not ordered by score. The ranking is published separately, in the Priority Index.", demographicFilters: "Demographics are display-only and cannot filter, order, subset, or rank seats." } };
}

export function compileProfilePage(profile: SeatProfile, seat: SeatListItem): ProfilePageViewModel {
  const contests = new Map(profile.contests.map((contest) => [contest.id, contest]));
  const options = new Map(profile.resultOptions.map((option) => [option.id, option]));
  const candidacies = new Map(profile.candidacies.map((candidacy) => [candidacy.id, candidacy]));
  const fact = (name: "birth_date" | "bioguide_id") => profile.biographicalFacts.find((row) => row.fact === name)?.value ?? null;
  const snapshots = new Map(profile.snapshots.map((snapshot) => [String(snapshot.id), snapshot]));
  const sources = new Map(profile.sources.map((source) => [String(source.id), source]));
  const committeeNames = new Map(profile.committees.map((committee) => [String(committee.id), committee.name]));
  const jurisdictionPolicy = { senateRepresentation: profile.jurisdiction.senateRepresentation, source: profile.jurisdiction.source };

  const publishedEvidence = (ids: readonly unknown[]): readonly PublishedEvidenceViewModel[] => ids.flatMap((id) => {
    const snapshot = snapshots.get(String(id));
    const source = snapshot && sources.get(String(snapshot.sourceId));
    return snapshot?.usageStatus === "approved" && snapshot.releaseId === profile.release.id && source?.releaseId === profile.release.id ? [{ id: String(snapshot.id), sourceUrl: snapshot.sourceUrl, sourceName: source.name, retrievedAt: snapshot.retrievedAt }] : [];
  });

  const identity = {
    id: profile.seatCycle.id, chamber: profile.office.chamber, stateCode: profile.office.stateCode, districtCode: profile.office.districtCode,
    geographyLabel: profile.geography.label, geographyVintage: profile.geography.vintage,
    currentHolder: profile.incumbent?.displayName ?? null, currentHolderParty: profile.membership?.party ?? null,
    occupancyStatus: profile.seatCycle.occupancy.status, occupancyAsOf: profile.seatCycle.occupancy.asOf,
    incumbencyStatus: profile.seatCycle.incumbencyStatus,
    officeKind: profile.office.kind, jurisdictionPolicy,
  };

  const elections = profile.contests.map((contest) => ({
    id: contest.id, kind: contest.kind, round: contest.round, electionDate: contest.electionDate,
    certificationStatus: contest.certificationStatus, reportingCompletenessPercent: contest.reportingCompletenessPercent,
    reportingUnit: contest.reportingUnit, allocationMethod: contest.allocationMethod,
    allocationCoveragePercent: contest.allocationCoveragePercent, denominatorVotes: contest.denominatorVotes, lineage: contest.lineage,
  }));

  const electionResults = profile.electionResults.flatMap((result) => {
    const contest = contests.get(result.contestId); const option = options.get(result.resultOptionId);
    if (!contest || !option) return [];
    const candidacy = option.candidacyId === null ? null : candidacies.get(option.candidacyId) ?? null;
    return [{
      contestId: result.contestId, resultOptionId: result.resultOptionId, votes: result.votes, lineage: result.lineage,
      kind: contest.kind, round: contest.round, electionDate: contest.electionDate,
      certificationStatus: contest.certificationStatus, reportingCompletenessPercent: contest.reportingCompletenessPercent,
      reportingUnit: contest.reportingUnit, allocationMethod: contest.allocationMethod,
      allocationCoveragePercent: contest.allocationCoveragePercent, denominatorVotes: contest.denominatorVotes,
      candidacyId: option.candidacyId, label: option.label, party: option.party, optionKind: option.optionKind,
      provenance: option.provenance, candidacyParty: candidacy?.party ?? null,
    }];
  });

  const committeeAssignments = profile.committeeAssignments.map((assignment) => ({
    committeeId: String(assignment.committeeId), committeeName: committeeNames.get(String(assignment.committeeId)) ?? String(assignment.committeeId),
    role: assignment.role, effectiveFrom: assignment.effectiveFrom, effectiveTo: assignment.effectiveTo,
    inputSnapshotIds: assignment.provenance.map((reference) => String(reference.snapshotId)),
  }));

  const electionDecisions = profile.electionDecisions.map((decision) => {
    const coverage = profile.electionCoverage.find((candidate) => candidate.scope.kind === "election" && candidate.scope.jurisdictionCode === decision.jurisdictionCode && candidate.scope.electionYear === decision.electionYear) ?? null;
    return { jurisdictionCode: decision.jurisdictionCode, electionYear: decision.electionYear, status: decision.status, inputSnapshotIds: decision.inputSnapshotIds, coverage, evidence: publishedEvidence(decision.inputSnapshotIds) };
  });

  const financeCoverage = profile.financeCoverage;
  const financeAvailability = financeCoverage?.releaseId === profile.release.id && financeCoverage.scope.kind === "funding" && financeCoverage.scope.seatCycleId === profile.seatCycle.id && financeCoverage.scope.fundingKind === "summary" ? { ...financeCoverage, evidence: publishedEvidence(financeCoverage.inputSnapshotIds) } : null;

  return {
    release: release(profile.release),
    identity,
    map: profile.map,
    headlineFacts: { presidentialMargin2024: seat.presidentialMargin2024, cashOnHand: seat.cashOnHand },
    elections,
    electionDecisions,
    electionResults,
    demographics: profile.demographics,
    acsAvailability: profile.acsAvailability,
    financeAvailability,
    financeAggregates: profile.financeAggregates.map((aggregate) => ({ ...aggregate, includedCommitteeCount: aggregate.committeeInputs.filter((input) => input.kind === "included").length, missingCommitteeCount: aggregate.committeeInputs.filter((input) => input.kind === "missing").length })),
    fundingCategoryAggregates: profile.fundingCategoryAggregates,
    fundingOrganizationAggregates: profile.fundingOrganizationAggregates,
    outsideSpendingAggregates: profile.outsideSpendingAggregates,
    committeeAssignments,
    finance: profile.finance,
    biography: {
      bioguideId: fact("bioguide_id"), birthDate: fact("birth_date"), facts: profile.biographicalFacts,
      memberCoverage: profile.memberCoverage,
      committeeAssignmentsNote: committeeAssignments.length > 0 ? "Assignments are published from the release-pinned Congress Legislators roster; effective dates reflect the 119th Congress term used by this release." : "Unavailable — no assignment is published; the roster either reports none or does not provide authoritative effective dates.",
    },
    sourceClosure: { sources: profile.sources, snapshots: profile.snapshots },
  };
}

export function compileSourcesPage(releaseValue: DataRelease, sources: readonly Source[], snapshots: readonly SourceSnapshot[], coverage: readonly ReleaseCoverageAggregate[] = []): SourcesPageViewModel {
  const snapshotsById = new Map<string, SourceSnapshot>();
  for (const snapshot of snapshots) {
    const existing = snapshotsById.get(snapshot.id);
    if (existing && !sameSnapshot(existing, snapshot)) throw new Error(`Conflicting source snapshot id: ${snapshot.id}`);
    snapshotsById.set(snapshot.id, snapshot);
  }
  const uniqueSnapshots = [...snapshotsById.values()].sort((left, right) => byteCompare(left.id, right.id));
  return { release: release(releaseValue), snapshotScope: "This inventory lists every snapshot in the active release. A source can appear with no snapshots.", coverage: [...coverage], sources: [...sources].sort((left, right) => byteCompare(String(left.id), String(right.id))).map((source) => ({ source, snapshots: uniqueSnapshots.filter((snapshot) => snapshot.sourceId === source.id) })) };
}

export function compileMethodologyPage(releaseValue: DataRelease): MethodologyPageViewModel {
  return { release: release(releaseValue), sections: [
    { topic: "Election status", explanation: "Certified results are distinct from unavailable results and from modeled results. Unavailable values are not defensibly modeled." },
    { topic: "ACS uncertainty", explanation: "ACS observations retain the variable, label, estimate, margin of error, unit, survey period, universe, and lineage." },
    { topic: "FEC filings", explanation: "FEC summaries preserve reporting periods, filing dates, and amendments and use the release source cutoff; not every profile has a filing, and summaries are not real-time balances." },
    { topic: "Release identity", explanation: "Each page identifies its release and source cutoff. Sources retain snapshots, retrieval metadata, licenses, and usage status." },
    { topic: "Demographics and rankings", explanation: "Demographics are display-only. They cannot filter, order, subset, export, or rank seats. No rankings or evidence publication are included in this release." },
    { topic: "Address privacy and deployment", explanation: "Addresses are not retained; the Census Geocoder is an external processor. Public deployment is gated by the product release boundary." },
  ] };
}