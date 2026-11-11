/**
 * Retain and probe the official state-legislative general-election returns
 * every registered state adapter declares.
 *
 * `retainStateReturns` downloads what is not yet on disk and pins it in the
 * source lock; a file already on disk, or already pinned, is verified and
 * never overwritten, so a publisher that re-issues a file under the same URL
 * fails closed and the adapter must declare a new source id (with
 * `supersedes` naming the one it replaces).
 *
 * `probeStateReturns` re-fetches every declared URL and reports whether the
 * publisher's current file still matches its pin. It writes nothing; the
 * weekly refresh prints its report so a re-issued canvass or a recount shows
 * up in the Monday review.
 *
 * The CLI is scripts/rapid/retain-state-returns.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { derivedArtifactEntry, findSourceLockEntry, readSourceLock, upsertSourceLockEntry, writeSourceLock, type SourceLock } from "@/rapid-acquisition/intake/source-lock";
import { assertPdfHeader, extractPdfText, PDF_EXTRACT_TAG } from "@/rapid-acquisition/intake/pdf";
import { sha } from "@/rapid-acquisition/shared";
import { pdfLayoutExtractId, pdfLayoutExtractPath, transcriptionId, transcriptionPath, type StateGeneralAdapter, type StateGeneralSource, type StateReturnsStatus } from "@/rapid-acquisition/state-legislative-general-results";

export type StateReturnsRuntime = Readonly<{ workingDirectory?: string; fetch?: typeof fetch; log?: (line: string) => void }>;
export type ProbeStatus = "unchanged" | "changed" | "unreachable" | "unpinned";
export interface ProbeResult {
  readonly stateCode: string;
  readonly sourceId: string;
  readonly url: string;
  readonly status: ProbeStatus;
  readonly sha256: string | null;
  readonly byteSize: number | null;
  readonly detail: string | null;
}

const USER_AGENT = "left-field-intake (+https://git.subcult.tv/subculture-collective/left-field)";
/** A POST-served file is pinned under a URL that records its form body, so the lock says exactly what was requested. */
const pinnedUrl = (source: StateGeneralSource): string => source.postBody === undefined ? source.url : `${source.url}#post:${source.postBody}`;

async function request(source: StateGeneralSource, fetchImpl: typeof fetch): Promise<Response> {
  if (!source.url.startsWith("https://")) throw new Error(`STATE_RETURNS_URL_NOT_HTTPS:${source.url}`);
  const headers: Record<string, string> = { "User-Agent": source.userAgent ?? USER_AGENT };
  if (source.postBody !== undefined) headers["Content-Type"] = source.postContentType ?? "application/x-www-form-urlencoded";
  return fetchImpl(source.url, { redirect: "follow", headers, ...(source.postBody !== undefined ? { method: "POST", body: source.postBody } : {}) });
}

async function download(source: StateGeneralSource, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await request(source, fetchImpl);
  // A bot filter can answer 202 with an empty challenge page; neither that nor an empty body is the file.
  if (!response.ok || response.status === 202) throw new Error(`STATE_RETURNS_DOWNLOAD_FAILED:${response.status}:${source.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`STATE_RETURNS_DOWNLOAD_EMPTY:${source.url}`);
  return bytes;
}

async function retain(lock: SourceLock, source: StateGeneralSource, root: string, fetchImpl: typeof fetch, checkOnly: boolean, log: (line: string) => void): Promise<SourceLock> {
  const existing = findSourceLockEntry(lock, source.id), path = join(root, source.path);
  const matchesPin = (bytes: Buffer): boolean => existing !== undefined && existing.sha256 === sha(bytes) && existing.byteSize === bytes.length;
  const pin = (bytes: Buffer): SourceLock => existing ? lock : upsertSourceLockEntry(lock, derivedArtifactEntry({ id: source.id, url: pinnedUrl(source), retainedPath: source.path, bytes, kind: "official_state_returns", parentIds: [] }));
  if (existsSync(path)) {
    const bytes = readFileSync(path);
    if (existing && !matchesPin(bytes)) throw new Error(`STATE_RETURNS_EXISTING_MISMATCH:${source.id}`);
    log(`${source.id}: retained (${bytes.length} bytes)`);
    return pin(bytes);
  }
  if (checkOnly) throw new Error(`STATE_RETURNS_MISSING:${source.id}`);
  const bytes = await download(source, fetchImpl);
  // A pinned file that is missing locally may only be restored by the same bytes; anything else is a re-issue.
  if (existing && !matchesPin(bytes)) throw new Error(`STATE_RETURNS_EXISTING_MISMATCH:${source.id}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  log(`${source.id}: downloaded ${bytes.length} bytes sha256 ${sha(bytes)}`);
  return pin(bytes);
}

/** What retention and probing read from an adapter: general-election and primary adapters both qualify. */
export type ReturnsAdapter = Pick<StateGeneralAdapter, "stateCode" | "sources">;

/** `downloadOnly` fetches missing files and leaves the lock untouched, so several adapters can be written at once and pinned together later. */
export async function retainStateReturns(adapters: readonly ReturnsAdapter[], options: Readonly<{ checkOnly?: boolean; downloadOnly?: boolean }> = {}, runtime: StateReturnsRuntime = {}): Promise<SourceLock> {
  const root = runtime.workingDirectory ?? process.cwd(), fetchImpl = runtime.fetch ?? fetch, log = runtime.log ?? (() => {}), checkOnly = options.checkOnly ?? false;
  let lock = readSourceLock(root);
  for (const adapter of adapters) for (const source of adapter.sources) {
    lock = await retain(lock, source, root, fetchImpl, checkOnly, log);
    if (source.transcription) {
      // A reviewed transcription of a scanned PDF is written by hand, not generated, so it must already exist beside the PDF.
      assertPdfHeader(readFileSync(join(root, source.path)));
      const path = transcriptionPath(source.path), id = transcriptionId(source.id);
      if (!existsSync(join(root, path))) throw new Error(`STATE_RETURNS_TRANSCRIPTION_MISSING:${path}`);
      const bytes = readFileSync(join(root, path)), existing = findSourceLockEntry(lock, id);
      if (existing && existing.sha256 === sha(bytes) && existing.byteSize === bytes.length) { log(`${id}: retained transcription`); continue; }
      if (checkOnly) throw new Error(`STATE_RETURNS_TRANSCRIPTION_UNPINNED:${id}`);
      lock = upsertSourceLockEntry(lock, derivedArtifactEntry({ id, url: `urn:dsa-seats:reviewed-transcription:${source.id}`, retainedPath: path, bytes, kind: "derived_extract", parentIds: [source.id] }));
      log(`${id}: pinned ${bytes.length} bytes sha256 ${sha(bytes)}`);
    }
    if (source.pdfLayoutExtract) {
      // Extract once with pdftotext and pin the text, so builds and tests never need pdftotext.
      assertPdfHeader(readFileSync(join(root, source.path)));
      const extractPath = pdfLayoutExtractPath(source.path), extractId = pdfLayoutExtractId(source.id);
      const existing = findSourceLockEntry(lock, extractId);
      if (existing && existsSync(join(root, extractPath))) { log(`${extractId}: retained extract`); continue; }
      const bytes = extractPdfText(join(root, source.path), "layout");
      writeFileSync(join(root, extractPath), bytes);
      lock = upsertSourceLockEntry(lock, derivedArtifactEntry({ id: extractId, url: `urn:dsa-seats:${PDF_EXTRACT_TAG.layout}:${source.id}`, retainedPath: extractPath, bytes, kind: "derived_extract", parentIds: [source.id] }));
      log(`${extractId}: extracted ${bytes.length} bytes sha256 ${sha(bytes)}`);
    }
  }
  if (!options.downloadOnly) writeSourceLock(lock, root);
  return lock;
}

/** Re-fetch every declared source and compare it with its pin. Nothing is written; an unreachable publisher is reported, not fatal. */
export async function probeStateReturns(adapters: readonly ReturnsAdapter[], runtime: StateReturnsRuntime = {}): Promise<readonly ProbeResult[]> {
  const root = runtime.workingDirectory ?? process.cwd(), fetchImpl = runtime.fetch ?? fetch, log = runtime.log ?? (() => {});
  const lock = readSourceLock(root);
  const results: ProbeResult[] = [];
  for (const adapter of adapters) for (const source of adapter.sources) {
    const base = { stateCode: adapter.stateCode, sourceId: source.id, url: source.url };
    const pinned = findSourceLockEntry(lock, source.id);
    let result: ProbeResult;
    try {
      const response = await request(source, fetchImpl);
      if (!response.ok) result = { ...base, status: "unreachable", sha256: null, byteSize: null, detail: `HTTP ${response.status}` };
      else {
        const bytes = Buffer.from(await response.arrayBuffer()), digest = sha(bytes);
        result = !pinned ? { ...base, status: "unpinned", sha256: digest, byteSize: bytes.length, detail: null }
          : pinned.sha256 === digest && pinned.byteSize === bytes.length ? { ...base, status: "unchanged", sha256: digest, byteSize: bytes.length, detail: null }
          : { ...base, status: "changed", sha256: digest, byteSize: bytes.length, detail: `pinned ${pinned.sha256}` };
      }
    } catch (error) {
      result = { ...base, status: "unreachable", sha256: null, byteSize: null, detail: error instanceof Error ? error.message : String(error) };
    }
    results.push(result);
    log(`${source.id}: ${result.status}`);
  }
  return results;
}

/** The release note's result-status section, from `stateReturnsStatus` of the general-results artifact being published. */
export function formatResultStatusNote(status: StateReturnsStatus): string[] {
  if (status.unofficialStates.length === 0 && status.supersessions.length === 0) return ["## Result status", "", "Every retained general-election source is a certified canvass; no source was replaced in this release."];
  return [
    "## Result status",
    "",
    status.unofficialStates.length === 0 ? "Every retained general-election source is a certified canvass." : `Unofficial returns (not yet certified): ${status.unofficialStates.join(", ")}. Their seats say so in the brief, and the descriptor lists them under \`unofficialStates\`.`,
    ...(status.supersessions.length === 0 ? [] : ["", "Replaced sources (the earlier file stays pinned in the lock):", "", ...status.supersessions.map((pair) => `- ${pair.stateCode}: \`${pair.sourceId}\` supersedes \`${pair.supersedes}\``)]),
  ];
}

const PROBE_ORDER: Readonly<Record<ProbeStatus, number>> = { changed: 0, unreachable: 1, unpinned: 2, unchanged: 3 };

/** A Markdown report for the refresh pull request: a one-line count, then every source with changed files first. */
export function formatProbeReport(results: readonly ProbeResult[]): string {
  const count = (status: ProbeStatus): number => results.filter((result) => result.status === status).length;
  const rows = [...results].sort((left, right) => PROBE_ORDER[left.status] - PROBE_ORDER[right.status]);
  return [
    `## State returns probe: ${count("changed")} changed, ${count("unreachable")} unreachable, ${count("unpinned")} unpinned, ${count("unchanged")} unchanged of ${results.length}`,
    "",
    "| Status | State | Source | SHA-256 | Detail |",
    "|---|---|---|---|---|",
    ...rows.map((result) => `| ${result.status} | ${result.stateCode} | \`${result.sourceId}\` | ${result.sha256 ?? "—"} | ${result.detail ?? ""} |`),
    "",
  ].join("\n");
}
