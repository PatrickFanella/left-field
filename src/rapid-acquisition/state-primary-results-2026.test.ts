import { describe, expect, it } from "vitest";

import type { PreElectionSeatRow } from "./pre-election-snapshot-2026";
import { buildPrimaryEvidenceIndex, primaryEvidenceForSeat, seatPrimaryKey, statePrimaryEntries } from "./seat-outcome-evidence";
import type { StateGeneralSource } from "./state-legislative-general-results";
import { buildStatePrimaryResults2026, houseDistrictOf, normalizePrimaryContest, readStatePrimaryResults2026, type RawPrimaryContest } from "./state-primary-results-2026";

const source: StateGeneralSource = { id: "xx-2026-primary", url: "https://example.test/primary.csv", path: "data/x.csv", cycleYear: 2026, electionDate: "2026-06-02", note: "" };
const partisan = { stateCode: "XX", system: "partisan" as const };
const normalize = (raw: Partial<RawPrimaryContest>, adapter: { stateCode: string; system: "partisan" | "top_two" | "top_four" } = partisan) =>
  normalizePrimaryContest({ office: "us_house", district: "3", rawParty: "Democratic", candidates: [{ name: "Ann Lee", votes: 10 }], ...raw }, source, adapter);

describe("state primary results 2026", () => {
  it("names House districts the way the ledger's seat labels do", () => {
    expect(["1", "01", "12", "AL", "at-large", "0"].map(houseDistrictOf)).toEqual(["01", "01", "12", "AL", "AL", "AL"]);
    expect(() => houseDistrictOf("Ward 3")).toThrow("HOUSE_DISTRICT_INVALID");
  });

  it("normalizes a partisan contest and refuses one without a party", () => {
    expect(normalize({ candidates: [{ name: "Ann  Lee", votes: 10 }, { name: "Bo Kim", votes: 20, winner: true }] })).toMatchObject({
      contestId: "xx:primary:2026:us_house:03:democratic:primary", district: "03", party: "Democratic", advance: 1, countStatus: "certified",
      candidates: [{ name: "Bo Kim", votes: 20 }, { name: "Ann Lee", votes: 10 }], sourceMarkedWinners: ["Bo Kim"], totalVotes: 30,
    });
    expect(() => normalize({ rawParty: null })).toThrow("PARTY_MISSING");
    expect(normalize({ office: "state_lower", district: "Belknap-01" }).district).toBe("belknap 01");
    expect(normalize({ rawParty: "Green" }).party).toBeNull();
  });

  it("advances two or four places on an all-party ballot, with no party", () => {
    expect(normalize({ rawParty: null }, { stateCode: "CA", system: "top_two" })).toMatchObject({ system: "top_two", party: null, advance: 2 });
    expect(normalize({ rawParty: null }, { stateCode: "AK", system: "top_four" }).advance).toBe(4);
    expect(() => normalize({}, { stateCode: "CA", system: "top_two" })).toThrow("PARTY_ON_ALL_PARTY_BALLOT");
  });

  it("accepts unopposed nominees named without a count, up to the seats", () => {
    expect(normalize({ candidates: [{ name: "Ann Lee", votes: null, winner: true }] })).toMatchObject({ unopposedWithoutCount: true, sourceMarkedWinners: ["Ann Lee"], totalVotes: 0 });
    expect(normalize({ seats: 2, candidates: [{ name: "Ann Lee", votes: null, winner: true }, { name: "Bo Kim", votes: null, winner: true }] }).sourceMarkedWinners).toEqual(["Ann Lee", "Bo Kim"]);
    expect(() => normalize({ candidates: [{ name: "Ann Lee", votes: null, winner: true }, { name: "Bo Kim", votes: null, winner: true }] })).toThrow("UNCOUNTED_NOT_UNOPPOSED_NOMINEES");
    expect(() => normalize({ candidates: [{ name: "Ann Lee", votes: null }] })).toThrow("UNCOUNTED_NOT_UNOPPOSED_NOMINEES");
    expect(() => normalize({ candidates: [{ name: "Ann Lee", votes: null, winner: true }, { name: "Bo Kim", votes: 4 }] })).toThrow("UNCOUNTED_NOT_UNOPPOSED_NOMINEES");
  });

  it("keeps a primary nobody filed for, so the holder reads as absent from it", () => {
    expect(normalize({ candidates: [{ name: "Write-ins", votes: 3, writeIn: true }] }).candidates).toHaveLength(1);
    expect(() => normalize({ candidates: [] })).toThrow("NO_CANDIDATE_LINE");
  });

  it("matches the pinned artifact", () => {
    const pinned = readStatePrimaryResults2026();
    expect(pinned.summary.states).toBeGreaterThanOrEqual(45);
    expect(buildStatePrimaryResults2026().packageSha256).toBe(pinned.packageSha256);
  });
});

describe("primary evidence for a seat", () => {
  const row = (overrides: Partial<PreElectionSeatRow> = {}): PreElectionSeatRow => ({
    chamber: "house", seatId: "seat_house_tx_09_current", seatLabel: "TX-09", stateCode: "TX", holderName: "Al Green", holderId: "G000553", holderParty: "Democratic", scoreStatus: "scored",
    route: "democratic_incumbent_primary", score: 50, rank: 1, chamberRank: 1, nextElectionYear: 2026, openSeatSignal: null, rowSha256: "", ...overrides,
  });
  const contest = (district: string, rawParty: string, names: readonly string[], office: RawPrimaryContest["office"] = "us_house") =>
    normalizePrimaryContest({ office, district, rawParty, candidates: names.map((name, index) => ({ name, votes: 100 - index })) }, source, { stateCode: "TX", system: "partisan" });
  const index = (contests: ReturnType<typeof contest>[]) => buildPrimaryEvidenceIndex(statePrimaryEntries({ contests }));
  const green = { familyName: "Green", givenName: "Al" };

  it("keys seats by office and district", () => {
    expect(seatPrimaryKey(row())).toEqual({ office: "us_house", district: "09" });
    expect(seatPrimaryKey(row({ chamber: "state_house", seatId: "seat_state_nh_lower_belknap-1_2", seatLabel: "NH House Belknap 1" }))).toEqual({ office: "state_lower", district: "belknap 1" });
    expect(seatPrimaryKey(row({ chamber: "governor", seatId: "seat_governor_tx_current", seatLabel: "TX-Gov" }))).toEqual({ office: "governor", district: null });
  });

  it("follows a holder into another district and drops the one they left", () => {
    const found = primaryEvidenceForSeat(index([contest("9", "Democratic", ["Someone New"]), contest("18", "Democratic", ["Christian Menefee", "Al Green"])]), row(), green);
    expect(found.map((evidence) => evidence.contestId)).toEqual(["tx:primary:2026:us_house:18:democratic:primary"]);
  });

  it("keeps the district's own-party contest as evidence of absence when the holder is nowhere", () => {
    const found = primaryEvidenceForSeat(index([contest("9", "Democratic", ["Someone New"]), contest("9", "Republican", ["Al Greene"])]), row(), green);
    expect(found.map((evidence) => evidence.contestId)).toEqual(["tx:primary:2026:us_house:09:democratic:primary"]);
  });

  it("counts a party primary for a holder the roster lists as independent only when it names them", () => {
    const contests = [contest("9", "Democratic", ["Al Green", "Other"]), contest("9", "Republican", ["Someone"])];
    expect(primaryEvidenceForSeat(index(contests), row({ holderParty: "Independent" }), green).map((evidence) => evidence.party)).toEqual(["Democratic"]);
  });
});
