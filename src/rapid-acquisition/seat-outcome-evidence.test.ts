import { describe, expect, it } from "vitest";

import { readSourceLock } from "./intake/source-lock";
import { readPreElectionSnapshot2026, type PreElectionSeatRow } from "./pre-election-snapshot-2026";
import { countStatusOf, readHouseCandidacyEvidence, readHousePrimaryEvidence2026, readStateLegislativePrimaryEvidence2026, readSuccessors } from "./seat-outcome-evidence";

const seat = (overrides: Partial<PreElectionSeatRow>): PreElectionSeatRow => ({
  chamber: "state_house", seatId: "seat", seatLabel: "VT House Chittenden-18", stateCode: "VT", holderName: "", holderId: "", holderParty: "Democratic", scoreStatus: "scored",
  route: null, score: null, rank: null, chamberRank: null, nextElectionYear: 2026, openSeatSignal: null, rowSha256: "", ...overrides,
});

describe("House candidacy evidence", () => {
  it("reads the FEC-filing signal for every House seat", () => {
    const value = readHouseCandidacyEvidence();
    expect(value.size).toBe(430);
    const statuses = [...value.values()].map((row) => row.status);
    expect(statuses.filter((status) => status === "filed_for_other_office")).toHaveLength(16);
    expect(statuses.filter((status) => status === "not_observed")).toHaveLength(3);
    expect(statuses.filter((status) => status === "filed_for_seat")).toHaveLength(411);
    expect([...value.values()].every((row) => row.sourceIds.includes("house-incumbent-candidacy-v1"))).toBe(true);
  });
});

describe("roster successors", () => {
  it("finds few successors while the rosters predate seating", () => {
    const snapshot = readPreElectionSnapshot2026();
    const value = readSuccessors(process.cwd(), readSourceLock(), snapshot);
    expect(value.size).toBe(snapshot.rows.length);
    const changed = [...value.entries()].filter(([, successor]) => successor !== null);
    expect(changed.length).toBeLessThan(40);
    expect(changed.every(([seatId]) => seatId.startsWith("seat_house_") || seatId.startsWith("seat_senate_"))).toBe(true);
  });

  it("pairs a departed holder in a multi-member district with the arriving one", () => {
    const snapshot = { ...readPreElectionSnapshot2026(), rows: [
      seat({ seatId: "seat_state_vt_lower_chittenden-18_1", holderId: "ocd-person/a", holderName: "Ann Kept" }),
      seat({ seatId: "seat_state_vt_lower_chittenden-18_2", holderId: "ocd-person/b", holderName: "Bob Gone" }),
      seat({ chamber: "state_senate", seatId: "seat_state_vt_upper_orleans_1", holderId: "ocd-person/d", holderName: "Dee Vacant" }),
    ] };
    const roster = [
      { stateCode: "VT", chamber: "lower" as const, districtKey: "chittenden 18", openStatesId: "ocd-person/a", name: "Ann Kept", party: "Democratic" as const },
      { stateCode: "VT", chamber: "lower" as const, districtKey: "chittenden 18", openStatesId: "ocd-person/c", name: "Carol New", party: "Republican" as const },
    ];
    const value = readSuccessors(process.cwd(), readSourceLock(), snapshot, { congress: [], governors: [], stateLegislative: roster });
    expect(value.get("seat_state_vt_lower_chittenden-18_1")).toBeNull();
    expect(value.get("seat_state_vt_lower_chittenden-18_2")).toEqual({ holderId: "ocd-person/c", holderName: "Carol New", party: "Republican", sourceId: "state-legislative-roster-v1" });
    expect(value.get("seat_state_vt_upper_orleans_1")).toBeNull();
  });

  it("reads House and Senate successors from the Congress roster by district and class", () => {
    const snapshot = { ...readPreElectionSnapshot2026(), rows: [
      seat({ chamber: "house", seatId: "seat_house_ak_al_current", seatLabel: "AK-AL", stateCode: "AK", holderId: "A000001" }),
      seat({ chamber: "senate", seatId: "seat_senate_ak_2_current", seatLabel: "AK Senate class 2", stateCode: "AK", holderId: "S000001" }),
    ] };
    const congress = [
      { id: { bioguide: "N000001" }, name: { first: "New", last: "Rep", official_full: "New Rep" }, terms: [{ type: "rep", state: "AK", district: 0, party: "Democrat" }] },
      { id: { bioguide: "S000001" }, name: { first: "Same", last: "Senator" }, terms: [{ type: "sen", state: "AK", class: 2, party: "Republican" }] },
    ];
    const value = readSuccessors(process.cwd(), readSourceLock(), snapshot, { congress, governors: [], stateLegislative: [] });
    expect(value.get("seat_house_ak_al_current")).toEqual({ holderId: "N000001", holderName: "New Rep", party: "Democratic", sourceId: expect.stringMatching(/^congress-legislators-current-\d{8}$/) });
    expect(value.get("seat_senate_ak_2_current")).toBeNull();
  });
});

describe("count status", () => {
  it("grades counts fail-closed", () => {
    expect(countStatusOf("settings_certified_true_no_separate_certificate", "x")).toBe("certified");
    expect(countStatusOf("official_statewide_vote_totals_certification_pdf_retained", "x")).toBe("certified");
    expect(countStatusOf("final_unofficial_no_separate_certification_instrument_retained", "x")).toBe("unofficial");
    expect(countStatusOf(undefined, "official_statewide_democratic_recap_pdf_retained_no_separate_certification_instrument")).toBe("unofficial");
    expect(countStatusOf(null, "anything")).toBe("unofficial");
  });
});

describe("2026 House primary evidence", () => {
  it("reads the retained Democratic primaries with their winner marks", () => {
    const value = readHousePrimaryEvidence2026();
    expect([...value.keys()].sort()).toEqual(["HI-01", "HI-02", "IN-01", "IN-07", "MS-02", "SC-06", "TN-09"]);
    const indiana = value.get("IN-01")![0]!;
    expect(indiana).toMatchObject({ contestId: "in:primary:2026:01:democratic", party: "Democratic", electionDate: "2026-05-05", seats: 1, sourceMarkedWinners: ["Frank J. Mrvan"], countStatus: "certified" });
    expect(indiana.candidates).toEqual([{ name: "Frank J. Mrvan", votes: 42519 }, { name: "LaVetta Sparks-Wade", votes: 10467 }]);
    expect(indiana.sourceIds).toEqual(["in-2026-primary-settings", "in-2026-primary-us-house-results"]);
    expect(value.get("SC-06")![0]!.sourceMarkedWinners).toEqual(["James E Jim Clyburn"]);
    expect(value.get("TN-09")![0]).toMatchObject({ sourceMarkedWinners: null, countStatus: "unofficial" });
    expect(value.get("HI-01")![0]).toMatchObject({ sourceMarkedWinners: null, countStatus: "unofficial" });
    expect(value.get("MS-02")![0]).toMatchObject({ party: "Democratic", countStatus: "unofficial" });
  });
});

describe("2026 state-legislative primary evidence", () => {
  it("reads the four state catalogs by district", () => {
    const value = readStateLegislativePrimaryEvidence2026();
    const georgia = value.get("GA|lower|1")!;
    expect(georgia.map((contest) => contest.party).sort()).toEqual(["Democratic", "Republican"]);
    const republican = georgia.find((contest) => contest.party === "Republican")!;
    expect(republican).toMatchObject({ contestId: "ga:state-leg-primary:2026:lower:001:R", countStatus: "certified", seats: 1, sourceMarkedWinners: null });
    expect(republican.candidates.map((candidate) => candidate.name)).toContain("Mike Cameron (I)");
    expect(value.get("OH|lower|1")![0]).toMatchObject({ party: "Democratic", countStatus: "certified" });
    expect(value.get("KY|lower|2")![0]).toMatchObject({ party: "Republican", countStatus: "certified" });
    expect(value.get("NC|lower|1")![0]).toMatchObject({ party: "Republican", countStatus: "unofficial" });
    expect([...value.keys()].every((key) => /^(GA|KY|NC|OH)\|(lower|upper)\|/.test(key))).toBe(true);
    expect([...value.values()].flat().every((contest) => contest.electionDate.startsWith("2026-"))).toBe(true);
  });
});
