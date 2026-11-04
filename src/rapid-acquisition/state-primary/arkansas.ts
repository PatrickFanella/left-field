import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Arkansas Secretary of State, 2026 primary returns from the state's election night reporting site
 * (arkansas.tally-enr.com, the Secretary of State's listed source for 2012-2026 results; its own downloads are
 * suspended during a vendor change). Each election is read from two JSON responses of the site's results API:
 * the contest list (contest names, voteFor, candidate names) and the contest results (statewide and county
 * totals per candidate). County totals are summed and must equal the statewide total. Every election here is
 * flagged official by the publisher.
 *
 * Contest names carry the party ("REP State Senate District 10", "DEM State Representative Dist. 35"). Arkansas
 * prints no primary for a party with a single filer, and the Secretary of State's candidate search
 * (candidates.arkansas.gov) returns no records now, so unopposed nominations are not covered.
 *
 * Special primaries: the June 2 House 44 special primary held two contests, "VIO" (vacancy in office, the
 * unexpired term; runoff June 30) and "VIN" (vacancy in nomination, the party's nominee for the 2027 term); the
 * August 18 State Senate 1 special primary. VIO and State Senate 1 are special; VIN is the seat's 2026
 * nomination and is not. The January 6 special primary (State Senate 26 and House 70 unexpired terms) is left
 * out: the publisher does not flag it official and its results API returns no contests; its February 3 Senate 26
 * runoff is left out with it.
 */
const API = "https://enr-results-api.totalresults.com";
type Election = { slug: string; electionId: string; date: string; stage: "primary" | "runoff"; special: "none" | "all" | "vio"; contests: number; note: string };
const ELECTIONS: readonly Election[] = [
  { slug: "primary", electionId: "7f77a178-af02-40ec-92db-c5cc50882c68", date: "2026-03-03", stage: "primary", special: "none", contests: 34, note: "Preferential primary, every contested party primary." },
  { slug: "primary-runoff", electionId: "b412bdef-f97a-45bc-b3ec-6761d28caf9e", date: "2026-03-31", stage: "runoff", special: "none", contests: 6, note: "Primary runoff." },
  { slug: "special-primary-hd44", electionId: "4dfe2063-3126-4eb4-ae59-1468c9d6c9cd", date: "2026-06-02", stage: "primary", special: "vio", contests: 2, note: "Special primary, House 44: vacancy in office (unexpired term) and vacancy in nomination (2027 term)." },
  { slug: "special-primary-runoff-hd44", electionId: "fefa84d5-388a-4de9-9ade-acd50e0a8b1d", date: "2026-06-30", stage: "runoff", special: "vio", contests: 1, note: "Special primary runoff, House 44 vacancy in office." },
  { slug: "special-primary-sd1", electionId: "4b025e66-db9f-4e01-a7b8-3d06d87bccda", date: "2026-08-18", stage: "primary", special: "all", contests: 1, note: "Special primary, State Senate 1." },
];

const listId = (election: Election): string => `ar-2026-${election.slug}-contest-list-json`;
const resultsId = (election: Election): string => `ar-2026-${election.slug}-contest-results-json`;
const SOURCES: readonly StateGeneralSource[] = ELECTIONS.flatMap((election): StateGeneralSource[] => {
  const common = { cycleYear: 2026, electionDate: election.date };
  return [
    { ...common, id: listId(election), url: `${API}/Contest/GetContestSearchList?cId=arkansas&electionID=${election.electionId}`, path: `data/source/rapid/state-primary/ar/2026-${election.slug}-contest-list.json`, note: `${election.note} Contest and candidate names.` },
    { ...common, id: resultsId(election), url: `${API}/Contest/GetContestResults?cId=arkansas&electionID=${election.electionId}`, path: `data/source/rapid/state-primary/ar/2026-${election.slug}-contest-results.json`, note: `${election.note} Vote totals.` },
  ];
});

const fail = (code: string): never => { throw new Error(`ARKANSAS_PRIMARY_${code}`); };
const PARTIES: Readonly<Record<string, string>> = { REP: "Republican", DEM: "Democratic", LIB: "Libertarian" };

type ListContest = { contestName: string; voteFor: number; choices: Record<string, { id: string; name: string; isWriteIn: boolean; isWinner: boolean }> };
type Choice = { choiceID: string; totalVotes: number; isWinner: boolean };
type ResultContest = { choices: Choice[]; writeInChoices?: Choice[]; locations?: Record<string, { choices: Choice[]; writeinChoices?: Choice[] }> };
type Envelope<T> = { electionID: string; isOfficial: boolean; response: T };

/** Arkansas ballots may print an office title before a name ("State Representative Tara Shephard"); it is not part of the name. */
const TITLE = /^(?:State Representative|State Senator|Senator|School Board Director) /;
const CONTEST = /^(REP|DEM|LIB) (VIO )?(U\.S\. Senate|Governor|U\.S\. Congress District (\d+)|State Senate District (\d+)|State Representative (?:Dist\.|District) (\d+))( VIN| VIO)?$/i;

function parse(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const election = ELECTIONS.find((candidate) => resultsId(candidate) === source.id);
  if (!election) return ELECTIONS.some((candidate) => listId(candidate) === source.id) ? [] : fail(`SOURCE:${source.id}`);
  const list = JSON.parse(readSource(listId(election)).toString("utf8")) as Envelope<{ contests: Record<string, ListContest> }>;
  const results = JSON.parse(bytes.toString("utf8")) as Envelope<{ contests: Record<string, ResultContest> }>;
  if (list.electionID !== election.electionId || results.electionID !== election.electionId) fail(`ELECTION:${source.id}`);
  if (!list.isOfficial || !results.isOfficial) fail(`NOT_OFFICIAL:${source.id}`);
  return Object.entries(list.response.contests).flatMap(([contestId, contest]): RawPrimaryContest[] => {
    const match = contest.contestName.replace(/\s+/g, " ").trim().match(CONTEST);
    if (!match) return [];
    const result = results.response.contests[contestId] ?? fail(`RESULTS_MISSING:${contest.contestName}`);
    const tag = (match[2] ? "VIO" : match[7]?.trim().toUpperCase()) ?? null;
    if (election.special === "vio" && tag === null) fail(`VACANCY_TAG:${contest.contestName}`);
    const special = election.special === "all" || (election.special === "vio" && tag === "VIO");
    const office = /Senate$/i.test(match[3]!) ? { office: "us_senate" as const, district: null } : /^Governor$/i.test(match[3]!) ? { office: "governor" as const, district: null }
      : match[4] ? { office: "us_house" as const, district: match[4] } : match[5] ? { office: "state_upper" as const, district: String(Number(match[5])) } : { office: "state_lower" as const, district: String(Number(match[6])) };
    const all = [...result.choices, ...(result.writeInChoices ?? [])];
    const counties = new Map<string, number>();
    for (const location of Object.values(result.locations ?? {})) for (const choice of [...location.choices, ...(location.writeinChoices ?? [])]) counties.set(choice.choiceID, (counties.get(choice.choiceID) ?? 0) + choice.totalVotes);
    const candidates = all.map((choice) => {
      const named = contest.choices[choice.choiceID] ?? fail(`CHOICE:${contest.contestName}:${choice.choiceID}`);
      if (!Number.isSafeInteger(choice.totalVotes) || choice.totalVotes < 0) fail(`VOTES:${contest.contestName}:${named.name}`);
      if (counties.size > 0 && counties.get(choice.choiceID) !== choice.totalVotes) fail(`COUNTY_RECONCILIATION:${contest.contestName}:${named.name}`);
      return { name: named.name.replace(TITLE, ""), votes: choice.totalVotes, ...(choice.isWinner ? { winner: true } : {}), ...(named.isWriteIn ? { writeIn: true } : {}) };
    });
    if (candidates.length !== Object.keys(contest.choices).length) fail(`CHOICE_COUNT:${contest.contestName}`);
    return [{ ...office, rawParty: PARTIES[match[1]!.toUpperCase()]!, ...(election.stage === "runoff" ? { stage: "runoff" as const } : {}), ...(special ? { special: true } : {}), ...(contest.voteFor > 1 ? { seats: contest.voteFor } : {}), candidates }];
  });
}

export const ARKANSAS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AR",
  authority: "Arkansas Secretary of State, 2026 primary results (election night reporting site)",
  system: "partisan",
  sources: SOURCES,
  // The contest list is read only as the results' companion and yields no contests of its own.
  expectedContests: Object.fromEntries(ELECTIONS.flatMap((election) => [[listId(election), 0], [resultsId(election), election.contests]])),
  parse,
};
