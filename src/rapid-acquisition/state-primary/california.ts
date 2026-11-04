import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * California Secretary of State, certified Statement of Vote for the June 2,
 * 2026 primary: the candidate export for every voter-nominated office, one row
 * per candidate per county. It covers governor, the 52 House districts of the
 * Proposition 50 map, the 80 Assembly districts and the 20 even-numbered Senate
 * districts. No U.S. Senate seat was on the 2026 ballot.
 *
 * Voter-nominated offices use the top-two primary: one ballot for every party,
 * so contests carry no party. Votes are summed over counties per candidate id.
 * The export flags qualified write-in candidates ("Write-in Flag" Y); it marks
 * no one as advancing, so no winner is set.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ca-2026-primary-sov-voter-nominated-xlsx", url: "https://elections.cdn.sos.ca.gov/sov/2026-primary/sov/csv-voter-nominated.xlsx", path: "data/source/rapid/state-primary/ca/2026-primary-sov-voter-nominated.xlsx", cycleYear: 2026, electionDate: "2026-06-02", note: "Certified Statement of Vote, candidate export for every voter-nominated office: governor, 52 House, 80 Assembly and 20 Senate contests." },
];

const fail = (code: string): never => { throw new Error(`CALIFORNIA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

const officeOf = (contest: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (contest === "Governor") return { office: "governor", district: null };
  const match = contest.match(/^(United States Representative|State Senate|State Assembly Member) District (\d+)$/);
  if (!match) return null;
  return { office: match[1] === "United States Representative" ? "us_house" : match[1] === "State Senate" ? "state_upper" : "state_lower", district: match[2]! };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  const sheet = readWorkbookSheet(bytes, "SOV Candidates Export");
  const header = Array.from({ length: sheet.maxColumn }, (_value, index) => sheet.at(index + 1, 1));
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index + 1 : fail(`COLUMN_MISSING:${name}`); };
  const contestCol = column("Contest Name"), idCol = column("Candidate ID"), nameCol = column("Candidate Name"), writeInCol = column("Write-in Flag"), votesCol = column("Vote Total"), dateCol = column("Election Date");
  const contests = new Map<string, { base: Pick<RawPrimaryContest, "office" | "district">; candidates: Map<string, { name: string; votes: number; writeIn: boolean }> }>();
  for (let row = 2; row <= sheet.maxRow; row++) {
    const contest = sheet.at(contestCol, row);
    if (contest === "") continue;
    if (sheet.at(dateCol, row) !== "06/02/2026") fail(`ELECTION_DATE:${row}`);
    const base = officeOf(contest);
    if (!base) continue;
    const entry = contests.get(contest) ?? { base, candidates: new Map() };
    const id = sheet.at(idCol, row), name = sheet.at(nameCol, row), writeIn = sheet.at(writeInCol, row) === "Y";
    const candidate = entry.candidates.get(id) ?? { name, votes: 0, writeIn };
    if (candidate.name !== name || candidate.writeIn !== writeIn) fail(`CANDIDATE_INCONSISTENT:${contest}:${id}`);
    candidate.votes += integer(sheet.at(votesCol, row));
    entry.candidates.set(id, candidate);
    contests.set(contest, entry);
  }
  return [...contests.values()].map(({ base, candidates }) => ({ ...base, rawParty: null, candidates: [...candidates.values()] }));
}

export const CALIFORNIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "CA",
  authority: "California Secretary of State, certified Statement of Vote",
  system: "top_two",
  sources: SOURCES,
  expectedContests: { "ca-2026-primary-sov-voter-nominated-xlsx": 153 },
  parse: (bytes) => parse(bytes),
};
