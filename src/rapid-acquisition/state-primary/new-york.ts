import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * New York State Board of Elections, Elections Database export (the same
 * Civera ElectionStats database as the general-election adapter, now served
 * from ny.elstats3.civera.com), filtered to 2026 and the offices
 * Representative in Congress (13), State Senator (5) and Member of Assembly
 * (14). The June 23, 2026 primary is election 164; rows are one per
 * candidate per county.
 *
 * New York holds a primary only when it is contested, so the export has no
 * row for a nominee who ran unopposed, and no governor primary was held.
 * Minor-party (fusion) primaries do not decide a major-party holder's
 * nomination and are not read; only Democratic and Republican primaries are.
 * Votes are summed over counties. The export's `is_winner` is set per county
 * (the county leader), not per contest, so it is not read as a nominee mark;
 * the certified count orders the candidates. "Scattering" is the write-in
 * line; "Blank", "Void" and "Total Votes" are dropped.
 */
const SEARCH = { global: { years: { from: 2026, to: 2026 } }, ballotQuestions: { text: "", types: [], number: "", divisions: [] }, contests: { candidates: [], divisions: [], offices: [{ id: 13 }, { id: 5 }, { id: 14 }] }, specialElectionsOnly: false, voterStats: false, stages: [] };
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ny-2026-primary-contests-csv", url: `https://ny.elstats3.civera.com/api/download_search.csv?search=${encodeURIComponent(JSON.stringify(SEARCH))}`, path: "data/source/rapid/state-primary/ny/2026-primary-contests.csv", cycleYear: 2026, electionDate: "2026-06-23", note: "Representative in Congress, State Senator and Member of Assembly contests for 2026 (primary election id 164); contested primaries only." },
];

const PRIMARY_ELECTION_ID = "164";
const OFFICES: Readonly<Record<string, PrimaryOffice>> = { "Representative in Congress": "us_house", "State Senator": "state_upper", "Member of Assembly": "state_lower" };
const ACCOUNTING_ROWS = new Set(["Blank", "Void", "Total Votes"]);
const fail = (code: string): never => { throw new Error(`NEW_YORK_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

function parse(bytes: Buffer): RawPrimaryContest[] {
  const table = parseCsv(bytes.toString("utf8").replace(/^﻿/, ""));
  const header = table[0] ?? fail("EMPTY");
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const electionCol = column("election_id"), typeCol = column("election_type"), partyCol = column("primary_party"), officeCol = column("office_name"), districtCol = column("district_name"), contestCol = column("contest_id"), candidateIdCol = column("candidate_id"), nameCol = column("candidate_name"), divisionCol = column("division_type"), votesCol = column("votes"), seatsCol = column("number_seats");
  const contests = new Map<string, { office: PrimaryOffice; district: string; party: string; seats: number; candidates: Map<string, { name: string; votes: number; writeIn: boolean }> }>();
  for (const row of table.slice(1)) {
    if (row[electionCol] !== PRIMARY_ELECTION_ID) continue;
    if (row[typeCol] !== "Primary" || row[divisionCol] !== "County") fail(`ROW_KIND:${row[typeCol]}:${row[divisionCol]}`);
    const party = row[partyCol]!;
    if (party !== "Democratic" && party !== "Republican") continue;
    const name = row[nameCol]!;
    if (ACCOUNTING_ROWS.has(name)) continue;
    const office = OFFICES[row[officeCol]!] ?? fail(`OFFICE_UNKNOWN:${row[officeCol]}`);
    const key = row[contestCol]!;
    const entry = contests.get(key) ?? { office, district: row[districtCol]!, party, seats: integer(row[seatsCol]!), candidates: new Map() };
    if (entry.office !== office || entry.district !== row[districtCol] || entry.party !== party) fail(`CONTEST_INCONSISTENT:${key}`);
    const candidate = entry.candidates.get(row[candidateIdCol]!) ?? { name, votes: 0, writeIn: name === "Scattering" };
    candidate.votes += integer(row[votesCol]!);
    entry.candidates.set(row[candidateIdCol]!, candidate);
    contests.set(key, entry);
  }
  return [...contests.values()].map((entry) => ({ office: entry.office, district: entry.district, rawParty: entry.party, seats: entry.seats, candidates: [...entry.candidates.values()] }));
}

export const NEW_YORK_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NY",
  authority: "New York State Board of Elections, Elections Database",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ny-2026-primary-contests-csv": 80 },
  parse: (bytes) => parse(bytes),
};
