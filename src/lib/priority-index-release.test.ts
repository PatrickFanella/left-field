import { describe, expect, it } from "vitest";

import { readRefreshInputs } from "@/rapid-acquisition/refresh-inputs";
import { readStateLegislativeScoreV01Projection } from "@/rapid-acquisition/state-legislative-score-v01";

import { readPriorityIndexRelease, validatePriorityIndexRelease } from "./priority-index-release";
import { FilesystemPriorityIndexRepository, rankAcrossChambers } from "./priority-index-store";

// The weekly refresh bumps the release and re-pins the dated inputs, so these
// tests check the descriptor against the refresh pointer and the projections
// rather than against one release's literal values.
const COVERED_STATES_FLOOR = ["AK", "AR", "AZ", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "MA", "MD", "ME", "MN", "MO", "MT", "NC", "ND", "NJ", "NM", "NY", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"];

describe("priority index release and cross-chamber ranking", () => {
  it("reads the pinned release descriptor", () => {
    const release = readPriorityIndexRelease();
    const inputs = readRefreshInputs();
    expect(release.modelVersion).toMatch(/^v\d+\.\d+$/);
    expect(release.publishedAt >= inputs.snapshotDate).toBe(true);
    expect(release).toMatchObject({ sourceCutoff: "2026-08-04", chambers: { house: { modelVersion: "v0.11", financeAsOf: inputs.snapshotDate }, senate: { modelVersion: "v0.1", sourceCutoff: inputs.snapshotDate }, stateLegislative: { modelVersion: "v0.1", sourceCutoff: inputs.snapshotDate }, governor: { modelVersion: "v0.1" } } });
    // A refresh may add covered states; losing one is a regression.
    expect(release.chambers.stateLegislative?.coveredStates).toEqual(expect.arrayContaining(COVERED_STATES_FLOOR));
    expect(release.chambers.stateLegislative?.coveredStates).toEqual(readStateLegislativeScoreV01Projection().coveredStates);
    expect(() => validatePriorityIndexRelease({ ...release, modelVersion: "1.0" })).toThrow("PRIORITY_INDEX_RELEASE_VERSION_INVALID");
  });

  it("ranks House, Senate, governor and state-legislative briefs in one list", () => {
    const repo = new FilesystemPriorityIndexRepository();
    const briefs = repo.getBriefs();
    const stateLegislative = readStateLegislativeScoreV01Projection();
    const stateBriefs = briefs.filter((row) => row.chamber === "state_house" || row.chamber === "state_senate");
    expect(stateBriefs).toHaveLength(stateLegislative.summary.scored);
    expect(stateBriefs.length).toBeGreaterThan(5000);
    expect(briefs).toHaveLength(430 + 100 + 50 + stateBriefs.length);
    expect(briefs.map((row) => row.rank)).toEqual(briefs.map((_, index) => index + 1));
    expect(briefs.filter((row) => row.chamber === "senate")).toHaveLength(100);
    expect(briefs.filter((row) => row.chamber === "governor")).toHaveLength(50);
    expect(briefs.every((row) => Number.isInteger(row.nextElectionYear))).toBe(true);
    const release = readPriorityIndexRelease();
    expect(repo.getModelRelease()).toEqual({ version: release.modelVersion, publishedAt: release.publishedAt, cutoffDate: release.sourceCutoff });
    const senate = briefs.filter((row) => row.chamber === "senate");
    expect(senate.find((row) => row.districtLabel === "VT-S1")).toMatchObject({ incumbentParty: "Democratic", qualifyingRoute: "democratic_incumbent_primary", nextElectionYear: 2030 });
    expect(rankAcrossChambers(briefs.slice(0, 3).reverse()).map((row) => row.rank)).toEqual([1, 2, 3]);
  });
});
