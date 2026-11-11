import { describe, expect, it } from "vitest";
import type { PublicPriorityBrief } from "./house-priority-index";
import { measuredInputs, paginate, parseMinimumInputs, priorityStandings } from "./priority-index-view";

const brief = (seatCycleId: string, score: number, drivers: readonly (number | null)[] = [score]): PublicPriorityBrief => ({
  seatCycleId,
  provisionalTargetScore: score,
  scoreDrivers: drivers.map((value, index) => ({ key: `driver_${index}`, label: `Driver ${index}`, score: value, coverage: value === null ? 0 : 1, inferred: false, explanation: "" })),
}) as unknown as PublicPriorityBrief;

describe("priority index view", () => {
  it("counts only inputs that carry a value, including a measured zero", () => {
    expect(measuredInputs(brief("a", 50, [100, 0, null, null]))).toBe(2);
  });

  it("gives tied scores the rank of the first tied seat", () => {
    const standings = priorityStandings([brief("a", 86), brief("b", 86), brief("c", 86.04), brief("d", 85.4), brief("e", 0)]);
    expect(standings.get("a")).toEqual({ rank: 1, tiedWith: 3 });
    expect(standings.get("c")).toEqual({ rank: 1, tiedWith: 3 });
    expect(standings.get("d")).toEqual({ rank: 4, tiedWith: 1 });
    expect(standings.get("e")).toEqual({ rank: 5, tiedWith: 1 });
  });

  it("falls back to the default evidence threshold for unknown values", () => {
    expect(parseMinimumInputs("any")).toBe(1);
    expect(parseMinimumInputs("3")).toBe(3);
    expect(parseMinimumInputs("")).toBe(2);
    expect(parseMinimumInputs("all")).toBe(2);
  });

  it("clamps the requested page and reports the visible range", () => {
    const rows = Array.from({ length: 120 }, (_, index) => index);
    expect(paginate(rows, "")).toMatchObject({ page: 1, pageCount: 3, first: 1, last: 50 });
    expect(paginate(rows, "3")).toMatchObject({ page: 3, first: 101, last: 120 });
    expect(paginate(rows, "99").page).toBe(3);
    expect(paginate([], "2")).toMatchObject({ page: 1, pageCount: 1, first: 0, last: 0 });
  });
});
