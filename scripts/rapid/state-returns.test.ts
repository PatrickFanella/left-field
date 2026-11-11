import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { StateGeneralAdapter, StateGeneralSource } from "@/rapid-acquisition/state-legislative-general-results";

import { formatProbeReport, formatResultStatusNote, probeStateReturns, retainStateReturns } from "./state-returns";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const temporaryDirectories: string[] = [];
const source = (id: string, overrides: Partial<StateGeneralSource> = {}): StateGeneralSource => ({ id, url: `https://example.gov/${id}.csv`, path: `data/source/rapid/state-general/xx/${id}.csv`, cycleYear: 2026, electionDate: "2026-11-03", note: "fixture", ...overrides });
const adapter = (sources: readonly StateGeneralSource[]): StateGeneralAdapter => ({ stateCode: "XX", authority: "fixture", sources, expectedContests: Object.fromEntries(sources.map((entry) => [entry.id, 0])), parse: () => [] });
const lockEntry = (entry: StateGeneralSource, body: string) => ({ id: entry.id, url: entry.url, retainedPath: entry.path, retainedStatus: "retained", byteSize: Buffer.byteLength(body), sha256: sha256(body), kind: "official_state_returns", parentIds: [], license: "public-record" });

async function testRoot(entries: unknown[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dsa-seats-state-returns-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(join(root, "data/source-lock.json"), JSON.stringify({ version: 1, entries }));
  return root;
}
const lockBytes = (root: string) => readFile(join(root, "data/source-lock.json"), "utf8");
const respond = (bodies: Readonly<Record<string, string | Error>>): typeof fetch => async (input) => {
  const url = String(input), body = bodies[url];
  if (body === undefined) return new Response("missing", { status: 404 });
  if (body instanceof Error) throw body;
  return new Response(body);
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("retainStateReturns", () => {
  it("refuses to re-pin a missing file whose download differs from the lock", async () => {
    const pinned = source("xx-2026-general-csv"), root = await testRoot([lockEntry(pinned, "old bytes")]);
    const before = await lockBytes(root);
    await expect(retainStateReturns([adapter([pinned])], {}, { workingDirectory: root, fetch: respond({ [pinned.url]: "new bytes" }) })).rejects.toThrow("STATE_RETURNS_EXISTING_MISMATCH:xx-2026-general-csv");
    expect(existsSync(join(root, pinned.path))).toBe(false);
    expect(await lockBytes(root)).toBe(before);
  });

  it("restores a missing file whose download matches the lock", async () => {
    const pinned = source("xx-2026-general-csv"), root = await testRoot([lockEntry(pinned, "old bytes")]);
    const before = await lockBytes(root);
    await retainStateReturns([adapter([pinned])], {}, { workingDirectory: root, fetch: respond({ [pinned.url]: "old bytes" }), log: () => {} });
    expect(await readFile(join(root, pinned.path), "utf8")).toBe("old bytes");
    expect(JSON.parse(await lockBytes(root))).toEqual(JSON.parse(before));
  });
});

describe("probeStateReturns", () => {
  it("compares each declared URL against its pin without writing anything", async () => {
    const same = source("xx-2026-general-csv"), moved = source("xx-2026-general-amended-csv"), dark = source("xx-2026-general-pdf"), fresh = source("xx-2026-general-new-csv");
    const root = await testRoot([lockEntry(same, "same bytes"), lockEntry(moved, "first canvass"), lockEntry(dark, "scan")]);
    const before = await lockBytes(root);
    const results = await probeStateReturns([adapter([same, moved, dark, fresh])], { workingDirectory: root, fetch: respond({ [same.url]: "same bytes", [moved.url]: "amended canvass", [dark.url]: new Error("ECONNRESET"), [fresh.url]: "unpinned bytes" }) });
    expect(results).toEqual([
      { stateCode: "XX", sourceId: same.id, url: same.url, status: "unchanged", sha256: sha256("same bytes"), byteSize: 10, detail: null },
      { stateCode: "XX", sourceId: moved.id, url: moved.url, status: "changed", sha256: sha256("amended canvass"), byteSize: 15, detail: `pinned ${sha256("first canvass")}` },
      { stateCode: "XX", sourceId: dark.id, url: dark.url, status: "unreachable", sha256: null, byteSize: null, detail: "ECONNRESET" },
      { stateCode: "XX", sourceId: fresh.id, url: fresh.url, status: "unpinned", sha256: sha256("unpinned bytes"), byteSize: 14, detail: null },
    ]);
    expect(existsSync(join(root, "data/source"))).toBe(false);
    expect(await lockBytes(root)).toBe(before);
  });

  it("reports a 404 as unreachable", async () => {
    const pinned = source("xx-2026-general-csv"), root = await testRoot([lockEntry(pinned, "bytes")]);
    const [result] = await probeStateReturns([adapter([pinned])], { workingDirectory: root, fetch: respond({}) });
    expect(result).toMatchObject({ status: "unreachable", detail: "HTTP 404" });
  });
});

describe("formatResultStatusNote", () => {
  it("writes the release note's result-status section from the general-results summary", () => {
    expect(formatResultStatusNote({ unofficialStates: [], supersessions: [] })).toEqual(["## Result status", "", "Every retained general-election source is a certified canvass; no source was replaced in this release."]);
    expect(formatResultStatusNote({ unofficialStates: ["WV"], supersessions: [{ stateCode: "GA", sourceId: "ga-2026-general-certified-csv", supersedes: "ga-2026-general-unofficial-csv" }] })).toEqual([
      "## Result status",
      "",
      "Unofficial returns (not yet certified): WV. Their seats say so in the brief, and the descriptor lists them under `unofficialStates`.",
      "",
      "Replaced sources (the earlier file stays pinned in the lock):",
      "",
      "- GA: `ga-2026-general-certified-csv` supersedes `ga-2026-general-unofficial-csv`",
    ]);
  });
});

describe("formatProbeReport", () => {
  it("lists every source with its status and puts changed files first", () => {
    const report = formatProbeReport([
      { stateCode: "XX", sourceId: "xx-same", url: "https://example.gov/same", status: "unchanged", sha256: "a".repeat(64), byteSize: 10, detail: null },
      { stateCode: "XX", sourceId: "xx-moved", url: "https://example.gov/moved", status: "changed", sha256: "b".repeat(64), byteSize: 15, detail: `pinned ${"c".repeat(64)}` },
      { stateCode: "YY", sourceId: "yy-dark", url: "https://example.gov/dark", status: "unreachable", sha256: null, byteSize: null, detail: "ECONNRESET" },
    ]);
    const lines = report.split("\n");
    expect(lines[0]).toBe("## State returns probe: 1 changed, 1 unreachable, 0 unpinned, 1 unchanged of 3");
    expect(lines.findIndex((line) => line.includes("xx-moved"))).toBeLessThan(lines.findIndex((line) => line.includes("yy-dark")));
    expect(lines.findIndex((line) => line.includes("yy-dark"))).toBeLessThan(lines.findIndex((line) => line.includes("xx-same")));
    expect(report).toContain(`| changed | XX | \`xx-moved\` | ${"b".repeat(64)} | pinned ${"c".repeat(64)} |`);
    expect(report).toContain("| unreachable | YY | `yy-dark` | — | ECONNRESET |");
  });
});
