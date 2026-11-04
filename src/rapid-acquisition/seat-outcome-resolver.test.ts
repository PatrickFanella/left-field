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
  contestId: "tn:primary:2026:09:democratic", sourceIds: ["tn-2026-primary"], party: "Democratic", electionDate: "2026-08-06", seats: 1,
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
    expect(resolve({ successor: { ...successor, party: "Republican" } })).toMatchObject({ outcome: "incumbent_lost_general", evidence: "roster_change", general: { status: "lost", evidence: "roster_change" }, successorParty: "Republican" });
    expect(resolve({ successor: { ...successor, holderId: "C001068" } })).toMatchObject({ outcome: "incumbent_won", evidence: "roster_change", general: { status: "won", evidence: "roster_change" } });
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

  it("reports unknown with no evidence at all", () => {
    expect(resolve({ candidacy: null })).toMatchObject({ stage: "up_in_2026", candidacy: "not_observed", outcome: "unknown", evidence: "none", evidenceSourceIds: [] });
  });

  it("never lets a later rule override an earlier one", () => {
    const successor: Successor = { holderId: "N000001", holderName: "New", party: "Republican", sourceId: "roster" };
    expect(resolve({ candidacy: { status: "filed_for_other_office", sourceIds: ["fec"] }, primaries: [primary({ sourceMarkedWinners: ["Justin J. Pearson"] })], successor })).toMatchObject({ outcome: "incumbent_ran_for_other_office", evidence: "fec_filing" });
  });
});
