/**
 * Retain the official state-legislative general-election returns every
 * registered state adapter declares, and pin them in the source lock.
 *
 *   npm run rapid:state-returns                 retain every declared source that is not yet on disk
 *   npm run rapid:state-returns -- --state GA   only one state
 *   npm run rapid:state-returns -- --check      verify retained bytes against the lock; download nothing
 *
 * Downloads are HTTPS only and written under data/source/rapid/state-general/.
 * A file already on disk is verified against the lock, never overwritten; a
 * publisher that re-issues a file under the same URL therefore fails closed
 * and the adapter must declare a new source id.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { derivedArtifactEntry, findSourceLockEntry, readSourceLock, upsertSourceLockEntry, writeSourceLock, type SourceLock } from "@/rapid-acquisition/intake/source-lock";
import { sha } from "@/rapid-acquisition/shared";
import { assertPdfHeader, extractPdfText, PDF_EXTRACT_TAG } from "@/rapid-acquisition/intake/pdf";
import { STATE_GENERAL_ADAPTERS } from "@/rapid-acquisition/state-general";
import { pdfLayoutExtractId, pdfLayoutExtractPath, transcriptionId, transcriptionPath } from "@/rapid-acquisition/state-legislative-general-results";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const checkOnly = args.includes("--check");
const only = option("state")?.toUpperCase();
const out = (line: string) => process.stdout.write(`${line}\n`);

async function download(url: string, postBody?: string, postContentType?: string, userAgent?: string): Promise<Buffer> {
  if (!url.startsWith("https://")) throw new Error(`STATE_RETURNS_URL_NOT_HTTPS:${url}`);
  const headers: Record<string, string> = { "User-Agent": userAgent ?? "dsa-seats-intake (+https://git.subcult.tv/subculture-collective/dsa-seats)" };
  if (postBody !== undefined) headers["Content-Type"] = postContentType ?? "application/x-www-form-urlencoded";
  const response = await fetch(url.replace(/#post:.*$/, ""), { redirect: "follow", headers, ...(postBody !== undefined ? { method: "POST", body: postBody } : {}) });
  if (!response.ok) throw new Error(`STATE_RETURNS_DOWNLOAD_FAILED:${response.status}:${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function retain(lock: SourceLock, id: string, path: string, url: string, postBody?: string, postContentType?: string, userAgent?: string): Promise<SourceLock> {
  const existing = findSourceLockEntry(lock, id);
  if (existsSync(path)) {
    const bytes = readFileSync(path);
    if (existing && (existing.sha256 !== sha(bytes) || existing.byteSize !== bytes.length)) throw new Error(`STATE_RETURNS_EXISTING_MISMATCH:${id}`);
    out(`${id}: retained (${bytes.length} bytes)`);
    return existing ? lock : upsertSourceLockEntry(lock, derivedArtifactEntry({ id, url, retainedPath: path, bytes, kind: "official_state_returns", parentIds: [] }));
  }
  if (checkOnly) throw new Error(`STATE_RETURNS_MISSING:${id}`);
  const bytes = await download(url, postBody, postContentType, userAgent);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  out(`${id}: downloaded ${bytes.length} bytes sha256 ${sha(bytes)}`);
  return upsertSourceLockEntry(lock, derivedArtifactEntry({ id, url, retainedPath: path, bytes, kind: "official_state_returns", parentIds: [] }));
}

async function main(): Promise<void> {
  let lock = readSourceLock();
  const adapters = STATE_GENERAL_ADAPTERS.filter((adapter) => !only || adapter.stateCode === only);
  if (adapters.length === 0) throw new Error(`STATE_RETURNS_NO_ADAPTER:${only ?? "any"}`);
  // A POST-served file is pinned under a URL that records its form body, so the lock says exactly what was requested.
  for (const adapter of adapters) for (const source of adapter.sources) {
    lock = await retain(lock, source.id, source.path, source.postBody === undefined ? source.url : `${source.url}#post:${source.postBody}`, source.postBody, source.postContentType, source.userAgent);
    if (source.transcription) {
      // A reviewed transcription of a scanned PDF is written by hand, not generated, so it must already exist beside the PDF.
      assertPdfHeader(readFileSync(source.path));
      const path = transcriptionPath(source.path), id = transcriptionId(source.id);
      if (!existsSync(path)) throw new Error(`STATE_RETURNS_TRANSCRIPTION_MISSING:${path}`);
      const bytes = readFileSync(path), existing = findSourceLockEntry(lock, id);
      if (existing && existing.sha256 === sha(bytes) && existing.byteSize === bytes.length) { out(`${id}: retained transcription`); continue; }
      if (checkOnly) throw new Error(`STATE_RETURNS_TRANSCRIPTION_UNPINNED:${id}`);
      lock = upsertSourceLockEntry(lock, derivedArtifactEntry({ id, url: `urn:dsa-seats:reviewed-transcription:${source.id}`, retainedPath: path, bytes, kind: "derived_extract", parentIds: [source.id] }));
      out(`${id}: pinned ${bytes.length} bytes sha256 ${sha(bytes)}`);
    }
    if (source.pdfLayoutExtract) {
      // Extract once with pdftotext and pin the text, so builds and tests never need pdftotext.
      assertPdfHeader(readFileSync(source.path));
      const extractPath = pdfLayoutExtractPath(source.path), extractId = pdfLayoutExtractId(source.id);
      const existing = findSourceLockEntry(lock, extractId);
      if (existing && existsSync(extractPath)) { out(`${extractId}: retained extract`); continue; }
      const bytes = extractPdfText(source.path, "layout");
      writeFileSync(extractPath, bytes);
      lock = upsertSourceLockEntry(lock, derivedArtifactEntry({ id: extractId, url: `urn:dsa-seats:${PDF_EXTRACT_TAG.layout}:${source.id}`, retainedPath: extractPath, bytes, kind: "derived_extract", parentIds: [source.id] }));
      out(`${extractId}: extracted ${bytes.length} bytes sha256 ${sha(bytes)}`);
    }
  }
  writeSourceLock(lock);
  out(`${adapters.length} state(s), ${adapters.reduce((sum, adapter) => sum + adapter.sources.length, 0)} source(s) retained. Next: npm run rapid:intake -- derive state-legislative-general-results-v1`);
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
