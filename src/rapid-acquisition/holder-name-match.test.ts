import { describe, expect, it } from "vitest";

import { familyMatches, holderMatches, normalizeName, uniqueHolderMatch } from "./holder-name-match";

describe("holder name match", () => {
  it("normalizes to lowercase letters and single spaces", () => {
    // An apostrophe joins a name ("O'Neil", "Dar'shun"); other punctuation separates.
    expect(normalizeName("  Sánchez-O'Neil,  J. ")).toBe("sanchez oneil j");
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

  it("matches a nickname or initial against the formal ballot name, both ways", () => {
    expect(holderMatches({ familyName: "Bearden", givenName: "Tim" }, "Timothy J. Bearden (I)")).toBe(true);
    expect(holderMatches({ familyName: "Moser", givenName: "Kim" }, "Kimberly Poore MOSER")).toBe(true);
    expect(holderMatches({ familyName: "Goodwin", givenName: "Ed" }, "Edward C. Goodwin")).toBe(true);
    expect(holderMatches({ familyName: "Troy", givenName: "Dan" }, "Daniel P. Troy")).toBe(true);
    expect(holderMatches({ familyName: "Harbison", givenName: "Ed" }, "Edward D Harbison")).toBe(true);
    expect(holderMatches({ familyName: "Harbison", givenName: "Edward" }, "Ed Harbison")).toBe(true);
    expect(holderMatches({ familyName: "Harbison", givenName: "E." }, "Edward D Harbison")).toBe(true);
    // A single-letter prefix is an initial; two letters that are not a prefix are a different name.
    expect(holderMatches({ familyName: "Harbison", givenName: "Al" }, "Edward D Harbison")).toBe(false);
  });

  it("keeps an apostrophe-joined given name whole", () => {
    expect(normalizeName("Dar'shun")).toBe("darshun");
    expect(holderMatches({ familyName: "Kendrick", givenName: "Dar'shun" }, "Darshun Nicole Kendrick (I)")).toBe(true);
  });

  it("takes the source's incumbent marker as identity when the family name matches", () => {
    expect(holderMatches({ familyName: "Jones", givenName: "Nissa" }, "Anissa M. Jones (I)")).toBe(true);
    expect(holderMatches({ familyName: "Campbell", givenName: "Joe" }, "Joseph M. Campbell (I)")).toBe(true);
    expect(holderMatches({ familyName: "Campbell", givenName: "Joe" }, "Joseph M. Campbell")).toBe(false);
    expect(holderMatches({ familyName: "Smith", givenName: "Joe" }, "Joseph M. Campbell (I)")).toBe(false);
  });

  it("tells a family-name match apart from no match at all", () => {
    expect(familyMatches({ familyName: "Campbell", givenName: "Joe" }, "Joseph M. Campbell")).toBe(true);
    expect(familyMatches({ familyName: "Cohen", givenName: "Steve" }, "Justin J. Pearson")).toBe(false);
    expect(familyMatches({ familyName: "", givenName: "Steve" }, "Steve Cohen")).toBe(false);
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
