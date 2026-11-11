import { describe, expect, it } from "vitest";

import {
  buildRapidLocalContextCoverageV15,
  validateRapidLocalContextCoverageV15,
} from "./local-context-coverage-v15";

describe("rapid local context coverage v15", () => {
  it("adds the Ohio Democratic state-legislative catalog", () => {
    const value = buildRapidLocalContextCoverageV15();
    expect(value.artifacts).toHaveLength(17);
    expect(value.artifacts.at(-1)).toMatchObject({
      id: "rapid-ohio-state-legislative-democratic-primary-results-v1",
      formulaEligibleCount: 0,
      summary: {
        reportedPartyContests: 221,
        candidateRows: 282,
        republicanCyclesRetained: 0,
      },
    });
  }, 60_000);
  it("rejects score activation", () => {
    const value = structuredClone(
      buildRapidLocalContextCoverageV15(),
    ) as unknown as { artifacts: { formulaEligibleCount: number }[] };
    value.artifacts.at(-1)!.formulaEligibleCount = 1;
    expect(() => validateRapidLocalContextCoverageV15(value)).toThrow(
      "RAPID_LOCAL_CONTEXT_COVERAGE_V15_INVALID",
    );
  }, 120_000);
});
