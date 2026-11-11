import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Idaho Secretary of State, results of the May 19, 2026 primary from the
 * statewide results site (results.voteidaho.gov, election "may2026"), whose
 * election record reads `isOfficialResults: true`. The ballot-items API
 * returns every contest with its statewide totals in one JSON document. Each
 * party's primary is its own ballot item ("State Representative District 1
 * Seat A - Democratic", "United States Senator - Republican"). Unopposed
 * candidates are printed; a party with no filed candidate has no item. Each
 * district elects a Senator and two Representatives in separate seats, A and
 * B, which the roster labels "1A" and "1B". The site marks each nominee with
 * `isWinner`; two unopposed House items carry no mark and are left unmarked.
 * Write-in candidates are flagged `isWriteIn`.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "id-2026-primary-ballot-items-json",
    url: "https://results.voteidaho.gov/results/public/api/elections/id/may2026/ballot-items",
    path: "data/source/rapid/state-primary/id/2026-primary-ballot-items.json",
    cycleYear: 2026,
    electionDate: "2026-05-19",
    note: "Every contest of the May 19, 2026 primary from the Secretary of State's results API; the election is marked official.",
  },
];

type Text = { languageId: string; text: string }[];
type BallotItem = { name: Text; voteTotal: number; summaryResults: { ballotOptions: { name: Text; voteCount: number; isWriteIn: boolean; isQualifiedWriteIn: boolean; isWinner: boolean }[] } };
const fail = (code: string): never => { throw new Error(`IDAHO_PRIMARY_${code}`); };
const english = (names: Text): string => (names.find((name) => name.languageId === "en") ?? names[0] ?? fail("NAME_MISSING")).text.replace(/\s+/g, " ").trim();
const CONTEST = /^(United States Senator|Governor|United States Representative District (\d+)|State Senator District (\d+)|State Representative District (\d+) Seat ([AB])) - (Democratic|Republican|Libertarian|Constitution)$/;

function parse(bytes: Buffer): RawPrimaryContest[] {
  const document = JSON.parse(bytes.toString("utf8")) as { data: BallotItem[]; totalRecordCount: number };
  if (document.data.length !== document.totalRecordCount) fail("PAGINATION_INCOMPLETE");
  return document.data.flatMap((item): RawPrimaryContest[] => {
    const title = english(item.name);
    const match = title.match(CONTEST);
    if (!match) {
      if (/^(United States|Governor|State Senator|State Representative)\b/.test(title)) fail(`CONTEST_UNRECOGNIZED:${title}`);
      return [];
    }
    const [, office, house, senate, lower, seat, party] = match;
    const candidates = item.summaryResults.ballotOptions.map((option) => ({
      name: english(option.name), votes: option.voteCount,
      ...(option.isWinner ? { winner: true } : {}), ...(option.isWriteIn || option.isQualifiedWriteIn ? { writeIn: true } : {}),
    }));
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== item.voteTotal) fail(`TOTAL_MISMATCH:${title}`);
    const base: Pick<RawPrimaryContest, "office" | "district"> = office === "United States Senator" ? { office: "us_senate", district: null }
      : office === "Governor" ? { office: "governor", district: null }
        : house ? { office: "us_house", district: house }
          : senate ? { office: "state_upper", district: senate }
            : { office: "state_lower", district: `${lower}${seat}` };
    return [{ ...base, rawParty: party!, candidates }];
  });
}

export const IDAHO_PRIMARY: StatePrimaryAdapter = {
  stateCode: "ID",
  authority: "Idaho Secretary of State, official primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "id-2026-primary-ballot-items-json": 204 },
  parse: (bytes) => parse(bytes),
};
