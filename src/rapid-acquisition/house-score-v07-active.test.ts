import { beforeAll, describe, expect, it } from "vitest";

import { buildHouseScoreV07ActiveProjection, validateHouseScoreV07ActiveProjection } from "./house-score-v07-active";

describe("House v0.7 active score projection", () => {
  let projection: ReturnType<typeof buildHouseScoreV07ActiveProjection>;
  beforeAll(() => {
    projection = buildHouseScoreV07ActiveProjection();
  }, 180_000);

  it("activates the exact North Dakota at-large comparison at 70% local evidence coverage", () => {
    const value = structuredClone(projection);
    expect(value.summary).toEqual({ seats: 430, downBallotActiveSeats: 4, newlyActivatedSeats: 1, unchangedSeats: 429, normalizedFipsSeats: 1, partialComponentSeats: 1, routeChanges: 0, movementCapBreaches: 0 });
    expect(value.rows.filter((row) => row.downBallotDemocraticOverperformance !== null).map((row) => ({
      district: row.districtLabel,
      houseShare: row.houseDemocraticShare,
      presidentialShare: row.presidentialDemocraticShare,
      difference: row.houseMinusPresidentPercentagePoints,
      component: row.downBallotDemocraticOverperformance,
      availableWeight: row.localContextAvailableWeight,
      score: row.activeScore,
      movement: row.movementFromV06,
    }))).toEqual([
      { district: "DE-AL", houseShare: 57.86, presidentialShare: 56.63, difference: 1.23, component: 56.2, availableWeight: 1, score: 39.7, movement: 0 },
      { district: "ND-AL", houseShare: 30.36, presidentialShare: 30.77, difference: -0.41, component: 48, availableWeight: 0.7, score: 13.6, movement: 7.7 },
      { district: "SD-AL", houseShare: 27.96, presidentialShare: 34.24, difference: -6.28, component: 18.6, availableWeight: 1, score: 6.3, movement: 0 },
      { district: "WY-AL", houseShare: 23.24, presidentialShare: 26.1, difference: -2.86, component: 35.7, availableWeight: 1, score: 13.6, movement: 0 },
    ]);
    const northDakota = value.rows.find((row) => row.districtLabel === "ND-AL")!;
    expect(northDakota.localContext).toBe(63.3);
    expect(northDakota.activationContextComponents).toEqual({ inverseBallotsCastToCvap: 69.08, inverseActiveRegistrationToCvap: null, downBallotDemocraticOverperformance: 48, demographicOpportunity: 70.61 });
    expect(validateHouseScoreV07ActiveProjection(value)).toEqual(value);
  }, 120_000);

  it("rejects missing-data and lifecycle escalation", () => {
    const inferredRegistration = structuredClone(projection) as unknown as { rows: Array<{ districtLabel: string; activationContextComponents: { inverseActiveRegistrationToCvap: number | null } | null }> };
    inferredRegistration.rows.find((row) => row.districtLabel === "ND-AL")!.activationContextComponents!.inverseActiveRegistrationToCvap = 50;
    expect(() => validateHouseScoreV07ActiveProjection(inferredRegistration)).toThrow("HOUSE_V07_ACTIVE_INVALID");

    const inference = structuredClone(projection) as unknown as { methodology: { winnerInference: boolean } };
    inference.methodology.winnerInference = true;
    expect(() => validateHouseScoreV07ActiveProjection(inference)).toThrow("HOUSE_V07_ACTIVE_INVALID");
  }, 120_000);
});
