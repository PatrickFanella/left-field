import { describe, expect, it } from "vitest";

import { buildPreElectionSnapshot2026, readPreElectionSnapshot2026 } from "./pre-election-snapshot-2026";

describe("pre-election 2026 snapshot", () => {
  it("freezes every seat of the v1.17 release with its rank", () => {
    const value = buildPreElectionSnapshot2026();
    expect(value.modelVersion).toBe("v1.17");
    expect(value.publishedAt).toBe("2026-11-03");
    expect(value.summary).toEqual({
      seats: 7916,
      scored: 7403,
      byChamber: { house: { seats: 430, scored: 430 }, senate: { seats: 100, scored: 100 }, governor: { seats: 50, scored: 50 }, state_house: expect.any(Object), state_senate: expect.any(Object) },
    });
    expect(value.summary.byChamber.state_house.seats + value.summary.byChamber.state_senate.seats).toBe(7336);
    expect(value.summary.byChamber.state_house.scored + value.summary.byChamber.state_senate.scored).toBe(6823);
    const top = value.rows.find((row) => row.rank === 1)!;
    expect(top.score).toBe(Math.max(...value.rows.map((row) => row.score ?? -1)));
    expect(new Set(value.rows.filter((row) => row.rank !== null).map((row) => row.rank)).size).toBe(7403);
    expect(value.rows.filter((row) => row.scoreStatus !== "scored").every((row) => row.score === null && row.rank === null && row.route === null)).toBe(true);
    expect(value.rows.filter((row) => row.chamber === "house").every((row) => /^[A-Z]\d{6}$/.test(row.holderId) && row.nextElectionYear === 2026)).toBe(true);
    expect(value.rows.filter((row) => row.chamber === "senate" && row.nextElectionYear === 2026)).toHaveLength(35);
    expect(value.rows.filter((row) => row.chamber === "governor" && row.nextElectionYear === 2026)).toHaveLength(36);
    const senateRanks = value.rows.filter((row) => row.chamber === "senate").map((row) => row.chamberRank).sort((a, b) => a! - b!);
    expect(senateRanks).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(value.rows.map((row) => `${row.chamber}|${row.seatId}`)).toEqual([...value.rows.map((row) => `${row.chamber}|${row.seatId}`)].sort());
  });

  it("matches the pinned artifact", () => {
    expect(readPreElectionSnapshot2026().packageSha256).toBe(buildPreElectionSnapshot2026().packageSha256);
  });
});
