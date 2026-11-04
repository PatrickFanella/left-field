import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Minnesota Secretary of State, results files of the August 11, 2026 state
 * primary (electionresultsfiles.sos.mn.gov/20260811), re-issued on August 20
 * after the State Canvassing Board certified the primary on August 18.
 * Latin-1 text, one semicolon-delimited row per candidate: state; county;
 * precinct; office id; office name; district; candidate order; name; suffix;
 * incumbent; party (R, DFL); precincts reporting; precincts; votes; percent;
 * the party's total votes for the office, checked against the candidate sum.
 * The files carry no write-in lines and mark no nominee.
 *
 * Only the Republican and DFL parties hold primaries. Minnesota omits an
 * office from the primary ballot when no party has a contest for it; where
 * one party has a contest, every party's lone candidate is printed too. The
 * unprinted nominations are read from the Secretary of State's candidate
 * file for the November 3, 2026 general election (20261103/cand.txt: id;
 * name; office id; office name; county; party id; party), which names each
 * party's certified nominee: for each office and district the primary files
 * do not print, one contest per party with the nominee and no count.
 *
 * Party labels are the expansions in the Secretary of State's party table
 * (PartyTbl.txt): "R" is Republican, "DFL" Democratic-Farmer-Labor.
 * Governor rows name the joint ticket ("A and B"); the contest keeps the
 * candidate for governor, the name before " and ".
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "mn-2026-primary-us-senate-txt", url: "https://electionresultsfiles.sos.mn.gov/20260811/ussenate.txt", path: "data/source/rapid/state-primary/mn/2026-primary-us-senate.txt", cycleYear: 2026, electionDate: "2026-08-11", note: "U.S. Senator, Republican and DFL; file re-issued 2026-08-20 after the State Canvassing Board certified the primary." },
  { id: "mn-2026-primary-us-house-txt", url: "https://electionresultsfiles.sos.mn.gov/20260811/ushouse.txt", path: "data/source/rapid/state-primary/mn/2026-primary-us-house.txt", cycleYear: 2026, electionDate: "2026-08-11", note: "U.S. Representative, eight districts; certified canvass." },
  { id: "mn-2026-primary-governor-txt", url: "https://electionresultsfiles.sos.mn.gov/20260811/Governor.txt", path: "data/source/rapid/state-primary/mn/2026-primary-governor.txt", cycleYear: 2026, electionDate: "2026-08-11", note: "Governor and Lieutenant Governor; certified canvass." },
  { id: "mn-2026-primary-state-senate-txt", url: "https://electionresultsfiles.sos.mn.gov/20260811/stsenate.txt", path: "data/source/rapid/state-primary/mn/2026-primary-state-senate.txt", cycleYear: 2026, electionDate: "2026-08-11", note: "State Senator, only the districts printed on the primary ballot; certified canvass." },
  { id: "mn-2026-primary-state-house-txt", url: "https://electionresultsfiles.sos.mn.gov/20260811/LegislativeByDistrict.txt", path: "data/source/rapid/state-primary/mn/2026-primary-state-house.txt", cycleYear: 2026, electionDate: "2026-08-11", note: "State Representative, only the districts printed on the primary ballot; certified canvass." },
  { id: "mn-2026-general-candidates-txt", url: "https://electionresultsfiles.sos.mn.gov/20261103/cand.txt", path: "data/source/rapid/state-primary/mn/2026-general-candidates.txt", cycleYear: 2026, electionDate: "2026-08-11", note: "Candidate file of the 2026-11-03 general election; read only for Republican and DFL nominees whose office the primary did not print (unopposed)." },
];
const RESULT_IDS = SOURCES.slice(0, 5).map((source) => source.id);
const CANDIDATES_ID = "mn-2026-general-candidates-txt";
const PARTIES: Readonly<Record<string, string>> = { R: "Republican", DFL: "Democratic-Farmer-Labor" };

const fail = (code: string): never => { throw new Error(`MINNESOTA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value.trim()) ? Number(value.trim()) : fail(`INTEGER_INVALID:${value}`);
const lines = (bytes: Buffer): string[] => bytes.toString("latin1").split(/\r?\n/).filter((line) => line.trim() !== "");

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "U.S. Senator") return { office: "us_senate", district: null };
  if (raw === "Governor & Lt Governor") return { office: "governor", district: null };
  const match = raw.match(/^(U\.S\. Representative|State Senator|State Representative) District (\d+[AB]?)$/);
  if (!match) return null;
  const office: PrimaryOffice = match[1] === "U.S. Representative" ? "us_house" : match[1] === "State Senator" ? "state_upper" : "state_lower";
  return { office, district: match[2]!.replace(/^0+/, "") };
};
const ticketName = (office: PrimaryOffice, name: string): string => office === "governor" ? (name.split(" and ")[0] ?? name).trim() : name.trim();
const keyOf = (office: Pick<RawPrimaryContest, "office" | "district">, rawParty: string): string => `${office.office}|${office.district ?? ""}|${rawParty}`;

function parseResults(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  type Entry = { base: Pick<RawPrimaryContest, "office" | "district">; rawParty: string; total: number; candidates: { name: string; votes: number }[] };
  const contests = new Map<string, Entry>();
  for (const line of lines(bytes)) {
    const fields = line.split(";");
    if (fields.length !== 16 || fields[0] !== "MN") fail(`ROW_SHAPE:${source.id}:${line}`);
    const [, , , , officeName, , , name, suffix, , party, , , votes, , total] = fields as [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];
    const base = officeOf(officeName) ?? fail(`OFFICE_UNKNOWN:${officeName}`);
    const rawParty = PARTIES[party] ?? fail(`PARTY_UNKNOWN:${officeName}:${party}`);
    const key = keyOf(base, rawParty);
    const entry = contests.get(key) ?? { base, rawParty, total: integer(total), candidates: [] };
    if (entry.total !== integer(total)) fail(`TOTAL_INCONSISTENT:${key}`);
    entry.candidates.push({ name: ticketName(base.office, [name, suffix].filter((part) => part.trim() !== "").join(" ")), votes: integer(votes) });
    contests.set(key, entry);
  }
  return [...contests.values()].map(({ base, rawParty, total, candidates }) => {
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== total) fail(`TOTAL_MISMATCH:${keyOf(base, rawParty)}`);
    return { ...base, rawParty, candidates };
  });
}

/** Republican and DFL nominees on the general ballot whose office and party the primary files do not print. */
function parseUnopposed(bytes: Buffer, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  // An office printed on the primary ballot shows every party's filer, so a nominee there without a printed
  // contest of their party was not nominated by an unopposed primary and is not read.
  const printed = new Set(RESULT_IDS.flatMap((id) => parseResults(readSource(id), SOURCES.find((source) => source.id === id)!).map((contest) => keyOf(contest, ""))));
  const nominees = new Map<string, { base: Pick<RawPrimaryContest, "office" | "district">; rawParty: string; names: string[] }>();
  for (const line of lines(bytes)) {
    const fields = line.split(";");
    if (fields.length !== 7) fail(`CANDIDATE_ROW_SHAPE:${line}`);
    const [, name, , officeName, , , party] = fields as [string, string, string, string, string, string, string];
    const base = officeOf(officeName.trim());
    const rawParty = PARTIES[party.trim()];
    if (!base || !rawParty) continue;
    if (printed.has(keyOf(base, ""))) continue;
    const key = keyOf(base, rawParty);
    const entry = nominees.get(key) ?? { base, rawParty, names: [] };
    entry.names.push(ticketName(base.office, name));
    nominees.set(key, entry);
  }
  return [...nominees.values()].map(({ base, rawParty, names }) => {
    if (names.length !== 1) fail(`NOMINEES_NOT_ONE:${keyOf(base, rawParty)}:${names.length}`);
    return { ...base, rawParty, candidates: [{ name: names[0]!, votes: null, winner: true }] };
  });
}

export const MINNESOTA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MN",
  authority: "Minnesota Secretary of State, state primary results files",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "mn-2026-primary-us-senate-txt": 2, "mn-2026-primary-us-house-txt": 16, "mn-2026-primary-governor-txt": 2, "mn-2026-primary-state-senate-txt": 29, "mn-2026-primary-state-house-txt": 32, [CANDIDATES_ID]: 320 },
  parse: (bytes, source, readSource) => source.id === CANDIDATES_ID ? parseUnopposed(bytes, readSource) : parseResults(bytes, source),
};
