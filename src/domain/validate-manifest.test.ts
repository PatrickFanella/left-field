import { describe, expect, it } from "vitest";

import { computeCanonicalDataChecksum, electionDecisionCoverageIsCoherent, validatePrototypeManifest, validateReleaseManifest } from "./validate-manifest";
import { parseReleaseManifest } from "./manifest";
import { checksum, coherentManifest, lineage, provenance } from "@/test/fixtures/prototype-manifest";
import { nationwideSkeleton } from "@/test/fixtures/nationwide-skeleton";

function withChecksum<T extends { canonicalDataChecksumSha256: string }>(manifest: T): T {
  manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest as never);
  return manifest;
}


function expectIssue(input: ReturnType<typeof coherentManifest>, message: string, recompute = true) {
  if (recompute) withChecksum(input);
  const result = validatePrototypeManifest(input);
  expect(result.success).toBe(false);
  if (!result.success) expect(result.issues.some((issue) => issue.message === message)).toBe(true);
}

describe("election decision coverage contract", () => {
  const record = (status: string, observedCount: number, reason: string, expectedCount = 1, quarantinedCount = 0, incompatibleCount = 0) => ({ status, expectedCount, observedCount, missingByReason: reason ? [{ reason, count: expectedCount }] : [], quarantinedCount, incompatibleCount });
  it("derives the only valid coverage status for each decision", () => {
    expect(electionDecisionCoverageIsCoherent("unassessed", record("not_collected", 0, "not_collected"))).toBe(true);
    expect(electionDecisionCoverageIsCoherent("unavailable", record("unavailable", 0, "not_defensibly_modeled"))).toBe(true);
    expect(electionDecisionCoverageIsCoherent("approved", record("complete", 1, ""))).toBe(true);
    expect(electionDecisionCoverageIsCoherent("approved", record("not_collected", 0, "not_collected"))).toBe(false);
    expect(electionDecisionCoverageIsCoherent("unavailable", record("unavailable", 0, "not_collected"))).toBe(false);
    expect(electionDecisionCoverageIsCoherent("unassessed", record("not_collected", 0, "not_collected", 2))).toBe(false);
    expect(electionDecisionCoverageIsCoherent("unavailable", record("unavailable", 0, "not_defensibly_modeled", 1, 1))).toBe(false);
    expect(electionDecisionCoverageIsCoherent("approved", record("complete", 1, "", 1, 0, 1))).toBe(false);
  });
});

describe("validatePrototypeManifest", () => {
  it("accepts a generated coherent manifest with ten House profiles and Senate pairs", () => {
    const manifest = coherentManifest();
    expect(manifest.canonicalDataChecksumSha256).toBe(computeCanonicalDataChecksum(manifest as never));
    expect(validatePrototypeManifest(manifest).success).toBe(true);
  });

  it("pins the v1 checksum of the unchanged coherent prototype fixture", () => {
    expect(computeCanonicalDataChecksum(coherentManifest())).toBe("110ae86e6c8b8e808aca38495c2a5d94fe37674cf4835b3f52b35f97d85239dc");
  });

  it("canonicalizes set-like collections, provenance, and lineage independently of order", () => {
    const manifest = coherentManifest();
    manifest.contests[0].provenance.push({ snapshotId: "snap_1" as never, role: "derived_input" });
    manifest.contests[0].lineage.inputs.push({ snapshotId: "snap_1" as never, role: "derived_input" });
    const checksumBefore = computeCanonicalDataChecksum(manifest);
    manifest.sources.reverse();
    manifest.districtPlans.reverse();
    manifest.contests[0].provenance = [...manifest.contests[0].provenance].reverse();
    manifest.contests[0].lineage.inputs = [...manifest.contests[0].lineage.inputs].reverse();
    expect(computeCanonicalDataChecksum(manifest)).toBe(checksumBefore);
  });

  it("preserves profile seat order in the canonical checksum", () => {
    const manifest = coherentManifest();
    const checksumBefore = computeCanonicalDataChecksum(manifest);
    [manifest.profileSeatCycleIds[0], manifest.profileSeatCycleIds[1]] = [manifest.profileSeatCycleIds[1]!, manifest.profileSeatCycleIds[0]!];
    expect(computeCanonicalDataChecksum(manifest)).not.toBe(checksumBefore);
  });

  it("excludes release lifecycle fields and normalizes timestamp offsets", () => {
    const manifest = coherentManifest();
    const checksumBefore = computeCanonicalDataChecksum(manifest);
    manifest.release.status = "published";
    manifest.release.publishedAt = "2025-01-01T00:00:00.000Z";
    manifest.release.previousReleaseId = "previous" as never;
    expect(computeCanonicalDataChecksum(manifest)).toBe(checksumBefore);
    const offset = coherentManifest();
    offset.release.createdAt = "2024-01-01T01:00:00+01:00";
    const utc = coherentManifest();
    utc.release.createdAt = "2024-01-01T00:00:00.000Z";
    expect(computeCanonicalDataChecksum(offset)).toBe(computeCanonicalDataChecksum(utc));
  });

  it("requires ten unique House profile cycles, a Senate pair, and profile facts", () => {
    const short = coherentManifest(); short.profileSeatCycleIds.pop(); expectIssue(short, "Too small: expected array to have >=10 items");
    const duplicate = coherentManifest(); duplicate.profileSeatCycleIds[9] = duplicate.profileSeatCycleIds[0]; expectIssue(duplicate, "Profile seat-cycle IDs must be unique");
    const senate = coherentManifest(); senate.seatCycles.pop(); expectIssue(senate, "State AZ requires two distinct current Senate classes");
    const election = coherentManifest(); election.electionResults = election.electionResults.slice(1); expectIssue(election, "Profile requires one explicit 2024 presidential result");
    const acs = coherentManifest(); acs.acsObservations = acs.acsObservations.slice(1); expectIssue(acs, "Profile requires an ACS observation or explicit missing observation");
    const finance = coherentManifest(); finance.financeSummaries.pop(); expectIssue(finance, "Profile requires exactly one finance summary");
  });

  it("enforces deterministic address-selection geography and profile-term invariants", () => {
    const duplicateProfileGeography = coherentManifest(); duplicateProfileGeography.seatCycles[1].geographyVersionId = duplicateProfileGeography.seatCycles[0].geographyVersionId; expectIssue(duplicateProfileGeography, "Profile cycles must have unique House geographies");
    const nonCoveringProfileTerm = coherentManifest(); nonCoveringProfileTerm.officeTerms[0].endsAt = "2024-01-01"; expectIssue(nonCoveringProfileTerm, "Profile office term must cover the release source cutoff");
    const mixedProfileVintages = coherentManifest(); mixedProfileVintages.geographyVersions[0].vintage = "2023"; expectIssue(mixedProfileVintages, "Profile House geographies must share one nonempty vintage");
    const missingStateGeography = coherentManifest(); missingStateGeography.geographyVersions = missingStateGeography.geographyVersions.filter((geography) => geography.id !== "geo_state_1"); expectIssue(missingStateGeography, "State CA requires exactly one state geography at the product vintage");
    const duplicateStateGeography = coherentManifest(); duplicateStateGeography.geographyVersions.push({ ...duplicateStateGeography.geographyVersions[10], id: "geo_state_duplicate" } as never); expectIssue(duplicateStateGeography, "State CA requires exactly one state geography at the product vintage");
    const wrongVintageStateGeography = coherentManifest(); wrongVintageStateGeography.geographyVersions[10].vintage = "2023"; expectIssue(wrongVintageStateGeography, "State CA requires exactly one state geography at the product vintage");
  });

  it("selects exactly two cutoff-covering Senate candidates while allowing non-covering cycles", () => {
    const oneActive = coherentManifest(); oneActive.seatCycles = oneActive.seatCycles.filter((cycle) => cycle.id !== "seat_senate_1_2"); expectIssue(oneActive, "State CA requires two distinct current Senate classes");
    const threeActive = coherentManifest();
    threeActive.offices.push({ ...threeActive.offices[10], id: "office_senate_extra", senateClass: 3 } as never);
    threeActive.officeTerms.push({ ...threeActive.officeTerms[10], id: "term_senate_extra", officeId: "office_senate_extra" } as never);
    threeActive.seatCycles.push({ ...threeActive.seatCycles[10], id: "seat_senate_extra", officeId: "office_senate_extra", officeTermId: "term_senate_extra", cycleYear: 2025 } as never);
    expectIssue(threeActive, "State CA requires two distinct current Senate classes");
    const duplicateActive = coherentManifest(); duplicateActive.seatCycles.push({ ...duplicateActive.seatCycles[10], id: "seat_senate_duplicate", cycleYear: 2025 } as never); expectIssue(duplicateActive, "State CA requires two distinct current Senate classes");

    const nonCovering = coherentManifest();
    nonCovering.offices.push({ ...nonCovering.offices[10], id: "office_senate_historical", senateClass: 3 } as never);
    nonCovering.officeTerms.push({ ...nonCovering.officeTerms[10], id: "term_senate_historical", officeId: "office_senate_historical", startsAt: "2015-01-03", endsAt: "2017-01-03" } as never);
    nonCovering.seatCycles.push({ ...nonCovering.seatCycles[10], id: "seat_senate_historical", officeId: "office_senate_historical", officeTermId: "term_senate_historical", cycleYear: 2016, electionDate: "2016-11-08", occupancy: { status: "unknown", asOf: "2016-01-01" } } as never);
    nonCovering.officeTerms.push({ ...nonCovering.officeTerms[10], id: "term_senate_future", officeId: "office_senate_historical", startsAt: "2025-01-03", endsAt: "2027-01-03" } as never);
    nonCovering.seatCycles.push({ ...nonCovering.seatCycles[10], id: "seat_senate_future", officeId: "office_senate_historical", officeTermId: "term_senate_future", cycleYear: 2026, electionDate: "2026-11-03", occupancy: { status: "unknown", asOf: "2024-01-01" } } as never);
    expect(validatePrototypeManifest(withChecksum(nonCovering)).success).toBe(true);
  });

  it("validates relational identity, occupancy, and finance-summary references", () => {
    const nonHouse = coherentManifest(); nonHouse.profileSeatCycleIds[0] = "seat_senate_1_1" as never; expectIssue(nonHouse, "Profile must reference a House seat cycle");
    const bioguide = coherentManifest(); bioguide.people[0].bioguideId = "X1"; bioguide.people[1].bioguideId = "X1"; expectIssue(bioguide, "Duplicate Bioguide ID");
    const terms = coherentManifest(); terms.officeTerms.push({ ...terms.officeTerms[0], id: "term_overlap", endsAt: "2024-01-04" } as never); expectIssue(terms, "Overlapping office terms");
    const memberships = coherentManifest(); memberships.memberships.push({ id: "member_1", releaseId: "rel_1", provenance, officeTermId: "term_house_1", personId: "person_1", party: "democratic", startsAt: "2023-01-03", endsAt: "2024-01-03" } as never, { id: "member_2", releaseId: "rel_1", provenance, officeTermId: "term_house_1", personId: "person_2", party: "democratic", startsAt: "2023-06-01", endsAt: "2024-01-03" } as never); expectIssue(memberships, "Overlapping memberships");
    const occupancy = coherentManifest(); occupancy.seatCycles[0].occupancy.status = "occupied"; expectIssue(occupancy, "Occupied seat must have exactly one active membership");
    const postCutoff = coherentManifest(); postCutoff.seatCycles[0].occupancy.asOf = "2024-01-02"; expectIssue(postCutoff, "Occupancy date is after release source cutoff");
    const outsideOccupiedTerm = coherentManifest(); outsideOccupiedTerm.seatCycles[0].occupancy = { status: "vacant", asOf: "2025-01-03" }; expectIssue(outsideOccupiedTerm, "Occupancy date falls outside office term");
    const unknownOutsideTerm = coherentManifest(); unknownOutsideTerm.seatCycles[0].occupancy = { status: "unknown", asOf: "2023-01-02" }; expect(validatePrototypeManifest(withChecksum(unknownOutsideTerm)).success).toBe(true);
    const finance = coherentManifest(); finance.financeSummaries[0] = { kind: "value", releaseId: "rel_1", seatCycleId: "seat_house_1", filingId: "fec_missing" } as never; expectIssue(finance, "Unknown finance filing");
  });

  it("rejects district plans with duplicate persisted natural keys", () => {
    const manifest = coherentManifest();
    manifest.districtPlans.push({ ...manifest.districtPlans[0]!, id: "plan_duplicate" } as never);
    expectIssue(manifest, "Duplicate district-plan natural key");
  });

  it("rejects value finance summaries that reference another cycle or a superseded filing", () => {
    const anotherCycle = coherentManifest(); anotherCycle.committees.push({ id: "committee_1", releaseId: "rel_1", provenance, sourceCommitteeId: "C1", name: "Committee", committeeType: "principal" } as never); anotherCycle.committeeRelationships.push({ id: "committee_rel_1", releaseId: "rel_1", provenance, committeeId: "committee_1", candidacyId: "candidacy_2", relationship: "authorized", effectiveFrom: "2024-01-01", effectiveTo: null } as never); anotherCycle.fecFilingSummaries.push({ id: "fec_1", releaseId: "rel_1", seatCycleId: "seat_house_2", committeeId: "committee_1", sourceFilingId: "F1", reportType: "Q1", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-01T00:00:00.000Z", amendmentNumber: 0, amendmentStatus: "new", amendsFilingId: null, cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never); anotherCycle.financeSummaries[0] = { kind: "value", releaseId: "rel_1", seatCycleId: "seat_house_1", filingId: "fec_1" } as never; expectIssue(anotherCycle, "Finance summary must reference the canonical filing for its seat cycle");

    const superseded = coherentManifest(); superseded.committees.push({ id: "committee_1", releaseId: "rel_1", provenance, sourceCommitteeId: "C1", name: "Committee", committeeType: "principal" } as never); superseded.committeeRelationships.push({ id: "committee_rel_1", releaseId: "rel_1", provenance, committeeId: "committee_1", candidacyId: "candidacy_1", relationship: "authorized", effectiveFrom: "2024-01-01", effectiveTo: null } as never); superseded.fecFilingSummaries.push({ id: "fec_1", releaseId: "rel_1", seatCycleId: "seat_house_1", committeeId: "committee_1", sourceFilingId: "F1", reportType: "Q1", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-01T00:00:00.000Z", amendmentNumber: 0, amendmentStatus: "superseded", amendsFilingId: null, cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never, { id: "fec_2", releaseId: "rel_1", seatCycleId: "seat_house_1", committeeId: "committee_1", sourceFilingId: "F2", reportType: "Q1", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-02T00:00:00.000Z", amendmentNumber: 1, amendmentStatus: "amended", amendsFilingId: "fec_1", cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never); superseded.financeSummaries[0] = { kind: "value", releaseId: "rel_1", seatCycleId: "seat_house_1", filingId: "fec_1" } as never; expectIssue(superseded, "Finance summary must reference the canonical filing for its seat cycle");
  });

  it("validates FEC seat attribution and amendment scope, time, and status", () => {
    const wrongSeat = coherentManifest(); wrongSeat.committees.push({ id: "committee_1", releaseId: "rel_1", provenance, sourceCommitteeId: "C1", name: "Committee", committeeType: "principal" } as never); wrongSeat.committeeRelationships.push({ id: "committee_rel_1", releaseId: "rel_1", provenance, committeeId: "committee_1", candidacyId: "candidacy_1", relationship: "authorized", effectiveFrom: "2024-01-01", effectiveTo: null } as never); wrongSeat.fecFilingSummaries.push({ id: "fec_1", releaseId: "rel_1", seatCycleId: "seat_house_2", committeeId: "committee_1", sourceFilingId: "F1", reportType: "Q1", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-01T00:00:00.000Z", amendmentNumber: 0, amendmentStatus: "new", amendsFilingId: null, cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never); expectIssue(wrongSeat, "Committee is not attributable to filing seat cycle");
    const amendment = coherentManifest(); amendment.committees.push({ id: "committee_1", releaseId: "rel_1", provenance, sourceCommitteeId: "C1", name: "Committee", committeeType: "principal" } as never); amendment.committeeRelationships.push({ id: "committee_rel_1", releaseId: "rel_1", provenance, committeeId: "committee_1", candidacyId: "candidacy_1", relationship: "authorized", effectiveFrom: "2024-01-01", effectiveTo: null } as never); amendment.fecFilingSummaries.push({ id: "fec_1", releaseId: "rel_1", seatCycleId: "seat_house_1", committeeId: "committee_1", sourceFilingId: "F1", reportType: "Q1", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-02T00:00:00.000Z", amendmentNumber: 0, amendmentStatus: "new", amendsFilingId: null, cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never, { id: "fec_2", releaseId: "rel_1", seatCycleId: "seat_house_1", committeeId: "committee_1", sourceFilingId: "F2", reportType: "Q2", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-01T00:00:00.000Z", amendmentNumber: 1, amendmentStatus: "amended", amendsFilingId: "fec_1", cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never); expectIssue(amendment, "Invalid amendment sequence or reporting scope"); expectIssue(amendment, "Amended predecessor must be superseded");
  });

  it("rejects independent FEC roots tied to one amendment sequence", () => {
    const duplicateRoots = coherentManifest();
    duplicateRoots.committees.push({ id: "committee_1", releaseId: "rel_1", provenance, sourceCommitteeId: "C1", name: "Committee", committeeType: "principal" } as never);
    duplicateRoots.committeeRelationships.push({ id: "committee_rel_1", releaseId: "rel_1", provenance, committeeId: "committee_1", candidacyId: "candidacy_1", relationship: "authorized", effectiveFrom: "2024-01-01", effectiveTo: null } as never);
    duplicateRoots.fecFilingSummaries.push(
      { id: "fec_root_1", releaseId: "rel_1", seatCycleId: "seat_house_1", committeeId: "committee_1", sourceFilingId: "source_filing_1", reportType: "Q1", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-01T00:00:00.000Z", amendmentNumber: 0, amendmentStatus: "new", amendsFilingId: null, cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never,
      { id: "fec_root_2", releaseId: "rel_1", seatCycleId: "seat_house_1", committeeId: "committee_1", sourceFilingId: "source_filing_2", reportType: "Q1", reportingPeriodStart: "2024-01-01", reportingPeriodEnd: "2024-03-31", filedAt: "2024-04-02T00:00:00.000Z", amendmentNumber: 0, amendmentStatus: "new", amendsFilingId: null, cashOnHand: { kind: "value", value: 1 }, totalReceipts: { kind: "value", value: 1 }, totalDisbursements: { kind: "value", value: 1 }, lineage } as never,
    );
    expectIssue(duplicateRoots, "Duplicate filing amendment sequence within reporting scope");
  });

  it("rejects incompatible election result totals and contest coherence", () => {
    const overflow = coherentManifest(); if (overflow.electionResults[0].votes.kind === "value") overflow.electionResults[0].votes.value = 2; expectIssue(overflow, "Result votes exceed contest denominator");
    const reconcile = coherentManifest(); if (reconcile.electionResults[0].votes.kind === "value") reconcile.electionResults[0].votes.value = 0; expectIssue(reconcile, "Complete contest results do not reconcile to denominator");
    const modeled = coherentManifest(); modeled.contests[0].certificationStatus = "modeled"; expectIssue(modeled, "Modeled contest requires modeled lineage and an allocation method");
    const certified = coherentManifest(); certified.contests[0].lineage = { ...lineage, status: "official" } as never; expectIssue(certified, "Certified contest requires certified lineage");
  });

  it("accepts explicit unavailable contests and rejects pseudo-modeled and invalid unavailable variants", () => {
    const unavailable = coherentManifest();
    unavailable.contests[0] = {
      ...unavailable.contests[0], certificationStatus: "unavailable", reportingCompletenessPercent: 0,
      denominatorVotes: { kind: "missing", reason: "not_defensibly_modeled" }, allocationMethod: "none",
      allocationCoveragePercent: { kind: "missing", reason: "not_applicable" }, lineage: { ...unavailable.contests[0].lineage, status: "reported" },
    };
    unavailable.electionResults[0] = { ...unavailable.electionResults[0], votes: { kind: "missing", reason: "not_defensibly_modeled" }, lineage: { ...unavailable.electionResults[0].lineage, status: "reported" } };
    expect(validatePrototypeManifest(withChecksum(unavailable)).success).toBe(true);

    const pseudoModeled = coherentManifest();
    pseudoModeled.contests[0] = {
      ...pseudoModeled.contests[0], certificationStatus: "modeled", reportingCompletenessPercent: 0,
      denominatorVotes: { kind: "missing", reason: "not_defensibly_modeled" }, allocationMethod: "other",
      allocationCoveragePercent: { kind: "missing", reason: "not_defensibly_modeled" }, lineage: { ...pseudoModeled.contests[0].lineage, status: "modeled" },
    };
    pseudoModeled.electionResults[0] = { ...pseudoModeled.electionResults[0], votes: { kind: "missing", reason: "not_defensibly_modeled" }, lineage: { ...pseudoModeled.electionResults[0].lineage, status: "modeled" } };
    expectIssue(pseudoModeled, "Modeled contest requires positive numeric allocation coverage");
    expectIssue(pseudoModeled, "Modeled contest requires at least one numeric result");

    const wrongCompleteness = structuredClone(unavailable); wrongCompleteness.contests[0].reportingCompletenessPercent = 1; expectIssue(wrongCompleteness, "Unavailable contest must use the explicit unavailable facts and results");
    const wrongAllocation = structuredClone(unavailable); wrongAllocation.contests[0].allocationMethod = "other"; expectIssue(wrongAllocation, "Unavailable contest must use the explicit unavailable facts and results");
    const numericResult = structuredClone(unavailable); numericResult.electionResults[0].votes = { kind: "value", value: 1 }; expectIssue(numericResult, "Unavailable contest must use the explicit unavailable facts and results");
  });

  it("rejects an otherwise valid manifest with a stale checksum", () => {
    const manifest = coherentManifest(); manifest.canonicalDataChecksumSha256 = checksum;
    expectIssue(manifest, "Canonical data checksum does not match manifest content", false);
  });
});

describe("nationwide manifest v2", () => {
  function expectV2Issue(input: ReturnType<typeof nationwideSkeleton>, message: string) {
    withChecksum(input);
    const result = validateReleaseManifest(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.message === message)).toBe(true);
  }
  it("dispatches v1 and validates the synthetic 541-office nationwide universe", () => {
    expect(parseReleaseManifest(coherentManifest()).schemaVersion).toBe(1);
    const manifest = nationwideSkeleton();
    expect(parseReleaseManifest(manifest).schemaVersion).toBe(2);
    expect(validateReleaseManifest(manifest).success).toBe(true);
  });

  it("counts member coverage only for matching current-person Bioguide facts", () => {
    const manifest = nationwideSkeleton();
    expect(validateReleaseManifest(withChecksum(manifest)).success).toBe(true);
    const conflicting = structuredClone(manifest); const id = conflicting.biographicalFacts.find((row) => row.fact === "bioguide_id")!; if (id.value.kind === "value") id.value.value = "B000000";
    expectV2Issue(conflicting, "Invalid coverage record");
  });

  it("allows published current members to remain explicitly not collected", () => {
    const manifest = nationwideSkeleton();
    manifest.release.status = "published";
    manifest.release.publishedAt = "2024-01-02T00:00:00.000Z";
    manifest.biographicalFacts = [];
    Object.assign(manifest.coverageRecords.find((record) => record.domain === "member")!, { status: "not_collected", expectedCount: 541, observedCount: 0, missingByReason: [{ reason: "not_collected", count: 541 }] });
    expect(validateReleaseManifest(withChecksum(manifest)).success).toBe(true);
  });

  it("rejects malformed Bioguide and impossible or post-cutoff birth dates while allowing missing DOB", () => {
    const malformed = nationwideSkeleton(); malformed.people[0]!.bioguideId = "bad"; expect(validateReleaseManifest(withChecksum(malformed)).success).toBe(false);
    for (const value of ["2024-02-30", "2024-01-02"] as const) {
      const manifest = nationwideSkeleton(); manifest.biographicalFacts.find((fact) => fact.fact === "birth_date")!.value = { kind: "value", value };
      expectV2Issue(manifest, "Invalid biographical fact reference or cutoff");
    }
    expect(validateReleaseManifest(withChecksum(nationwideSkeleton())).success).toBe(true);
  });

  it("rejects Senate offices in a jurisdiction without Senate representation", () => {
    const manifest = nationwideSkeleton();
    manifest.offices[0] = { ...manifest.offices[0]!, chamber: "senate", kind: "senate", stateCode: "DC", districtCode: null, senateClass: 1 };
    manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest);
    expect(validateReleaseManifest(manifest).success).toBe(false);
  });

  it.each([
    "coverageRecords", "biographicalFacts", "committeeAssignments", "acsVariables", "financeAggregates", "fundingCategoryAggregates", "fundingOrganizationAggregates", "outsideSpendingAggregates", "electionDecisions", "mapArtifacts", "snapshotDerivations",
  ] as const)("includes %s in v2 canonical identity", (collection) => {
    const manifest = nationwideSkeleton();
    const before = computeCanonicalDataChecksum(manifest);
    const row = manifest[collection][0]!;
    manifest[collection][0] = { ...row, releaseId: "rel_changed" as never } as never;
    expect(computeCanonicalDataChecksum(manifest)).not.toBe(before);
  });

  it("enforces the exact per-state House districts and Senate classes", () => {
    const district = nationwideSkeleton(); district.offices[0]!.districtCode = "02"; expectV2Issue(district, "Catalog office natural keys must exactly match the nationwide seat policy");
    const senate = nationwideSkeleton(); const alSenate = senate.offices.find((office) => office.chamber === "senate" && office.stateCode === "AL"); alSenate!.senateClass = 1; expectV2Issue(senate, "Catalog office natural keys must exactly match the nationwide seat policy");
  });

  it("rejects duplicate catalog offices, terms, and extra cutoff-active terms", () => {
    const duplicateOffice = nationwideSkeleton(); duplicateOffice.catalogSeatCycleIds[1] = duplicateOffice.catalogSeatCycleIds[0]!; expectV2Issue(duplicateOffice, "Catalog must resolve to 541 distinct offices and office terms");
    const duplicateTerm = nationwideSkeleton(); duplicateTerm.seatCycles[1]!.officeTermId = duplicateTerm.seatCycles[0]!.officeTermId; expectV2Issue(duplicateTerm, "Catalog must resolve to 541 distinct offices and office terms");
    const extra = nationwideSkeleton(); extra.officeTerms.push({ ...extra.officeTerms[0]!, id: "term_extra" as never, startsAt: "2023-01-01", endsAt: "2025-01-04" }); expectV2Issue(extra, "Catalog must contain exactly all cutoff-active office terms");
  });

  it("rejects catalog unknown occupancy and non-cutoff occupancy dates", () => {
    const unknown = nationwideSkeleton(); unknown.seatCycles[0]!.occupancy.status = "unknown"; expectV2Issue(unknown, "Catalog occupancy must truthfully match the release cutoff");
    const stale = nationwideSkeleton(); stale.seatCycles[0]!.occupancy.asOf = "2023-12-31"; expectV2Issue(stale, "Catalog occupancy must truthfully match the release cutoff");
  });

  it.each([
    ["complete", 542, 541], ["partial", 541, 541], ["not_collected", 541, 1], ["unavailable", 541, 1],
  ] as const)("rejects contradictory %s coverage counts", (status, expectedCount, observedCount) => {
    const manifest = nationwideSkeleton(); Object.assign(manifest.coverageRecords[0]!, { status, expectedCount, observedCount }); expectV2Issue(manifest, "Invalid coverage record");
  });

  it("rejects duplicate coverage domains and invalid election decisions", () => {
    const coverage = nationwideSkeleton(); coverage.coverageRecords[1]!.domain = "identity"; expectV2Issue(coverage, "Coverage records must close exactly over the Phase 1 domains");
    const election = nationwideSkeleton(); election.electionDecisions[0]!.electionYear = 2023; expectV2Issue(election, "Unknown jurisdiction or invalid election year");
  });

  it("requires exact ACS definitions and map references", () => {
    const missing = nationwideSkeleton(); missing.acsObservations.push({ releaseId: missing.release.id, geographyVersionId: missing.seatCycles[0]!.geographyVersionId, variable: "synthetic", label: "Synthetic", estimate: { kind: "missing", reason: "not_collected" }, marginOfError: { kind: "missing", reason: "not_collected" }, unit: "count", surveyPeriod: "synthetic", universe: "synthetic", lineage: { inputs: [{ snapshotId: "snap_input", role: "original_publisher" }], asOf: "2024-01-01", methodology: "synthetic", status: "reported" } } as never); missing.acsVariables = []; expectV2Issue(missing, "ACS observation must resolve to exactly one variable definition");
    const mismatched = nationwideSkeleton(); mismatched.acsObservations.push({ ...missing.acsObservations[0]!, releaseId: mismatched.release.id, label: "Other" }); expectV2Issue(mismatched, "ACS observation must resolve to exactly one variable definition");
    const map = nationwideSkeleton(); map.mapArtifacts.push({ id: "map_synthetic", releaseId: map.release.id, geographyVersionId: map.seatCycles[0]!.geographyVersionId, artifactId: "artifact_missing", inputSnapshotIds: ["snap_input"] } as never); expectV2Issue(map, "Invalid map artifact reference");
  });

  it("validates snapshot derivation ownership, references, uniqueness, and cycles", () => {
    const self = nationwideSkeleton(); self.snapshotDerivations[0]!.inputSnapshotIds = [self.snapshotDerivations[0]!.outputSnapshotId]; expectV2Issue(self, "Invalid snapshot derivation");
    const duplicate = nationwideSkeleton(); duplicate.snapshotDerivations.push({ ...duplicate.snapshotDerivations[0]! }); expectV2Issue(duplicate, "Duplicate snapshotDerivations natural key");
    const missing = nationwideSkeleton(); missing.snapshotDerivations[0]!.inputSnapshotIds = ["snap_missing" as never]; expectV2Issue(missing, "Invalid snapshot derivation");
    const cycle = nationwideSkeleton(); cycle.snapshotDerivations.push({ ...cycle.snapshotDerivations[0]!, outputSnapshotId: "snap_input" as never, inputSnapshotIds: ["snap_derived" as never] }); expectV2Issue(cycle, "Snapshot derivations cannot contain directed cycles");
  });

  it("rejects cross-release rows, dangling provenance, and duplicate new references", () => {
    const release = nationwideSkeleton(); release.biographicalFacts[0]!.releaseId = "rel_other" as never; expectV2Issue(release, "Invalid biographical fact reference or cutoff");
    const dangling = nationwideSkeleton(); dangling.biographicalFacts[0]!.provenance = [{ snapshotId: "snap_missing" as never, role: "original_publisher" }]; expectV2Issue(dangling, "Invalid biographical fact reference or cutoff");
    const duplicate = nationwideSkeleton(); duplicate.biographicalFacts[0]!.provenance = [duplicate.biographicalFacts[0]!.provenance[0]!, duplicate.biographicalFacts[0]!.provenance[0]!]; expectV2Issue(duplicate, "Duplicate reference");
  });

  it("enforces as-of, coverage, and cutoff dates for new finance facts", () => {
    const direction = nationwideSkeleton(); direction.financeAggregates[0]!.coverageThrough = "2024-01-02"; expectV2Issue(direction, "Invalid finance aggregate");
    const category = nationwideSkeleton(); category.fundingCategoryAggregates[0]!.coverageThrough = "2024-01-02"; expectV2Issue(category, "Unknown seat cycle or coverage beyond release cutoff");
    const bio = nationwideSkeleton(); bio.biographicalFacts[0]!.effectiveAt = "2024-01-02"; expectV2Issue(bio, "Invalid biographical fact reference or cutoff");
  });

  it("accepts distinct coverage scopes in one domain and rejects incompatible, duplicate, and unaccounted scopes", () => {
    const valid = nationwideSkeleton();
    valid.coverageRecords.push({ ...valid.coverageRecords[4]!, scope: { kind: "release" }, expectedCount: 4, observedCount: 4 });
    expect(validateReleaseManifest(withChecksum(valid)).success).toBe(true);

    const incompatible = nationwideSkeleton(); incompatible.coverageRecords[0]!.scope = { kind: "seat_cycle", seatCycleId: incompatible.seatCycles[0]!.id } as never; expectV2Issue(incompatible, "Invalid scoped coverage record");
    const electionMismatch = nationwideSkeleton(); electionMismatch.coverageRecords[7]!.scope = { kind: "election", jurisdictionCode: "AL", electionYear: 2022 } as never; expectV2Issue(electionMismatch, "Invalid scoped coverage record");
    const duplicate = nationwideSkeleton(); duplicate.coverageRecords.push({ ...duplicate.coverageRecords[0]! }); expectV2Issue(duplicate, "Duplicate coverage scope natural key");
    const duplicateFunding = nationwideSkeleton();
    duplicateFunding.coverageRecords.push({ ...duplicateFunding.coverageRecords.find((record) => record.domain === "finance" && record.scope.kind === "funding")! });
    expectV2Issue(duplicateFunding, "Every catalog seat cycle requires funding coverage");
    const duplicateReason = nationwideSkeleton(); duplicateReason.coverageRecords[3]!.missingByReason = [{ reason: "not_collected", count: 1 }, { reason: "not_collected", count: 490 }]; expectV2Issue(duplicateReason, "Invalid coverage record");
    const input = nationwideSkeleton(); input.coverageRecords[0]!.inputSnapshotIds = ["snap_missing" as never]; expectV2Issue(input, "Invalid coverage record");
  }, 15_000);

  it.each([
    ["complete", 541, 541, [], 0, 0],
    ["partial", 541, 540, [], 1, 0],
    ["not_collected", 541, 0, [{ reason: "not_collected", count: 541 }], 0, 0],
    ["unavailable", 541, 0, [{ reason: "not_collected", count: 541 }], 0, 0],
  ] as const)("accepts internally accounted %s coverage", (status, expectedCount, observedCount, missingByReason, quarantinedCount, incompatibleCount) => {
    const manifest = nationwideSkeleton();
    Object.assign(manifest.coverageRecords[0]!, { status, expectedCount, observedCount, missingByReason, quarantinedCount, incompatibleCount });
    // Identity's observed count is fixed at 541; only complete is valid for its release scope.
    if (status === "complete") expect(validateReleaseManifest(withChecksum(manifest)).success).toBe(true);
    else expectV2Issue(manifest, "Invalid coverage record");
  });

  it("accepts approved license-unavailable coverage while rejecting restricted ACS and funding inputs", () => {
    const coverage = nationwideSkeleton(); coverage.snapshots[0]!.license = "restricted"; expect(validateReleaseManifest(withChecksum(coverage)).success).toBe(true);
    const acs = nationwideSkeleton(); acs.snapshots[0]!.usageStatus = "restricted"; expectV2Issue(acs, "Public ACS definitions require approved snapshots");
    for (const collection of ["fundingCategoryAggregates", "fundingOrganizationAggregates", "outsideSpendingAggregates"] as const) {
      const manifest = nationwideSkeleton(); manifest[collection][0]!.inputSnapshotIds = ["snap_derived" as never]; manifest.snapshots[1]!.usageStatus = "restricted"; expectV2Issue(manifest, "Public funding aggregates require approved snapshots");
    }
  }, 15_000);

  it("validates source and derived ACS definitions and exact observation definitions", () => {
    const valid = nationwideSkeleton();
    valid.acsVariables.push(
      { ...valid.acsVariables[0]!, id: "acs_numerator", variable: "numerator" },
      { ...valid.acsVariables[0]!, id: "acs_denominator", variable: "denominator" },
      { id: "acs_ratio", releaseId: valid.release.id, variable: "ratio", label: "Ratio", unit: "percent", surveyPeriod: "synthetic", universe: "synthetic", inputSnapshotIds: ["snap_input"], definitionKind: "derived_ratio", numeratorDefinitionId: "acs_numerator", denominatorDefinitionId: "acs_denominator", derivationFormulaVersion: "v1", moePropagationMethod: "delta_method" } as never,
    );
    valid.coverageRecords.push(...(["numerator", "denominator", "ratio"] as const).map((variable) => ({ ...valid.coverageRecords[3]!, scope: { kind: "acs_indicator" as const, variable, surveyPeriod: "synthetic" } })));
    expect(validateReleaseManifest(withChecksum(valid)).success).toBe(true);
    for (const mutate of [
      (m: ReturnType<typeof nationwideSkeleton>) => { m.acsVariables[0] = { ...m.acsVariables[0]!, definitionKind: "derived_ratio", numeratorDefinitionId: "missing", denominatorDefinitionId: "acs_synthetic" } as never; },
      (m: ReturnType<typeof nationwideSkeleton>) => { m.acsVariables[0] = { ...m.acsVariables[0]!, definitionKind: "derived_ratio", numeratorDefinitionId: "acs_synthetic", denominatorDefinitionId: "acs_synthetic" } as never; },
      (m: ReturnType<typeof nationwideSkeleton>) => { m.acsVariables.push({ ...m.acsVariables[0]!, id: "acs_ratio", definitionKind: "derived_ratio", numeratorDefinitionId: "acs_ratio", denominatorDefinitionId: "acs_synthetic" } as never); },
    ]) { const manifest = nationwideSkeleton(); mutate(manifest); expect(validateReleaseManifest(withChecksum(manifest)).success).toBe(false); }
    const collision = nationwideSkeleton(); collision.acsVariables.push({ ...collision.acsVariables[0]!, id: "acs_other", label: "Other" }); expectV2Issue(collision, "Duplicate acsVariables natural key");
    const observation = nationwideSkeleton(); observation.acsObservations.push({ releaseId: observation.release.id, geographyVersionId: observation.seatCycles[0]!.geographyVersionId, variable: "synthetic", label: "Wrong", estimate: { kind: "missing", reason: "not_collected" }, marginOfError: { kind: "missing", reason: "not_collected" }, unit: "count", surveyPeriod: "synthetic", universe: "synthetic", lineage: { inputs: [{ snapshotId: "snap_input", role: "original_publisher" }], asOf: "2024-01-01", methodology: "synthetic", status: "reported" } } as never); expectV2Issue(observation, "ACS observation must resolve to exactly one variable definition");
  });

  it("enforces finance committee closure and filing eligibility", () => {
    const omitted = nationwideSkeleton(); omitted.financeAggregates[0]!.committeeInputs = []; expect(validateReleaseManifest(withChecksum(omitted)).success).toBe(false);
    const duplicate = nationwideSkeleton(); duplicate.financeAggregates[0]!.committeeInputs.push({ ...duplicate.financeAggregates[0]!.committeeInputs[0]! }); expect(validateReleaseManifest(withChecksum(duplicate)).success).toBe(false);
    const missing = nationwideSkeleton(); missing.financeAggregates[0]!.committeeInputs = [{ kind: "missing", committeeId: "committee_synthetic", reason: "not_collected" } as never]; expect(validateReleaseManifest(withChecksum(missing)).success).toBe(true);
    const numericMissing = nationwideSkeleton(); numericMissing.financeAggregates[0]!.committeeInputs = [{ kind: "missing", committeeId: "committee_synthetic", reason: "not_collected" } as never]; numericMissing.financeAggregates[0]!.cashOnHand = { kind: "value", value: 1 }; expectV2Issue(numericMissing, "Invalid finance aggregate committee closure");
    for (const mutate of [
      (m: ReturnType<typeof nationwideSkeleton>) => { m.fecFilingSummaries[0]!.amendmentStatus = "superseded"; },
      (m: ReturnType<typeof nationwideSkeleton>) => { m.fecFilingSummaries.push({ ...m.fecFilingSummaries[0]!, id: "fec_leaf", amendsFilingId: "fec_synthetic", amendmentNumber: 1 } as never); },
      (m: ReturnType<typeof nationwideSkeleton>) => { m.fecFilingSummaries[0]!.reportingPeriodEnd = "2023-12-31"; },
    ]) { const manifest = nationwideSkeleton(); mutate(manifest); expectV2Issue(manifest, "Invalid finance aggregate committee closure"); }
  }, 15_000);

  it("requires exact coverage closure for definitions, funding, and election decisions", () => {
    const partial = nationwideSkeleton(); partial.coverageRecords[0]!.expectedCount += 1; expectV2Issue(partial, "Invalid coverage record");
    const acs = nationwideSkeleton(); acs.coverageRecords.splice(3, 1); expectV2Issue(acs, "Every ACS definition requires one indicator coverage record");
    const funding = nationwideSkeleton(); funding.coverageRecords = funding.coverageRecords.filter((record) => !(record.domain === "finance" && record.scope.kind === "funding" && record.scope.seatCycleId === funding.catalogSeatCycleIds[1] && record.scope.fundingKind === "summary")); expectV2Issue(funding, "Every catalog seat cycle requires funding coverage");
    const election = nationwideSkeleton(); election.coverageRecords = election.coverageRecords.filter((record) => !(record.domain === "election_2024" && record.scope.kind === "election")); expectV2Issue(election, "Every election decision requires election coverage");
  });

  it("rejects election coverage without its matching decision", () => {
    const manifest = nationwideSkeleton(); manifest.electionDecisions = manifest.electionDecisions.filter((decision) => decision.electionYear !== 2020); expectV2Issue(manifest, "Every election coverage requires one matching election decision");
  });

  it("enforces derived ACS publication inputs and paired source observations", () => {
    const derived = () => {
      const manifest = nationwideSkeleton();
      manifest.acsVariables.push(
        { ...manifest.acsVariables[0]!, id: "acs_numerator", variable: "numerator" },
        { ...manifest.acsVariables[0]!, id: "acs_denominator", variable: "denominator" },
        { id: "acs_ratio", releaseId: manifest.release.id, variable: "ratio", label: "Ratio", unit: "percent", surveyPeriod: "synthetic", universe: "synthetic", inputSnapshotIds: ["snap_input" as never], definitionKind: "derived_ratio", numeratorDefinitionId: "acs_numerator", denominatorDefinitionId: "acs_denominator", derivationFormulaVersion: "v1", moePropagationMethod: "delta_method" },
      );
      manifest.coverageRecords.push(...(["numerator", "denominator", "ratio"] as const).map((variable) => ({ ...manifest.coverageRecords[3]!, scope: { kind: "acs_indicator" as const, variable, surveyPeriod: "synthetic" } })));
      const observation = (variable: string, label: string) => ({ releaseId: manifest.release.id, geographyVersionId: manifest.seatCycles[0]!.geographyVersionId, variable, label, estimate: { kind: "value" as const, value: variable === "ratio" ? 100 : 10 }, marginOfError: { kind: "value" as const, value: variable === "ratio" ? Math.sqrt(200) : 1 }, unit: variable === "ratio" ? "percent" as const : "count" as const, surveyPeriod: "synthetic", universe: "synthetic", lineage: { inputs: [{ snapshotId: "snap_input" as never, role: "original_publisher" as const }], asOf: "2024-01-01", methodology: "synthetic", status: "reported" as const } });
      manifest.acsObservations.push(observation("numerator", "Synthetic"), observation("denominator", "Synthetic"), observation("ratio", "Ratio"));
      for (const record of manifest.coverageRecords.filter((record) => record.domain === "acs" && record.scope.kind === "acs_indicator" && record.scope.variable !== "synthetic")) Object.assign(record, { status: "partial", observedCount: 1, missingByReason: [{ reason: "not_collected", count: 490 }] });
      return manifest;
    };
    expect(validateReleaseManifest(withChecksum(derived())).success).toBe(true);
    const sameDefinition = derived(); (sameDefinition.acsVariables.find((row) => row.id === "acs_ratio") as never as { denominatorDefinitionId: string }).denominatorDefinitionId = "acs_numerator"; expectV2Issue(sameDefinition, "Invalid derived ACS definition references");
    const absent = derived(); absent.acsObservations = absent.acsObservations.filter((row) => row.variable !== "numerator"); expectV2Issue(absent, "Derived ACS observation requires paired source observations");
    const mismatch = derived(); mismatch.acsObservations.find((row) => row.variable === "denominator")!.geographyVersionId = mismatch.seatCycles[1]!.geographyVersionId; expectV2Issue(mismatch, "Derived ACS observation requires paired source observations");
    const zero = derived(); const denominator = zero.acsObservations.find((row) => row.variable === "denominator")!; if (denominator.estimate.kind === "value") denominator.estimate.value = 0; expectV2Issue(zero, "Numeric derived ACS observation requires numeric nonzero source inputs");
    const nonnumeric = derived(); nonnumeric.acsObservations.find((row) => row.variable === "numerator")!.marginOfError = { kind: "missing", reason: "not_collected" }; expectV2Issue(nonnumeric, "Numeric derived ACS observation requires numeric nonzero source inputs");
    const schema = derived(); schema.acsVariables[3] = { ...schema.acsVariables[3]!, unit: "count" } as never; expect(validateReleaseManifest(withChecksum(schema)).success).toBe(false);
    const moe = derived(); moe.acsVariables[3] = { ...moe.acsVariables[3]!, moePropagationMethod: "not_available" } as never; expect(validateReleaseManifest(withChecksum(moe)).success).toBe(false);
  }, 15_000);

  it("requires approved ACS observation and included filing lineage while allowing restricted absence coverage", () => {
    const acs = nationwideSkeleton(); acs.acsObservations.push({ releaseId: acs.release.id, geographyVersionId: acs.seatCycles[0]!.geographyVersionId, variable: "synthetic", label: "Synthetic", estimate: { kind: "missing", reason: "not_collected" }, marginOfError: { kind: "missing", reason: "not_collected" }, unit: "count", surveyPeriod: "synthetic", universe: "synthetic", lineage: { inputs: [{ snapshotId: "snap_input" as never, role: "original_publisher" }], asOf: "2024-01-01", methodology: "synthetic", status: "reported" } } as never); Object.assign(acs.coverageRecords[3]!, { status: "partial", observedCount: 1, missingByReason: [{ reason: "not_collected", count: 490 }] }); acs.snapshots[0]!.usageStatus = "restricted"; expectV2Issue(acs, "Public ACS observations require approved snapshots");
    const finance = nationwideSkeleton(); finance.snapshots[0]!.usageStatus = "review_required"; expectV2Issue(finance, "Invalid finance aggregate committee closure");
    const coverage = nationwideSkeleton(); coverage.snapshots[0]!.usageStatus = "restricted"; coverage.acsVariables[0]!.inputSnapshotIds = ["snap_derived" as never]; coverage.fecFilingSummaries[0]!.lineage.inputs = [{ snapshotId: "snap_derived" as never, role: "original_publisher" }]; for (const collection of ["fundingCategoryAggregates", "fundingOrganizationAggregates", "outsideSpendingAggregates"] as const) coverage[collection][0]!.inputSnapshotIds = ["snap_derived" as never]; coverage.coverageRecords[3]!.missingByReason = [{ reason: "license_unavailable", count: 491 }]; coverage.coverageRecords[3]!.inputSnapshotIds = ["snap_input" as never]; expectV2Issue(coverage, "Public v2 records require approved snapshots");
  });

  it("enforces restricted snapshot publication policy", () => {
    const ordinary = nationwideSkeleton(); ordinary.snapshots.push({ ...ordinary.snapshots[0]!, id: "snap_restricted" as never, usageStatus: "restricted" }); ordinary.people[0]!.provenance = [{ snapshotId: "snap_restricted" as never, role: "original_publisher" }]; expectV2Issue(ordinary, "Public v2 records require approved snapshots");
    const coverage = nationwideSkeleton(); coverage.snapshots.push({ ...coverage.snapshots[0]!, id: "snap_restricted" as never, usageStatus: "restricted" }); Object.assign(coverage.coverageRecords[3]!, { inputSnapshotIds: ["snap_restricted" as never], missingByReason: [{ reason: "license_unavailable", count: 491 }] }); expect(validateReleaseManifest(withChecksum(coverage)).success).toBe(true);
    const derivation = nationwideSkeleton(); derivation.snapshots.push({ ...derivation.snapshots[0]!, id: "snap_restricted" as never, usageStatus: "restricted" }); derivation.snapshotDerivations[0]!.inputSnapshotIds = ["snap_restricted" as never]; expect(validateReleaseManifest(withChecksum(derivation)).success).toBe(true);
    const output = nationwideSkeleton(); output.snapshots[1]!.usageStatus = "review_required"; expectV2Issue(output, "Invalid snapshot derivation");
  });

  it("accepts non-catalog historical and future cycles that introduce no cutoff-active terms", () => {
    const manifest = nationwideSkeleton();
    manifest.offices.push({ ...manifest.offices[0]!, id: "office_historical", districtCode: "99" } as never, { ...manifest.offices[0]!, id: "office_future", districtCode: "98" } as never);
    manifest.geographyVersions.push({ ...manifest.geographyVersions[0]!, id: "geo_historical", sourceGeoid: "historical", districtCode: "99" } as never, { ...manifest.geographyVersions[0]!, id: "geo_future", sourceGeoid: "future", districtCode: "98" } as never);
    manifest.officeTerms.push({ ...manifest.officeTerms[0]!, id: "term_historical", officeId: "office_historical", startsAt: "2019-01-03", endsAt: "2021-01-03" } as never, { ...manifest.officeTerms[0]!, id: "term_future", officeId: "office_future", startsAt: "2025-01-03", endsAt: "2027-01-03" } as never);
    manifest.seatCycles.push({ ...manifest.seatCycles[0]!, id: "seat_historical", officeId: "office_historical", officeTermId: "term_historical", geographyVersionId: "geo_historical", cycleYear: 2020, occupancy: { status: "unknown", asOf: "2020-01-01" } } as never, { ...manifest.seatCycles[0]!, id: "seat_future", officeId: "office_future", officeTermId: "term_future", geographyVersionId: "geo_future", cycleYear: 2026, occupancy: { status: "unknown", asOf: "2024-01-01" } } as never);
    expect(validateReleaseManifest(withChecksum(manifest)).success).toBe(true);
  });

  it("changes the v2 checksum for every collection and nested provenance, lineage, and input mutation", () => {
    const collections = ["sources", "snapshots", "districtPlans", "geometryArtifacts", "geographyVersions", "offices", "people", "officeTerms", "memberships", "seatCycles", "contests", "candidacies", "resultOptions", "electionResults", "acsObservations", "committees", "committeeRelationships", "fecFilingSummaries", "financeSummaries", "jurisdictions", "coverageRecords", "biographicalFacts", "committeeAssignments", "acsVariables", "financeAggregates", "fundingCategoryAggregates", "fundingOrganizationAggregates", "outsideSpendingAggregates", "electionDecisions", "mapArtifacts", "snapshotDerivations"] as const;
    const mutations: Array<[string, (m: ReturnType<typeof nationwideSkeleton>) => void]> = [
      ["release", (m) => { m.release.label = "Checksum release mutation"; }],
      ["catalog order", (m) => { [m.catalogSeatCycleIds[0], m.catalogSeatCycleIds[1]] = [m.catalogSeatCycleIds[1]!, m.catalogSeatCycleIds[0]!]; }],
      ...collections.map((collection) => [collection, (m: ReturnType<typeof nationwideSkeleton>) => { const rows = m[collection] as unknown as object[]; rows.push(rows[0] === undefined ? { checksumMutation: collection } : structuredClone(rows[0])); }] as [string, (m: ReturnType<typeof nationwideSkeleton>) => void]),
      ["provenance", (m) => { m.contests[0]!.provenance.push({ snapshotId: "snap_derived" as never, role: "derived_input" }); }],
      ["lineage", (m) => { m.contests[0]!.lineage.inputs.push({ snapshotId: "snap_derived" as never, role: "derived_input" }); }],
      ["input snapshots", (m) => { m.acsVariables[0]!.inputSnapshotIds.push("snap_derived" as never); }],
    ];
    for (const [, mutate] of mutations) { const baseline = nationwideSkeleton(); const before = computeCanonicalDataChecksum(baseline); const changed = structuredClone(baseline); mutate(changed); expect(computeCanonicalDataChecksum(changed)).not.toBe(before); }
  }, 15_000);

  it("rejects a stale v2 checksum", () => {
    const manifest = nationwideSkeleton(); manifest.canonicalDataChecksumSha256 = "a".repeat(64); const result = validateReleaseManifest(manifest); expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.message === "Canonical data checksum does not match manifest content")).toBe(true);
  });
});
