import { unzipSync } from "fflate";

import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * West Virginia Secretary of State, May 12, 2026 primary election (Clarity
 * ENR summary.zip, status "Declared Results" after the county canvasses). One
 * CSV row per candidate with the contest total; Latin-1. Contest names read
 * "U.S. SENATOR - REP (Vote For 1)", "U.S. HOUSE OF REPRESENTATIVES, 1st
 * Congressional District - DEM (Vote For 1)", "STATE SENATOR, 1st Senatorial
 * District - REP (Vote For 1)" and "HOUSE OF DELEGATES, 1st District - REP
 * (Vote For 1)". Unopposed candidates are printed; a party with no filer is
 * printed with a "NO CANDIDATE FILED" line, which is dropped with its contest.
 * Names are upper case. The summary marks no winners. "- UNEXPIRED TERM"
 * contests (State Senate 3 and 17) are special primaries for the district's
 * other seat.
 *
 * Each Senate district elects one of its two members in 2026; the seat is
 * named by the district alone, as in the frozen seat ids' district part.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "wv-2026-primary-clarity-summary-zip", url: "https://results.enr.clarityelections.com/WV/126209/375698/reports/summary.zip", path: "data/source/rapid/state-primary/wv/2026-primary-clarity-summary.zip", cycleYear: 2026, electionDate: "2026-05-12", note: "Every office and party; Clarity status \"Declared Results\".", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" },
];

const fail = (code: string): never => { throw new Error(`WEST_VIRGINIA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);
const PARTY: Readonly<Record<string, string>> = { DEM: "Democratic", REP: "Republican" };

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "U.S. SENATOR") return { office: "us_senate", district: null };
  if (raw === "GOVERNOR") return { office: "governor", district: null };
  const match = raw.match(/^(U\.S\. HOUSE OF REPRESENTATIVES|STATE SENATOR|HOUSE OF DELEGATES), (\d+)(?:st|nd|rd|th) (?:Congressional |Senatorial )?District$/);
  if (!match) return null;
  return { office: match[1] === "HOUSE OF DELEGATES" ? "state_lower" : match[1] === "STATE SENATOR" ? "state_upper" : "us_house", district: match[2]! };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("ZIP_INVALID"); }
  const table = parseCsv(Buffer.from(files["summary.csv"] ?? fail("SUMMARY_MISSING")).toString("latin1"));
  const header = table[0]!.map((cell) => cell.trim().toLowerCase());
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const contestCol = column("contest name"), nameCol = column("choice name"), votesCol = column("total votes");
  const contests = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: number; writeIn: boolean }[] }>();
  for (const row of table.slice(1)) {
    if (row.length < header.length) continue;
    const contest = row[contestCol]!.replace(/\s+/g, " ").trim();
    const match = contest.match(/^(.+) - (DEM|REP)( - UNEXPIRED TERM)? \(Vote For (\d+)\)$/);
    const office = match ? officeOf(match[1]!) : null;
    const name = row[nameCol]!.replace(/\s+/g, " ").trim();
    if (!match || !office || name === "NO CANDIDATE FILED") continue;
    const entry = contests.get(contest) ?? { ...office, rawParty: PARTY[match[2]!]!, ...(match[3] ? { special: true } : {}), seats: Number(match[4]), candidates: [] };
    entry.candidates.push({ name, votes: integer(row[votesCol]!.trim()), writeIn: /^write-?ins?$/i.test(name) });
    contests.set(contest, entry);
  }
  return [...contests.values()];
}

export const WEST_VIRGINIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WV",
  authority: "West Virginia Secretary of State, 2026 primary election results (Clarity ENR)",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "wv-2026-primary-clarity-summary-zip": 223 },
  parse: (bytes) => parse(bytes),
};
