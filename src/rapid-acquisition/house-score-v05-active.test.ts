import { beforeAll, describe, expect, it } from "vitest";

import { buildHouseScoreV05ActiveProjection, validateHouseScoreV05ActiveProjection } from "./house-score-v05-active";

describe("House v0.5 active score projection", () => {
  let projection: ReturnType<typeof buildHouseScoreV05ActiveProjection>;
  beforeAll(() => {
    projection = buildHouseScoreV05ActiveProjection();
  }, 180_000);

  it("adds exact at-large House overperformance to two seats and preserves 428 scores", () => {
    const value = structuredClone(projection);
    expect(value.summary).toEqual({ seats: 430, downBallotActiveSeats: 2, unchangedSeats: 428, geographyExcludedSeats: 1, routeChanges: 0, movementCapBreaches: 0 });
    expect(value.rows.filter((row) => row.downBallotDemocraticOverperformance !== null).map((row) => ({
      district: row.districtLabel,
      houseShare: row.houseDemocraticShare,
      presidentialShare: row.presidentialDemocraticShare,
      difference: row.houseMinusPresidentPercentagePoints,
      component: row.downBallotDemocraticOverperformance,
      score: row.activeScore,
    }))).toEqual([
      { district: "DE-AL", houseShare: 57.86, presidentialShare: 56.63, difference: 1.23, component: 56.2, score: 39.7 },
      { district: "WY-AL", houseShare: 23.24, presidentialShare: 26.1, difference: -2.86, component: 35.7, score: 13.6 },
    ]);
    expect(value.rows.filter((row) => row.downBallotDemocraticOverperformance === null).every((row) => row.activeScore === row.previousScore)).toBe(true);
    expect(validateHouseScoreV05ActiveProjection(value)).toEqual(value);
  });

  it("rejects a coherently shaped fallback or geography escalation", () => {
    const fallback = structuredClone(projection) as unknown as { methodology: { researchFallbackScoreInputs: boolean } };
    fallback.methodology.researchFallbackScoreInputs = false;
    expect(() => validateHouseScoreV05ActiveProjection(fallback)).toThrow("HOUSE_V05_ACTIVE_INVALID");

    const split = structuredClone(projection) as unknown as { rows: Array<{ districtLabel: string; exactGeographyJoin: string }> };
    split.rows.find((row) => row.districtLabel === "CA-01")!.exactGeographyJoin = "at_large_statewide";
    expect(() => validateHouseScoreV05ActiveProjection(split)).toThrow("HOUSE_V05_ACTIVE_INVALID");
  });
});
