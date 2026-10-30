import { describe, expect, it } from "vitest";

import {
  derivedArtifactEntry,
  findSourceLockEntry,
  serializeSourceLock,
  upsertSourceLockEntry,
  type SourceLock,
  type SourceLockEntry,
} from "./source-lock";

const entry = (id: string, retainedPath: string): SourceLockEntry => ({
  id,
  url: `urn:test:${id}`,
  retainedPath,
  retainedStatus: "retained",
  byteSize: 1,
  sha256: "a".repeat(64),
  kind: "source",
  parentIds: [],
  license: "unknown",
});

describe("source-lock helpers", () => {
  const lock: SourceLock = { version: 1, entries: [entry("one", "data/a"), entry("two", "data/b")] };

  it("replaces an existing id in place and appends new ids", () => {
    const replaced = upsertSourceLockEntry(lock, { ...entry("one", "data/a"), byteSize: 9 });
    expect(replaced.entries.map((row) => row.id)).toEqual(["one", "two"]);
    expect(findSourceLockEntry(replaced, "one")?.byteSize).toBe(9);
    const appended = upsertSourceLockEntry(lock, entry("three", "data/c"));
    expect(appended.entries.map((row) => row.id)).toEqual(["one", "two", "three"]);
  });

  it("refuses a second id claiming the same retained path", () => {
    expect(() => upsertSourceLockEntry(lock, entry("three", "data/a"))).toThrow("SOURCE_LOCK_PATH_CONFLICT:data/a");
  });

  it("serialises one compact entry per line with the committed layout", () => {
    const text = serializeSourceLock(lock);
    expect(text.startsWith('{\n  "version": 1,\n  "entries": [\n    {"id":"one"')).toBe(true);
    expect(text.endsWith("}\n  ]\n}\n")).toBe(true);
    expect(JSON.parse(text)).toEqual(lock);
  });

  it("builds a derived artifact entry with a digest and unique parents", () => {
    const bytes = Buffer.from("{}\n");
    const derived = derivedArtifactEntry({ id: "x", url: "urn:x", retainedPath: "data/metadata/x.json", bytes, kind: "derived_artifact", parentIds: ["one", "one", "two"] });
    expect(derived).toMatchObject({ byteSize: 3, retainedStatus: "retained", parentIds: ["one", "two"] });
    expect(derived.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves reviewed terms for unchanged bytes and drops stale evidence for a changed pin", () => {
    const reviewed = { ...entry("one", "data/a"), license: "CC0-1.0", licenseEvidence: { url: "https://example.test/LICENSE", scope: "dataset" as const, reviewedAt: "2026-10-30", notes: "Dataset dedication." } };
    const rebuilt = { ...entry("one", "data/a") };
    delete rebuilt.license;
    const lock: SourceLock = { version: 1, entries: [reviewed] };
    expect(upsertSourceLockEntry(lock, rebuilt).entries[0]).toEqual(reviewed);
    expect(upsertSourceLockEntry(lock, { ...rebuilt, sha256: "b".repeat(64) }).entries[0]).toEqual({ ...rebuilt, sha256: "b".repeat(64), license: "unknown" });
    expect(JSON.parse(serializeSourceLock({ version: 1, entries: [rebuilt] })).entries[0].license).toBe("unknown");
  });
});
