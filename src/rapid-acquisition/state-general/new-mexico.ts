import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/**
 * New Mexico Secretary of State, official results (electionresults.sos.nm.gov).
 * The results site's own export buttons are ASP.NET postbacks bound to a
 * session cookie, so the retained files are the district-level JSON the same
 * site's legislative maps read from the Secretary of State's results web
 * service: one row per candidate with the district-wide total, for office
 * sequence 233 (State Senator) and 234 (State Representative) of the archived
 * 2024 general (election 2882). Both chambers were elected on November 5,
 * 2024: all 70 House districts, and all 42 Senate districts to four-year
 * terms.
 *
 * House District 57 went to an automatic recount (election 2886, certified
 * December 3, 2024); its recount totals replace the canvass totals, so the
 * general file skips that district. Districts read "DISTRICT 40"; party is
 * the published party name (Democrat, Republican, Libertarian, Independent).
 * The service publishes no write-in lines for these contests.
 */
const SERVICE = "https://nmresultswebservice.azurewebsites.us/NMResultsAjax.svc/GetMapDataArchive";
const SOURCES: readonly (StateGeneralSource & { chamber: "upper" | "lower"; race: string; skip: readonly string[]; only?: readonly string[] })[] = [
  { id: "nm-2024-general-senate-results-json", url: `${SERVICE}?type=LGX&category=SW&raceID=0&osn=233&county=0&party=0&electionID=2882`, path: "data/source/rapid/state-general/nm/2024-general-senate-results.json", cycleYear: 2024, electionDate: "2024-11-05", note: "42 Senate contests.", chamber: "upper", race: "State Senator", skip: [] },
  { id: "nm-2024-general-house-results-json", url: `${SERVICE}?type=LGX&category=SW&raceID=0&osn=234&county=0&party=0&electionID=2882`, path: "data/source/rapid/state-general/nm/2024-general-house-results.json", cycleYear: 2024, electionDate: "2024-11-05", note: "69 House contests; District 57 is read from the recount.", chamber: "lower", race: "State Representative", skip: ["57"] },
  { id: "nm-2024-general-recount-house-results-json", url: `${SERVICE}?type=LGX&category=SW&raceID=0&osn=234&county=0&party=0&electionID=2886`, path: "data/source/rapid/state-general/nm/2024-general-recount-house-results.json", cycleYear: 2024, electionDate: "2024-11-05", note: "Automatic recount of House District 57, certified 2024-12-03.", chamber: "lower", race: "State Representative", skip: [], only: ["57"] },
];

type Row = Readonly<{ AreaNum: string; RaceName: string; VoteFor: number; calcCandidate: string; PartyName: string; calcCandidateVotes: string; PrecinctsReporting: number; TotalPrecincts: number }>;

const fail = (code: string): never => { throw new Error(`NEW_MEXICO_GENERAL_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

function parse(bytes: Buffer, source: StateGeneralSource): RawGeneralContest[] {
  const spec = SOURCES.find((candidate) => candidate.id === source.id) ?? fail(`SOURCE_UNKNOWN:${source.id}`);
  let rows: Row[];
  try { rows = JSON.parse(bytes.toString("utf8").replace(/^﻿/, "")) as Row[]; } catch { return fail(`JSON_INVALID:${source.id}`); }
  if (!Array.isArray(rows) || rows.length === 0) fail(`EMPTY:${source.id}`);
  const contests = new Map<string, { seats: number; candidates: { name: string; rawParty: string; votes: number }[] }>();
  for (const row of rows) {
    if (row.RaceName !== spec.race) fail(`RACE_UNEXPECTED:${row.RaceName}`);
    const district = row.AreaNum.trim().match(/^DISTRICT (\d+)$/)?.[1] ?? fail(`DISTRICT_UNRECOGNIZED:${row.AreaNum}`);
    const key = String(Number(district));
    if (spec.skip.includes(key) || (spec.only && !spec.only.includes(key))) continue;
    if (row.PrecinctsReporting !== row.TotalPrecincts) fail(`INCOMPLETE:${source.id}:${key}`);
    const entry = contests.get(key) ?? { seats: row.VoteFor, candidates: [] };
    if (entry.seats !== row.VoteFor) fail(`SEATS_INCONSISTENT:${key}`);
    entry.candidates.push({ name: row.calcCandidate.replace(/\s+/g, " ").trim(), rawParty: row.PartyName.trim(), votes: integer(row.calcCandidateVotes) });
    contests.set(key, entry);
  }
  return [...contests.entries()].map(([district, entry]) => ({ chamber: spec.chamber, district, seats: entry.seats, candidates: entry.candidates }));
}

export const NEW_MEXICO_GENERAL: StateGeneralAdapter = {
  stateCode: "NM",
  authority: "New Mexico Secretary of State, official election results",
  sources: SOURCES.map(({ id, url, path, cycleYear, electionDate, note }) => ({ id, url, path, cycleYear, electionDate, note })),
  expectedContests: { "nm-2024-general-senate-results-json": 42, "nm-2024-general-house-results-json": 69, "nm-2024-general-recount-house-results-json": 1 },
  parse,
};
