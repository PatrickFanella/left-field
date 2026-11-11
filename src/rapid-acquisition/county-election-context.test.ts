import { describe, expect, it } from "vitest";

import { buildCountyElectionContextProjection, validateCountyElectionContextProjection } from "./county-election-context";

describe("rapid county registration and turnout context", () => {
  it("retains exact-county EAVS rows and explicit survey missingness", () => {
    const value = buildCountyElectionContextProjection();
    expect(value.summary).toEqual({ countyCycleRows: 5946, exactCountyRows2022: 2974, exactCountyRows2024: 2972, excludedNonCountyJurisdictions2022: 8, excludedNonCountyJurisdictions2024: 9, registrationPresent2022: 2918, registrationPresent2024: 2918, ballotsPresent2022: 2967, ballotsPresent2024: 2967, formulaEligibleRows: 0 });
    expect(value.rows.find((row) => row.countyFips === "01001" && row.cycleYear === 2022)).toMatchObject({ jurisdictionName: "AUTAUGA COUNTY", registeredVoters: 43488, ballotsCast: 17864, formulaEligible: false });
    expect(value.rows.find((row) => row.countyFips === "01001" && row.cycleYear === 2024)).toMatchObject({ registeredVoters: 46292, ballotsCast: 28388 });
    expect(value.rows.every((row) => row.reportingUnitDefinition === "eavs_jurisdiction_exact_census_county_fips")).toBe(true);
    expect(validateCountyElectionContextProjection(value)).toEqual(value);
  }, 40_000);
  it.each([["formulaEligible", true], ["registeredVoters", 0], ["countyFips", "00000"], ["reportingUnitDefinition", "assumed_county"]])("rejects coherent %s mutation", (field, replacement) => { const value = structuredClone(buildCountyElectionContextProjection()) as unknown as Record<string, unknown>; (value.rows as Record<string, unknown>[])[0]![field] = replacement; value.packageSha256 = "0".repeat(64); expect(() => validateCountyElectionContextProjection(value)).toThrow("COUNTY_ELECTION_CONTEXT_PROJECTION_INVALID"); }, 20_000);
});
