import { describe, expect, it } from "vitest";

import { fillColor, pathBox } from "./national-map";

describe("national map helpers", () => {
  it("colors by party share, score, and seats up this cycle", () => {
    const blue = { democratic: 1, republican: 0, up: 1, topScore: 80 }, red = { democratic: 0, republican: 1, up: 1, topScore: 20 };
    expect(fillColor(blue, "party", false)).toBe("#2f5f9e");
    expect(fillColor(red, "party", false)).toBe("#b8483a");
    expect(fillColor({ democratic: 1, republican: 1, up: 1, topScore: 50 }, "party", false)).toBe("#8d7aa6");
    expect(fillColor({ ...blue, topScore: 100 }, "score", false)).toBe("#7a2414");
    expect(fillColor({ ...blue, up: 0 }, "party", true)).toBe("#ebe8df");
    expect(fillColor(undefined, "party", false)).toBe("#d9d6cc");
  });

  it("bounds an absolute path", () => {
    expect(pathBox("M1.5 2L10 -3L4 8ZM0 0L1 1L0 1Z")).toEqual([0, -3, 10, 8]);
  });
});
