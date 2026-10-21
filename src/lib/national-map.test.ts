import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { FecCandidateMasterRow } from "@/rapid-acquisition/fec-candidate-master";
import type { FecCandidateSummaryRow } from "@/rapid-acquisition/fec-candidate-summary";

import { houseDistrictKey, seatDistrictKey, stateLegislativeDistrictKey } from "./map-district-key";
import { displayName, mapCandidates, mapStateDetail, mapSummary } from "./national-map";
import { getDefaultPriorityRepository } from "./priority-index-store";

const master = (row: Partial<FecCandidateMasterRow>): FecCandidateMasterRow => ({ candidateId: "H6XX00001", candidateName: "DOE, JANE", party: "DEM", electionYear: 2026, officeState: "NY", office: "H", officeDistrict: "14", incumbentChallengerStatus: "C", status: "C", principalCommitteeId: null, ...row });
const summary = (candidateId: string, totalReceipts: number): FecCandidateSummaryRow => ({ candidateId, candidateName: "", incumbentChallengerStatus: null, party: "", totalReceipts, totalDisbursements: 0, cashOnHandClose: totalReceipts / 2, officeState: "", officeDistrict: "", coverageEndDate: "2026-06-30" });
const national = JSON.parse(readFileSync("public/map-data/national-v1.json", "utf8")) as { states: { stateCode: string }[]; house: { stateCode: string; districtCode: string }[] };
const legislative = (stateCode: string) => JSON.parse(readFileSync(`public/map-data/state-legislative/${stateCode.toLowerCase()}-v1.json`, "utf8")) as { upper: { key: string }[]; lower: { key: string }[] };

describe("map district keys", () => {
  it("reduces Census names and index codes to the same key", () => {
    expect(stateLegislativeDistrictKey("MA", "Berkshire-Hampden-Franklin-Hampshire")).toBe(seatDistrictKey("MA", "SBerkshire, Hampden, Franklin and Hampshire"));
    expect(stateLegislativeDistrictKey("NH", "Merrimack 08")).toBe(seatDistrictKey("NH", "HMerrimack 8"));
    expect(stateLegislativeDistrictKey("CA", "019")).toBe(seatDistrictKey("CA", "S19"));
    expect(seatDistrictKey("ID", "H17A")).toBe(seatDistrictKey("ID", "H17B"));
    expect(seatDistrictKey("ID", "H17A")).toBe(stateLegislativeDistrictKey("ID", "17"));
    expect(houseDistrictKey("VT", "AL")).toBe("VT-00");
    expect(houseDistrictKey("NY", "4")).toBe("NY-04");
  });
});

describe("map candidates", () => {
  it("keeps statutory candidates for the cycle, keyed by race, most money first", () => {
    const rows = [
      master({ candidateId: "A", candidateName: "SMALL, ANN" }),
      master({ candidateId: "B", candidateName: "BIG, BOB", party: "REP" }),
      master({ candidateId: "C", status: "N" }),
      master({ candidateId: "D", electionYear: 2024 }),
      master({ candidateId: "E", office: "S", officeDistrict: "00", incumbentChallengerStatus: "I" }),
      master({ candidateId: "F", office: "P" }),
    ];
    const out = mapCandidates(rows, new Map([["A", summary("A", 10)], ["B", summary("B", 500)]]), 2026);
    expect([...out.keys()].sort()).toEqual(["NY:NY-14", "NY:senate"]);
    expect(out.get("NY:NY-14")!.map((row) => row.candidateId)).toEqual(["B", "A"]);
    expect(out.get("NY:senate")).toEqual([expect.objectContaining({ candidateId: "E", incumbent: true, receipts: null, cashOnHand: null })]);
  });

  it("writes FEC names in reading order", () => {
    expect(displayName("OCASIO-CORTEZ, ALEXANDRIA MS.")).toBe("Alexandria Ocasio-Cortez");
    expect(displayName("MCGOVERN, JAMES P JR.")).toBe("James P McGovern Jr.");
    expect(displayName("BEGICH, NICHOLAS III")).toBe("Nicholas Begich III");
  });
});

describe("map read model against the release", () => {
  const briefs = getDefaultPriorityRepository().getBriefs();

  it("fills every scored seat into a drawn polygon", () => {
    const fills = mapSummary().fills;
    const houseKeys = new Set(national.house.map((district) => houseDistrictKey(district.stateCode, district.districtCode)));
    expect(national.states).toHaveLength(51);
    expect(houseKeys.size).toBe(435);
    expect(Object.keys(fills.house).filter((key) => !houseKeys.has(key))).toEqual([]);
    const counted = (layer: keyof typeof fills) => Object.values(fills[layer]).reduce((total, fill) => total + fill.democratic + fill.republican, 0);
    for (const layer of ["house", "senate", "governor", "state_senate", "state_house"] as const) expect(counted(layer)).toBe(briefs.filter((brief) => brief.chamber === layer).length);
  });

  it("matches every scored state-legislative seat to a district polygon", () => {
    const unmatched = briefs.filter((brief) => brief.chamber === "state_house" || brief.chamber === "state_senate").filter((brief) => {
      const layer = legislative(brief.stateCode)[brief.chamber === "state_senate" ? "upper" : "lower"];
      return !layer.some((district) => district.key === seatDistrictKey(brief.stateCode, brief.districtCode));
    });
    expect(unmatched.map((brief) => brief.seatCycleId)).toEqual([]);
  });

  it("returns one state's seats and candidates, and nothing for an unknown state", () => {
    const ny = mapStateDetail("NY")!;
    expect(ny.seats.house.length).toBe(briefs.filter((brief) => brief.chamber === "house" && brief.stateCode === "NY").length);
    expect(ny.seats.senate).toHaveLength(2);
    expect(Object.keys(ny.candidates).every((key) => key === "senate" || key.startsWith("NY-"))).toBe(true);
    expect(mapStateDetail("ZZ")).toBeUndefined();
  });
});
