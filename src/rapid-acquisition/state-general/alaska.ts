import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";

/**
 * Alaska Division of Elections, official general election results.
 *
 * Alaska has used ranked-choice general elections since 2022. Both files give
 * first-choice totals only, so the baseline for an Alaska seat is the
 * first-round margin, not the final-round result; in the handful of
 * contests that went to later rounds the two can differ.
 *
 * - 2024: "ENRbyPrecinct.csv", one row per candidate per precinct or counting
 *   group ("District 16 - Absentee"), summed per candidate. All 40 House
 *   districts and the ten even-lettered Senate districts (B, D, ... T).
 * - 2022: "ElectionSummaryReportRPT.xml", a report-server export with one
 *   ContestIdGroup per contest; each candidate block carries the name, the
 *   party (Textbox14) and the total (vot8). Read only for the odd-lettered
 *   Senate districts (A, C, ... S), which were not on the 2024 ballot.
 *
 * Senate districts are letters, as in the roster. Party codes include NON
 * (nonpartisan) and UND (undeclared); write-ins appear only in 2022.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ak-2024-general-enr-by-precinct-csv", url: "https://www.elections.alaska.gov/results/24GENR/ENRbyPrecinct.csv", path: "data/source/rapid/state-general/ak/2024-general-enr-by-precinct.csv", cycleYear: 2024, electionDate: "2024-11-05", note: "40 House and 10 even-lettered Senate contests, first-choice totals." },
  { id: "ak-2022-general-summary-xml", url: "https://elections.alaska.gov/results/22GENR/ElectionSummaryReportRPT.xml", path: "data/source/rapid/state-general/ak/2022-general-summary.xml", cycleYear: 2022, electionDate: "2022-11-08", note: "Read only for the 10 odd-lettered Senate contests, first-choice totals." },
];

const ODD_LETTERS = new Set(["A", "C", "E", "G", "I", "K", "M", "O", "Q", "S"]);
const fail = (code: string): never => { throw new Error(`ALASKA_GENERAL_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value.trim()) ? Number(value.trim()) : fail(`INTEGER_INVALID:${value}`);
const decode = (value: string): string => value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
/** "Sheldon, Mike" becomes "Mike Sheldon". */
const displayName = (value: string): string => { const [last, first] = value.split(",").map((part) => part.trim()); return first ? `${first} ${last}` : value.trim(); };

function parse2024(bytes: Buffer): RawGeneralContest[] {
  const table = parseCsv(bytes.toString("utf8"));
  const header = table[0] ?? fail("EMPTY");
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const contestCol = column("Contest_title"), nameCol = column("candidate_name"), partyCol = column("Party_Code"), votesCol = column("total_votes");
  const contests = new Map<string, { chamber: "upper" | "lower"; district: string; candidates: Map<string, { name: string; rawParty: string; votes: number }> }>();
  for (const row of table.slice(1)) {
    const title = row[contestCol]!.trim();
    const match = title.match(/^(House|Senate) District ([0-9]+|[A-T])$/);
    if (!match) continue;
    const entry = contests.get(title) ?? { chamber: match[1] === "Senate" ? "upper" as const : "lower" as const, district: match[2]!, candidates: new Map() };
    const name = row[nameCol]!.trim(), rawParty = row[partyCol]!.trim();
    const candidate = entry.candidates.get(`${name}|${rawParty}`) ?? { name, rawParty, votes: 0 };
    candidate.votes += integer(row[votesCol]!);
    entry.candidates.set(`${name}|${rawParty}`, candidate);
    contests.set(title, entry);
  }
  return [...contests.values()].map((entry) => ({ chamber: entry.chamber, district: entry.district, candidates: [...entry.candidates.values()] }));
}

function parse2022(bytes: Buffer): RawGeneralContest[] {
  const xml = bytes.toString("utf8").replace(/^﻿/, "");
  const contests: RawGeneralContest[] = [];
  for (const group of xml.matchAll(/<ContestIdGroup contestId="Senate District ([A-T])\s*">([\s\S]*?)<\/ContestIdGroup>/g)) {
    const district = group[1]!;
    if (!ODD_LETTERS.has(district)) continue;
    const candidates = [...group[2]!.matchAll(/<candidateNameTextBox4 candidateNameTextBox4="([^"]*)">\s*<Textbox2 Textbox2="Party" Textbox14="([^"]*)" \/>[\s\S]*?<Textbox13 vot8="(\d+)"/g)].map((match) => {
      const raw = decode(match[1]!).trim(), writeIn = /^write-?in$/i.test(raw);
      return { name: writeIn ? "Write-in" : displayName(raw), rawParty: writeIn ? "" : match[2]!.trim(), votes: integer(match[3]!), writeIn };
    });
    if (candidates.length === 0) fail(`NO_CANDIDATES:${district}`);
    contests.push({ chamber: "upper", district, candidates });
  }
  return contests;
}

export const ALASKA_GENERAL: StateGeneralAdapter = {
  stateCode: "AK",
  authority: "Alaska Division of Elections, official general election results (first-choice totals)",
  sources: SOURCES,
  expectedContests: { "ak-2024-general-enr-by-precinct-csv": 50, "ak-2022-general-summary-xml": 10 },
  // Dispatch on the file format, so a later ENRbyPrecinct.csv parses like 2024 without a code change.
  parse: (bytes, source) => source.path.endsWith(".csv") ? parse2024(bytes) : source.path.endsWith(".xml") ? parse2022(bytes) : fail(`FORMAT_UNKNOWN:${source.id}`),
};
