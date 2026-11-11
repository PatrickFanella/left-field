import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Maryland State Board of Elections, official results of the June 23, 2026
 * gubernatorial primary, one "legislative breakdown" file per party. Rows
 * whose County is 00 ("State of Maryland") are statewide candidate rows, with
 * that candidate's votes spread across one column per legislative district or
 * subdistrict; a candidate's total is the row sum. The same file holds the
 * governor (a joint ticket, named as printed), U.S. House and both chambers;
 * there is no U.S. Senate contest in 2026. Every filed candidate is printed,
 * unopposed or not, and the Board marks each nominee "Y" in Winner.
 *
 * House of Delegates districts elect one, two or three members. The file does
 * not print the vote-for count, so it is taken from the 2022 districting plan
 * (the same plan the 2022 general results show): an unlettered district
 * elects three, the subdistricts in TWO_MEMBER two, every other subdistrict
 * one. District labels are zero-padded in the file ("01A") and not in the
 * roster ("1A").
 */
const PARTIES = ["Democratic", "Republican"] as const;
const SOURCES: readonly StateGeneralSource[] = PARTIES.map((party) => ({
  id: `md-2026-primary-legislative-breakdown-${party.toLowerCase()}-csv`,
  url: `https://elections.maryland.gov/elections/2026/election_data/GP26_LegislativeBreakDown${party}.csv`,
  path: `data/source/rapid/state-primary/md/2026-primary-legislative-breakdown-${party.toLowerCase()}.csv`,
  cycleYear: 2026,
  electionDate: "2026-06-23",
  note: `${party} primary of June 23, 2026, official results by legislative district; governor, U.S. House and both chambers.`,
}));

const OFFICES: Readonly<Record<string, PrimaryOffice>> = { "Governor / Lt. Governor": "governor", "U.S. Congress": "us_house", "State Senator": "state_upper", "House of Delegates": "state_lower" };
const PARTY_CODES: Readonly<Record<string, string>> = { DEM: "Democratic", REP: "Republican" };
const TWO_MEMBER = new Set(["2A", "7A", "9A", "11B", "12A", "30A", "34A", "35A", "37B", "43A", "44B", "47A"]);
const delegates = (district: string): number => /^\d+$/.test(district) ? 3 : TWO_MEMBER.has(district) ? 2 : 1;

const fail = (code: string): never => { throw new Error(`MARYLAND_PRIMARY_${code}`); };
const integer = (value: string): number => { const trimmed = value.trim().replace(/,/g, ""); return trimmed === "" ? 0 : /^\d+$/.test(trimmed) ? Number(trimmed) : fail(`INTEGER_INVALID:${value}`); };
const unpad = (value: string): string => value.trim().replace(/^0+(?=\d)/, "");

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const party = PARTIES.find((name) => source.id.includes(`-${name.toLowerCase()}-`)) ?? fail(`SOURCE_UNKNOWN:${source.id}`);
  const table = parseCsv(bytes.toString("utf8").replace(/^﻿/, ""));
  const header = table[0]!.map((cell) => cell.trim());
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const countyCol = column("County"), officeCol = column("Office Name"), districtCol = column("Office District"), nameCol = column("Candidate Name"), partyCol = column("Party"), winnerCol = column("Winner");
  const districtColumns = header.flatMap((name, index) => name.startsWith("Legislative District ") ? [[name.replace(/^Legislative District /, ""), index] as const] : []);
  if (districtColumns.length === 0) fail("DISTRICT_COLUMNS_MISSING");
  const contests = new Map<string, { office: PrimaryOffice; district: string | null; winners: number; candidates: { name: string; votes: number; winner?: boolean }[] }>();
  for (const row of table.slice(1)) {
    if (row.length < header.length || row[countyCol]!.trim() !== "00") continue;
    const office = OFFICES[row[officeCol]!.trim()];
    if (!office) continue;
    if (PARTY_CODES[row[partyCol]!.trim()] !== party) fail(`PARTY_DRIFT:${row[nameCol]}`);
    const district = office === "governor" ? null : office === "us_house" ? unpad(row[districtCol]!) : unpad(row[districtCol]!).toUpperCase();
    const key = `${office}|${district}`;
    const entry = contests.get(key) ?? { office, district, winners: 0, candidates: [] };
    let votes = 0;
    for (const [piece, index] of districtColumns) {
      const value = integer(row[index] ?? "");
      const inside = office === "state_lower" ? piece === district : office === "state_upper" ? piece.replace(/[A-C]$/, "") === district : true;
      if (value > 0 && !inside) fail(`VOTES_OUTSIDE_DISTRICT:${office}:${district}:${piece}`);
      votes += value;
    }
    const winner = row[winnerCol]!.trim() === "Y";
    // "Jeffrie E. Long, Jr.": the comma before a suffix would read as "LAST, First" to the name matcher.
    const name = row[nameCol]!.trim().replace(/,\s*(Jr\.?|Sr\.?|II|III|IV)$/, " $1");
    entry.candidates.push({ name, votes, ...(winner ? { winner: true } : {}) });
    if (winner) entry.winners += 1;
    contests.set(key, entry);
  }
  return [...contests.values()].map(({ winners, ...entry }) => {
    const seats = entry.office === "state_lower" ? delegates(entry.district!) : 1;
    if (winners > seats) fail(`WINNERS_INVALID:${entry.office}:${entry.district}:${winners}`);
    return { ...entry, rawParty: party, ...(seats > 1 ? { seats } : {}) };
  });
}

export const MARYLAND_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MD",
  authority: "Maryland State Board of Elections, official primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "md-2026-primary-legislative-breakdown-democratic-csv": 127, "md-2026-primary-legislative-breakdown-republican-csv": 85 },
  parse: (bytes, source) => parse(bytes, source),
};
