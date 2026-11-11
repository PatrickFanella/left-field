import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildArizona2024GeneralOpenElectionsCrosscheck, readPinnedArizona2024GeneralOpenElectionsCrosscheck } from "./arizona-2024-general";

const build = () => buildArizona2024GeneralOpenElectionsCrosscheck(readPinnedArizona2024GeneralOpenElectionsCrosscheck());
const fixture = (officialTranscription: Buffer, openElectionsFiles: readonly Buffer[]) => ({ officialTranscription, openElectionsFiles, provenance: [] });

describe("Arizona 2024 general OpenElections cross-check", () => {
  it("keeps the official canvass controlling and makes exact, differing, and source-only rows reviewable", () => {
    const value = build();
    expect(value).toMatchObject({ electionDate: "2024-11-05", comparisonDate: "2026-10-30", reviewerOnly: true, publicationEligible: false, controllingSource: "Arizona Secretary of State signed general canvass" });
    expect(value.provenance).toHaveLength(17);
    expect(value.summary).toEqual({ matched: 148, exactMatches: 124, voteDifferences: 24, officialOnly: 11, openElectionsOnly: 13 });
    expect(value.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ chamber: "lower", district: "2", candidate: "Tom Simes", status: "official_only", officialVotes: 15946, openElectionsVotes: null }),
      expect.objectContaining({ chamber: "lower", district: "3", candidate: "Alexander Kolodin", status: "matched", officialVotes: 88693, openElectionsVotes: 88683, voteDifference: -10 }),
      expect.objectContaining({ chamber: "lower", district: "3", candidate: "Joseph CHAPLICK", status: "openelections_only", officialVotes: null, openElectionsVotes: 93584 }),
    ]));
    expect(value.rows.some((row) => row.status === "matched" && row.voteDifference === 0)).toBe(true);
    expect(value.rows.some((row) => row.status === "matched" && row.voteDifference !== 0)).toBe(true);
    expect(value.rows.some((row) => row.status === "openelections_only")).toBe(true);
  });

  it("rejects malformed source rows instead of silently assigning them", () => {
    expect(() => buildArizona2024GeneralOpenElectionsCrosscheck(fixture(Buffer.from("bad\n"), []))).toThrow("AZ_GENERAL_CROSSCHECK_OFFICIAL_HEADER_INVALID");
    expect(() => buildArizona2024GeneralOpenElectionsCrosscheck(fixture(Buffer.from("page\tchamber\tdistrict\tparty\tcandidate\twrite_in\tvotes\n7\tupper\t1\tREP\tX\tno\t1\n"), [Buffer.from("county,precinct,office,district,party,candidate,votes\nA,P,State Senate,1,REP,X,no\n")]))).toThrow("AZ_GENERAL_CROSSCHECK_OE_ROW_INVALID");
  });

  it("rejects duplicate, colliding, and unsafe OpenElections candidate rows", () => {
    const official = Buffer.from("page\tchamber\tdistrict\tparty\tcandidate\twrite_in\tvotes\n7\tupper\t1\tREP\tX\tno\t1\n");
    const header = "county,precinct,office,district,party,candidate,votes\n";
    expect(() => buildArizona2024GeneralOpenElectionsCrosscheck(fixture(official, [Buffer.from(`${header}A,P,State Senate,1,REP,X,1\nA,P,State Senate,1,REP,X,1\n`)]))).toThrow("AZ_GENERAL_CROSSCHECK_OE_DUPLICATE");
    expect(() => buildArizona2024GeneralOpenElectionsCrosscheck(fixture(official, [Buffer.from(`${header}A,P,State Senate,1,REP,X-Y,1\nA,P,State Senate,1,REP,XY,1\n`)]))).toThrow("AZ_GENERAL_CROSSCHECK_OE_NORMALIZED_COLLISION");
    expect(() => buildArizona2024GeneralOpenElectionsCrosscheck(fixture(official, [Buffer.from(`${header}A,P,State Senate,1,REP,X,9007199254740992\n`)]))).toThrow("AZ_GENERAL_CROSSCHECK_OE_ROW_INVALID");
    const sameRow = Buffer.from(`${header}A,P,State Senate,1,REP,X,1\n`);
    expect(() => buildArizona2024GeneralOpenElectionsCrosscheck(fixture(official, [sameRow, sameRow]))).toThrow("AZ_GENERAL_CROSSCHECK_OE_DUPLICATE");
    expect(() => buildArizona2024GeneralOpenElectionsCrosscheck(fixture(official, [Buffer.from(`${header}A,P,State Senate,1,REP,X,9007199254740991\nA,Q,State Senate,1,REP,X,1\n`)]))).toThrow("AZ_GENERAL_CROSSCHECK_OE_TOTAL_INVALID");
  });

  it("reproduces the checked reviewer-only report", () => {
    expect(JSON.parse(readFileSync("docs/reviews/arizona-2024-general-openelections-crosscheck-v1.json", "utf8"))).toEqual(build());
  });
});
