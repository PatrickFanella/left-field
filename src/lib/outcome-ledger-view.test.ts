import { describe, expect, it } from "vitest";

import type { SeatOutcomeRow } from "@/rapid-acquisition/seat-outcome-ledger";
import { OUTCOMES, type EvidenceGrade, type ContestStatus } from "@/rapid-acquisition/seat-outcome-resolver";

import { candidacyLabel, contestStatusLabel, coverageTable, evidenceLabel, filterOutcomeRows, loadOutcomeLedger, outcomeFor, outcomeLabel } from "./outcome-ledger-view";

const rowOf = (overrides: Partial<SeatOutcomeRow>): SeatOutcomeRow => ({
  chamber: "house", seatId: "seat_house_tn_09_current", seatLabel: "TN-09", stateCode: "TN", holderName: "Steve Cohen", holderId: "C001068", holderParty: "Democratic", scoreStatus: "scored",
  route: "democratic_incumbent_primary", score: 61.2, rank: 40, chamberRank: 12, nextElectionYear: 2026, openSeatSignal: null,
  stage: "up_in_2026", candidacy: "filed_for_seat", primary: { status: "unknown", contestId: null, countStatus: null, evidence: "none" }, general: { status: "unknown", contestId: null, countStatus: null, evidence: "none" },
  successorParty: null, outcome: "unknown", evidence: "none", evidenceSourceIds: [], observedAt: "2026-11-03", rowSha256: "", ...overrides,
});

describe("outcome ledger labels", () => {
  it("gives every outcome, grade, candidacy and contest status plain copy", () => {
    for (const outcome of OUTCOMES) expect(outcomeLabel(outcome).length).toBeGreaterThan(3);
    expect(outcomeLabel("unknown")).toBe("No retained evidence yet");
    expect(outcomeLabel("incumbent_lost_primary")).toBe("Lost the primary");
    expect(outcomeLabel("open_seat_flipped")).toBe("Open seat changed party");
    const grades: EvidenceGrade[] = ["fec_filing", "primary_source_marked_winner", "primary_vote_order_certified", "general_source_marked_winner", "general_vote_order_certified", "roster_change", "none"];
    for (const grade of grades) expect(evidenceLabel(grade).length).toBeGreaterThan(3);
    expect(evidenceLabel("primary_vote_order_certified")).toBe("certified primary count");
    expect(evidenceLabel("none")).toBe("no settling evidence");
    const statuses: ContestStatus[] = ["won", "lost", "pending", "unknown", "not_applicable"];
    for (const status of statuses) expect(contestStatusLabel(status).length).toBeGreaterThan(2);
    expect(contestStatusLabel("pending")).toBe("pending (count not certified, or runoff result not retained)");
    expect(outcomeLabel("seat_changed_hands")).toBe("New holder seated; how is not retained");
    expect(outcomeLabel("incumbent_ran_for_other_office")).toBe("Filed for another office (FEC)");
    expect(candidacyLabel("not_on_primary_ballot")).toBe("not on the primary ballot");
    expect(candidacyLabel("filed_for_other_office")).toBe("filed for another office");
  });
});

describe("filterOutcomeRows", () => {
  const rows = [
    rowOf({ seatId: "b", rank: 20, chamber: "senate", stateCode: "GA", route: "republican_fringe_general", outcome: "incumbent_ran_for_other_office" }),
    rowOf({ seatId: "a", rank: 5 }),
    rowOf({ seatId: "c", rank: null, score: null, scoreStatus: "no_contest_for_district", chamber: "state_house", route: null }),
    rowOf({ seatId: "d", rank: 3, stage: "not_up_in_2026", nextElectionYear: 2028, outcome: "not_up_in_2026" }),
    rowOf({ seatId: "e", rank: 5, holderName: "Ann Other", seatLabel: "TN-08" }),
  ];

  it("keeps the seats on the 2026 ballot in rank order, unranked last", () => {
    expect(filterOutcomeRows(rows, {}).map((row) => row.seatId)).toEqual(["a", "e", "b", "c"]);
  });

  it("filters by chamber, route, outcome, state and text", () => {
    expect(filterOutcomeRows(rows, { chamber: "senate" }).map((row) => row.seatId)).toEqual(["b"]);
    expect(filterOutcomeRows(rows, { route: "democratic_incumbent_primary" }).map((row) => row.seatId)).toEqual(["a", "e"]);
    expect(filterOutcomeRows(rows, { outcome: "incumbent_ran_for_other_office" }).map((row) => row.seatId)).toEqual(["b"]);
    expect(filterOutcomeRows(rows, { state: "GA" }).map((row) => row.seatId)).toEqual(["b"]);
    expect(filterOutcomeRows(rows, { query: "ann other" }).map((row) => row.seatId)).toEqual(["e"]);
    expect(filterOutcomeRows(rows, { query: "tn-08" }).map((row) => row.seatId)).toEqual(["e"]);
    expect(filterOutcomeRows(rows, { chamber: "nonsense" })).toEqual([]);
  });
});

describe("pinned ledger views", () => {
  it("loads the pinned ledger once and finds seats by id", () => {
    const ledger = loadOutcomeLedger();
    expect(loadOutcomeLedger()).toBe(ledger);
    expect(outcomeFor("seat_house_in_01_current")).toMatchObject({ seatLabel: "IN-01", primary: { status: "won" } });
    expect(outcomeFor("seat_missing")).toBeUndefined();
  });

  it("tabulates coverage per chamber with the unscored reasons", () => {
    const table = coverageTable(loadOutcomeLedger());
    expect(table.map((row) => row.chamber)).toEqual(["house", "senate", "governor", "state_house", "state_senate"]);
    expect(table[0]).toEqual({ chamber: "house", seats: 430, scored: 430, unscored: [] });
    const stateHouse = table.find((row) => row.chamber === "state_house")!;
    expect(stateHouse.seats - stateHouse.scored).toBe(stateHouse.unscored.reduce((sum, reason) => sum + reason.count, 0));
    expect(stateHouse.unscored.map((reason) => reason.reason)).toContain("no_contest_for_district");
    expect(table.reduce((sum, row) => sum + row.seats, 0)).toBe(7916);
  });
});
