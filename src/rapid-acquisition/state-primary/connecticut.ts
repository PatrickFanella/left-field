import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Connecticut Secretary of the State, Election History database export
 * (electionhistory.ct.gov, the same Civera ElectionStats database as the
 * general-election adapter), filtered to 2026 and the offices Governor (4),
 * Representative in Congress (330), State Senator (48) and State
 * Representative (49).
 *
 * Connecticut nominates by party convention and holds a primary only when a
 * challenger qualifies, so the export holds only the contested primaries:
 * the August 11, 2026 primary (event 599) and a September 1, 2026 Democratic
 * primary for the 58th House district (event 600). Each contest carries its
 * own date. Rows repeat every result at "City/Town" and "Polling Place"
 * level, per vote channel; only City/Town rows are summed, as in the
 * general-election adapter. "Total Votes Cast" and "Total Ballots Cast" are
 * dropped. The export's `is_winner` is set per town, not per contest, so it
 * is not read as a nominee mark. The January 2026 special elections in the
 * same export are generals and are skipped.
 *
 * Unopposed nominations are not covered: the Secretary of the State
 * publishes no certified nominee list, only the scanned and signed
 * certificates of party endorsement, many of them paper forms whose party
 * box does not survive text extraction.
 */
const SEARCH = { global: { years: { from: 2026, to: 2026 } }, ballotQuestions: { text: "", types: [], number: "", divisions: [] }, contests: { candidates: [], divisions: [], offices: [{ id: 4 }, { id: 330 }, { id: 48 }, { id: 49 }] }, specialElectionsOnly: false, voterStats: false, stages: [] };
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ct-2026-primary-contests-csv", url: `https://electionhistory.ct.gov/api/download_search.csv?search=${encodeURIComponent(JSON.stringify(SEARCH))}`, path: "data/source/rapid/state-primary/ct/2026-primary-contests.csv", cycleYear: 2026, electionDate: "2026-08-11", note: "Governor, U.S. House, State Senate and State Representative contests for 2026: the August 11 primary and the September 1 House 58 Democratic primary; contested primaries only." },
];

const OFFICES: Readonly<Record<string, PrimaryOffice>> = { "Governor": "governor", "Representative in Congress": "us_house", "State Senator": "state_upper", "State Representative": "state_lower" };
const ACCOUNTING_ROWS = new Set(["Total Votes Cast", "Total Ballots Cast"]);
const fail = (code: string): never => { throw new Error(`CONNECTICUT_PRIMARY_${code}`); };
const integer = (value: string): number => value === "" ? 0 : /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

function parse(bytes: Buffer): RawPrimaryContest[] {
  const table = parseCsv(bytes.toString("utf8").replace(/^﻿/, ""));
  const header = table[0] ?? fail("EMPTY");
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const contestCol = column("contest_id"), dateCol = column("election_date"), typeCol = column("election_type"), partyCol = column("primary_party"), officeCol = column("office_name"), districtCol = column("district_name"), candidateIdCol = column("candidate_id"), nameCol = column("candidate_name"), divisionCol = column("division_type"), lineCol = column("candidate_party_name"), votesCol = column("votes"), seatsCol = column("number_seats");
  const contests = new Map<string, { office: PrimaryOffice; district: string | null; party: string; date: string; seats: number; candidates: Map<string, { name: string; votes: number; writeIn: boolean }> }>();
  for (const row of table.slice(1)) {
    if (row[typeCol] === "Special") continue;
    if (row[typeCol] !== "Primary") fail(`ELECTION_TYPE:${row[typeCol]}`);
    if (row[divisionCol] !== "City/Town") continue;
    const name = row[nameCol]!;
    if (ACCOUNTING_ROWS.has(name)) continue;
    const office = OFFICES[row[officeCol]!] ?? fail(`OFFICE_UNKNOWN:${row[officeCol]}`);
    const party = row[partyCol]!;
    if (party === "") fail(`PARTY_MISSING:${row[contestCol]}`);
    const key = row[contestCol]!;
    const entry = contests.get(key) ?? { office, district: office === "governor" ? null : row[districtCol]!, party, date: row[dateCol]!.slice(0, 10), seats: integer(row[seatsCol]!), candidates: new Map() };
    if (entry.office !== office || entry.party !== party) fail(`CONTEST_INCONSISTENT:${key}`);
    const candidate = entry.candidates.get(row[candidateIdCol]!) ?? { name, votes: 0, writeIn: row[lineCol] === "Write In" };
    candidate.votes += integer(row[votesCol]!);
    entry.candidates.set(row[candidateIdCol]!, candidate);
    contests.set(key, entry);
  }
  return [...contests.values()].map((entry) => ({ office: entry.office, district: entry.district, rawParty: entry.party, seats: entry.seats, electionDate: entry.date, candidates: [...entry.candidates.values()] }));
}

export const CONNECTICUT_PRIMARY: StatePrimaryAdapter = {
  stateCode: "CT",
  authority: "Connecticut Secretary of the State, Election History database",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ct-2026-primary-contests-csv": 16 },
  parse: (bytes) => parse(bytes),
};
