import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildIntakePackage, serializeIntakePackage } from "../package";
import { northCarolinaLocalGeneralSpec, parseNorthCarolinaLocalGeneral } from "./north-carolina-local-general";
import { classifyNorthCarolinaSoilWaterOffice, northCarolinaSoilWaterGeneralSpec } from "./north-carolina-soil-water-general";

describe("North Carolina soil-and-water general results", () => {
  it("accepts only explicit supervisor titles, excluding sanitary boards and ballot questions", () => {
    expect(classifyNorthCarolinaSoilWaterOffice("WAKE SOIL AND WATER CONSERVATION DISTRICT SUPERVISOR")).toMatchObject({ officeLevel: "other_local" });
    for (const title of ["WAKE COUNTY BOARD OF EDUCATION", "FIRST CRAVEN SANITARY DISTRICT BOARD MEMBER", "WAKE SOIL AND WATER CONSERVATION DISTRICT SUPERVISOR REFERENDUM"])
      expect(classifyNorthCarolinaSoilWaterOffice(title)).toBeNull();
  });

  it("uses the shared parser's duplicate, seat-count and channel reconciliation guards", () => {
    const header = ["County", "Election Date", "Precinct", "Contest Group ID", "Contest Name", "Choice", "Choice Party", "Vote For", "Election Day", "Early Voting", "Absentee by Mail", "Provisional", "Total Votes"];
    const row = ["WAKE", "11/05/2024", "01", "1", "WAKE SOIL AND WATER CONSERVATION DISTRICT SUPERVISOR", "Candidate", "", "1", "10", "0", "0", "0", "10"];
    const parse = (rows: string[][]) => parseNorthCarolinaLocalGeneral(Buffer.from(zipSync({ "results_pct_20241105.txt": strToU8([header, ...rows].map(r => r.join("\t")).join("\n")) })), (code): never => { throw new Error(code); }, classifyNorthCarolinaSoilWaterOffice);
    expect(() => parse([row, row])).toThrow("PRECINCT_CANDIDATE_DUPLICATE");
    const conflict = [...row]; conflict[2] = "02"; conflict[7] = "2";
    expect(() => parse([row, conflict])).toThrow("SEATS_CONFLICT");
    const channels = [...row]; channels[8] = "9";
    expect(() => parse([channels])).toThrow("VOTE_CHANNELS_DO_NOT_RECONCILE");
  });

  it("closes the retained archive without inferring holders, winners or scores", () => {
    const value = buildIntakePackage(northCarolinaSoilWaterGeneralSpec);
    expect(value.summary).toMatchObject({ contests: 100, candidateRows: 510, candidateVotes: 4_143_641, writeInCandidates: 382, formulaEligibleContests: 0 });
    expect(new Set(value.contests.flatMap(c => c.reportingJurisdictions))).toHaveLength(100);
    expect(value.contests.every(c => c.seats === 1 && c.sourceWinnerStatus === "not_marked_by_source" && c.currentHolderIdentity === null && !c.formulaEligible)).toBe(true);
    expect(value.contests.flatMap(c => c.candidates).every(c => c.rawParty === "")).toBe(true);
    expect(value.contests.find(c => c.rawOfficeTitle.startsWith("WAKE "))?.totalVotes).toBe(523_452);
    const legacy = buildIntakePackage(northCarolinaLocalGeneralSpec);
    expect(serializeIntakePackage(legacy)).toEqual(readFileSync("data/metadata/rapid-north-carolina-local-office-general-results-v1.json"));
    expect(value.contests.some(c => legacy.contests.some(old => old.rawOfficeTitle === c.rawOfficeTitle))).toBe(false);
  });
});
