import { describe, expect, it } from "vitest";

import { exact } from "../shared";
import { sourceLockContent, sourceLockMatches } from "./source-lock-content";

const pin = { id: "one", url: "https://example.test/source", retainedPath: "data/source/a", retainedStatus: "retained", byteSize: 1, sha256: "a".repeat(64), kind: "source", parentIds: [] };

describe("source-lock content binding", () => {
  it("allows independently reviewed rights without changing content or generic equality", () => {
    const reviewed = { ...pin, license: "CC0-1.0", licenseEvidence: { url: "https://example.test/terms", scope: "dataset", reviewedAt: "2026-10-30", notes: "Explicit dataset dedication." } };
    expect(sourceLockMatches(reviewed, pin)).toBe(true);
    expect(exact(reviewed, pin)).toBe(false);
    expect(JSON.stringify(sourceLockContent(reviewed))).toBe(JSON.stringify(pin));
  });

  it.each(Object.keys(pin))("still rejects a changed %s", (key) => {
    expect(sourceLockMatches({ ...pin, [key]: "changed", license: "unknown" }, pin)).toBe(false);
  });

  it("rejects unexpected metadata, absent records, and changed lineage", () => {
    expect(sourceLockMatches({ ...pin, approval: true }, pin)).toBe(false);
    expect(sourceLockMatches(undefined, pin)).toBe(false);
    expect(sourceLockMatches({ ...pin, parentIds: ["other"] }, pin)).toBe(false);
  });
});
