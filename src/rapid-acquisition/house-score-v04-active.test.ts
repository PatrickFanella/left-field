import { beforeAll, describe, expect, it } from "vitest";

import { buildHouseScoreV04ActiveProjection, validateHouseScoreV04ActiveProjection } from "./house-score-v04-active";

describe("House v0.4 active score projection", () => {
  let projection: ReturnType<typeof buildHouseScoreV04ActiveProjection>;
  beforeAll(() => {
    projection = buildHouseScoreV04ActiveProjection();
  }, 180_000);

  it("activates only exact at-large local context and preserves the other 427 scores", () => {
    const value = structuredClone(projection);
    expect(value.summary).toEqual({ seats: 430, localContextActiveSeats: 3, unchangedSeats: 427, routeChanges: 0, movementCapBreaches: 0 });
    expect(value.rows.filter((row) => row.localContext !== null).map((row) => [row.districtLabel, row.activeScore])).toEqual([["DE-AL", 39.5], ["SD-AL", 7.2], ["WY-AL", 14.5]]);
    expect(value.rows.filter((row) => row.localContext === null).every((row) => row.activeScore === row.previousScore)).toBe(true);
    expect(validateHouseScoreV04ActiveProjection(value)).toEqual(value);
  });

  it("rejects a non-exact activation", () => {
    const value = structuredClone(projection) as ReturnType<typeof buildHouseScoreV04ActiveProjection> & { rows: Array<{ localContext: number | null }> };
    value.rows[0]!.localContext = 50;
    expect(() => validateHouseScoreV04ActiveProjection(value)).toThrow("HOUSE_V04_ACTIVE_INVALID");
  });
});
