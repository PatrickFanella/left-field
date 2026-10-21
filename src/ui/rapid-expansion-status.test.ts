import { describe, expect, it } from "vitest";

import { readRefreshInputs } from "@/rapid-acquisition/refresh-inputs";

import { loadRapidExpansionStatus } from "./rapid-expansion-status";

describe("rapid expansion status", () => {
  it("loads the active v0.9 projection, state contestation, and local-office catalogs", async () => {
    const value = await loadRapidExpansionStatus();
    expect(value?.score).toMatchObject({
      version: "v0.9",
      seats: 430,
      republicanSeats: 218,
      directPrimaryActiveSeats: 22,
      newlyResolvedPrimarySeats: 1,
      unresolvedPrimaryRows: 0,
      reviewedAliasLinks: 1,
      republicanSeatsWithStateContestation: 40,
      republicanSeatsWithLocalContext: 3,
      localContextActiveSeats: 4,
      republicanMaxScore: 78.6,
    });
    expect(value?.score.changedSeats).toBe(430 - (value?.score.unchangedSeats ?? 0));
    expect(value?.score.activeDistricts.map((row) => [row.districtLabel, row.localContextAvailableWeight])).toEqual([
      ["DE-AL", 1],
      ["ND-AL", 0.7],
      ["SD-AL", 1],
      ["WY-AL", 1],
    ]);
    expect(value?.score.newlyResolvedDistricts).toEqual([{ districtLabel: "RI-01", previousScore: 59.6, activeScore: 55.9, movement: -3.7, incumbentPrimaryVoteShare: 100 }]);
    expect(value?.stateContestation.states.map((row) => [row.state, row.cycleYear, row.contestationScore])).toEqual([
      ["GA", 2026, 79.3],
      ["HI", 2024, 100],
      ["IN", 2024, 24.5],
      ["MO", 2024, 32],
      ["OH", 2026, 51],
      ["TN", 2024, 40.3],
    ]);
    expect(value?.localOffice.map((row) => [row.id, row.contests])).toEqual([
      ["rapid-indiana-local-office-primary-results-v1", 816],
      ["rapid-north-carolina-local-office-primary-results-v1", 1095],
      ["rapid-new-mexico-county-office-primary-results-v1", 581],
    ]);
    expect(value?.localOffice[0]?.summary).toMatchObject({ officeCategories: 12, officeRows: 682, candidateRows: 1520, sourceMarkedWinnerCandidates: 1049, formulaEligibleContests: 0 });
  });

  it("carries the Senate projection and the state-legislative roster", async () => {
    const value = await loadRapidExpansionStatus();
    const inputs = readRefreshInputs();
    // Caucus sizes, cash coverage and the top seats move with each roster and FEC refresh.
    expect(value?.senate).toMatchObject({ version: "v0.1", seats: 100, upIn2026: 35, stateContestationValues: 8, financeSnapshotId: inputs.fecCandidateSummaryId });
    expect((value?.senate.democraticCaucus ?? 0) + (value?.senate.republicanCaucus ?? 0)).toBe(100);
    expect(value?.senate.alignmentValues).toBe(value?.senate.democraticCaucus);
    expect(value?.senate.cashValues).toBeGreaterThan(90);
    expect(value?.senate.topDemocratic).toHaveLength(5);
    expect(value?.senate.topRepublican).toHaveLength(5);
    expect(value?.stateLegislative).toMatchObject({ snapshotDate: inputs.snapshotDate, jurisdictions: 51, chambers: 100, catalogStates: 10, presidentialBaseline: "unavailable_no_open_nationwide_2024_legislative_district_file" });
    expect(value?.stateLegislative.legislators).toBeGreaterThan(7000);
    expect(value?.stateLegislative.primaryMatched).toBeGreaterThan(300);
  });

  it("returns null when the lock or artifacts are unavailable", async () => {
    expect(await loadRapidExpansionStatus("/nonexistent-root")).toBeNull();
  });
});
