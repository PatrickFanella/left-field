import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Colorado Secretary of State, official results of the June 30, 2026 primary:
 * one workbook row per office, party, candidate and county. Unopposed
 * candidates are printed, so every party that fielded a candidate has a
 * contest. Votes are summed over counties per candidate.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "co-2026-primary-state-results-xlsx", url: "https://www.coloradosos.gov/pubs/elections/Results/2026/2026PrimaryElectionStateResults.xlsx", path: "data/source/rapid/state-primary/co/2026-primary-state-results.xlsx", cycleYear: 2026, electionDate: "2026-06-30", note: "Every office, party and county; the state results workbook published after the canvass." },
];

const fail = (code: string): never => { throw new Error(`COLORADO_PRIMARY_${code}`); };

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "United States Senator") return { office: "us_senate", district: null };
  if (raw === "Governor") return { office: "governor", district: null };
  const match = raw.match(/^(United States Representative|State Senator|State Representative) - District (\d+)$/);
  if (!match) return null;
  return { office: match[1] === "United States Representative" ? "us_house" : match[1] === "State Senator" ? "state_upper" : "state_lower", district: match[2]! };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  const sheet = readWorkbookSheet(bytes, "2026PrimaryElectionStateResults");
  if (["Office", "Party", "Candidate Name", "County", "Total Votes"].some((label, index) => sheet.at(index + 1, 1) !== label)) fail("HEADER");
  const contests = new Map<string, { base: Pick<RawPrimaryContest, "office" | "district">; party: string; votes: Map<string, number>; totals: Map<string, number> }>();
  for (let row = 2; row <= sheet.maxRow; row++) {
    const office = officeOf(sheet.at(1, row));
    if (!office) continue;
    const party = sheet.at(2, row).replace(/ Party$/, ""), label = sheet.at(3, row), county = sheet.at(4, row), votes = sheet.at(5, row);
    if (!/^\d+$/.test(votes)) fail(`VOTES:${row}`);
    const key = `${sheet.at(1, row)}|${party}`;
    const entry = contests.get(key) ?? { base: office, party, votes: new Map<string, number>(), totals: new Map<string, number>() };
    // Each candidate's county rows are followed by a "<name> Total Votes" row with a blank county. A few county
    // rows also leave the county blank (State Senate 7), so only the label tells the two apart.
    const total = label.match(/^(.+) Total Votes$/);
    if (total) {
      if (county !== "") fail(`TOTAL_WITH_COUNTY:${row}`);
      entry.totals.set(total[1]!, Number(votes));
    } else entry.votes.set(label, (entry.votes.get(label) ?? 0) + Number(votes));
    contests.set(key, entry);
  }
  return [...contests.values()].map(({ base, party, votes, totals }) => {
    for (const [name, count] of totals) if (votes.get(name) !== count) fail(`TOTAL_MISMATCH:${base.office}:${base.district}:${party}:${name}`);
    return { ...base, rawParty: party, candidates: [...votes].map(([name, count]) => ({ name, votes: count })) };
  });
}

export const COLORADO_PRIMARY: StatePrimaryAdapter = {
  stateCode: "CO",
  authority: "Colorado Secretary of State, official primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "co-2026-primary-state-results-xlsx": 178 },
  parse: (bytes) => parse(bytes),
};
