import { beforeAll, describe, expect, it } from "vitest";

import { buildHouseScoreV04ShadowProjection, validateHouseScoreV04ShadowProjection } from "./house-score-v04-shadow";

describe("House v0.4 shadow score", () => {
  let projection: ReturnType<typeof buildHouseScoreV04ShadowProjection>;
  beforeAll(() => {
    projection = buildHouseScoreV04ShadowProjection();
  }, 180_000);

  it("uses exact at-large county context only and preserves every active score", () => {
    const value = structuredClone(projection);
    expect(value.summary).toEqual({ seats: 430, exactAtLargeJoins: 6, localContextEligibleSeats: 3, localContextIneligibleSeats: 427, routeChanges: 0, activeScoreChanges: 0, democraticMovementCap: 13, republicanMovementCap: 14, movementCapBreaches: 0, activationEligible: false });
    expect(value.rows.filter((row) => row.localContext !== null).map((row) => row.districtLabel)).toEqual(["DE-AL", "SD-AL", "WY-AL"]);
    expect(value.rows.filter((row) => row.localContext === null).every((row) => row.shadowScore === row.activeScore)).toBe(true);
    expect(value.rows.every((row) => row.activationEligible === false)).toBe(true);
    expect(validateHouseScoreV04ShadowProjection(value)).toEqual(value);
  });

  it("rejects a shadow activation or score mutation", () => {
    const value = structuredClone(projection) as unknown as { rows: Array<{ activationEligible: boolean }> };
    value.rows[0].activationEligible = true;
    expect(() => validateHouseScoreV04ShadowProjection(value)).toThrow("HOUSE_V04_SHADOW_INVALID");
  });
});
