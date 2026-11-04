import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * North Dakota Secretary of State, results of the June 9, 2026 primary from
 * the Secretary of State's election night reporting site
 * (resultsnd.sos.nd.gov, election 346). The site's "Full Data File" download
 * is one JSON document with every contest, its county and precinct
 * breakdowns, and `ElectionData.IsOfficial`, true in the retained file. The
 * Secretary of State's election results page lists this primary as
 * "Official results".
 *
 * Each party's primary is its own contest ("State Representative District 07
 * Republican"). Unopposed candidates are printed, so every party with a filed
 * candidate has a contest; a party with only write-in votes has no named
 * candidate and is skipped. Each odd-numbered district (and, after the 2023
 * remedial map, Districts 9 and 15) elects a Senator and two Representatives;
 * the House primary is vote for two. "Unexpired 2-Year Term" House contests
 * fill one seat in a two-member district and are kept as a separate
 * `unexpired` position. Write-in votes are one aggregate "write-in" choice
 * (named write-ins are listed apart and not counted in the contest). The
 * file marks each nominee with `IsWinner`. A choice with no votes omits
 * `TotalVotes`.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "nd-2026-primary-full-data-file-json",
    url: "https://resultsnd.sos.nd.gov/results/north-dakota/346/FullDataFile.json",
    path: "data/source/rapid/state-primary/nd/2026-primary-full-data-file.json",
    cycleYear: 2026,
    electionDate: "2026-06-09",
    note: "Every contest of the June 9, 2026 primary; the file is marked official (IsOfficial) after the state canvass.",
  },
];

type Choice = { Name: string; TotalVotes?: number; IsWinner?: boolean };
type Contest = { ContestName: string; TotalVotes?: number; Choices: Choice[] };
type FullDataFile = { ElectionData: { ElectionID: string; IsOfficial: boolean }; ContestData: Contest[] };

const fail = (code: string): never => { throw new Error(`NORTH_DAKOTA_PRIMARY_${code}`); };
const tidy = (value: string): string => value.replace(/\s+/g, " ").trim();
const CONTEST = /^(Representative in Congress|State Senator|State Representative)( Unexpired 2-Year Term)?(?: District (\d+))? (Democratic-NPL|Republican|Libertarian|Constitution|Green)$/;

function parse(bytes: Buffer): RawPrimaryContest[] {
  const file = JSON.parse(bytes.toString("utf8")) as FullDataFile;
  if (file.ElectionData.ElectionID !== "346") fail(`ELECTION:${file.ElectionData.ElectionID}`);
  if (file.ElectionData.IsOfficial !== true) fail("NOT_OFFICIAL");
  const contests: RawPrimaryContest[] = [];
  for (const contest of file.ContestData) {
    const title = tidy(contest.ContestName);
    const match = title.match(CONTEST);
    if (!match) {
      if (/^(State Senator|State Representative|Representative in Congress|United States Senator|Governor)\b/.test(title)) fail(`CONTEST_UNRECOGNIZED:${title}`);
      continue;
    }
    const [, office, unexpired, district, party] = match;
    if ((office === "Representative in Congress") !== (district === undefined)) fail(`DISTRICT:${title}`);
    const candidates = contest.Choices.map((choice) => {
      const name = tidy(choice.Name), writeIn = /^write-in$/i.test(name);
      return { name: writeIn ? "Write-in" : name, votes: choice.TotalVotes ?? 0, ...(choice.IsWinner === true ? { winner: true } : {}), ...(writeIn ? { writeIn: true } : {}) };
    });
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== (contest.TotalVotes ?? 0)) fail(`TOTAL_MISMATCH:${title}`);
    if (candidates.every((candidate) => candidate.writeIn === true)) continue;
    const house = office === "State Representative";
    contests.push({
      office: office === "Representative in Congress" ? "us_house" : house ? "state_lower" : "state_upper",
      district: district === undefined ? "AL" : String(Number(district)),
      rawParty: party!,
      ...(house ? (unexpired ? { position: "unexpired" } : { seats: 2 }) : {}),
      candidates,
    });
  }
  return contests;
}

export const NORTH_DAKOTA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "ND",
  authority: "North Dakota Secretary of State, official primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "nd-2026-primary-full-data-file-json": 88 },
  parse: (bytes) => parse(bytes),
};
