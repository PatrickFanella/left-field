import { unzipSync } from "fflate";

import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Tennessee Secretary of State, August 6, 2026 election results "All by
 * Precinct" workbook: the Democratic and Republican primaries and the county
 * general election, one row per precinct per office and ballot, with candidate
 * slots repeated across the row as RNAMEk / PARTYk / PVTALLYk (the general
 * adapter's layout). ELECTTYPE names the ballot ("Democratic Primary",
 * "Republican Primary"); other ballots are skipped. Offices read "United
 * States Senate", "Governor", "United States House of Representatives District
 * 3", "Tennessee House of Representatives District 41" and "Tennessee Senate
 * District 2". Contest totals are the sum over precincts per candidate.
 * Unopposed candidates are printed. Write-in candidates appear as "Write-In -
 * Name". A party with no qualified candidate is printed as "No Candidate
 * Qualified"; that line is skipped, and a party primary left with no ballot
 * candidate (none qualified, or only write-ins) is dropped. The
 * workbook marks no winners.
 *
 * The host's bot filter answers Node's fetch with an empty 202 challenge; the
 * file was retrieved with curl and a browser user agent.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "tn-2026-primary-all-by-precinct-workbook", url: "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/20260806AllbyPrecinct.xlsx", path: "data/source/rapid/state-primary/tn/2026-primary-all-by-precinct.xlsx", cycleYear: 2026, electionDate: "2026-08-06", note: "August 6 Democratic and Republican primaries, every office, by precinct. Retrieved with curl: the host's bot filter refuses Node's fetch.", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" },
];

const fail = (code: string): never => { throw new Error(`TENNESSEE_PRIMARY_${code}`); };
const integer = (value: string): number => { const trimmed = value.trim(); return trimmed === "" ? 0 : /^\d+$/.test(trimmed) ? Number(trimmed) : fail(`INTEGER_INVALID:${value}`); };
const BALLOT: Readonly<Record<string, string>> = { "Democratic Primary": "Democratic", "Republican Primary": "Republican" };

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "United States Senate") return { office: "us_senate", district: null };
  if (raw === "Governor") return { office: "governor", district: null };
  const match = raw.match(/^(United States House of Representatives|Tennessee House of Representatives|Tennessee Senate) District (\d+)$/);
  if (!match) return null;
  return { office: match[1] === "Tennessee Senate" ? "state_upper" : match[1] === "Tennessee House of Representatives" ? "state_lower" : "us_house", district: match[2]! };
};

function firstSheet(bytes: Buffer): string {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("XLSX_INVALID"); }
  const workbook = Buffer.from(files["xl/workbook.xml"] ?? fail("WORKBOOK_MISSING")).toString("utf8");
  return workbook.match(/<sheet\b[^>]*\bname="([^"]+)"/)?.[1] ?? fail("SHEET_MISSING");
}

function parse(bytes: Buffer): RawPrimaryContest[] {
  const sheet = readWorkbookSheet(bytes, firstSheet(bytes));
  const header = Array.from({ length: sheet.maxColumn }, (_value, index) => sheet.at(index + 1, 1));
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index + 1 : fail(`COLUMN_MISSING:${name}`); };
  const officeCol = column("OFFICENAME"), typeCol = column("ELECTTYPE");
  const slots: { name: number; votes: number }[] = [];
  for (let slot = 1; header.includes(`RNAME${slot}`); slot++) slots.push({ name: column(`RNAME${slot}`), votes: column(`PVTALLY${slot}`) });
  if (slots.length === 0) fail("CANDIDATE_SLOTS_MISSING");
  const contests = new Map<string, RawPrimaryContest & { tally: Map<string, { name: string; votes: number; writeIn: boolean }> }>();
  for (let row = 2; row <= sheet.maxRow; row++) {
    const party = BALLOT[sheet.at(typeCol, row)], office = officeOf(sheet.at(officeCol, row));
    if (!party || !office) continue;
    const key = `${sheet.at(officeCol, row)}|${party}`;
    const entry = contests.get(key) ?? { ...office, rawParty: party, candidates: [], tally: new Map() };
    for (const slot of slots) {
      const raw = sheet.at(slot.name, row).replace(/\s+/g, " ").trim();
      if (raw === "" || raw === "No Candidate Qualified") continue;
      const writeIn = /^Write-In\b/i.test(raw);
      const candidate = entry.tally.get(raw) ?? { name: raw.replace(/^Write-In\s*-\s*/i, ""), votes: 0, writeIn };
      candidate.votes += integer(sheet.at(slot.votes, row));
      entry.tally.set(raw, candidate);
    }
    contests.set(key, entry);
  }
  // A primary contested only by write-in candidates has no ballot candidate; the contract cannot carry it.
  return [...contests.values()].filter(({ tally }) => [...tally.values()].some((candidate) => !candidate.writeIn)).map(({ tally, ...contest }) => ({ ...contest, candidates: [...tally.values()] }));
}

export const TENNESSEE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "TN",
  authority: "Tennessee Secretary of State, 2026 primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "tn-2026-primary-all-by-precinct-workbook": 204 },
  parse: (bytes) => parse(bytes),
};
