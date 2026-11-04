import { describe, expect, it } from "vitest";

import { readStateLegislativeScoreV01Projection } from "@/rapid-acquisition/state-legislative-score-v01";

import { stateLegislativePriorityBrief, stateLegislativePriorityBriefs } from "./state-legislative-priority-index";

describe("state-legislative priority briefs", () => {
  it("turns scored rows into briefs and skips unscored seats", () => {
    const projection = readStateLegislativeScoreV01Projection();
    const briefs = stateLegislativePriorityBriefs();
    expect(briefs).toHaveLength(projection.summary.scored);
    expect(new Set(briefs.map((brief) => brief.chamber))).toEqual(new Set(["state_house", "state_senate"]));
    const va1 = briefs.find((brief) => brief.districtLabel === "VA House 1");
    expect(va1).toMatchObject({ stateCode: "VA", districtCode: "H1", incumbentParty: "Democratic", qualifyingRoute: "democratic_incumbent_primary", nextElectionYear: 2027, presidentialDemocraticMargin2024: 63.2 });
    expect(va1?.scoreDrivers.map((driver) => driver.key)).toEqual(["blue_baseline", "primary_feasibility", "incumbent_alignment_gap", "cash_vulnerability"]);
    expect(va1?.districtSummary).toContain("own race");
  });

  it("says when a baseline rests on unofficial returns", () => {
    const scored = readStateLegislativeScoreV01Projection().rows.find((row) => row.status === "scored" && row.baselineContested)!;
    const certified = stateLegislativePriorityBrief(scored);
    expect(certified.districtSummary).not.toContain("unofficial");
    const unofficial = stateLegislativePriorityBrief({ ...scored, baselineResultStatus: "unofficial" });
    expect(unofficial.districtSummary).toContain(`unofficial returns from the ${scored.baselineCycleYear} general election for this seat; the state has not certified`);
    expect(unofficial.scoreDrivers[0]?.explanation).toContain("unofficial returns");
    expect(unofficial.limitations).toContain("unofficial");
  });

  it("refuses an unscored row", () => {
    const unscored = readStateLegislativeScoreV01Projection().rows.find((row) => row.status !== "scored")!;
    expect(() => stateLegislativePriorityBrief(unscored)).toThrow("STATE_LEG_BRIEF_UNSCORED");
  });
});
