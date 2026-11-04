import { describe, expect, it } from "vitest";

import { holderMatches, normalizeName, uniqueHolderMatch } from "./holder-name-match";

describe("holder name match", () => {
  it("normalizes to lowercase letters and single spaces", () => {
    expect(normalizeName("  Sánchez-O'Neil,  J. ")).toBe("sanchez o neil j");
  });

  it("matches the roster rule across name orders and markers", () => {
    expect(holderMatches({ familyName: "Case", givenName: "Ed" }, "CASE, Ed")).toBe(true);
    expect(holderMatches({ familyName: "Cameron", givenName: "Mike" }, "Mike Cameron (I)")).toBe(true);
    expect(holderMatches({ familyName: "Clyburn", givenName: "James" }, "James E Jim Clyburn")).toBe(true);
    expect(holderMatches({ familyName: "Thompson", givenName: "Bennie" }, "Bennie G. Thompson")).toBe(true);
    expect(holderMatches({ familyName: "Cohen", givenName: "Steve" }, "Justin J. Pearson")).toBe(false);
    expect(holderMatches({ familyName: "Pearson", givenName: "Steve" }, "Justin J. Pearson")).toBe(false);
    expect(holderMatches({ familyName: "", givenName: "Steve" }, "Steve Cohen")).toBe(false);
  });

  it("accepts a holder with no given name on the family name alone", () => {
    expect(holderMatches({ familyName: "Mrvan", givenName: "" }, "Frank J. Mrvan")).toBe(true);
  });

  it("refuses an ambiguous family name", () => {
    const candidates = [{ name: "Ann Jones" }, { name: "Robert Jones" }];
    expect(uniqueHolderMatch({ familyName: "Jones", givenName: "" }, candidates)).toBeNull();
    expect(uniqueHolderMatch({ familyName: "Jones", givenName: "Ann" }, candidates)?.name).toBe("Ann Jones");
    expect(uniqueHolderMatch({ familyName: "Smith", givenName: "Ann" }, candidates)).toBeNull();
  });
});
