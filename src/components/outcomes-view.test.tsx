import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SeatOutcomeLedger, SeatOutcomeRow } from "@/rapid-acquisition/seat-outcome-ledger";
import { OUTCOMES, type Outcome } from "@/rapid-acquisition/seat-outcome-resolver";

import { OutcomeLine } from "./outcome-line";
import { OutcomesView } from "./outcomes-view";

const rowOf = (overrides: Partial<SeatOutcomeRow>): SeatOutcomeRow => ({
  chamber: "house", seatId: "seat_house_tn_09_current", seatLabel: "TN-09", stateCode: "TN", holderName: "Steve Cohen", holderId: "C001068", holderParty: "Democratic", scoreStatus: "scored",
  route: "democratic_incumbent_primary", score: 61.2, rank: 40, chamberRank: 12, nextElectionYear: 2026, openSeatSignal: null,
  stage: "up_in_2026", candidacy: "filed_for_seat", primary: { status: "unknown", contestId: null, countStatus: null, evidence: "none" }, general: { status: "unknown", contestId: null, countStatus: null, evidence: "none" },
  successorParty: null, outcome: "unknown", evidence: "none", evidenceSourceIds: [], observedAt: "2026-11-03", rowSha256: "", ...overrides,
});
const counts = (rows: readonly SeatOutcomeRow[]) => Object.fromEntries(OUTCOMES.map((outcome) => [outcome, rows.filter((row) => row.outcome === outcome).length])) as Record<Outcome, number>;

/** Every outcome appears once, plus one unscored and one not-up seat. */
function fixtureLedger(): SeatOutcomeLedger {
  const rows: SeatOutcomeRow[] = [
    rowOf({ seatId: "seat_house_a", seatLabel: "AA-01", rank: 1, score: 90, outcome: "incumbent_lost_primary", evidence: "primary_vote_order_certified", primary: { status: "lost", contestId: "aa:primary", countStatus: "certified", evidence: "primary_vote_order_certified" }, evidenceSourceIds: ["aa-primary"] }),
    rowOf({ seatId: "seat_house_b", seatLabel: "AA-02", rank: 2, score: 80, outcome: "incumbent_ran_for_other_office", evidence: "fec_filing", candidacy: "filed_for_other_office", evidenceSourceIds: ["house-incumbent-candidacy-v1"] }),
    rowOf({ seatId: "seat_house_c", seatLabel: "AA-03", rank: 3, score: 70, outcome: "incumbent_lost_general", evidence: "roster_change", successorParty: "Republican" }),
    rowOf({ seatId: "seat_house_d", seatLabel: "AA-04", rank: 4, score: 60, outcome: "incumbent_won", evidence: "general_vote_order_certified" }),
    rowOf({ seatId: "seat_house_e", seatLabel: "AA-05", rank: 5, score: 50, outcome: "open_seat_held", evidence: "roster_change", candidacy: "not_on_primary_ballot", successorParty: "Democratic" }),
    rowOf({ seatId: "seat_house_f", seatLabel: "AA-06", rank: 6, score: 40, outcome: "open_seat_flipped", evidence: "roster_change", candidacy: "not_on_primary_ballot", successorParty: "Republican" }),
    rowOf({ seatId: "seat_house_g", seatLabel: "AA-07", rank: 7, score: 30, outcome: "unknown", primary: { status: "pending", contestId: "aa:primary:7", countStatus: "unofficial", evidence: "none" } }),
    rowOf({ seatId: "seat_senate_h", seatLabel: "AA-S1", chamber: "senate", rank: 8, score: 20, route: "republican_fringe_general", holderParty: "Republican", stage: "not_up_in_2026", nextElectionYear: 2028, outcome: "not_up_in_2026", candidacy: "not_applicable" }),
    rowOf({ seatId: "seat_state_aa_lower_1_1", seatLabel: "AA House 1", chamber: "state_house", rank: null, score: null, route: null, scoreStatus: "no_contest_for_district" }),
  ];
  const scored = rows.filter((row) => row.score !== null);
  return {
    schema: "seat-outcome-ledger-v1", version: 1, snapshotId: "priority-index-pre-election-2026-v1", observedAt: "2026-11-03",
    methodology: { winnerInference: false, resolutionOrder: ["stage", "candidacy", "primary", "general", "roster_change"], certifiedCountStatuses: [], holderMatch: "x", successorPairing: "y" },
    rows,
    summary: { seats: rows.length, upIn2026: rows.filter((row) => row.stage === "up_in_2026").length, byOutcome: counts(rows), byChamber: { house: counts(rows.filter((row) => row.chamber === "house")), senate: counts(rows.filter((row) => row.chamber === "senate")), governor: counts([]), state_house: counts(rows.filter((row) => row.chamber === "state_house")), state_senate: counts([]) } },
    comparison: {
      bands: ["70+", "50-69.9", "<50"],
      byChamberRoute: [
        { chamber: "house", route: "democratic_incumbent_primary", band: "70+", counts: counts(scored.filter((row) => row.chamber === "house" && (row.score ?? 0) >= 70)) },
        { chamber: "house", route: "democratic_incumbent_primary", band: "50-69.9", counts: counts(scored.filter((row) => row.chamber === "house" && (row.score ?? 0) >= 50 && (row.score ?? 0) < 70)) },
        { chamber: "house", route: "democratic_incumbent_primary", band: "<50", counts: counts(scored.filter((row) => row.chamber === "house" && (row.score ?? 0) < 50)) },
        { chamber: "senate", route: "republican_fringe_general", band: "<50", counts: counts(scored.filter((row) => row.chamber === "senate")) },
      ],
      byRankQuartile: [1, 2, 3, 4].map((quartile) => ({ quartile: quartile as 1 | 2 | 3 | 4, counts: counts(scored.filter((row) => Math.min(4, Math.ceil((row.rank ?? 0) / 2)) === quartile)) })),
    },
    rowSetSha256: "", packageSha256: "",
  };
}

describe("OutcomesView", () => {
  it("renders coverage, the unknown share first, the comparison bands and a linked list", () => {
    render(<OutcomesView ledger={fixtureLedger()} params={{}} modelVersion="v1.17" publishedAt="2026-11-03" />);
    expect(screen.getByRole("heading", { level: 1, name: "How the index did in 2026" })).toBeTruthy();
    const coverage = screen.getByRole("table", { name: /coverage/i });
    expect(within(coverage).getByText(/no contest for district/)).toBeTruthy();
    const summary = screen.getByRole("table", { name: /outcomes by chamber/i });
    const headers = within(summary).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers[1]).toBe("No retained evidence yet");
    expect(screen.getAllByRole("table", { name: /score band/i })).toHaveLength(2);
    const list = screen.getByRole("list", { name: /seats on the 2026 ballot/i });
    const items = within(list).getAllByRole("listitem");
    // Seven scored House seats in rank order, then the unscored state seat that is on the ballot all the same.
    expect(items).toHaveLength(8);
    expect(within(items[7]!).getByText(/unranked/)).toBeTruthy();
    expect(within(items[0]!).getByRole("link", { name: /AA-01/ }).getAttribute("href")).toBe("/priorities/seat_house_a");
    expect(within(items[0]!).getByText("Lost the primary")).toBeTruthy();
    expect(within(items[0]!).getByText(/certified primary count/)).toBeTruthy();
    expect(within(items[6]!).getByText(/pending/)).toBeTruthy();
    expect(screen.queryByText(/AA-S1/)).toBeNull();
  });

  it("filters by outcome through the query params and says when nothing matches", () => {
    render(<OutcomesView ledger={fixtureLedger()} params={{ outcome: "open_seat_flipped" }} modelVersion="v1.17" publishedAt="2026-11-03" />);
    const list = screen.getByRole("list", { name: /seats on the 2026 ballot/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText(/AA-06/)).toBeTruthy();
    render(<OutcomesView ledger={fixtureLedger()} params={{ state: "ZZ" }} modelVersion="v1.17" publishedAt="2026-11-03" />);
    expect(screen.getByText(/No seats on the 2026 ballot match/)).toBeTruthy();
  });
});

describe("OutcomeLine", () => {
  it("states the outcome with its evidence, or that none is retained", () => {
    render(<OutcomeLine row={rowOf({ outcome: "incumbent_lost_primary", evidence: "primary_vote_order_certified", primary: { status: "lost", contestId: "ky:x", countStatus: "certified", evidence: "primary_vote_order_certified" } })} />);
    expect(screen.getByText(/Lost the primary/)).toBeTruthy();
    expect(screen.getByText(/certified primary count/)).toBeTruthy();
    expect(screen.getByText(/as of 2026-11-03/)).toBeTruthy();
  });

  it("names the pre-election holder when the brief now belongs to someone else", () => {
    render(<OutcomeLine row={rowOf({ outcome: "seat_changed_hands", evidence: "roster_change", successorParty: "Republican" })} currentHolderId="N000001" />);
    expect(screen.getByText(/pre-election holder Steve Cohen/)).toBeTruthy();
    expect(screen.getByText(/New holder seated/)).toBeTruthy();
  });

  it("does not call an office without a filing source unobserved", () => {
    render(<OutcomeLine row={rowOf({ chamber: "governor", candidacy: "not_observed" })} currentHolderId="C001068" />);
    expect(screen.queryByText(/no filing observed/)).toBeNull();
  });

  it("says a seat is not on the ballot, or that nothing is retained yet", () => {
    render(<OutcomeLine row={rowOf({ stage: "not_up_in_2026", nextElectionYear: 2028, outcome: "not_up_in_2026" })} />);
    expect(screen.getByText(/Not on the 2026 ballot/)).toBeTruthy();
    render(<OutcomeLine row={rowOf({ primary: { status: "pending", contestId: "x", countStatus: "unofficial", evidence: "none" } })} />);
    expect(screen.getByText(/No retained evidence yet/)).toBeTruthy();
    expect(screen.getByText(/primary pending/)).toBeTruthy();
    render(<OutcomeLine row={undefined} />);
    expect(screen.getByText(/not in the 2026 outcome ledger/)).toBeTruthy();
  });
});
