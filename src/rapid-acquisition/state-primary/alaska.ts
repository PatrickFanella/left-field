import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Alaska Division of Elections, official results of the August 18, 2026
 * primary: "Results Per Precinct" (GA_ENR_Precinct_State_of_Alaska.csv), one
 * row per candidate per precinct or counting group, summed per candidate. The
 * results page gives the status as Official, and the totals match the official
 * Election Summary Report.
 *
 * Alaska's top-four primary puts every candidate on one ballot; the leading
 * four advance, so contests carry no party. Names are printed "Last, First";
 * governor tickets as "Governor/Lieutenant". The file has no write-in rows and
 * marks no one as advancing. Senate districts are letters, as in the roster.
 *
 * The publisher's TLS certificate is served without its intermediate
 * (GlobalSign GCC R46 OV TLS CA 2025), so Node refuses the connection; the file
 * was retained with that intermediate supplied through NODE_EXTRA_CA_CERTS.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ak-2026-primary-results-per-precinct-csv", url: "https://www.elections.alaska.gov/enr/26PRIM/results/GA_ENR_Precinct_State_of_Alaska.csv", path: "data/source/rapid/state-primary/ak/2026-primary-results-per-precinct.csv", cycleYear: 2026, electionDate: "2026-08-18", note: "Official results per precinct: U.S. Senate, U.S. House, governor, 40 House and 10 Senate contests. Retrieval needs the GlobalSign GCC R46 OV TLS CA 2025 intermediate (NODE_EXTRA_CA_CERTS)." },
];

const fail = (code: string): never => { throw new Error(`ALASKA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value.trim()) ? Number(value.trim()) : fail(`INTEGER_INVALID:${value}`);
/** "Sullivan, Dan S." becomes "Dan S. Sullivan" and "Sullivan, Daniel J. Jr." "Daniel J. Sullivan Jr."; a ticket "Begich/Hnilicka" is kept. */
const displayName = (value: string): string => {
  const [last, first] = value.split(",").map((part) => part.trim());
  if (!first) return value.trim();
  const suffix = first.match(/^(.*?)\s+(Jr\.?|Sr\.?|II|III|IV)$/);
  return suffix ? `${suffix[1]} ${last} ${suffix[2]}` : `${first} ${last}`;
};

const officeOf = (title: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (title === "U.S. Senator") return { office: "us_senate", district: null };
  if (title === "U.S. Representative") return { office: "us_house", district: "AL" };
  if (title === "Governor / Lieutenant Governor") return { office: "governor", district: null };
  const match = title.match(/^(House|Senate) District ([0-9]+|[A-T])$/);
  return match ? { office: match[1] === "House" ? "state_lower" : "state_upper", district: match[2]! } : null;
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  const table = parseCsv(bytes.toString("utf8").replace(/^﻿/, ""));
  const header = table[0] ?? fail("EMPTY");
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const titleCol = column("Contest_title"), idCol = column("candidate_id"), nameCol = column("candidate_name"), typeCol = column("Candidate_Type"), votesCol = column("total_votes");
  const contests = new Map<string, { base: Pick<RawPrimaryContest, "office" | "district">; candidates: Map<string, { name: string; votes: number }> }>();
  for (const row of table.slice(1)) {
    if (row.length === 1 && row[0] === "") continue;
    const title = (row[titleCol] ?? fail("ROW_SHORT")).trim();
    const base = officeOf(title);
    if (!base) continue;
    if (row[typeCol] !== "C") fail(`CANDIDATE_TYPE:${title}:${row[typeCol]}`);
    const entry = contests.get(title) ?? { base, candidates: new Map() };
    const id = row[idCol]!, name = displayName(row[nameCol]!);
    const candidate = entry.candidates.get(id) ?? { name, votes: 0 };
    if (candidate.name !== name) fail(`CANDIDATE_INCONSISTENT:${title}:${id}`);
    candidate.votes += integer(row[votesCol]!);
    entry.candidates.set(id, candidate);
    contests.set(title, entry);
  }
  return [...contests.values()].map(({ base, candidates }) => ({ ...base, rawParty: null, candidates: [...candidates.values()] }));
}

export const ALASKA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AK",
  authority: "Alaska Division of Elections, official primary results",
  system: "top_four",
  sources: SOURCES,
  expectedContests: { "ak-2026-primary-results-per-precinct-csv": 53 },
  parse: (bytes) => parse(bytes),
};
