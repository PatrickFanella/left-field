import { describe, expect, it } from "vitest";

import { buildSeatOutcomeLedger, readSeatOutcomeLedger, scoreBandOf } from "./seat-outcome-ledger";
import { OUTCOMES } from "./seat-outcome-resolver";

const total = (counts: Readonly<Record<string, number>>): number => Object.values(counts).reduce((sum, value) => sum + value, 0);

describe("seat outcome ledger", () => {
  it("bands scores at 70 and 50", () => {
    expect([80, 70, 69.9, 50, 49.9, 0].map(scoreBandOf)).toEqual(["70+", "70+", "50-69.9", "50-69.9", "<50", "<50"]);
  });

  it("joins every frozen seat to its evidence", () => {
    const value = buildSeatOutcomeLedger();
    expect(value.schema).toBe("seat-outcome-ledger-v1");
    expect(value.snapshotId).toBe("priority-index-pre-election-2026-v1");
    expect(value.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(value.methodology).toMatchObject({ winnerInference: false, resolutionOrder: ["stage", "candidacy", "primary", "general", "roster_change"] });
    expect(value.rows).toHaveLength(7916);
    expect(Object.keys(value.summary.byOutcome).sort()).toEqual([...OUTCOMES].sort());
    expect(total(value.summary.byOutcome)).toBe(7916);
    expect(value.summary.byOutcome.not_up_in_2026).toBe(7916 - value.summary.upIn2026);
    expect(value.summary.upIn2026).toBe(430 + 35 + 36 + value.rows.filter((row) => row.chamber.startsWith("state_") && row.nextElectionYear === 2026).length);
    // Indiana's statewide primary file marks its nominees; a won primary alone settles no outcome.
    expect(value.rows.find((row) => row.seatLabel === "IN-01")).toMatchObject({ holderName: "Frank Mrvan", candidacy: "filed_for_seat", primary: { status: "won", evidence: "primary_source_marked_winner" }, outcome: "unknown", evidence: "none" });
    expect(value.rows.find((row) => row.seatLabel === "SC-06")).toMatchObject({ primary: { status: "won" } });
    expect(value.rows.find((row) => row.seatLabel === "TN-09")).toMatchObject({ candidacy: "not_on_primary_ballot", primary: { status: "not_applicable" }, outcome: "unknown" });
    // Hawaii's certified statewide summary replaces the partial House file.
    expect(value.rows.find((row) => row.seatLabel === "HI-01")).toMatchObject({ primary: { status: "won", countStatus: "certified" } });
    expect(value.rows.filter((row) => row.outcome === "incumbent_ran_for_other_office")).toHaveLength(16);
    expect(value.rows.filter((row) => row.outcome === "incumbent_ran_for_other_office").every((row) => row.evidence === "fec_filing" && row.evidenceSourceIds.includes("house-incumbent-candidacy-v1"))).toBe(true);
    // The statewide primary layer: losses across chambers and parties, including holders who ran in a redrawn
    // district (TX-09 in TX-18), runoff losses (GA House 117 and 177), and losses a nickname used to hide (TN-05).
    const lost = new Set(value.rows.filter((row) => row.outcome === "incumbent_lost_primary").map((row) => row.seatLabel));
    for (const seat of ["CO-01", "TX-09", "TX-32", "TN-05", "KY-04", "GA House 117", "GA House 157", "GA House 177", "GA Senate 15", "KY House 30", "KY House 44", "KY House 63", "DE House 28", "CT-01", "NY-10", "RI-Gov"]) expect(lost.has(seat), seat).toBe(true);
    expect(lost.size).toBeGreaterThan(150);
    expect(value.rows.every((row) => row.outcome !== "incumbent_lost_primary" || row.primary.status === "lost")).toBe(true);
    // Ballot names that differ from the roster (nickname, apostrophe, incumbent marker) still match; absence is claimed only when no candidate shares the family name.
    expect(value.rows.find((row) => row.seatLabel === "GA House 95")).toMatchObject({ holderName: "Dar'shun Kendrick", primary: { status: "won" } });
    expect(value.rows.find((row) => row.seatLabel === "GA House 143")).toMatchObject({ holderName: "Nissa Jones", primary: { status: "won" } });
    expect(value.rows.find((row) => row.seatLabel === "GA Senate 15")).toMatchObject({ holderName: "Ed Harbison", evidence: "primary_vote_order_certified" });
    // The June runoff file settles what the May first round left open.
    expect(value.rows.find((row) => row.seatLabel === "GA House 177")).toMatchObject({ outcome: "incumbent_lost_primary", primary: { status: "lost", countStatus: "certified" } });
    const georgia = value.rows.filter((row) => row.stateCode === "GA" && row.chamber === "state_house" && row.primary.contestId !== null);
    expect(georgia.length).toBeGreaterThan(100);
    expect(georgia.every((row) => row.evidenceSourceIds.includes("state-primary-results-2026-v1") && row.evidenceSourceIds.some((id) => id.startsWith("ga-2026-primary-")))).toBe(true);
    expect(value.rows.every((row) => row.stage === "up_in_2026" ? row.nextElectionYear === 2026 : row.outcome === "not_up_in_2026")).toBe(true);
    expect(value.rows.every((row) => row.outcome !== "unknown" || row.evidence === "none")).toBe(true);
    expect(value.rows.map((row) => `${row.chamber}|${row.seatId}`)).toEqual([...value.rows.map((row) => `${row.chamber}|${row.seatId}`)].sort());
  });

  it("writes comparison blocks that sum to the scored rows", () => {
    const value = buildSeatOutcomeLedger();
    const scored = value.rows.filter((row) => row.score !== null);
    expect(value.comparison.bands).toEqual(["70+", "50-69.9", "<50"]);
    expect(value.comparison.byChamberRoute.reduce((sum, cell) => sum + total(cell.counts), 0)).toBe(scored.length);
    expect(value.comparison.byRankQuartile.map((cell) => cell.quartile)).toEqual([1, 2, 3, 4]);
    expect(value.comparison.byRankQuartile.reduce((sum, cell) => sum + total(cell.counts), 0)).toBe(scored.length);
    expect(value.comparison.byChamberRoute.every((cell) => Object.keys(cell.counts).length === OUTCOMES.length)).toBe(true);
    const houseDemocratic = value.comparison.byChamberRoute.filter((cell) => cell.chamber === "house" && cell.route === "democratic_incumbent_primary");
    expect(houseDemocratic.reduce((sum, cell) => sum + total(cell.counts), 0)).toBe(scored.filter((row) => row.chamber === "house" && row.route === "democratic_incumbent_primary").length);
  });

  it("matches the pinned artifact", () => {
    expect(readSeatOutcomeLedger().packageSha256).toBe(buildSeatOutcomeLedger().packageSha256);
  });
});
