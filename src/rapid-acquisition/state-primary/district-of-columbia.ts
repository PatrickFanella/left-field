import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * District of Columbia Board of Elections, certified results of the June 16,
 * 2026 Primary and Special Election. The certified CSV holds first-choice
 * votes per precinct for every contest; Council contests are summed per
 * candidate. Over- and under-vote rows are dropped and the "Write-in" row is
 * kept as a write-in. A party contest with no named candidate (write-ins
 * only) is left out.
 *
 * The 2026 primary was the District's first ranked-choice election. For each
 * contest the Board tabulated by RCV (more than one candidate), its certified
 * RCTab report (published July 17, 2026) is retained as a companion and its
 * "Winner(s)" line marks the nominee; the votes reported are the certified
 * first round, as printed in the CSV. Contest 75 on the same ballot is the
 * special election for the at-large seat Kenyan McDuffie left, not a primary,
 * and is not read.
 */
const RESULTS_ID = "dc-2026-primary-certified-results-csv";
const REPORTS = "https://electionresults.dcboe.org/download/RCV";
/** Certified RCTab report per RCV-tabulated Democratic Council contest, keyed by the district the contest names. */
const RCV_REPORTS: readonly Readonly<{ district: string; slug: string; report: string }>[] = [
  { district: "At-Large", slug: "at-large", report: "4a550de9-2ae4-4b33-80d8-b53a24ace23d" },
  { district: "Ward 1", slug: "ward-1", report: "a05ebb40-0ecd-427b-b03a-ee136112619f" },
  { district: "Ward 5", slug: "ward-5", report: "d45fd597-d251-4594-940e-7cae768daf88" },
  { district: "Ward 6", slug: "ward-6", report: "baa72ff6-bd20-4d2c-982c-1a2cc6dd0554" },
];
const rcvSourceId = (slug: string): string => `dc-2026-primary-rcv-democratic-${slug}-csv`;

const SOURCES: readonly StateGeneralSource[] = [
  { id: RESULTS_ID, url: "https://electionresults.dcboe.org/Downloads/Reports/June_16_2026_Primary_and_Special_Election_Certified_Results.csv", path: "data/source/rapid/state-primary/dc/2026-primary-certified-results.csv", cycleYear: 2026, electionDate: "2026-06-16", note: "Certified first-choice results by precinct, June 16, 2026 primary; Council chairman, at-large and wards 1, 3, 5 and 6, every party." },
  ...RCV_REPORTS.map(({ district, slug, report }): StateGeneralSource => ({ id: rcvSourceId(slug), url: `${REPORTS}/${report}.csv`, path: `data/source/rapid/state-primary/dc/2026-primary-rcv-democratic-${slug}.csv`, cycleYear: 2026, electionDate: "2026-06-16", note: `Certified RCTab report (July 17, 2026) for the Democratic ${district} Council contest; read only for its winner.` })),
];

const PARTIES: Readonly<Record<string, string>> = { DEM: "Democratic", REP: "Republican", STG: "Statehood Green" };
const WARDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"];
const fail = (code: string): never => { throw new Error(`DC_PRIMARY_${code}`); };

const districtOf = (contest: string): Readonly<{ party: string; district: string }> | null => {
  const match = contest.replace(/\s+/g, " ").replace("THEDISTRICT", "THE DISTRICT").match(/^(DEM|REP|STG) (?:(WARD (?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT)|AT-LARGE) MEMBER|(CHAIRMAN)) OF THE COUNCIL OF THE DISTRICT OF COLUMBIA$/);
  if (!match) return null;
  const district = match[3] ? "Chairman" : match[2] === "AT-LARGE" ? "At-Large" : `Ward ${WARDS.indexOf(match[2]!.slice(5)) + 1}`;
  return { party: match[1]!, district };
};

/** The "Winner(s)" line of an RCTab summary CSV. */
const rcvWinner = (bytes: Buffer): string => {
  const line = parseCsv(bytes.toString("utf8").replace(/^﻿/, "")).find((row) => row[0] === "Winner(s)") ?? fail("RCV_WINNER_MISSING");
  return (line[1] ?? "").trim() || fail("RCV_WINNER_EMPTY");
};

function parseResults(bytes: Buffer, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const table = parseCsv(bytes.toString("utf8").replace(/^﻿/, ""));
  const header = table[0]!;
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const contestCol = column("ContestName"), precinctCol = column("PrecinctNumber"), candidateCol = column("Candidate"), partyCol = column("Party"), votesCol = column("Votes");
  const contests = new Map<string, { party: string; district: string; candidates: Map<string, { name: string; votes: number; writeIn: boolean }> }>();
  const seen = new Set<string>();
  for (const row of table.slice(1)) {
    if (row.length < header.length) continue;
    const contest = districtOf(row[contestCol]!.trim());
    if (!contest) continue;
    const name = row[candidateCol]!.trim();
    if (name === "OVER VOTES" || name === "UNDER VOTES") continue;
    if (row[partyCol]!.trim() !== contest.party) fail(`PARTY_DRIFT:${row[contestCol]}:${name}`);
    const key = `${contest.party}|${contest.district}`, once = `${key}|${row[precinctCol]}|${name}`;
    if (seen.has(once)) fail(`DUPLICATE_PRECINCT_ROW:${once}`);
    seen.add(once);
    const votes = /^\d+$/.test(row[votesCol]!.trim()) ? Number(row[votesCol]!.trim()) : fail(`VOTES_INVALID:${once}`);
    const entry = contests.get(key) ?? { ...contest, candidates: new Map() };
    const candidate = entry.candidates.get(name) ?? { name, votes: 0, writeIn: /^write-?in$/i.test(name) };
    candidate.votes += votes;
    entry.candidates.set(name, candidate);
    contests.set(key, entry);
  }
  return [...contests.values()].filter((entry) => [...entry.candidates.values()].some((candidate) => !candidate.writeIn)).map((entry) => {
    const report = entry.party === "DEM" ? RCV_REPORTS.find((candidate) => candidate.district === entry.district) : undefined;
    const named = [...entry.candidates.values()].filter((candidate) => !candidate.writeIn);
    if (!report && named.length > 1) fail(`RCV_REPORT_MISSING:${entry.party}:${entry.district}`);
    const winner = report ? rcvWinner(readSource(rcvSourceId(report.slug))) : null;
    if (winner !== null && !named.some((candidate) => candidate.name === winner)) fail(`RCV_WINNER_NOT_A_CANDIDATE:${entry.district}:${winner}`);
    return {
      office: "state_unicameral" as const, district: entry.district, rawParty: PARTIES[entry.party]!,
      candidates: [...entry.candidates.values()].map((candidate) => ({ ...candidate, ...(candidate.name === winner ? { winner: true } : {}) })),
    };
  });
}

export const DISTRICT_OF_COLUMBIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "DC",
  authority: "District of Columbia Board of Elections, certified primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [RESULTS_ID]: 14, ...Object.fromEntries(RCV_REPORTS.map(({ slug }) => [rcvSourceId(slug), 0])) },
  parse: (bytes, source, readSource) => source.id === RESULTS_ID ? parseResults(bytes, readSource) : [],
};
