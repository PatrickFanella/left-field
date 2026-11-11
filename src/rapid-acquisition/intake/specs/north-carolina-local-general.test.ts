import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { buildIntakePackage } from "../package";
import { classifyNorthCarolinaLocalOffice, northCarolinaLocalGeneralSpec, parseNorthCarolinaLocalGeneral } from "./north-carolina-local-general";

const header = ["County", "Election Date", "Precinct", "Contest Group ID", "Contest Name", "Choice", "Choice Party", "Vote For", "Election Day", "Early Voting", "Absentee by Mail", "Provisional", "Total Votes"];
const row = (county = "WAKE", precinct = "01", title = "CITY OF RALEIGH CITY COUNCIL AT-LARGE", name = "Candidate", votes = "10") => [county, "11/05/2024", precinct, "10", title, name, "DEM", "2", votes, "0", "0", "0", votes];
const parse = (rows: string[][]) => parseNorthCarolinaLocalGeneral(Buffer.from(zipSync({ "results_pct_20241105.txt": strToU8([header, ...rows].map((r) => r.join("\t")).join("\r\n")) })), (code): never => { throw new Error(code); });

describe("North Carolina local general results", () => {
  it("combines county segments, retains parties and multi-seat rules, and separates unexpired terms", () => {
    const result = parse([row(), row("DURHAM", "02"), row("WAKE", "03", "CITY OF RALEIGH CITY COUNCIL AT-LARGE (UNEXPIRED)")]);
    expect(result).toHaveLength(2);
    const regular = result.find((r) => !r.rawOfficeTitle.endsWith("(UNEXPIRED)"))!;
    expect(regular).toMatchObject({ seats: 2, reportingJurisdictions: ["DURHAM", "WAKE"], candidates: [{ sourceName: "Candidate", rawParty: "DEM", votes: 20 }] });
  });

  it("excludes ballot questions, retains zero-vote candidates and distinguishes write-in types", () => {
    expect(classifyNorthCarolinaLocalOffice("ALEXANDER COUNTY BOARD OF EDUCATION ELECTION METHOD")).toBeNull();
    const result = parse([row(), row("WAKE", "02", undefined, "Named (Write-In)", "0"), row("WAKE", "03", undefined, "Write-In (Miscellaneous)", "1"), row("WAKE", "04", "CITY OF RALEIGH HOUSING BONDS REFERENDUM", "FOR", "20")]);
    expect(result).toHaveLength(1);
    expect(result[0]!.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidacyKind: "named_write_in", votes: 0 }),
      expect.objectContaining({ candidacyKind: "unnamed_write_in", votes: 1 }),
    ]));
  });

  it("rejects duplicate precinct rows, conflicting seats, and unreconciled vote channels", () => {
    expect(() => parse([row(), row()])).toThrow("PRECINCT_CANDIDATE_DUPLICATE");
    const seats = row("DURHAM"); seats[7] = "1";
    expect(() => parse([row(), seats])).toThrow("SEATS_CONFLICT");
    const channels = row(); channels[8] = "9";
    expect(() => parse([channels])).toThrow("VOTE_CHANNELS_DO_NOT_RECONCILE");
  });

  it("reconciles retained source closure and preserves cross-county totals without activating scores", () => {
    const value = buildIntakePackage(northCarolinaLocalGeneralSpec);
    expect(value.summary).toMatchObject({ contests: 635, candidateRows: 1793, candidateVotes: 22_219_489, formulaEligibleContests: 0 });
    expect(new Set(value.contests.flatMap((r) => r.reportingJurisdictions))).toHaveLength(100);
    expect(value.contests.filter((r) => r.seats! > 1)).toHaveLength(135);
    expect(value.contests.filter((r) => r.reportingJurisdictions!.length > 1)).toHaveLength(12);
    expect(value.contests.find((r) => r.rawOfficeTitle === "CITY OF RALEIGH MAYOR")).toMatchObject({ totalVotes: 222_637, reportingJurisdictions: ["DURHAM", "WAKE"] });
    expect(value.contests.every((r) => r.currentHolderIdentity === null && !r.formulaEligible && r.sourceWinnerStatus === "not_marked_by_source")).toBe(true);
  });
});
