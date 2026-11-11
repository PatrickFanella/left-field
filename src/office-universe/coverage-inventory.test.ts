import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildNationwideOfficeCoverageInventory,
  COVERAGE_JURISDICTIONS,
  parseNcslAuthorizedStateLegislativeSeatCounts,
  serializeNationwideOfficeCoverageInventory,
} from "./coverage-inventory";

describe("nationwide office coverage inventory", () => {
  it("tracks every state and DC without treating retained rows as a complete denominator", () => {
    const value = buildNationwideOfficeCoverageInventory();

    expect(COVERAGE_JURISDICTIONS).toHaveLength(51);
    expect(value.jurisdictions).toHaveLength(51);
    expect(value.summary).toMatchObject({
      jurisdictionsTracked: 51,
      stateLegislativeRosterJurisdictions: 51,
      stateLegislativeHistoricalResultJurisdictions: 51,
      stateLegislativeAuthorizedSeatDenominatorJurisdictions: 51,
      fullOfficeDenominatorKnownJurisdictions: 0,
      governmentUnitDiscoveryConfiguredJurisdictions: 50,
      governmentUnitDiscoveryWithoutRetainedRows: 50,
      governmentUnitDiscoverySourcesRequiringReplacement: 50,
    });
    expect(value.jurisdictions.map((row) => row.code)).toEqual(COVERAGE_JURISDICTIONS.map((row) => row.code));
    expect(value.jurisdictions.every((row) => row.seatDenominator.status === "unknown" && row.seatDenominator.count === null)).toBe(true);
    expect(value.jurisdictions.every((row) => row.stateLegislative.authorizedSeatDenominator.count !== null)).toBe(true);
    expect(value.jurisdictions.every((row) => row.currentHolderIdentity.status === "not_assessed")).toBe(true);
  });

  it("keeps DC and the separate territory and tribal scopes explicit", () => {
    const value = buildNationwideOfficeCoverageInventory();
    const dc = value.jurisdictions.find((row) => row.code === "DC");

    expect(dc?.stateLegislative.roster.status).toBe("retained");
    expect(dc?.governmentUnitDiscovery.status).toBe("not_registered");
    expect(dc?.governmentUnitDiscovery.sourceStatus).toBe("not_registered");
    expect(value.separateScopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "us_territories", jurisdictionCodes: ["AS", "GU", "MP", "PR", "VI"] }),
      expect.objectContaining({ scope: "tribal_nations" }),
    ]));
  });

  it("derives retained state and local evidence from pinned artifacts and serializes a machine-readable report", () => {
    const value = buildNationwideOfficeCoverageInventory();
    const nc = value.jurisdictions.find((row) => row.code === "NC");
    const ca = value.jurisdictions.find((row) => row.code === "CA");

    expect(nc?.stateLegislative.historicalResults.status).toBe("retained");
    expect(nc?.localHistoricalResults.status).toBe("retained");
    expect(nc?.localHistoricalResults.artifacts).toHaveLength(4);
    expect(nc?.localHistoricalResults.historicalContestCount).toBeGreaterThan(0);
    expect(nc?.localHistoricalResults.artifacts.map((artifact) => artifact.artifactId)).toEqual(expect.arrayContaining([
      "rapid-north-carolina-local-office-primary-results-v1",
      "rapid-north-carolina-local-office-general-results-v1",
      "rapid-north-carolina-soil-water-general-results-v1",
      "rapid-north-carolina-sanitary-general-results-v1",
    ]));
    expect(ca?.localHistoricalResults.status).toBe("not_retained");
    expect(value.jurisdictions.reduce((sum, row) => sum + row.localHistoricalResults.artifacts.length, 0)).toBe(6);
    expect(JSON.parse(serializeNationwideOfficeCoverageInventory(value).toString("utf8"))).toEqual(value);
    expect(
      JSON.parse(readFileSync(join(process.cwd(), "docs/reviews/nationwide-office-coverage-inventory-v1.json"), "utf8")),
    ).toEqual(value);
  });

  it("parses the retained NCSL authorized legislative-seat table without using it as a full-office denominator", () => {
    const text = readFileSync(join(process.cwd(), "data/source/coverage/ncsl-state-legislative-partisan-composition-2025-layout.txt"), "utf8");
    const counts = parseNcslAuthorizedStateLegislativeSeatCounts(text);

    expect(counts).toHaveLength(51);
    expect(counts.get("AL")).toBe(140);
    expect(counts.get("NE")).toBe(49);
    expect(counts.get("DC")).toBe(13);
    expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe(7_399);
  });
});
