import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildIntakePackage, serializeIntakePackage } from "../package";
import { northCarolinaLocalGeneralSpec, parseNorthCarolinaLocalGeneral } from "./north-carolina-local-general";
import { northCarolinaSoilWaterGeneralSpec } from "./north-carolina-soil-water-general";
import { classifyNorthCarolinaSanitaryOffice, northCarolinaSanitaryGeneralSpec } from "./north-carolina-sanitary-general";

describe("North Carolina sanitary-district general results", () => {
  it("accepts only retained ballot titles, excluding questions and other office families", () => {
    expect(classifyNorthCarolinaSanitaryOffice("HANDY SANITARY DISTRICT SUPERVISOR")).toMatchObject({ officeLevel: "other_local" });
    for (const title of ["HANDY SANITARY DISTRICT SUPERVISOR REFERENDUM", "UNKNOWN SANITARY DISTRICT BOARD MEMBER", "WAKE SOIL AND WATER CONSERVATION DISTRICT SUPERVISOR"])
      expect(classifyNorthCarolinaSanitaryOffice(title)).toBeNull();
  });

  it("reconciles county segments and keeps regular and unexpired contests distinct", () => {
    const value = buildIntakePackage(northCarolinaSanitaryGeneralSpec);
    expect(value.summary).toMatchObject({ contests: 14, candidateRows: 51, candidateVotes: 24_789, formulaEligibleContests: 0 });
    expect(new Set(value.contests.flatMap(c => c.reportingJurisdictions))).toHaveLength(11);
    expect(value.contests.filter(c => c.reportingJurisdictions!.length > 1)).toHaveLength(2);
    expect(value.contests.filter(c => c.seats! > 1)).toHaveLength(12);
    expect(value.contests.find(c => c.rawOfficeTitle === "HANDY SANITARY DISTRICT SUPERVISOR")).toMatchObject({ seats: 2, totalVotes: 5_244, reportingJurisdictions: ["DAVIDSON", "MONTGOMERY"] });
    expect(value.contests.find(c => c.rawOfficeTitle === "WHITTIER SANITARY DISTRICT BOARD MEMBERS")).toMatchObject({ seats: 3, totalVotes: 197, reportingJurisdictions: ["JACKSON", "SWAIN"] });
    expect(value.contests.find(c => c.rawOfficeTitle === "HAYWOOD - JUNALUSKA SANITARY DISTRICT")).toMatchObject({ seats: 3, totalVotes: 4_241 });
    expect(value.contests.find(c => c.rawOfficeTitle === "HAYWOOD - JUNALUSKA SANITARY DISTRICT (UNEXPIRED)")).toMatchObject({ seats: 1, totalVotes: 1_619 });
    expect(value.contests.find(c => c.rawOfficeTitle === "HYDE - ENGELHARD SANITARY DISTRICT SUPERVISORS (UNEXPIRED)")).toMatchObject({ seats: 2, totalVotes: 187 });
    expect(value.contests.every(c => c.sourceWinnerStatus === "not_marked_by_source" && c.currentHolderIdentity === null && !c.formulaEligible)).toBe(true);
    expect(value.contests.flatMap(c => c.candidates).every(c => c.rawParty === "")).toBe(true);
    expect(value.contests.flatMap(c => c.candidates).some(c => c.candidacyKind === "named_write_in")).toBe(true);
    expect(value.contests.flatMap(c => c.candidates).some(c => c.candidacyKind === "unnamed_write_in")).toBe(true);
    for (const spec of [northCarolinaLocalGeneralSpec, northCarolinaSoilWaterGeneralSpec])
      expect(serializeIntakePackage(buildIntakePackage(spec))).toEqual(readFileSync(`data/metadata/${spec.id}.json`));
  });

  it("rejects duplicate precinct rows, conflicting seats, and unreconciled votes", () => {
    const header = ["County", "Election Date", "Precinct", "Contest Group ID", "Contest Name", "Choice", "Choice Party", "Vote For", "Election Day", "Early Voting", "Absentee by Mail", "Provisional", "Total Votes"];
    const row = ["DAVIDSON", "11/05/2024", "01", "1", "HANDY SANITARY DISTRICT SUPERVISOR", "Candidate", "", "2", "10", "0", "0", "0", "10"];
    const parse = (rows: string[][]) => parseNorthCarolinaLocalGeneral(Buffer.from(zipSync({ "results_pct_20241105.txt": strToU8([header, ...rows].map(r => r.join("\t")).join("\n")) })), (code): never => { throw new Error(code); }, classifyNorthCarolinaSanitaryOffice);
    expect(() => parse([row, row])).toThrow("PRECINCT_CANDIDATE_DUPLICATE");
    const conflict = [...row]; conflict[0] = "MONTGOMERY"; conflict[7] = "3";
    expect(() => parse([row, conflict])).toThrow("SEATS_CONFLICT");
    const channels = [...row]; channels[8] = "9";
    expect(() => parse([channels])).toThrow("VOTE_CHANNELS_DO_NOT_RECONCILE");
  });
});
