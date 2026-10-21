import { describe, expect, it } from "vitest";

import { readRefreshInputs } from "./refresh-inputs";
import { buildHouseScoreV10ActiveProjection, readHouseScoreV10ActiveProjection } from "./house-score-v10-active";

describe("house score v0.10 finance refresh", () => {
  const value = buildHouseScoreV10ActiveProjection();

  it("refreshes cash from the FEC snapshot and reproduces every v0.9 score before applying it", () => {
    expect(value.summary).toMatchObject({ seats: 430, refreshedSeats: 424, retainedFinanceSeats: 6 });
    expect(value.summary.changedSeats + value.summary.unchangedSeats).toBe(430);
    expect(value.methodology).toMatchObject({ priorScoreReproductionCheck: true, financeSource: readRefreshInputs().fecCandidateSummaryId, structuralInputs: "v0.9_carried_unchanged" });
    const retained = value.rows.filter((row) => row.financeSource === "release_aggregate_retained");
    expect(retained.every((row) => row.movementFromV09 === 0 && row.fecCandidateId === null)).toBe(true);
    expect(value.rows.filter((row) => row.financeSource === "fec_candidate_summary").every((row) => /^H/.test(row.fecCandidateId ?? "") && row.financeCoverageThrough !== null)).toBe(true);
  });

  it("moves a score only when the cash vulnerability changed", () => {
    expect(value.rows.every((row) => row.movementFromV09 === 0 || row.cashVulnerability !== row.previousCashVulnerability)).toBe(true);
  });

  it("matches the pinned projection", () => {
    expect(readHouseScoreV10ActiveProjection().packageSha256).toBe(value.packageSha256);
  });
});
