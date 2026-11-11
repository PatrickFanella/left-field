import { describe, expect, it } from "vitest";
import { canonicalManifest } from "@/data/canonical-manifest";
import { seatProfileSchema, seatQuerySchema } from "@/domain/repository";
import type { SeatResearchRepository } from "@/domain/repository";
import { InMemorySeatResearchRepository } from "@/repositories/in-memory";
import { createManifestSeatProjection } from "@/repositories/manifest-projection";
import { encodeSeatCursor } from "@/repositories/pagination";
import { nationwideSkeleton } from "@/test/fixtures/nationwide-skeleton";
import { classifyProfileLookup, classifyProfileRequest, compileBrowsePage, compileMethodologyPage, compileProfilePage, compileSourcesPage, loadBrowsePage, loadMethodologyPage, loadProfilePage, loadSourcesPage, parseBrowseQuery } from "./server-data";

describe("UI data boundary", () => {
  const projection = createManifestSeatProjection(canonicalManifest);
  it("preserves list metric missingness and explicit no-ranking disclosure", () => {
    const rows = projection.list(seatQuerySchema.parse({})); const model = compileBrowsePage(canonicalManifest.release, { releaseId: canonicalManifest.release.id, items: [...rows], total: rows.length, nextCursor: null }, seatQuerySchema.parse({}), projection.facets());
    expect(model.rows.find((row) => row.stateCode === "AL")?.presidentialMargin2024.value).toEqual({ kind: "missing", reason: "not_defensibly_modeled" });
    expect(model.disclosure.rankings).toContain("Priority Index");
  });
  it("keeps unavailable election status and complete profile source closure", () => {
    const profile = projection.profile(canonicalManifest.profileSeatCycleIds[1]!); const seat = projection.list(seatQuerySchema.parse({})).find((row) => row.id === profile?.seatCycle.id); if (!profile || !seat) throw new Error("fixture missing"); const model = compileProfilePage(profile, seat);
    expect(model.elections.some((election) => election.certificationStatus === "unavailable")).toBe(true);
    expect(model.sourceClosure.snapshots.length).toBeGreaterThan(0); expect(model.sourceClosure.sources.length).toBeGreaterThan(0);
  });
  it("preserves the explicit ACS incompatible-geography state without changing display-only data", () => {
    const profile = projection.profile(canonicalManifest.profileSeatCycleIds[0]!); const seat = projection.list(seatQuerySchema.parse({})).find((row) => row.id === profile?.seatCycle.id); if (!profile || !seat) throw new Error("fixture missing");
    const model = compileProfilePage({ ...profile, demographics: [], acsAvailability: { kind: "incompatible_geography" }, acsCoverage: [] }, seat);
    expect(model.acsAvailability).toEqual({ kind: "incompatible_geography" });
    expect(Object.keys(model)).not.toContain("demographicFilters");
  });
  it("keeps v1 biography finite and makes no committee, age, or tenure claim", () => {
    const profile = projection.profile(canonicalManifest.profileSeatCycleIds[0]!); const seat = projection.list(seatQuerySchema.parse({})).find((row) => row.id === profile?.seatCycle.id); if (!profile || !seat) throw new Error("fixture missing"); const model = compileProfilePage(profile, seat);
    expect(model.biography).toMatchObject({ bioguideId: null, birthDate: null, facts: [], memberCoverage: null });
    expect(model.biography.committeeAssignmentsNote).toContain("authoritative effective dates");
    expect(Object.keys(model.biography)).not.toContain("age"); expect(Object.keys(model.biography)).not.toContain("tenure");
  });
  it("uses the persisted jurisdiction policy for Senate representation while retaining office kind", () => {
    const profile = projection.profile(canonicalManifest.profileSeatCycleIds[0]!); const seat = profile && projection.list(seatQuerySchema.parse({})).find((row) => row.id === profile.seatCycle.id); if (!profile || !seat) throw new Error("fixture missing");
    const model = compileProfilePage({ ...profile, office: { ...profile.office, kind: "resident_commissioner" }, jurisdiction: { jurisdictionCode: profile.office.stateCode, houseRepresentation: "resident_commissioner", senateRepresentation: "none", source: "persisted" } }, seat);
    expect(model.identity.officeKind).toBe("resident_commissioner");
    expect(model.identity.jurisdictionPolicy).toEqual({ senateRepresentation: "none", source: "persisted" });
  });
  it("preserves result options, values, contest context, and exact lineages", () => {
    const profile = canonicalManifest.profileSeatCycleIds.map((id) => projection.profile(id)).find((item) => item?.resultOptions.some((option) => option.candidacyId !== null)); if (!profile) throw new Error("fixture missing"); const seat = projection.list(seatQuerySchema.parse({})).find((row) => row.id === profile.seatCycle.id); const result = profile.electionResults.find((item) => profile.resultOptions.find((option) => option.id === item.resultOptionId)?.candidacyId !== null); if (!seat || !result) throw new Error("fixture missing"); const option = profile.resultOptions.find((item) => item.id === result.resultOptionId)!; const candidacy = profile.candidacies.find((item) => item.id === option.candidacyId)!; const contest = profile.contests.find((item) => item.id === result.contestId)!; const model = compileProfilePage(profile, seat); const row = model.electionResults.find((item) => item.resultOptionId === option.id)!;
    expect(row).toMatchObject({ label: option.label, party: option.party, votes: result.votes, denominatorVotes: contest.denominatorVotes, certificationStatus: contest.certificationStatus, reportingCompletenessPercent: contest.reportingCompletenessPercent, allocationMethod: contest.allocationMethod, lineage: result.lineage });
    expect(row.provenance).toEqual(option.provenance);
    expect(row.candidacyParty).toBe(candidacy.party);
  });
  it("preserves browse headline missing finance and presidential facts", () => {
    const seat = projection.list(seatQuerySchema.parse({})).find((row) => row.presidentialMargin2024.value.kind === "missing" && row.cashOnHand.kind === "missing"); const profile = seat ? projection.profile(seat.id) : null; if (!profile || !seat) throw new Error("fixture missing"); const model = compileProfilePage(profile, seat);
    expect(model.headlineFacts).toEqual({ presidentialMargin2024: seat.presidentialMargin2024, cashOnHand: seat.cashOnHand });
    expect(model.headlineFacts.presidentialMargin2024.value).toEqual({ kind: "missing", reason: "not_defensibly_modeled" });
    expect(model.headlineFacts.cashOnHand.kind).toBe("missing");
  });
  it("carries explicit finance summary coverage without inventing finance values", () => {
    const profile = projection.profile(canonicalManifest.profileSeatCycleIds[0]!); const seat = profile && projection.list(seatQuerySchema.parse({})).find((row) => row.id === profile.seatCycle.id); if (!profile || !seat) throw new Error("fixture missing");
    const financeCoverage = { releaseId: profile.release.id, domain: "finance" as const, scope: { kind: "funding" as const, seatCycleId: profile.seatCycle.id, fundingKind: "summary" as const }, status: "not_collected" as const, expectedCount: 1, observedCount: 0, missingByReason: [{ reason: "not_collected" as const, count: 1 }], quarantinedCount: 0, incompatibleCount: 0, inputSnapshotIds: [profile.snapshots[0]!.id] };
    const model = compileProfilePage({ ...profile, finance: [], financeCoverage }, seat);
    expect(model.financeAvailability).toMatchObject({ ...financeCoverage, evidence: [{ id: profile.snapshots[0]!.id, sourceUrl: profile.snapshots[0]!.sourceUrl }] });
    expect(model.finance).toEqual([]);
    const mismatched = { ...profile, finance: [], financeCoverage: { ...financeCoverage, scope: { ...financeCoverage.scope, seatCycleId: "seat_other" as never } } };
    expect(compileProfilePage(mismatched, seat).financeAvailability).toBeNull();
    expect(() => seatProfileSchema.parse(mismatched)).toThrow(/match the profile seat cycle/);
    const otherReleaseId = "rel_other" as never;
    const mixedRelease = { ...profile, finance: [], financeCoverage: { ...financeCoverage, releaseId: otherReleaseId }, snapshots: profile.snapshots.map((snapshot, index) => index === 0 ? { ...snapshot, releaseId: otherReleaseId } : snapshot), sources: profile.sources.map((source) => source.id === profile.snapshots[0]!.sourceId ? { ...source, releaseId: otherReleaseId } : source) };
    expect(compileProfilePage(mixedRelease, seat).financeAvailability).toBeNull();
    expect(() => seatProfileSchema.parse(mixedRelease)).toThrow(/match the profile release/);
    const mixedEvidence = { ...profile, finance: [], financeCoverage, snapshots: profile.snapshots.map((snapshot, index) => index === 0 ? { ...snapshot, releaseId: otherReleaseId } : snapshot), sources: profile.sources.map((source) => source.id === profile.snapshots[0]!.sourceId ? { ...source, releaseId: otherReleaseId } : source) };
    expect(compileProfilePage(mixedEvidence, seat).financeAvailability?.evidence).toEqual([]);
  });
  it("preserves jurisdiction election decisions and distinguishes their stated statuses", () => {
    const profile = projection.profile(canonicalManifest.profileSeatCycleIds[0]!); const seat = profile && projection.list(seatQuerySchema.parse({})).find((row) => row.id === profile.seatCycle.id); if (!profile || !seat) throw new Error("fixture missing");
    const snapshotId = profile.snapshots[0]!.id;
    const coverage = (year: 2020 | 2022 | 2024, status: "not_collected" | "unavailable" | "complete", reason: "not_collected" | "not_defensibly_modeled" | null) => ({ releaseId: profile.release.id, domain: `election_${year}` as const, scope: { kind: "election" as const, jurisdictionCode: profile.office.stateCode, electionYear: year }, status, expectedCount: 1, observedCount: status === "complete" ? 1 : 0, missingByReason: reason ? [{ reason, count: 1 }] : [], quarantinedCount: 0, incompatibleCount: 0, inputSnapshotIds: [snapshotId] });
    const enriched = { ...profile, electionDecisions: [{ id: "decision_2020", releaseId: profile.release.id, jurisdictionCode: profile.office.stateCode, electionYear: 2020, status: "unassessed" as const, inputSnapshotIds: [] }, { id: "decision_2022", releaseId: profile.release.id, jurisdictionCode: profile.office.stateCode, electionYear: 2022, status: "unavailable" as const, inputSnapshotIds: [snapshotId] }, { id: "decision_2024", releaseId: profile.release.id, jurisdictionCode: profile.office.stateCode, electionYear: 2024, status: "approved" as const, inputSnapshotIds: [snapshotId] }], electionCoverage: [coverage(2020, "not_collected", "not_collected"), coverage(2022, "unavailable", "not_defensibly_modeled"), coverage(2024, "complete", null)] };
    const model = compileProfilePage(seatProfileSchema.parse(enriched), seat);
    expect(model.electionDecisions.map((item) => item.status)).toEqual(["unassessed", "unavailable", "approved"]);
    expect(model.electionDecisions.map((item) => item.jurisdictionCode)).toEqual(Array(3).fill(profile.office.stateCode));
    expect(model.electionDecisions[1]).toMatchObject({ coverage: { scope: { jurisdictionCode: profile.office.stateCode, electionYear: 2022 } }, evidence: [{ id: snapshotId, sourceUrl: profile.snapshots[0]!.sourceUrl }] });
    expect(model.electionDecisions[0]!.evidence).toEqual([]);
    const restricted = { ...enriched, snapshots: enriched.snapshots.map((snapshot) => snapshot.id === snapshotId ? { ...snapshot, usageStatus: "review_required" as const } : snapshot) };
    expect(compileProfilePage(seatProfileSchema.parse(restricted), seat).electionDecisions[1]!.evidence).toEqual([]);
    expect(() => seatProfileSchema.parse({ ...enriched, electionCoverage: enriched.electionCoverage.slice(1) })).toThrow(/close over the same years/);
  });
  it("associates source snapshots without inventing a source", () => {
    const model = compileSourcesPage(canonicalManifest.release, canonicalManifest.sources, projection.snapshots());
    expect(model.sources.every(({ source, snapshots }) => snapshots.every((snapshot) => snapshot.sourceId === source.id))).toBe(true);
    expect(model.snapshotScope).toContain("every snapshot in the active release");
    expect(model.sources.flatMap(({ snapshots }) => snapshots)).toHaveLength(projection.snapshots().length);
  });
  it("exposes homogeneous release coverage groups without source fanout", () => {
    const coverage = projection.coverage();
    const model = compileSourcesPage(canonicalManifest.release, canonicalManifest.sources, projection.snapshots(), coverage);
    expect(model.coverage).toEqual(coverage);
    expect(model.coverage.every((group) => group.recordCount > 0 && group.inputSnapshotCount >= 0)).toBe(true);
  });
  it("aggregates coverage using only approved scope discriminators", () => {
    const base = nationwideSkeleton();
    const finance = base.coverageRecords.find((record) => record.domain === "finance" && record.scope.kind === "funding" && record.scope.fundingKind === "summary")!;
    const election = base.coverageRecords.find((record) => record.scope.kind === "election")!;
    if (election.scope.kind !== "election") throw new Error("fixture missing election coverage");
    const electionYear = election.scope.electionYear;
    const manifest = { ...base, coverageRecords: [...base.coverageRecords, { ...finance, scope: { ...finance.scope, seatCycleId: "seat_other" as never } }, { ...election, scope: { ...election.scope, jurisdictionCode: "AK" } }] };
    const original = createManifestSeatProjection(base as never).coverage();
    const coverage = createManifestSeatProjection(manifest as never).coverage();
    const count = (rows: typeof coverage, predicate: (row: typeof coverage[number]) => boolean) => rows.find(predicate)?.recordCount;
    const financeGroup = (row: typeof coverage[number]) => row.domain === "finance" && row.scope.kind === "funding" && row.scope.fundingKind === "summary" && row.status === finance.status;
    const electionGroup = (row: typeof coverage[number]) => row.domain === election.domain && row.scope.kind === "election" && row.scope.electionYear === electionYear && row.status === election.status;
    expect(count(coverage, financeGroup)).toBe(count(original, financeGroup)! + 1);
    expect(count(coverage, electionGroup)).toBe(count(original, electionGroup)! + 1);
    expect(coverage.every((row) => !("seatCycleId" in row.scope) && !("jurisdictionCode" in row.scope))).toBe(true);
  });
  it("deduplicates exact source snapshots and orders the sources closure bytewise", () => {
    const snapshots = projection.snapshots(); const snapshot = snapshots[0]!;
    const model = compileSourcesPage(canonicalManifest.release, [...canonicalManifest.sources].reverse(), [...snapshots, { ...snapshot }]);
    expect(model.sources.map(({ source }) => source.id)).toEqual([...canonicalManifest.sources.map((source) => source.id)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
    expect(model.sources.flatMap(({ snapshots }) => snapshots).filter((item) => item.id === snapshot.id)).toHaveLength(1);
    expect(model.sources.flatMap(({ snapshots }) => snapshots).map((item) => item.id)).toEqual([...new Set(snapshots.map((item) => item.id))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
  });
  it("rejects conflicting source snapshots with the same id", () => {
    const snapshot = projection.snapshots()[0]!;
    expect(() => compileSourcesPage(canonicalManifest.release, canonicalManifest.sources, [snapshot, { ...snapshot, sourceUrl: "https://example.com/conflict" }])).toThrow(`Conflicting source snapshot id: ${snapshot.id}`);
  });
  it("rejects demographic and unknown URL query keys", () => {
    expect(parseBrowseQuery({ medianHouseholdIncome: "1" })).toEqual({ ok: false, code: "invalid_request" });
    expect(parseBrowseQuery({ nope: "x" })).toEqual({ ok: false, code: "invalid_request" });
    expect(parseBrowseQuery({ stateCode: ["AL", "CA"] })).toEqual({ ok: false, code: "invalid_request" });
    expect(parseBrowseQuery({ stateCode: "AL", electionYear: "2026" })).toEqual({ ok: true, value: expect.objectContaining({ stateCode: "AL", electionYear: 2026, limit: 50 }) });
  });
  it("normalizes empty values from partial and default browse form submissions", () => {
    expect(parseBrowseQuery({ identitySearch: "Ada", chamber: "", stateCode: "", party: "democratic", incumbencyStatus: "", electionYear: "", sort: "", direction: "" })).toEqual({ ok: true, value: { identitySearch: "Ada", party: "democratic", sort: "state", direction: "asc", limit: 50 } });
    expect(parseBrowseQuery({ identitySearch: "", chamber: "", stateCode: "", party: "", incumbencyStatus: "", electionYear: "", sort: "", direction: "" })).toEqual({ ok: true, value: { sort: "state", direction: "asc", limit: 50 } });
  });
  it("classifies malformed and absent profile requests with finite public errors", () => {
    expect(classifyProfileRequest(canonicalManifest.release.id, { id: "bad" })).toEqual({ ok: false, code: "invalid_request" });
    expect(classifyProfileRequest(canonicalManifest.release.id, { id: "seat_missing" })).toEqual({ ok: true, value: { id: "seat_missing" } });
    expect(classifyProfileLookup(null)).toEqual({ ok: false, code: "not_found" });
  });
  it("uses methodology wording supported by the ACS and finance contracts", () => {
    const methodology = compileMethodologyPage(canonicalManifest.release);
    expect(methodology.sections.find((section) => section.topic === "ACS uncertainty")?.explanation).not.toContain("methodology, status");
    expect(methodology.sections.find((section) => section.topic === "FEC filings")?.explanation).toContain("not every profile has a filing");
  });
  it("loads browse with one page and facet request, never legacy listSeats", async () => {
    const { repo, calls } = recordingRepository(); const result = await loadBrowsePage({ stateCode: "AL" }, repo);
    expect(result).toMatchObject({ ok: true, value: { total: 3, nextCursor: null, appliedQuery: { stateCode: "AL", sort: "state", direction: "asc" }, available: { states: projection.facets().states } } });
    expect(calls).toEqual(["getActiveRelease", "listSeatPage", "getSeatFacets"]);
  });
  it("accepts opaque cursors and leaves cursor mismatch validation to the repository", async () => {
    const { repo, calls } = recordingRepository(); const cursor = encodeSeatCursor({ v: 1, releaseId: canonicalManifest.release.id, query: seatQuerySchema.parse({ stateCode: "CA" }), missing: false, sortValue: "CA", id: "seat_ca_sen_2026" });
    expect(parseBrowseQuery({ cursor })).toMatchObject({ ok: true, value: { cursor, limit: 50 } });
    await expect(loadBrowsePage({ stateCode: "AL", cursor }, repo)).resolves.toEqual({ ok: false, code: "unavailable" });
    expect(calls).toEqual(["getActiveRelease", "listSeatPage", "getSeatFacets"]);
  });
  it("loads a profile by direct profile and list-item lookup", async () => {
    const { repo, calls } = recordingRepository(); const id = canonicalManifest.profileSeatCycleIds[0]!;
    await expect(loadProfilePage({ id }, repo)).resolves.toMatchObject({ ok: true, value: { identity: { id } } });
    expect(calls).toEqual(["getActiveRelease", "getSeatProfile", "getSeatListItem"]);
  });
  it("loads the full active-release source snapshot inventory without seat fanout", async () => {
    const { repo, calls } = recordingRepository(); const result = await loadSourcesPage(repo);
    expect(result).toMatchObject({ ok: true, value: { snapshotScope: expect.stringContaining("every snapshot in the active release") } });
    expect(calls).toEqual(["getActiveRelease", "listSources", "listSourceSnapshots", "listReleaseCoverage"]);
  });
  it("loads methodology with only the active-release repository call", async () => {
    const { repo, calls } = recordingRepository();
    await expect(loadMethodologyPage(repo)).resolves.toMatchObject({ ok: true, value: { release: { id: canonicalManifest.release.id } } });
    expect(calls).toEqual(["getActiveRelease"]);
  });
});

function recordingRepository(): { repo: SeatResearchRepository; calls: string[] } {
  const memory = new InMemorySeatResearchRepository(canonicalManifest); const calls: string[] = [];
  const repo: SeatResearchRepository = {
    getActiveRelease: async () => { calls.push("getActiveRelease"); return memory.getActiveRelease(); },
    getRelease: async (id) => memory.getRelease(id),
    listSeats: async (id, query) => { calls.push("listSeats"); return memory.listSeats(id, query); },
    listSeatPage: async (id, request) => { calls.push("listSeatPage"); return memory.listSeatPage(id, request); },
    getSeatListItem: async (id, seatId) => { calls.push("getSeatListItem"); return memory.getSeatListItem(id, seatId); },
    getSeatProfile: async (id, seatId) => { calls.push("getSeatProfile"); return memory.getSeatProfile(id, seatId); },
    getSeatFacets: async (id) => { calls.push("getSeatFacets"); return memory.getSeatFacets(id); },
    listSources: async (id) => { calls.push("listSources"); return memory.listSources(id); },
    listSourceSnapshots: async (id) => { calls.push("listSourceSnapshots"); return memory.listSourceSnapshots(id); },
    listReleaseCoverage: async (id) => { calls.push("listReleaseCoverage"); return memory.listReleaseCoverage(id); },
  };
  return { repo, calls };
}
