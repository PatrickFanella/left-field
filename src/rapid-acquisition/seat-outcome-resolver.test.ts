import { describe, expect, it } from "vitest";

import type { PreElectionSeatRow } from "./pre-election-snapshot-2026";
import type { HolderCandidacy, PrimaryEvidence, Successor } from "./seat-outcome-evidence";
import { resolveOutcome } from "./seat-outcome-resolver";

const row = (overrides: Partial<PreElectionSeatRow> = {}): PreElectionSeatRow => ({
  chamber: "house", seatId: "seat_house_tn_09_current", seatLabel: "TN-09", stateCode: "TN", holderName: "Steve Cohen", holderId: "C001068", holderParty: "Democratic", scoreStatus: "scored",
  route: "democratic_incumbent_primary", score: 61.2, rank: 40, chamberRank: 12, nextElectionYear: 2026, openSeatSignal: null, rowSha256: "", ...overrides,
});
const holder = { familyName: "Cohen", givenName: "Steve" };
const filed: HolderCandidacy = { status: "filed_for_seat", sourceIds: ["house-incumbent-candidacy-v1"] };
const primary = (overrides: Partial<PrimaryEvidence> = {}): PrimaryEvidence => ({
  contestId: "tn:primary:2026:09:democratic", sourceIds: ["tn-2026-primary"], party: "Democratic", electionDate: "2026-08-06", seats: 1, advance: 1,
  candidates: [{ name: "Steve Cohen", votes: 30000 }, { name: "Justin J. Pearson", votes: 20000 }], sourceMarkedWinners: null, countStatus: "certified", ...overrides,
});
const resolve = (input: Partial<Parameters<typeof resolveOutcome>[0]> = {}) => resolveOutcome({ row: row(), holder, candidacy: filed, primaries: [], generals: [], successor: null, ...input });

describe("resolveOutcome", () => {
  it("keeps a seat not up in 2026 out of every later rule", () => {
    const value = resolve({ row: row({ nextElectionYear: 2028 }), primaries: [primary({ sourceMarkedWinners: ["Justin J. Pearson"] })] });
    expect(value).toMatchObject({ stage: "not_up_in_2026", outcome: "not_up_in_2026", evidence: "none", candidacy: "not_applicable", primary: { status: "not_applicable" }, general: { status: "not_applicable" }, evidenceSourceIds: [] });
  });

  it("records a holder who filed for another office", () => {
    const value = resolve({ candidacy: { status: "filed_for_other_office", sourceIds: ["house-incumbent-candidacy-v1"] }, primaries: [primary()] });
    expect(value).toMatchObject({ stage: "up_in_2026", candidacy: "filed_for_other_office", outcome: "incumbent_ran_for_other_office", evidence: "fec_filing", evidenceSourceIds: ["house-incumbent-candidacy-v1"] });
  });

  it("settles a lost primary from a source-marked winner", () => {
    const value = resolve({ primaries: [primary({ sourceMarkedWinners: ["Justin J. Pearson"], countStatus: "unofficial" })] });
    expect(value).toMatchObject({ outcome: "incumbent_lost_primary", evidence: "primary_source_marked_winner", primary: { status: "lost", contestId: "tn:primary:2026:09:democratic", countStatus: "unofficial", evidence: "primary_source_marked_winner" }, evidenceSourceIds: ["house-incumbent-candidacy-v1", "tn-2026-primary"] });
  });

  it("settles a lost primary from a certified count the holder finished outside", () => {
    const value = resolve({ primaries: [primary({ candidates: [{ name: "Justin J. Pearson", votes: 32092 }, { name: "Steve Cohen", votes: 11870 }] })] });
    expect(value).toMatchObject({ outcome: "incumbent_lost_primary", evidence: "primary_vote_order_certified", primary: { status: "lost", evidence: "primary_vote_order_certified" } });
  });

  it("marks a won primary and leaves the general open", () => {
    const value = resolve({ primaries: [primary()] });
    expect(value).toMatchObject({ outcome: "unknown", evidence: "none", primary: { status: "won", evidence: "primary_vote_order_certified" }, general: { status: "unknown", evidence: "none" } });
  });

  it("follows a winner mark even when the count is unofficial", () => {
    const value = resolve({ primaries: [primary({ sourceMarkedWinners: ["Steve Cohen"], countStatus: "unofficial" })] });
    expect(value.primary).toMatchObject({ status: "won", evidence: "primary_source_marked_winner", countStatus: "unofficial" });
    expect(value.outcome).toBe("unknown");
  });

  it("holds an unmarked unofficial count as pending", () => {
    const value = resolve({ primaries: [primary({ countStatus: "unofficial" })] });
    expect(value).toMatchObject({ outcome: "unknown", primary: { status: "pending", evidence: "none", countStatus: "unofficial" } });
  });

  it("records a holder absent from their party's primary", () => {
    const value = resolve({ primaries: [primary({ candidates: [{ name: "Justin J. Pearson", votes: 32092 }, { name: "London Lamar", votes: 11870 }] })] });
    expect(value).toMatchObject({ candidacy: "not_on_primary_ballot", outcome: "unknown", primary: { status: "not_applicable", contestId: "tn:primary:2026:09:democratic" } });
  });

  it("ignores a primary of the other party", () => {
    const value = resolve({ primaries: [primary({ party: "Republican", candidates: [{ name: "Someone Else", votes: 5 }] })] });
    expect(value).toMatchObject({ candidacy: "filed_for_seat", primary: { status: "unknown", contestId: null } });
  });

  it("refuses an ambiguous holder match", () => {
    const value = resolve({ holder: { familyName: "Cohen", givenName: "" }, primaries: [primary({ candidates: [{ name: "Steve Cohen", votes: 3 }, { name: "Ann Cohen", votes: 2 }] })] });
    expect(value.primary).toMatchObject({ status: "unknown", contestId: "tn:primary:2026:09:democratic" });
  });

  it("resolves a seat from the roster when no general count is retained", () => {
    const successor: Successor = { holderId: "P000001", holderName: "Justin Pearson", party: "Democratic", sourceId: "congress-legislators-current-20270104" };
    expect(resolve({ primaries: [primary({ sourceMarkedWinners: ["Justin J. Pearson"] })], successor })).toMatchObject({ outcome: "incumbent_lost_primary" });
    expect(resolve({ primaries: [primary({ candidates: [{ name: "Justin J. Pearson", votes: 1 }] })], successor })).toMatchObject({ candidacy: "not_on_primary_ballot", outcome: "open_seat_held", evidence: "roster_change", successorParty: "Democratic", evidenceSourceIds: ["house-incumbent-candidacy-v1", "tn-2026-primary", "congress-legislators-current-20270104"] });
    // The holder won the primary, so was on the general ballot: a new holder means a general-election loss.
    expect(resolve({ primaries: [primary()], successor: { ...successor, party: "Republican" } })).toMatchObject({ outcome: "incumbent_lost_general", evidence: "roster_change", general: { status: "lost", evidence: "roster_change" }, successorParty: "Republican" });
    expect(resolve({ successor: { ...successor, holderId: "C001068" } })).toMatchObject({ outcome: "incumbent_won", evidence: "roster_change", general: { status: "won", evidence: "roster_change" } });
  });

  it("reports a seat changed hands, not a defeat, when nothing shows the holder on the ballot", () => {
    const successor: Successor = { holderId: "N000001", holderName: "New Member", party: "Republican", sourceId: "congress-legislators-current-20270104" };
    // A filing alone does not put the holder on the general ballot: a retirement after filing or an unretained primary loss look the same here.
    expect(resolve({ successor })).toMatchObject({ outcome: "seat_changed_hands", evidence: "roster_change", successorParty: "Republican", general: { status: "unknown", evidence: "none" }, evidenceSourceIds: ["house-incumbent-candidacy-v1", "congress-legislators-current-20270104"] });
    // A term-limited governor with no candidacy source at all.
    const governor = row({ chamber: "governor", seatId: "seat_governor_tn_current", seatLabel: "TN-Gov", holderName: "Bill Lee", holderId: "ocd-person/lee", holderParty: "Republican", route: "republican_fringe_general" });
    expect(resolve({ row: governor, holder: { familyName: "Lee", givenName: "Bill" }, candidacy: null, successor: { ...successor, party: "Democratic" } })).toMatchObject({ candidacy: "not_observed", outcome: "seat_changed_hands", successorParty: "Democratic" });
    expect(resolve({ primaries: [primary({ countStatus: "unofficial" })], successor })).toMatchObject({ outcome: "seat_changed_hands", primary: { status: "pending" } });
  });

  it("treats a family-name match with a different given name as unknown, never as absence", () => {
    const value = resolve({ holder: { familyName: "Campbell", givenName: "Jim" }, primaries: [primary({ candidates: [{ name: "Joseph M. Campbell", votes: 5 }, { name: "Neal Howell", votes: 2 }] })] });
    expect(value).toMatchObject({ candidacy: "filed_for_seat", primary: { status: "unknown", contestId: "tn:primary:2026:09:democratic" }, outcome: "unknown" });
  });

  it("settles a loss from an earlier certified round when a later runoff file is retained", () => {
    const first = primary({ contestId: "ga:first", electionDate: "2026-05-19", candidates: [{ name: "Elsie Cason Napier", votes: 1197 }, { name: "Kristina Cheek McBride", votes: 1100 }, { name: "Alvin Payton, Jr.", votes: 1025 }] });
    const runoff = primary({ contestId: "ga:runoff", electionDate: "2026-06-16", candidates: [{ name: "Elsie Cason Napier", votes: 2000 }, { name: "Kristina Cheek McBride", votes: 1500 }] });
    const value = resolve({ row: row({ stateCode: "GA" }), holder: { familyName: "Payton", givenName: "Alvin" }, primaries: [runoff, first] });
    expect(value).toMatchObject({ outcome: "incumbent_lost_primary", evidence: "primary_vote_order_certified", primary: { status: "lost", contestId: "ga:first" } });
    // In the runoff the holder is settled by the runoff count itself.
    const inRunoff = resolve({ row: row({ stateCode: "GA" }), holder: { familyName: "Napier", givenName: "Elsie" }, primaries: [runoff, first] });
    expect(inRunoff.primary).toMatchObject({ status: "won", contestId: "ga:runoff" });
  });

  it("flags a retired holder once the roster names someone else", () => {
    const successor: Successor = { holderId: "N000001", holderName: "New Member", party: "Republican", sourceId: "congress-legislators-current-20270104" };
    expect(resolve({ primaries: [primary({ candidates: [{ name: "Justin J. Pearson", votes: 1 }] })], successor })).toMatchObject({ outcome: "open_seat_flipped", evidence: "roster_change" });
  });

  it("settles a general from a certified count", () => {
    const general = primary({ contestId: "tn:general:2026:09", party: "Democratic", candidates: [{ name: "Steve Cohen", votes: 100 }, { name: "Other Party", votes: 50 }], sourceIds: ["tn-2026-general"] });
    expect(resolve({ primaries: [primary()], generals: [general] })).toMatchObject({ outcome: "incumbent_won", evidence: "general_vote_order_certified", general: { status: "won", contestId: "tn:general:2026:09" } });
    expect(resolve({ primaries: [primary()], generals: [{ ...general, candidates: [{ name: "Other Party", votes: 100 }, { name: "Steve Cohen", votes: 50 }] }] })).toMatchObject({ outcome: "incumbent_lost_general", evidence: "general_vote_order_certified" });
  });

  it("holds a Georgia general as pending while a general runoff is possible", () => {
    const general = (candidates: readonly { name: string; votes: number; party?: "Democratic" | "Republican" | "Independent" }[]) => resolve({
      row: row({ stateCode: "GA", seatLabel: "GA House 1", holderName: "Ann Smith" }), holder: { familyName: "Smith", givenName: "Ann" }, candidacy: null,
      primaries: [primary({ contestId: "ga:primary", candidates: [{ name: "Ann Smith", votes: 10 }] })],
      generals: [primary({ contestId: "ga:general", party: null, electionDate: "2026-11-03", candidates })],
    });
    expect(general([{ name: "Ann Smith", votes: 49, party: "Democratic" }, { name: "Bob Jones", votes: 45, party: "Republican" }, { name: "Cal Lee", votes: 6, party: "Independent" }])).toMatchObject({ outcome: "unknown", general: { status: "pending", countStatus: "certified" } });
    expect(general([{ name: "Ann Smith", votes: 51, party: "Democratic" }, { name: "Bob Jones", votes: 49, party: "Republican" }])).toMatchObject({ outcome: "incumbent_won", general: { status: "won" } });
    // Outside the top two, the holder is out whatever the runoff decides.
    expect(general([{ name: "Bob Jones", votes: 45, party: "Republican" }, { name: "Cal Lee", votes: 40, party: "Independent" }, { name: "Ann Smith", votes: 15, party: "Democratic" }])).toMatchObject({ outcome: "incumbent_lost_general" });
  });

  it("names an open seat's party only when every winner of the holder's contests shares it", () => {
    const off = { candidacy: null, primaries: [primary({ candidates: [{ name: "Justin J. Pearson", votes: 1 }] })] };
    const contest = (contestId: string, seats: number, candidates: readonly { name: string; votes: number; party: "Democratic" | "Republican" }[]) => primary({ contestId, party: null, electionDate: "2026-11-03", seats, advance: seats, candidates });
    // A two-seat district that elected one of each party says nothing about the departed holder's seat.
    expect(resolve({ ...off, generals: [contest("x:2", 2, [{ name: "A Dem", votes: 60, party: "Democratic" }, { name: "B Rep", votes: 55, party: "Republican" }, { name: "C Rep", votes: 40, party: "Republican" }])] })).toMatchObject({ outcome: "unknown" });
    expect(resolve({ ...off, generals: [contest("x:2", 2, [{ name: "A Dem", votes: 60, party: "Democratic" }, { name: "B Dem", votes: 55, party: "Democratic" }, { name: "C Rep", votes: 40, party: "Republican" }])] })).toMatchObject({ outcome: "open_seat_held", evidence: "general_vote_order_certified", successorParty: "Democratic" });
    // Two position contests on the same day, neither naming the holder: the same rule across both.
    const positions = [contest("x:pos-1", 1, [{ name: "A Dem", votes: 60, party: "Democratic" }, { name: "B Rep", votes: 40, party: "Republican" }]), contest("x:pos-2", 1, [{ name: "C Rep", votes: 60, party: "Republican" }, { name: "D Dem", votes: 40, party: "Democratic" }])];
    expect(resolve({ ...off, generals: positions })).toMatchObject({ outcome: "unknown" });
  });

  it("holds a majority-state primary as pending while a runoff is possible", () => {
    const georgia = (candidates: readonly { name: string; votes: number }[]) => resolve({ row: row({ stateCode: "GA", seatLabel: "GA House 177", holderName: "Alvin Payton" }), holder: { familyName: "Payton", givenName: "Alvin" }, primaries: [primary({ contestId: "ga:state-leg-primary:2026:lower:177:D", candidates })] });
    // Leader short of a majority, holder second: the runoff decides.
    expect(georgia([{ name: "Elsie Cason Napier", votes: 1197 }, { name: "Alvin Payton, Jr.", votes: 1025 }, { name: "Kristina Cheek McBride", votes: 747 }]).primary).toMatchObject({ status: "pending", evidence: "none", countStatus: "certified" });
    // Holder third: cannot reach the runoff.
    expect(georgia([{ name: "Elsie Cason Napier", votes: 1197 }, { name: "Kristina Cheek McBride", votes: 1100 }, { name: "Alvin Payton, Jr.", votes: 1025 }])).toMatchObject({ outcome: "incumbent_lost_primary", evidence: "primary_vote_order_certified" });
    // Someone else took a majority outright.
    expect(georgia([{ name: "Bradley B. Anderson", votes: 5138 }, { name: "Alvin Payton, Jr.", votes: 2618 }])).toMatchObject({ outcome: "incumbent_lost_primary" });
    // Holder leads without a majority: still a runoff.
    expect(georgia([{ name: "Alvin Payton, Jr.", votes: 1197 }, { name: "Elsie Cason Napier", votes: 1025 }, { name: "Kristina Cheek McBride", votes: 747 }]).primary.status).toBe("pending");
    // Holder leads with a majority.
    expect(georgia([{ name: "Alvin Payton, Jr.", votes: 2000 }, { name: "Elsie Cason Napier", votes: 1025 }]).primary).toMatchObject({ status: "won", evidence: "primary_vote_order_certified" });
    // Kentucky has no runoff: second place is a loss.
    expect(resolve({ row: row({ stateCode: "KY" }), primaries: [primary({ candidates: [{ name: "Kenya Wade", votes: 2465 }, { name: "Steve Cohen", votes: 2460 }, { name: "Jesten Slaw", votes: 711 }] })] })).toMatchObject({ outcome: "incumbent_lost_primary" });
  });

  it("reads a top-two ballot as advancing or not, for any holder party and with no runoff", () => {
    const topTwo = (candidates: readonly { name: string; votes: number }[], holderParty: PreElectionSeatRow["holderParty"] = "Democratic") =>
      resolve({ row: row({ stateCode: "CA", holderParty }), primaries: [primary({ party: null, advance: 2, candidates })] });
    // Second place advances, even in a state whose party primaries go to runoffs.
    expect(topTwo([{ name: "Mai Vang", votes: 31 }, { name: "Steve Cohen", votes: 29 }, { name: "Third", votes: 20 }]).primary).toMatchObject({ status: "won", evidence: "primary_vote_order_certified" });
    expect(resolve({ row: row({ stateCode: "GA" }), primaries: [primary({ party: null, advance: 2, candidates: [{ name: "A", votes: 40 }, { name: "Steve Cohen", votes: 35 }, { name: "B", votes: 25 }] })] }).primary.status).toBe("won");
    // Third place does not.
    expect(topTwo([{ name: "Mai Vang", votes: 31 }, { name: "Third", votes: 30 }, { name: "Steve Cohen", votes: 29 }])).toMatchObject({ outcome: "incumbent_lost_primary" });
    // An independent holder faces the same ballot.
    expect(topTwo([{ name: "Steve Cohen", votes: 50 }, { name: "Other", votes: 10 }], "Independent").primary.status).toBe("won");
  });

  it("reports unknown with no evidence at all", () => {
    expect(resolve({ candidacy: null })).toMatchObject({ stage: "up_in_2026", candidacy: "not_observed", outcome: "unknown", evidence: "none", evidenceSourceIds: [] });
  });

  it("never lets a later rule override an earlier one", () => {
    const successor: Successor = { holderId: "N000001", holderName: "New", party: "Republican", sourceId: "roster" };
    expect(resolve({ candidacy: { status: "filed_for_other_office", sourceIds: ["fec"] }, primaries: [primary({ sourceMarkedWinners: ["Justin J. Pearson"] })], successor })).toMatchObject({ outcome: "incumbent_ran_for_other_office", evidence: "fec_filing" });
  });
});
