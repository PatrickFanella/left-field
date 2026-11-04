import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Hawaii Office of Elections, certified results of the August 8, 2026
 * primary: the statewide summary text file listed under "Certified Text
 * Files" (tab-separated, after a "#FormatVersion" line), one row per
 * candidate with the statewide total. It replaces the file the House primary
 * layer retained before certification (`hi-2026-primary-summary`), which the
 * publisher has since re-issued at the same address.
 *
 * Each party has its own ballot, and the contest party column names it: D, R,
 * G (Green), L (Libertarian) or N (the nonpartisan ballot). Unopposed
 * candidates are printed. Names are "LAST, First"; House districts are Roman
 * numerals ("Dist II"). The file marks no one as a nominee. The certified
 * summary postdates the August 11 recounts (House 43, Senate 20 Republican).
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "hi-2026-primary-certified-summary-txt", url: "https://elections.hawaii.gov/wp-content/results/2026%20Primary/summary.txt", path: "data/source/rapid/state-primary/hi/2026-primary-certified-summary.txt", cycleYear: 2026, electionDate: "2026-08-08", note: "Certified statewide summary text file: governor, 2 U.S. House, State Senate and State House contests per party." },
];

const fail = (code: string): never => { throw new Error(`HAWAII_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value.trim()) ? Number(value.trim()) : fail(`INTEGER_INVALID:${value}`);
const ROMAN: Readonly<Record<string, string>> = { I: "1", II: "2" };
const PARTIES: Readonly<Record<string, string>> = { D: "Democratic", R: "Republican", G: "Green", L: "Libertarian", N: "Nonpartisan" };
const unquote = (value: string): string => value.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, "\"");
/** "KANUHA, Dru Mamo" becomes "Dru Mamo Kanuha". */
function displayName(value: string): string {
  const [last, first] = value.split(",").map((part) => part.trim());
  const title = (text: string): string => text.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
  return first ? `${first} ${title(last!)}` : value.trim();
}

const officeOf = (title: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (title === "Governor") return { office: "governor", district: null };
  const house = title.match(/^U\.S\. Representative, Dist ([IV]+)$/);
  if (house) return { office: "us_house", district: ROMAN[house[1]!] ?? fail(`HOUSE_DISTRICT:${title}`) };
  const match = title.match(/^State (Senator|Representative), Dist (\d+)$/);
  return match ? { office: match[1] === "Senator" ? "state_upper" : "state_lower", district: match[2]! } : null;
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  const lines = bytes.toString("utf8").replace(/^﻿/, "").split(/\r?\n/);
  if (!lines[0]!.startsWith("#FormatVersion 1")) fail("FORMAT_VERSION");
  const header = lines[1]!.split("\t").map((cell) => cell.replace(/^#/, "").trim());
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const titleCol = column("Contest Title"), partyCol = column("Contest Party"), nameCol = column("Candidate Name"), votesCol = column("Total Votes");
  const contests = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: number }[] }>();
  for (const line of lines.slice(2)) {
    if (line.trim() === "") continue;
    const row = line.split("\t");
    const title = unquote(row[titleCol] ?? fail("ROW_SHORT"));
    const base = officeOf(title);
    if (!base) continue;
    const code = row[partyCol]!.trim(), rawParty = PARTIES[code] ?? fail(`PARTY_UNKNOWN:${title}:${code}`);
    const key = `${title}|${code}`;
    const entry = contests.get(key) ?? { ...base, rawParty, candidates: [] };
    entry.candidates.push({ name: displayName(unquote(row[nameCol]!)), votes: integer(row[votesCol]!) });
    contests.set(key, entry);
  }
  return [...contests.values()];
}

export const HAWAII_PRIMARY: StatePrimaryAdapter = {
  stateCode: "HI",
  authority: "Hawaii Office of Elections, certified primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "hi-2026-primary-certified-summary-txt": 112 },
  parse: (bytes) => parse(bytes),
};
