import { unzipSync } from "fflate";

import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Iowa Secretary of State, results of the June 2, 2026 primary on its Clarity
 * ENR site (election 126082), summary.zip re-published on July 14 after the
 * State Board of Canvassers canvassed the primary on June 22. One CSV row
 * per candidate with statewide totals; contests read "United States
 * Representative District 1 - Rep. (Vote For 1)", "State Senator District 25
 * - Dem. (Vote For 1)". Every district appears for both parties, uncontested
 * ones included; a party with no filed candidate has only a "Write-in" line
 * and, in a few districts, a "Blank" line, and is left out (no named
 * candidate, so nothing to read). "Write-in" lines, and the one named line
 * printed without a party, are kept as write-ins; "Blank" lines are not votes for anyone and are dropped. The file marks no
 * nominee.
 *
 * All 100 House districts and the 25 odd-numbered Senate districts were on
 * the ballot, with the U.S. Senate, the four U.S. House districts and
 * governor.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ia-2026-primary-clarity-summary-zip", url: "https://electionresults.iowa.gov/IA/126082/377216/reports/summary.zip", path: "data/source/rapid/state-primary/ia/2026-primary-clarity-summary.zip", cycleYear: 2026, electionDate: "2026-06-02", note: "Clarity summary, version published 2026-07-14 after the state canvass of 2026-06-22: U.S. Senate, U.S. House, governor, 100 House and 25 Senate districts, Republican and Democratic." },
];

const PARTIES: Readonly<Record<string, string>> = { "Rep.": "Republican", "Dem.": "Democratic" };
const fail = (code: string): never => { throw new Error(`IOWA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

const contestOf = (raw: string): (Pick<RawPrimaryContest, "office" | "district"> & { rawParty: string }) | null => {
  const match = raw.match(/^(United States Senator|Governor|United States Representative District (\d+)|State Senator District (\d+)|State Representative District (\d+)) - (Rep\.|Dem\.) \(Vote For 1\)$/);
  if (!match) return null;
  const rawParty = PARTIES[match[5]!]!;
  if (match[1] === "United States Senator") return { office: "us_senate", district: null, rawParty };
  if (match[1] === "Governor") return { office: "governor", district: null, rawParty };
  const office: PrimaryOffice = match[2] ? "us_house" : match[3] ? "state_upper" : "state_lower";
  return { office, district: String(Number(match[2] ?? match[3] ?? match[4])), rawParty };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("ZIP_INVALID"); }
  const table = parseCsv(Buffer.from(files["summary.csv"] ?? fail("SUMMARY_MISSING")).toString("latin1"));
  const header = table[0]!.map((cell) => cell.trim().toLowerCase());
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const contestCol = column("contest name"), nameCol = column("choice name"), partyCol = column("party name"), votesCol = column("total votes");
  const contests = new Map<string, Pick<RawPrimaryContest, "office" | "district"> & { rawParty: string; candidates: { name: string; votes: number; writeIn?: boolean }[] }>();
  for (const row of table.slice(1)) {
    if (row.length === 1 && row[0]!.trim() === "") continue;
    const label = row[contestCol]!.replace(/\s+/g, " ").trim();
    const found = contestOf(label);
    if (!found) continue;
    const entry = contests.get(label) ?? { ...found, candidates: [] };
    contests.set(label, entry);
    const name = row[nameCol]!.replace(/\s+/g, " ").trim(), party = row[partyCol]!.trim(), votes = integer(row[votesCol]!.trim());
    if (/^blank$/i.test(name)) continue;
    if (/^write-?ins?$/i.test(name)) { entry.candidates.push({ name: "Write-in", votes, writeIn: true }); continue; }
    // A named line without a party is a write-in counted by name (House 53, Democratic).
    if (party === "") { entry.candidates.push({ name, votes, writeIn: true }); continue; }
    if (party !== entry.rawParty.slice(0, 3).toUpperCase()) fail(`PARTY_MISMATCH:${label}:${name}:${party}`);
    entry.candidates.push({ name, votes });
  }
  if (contests.size === 0) fail("NO_CONTESTS");
  return [...contests.values()].filter((entry) => entry.candidates.some((candidate) => !candidate.writeIn))
    .map(({ office, district, rawParty, candidates }) => ({ office, district, rawParty, candidates }));
}

export const IOWA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "IA",
  authority: "Iowa Secretary of State, primary election results (Clarity ENR)",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ia-2026-primary-clarity-summary-zip": 210 },
  parse: (bytes) => parse(bytes),
};
