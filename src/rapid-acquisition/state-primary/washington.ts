import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Washington Secretary of State, certified results of the August 4, 2026
 * primary: the "All Results Excel" report of the state results site
 * (results.votewa.gov), whose "Summary Results" sheet has one statewide-total
 * row per candidate. The site marks the election as official results; the
 * older results.vote.wa.gov CSV exports are not published for 2026.
 *
 * Washington's top-two primary puts every candidate on one ballot, so contests
 * carry no party. Each legislative district elects a State Senator and two
 * State Representatives, Pos. 1 and Pos. 2, as separate contests; the ledger
 * matches a holder to a position by name. "Write-In" rows are write-ins; the
 * "Ballots Cast", "Over Votes" and "Under Votes" rows are not candidates. The
 * report marks no one as advancing. No U.S. Senate or governor seat was on the
 * 2026 ballot.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "wa-2026-primary-all-results-xlsx", url: "https://results.votewa.gov/cdn/results/01000000-f977-1a83-1ed4-08ddd69e9e69/All%20Results_4683b446-288e-4580-9432-178f87de4afa.xlsx", path: "data/source/rapid/state-primary/wa/2026-primary-all-results.xlsx", cycleYear: 2026, electionDate: "2026-08-04", note: "Official results (the site gives August 18, 2026 as the certification date; last published October 29), All Results Excel report: 10 House, 98 House-position and 24 Senate contests." },
];

const fail = (code: string): never => { throw new Error(`WASHINGTON_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);
const NOT_CANDIDATES = new Set(["Ballots Cast", "Over Votes", "Under Votes"]);

const officeOf = (contest: string): Pick<RawPrimaryContest, "office" | "district" | "position"> | null => {
  const house = contest.match(/^U\.S\. Representative - Congressional District (\d+)$/);
  if (house) return { office: "us_house", district: house[1]! };
  const legislative = contest.match(/^State (Senator|Representative Pos\. ([12])) - Legislative District (\d+)$/);
  if (!legislative) return null;
  return legislative[2] ? { office: "state_lower", district: legislative[3]!, position: legislative[2] } : { office: "state_upper", district: legislative[3]! };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  const sheet = readWorkbookSheet(bytes, "Summary Results");
  if (["Office Name", "Contest ID", "Ballot Name", "Choice ID", "Party", "Total"].some((label, index) => sheet.at(index + 1, 1) !== label)) fail("HEADER");
  const contests = new Map<string, { base: Pick<RawPrimaryContest, "office" | "district" | "position">; candidates: { name: string; votes: number; writeIn: boolean }[] }>();
  for (let row = 2; row <= sheet.maxRow; row++) {
    const contest = sheet.at(1, row).replace(/\s+/g, " ").trim();
    if (contest === "") continue;
    const base = officeOf(contest);
    if (!base) continue;
    const name = sheet.at(3, row);
    if (NOT_CANDIDATES.has(name)) continue;
    const entry = contests.get(contest) ?? { base, candidates: [] };
    const writeIn = /^write-?in$/i.test(name);
    entry.candidates.push({ name, votes: integer(sheet.at(6, row)), writeIn });
    contests.set(contest, entry);
  }
  return [...contests.values()].map(({ base, candidates }) => ({ ...base, rawParty: null, candidates }));
}

export const WASHINGTON_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WA",
  authority: "Washington Secretary of State, certified primary results",
  system: "top_two",
  sources: SOURCES,
  expectedContests: { "wa-2026-primary-all-results-xlsx": 132 },
  parse: (bytes) => parse(bytes),
};
