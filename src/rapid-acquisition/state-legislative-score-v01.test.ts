import { describe, expect, it } from "vitest";

import { buildStateLegislativeScoreV01Projection, readStateLegislativeScoreV01Projection, stateSeatLabel, termYearsFor } from "./state-legislative-score-v01";

describe("state-legislative score v0.1", () => {
  it("uses chamber term defaults", () => {
    expect(termYearsFor("GA", "lower")).toBe(2);
    expect(termYearsFor("GA", "upper")).toBe(2);
    expect(termYearsFor("VA", "upper")).toBe(4);
    expect(termYearsFor("AL", "lower")).toBe(4);
    expect(termYearsFor("NE", "unicameral")).toBe(4);
    expect(stateSeatLabel("VA", "lower", "12")).toBe("VA House 12");
  });

  it("scores every seat in a covered state and carries the rest unscored with a reason", () => {
    const value = buildStateLegislativeScoreV01Projection();
    expect(value.coveredStates).toEqual(["AK", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "MA", "MD", "ME", "MO", "MT", "NC", "NJ", "NY", "OR", "PA", "RI", "SC", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"]);
    // Roster refreshes move the scored count as seats fall vacant and fill.
    expect(value.summary).toMatchObject({ seats: value.rows.length, coveredStates: 36, noContestForDistrict: 121, noMajorPartyInContest: 8, partyMismatches: 5, holderPartyNotScored: 12 });
    expect(value.summary.scored).toBeGreaterThan(5100);
    expect(value.summary.democraticScored + value.summary.republicanScored).toBe(value.summary.scored);
    expect(value.summary.stateNotCovered + value.summary.scored + value.summary.noContestForDistrict + value.summary.noMajorPartyInContest + value.summary.holderPartyNotScored).toBe(value.summary.seats);
    const ga = value.rows.filter((row) => row.stateCode === "GA");
    expect(ga.every((row) => row.status === "scored" && row.nextElectionYear === 2026 && row.baselineCycleYear === 2024)).toBe(true);
    const vaHouse = value.rows.filter((row) => row.stateCode === "VA" && row.chamber === "lower");
    expect(vaHouse.every((row) => row.baselineCycleYear === 2025 && row.nextElectionYear === 2027)).toBe(true);
    const vaSenate = value.rows.filter((row) => row.stateCode === "VA" && row.chamber === "upper");
    expect(vaSenate.every((row) => row.baselineCycleYear === 2023 && row.nextElectionYear === 2027)).toBe(true);
    const caSenate = value.rows.filter((row) => row.stateCode === "CA" && row.chamber === "upper");
    expect(new Set(caSenate.map((row) => `${row.baselineCycleYear}->${row.nextElectionYear}`))).toEqual(new Set(["2024->2028", "2022->2026"]));
    expect(caSenate.every((row) => (Number(row.district) % 2 === 1) === (row.baselineCycleYear === 2024))).toBe(true);
    expect(value.rows.filter((row) => row.stateCode === "NY").every((row) => row.status === "scored" && row.nextElectionYear === 2026)).toBe(true);
    const wiSenate = value.rows.filter((row) => row.stateCode === "WI" && row.chamber === "upper");
    expect(wiSenate.every((row) => (Number(row.district) % 2 === 0) === (row.baselineCycleYear === 2024))).toBe(true);
    expect(value.rows.filter((row) => row.stateCode === "IL").every((row) => row.status === "scored")).toBe(true);
    const waHouse = value.rows.filter((row) => row.stateCode === "WA" && row.chamber === "lower");
    expect(waHouse.every((row) => row.status === "scored")).toBe(true);
    const positions = new Map<string, string[]>();
    for (const row of waHouse) positions.set(row.district, [...(positions.get(row.district) ?? []), row.baselineContestId!]);
    expect([...positions.values()].every((ids) => ids.length === 2 && new Set(ids).size === 2)).toBe(true);
    expect(value.rows.filter((row) => row.status === "holder_party_not_scored" && row.stateCode === "NC").map((row) => row.incumbentParty)).toEqual(["Independent", "Independent"]);
    // Florida leaves unopposed races off the ballot: those seats have no contest and stay unscored rather than inferred.
    const florida = value.rows.filter((row) => row.stateCode === "FL" && row.status === "no_contest_for_district");
    expect(florida).toHaveLength(24);
    expect(value.rows.filter((row) => row.stateCode === "FL" && row.chamber === "upper" && row.status === "scored").every((row) => (Number(row.district) % 2 === 1) === (row.baselineCycleYear === 2024))).toBe(true);
    expect(value.rows.filter((row) => row.stateCode === "ME" && row.status === "no_contest_for_district").map((row) => row.district).sort()).toEqual(["Houlton Band of Maliseet Indians", "Passamaquoddy Tribe"]);
    // West Virginia Senate districts elect two members in different years; each holder gets their own year's contest.
    const wvSenate = value.rows.filter((row) => row.stateCode === "WV" && row.chamber === "upper");
    expect(wvSenate.every((row) => row.status === "scored")).toBe(true);
    const wvByDistrict = new Map<string, string[]>();
    for (const row of wvSenate) wvByDistrict.set(row.district, [...(wvByDistrict.get(row.district) ?? []), row.baselineContestId!]);
    expect([...wvByDistrict.values()].every((ids) => new Set(ids).size === ids.length)).toBe(true);
    // Utah's 2022 Senate canvass is a scanned PDF, so senators elected that year have no contest.
    expect(value.rows.filter((row) => row.stateCode === "UT" && row.status === "no_contest_for_district").every((row) => row.chamber === "upper")).toBe(true);
    expect(value.rows.filter((row) => row.stateCode === "ID" && row.chamber === "lower").every((row) => row.status === "scored" && /^\d+[AB]$/.test(row.district))).toBe(true);
    // Holders whose roster caucus differs from the line they won on are flagged, not re-scored.
    expect(value.rows.filter((row) => row.partyMismatch).map((row) => [row.stateCode, row.district, row.incumbentParty, row.holderBaselineParty]).sort()).toEqual([["CA", "4", "Republican", "Democratic"], ["FL", "64", "Republican", "DEM"], ["HI", "14", "Republican", "D"], ["OR", "32", "Democratic", "R"], ["SC", "57", "Republican", "DEM"]]);
    // A contest with no Democratic or Republican candidate has no margin.
    expect(value.rows.filter((row) => row.status === "no_major_party_in_contest").every((row) => row.ownRaceDemocraticMargin === null)).toBe(true);
    // New Jersey Assembly districts elect two members from one contest; both holders share it.
    const njAssembly = value.rows.filter((row) => row.stateCode === "NJ" && row.chamber === "lower");
    expect(njAssembly.every((row) => row.status === "scored" && row.baselineSeats === 2 && row.nextElectionYear === 2027)).toBe(true);
    const other = value.rows.find((row) => row.stateCode === "NE");
    expect(other).toMatchObject({ status: "state_not_covered", score: null, route: null, drivers: [] });
  });

  it("applies the shared routes: uncontested Democratic seats top out at the blue-only ceiling", () => {
    const value = buildStateLegislativeScoreV01Projection();
    const uncontestedDemocrat = value.rows.find((row) => row.status === "scored" && row.caucus === "Democratic" && row.baselineContested === false && row.primaryFeasibility === null);
    expect(uncontestedDemocrat).toMatchObject({ blueBaseline: 100, availableWeight: 0.65, score: 86, route: "democratic_incumbent_primary" });
    expect(uncontestedDemocrat?.ownRaceDemocraticMargin).toBeGreaterThan(95);
    const republican = value.rows.find((row) => row.status === "scored" && row.caucus === "Republican" && row.baselineContested);
    expect(republican?.route).toBe("republican_fringe_general");
    expect(republican?.competitiveness).toBeGreaterThanOrEqual(0);
    expect(republican?.drivers.map((driver) => driver.key)).toEqual(["general_election_competitiveness", "cash_vulnerability", "local_context", "state_primary_contestation"]);
  });

  it("matches the pinned artifact", () => {
    expect(readStateLegislativeScoreV01Projection().packageSha256).toBe(buildStateLegislativeScoreV01Projection().packageSha256);
  });
});
