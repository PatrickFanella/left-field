import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Delaware Department of Elections, results of the September 15, 2026
 * primary as published on the state open data portal (dataset 4hbv-7brf,
 * filtered by election name; the same rows as the Department's own
 * reports/PR2026.csv, whose results page is headed "OFFICIAL RESULTS" and
 * records the completed State Representative District 33 Republican recount
 * with no change). One row per candidate with the contest total; offices read
 * "U.S. Senator", "Representative in Congress", "State Senator District 5"
 * and "State Representative District 14". The file marks no winner and has
 * no write-in rows. There is no governor's race in 2026.
 *
 * Delaware prints no primary for an unopposed candidate. For every
 * Democratic or Republican nomination with no primary contest, the nominee is
 * read from the Department's "Filed Candidates by Office" list for the
 * November 3, 2026 general election (status Qualified; last updated October
 * 30, 2026) and reported as an uncounted sole nominee. Withdrawn filers are
 * skipped.
 */
const RESULTS_ID = "de-2026-primary-results-csv", LIST_ID = "de-2026-general-filed-candidates-html";
const SOURCES: readonly StateGeneralSource[] = [
  { id: RESULTS_ID, url: "https://data.delaware.gov/resource/4hbv-7brf.csv?$limit=50000&electionname=2026%20Primary%20Election", path: "data/source/rapid/state-primary/de/2026-primary-results.csv", cycleYear: 2026, electionDate: "2026-09-15", note: "Official results of the September 15, 2026 primary (contested races only), from the state open data portal." },
  { id: LIST_ID, url: "https://elections.delaware.gov/candidates/candidatelist/genl_fcddt_2026.html", path: "data/source/rapid/state-primary/de/2026-general-filed-candidates.html", cycleYear: 2026, electionDate: "2026-09-15", note: "Filed candidates for the November 3, 2026 general election (last updated October 30, 2026); names the nominees whose primaries were not held because they were unopposed." },
];

const PARTIES: Readonly<Record<string, string>> = { "Democratic Party": "Democratic", "Republican Party": "Republican", Democratic: "Democratic", Republican: "Republican" };
const fail = (code: string): never => { throw new Error(`DELAWARE_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value.trim()) ? Number(value.trim()) : fail(`INTEGER_INVALID:${value}`);

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "U.S. Senator") return { office: "us_senate", district: null };
  if (raw === "Representative in Congress") return { office: "us_house", district: "AL" };
  const match = raw.match(/^State (Senator|Representative) District (\d+)$/);
  return match ? { office: match[1] === "Senator" ? "state_upper" : "state_lower", district: match[2]! } : null;
};

function parseResults(bytes: Buffer): RawPrimaryContest[] {
  const table = parseCsv(bytes.toString("utf8"));
  const header = table[0] ?? fail("EMPTY");
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const officeCol = column("office"), nameCol = column("candidatename"), partyCol = column("partyname"), votesCol = column("totalvotessum"), electionCol = column("electionname");
  const contests = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: number }[] }>();
  for (const row of table.slice(1)) {
    if (row.length < header.length) continue;
    if (row[electionCol] !== "2026 Primary Election") fail(`ELECTION:${row[electionCol]}`);
    const office = officeOf(row[officeCol]!.trim());
    if (!office) continue;
    const rawParty = PARTIES[row[partyCol]!.trim()] ?? fail(`PARTY_UNKNOWN:${row[partyCol]}`);
    const key = `${row[officeCol]}|${rawParty}`;
    const entry = contests.get(key) ?? { ...office, rawParty, candidates: [] };
    entry.candidates.push({ name: row[nameCol]!.trim(), votes: integer(row[votesCol]!) });
    contests.set(key, entry);
  }
  return [...contests.values()];
}

const decode = (value: string): string => value.replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code))).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function parseCandidateList(bytes: Buffer, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const html = bytes.toString("utf8");
  if (!html.includes("General Election 11/3/2026")) fail("LIST_ELECTION");
  const held = new Set(parseResults(readSource(RESULTS_ID)).map((contest) => `${contest.office}|${contest.district}|${contest.rawParty}`));
  const nominees = new Map<string, RawPrimaryContest>();
  for (const [row] of html.matchAll(/<tr data-county=[\s\S]*?<\/tr>/g)) {
    const cell = (label: string): string => decode(row.match(new RegExp(`data-label='${label}'>([^<]*)<`))?.[1] ?? fail(`LIST_CELL:${label}`));
    const office = officeOf(cell("Office")), rawParty = PARTIES[cell("Party")];
    if (!office || !rawParty || cell("Status") !== "Qualified") continue;
    const key = `${office.office}|${office.district}|${rawParty}`;
    if (held.has(key)) continue;
    if (nominees.has(key)) fail(`LIST_TWO_NOMINEES_WITHOUT_PRIMARY:${key}`);
    const name = decode(row.match(/class='main-span'[^>]*>([^<]*)</)?.[1] ?? fail(`LIST_NAME:${key}`));
    nominees.set(key, { ...office, rawParty, candidates: [{ name, votes: null, winner: true }] });
  }
  return [...nominees.values()];
}

export const DELAWARE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "DE",
  authority: "Delaware Department of Elections, official primary results and filed-candidate list",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [RESULTS_ID]: 27, [LIST_ID]: 60 },
  parse: (bytes, source, readSource) => source.id === LIST_ID ? parseCandidateList(bytes, readSource) : parseResults(bytes),
};
