import { beforeAll, describe, expect, it } from "vitest";

import { buildHouseScoreV06ActiveProjection, validateHouseScoreV06ActiveProjection } from "./house-score-v06-active";

describe("House v0.6 active score projection", () => {
  let projection: ReturnType<typeof buildHouseScoreV06ActiveProjection>;
  beforeAll(() => {
    projection = buildHouseScoreV06ActiveProjection();
  }, 180_000);

  it("adds the officially normalized South Dakota at-large comparison", () => {
    const value = structuredClone(projection);
    expect(value.summary).toEqual({ seats: 430, downBallotActiveSeats: 3, newlyActivatedSeats: 1, unchangedSeats: 429, normalizedFipsSeats: 1, routeChanges: 0, movementCapBreaches: 0 });
    expect(value.rows.filter((row) => row.downBallotDemocraticOverperformance !== null).map((row) => ({
      district: row.districtLabel,
      houseShare: row.houseDemocraticShare,
      presidentialShare: row.presidentialDemocraticShare,
      difference: row.houseMinusPresidentPercentagePoints,
      component: row.downBallotDemocraticOverperformance,
      score: row.activeScore,
      normalized: row.officialCountyFipsNormalizationApplied,
    }))).toEqual([
      { district: "DE-AL", houseShare: 57.86, presidentialShare: 56.63, difference: 1.23, component: 56.2, score: 39.7, normalized: false },
      { district: "SD-AL", houseShare: 27.96, presidentialShare: 34.24, difference: -6.28, component: 18.6, score: 6.3, normalized: true },
      { district: "WY-AL", houseShare: 23.24, presidentialShare: 26.1, difference: -2.86, component: 35.7, score: 13.6, normalized: false },
    ]);
    expect(validateHouseScoreV06ActiveProjection(value)).toEqual(value);
  });

  it("rejects normalization and score lifecycle escalation", () => {
    const normalization = structuredClone(projection) as unknown as { rows: Array<{ districtLabel: string; officialCountyFipsNormalizationApplied: boolean }> };
    normalization.rows.find((row) => row.districtLabel === "DE-AL")!.officialCountyFipsNormalizationApplied = true;
    expect(() => validateHouseScoreV06ActiveProjection(normalization)).toThrow("HOUSE_V06_ACTIVE_INVALID");

    const inference = structuredClone(projection) as unknown as { methodology: { winnerInference: boolean } };
    inference.methodology.winnerInference = true;
    expect(() => validateHouseScoreV06ActiveProjection(inference)).toThrow("HOUSE_V06_ACTIVE_INVALID");
  });
});
