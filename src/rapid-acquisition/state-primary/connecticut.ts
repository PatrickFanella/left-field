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
 * Unopposed nominations are read from the Secretary of the State's own
 * ballot listing for the November 3, 2026 state election, in the State
 * Election Management System's public reporting site
 * (ctemspublic.tgstg.net, election 108): its lookup file names every
 * candidate line on the ballot with its party, and its statewide vote file
 * assigns each line to an office. The Secretary of the State publishes no
 * separate certified nominee list for 2026 (its "List of Candidates" page
 * stops at 2011, and the party endorsement certificates are scanned paper
 * forms). Only the ballot listing is read; its vote counts are election
 * night returns and are not used. For each Democratic or Republican line on
 * the November ballot for governor, U.S. House, State Senate or State
 * Representative whose party held no printed primary for that office and
 * district, the candidate is reported as an unopposed nomination dated the
 * August 11 primary. The governor line names the joint ticket ("Ned Lamont
 * and Susan Bysiewicz"); the first name is the governor candidate. Minor
 * party, petitioning and write-in lines are not read.
 */
const SEARCH = { global: { years: { from: 2026, to: 2026 } }, ballotQuestions: { text: "", types: [], number: "", divisions: [] }, contests: { candidates: [], divisions: [], offices: [{ id: 4 }, { id: 330 }, { id: 48 }, { id: 49 }] }, specialElectionsOnly: false, voterStats: false, stages: [] };
const PRIMARY = "ct-2026-primary-contests-csv";
const BALLOT = "ct-2026-general-ballot-candidates-json";
const BALLOT_OFFICES = "ct-2026-general-ballot-offices-json";
const ENR = "https://ctemspublic.tgstg.net/ng-app/data/election/108/52260";
const SOURCES: readonly StateGeneralSource[] = [
  { id: PRIMARY, url: `https://electionhistory.ct.gov/api/download_search.csv?search=${encodeURIComponent(JSON.stringify(SEARCH))}`, path: "data/source/rapid/state-primary/ct/2026-primary-contests.csv", cycleYear: 2026, electionDate: "2026-08-11", note: "Governor, U.S. House, State Senate and State Representative contests for 2026: the August 11 primary and the September 1 House 58 Democratic primary; contested primaries only." },
  { id: BALLOT, url: `${ENR}/Lookupdata.json`, path: "data/source/rapid/state-primary/ct/2026-general-ballot-candidates.json", cycleYear: 2026, electionDate: "2026-11-03", note: "Secretary of the State's ballot listing for the November 3, 2026 state election (SEMS public reporting, election 108, data version 52260): offices and every candidate line with its party, read for nominations with no printed primary." },
  { id: BALLOT_OFFICES, url: `${ENR}/stateVotes_Electiondata.json`, path: "data/source/rapid/state-primary/ct/2026-general-ballot-offices.json", cycleYear: 2026, electionDate: "2026-11-03", note: "Same election and version: the statewide file that assigns each candidate line to its office. Its election night vote counts (unofficial) are not read." },
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

type Lookup = { election: { ID: string; DT: string }; officeList: Record<string, { ID: string; NM: string; OT: string; D: string }>[]; partyIds: Record<string, { CD: string; NM: string }>; candidateIds: Record<string, { NM: string; P: string }> };
/** Ballot office types: SW statewide (governor by name), C congressional, S senate, A assembly (State Representative). */
const BALLOT_OFFICE_TYPES: Readonly<Record<string, PrimaryOffice>> = { C: "us_house", S: "state_upper", A: "state_lower" };
const BALLOT_PARTIES: Readonly<Record<string, string>> = { D: "Democratic", R: "Republican" };
const contestKey = (office: PrimaryOffice, district: string | null, party: string): string => `${office}|${district === null ? "" : String(Number(district))}|${party}`;

function parseBallot(bytes: Buffer, offices: Buffer, primaries: readonly RawPrimaryContest[]): RawPrimaryContest[] {
  const lookup = JSON.parse(bytes.toString("utf8")) as Lookup;
  const lines = JSON.parse(offices.toString("utf8")) as Record<string, Record<string, unknown>[]>;
  if (lookup.election.ID !== "108" || lookup.election.DT !== "11/03/2026") fail(`BALLOT_ELECTION:${lookup.election.ID}`);
  const contested = new Set(primaries.map((contest) => contestKey(contest.office, contest.district, contest.rawParty!)));
  const nominees = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: null; winner: true }[] }>();
  for (const office of lookup.officeList.flatMap((entry) => Object.values(entry))) {
    const kind = office.OT === "SW" ? (office.NM === "Governor and Lieutenant Governor" ? "governor" as const : null) : BALLOT_OFFICE_TYPES[office.OT] ?? null;
    if (kind === null) continue;
    const district = kind === "governor" ? null : /^\d+$/.test(office.D) ? office.D : fail(`BALLOT_DISTRICT:${office.NM}`);
    const ids = (lines[office.ID] ?? fail(`BALLOT_OFFICE_LINES:${office.NM}`)).flatMap((line) => Object.keys(line));
    for (const id of ids) {
      const candidate = lookup.candidateIds[id] ?? fail(`BALLOT_CANDIDATE:${office.NM}:${id}`);
      const party = BALLOT_PARTIES[lookup.partyIds[candidate.P]?.CD ?? ""];
      if (party === undefined) continue;
      const key = contestKey(kind, district, party);
      if (contested.has(key)) continue;
      // The governor line is the joint ticket "Governor and Lieutenant Governor".
      const name = kind === "governor" ? candidate.NM.split(" and ")[0]! : candidate.NM;
      const entry = nominees.get(key) ?? { office: kind, district, rawParty: party, electionDate: "2026-08-11", candidates: [] };
      if (entry.candidates.length > 0) fail(`BALLOT_SECOND_NOMINEE:${key}`);
      entry.candidates.push({ name, votes: null, winner: true });
      nominees.set(key, entry);
    }
  }
  return [...nominees.values()];
}

export const CONNECTICUT_PRIMARY: StatePrimaryAdapter = {
  stateCode: "CT",
  authority: "Connecticut Secretary of the State, Election History database and November ballot listing",
  system: "partisan",
  sources: SOURCES,
  // The office file is read only as the ballot listing's companion and yields no contests of its own.
  expectedContests: { [PRIMARY]: 16, [BALLOT]: 321, [BALLOT_OFFICES]: 0 },
  parse: (bytes, source, readSource) => source.id === PRIMARY ? parse(bytes) : source.id === BALLOT ? parseBallot(bytes, readSource(BALLOT_OFFICES), parse(readSource(PRIMARY))) : source.id === BALLOT_OFFICES ? [] : fail(`SOURCE_UNKNOWN:${source.id}`),
};
