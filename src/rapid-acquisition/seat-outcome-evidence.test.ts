import { describe, expect, it } from "vitest";

import { countStatusOf, readHousePrimaryEvidence2026, readStateLegislativePrimaryEvidence2026 } from "./seat-outcome-evidence";

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
