/**
 * Refresh the dated inputs the Senate and state-legislative layers read.
 *
 *   npm run rapid:refresh                 retain today's FEC candidate summary and Open States rosters, pin them, rewrite the refresh pointer
 *   npm run rapid:refresh -- --date 2026-10-01   use an explicit snapshot date for the retained paths and pointer
 *   npm run rapid:refresh -- --skip-download     only re-point at files already retained for the date
 *   npm run rapid:refresh -- --cycle 2028        switch the FEC files to another two-year cycle
 *
 * The FEC cycle stays on the one the current pointer names until --cycle moves
 * it. It does not follow the calendar: the 2028 bulk files can lag January 1,
 * and the House and Senate layers filter on the 2026 election year, so moving
 * cycles is a model change, not a weekly refresh.
 *
 * Downloads are HTTPS only, written under data/source/rapid/, and pinned with
 * their public URL. Nothing is overwritten: a snapshot that already exists for
 * the date is verified against the lock instead of fetched again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { derivedArtifactEntry, findSourceLockEntry, readSourceLock, upsertSourceLockEntry, writeSourceLock, type SourceLock } from "@/rapid-acquisition/intake/source-lock";
import { readRefreshInputs, REFRESH_INPUTS, serializeRefreshInputs, type RefreshInputs } from "@/rapid-acquisition/refresh-inputs";
import { sha } from "@/rapid-acquisition/shared";
import { US_STATE_CODES } from "@/rapid-acquisition/us-states";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const flag = (name: string): boolean => args.includes(`--${name}`);
const today = new Date().toISOString().slice(0, 10);
const date = option("date") ?? today;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`REFRESH_DATE_INVALID:${date}`);
const stamp = date.replace(/-/g, "");
const cycleOption = option("cycle");
if (cycleOption !== undefined && !/^20\d\d$/.test(cycleOption)) throw new Error(`REFRESH_CYCLE_INVALID:${cycleOption}`);
if (cycleOption !== undefined && Number(cycleOption) % 2 !== 0) throw new Error(`REFRESH_CYCLE_NOT_EVEN:${cycleOption}`);
const out = (line: string) => process.stdout.write(`${line}\n`);

async function download(url: string): Promise<Buffer> {
  if (!url.startsWith("https://")) throw new Error(`REFRESH_URL_NOT_HTTPS:${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`REFRESH_DOWNLOAD_FAILED:${response.status}:${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function retain(lock: SourceLock, id: string, path: string, url: string): Promise<SourceLock> {
  const existing = findSourceLockEntry(lock, id);
  if (existsSync(path)) {
    const bytes = readFileSync(path);
    if (existing && (existing.sha256 !== sha(bytes) || existing.byteSize !== bytes.length)) throw new Error(`REFRESH_EXISTING_MISMATCH:${id}`);
    out(`${id}: already retained (${bytes.length} bytes)`);
    return existing ? lock : upsertSourceLockEntry(lock, derivedArtifactEntry({ id, url, retainedPath: path, bytes, kind: "source", parentIds: [] }));
  }
  if (flag("skip-download")) throw new Error(`REFRESH_MISSING_FOR_DATE:${id}`);
  const bytes = await download(url);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  out(`${id}: retained ${bytes.length} bytes sha256 ${sha(bytes)}`);
  return upsertSourceLockEntry(lock, derivedArtifactEntry({ id, url, retainedPath: path, bytes, kind: "source", parentIds: [] }));
}

async function main(): Promise<void> {
  let lock = readSourceLock();
  const cycle = cycleOption !== undefined ? Number(cycleOption) : readRefreshInputs(process.cwd(), lock).fecCandidateSummaryCycle;
  const yy = String(cycle).slice(2);
  const fecId = `fec-candidate-summary-${cycle}-${stamp}`;
  lock = await retain(lock, fecId, `data/source/rapid/fec/candidate-summary-${cycle}-${stamp}.zip`, `https://www.fec.gov/files/bulk-downloads/${cycle}/weball${yy}.zip`);
  const masterId = `fec-candidate-master-${cycle}-${stamp}`;
  lock = await retain(lock, masterId, `data/source/rapid/fec/candidate-master-${cycle}-${stamp}.zip`, `https://www.fec.gov/files/bulk-downloads/${cycle}/cn${yy}.zip`);
  // Congress roster (CC0): the Senate layer reads members, terms and FEC ids from it.
  const congressId = `congress-legislators-current-${stamp}`;
  lock = await retain(lock, congressId, `data/source/rapid/congress/legislators-current-${stamp}.json`, "https://unitedstates.github.io/congress-legislators/legislators-current.json");
  const rosterIds: string[] = [];
  for (const code of Object.values(US_STATE_CODES).map((value) => value.toLowerCase()).sort()) {
    const id = `openstates-people-${code}-${stamp}`;
    lock = await retain(lock, id, `data/source/rapid/state-legislative-roster/${stamp}/${code}.csv`, `https://data.openstates.org/people/current/${code}.csv`);
    rosterIds.push(id);
  }
  // Open States executive rosters: one YAML per statewide officer, listed through the GitHub contents API (CC0).
  const executiveIds: string[] = [];
  for (const code of Object.values(US_STATE_CODES).map((value) => value.toLowerCase()).sort()) {
    const listing = await fetch(`https://api.github.com/repos/openstates/people/contents/data/${code}/executive`, { headers: { "User-Agent": "dsa-seats-intake" } });
    if (!listing.ok) throw new Error(`REFRESH_EXECUTIVE_LISTING_FAILED:${listing.status}:${code}`);
    const files = (await listing.json()) as { name: string; download_url: string }[];
    for (const file of files.filter((entry) => entry.name.endsWith(".yml")).sort((left, right) => left.name.localeCompare(right.name))) {
      const uuid = file.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.yml$/)?.[1] ?? file.name.replace(/\.yml$/, "");
      const id = `openstates-executive-${code}-${uuid}-${stamp}`;
      lock = await retain(lock, id, `data/source/rapid/state-executives/${stamp}/${code}/${file.name}`, file.download_url);
      executiveIds.push(id);
    }
  }
  const inputs: RefreshInputs = { schema: "refresh-inputs-v1", version: 1, snapshotDate: date, fecCandidateSummaryId: fecId, fecCandidateSummaryCycle: cycle, fecCandidateMasterId: masterId, stateLegislativeRosterIds: rosterIds, stateExecutiveIds: executiveIds.sort(), congressLegislatorsId: congressId };
  const bytes = Buffer.from(serializeRefreshInputs(inputs));
  writeFileSync(REFRESH_INPUTS.path, bytes);
  lock = upsertSourceLockEntry(lock, derivedArtifactEntry({ id: REFRESH_INPUTS.id, url: `urn:dsa-seats:refresh-inputs:v1`, retainedPath: REFRESH_INPUTS.path, bytes, kind: "editorial_ledger", parentIds: [] }));
  writeSourceLock(lock);
  out(`refresh pointer now ${date}: ${fecId}, ${masterId}, ${congressId}, ${rosterIds.length} rosters, ${executiveIds.length} executive files. Next: npm run rapid:publish -- --bump`);
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
