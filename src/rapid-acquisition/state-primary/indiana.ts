import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Indiana Election Division, election night reporting archive of the May 5,
 * 2026 primary: one JSON file per office category (1005 U.S. House, 1018 State
 * Senate, 1040 State House; the archive's stale 1039 file holds the 2024
 * general). The archive's settings.json reads `Certified: "T"`.
 * Each race lists every party's candidates together with statewide totals and
 * an `isWinner` flag per party; a race with one candidate gives `Candidate` as
 * an object instead of an array. Indiana elects no governor or U.S. senator in
 * 2026.
 */
const BASE = "https://enr.indianavoters.in.gov/archive/2026Primary/data";
const SOURCES: readonly StateGeneralSource[] = [
  { id: "in-2026-primary-us-house-json", url: `${BASE}/OffCatC_1005_A.json`, path: "data/source/rapid/state-primary/in/2026-primary-us-house.json", cycleYear: 2026, electionDate: "2026-05-05", note: "Certified ENR archive, U.S. House, all parties, nine districts." },
  { id: "in-2026-primary-state-senate-json", url: `${BASE}/OffCatC_1018_A.json`, path: "data/source/rapid/state-primary/in/2026-primary-state-senate.json", cycleYear: 2026, electionDate: "2026-05-05", note: "Certified ENR archive, State Senate, all parties, the 25 districts up in 2026." },
  { id: "in-2026-primary-state-house-json", url: `${BASE}/OffCatC_1040_A.json`, path: "data/source/rapid/state-primary/in/2026-primary-state-house.json", cycleYear: 2026, electionDate: "2026-05-05", note: "Certified ENR archive, State House, all parties, 100 districts." },
];

const fail = (code: string): never => { throw new Error(`INDIANA_PRIMARY_${code}`); };

interface Candidate { readonly NAME_ON_BALLOT: string; readonly PARTY: string; readonly TOTAL: number; readonly isWinner: string }
interface Race { readonly OFFICE_TITLE: string; readonly NumofSeats: string; readonly Candidates: { readonly Candidate: Candidate | readonly Candidate[] } }

const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth"];

const officeOf = (title: string): Pick<RawPrimaryContest, "office" | "district"> => {
  const house = title.match(/^United States Representative, (\w+) District$/);
  if (house) { const index = ORDINAL.indexOf(house[1]!); return index >= 0 ? { office: "us_house", district: String(index + 1) } : fail(`HOUSE_DISTRICT:${title}`); }
  const leg = title.match(/^State (Senator|Representative), District (\d+)$/) ?? fail(`OFFICE:${title}`);
  return { office: leg[1] === "Senator" ? "state_upper" : "state_lower", district: String(Number(leg[2])) };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  const races = (JSON.parse(bytes.toString("utf8")) as { Root: { StatewideSummary: { Race: readonly Race[] } } }).Root.StatewideSummary.Race;
  return races.flatMap((race) => {
    const base = officeOf(race.OFFICE_TITLE), seats = Number(race.NumofSeats);
    if (seats !== 1) fail(`SEATS:${race.OFFICE_TITLE}`);
    const list = Array.isArray(race.Candidates.Candidate) ? race.Candidates.Candidate as readonly Candidate[] : [race.Candidates.Candidate as Candidate];
    const parties = new Map<string, Candidate[]>();
    for (const candidate of list) {
      if (!Number.isSafeInteger(candidate.TOTAL)) fail(`VOTES:${race.OFFICE_TITLE}:${candidate.NAME_ON_BALLOT}`);
      parties.set(candidate.PARTY, [...(parties.get(candidate.PARTY) ?? []), candidate]);
    }
    return [...parties].map(([party, candidates]) => ({ ...base, rawParty: party, candidates: candidates.map((candidate) => ({ name: candidate.NAME_ON_BALLOT, votes: candidate.TOTAL, ...(candidate.isWinner === "T" ? { winner: true } : {}) })) }));
  });
}

export const INDIANA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "IN",
  authority: "Indiana Election Division, certified election night reporting archive",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "in-2026-primary-us-house-json": 18, "in-2026-primary-state-senate-json": 49, "in-2026-primary-state-house-json": 168 },
  parse: (bytes) => parse(bytes),
};
