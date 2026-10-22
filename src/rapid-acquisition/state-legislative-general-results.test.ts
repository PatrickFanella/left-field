import { describe, expect, it } from "vitest";

import { readSourceLock } from "./intake/source-lock";
import { buildStateLegislativeGeneralResults, generalPartyOf, readStateLegislativeGeneralResults, type StateGeneralAdapter } from "./state-legislative-general-results";
import { CALIFORNIA_GENERAL } from "./state-general/california";
import { GEORGIA_GENERAL } from "./state-general/georgia";
import { ILLINOIS_GENERAL } from "./state-general/illinois";
import { NEW_YORK_GENERAL } from "./state-general/new-york";
import { PENNSYLVANIA_GENERAL } from "./state-general/pennsylvania";
import { COLORADO_GENERAL } from "./state-general/colorado";
import { ALASKA_GENERAL } from "./state-general/alaska";
import { ARIZONA_GENERAL } from "./state-general/arizona";
import { MICHIGAN_GENERAL } from "./state-general/michigan";
import { NEVADA_GENERAL } from "./state-general/nevada";
import { OHIO_GENERAL } from "./state-general/ohio";
import { ARKANSAS_GENERAL } from "./state-general/arkansas";
import { HAWAII_GENERAL } from "./state-general/hawaii";
import { VERMONT_GENERAL } from "./state-general/vermont";
import { MASSACHUSETTS_GENERAL } from "./state-general/massachusetts";
import { WYOMING_GENERAL } from "./state-general/wyoming";
import { KANSAS_GENERAL } from "./state-general/kansas";
import { MISSOURI_GENERAL } from "./state-general/missouri";
import { NEW_JERSEY_GENERAL, ordinalWord } from "./state-general/new-jersey";
import { TEXAS_GENERAL } from "./state-general/texas";
import { KENTUCKY_GENERAL } from "./state-general/kentucky";
import { cells } from "./state-general/layout-columns";
import { OREGON_GENERAL } from "./state-general/oregon";
import { DELAWARE_GENERAL } from "./state-general/delaware";
import { INDIANA_GENERAL } from "./state-general/indiana";
import { IDAHO_GENERAL } from "./state-general/idaho";
import { IOWA_GENERAL } from "./state-general/iowa";
import { MONTANA_GENERAL } from "./state-general/montana";
import { UTAH_GENERAL } from "./state-general/utah";
import { RHODE_ISLAND_GENERAL } from "./state-general/rhode-island";
import { SOUTH_CAROLINA_GENERAL } from "./state-general/south-carolina";
import { TENNESSEE_GENERAL } from "./state-general/tennessee";
import { WEST_VIRGINIA_GENERAL } from "./state-general/west-virginia";
import { FLORIDA_GENERAL } from "./state-general/florida";
import { MAINE_GENERAL } from "./state-general/maine";
import { CONNECTICUT_GENERAL } from "./state-general/connecticut";
import { MARYLAND_GENERAL } from "./state-general/maryland";
import { NORTH_CAROLINA_GENERAL } from "./state-general/north-carolina";
import { WASHINGTON_GENERAL, washingtonPreference } from "./state-general/washington";
import { VIRGINIA_GENERAL } from "./state-general/virginia";
import { WISCONSIN_GENERAL } from "./state-general/wisconsin";
import { MINNESOTA_GENERAL } from "./state-general/minnesota";
import { NEW_MEXICO_GENERAL } from "./state-general/new-mexico";
import { NORTH_DAKOTA_GENERAL } from "./state-general/north-dakota";
import { SOUTH_DAKOTA_GENERAL } from "./state-general/south-dakota";

describe("state-legislative general results", () => {
  it("maps source party labels to caucus families", () => {
    expect(["D", "DEM", "Dem", "Democratic", "DFL", "Democratic-Farmer-Labor"].map(generalPartyOf)).toEqual(Array(6).fill("Democratic"));
    expect(["R", "REP", "Rep", "Republican", "GOP"].map(generalPartyOf)).toEqual(Array(5).fill("Republican"));
    expect(["", "I", "IND", "Independent", "NPA", "Nonpartisan"].map(generalPartyOf)).toEqual(Array(6).fill("Independent"));
    expect(["L", "Lib", "Grn", "Working Families", "Conservative"].map(generalPartyOf)).toEqual(Array(5).fill("Other"));
  });

  it("normalizes a synthetic adapter: margins, uncontested flags, multi-member totals", () => {
    const lock = readSourceLock();
    // Borrow a retained file so readRetainedSource succeeds; the parser ignores its bytes.
    const source = { ...GEORGIA_GENERAL.sources[0]!, cycleYear: 2024, electionDate: "2024-11-05" };
    const adapter: StateGeneralAdapter = {
      stateCode: "ZZ", authority: "synthetic", sources: [source], expectedContests: { [source.id]: 4 },
      parse: () => [
        { chamber: "lower", district: "1", candidates: [{ name: "A", rawParty: "D", votes: 600 }, { name: "B", rawParty: "R", votes: 400 }] },
        { chamber: "lower", district: "2", candidates: [{ name: "C", rawParty: "R", votes: 900 }, { name: "Write-In", rawParty: "", votes: 10, writeIn: true }] },
        { chamber: "upper", district: "3", seats: 2, candidates: [{ name: "D1", rawParty: "D", votes: 500 }, { name: "D2", rawParty: "D", votes: 450 }, { name: "R1", rawParty: "R", votes: 300 }, { name: "R2", rawParty: "R", votes: 250 }] },
        { chamber: "lower", district: "Rockingham 13", candidates: [{ name: "E", rawParty: "D", votes: 0 }] },
      ],
    };
    const value = buildStateLegislativeGeneralResults(process.cwd(), lock, [adapter]);
    const byKey = new Map(value.contests.map((contest) => [`${contest.chamber}|${contest.districtKey}`, contest]));
    expect(byKey.get("lower|1")).toMatchObject({ democraticMarginPercentagePoints: 20, contested: true, totalVotes: 1000 });
    expect(byKey.get("lower|2")).toMatchObject({ democraticMarginPercentagePoints: -98.9, contested: false, republicanVotes: 900 });
    expect(byKey.get("upper|3")).toMatchObject({ seats: 2, democraticVotes: 950, republicanVotes: 550, democraticMarginPercentagePoints: 26.7, contested: true });
    expect(byKey.get("lower|rockingham 13")).toMatchObject({ democraticMarginPercentagePoints: 100, contested: false, totalVotes: 0 });
    expect(value.states).toEqual([{ stateCode: "ZZ", sourceIds: [source.id], cycles: [2024], contests: 4, lowerContests: 3, upperContests: 1, uncontested: 2, candidateVotes: 3410 }]);
    expect(value.summary).toEqual({ states: 1, contests: 4, uncontested: 2, candidateVotes: 3410, multiMemberContests: 1 });
  });

  it("fails closed when an adapter reports fewer contests than declared", () => {
    const source = GEORGIA_GENERAL.sources[0]!;
    const adapter: StateGeneralAdapter = { stateCode: "ZZ", authority: "synthetic", sources: [source], expectedContests: { [source.id]: 2 }, parse: () => [{ chamber: "lower", district: "1", candidates: [{ name: "A", rawParty: "D", votes: 1 }] }] };
    expect(() => buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [adapter])).toThrow("STATE_LEG_GENERAL_CONTEST_COUNT");
  });

  it("reads Georgia and Virginia from the retained official files", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [GEORGIA_GENERAL, VIRGINIA_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.cycles])).toEqual([["GA", 236, 180, 56, [2024]], ["VA", 240, 200, 40, [2023, 2025]]]);
    const ga1 = value.contests.find((contest) => contest.contestId === "ga:state-leg-general:2024:upper:1");
    expect(ga1).toMatchObject({ contested: false, democraticMarginPercentagePoints: -100, candidates: [{ name: "Ben Watson", party: "Republican", votes: 76992 }] });
    const va1 = value.contests.find((contest) => contest.contestId === "va:state-leg-general:2025:lower:1");
    expect(va1).toMatchObject({ totalVotes: 41541, democraticVotes: 33850, republicanVotes: 7595, democraticMarginPercentagePoints: 63.2, contested: true });
    expect(va1?.candidates.find((candidate) => candidate.writeIn)).toMatchObject({ votes: 96, party: "Independent" });
    expect(value.summary.multiMemberContests).toBe(0);
  });

  it("reads California top-two and New York fusion returns", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [CALIFORNIA_GENERAL, NEW_YORK_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.cycles])).toEqual([["CA", 200, 160, 40, [2022, 2024]], ["NY", 213, 150, 63, [2024]]]);
    const ca = value.contests.filter((contest) => contest.stateCode === "CA");
    expect(ca.filter((contest) => contest.cycleYear === 2024 && contest.chamber === "upper").map((contest) => Number(contest.district) % 2)).toEqual(Array(20).fill(1));
    const sameParty = ca.find((contest) => contest.candidates.length === 2 && contest.candidates.every((candidate) => candidate.party === "Democratic"));
    expect(sameParty).toMatchObject({ contested: true, democraticMarginPercentagePoints: 100 });
    const ramos = value.contests.find((contest) => contest.contestId === "ny:state-leg-general:2024:upper:13");
    expect(ramos).toMatchObject({ contested: false, democraticMarginPercentagePoints: 98.4, candidates: [{ name: "Jessica Ramos", party: "Democratic", votes: 48367 }, { name: "Scattering", writeIn: true, votes: 810 }] });
    const fused = value.contests.flatMap((contest) => contest.candidates).filter((candidate) => candidate.rawParty.includes("also"));
    expect(fused.map((candidate) => [candidate.name, candidate.party])).toEqual([["Kalman Yeger", "Democratic"], ["Jaime R. Williams", "Democratic"], ["Simcha Felder", "Republican"]]);
    expect(value.contests.flatMap((contest) => contest.candidates).some((candidate) => ["Blank", "Void", "Total Votes"].includes(candidate.name))).toBe(false);
  });

  it("reads Illinois totals and Wisconsin canvass sheets", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [ILLINOIS_GENERAL, WISCONSIN_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.cycles])).toEqual([["IL", 319, 236, 83, [2022, 2024]], ["WI", 132, 99, 33, [2022, 2024]]]);
    const il31 = value.contests.find((contest) => contest.contestId === "il:state-leg-general:2024:upper:31");
    expect(il31?.candidates.map((candidate) => [candidate.name.toUpperCase(), candidate.party, candidate.votes])).toEqual([["MARY EDLY-ALLEN", "Democratic", 52654], ["ASHLEY JENSEN", "Republican", 37880]]);
    expect(value.contests.filter((contest) => contest.stateCode === "IL").flatMap((contest) => contest.candidates).filter((candidate) => candidate.writeIn).every((candidate) => candidate.rawParty === "" && candidate.votes < 1000)).toBe(true);
    const wi1 = value.contests.find((contest) => contest.contestId === "wi:state-leg-general:2024:lower:1");
    expect(wi1).toMatchObject({ totalVotes: 38929, democraticVotes: 14801, republicanVotes: 24101, contested: true });
    expect(wi1?.candidates.filter((candidate) => candidate.writeIn).map((candidate) => [candidate.name, candidate.votes])).toEqual([["Scattering", 22], ["Milt Swagel", 5]]);
    const wiSenate = value.contests.filter((contest) => contest.stateCode === "WI" && contest.chamber === "upper");
    expect(wiSenate.filter((contest) => contest.cycleYear === 2024).map((contest) => Number(contest.district) % 2)).toEqual(Array(16).fill(0));
    expect(wiSenate.filter((contest) => contest.cycleYear === 2022)).toHaveLength(17);
  });

  it("sums Pennsylvania precinct returns and resolves the listed cross-filed candidate", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [PENNSYLVANIA_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.cycles])).toEqual([["PA", 456, 406, 50, [2022, 2024]]]);
    expect(value.contests.find((contest) => contest.contestId === "pa:state-leg-general:2024:upper:1")?.candidates).toEqual([{ name: "Nikil Saval", rawParty: "DEM", party: "Democratic", votes: 109193, writeIn: false }]);
    expect(value.contests.find((contest) => contest.contestId === "pa:state-leg-general:2024:lower:32")).toMatchObject({ contested: false, democraticMarginPercentagePoints: 100, candidates: [{ rawParty: "D/R", party: "Democratic", votes: 31207 }] });
    const senate2024 = value.contests.filter((contest) => contest.chamber === "upper" && contest.cycleYear === 2024).map((contest) => Number(contest.district) % 2);
    expect(senate2024).toEqual(Array(25).fill(1));
  });

  it("reads Washington positions, Maryland multi-member districts, Connecticut fusion, Colorado and North Carolina", () => {
    expect(["(Prefers Democratic Party)", "(Prefers GOP Party)", "(States No Party Preference)", "(Prefers Culture Republican Party)"].map(washingtonPreference)).toEqual(["Democratic", "GOP", "No Party Preference", "Culture Republican"]);
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [COLORADO_GENERAL, CONNECTICUT_GENERAL, MARYLAND_GENERAL, NORTH_CAROLINA_GENERAL, WASHINGTON_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests])).toEqual([["CO", 165, 130, 35], ["CT", 187, 151, 36], ["MD", 118, 71, 47], ["NC", 170, 120, 50], ["WA", 246, 196, 50]]);
    const wa = value.contests.find((contest) => contest.contestId === "wa:state-leg-general:2024:lower:1:pos-1");
    expect(wa).toMatchObject({ position: "1", democraticVotes: 55168, republicanVotes: 24467, totalVotes: 79741 });
    const md = value.contests.filter((contest) => contest.stateCode === "MD" && contest.chamber === "lower");
    expect(md.reduce((sum, contest) => sum + contest.seats, 0)).toBe(141);
    expect(md.find((contest) => contest.districtKey === "1a")).toMatchObject({ seats: 1, democraticVotes: 2829, republicanVotes: 11971 });
    expect(value.contests.find((contest) => contest.contestId === "ct:state-leg-general:2024:upper:1")).toMatchObject({ totalVotes: 21208, democraticVotes: 18512 });
    expect(value.contests.find((contest) => contest.contestId === "co:state-leg-general:2024:upper:2")).toMatchObject({ democraticMarginPercentagePoints: -23.9 });
    expect(value.contests.find((contest) => contest.contestId === "nc:state-leg-general:2024:lower:1")).toMatchObject({ democraticVotes: 17160, republicanVotes: 31950 });
  });

  it("reads Florida contested races only and Maine stacked district blocks", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [FLORIDA_GENERAL, MAINE_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.cycles])).toEqual([["FL", 136, 105, 31, [2022, 2024]], ["ME", 186, 151, 35, [2024]]]);
    expect(value.contests.filter((contest) => contest.stateCode === "FL" && contest.cycleYear === 2022).every((contest) => contest.chamber === "upper" && Number(contest.district) % 2 === 0)).toBe(true);
    expect(value.contests.find((contest) => contest.contestId === "me:state-leg-general:2024:upper:2")?.candidates.map((candidate) => [candidate.name, candidate.party, candidate.votes])).toEqual([["Harold L. Stewart III", "Republican", 13695], ["Matthew J. Rush", "Democratic", 6999]]);
  });

  it("reads the fifth batch: Delaware, Indiana, Rhode Island, South Carolina, Tennessee, West Virginia", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [DELAWARE_GENERAL, INDIANA_GENERAL, RHODE_ISLAND_GENERAL, SOUTH_CAROLINA_GENERAL, TENNESSEE_GENERAL, WEST_VIRGINIA_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests])).toEqual([["DE", 113, 82, 31], ["IN", 250, 200, 50], ["RI", 113, 75, 38], ["SC", 170, 124, 46], ["TN", 231, 198, 33], ["WV", 234, 200, 34]]);
    expect(value.contests.find((contest) => contest.contestId === "sc:state-leg-general:2024:upper:35")?.candidates.map((candidate) => [candidate.name, candidate.party, candidate.votes])).toEqual([["Jeffrey R Graham", "Democratic", 25284], ["Mike Jones", "Republican", 23095], ["Write-In", "Independent", 77]]);
    expect(value.contests.find((contest) => contest.contestId === "ri:state-leg-general:2024:upper:1")?.candidates[0]).toMatchObject({ name: "Jacob Bissaillon", party: "Democratic" });
    expect(value.contests.filter((contest) => contest.stateCode === "WV" && contest.chamber === "upper").map((contest) => contest.position).sort()).toEqual([...Array(17).fill("2022"), ...Array(17).fill("2024")]);
    expect(value.contests.find((contest) => contest.contestId === "tn:state-leg-general:2024:lower:1")).toMatchObject({ contested: false, democraticMarginPercentagePoints: -100 });
  });

  it("reads the sixth batch: Idaho seats, Iowa, Montana and Utah", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [IDAHO_GENERAL, IOWA_GENERAL, MONTANA_GENERAL, UTAH_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests])).toEqual([["IA", 259, 200, 59], ["ID", 105, 70, 35], ["MT", 252, 200, 52], ["UT", 90, 75, 15]]);
    const idaho = value.contests.filter((contest) => contest.stateCode === "ID" && contest.chamber === "lower");
    expect(idaho.every((contest) => /^\d+[AB]$/.test(contest.district))).toBe(true);
    expect(value.contests.flatMap((contest) => contest.candidates).some((candidate) => ["Overvotes", "Undervotes"].includes(candidate.name))).toBe(false);
  });

  it("reads the seventh batch: Alaska first-choice totals, Arkansas, Hawaii contested races, Vermont multi-member districts", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [ALASKA_GENERAL, ARKANSAS_GENERAL, HAWAII_GENERAL, VERMONT_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests])).toEqual([["AK", 60, 40, 20], ["AR", 118, 100, 18], ["HI", 43, 35, 8], ["VT", 125, 109, 16]]);
    expect(value.contests.find((contest) => contest.contestId === "ak:state-leg-general:2022:upper:a")?.candidates.map((candidate) => [candidate.name, candidate.votes])).toEqual([["Bert K. Stedman", 8902], ["Mike Sheldon", 3941], ["Write-in", 98]]);
    expect(value.contests.find((contest) => contest.contestId === "hi:state-leg-general:2024:upper:3")?.candidates.map((candidate) => [candidate.name, candidate.party])).toEqual([["Dru Mamo Kanuha", "Democratic"], ["Kurt (Sulli) Sullivan", "Republican"]]);
    expect(value.contests.find((contest) => contest.contestId === "vt:state-leg-general:2024:upper:addison")).toMatchObject({ seats: 2, democraticVotes: 22713, republicanVotes: 19856 });
    expect(value.contests.filter((contest) => contest.stateCode === "VT").every((contest) => contest.electionDate === "2024-11-05")).toBe(true);
  });

  it("reads Massachusetts search pages and Wyoming summary blocks", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [MASSACHUSETTS_GENERAL, WYOMING_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests])).toEqual([["MA", 200, 160, 40], ["WY", 93, 62, 31]]);
    expect(value.contests.find((contest) => contest.contestId === "ma:state-leg-general:2024:lower:1st-barnstable")).toMatchObject({ democraticVotes: 15607, republicanVotes: 11996, totalVotes: 27638 });
    expect(value.contests.filter((contest) => contest.stateCode === "MA" && contest.chamber === "upper").every((contest) => !/^\d/.test(contest.district) && !contest.district.includes("&"))).toBe(true);
    expect(value.contests.find((contest) => contest.contestId === "wy:state-leg-general:2024:lower:1")?.candidates.map((candidate) => [candidate.name, candidate.votes])).toEqual([["Chip Neiman", 5096], ["Write-Ins", 124]]);
  });

  it("reads Texas, and the PDF-extract states Kansas, Missouri and New Jersey", () => {
    expect(["First", "Twelfth", "Twentieth", "Thirty-Fifth", "Fortieth"].map(ordinalWord)).toEqual([1, 12, 20, 35, 40]);
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [KANSAS_GENERAL, MISSOURI_GENERAL, NEW_JERSEY_GENERAL, TEXAS_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests])).toEqual([["KS", 165, 125, 40], ["MO", 360, 326, 34], ["NJ", 80, 40, 40], ["TX", 186, 150, 36]]);
    expect(value.contests.find((contest) => contest.contestId === "ks:state-leg-general:2024:upper:5")).toMatchObject({ democraticVotes: 15701, republicanVotes: 15732 });
    expect(value.contests.find((contest) => contest.contestId === "mo:state-leg-general:2024:lower:4")).toMatchObject({ democraticVotes: 2916, republicanVotes: 14066 });
    expect(value.contests.find((contest) => contest.contestId === "nj:state-leg-general:2025:lower:2")).toMatchObject({ seats: 2, democraticVotes: 78775, republicanVotes: 78523, totalVotes: 157298 });
    expect(value.contests.find((contest) => contest.contestId === "tx:state-leg-general:2024:upper:6")?.candidates.map((candidate) => [candidate.name, candidate.votes])).toEqual([["CAROL ALVARADO", 119280], ["MARTHA FIERRO", 70013]]);
    expect(value.contests.filter((contest) => contest.stateCode === "TX" && contest.cycleYear === 2022).every((contest) => contest.chamber === "upper")).toBe(true);
  });

  it("reads the column-layout PDFs for Kentucky and Oregon", () => {
    expect(cells(" Jackson        0        0        0").map((cell) => cell.text)).toEqual(["Jackson", "0", "0", "0"]);
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [KENTUCKY_GENERAL, OREGON_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests])).toEqual([["KY", 119, 100, 19], ["OR", 150, 120, 30]]);
    expect(value.contests.find((contest) => contest.contestId === "ky:state-leg-general:2024:lower:66")?.candidates.map((candidate) => [candidate.name, candidate.party, candidate.votes])).toEqual([["T. J. ROBERTS", "Republican", 16368], ["Peggy HOUSTON-NIENABER", "Democratic", 6861]]);
    expect(value.contests.find((contest) => contest.contestId === "or:state-leg-general:2024:lower:46")?.candidates.map((candidate) => [candidate.name, candidate.votes])).toEqual([["Willy Chotzen", 25542], ["John Mark Alexander", 4414], ["Kevin Levy", 1252], ["Austin Daniel", 1040], ["Misc.", 58]]);
    expect(value.contests.filter((contest) => contest.stateCode === "OR" && contest.chamber === "upper").map((contest) => contest.district).length).toBe(30);
  });

  it("reads Minnesota text files, New Mexico results JSON, North Dakota results pages and the South Dakota canvass", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [MINNESOTA_GENERAL, NEW_MEXICO_GENERAL, NORTH_DAKOTA_GENERAL, SOUTH_DAKOTA_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.cycles])).toEqual([["MN", 202, 134, 68, [2022, 2024]], ["ND", 119, 62, 57, [2022, 2024]], ["NM", 112, 70, 42, [2024]], ["SD", 72, 37, 35, [2024]]]);
    const votes = (id: string) => value.contests.find((contest) => contest.contestId === id)?.candidates.map((candidate) => [candidate.name, candidate.party, candidate.votes]);
    expect(value.contests.find((contest) => contest.contestId === "mn:state-leg-general:2024:upper:45")).toMatchObject({ electionKind: "special_general", democraticVotes: 29791, republicanVotes: 26969 });
    expect(votes("mn:state-leg-general:2024:lower:2a")).toEqual([["Bidal Duran Jr", "Republican", 11518], ["Reed Olson", "Democratic", 10667], ["Write-in", "Independent", 26]]);
    expect(votes("nd:state-leg-general:2024:lower:4a")).toEqual([["Lisa Finley-DeVille", "Democratic", 1627], ["Ronald Brugh", "Republican", 919], ["Write-in", "Independent", 15]]);
    // New Mexico House 57 takes the December 2024 automatic recount.
    expect(votes("nm:state-leg-general:2024:lower:57")).toEqual([["CATHERINE JEANETTE CULLEN", "Republican", 8373], ["MICHELLE ELEANOR SANDOVAL", "Democratic", 8240]]);
    expect(value.contests.find((contest) => contest.contestId === "sd:state-leg-general:2024:lower:15")).toMatchObject({ seats: 2, democraticVotes: 8915, republicanVotes: 8275 });
  });

  it("reads the reviewed transcription of Arizona's scanned canvass", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [ARIZONA_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.uncontested, state.cycles])).toEqual([["AZ", 60, 30, 30, 11, [2024]]]);
    expect(value.contests.every((contest) => contest.seats === (contest.chamber === "lower" ? 2 : 1))).toBe(true);
    const votes = (id: string) => value.contests.find((contest) => contest.contestId === id)?.candidates.map((candidate) => [candidate.name, candidate.party, candidate.votes, candidate.writeIn]);
    // Tom Simes is missing from the OpenElections precinct files; his total was confirmed from the scan.
    expect(votes("az:state-leg-general:2024:lower:2")).toEqual([["Stephanie Simacek", "Democratic", 47801, false], ["Justin Wilmeth", "Republican", 46942, false], ["Ari Daniel Bradshaw", "Republican", 46810, false], ["Tom Simes", "Independent", 15946, false]]);
    // OCR read this write-in's total as 1,152; the scan reads 1,112. A lone named candidate is uncontested.
    expect(value.contests.find((contest) => contest.contestId === "az:state-leg-general:2024:upper:28")).toMatchObject({ contested: false, democraticVotes: 1112, republicanVotes: 97174 });
    expect(votes("az:state-leg-general:2024:upper:30")).toEqual([["Hildy Angius", "Republican", 92213, false], ["J'aime MorgAine", "Democratic", 25295, false]]);
    const source = ARIZONA_GENERAL.sources[0]!, noCompanion = (): Buffer => Buffer.alloc(0);
    expect(() => ARIZONA_GENERAL.parse(Buffer.from("page\tchamber\tdistrict\tparty\tcandidate\twrite_in\tvotes\n7\tupper\t31\tREP\tX\tno\t1\n"), source, noCompanion)).toThrow("ARIZONA_GENERAL_ROW");
    expect(() => ARIZONA_GENERAL.parse(Buffer.from("chamber\tdistrict\n"), source, noCompanion)).toThrow("ARIZONA_GENERAL_HEADER");
  });

  it("reads the archived Michigan Senate page, Nevada results with candidate-list parties, and Ohio canvass workbooks", () => {
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [MICHIGAN_GENERAL, NEVADA_GENERAL, OHIO_GENERAL]);
    expect(value.states.map((state) => [state.stateCode, state.contests, state.lowerContests, state.upperContests, state.cycles])).toEqual([["MI", 38, 0, 38, [2022]], ["NV", 105, 84, 21, [2022, 2024]], ["OH", 232, 198, 34, [2022, 2024]]]);
    const votes = (id: string) => value.contests.find((contest) => contest.contestId === id)?.candidates.map((candidate) => [candidate.name, candidate.party, candidate.votes]);
    expect(votes("mi:state-leg-general:2022:upper:1")).toEqual([["Geiss, Erika", "Democratic", 53475], ["Soderquist, Erik", "Republican", 21243]]);
    // Nevada party comes from the Legislative Counsel Bureau list; No Political Party is Independent.
    expect(votes("nv:state-leg-general:2024:upper:3")).toEqual([["NGUYEN, ROCHELLE", "Democratic", 28254], ["HOWARD, BRENT", "Republican", 21215], ["JONES, KEYA \"KJ\"", "Independent", 2078]]);
    expect(votes("nv:state-leg-general:2022:lower:26")).toEqual([["DELONG, RICH", "Republican", 23964], ["MITCHELL, REED", "Other", 9455]]);
    expect(value.contests.find((contest) => contest.contestId === "oh:state-leg-general:2024:upper:33")).toMatchObject({ electionKind: "special_general" });
    expect(votes("oh:state-leg-general:2024:upper:2")).toEqual([["Theresa Gavarone", "Republican", 111096], ["Paloma De La Fuente", "Democratic", 68948]]);
  });

  it("matches the pinned artifact", () => {
    const pinned = readStateLegislativeGeneralResults();
    expect(pinned.packageSha256).toBe(buildStateLegislativeGeneralResults().packageSha256);
  });
});

describe("West Virginia Senate seat positions", () => {
  it("files each cycle under the seat it refills", async () => {
    const { senateSeatCycle } = await import("./state-general/west-virginia");
    expect([2022, 2024, 2026, 2028, 2030].map(senateSeatCycle)).toEqual([2022, 2024, 2022, 2024, 2022]);
  });
});

describe("unofficial returns", () => {
  it("marks contests and the state summary when a source is unofficial", async () => {
    const { WEST_VIRGINIA_GENERAL } = await import("./state-general/west-virginia");
    const unofficial: StateGeneralAdapter = { ...WEST_VIRGINIA_GENERAL, sources: WEST_VIRGINIA_GENERAL.sources.map((source) => source.cycleYear === 2024 ? { ...source, resultStatus: "unofficial" as const } : source) };
    const value = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [unofficial]);
    expect(value.states[0]?.unofficialSourceIds).toEqual(["wv-2024-general-clarity-summary-zip"]);
    expect(value.contests.filter((contest) => contest.resultStatus === "unofficial").every((contest) => contest.cycleYear === 2024)).toBe(true);
    expect(value.contests.filter((contest) => contest.resultStatus === "unofficial")).toHaveLength(117);
    const certified = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), [WEST_VIRGINIA_GENERAL]);
    expect(certified.states[0]).not.toHaveProperty("unofficialSourceIds");
    expect(certified.contests.some((contest) => "resultStatus" in contest)).toBe(false);
  });
});
