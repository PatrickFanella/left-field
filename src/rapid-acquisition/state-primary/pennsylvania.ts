import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Pennsylvania Department of State, precinct returns of the May 19, 2026
 * primary (headerless comma-delimited, one row per candidate per precinct;
 * the field order is the Department's transmittal readme, the same as the
 * general-election file). Offices: GOV governor, USC U.S. House, STS state
 * Senate, STH state House; there is no U.S. Senate contest in 2026. A
 * contest's totals are the sum over precincts per candidate number.
 *
 * Every candidate on a party's ballot is printed, unopposed or not. The file
 * carries no write-in rows and marks no winner, so a nomination won by
 * write-in (a party with nobody on its ballot) is absent.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "pa-2026-primary-precinct-returns-txt", url: "https://www.pa.gov/content/dam/copapwp-pagov/en/dos/resources/voting-and-elections/bulk-data/2026-general-primary/er/electionreturns_2026_primary_precinctreturns.txt", path: "data/source/rapid/state-primary/pa/2026-primary-precinct-returns.txt", cycleYear: 2026, electionDate: "2026-05-19", note: "Precinct returns of the May 19, 2026 primary, extracted July 21, 2026 after certification; governor, U.S. House and both chambers." },
];

const OFFICES: Readonly<Record<string, PrimaryOffice>> = { GOV: "governor", USC: "us_house", STS: "state_upper", STH: "state_lower" };
const PARTIES: Readonly<Record<string, string>> = { DEM: "Democratic", REP: "Republican" };
const F = { office: 8, district: 5, party: 9, number: 10, last: 11, first: 12, middle: 13, suffix: 14, votes: 15 } as const;
const fail = (code: string): never => { throw new Error(`PENNSYLVANIA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);
const title = (value: string): string => value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

function parse(bytes: Buffer): RawPrimaryContest[] {
  const contests = new Map<string, { office: PrimaryOffice; district: string | null; rawParty: string; candidates: Map<string, { name: string; votes: number }> }>();
  for (const row of parseCsv(bytes.toString("latin1"))) {
    if (row.length < 16) continue;
    const office = OFFICES[row[F.office]!];
    if (!office) continue;
    const rawParty = PARTIES[row[F.party]!] ?? fail(`PARTY_UNKNOWN:${row[F.party]}`);
    const district = office === "governor" ? null : String(integer(row[F.district]!));
    const key = `${office}|${district}|${rawParty}`;
    const entry = contests.get(key) ?? { office, district, rawParty, candidates: new Map<string, { name: string; votes: number }>() };
    const number = row[F.number]!;
    const name = [row[F.first], row[F.middle], row[F.last], row[F.suffix]].map((part) => title((part ?? "").trim())).filter(Boolean).join(" ");
    const candidate = entry.candidates.get(number) ?? { name, votes: 0 };
    if (candidate.name !== name) fail(`CANDIDATE_INCONSISTENT:${key}:${number}`);
    candidate.votes += integer(row[F.votes]!);
    entry.candidates.set(number, candidate);
    contests.set(key, entry);
  }
  return [...contests.values()].map(({ candidates, ...entry }) => ({ ...entry, candidates: [...candidates.values()] }));
}

export const PENNSYLVANIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "PA",
  authority: "Pennsylvania Department of State, precinct election returns",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "pa-2026-primary-precinct-returns-txt": 403 },
  parse: (bytes) => parse(bytes),
};
