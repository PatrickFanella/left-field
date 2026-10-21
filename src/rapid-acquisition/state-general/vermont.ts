import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";
import type { RosterParty } from "../state-legislative-roster";

/**
 * Vermont Secretary of State, election archive (electionarchive.vermont.gov,
 * a Civera ElectionStats app) queried through its public GraphQL endpoint
 * for State Representative (office 8) and State Senate (office 9) contests
 * in each retained year (2024 so far). Results come back in pages of 96; each page is retained as its own
 * source so the lock records exactly what was served. Pages include primaries,
 * which are skipped.
 *
 * Both chambers serve two-year terms, and many districts elect two or three
 * members (nSeats). Candidates may run on several party lines ("Democratic",
 * party2 "Progressive"); the line names are joined in rawParty and the
 * candidate is attributed to the Democratic or Republican line when one is
 * present. The "Write-Ins" pseudo-candidate counts as a write-in; "Total
 * Votes Cast", "Undervotes" and "Overvotes" are dropped. Division names
 * ("State House District Addison 1") normalize to the roster's labels
 * ("Addison-1").
 */
const ENDPOINT = "https://electionarchive.vermont.gov/api/graphql_pr";
const QUERY = "query SearchContests($pagination: Pagination!, $filters: SearchFilters!) { search(pagination: $pagination, filters: $filters) { meta { currentPage totalPages totalResults } results { id nSeats isSpecial office { name } division { displayName } event { startDate type { name } } candidates { candidate { displayName pseudocandidate } nVotes isWriteIn party { name } party2 { name } party3 { name } party4 { name } } } } }";
const body = (year: number, page: number): string => JSON.stringify({ query: QUERY, variables: { pagination: { page, size: 96 }, filters: { global: { years: { from: year, to: year } }, contests: { offices: [{ id: 8 }, { id: 9 }], candidates: [], divisions: [] }, stages: [], ballotQuestions: { text: "", types: [], number: "", divisions: [] }, specialElectionsOnly: false, voterStats: false } } });
/** Retained pages per general-election year; a new year is one entry here plus its expected contest counts. */
const YEARS: readonly Readonly<{ year: number; electionDate: string; pages: number }>[] = [{ year: 2024, electionDate: "2024-11-05", pages: 6 }];
const pageId = (year: number, page: number): string => `vt-${year}-legislative-search-page-${page}-json`;

const SOURCES: readonly StateGeneralSource[] = YEARS.flatMap(({ year, electionDate, pages }) => Array.from({ length: pages }, (_value, index) => ({
  id: pageId(year, index + 1),
  url: ENDPOINT,
  postBody: body(year, index + 1),
  postContentType: "application/json",
  path: `data/source/rapid/state-general/vt/${year}-legislative-search-page-${index + 1}.json`,
  cycleYear: year,
  electionDate,
  note: `Page ${index + 1} of ${pages} of the ${year} State Representative and State Senate search, primaries included.`,
})));

type Party = { name: string } | null;
type Contest = { id: string; nSeats: number; isSpecial: boolean; office: { name: string }; division: { displayName: string }; event: { startDate: string; type: { name: string } }; candidates: { candidate: { displayName: string; pseudocandidate: string | null }; nVotes: number; isWriteIn: boolean; party: Party; party2: Party; party3: Party; party4: Party }[] };
const fail = (code: string): never => { throw new Error(`VERMONT_GENERAL_${code}`); };

function parse(bytes: Buffer, source: StateGeneralSource): RawGeneralContest[] {
  const document = JSON.parse(bytes.toString("utf8")) as { data?: { search: { meta: { currentPage: number; totalPages: number }; results: Contest[] } }; errors?: unknown };
  if (!document.data || document.errors) fail(`RESPONSE_INVALID:${source.id}`);
  const search = document.data!.search;
  const pages = YEARS.find((entry) => entry.year === source.cycleYear)?.pages ?? fail(`YEAR_UNKNOWN:${source.id}`);
  if (search.meta.totalPages !== pages || pageId(source.cycleYear, search.meta.currentPage) !== source.id) fail(`PAGE_MISMATCH:${source.id}:${search.meta.currentPage}/${search.meta.totalPages}`);
  return search.results.flatMap((contest): RawGeneralContest[] => {
    if (contest.event.type.name !== "General Election" || contest.isSpecial) return [];
    const chamber = contest.office.name === "State Senate" ? "upper" as const : contest.office.name === "State Representative" ? "lower" as const : fail(`OFFICE_UNKNOWN:${contest.office.name}`);
    const district = contest.division.displayName.replace(/^State (House|Senate) District /, "").trim();
    const candidates = contest.candidates.flatMap((entry) => {
      const pseudo = entry.candidate.pseudocandidate;
      if (pseudo === "TOTAL_VOTES" || pseudo === "PSEUDOCANDIDATE") return [];
      const writeIn = pseudo === "ALL_OTHER_CANDIDATES" || entry.isWriteIn;
      const lines = [entry.party, entry.party2, entry.party3, entry.party4].flatMap((party) => party ? [party.name] : []);
      const major = lines.filter((line) => line === "Democratic" || line === "Republican");
      const party: RosterParty | undefined = writeIn ? "Independent" : major.length > 0 ? major[0] as RosterParty : undefined;
      return [{ name: entry.candidate.displayName.trim(), rawParty: writeIn ? "" : lines.join("/"), ...(party ? { party } : {}), votes: entry.nVotes, writeIn }];
    });
    return [{ chamber, district, seats: contest.nSeats, electionDate: contest.event.startDate.slice(0, 10), candidates }];
  });
}

export const VERMONT_GENERAL: StateGeneralAdapter = {
  stateCode: "VT",
  authority: "Vermont Secretary of State, election archive (GraphQL search)",
  sources: SOURCES,
  // General-election contests per retained page; later pages hold only primaries.
  expectedContests: { "vt-2024-legislative-search-page-1-json": 96, "vt-2024-legislative-search-page-2-json": 29, "vt-2024-legislative-search-page-3-json": 0, "vt-2024-legislative-search-page-4-json": 0, "vt-2024-legislative-search-page-5-json": 0, "vt-2024-legislative-search-page-6-json": 0 },
  parse,
};
