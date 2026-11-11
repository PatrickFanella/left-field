import { beforeAll, describe, expect, it } from "vitest";

import { buildHouseScoreV08ActiveProjection, validateHouseScoreV08ActiveProjection } from "./house-score-v08-active";

describe("House score v0.8 active projection", () => {
  let projection: ReturnType<typeof buildHouseScoreV08ActiveProjection>;
  beforeAll(() => {
    projection = buildHouseScoreV08ActiveProjection();
  }, 180_000);

  it("replaces inferred primary values only for 21 exact 2024 evidence rows", () => {
    const value = structuredClone(projection);
    expect(value.summary).toMatchObject({ seats: 430, directPrimaryActiveSeats: 21, unresolvedPrimaryRows: 1, routeChanges: 0, movementCapBreaches: 0 });
    expect(value.rows.find((row) => row.districtLabel === "AL-02")).toMatchObject({ previousPrimaryFeasibility: 48.4, activePrimaryFeasibility: 56.6, directPrimaryEvidence: true });
    expect(value.rows.find((row) => row.districtLabel === "RI-01")).toMatchObject({ previousPrimaryFeasibility: 38, activePrimaryFeasibility: 38, directPrimaryEvidence: false, movementFromV07: 0 });
    expect(value.rows.filter((row) => row.directPrimaryEvidence)).toHaveLength(21);
    expect(validateHouseScoreV08ActiveProjection(value)).toEqual(value);
  }, 180_000);

  it("rejects coherent primary and score fabrication", () => {
    for (const [district, field, replacement] of [["RI-01", "directPrimaryEvidence", true], ["AL-02", "activePrimaryFeasibility", 0], ["AL-02", "activeScore", 100]] as const) {
      const value = structuredClone(projection) as unknown as { rows: Record<string, unknown>[] };
      value.rows.find((row) => row.districtLabel === district)![field] = replacement;
      expect(() => validateHouseScoreV08ActiveProjection(value)).toThrow("HOUSE_V08_ACTIVE_INVALID");
    }
  }, 180_000);
});
