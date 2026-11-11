import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Vermont Secretary of State, election archive (electionarchive.vermont.gov,
 * a Civera ElectionStats app), queried through the same public GraphQL
 * endpoint as the general-election adapter for every 2026 contest for
 * Governor (office 3), U.S. House (5), State Representative (8) and State
 * Senate (9). One page of 400 holds every result, so it is one source; the
 * parser fails if the archive reports more than one page.
 *
 * The August 11, 2026 primary is one contest per office, district and party
 * (Democratic, Republican, Progressive), with the source's own `isWinner`
 * mark. Many contests had no filed candidate and list only the "Write-Ins"
 * total; those are skipped. A candidate written in by name (the archive sets
 * `isWriteIn`) is kept as an ordinary named line, since a holder nominated by
 * write-in was on that primary; only the "Write-Ins" total is a write-in
 * line. "Total Votes Cast", "Total Ballots Cast", "Undervotes" and
 * "Overvotes" are dropped. Multi-member districts carry nSeats. A November
 * general loaded into the same year is skipped by event type.
 */
const QUERY = "query SearchContests($pagination: Pagination!, $filters: SearchFilters!) { search(pagination: $pagination, filters: $filters) { meta { currentPage totalPages totalResults } results { id nSeats isSpecial office { name } division { displayName } primaryParty { name } event { startDate type { name } } candidates { candidate { displayName pseudocandidate } nVotes isWinner isWriteIn party { name } } } } }";
const BODY = JSON.stringify({ query: QUERY, variables: { pagination: { page: 1, size: 400 }, filters: { global: { years: { from: 2026, to: 2026 } }, contests: { offices: [{ id: 3 }, { id: 5 }, { id: 8 }, { id: 9 }], candidates: [], divisions: [] }, stages: [], ballotQuestions: { text: "", types: [], number: "", divisions: [] }, specialElectionsOnly: false, voterStats: false } } });

const SOURCES: readonly StateGeneralSource[] = [
  { id: "vt-2026-primary-search-json", url: "https://electionarchive.vermont.gov/api/graphql_pr", postBody: BODY, postContentType: "application/json", path: "data/source/rapid/state-primary/vt/2026-primary-search.json", cycleYear: 2026, electionDate: "2026-08-11", note: "Governor, U.S. House, State Senate and State Representative contests for 2026, every party, with the archive's winner marks; one page." },
];

type Contest = { id: string; nSeats: number; isSpecial: boolean; office: { name: string }; division: { displayName: string }; primaryParty: { name: string } | null; event: { startDate: string; type: { name: string } }; candidates: { candidate: { displayName: string; pseudocandidate: string | null }; nVotes: number; isWinner: boolean; isWriteIn: boolean }[] };
const OFFICES: Readonly<Record<string, PrimaryOffice>> = { "Governor": "governor", "U.S. House": "us_house", "State Senate": "state_upper", "State Representative": "state_lower" };
const fail = (code: string): never => { throw new Error(`VERMONT_PRIMARY_${code}`); };

function parse(bytes: Buffer): RawPrimaryContest[] {
  const document = JSON.parse(bytes.toString("utf8")) as { data?: { search: { meta: { totalPages: number }; results: Contest[] } }; errors?: unknown };
  if (!document.data || document.errors) fail("RESPONSE_INVALID");
  if (document.data!.search.meta.totalPages !== 1) fail(`PAGES:${document.data!.search.meta.totalPages}`);
  return document.data!.search.results.flatMap((contest): RawPrimaryContest[] => {
    if (contest.event.type.name !== "Primary Election") return [];
    const office = OFFICES[contest.office.name] ?? fail(`OFFICE_UNKNOWN:${contest.office.name}`);
    const party = contest.primaryParty?.name ?? fail(`PARTY_MISSING:${contest.id}`);
    const candidates = contest.candidates.flatMap((entry): { name: string; votes: number; winner?: boolean; writeIn?: boolean }[] => {
      const pseudo = entry.candidate.pseudocandidate;
      if (pseudo === "ALL_OTHER_CANDIDATES") return [{ name: entry.candidate.displayName.trim(), votes: entry.nVotes, writeIn: true }];
      if (pseudo !== null) return [];
      return [{ name: entry.candidate.displayName.trim(), votes: entry.nVotes, ...(entry.isWinner ? { winner: true } : {}) }];
    });
    if (!candidates.some((candidate) => !candidate.writeIn)) return [];
    const division = contest.division.displayName;
    const district = office === "us_house" ? "AL" : office === "governor" ? null : division.replace(/^State (House|Senate) District /, "").trim();
    if (district !== null && district === division) fail(`DIVISION:${division}`);
    return [{ office, district, rawParty: party, seats: contest.nSeats, electionDate: contest.event.startDate.slice(0, 10), ...(contest.isSpecial ? { special: true } : {}), candidates }];
  });
}

export const VERMONT_PRIMARY: StatePrimaryAdapter = {
  stateCode: "VT",
  authority: "Vermont Secretary of State, election archive (GraphQL search)",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "vt-2026-primary-search-json": 207 },
  parse: (bytes) => parse(bytes),
};
