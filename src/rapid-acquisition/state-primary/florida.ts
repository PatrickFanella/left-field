import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Florida Division of Elections, official results extract of the August 18,
 * 2026 primary (tab-delimited, Latin-1, one row per candidate per county),
 * fetched by the same form POST as the general-election extract with
 * OfficialResults=Y and PartyRaces=Y. RaceCode USS is the U.S. Senate, USR
 * the U.S. House, GOV governor, STS state Senate and STR state House;
 * Juris1num holds the district. Multi-county contests are summed. The 2026
 * U.S. Senate race is the special election for the rest of Marco Rubio's term,
 * so its primaries are marked special. The extract marks no winner.
 *
 * Florida puts no primary on the ballot when a party has one qualified
 * candidate. For every Democratic or Republican nomination with no primary
 * contest, the nominee is read from the Division's candidate list for the
 * 2026 election (status Qualified, or Unopposed for a candidate elected
 * without opposition) and reported as an uncounted sole nominee.
 */
const RESULTS_ID = "fl-2026-primary-results-extract-txt", LIST_ID = "fl-2026-general-candidate-list-txt";
const SOURCES: readonly StateGeneralSource[] = [
  { id: RESULTS_ID, url: "https://results.elections.myflorida.com/ResultsExtract.Asp", postBody: "ElectionDate=8/18/2026&OfficialResults=Y&PartyRaces=Y&DataMode=&FormsButton2=Download", path: "data/source/rapid/state-primary/fl/2026-primary-results-extract.txt", cycleYear: 2026, electionDate: "2026-08-18", note: "Official results extract of the August 18, 2026 primary, every party race." },
  { id: LIST_ID, url: "https://dos.elections.myflorida.com/candidates/extractCanList.asp", postBody: "elecID=20261103-GEN&office=All&status=All&cantype=STA&FormSubmit=Download+Candidate+List", path: "data/source/rapid/state-primary/fl/2026-general-candidate-list.txt", cycleYear: 2026, electionDate: "2026-08-18", note: "Division of Elections state candidate list for the 2026 election, every status, retained November 4, 2026; names the nominees who had no primary." },
];

const OFFICES: Readonly<Record<string, PrimaryOffice>> = { USS: "us_senate", USR: "us_house", GOV: "governor", STS: "state_upper", STR: "state_lower" };
const PARTIES: Readonly<Record<string, string>> = { DEM: "Democratic", REP: "Republican" };
const NOMINATED = new Set(["QUA", "UNO"]);
const fail = (code: string): never => { throw new Error(`FLORIDA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

/** Tab-delimited rows as records keyed by the header. */
const records = (bytes: Buffer): Record<string, string>[] => {
  const lines = bytes.toString("latin1").split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = (lines[0] ?? fail("EMPTY")).split("\t").map((cell) => cell.trim());
  return lines.slice(1).map((line) => { const cells = line.split("\t"); return Object.fromEntries(header.map((name, index) => [name, (cells[index] ?? "").trim()])); });
};
const column = (row: Record<string, string>, name: string): string => row[name] ?? fail(`COLUMN_MISSING:${name}`);
const contestOf = (raceCode: string, district: string, partyCode: string): Omit<RawPrimaryContest, "candidates"> | null => {
  const office = OFFICES[raceCode], rawParty = PARTIES[partyCode];
  if (!office || !rawParty) return null;
  return { office, district: office === "us_senate" || office === "governor" ? null : String(integer(district)), rawParty, ...(office === "us_senate" ? { special: true } : {}) };
};
const keyOf = (contest: Omit<RawPrimaryContest, "candidates">): string => `${contest.office}|${contest.district}|${contest.rawParty}`;

function parseResults(bytes: Buffer): RawPrimaryContest[] {
  const contests = new Map<string, Omit<RawPrimaryContest, "candidates"> & { candidates: Map<string, { name: string; votes: number }> }>();
  for (const row of records(bytes)) {
    if (column(row, "ElectionDate") !== "8/18/2026") fail(`ELECTION_DATE:${row.ElectionDate}`);
    const partyCode = column(row, "PartyCode"), raceCode = column(row, "RaceCode");
    if (OFFICES[raceCode] && !PARTIES[partyCode]) fail(`PARTY_UNKNOWN:${raceCode}:${partyCode}`);
    const contest = contestOf(raceCode, column(row, "Juris1num"), partyCode);
    if (!contest) continue;
    const entry = contests.get(keyOf(contest)) ?? { ...contest, candidates: new Map() };
    const name = [column(row, "CanNameFirst"), column(row, "CanNameMiddle"), column(row, "CanNameLast")].filter(Boolean).join(" ");
    const candidate = entry.candidates.get(name) ?? { name, votes: 0 };
    candidate.votes += integer(column(row, "CanVotes"));
    entry.candidates.set(name, candidate);
    contests.set(keyOf(contest), entry);
  }
  return [...contests.values()].map(({ candidates, ...contest }) => ({ ...contest, candidates: [...candidates.values()] }));
}

function parseCandidateList(bytes: Buffer, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const held = new Set(parseResults(readSource(RESULTS_ID)).map(keyOf));
  const nominees = new Map<string, RawPrimaryContest>();
  for (const row of records(bytes)) {
    if (column(row, "ElectionID") !== "20261103-GEN") fail(`LIST_ELECTION:${row.ElectionID}`);
    if (!NOMINATED.has(column(row, "StatusCode"))) continue;
    const contest = contestOf(column(row, "OfficeCode"), column(row, "Juris1num"), column(row, "PartyCode"));
    if (!contest || held.has(keyOf(contest))) continue;
    if (nominees.has(keyOf(contest))) fail(`LIST_TWO_NOMINEES_WITHOUT_PRIMARY:${keyOf(contest)}`);
    const name = [column(row, "NameFirst"), column(row, "NameMiddle"), column(row, "NameLast")].filter(Boolean).join(" ");
    nominees.set(keyOf(contest), { ...contest, candidates: [{ name, votes: null, winner: true }] });
  }
  return [...nominees.values()];
}

export const FLORIDA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "FL",
  authority: "Florida Division of Elections, official primary results extract and candidate list",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [RESULTS_ID]: 93, [LIST_ID]: 213 },
  parse: (bytes, source, readSource) => source.id === LIST_ID ? parseCandidateList(bytes, readSource) : parseResults(bytes),
};
