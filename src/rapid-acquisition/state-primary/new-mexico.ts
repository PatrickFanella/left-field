import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * New Mexico Secretary of State, official results of the June 2, 2026
 * primary (electionresults.sos.nm.gov, election 2911, headed "Official
 * Results 2026 Primary" after the state canvass). As for the general
 * adapter, the retained files are the district-level JSON the results site's
 * maps read from the Secretary of State's results web service, one per
 * office sequence: 180 U.S. Senator, 190 U.S. Representative, 200 Governor,
 * 233 State Senator, 234 State Representative. Each row is one candidate in
 * one party's primary with the district-wide total; unopposed candidates are
 * printed, so every party that fielded a candidate has a contest.
 *
 * The rows carry a `Winner` flag, but it marks the leading candidate in the
 * area across both parties (the Republican Senate and governor nominees are
 * false), so it is not a nomination mark and is not read. A declared
 * write-in candidate is printed by name with "(write in)"; the suffix is
 * dropped and the line kept as an ordinary named candidate (Larry Marker,
 * the only Republican in the U.S. Senate primary). The service publishes no
 * aggregate write-in lines.
 *
 * The Senate was elected in 2024 to four-year terms; the one State Senator
 * contest is District 33, on the ballot to fill a vacancy, and is reported
 * as a special primary.
 */
const SERVICE = "https://nmresultswebservice.azurewebsites.us/NMResultsAjax.svc/GetMapDataArchive";
const query = (type: string, osn: number): string => `${SERVICE}?type=${type}&category=SW&raceID=0&osn=${osn}&county=0&party=0&electionID=2911`;
const DIR = "data/source/rapid/state-primary/nm";
const NOTE = "Official results after the state canvass (election 2911).";
const SPECS = [
  { id: "nm-2026-primary-us-senate-results-json", type: "FED", osn: 180, file: "us-senate", race: "United States Senator", office: "us_senate" },
  { id: "nm-2026-primary-us-house-results-json", type: "FED", osn: 190, file: "us-house", race: "United States Representative", office: "us_house" },
  { id: "nm-2026-primary-governor-results-json", type: "SW", osn: 200, file: "governor", race: "Governor", office: "governor" },
  { id: "nm-2026-primary-senate-results-json", type: "LGX", osn: 233, file: "senate", race: "State Senator", office: "state_upper" },
  { id: "nm-2026-primary-house-results-json", type: "LGX", osn: 234, file: "house", race: "State Representative", office: "state_lower" },
] as const;
const SOURCES: readonly StateGeneralSource[] = SPECS.map((spec) => ({ id: spec.id, url: query(spec.type, spec.osn), path: `${DIR}/2026-primary-${spec.file}-results.json`, cycleYear: 2026, electionDate: "2026-06-02", note: NOTE }));

type Row = Readonly<{ AreaNum: string; RaceName: string; VoteFor: number; calcCandidate: string; PartyName: string; calcCandidateVotes: string; PrecinctsReporting: number; TotalPrecincts: number }>;

const fail = (code: string): never => { throw new Error(`NEW_MEXICO_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const spec = SPECS.find((candidate) => candidate.id === source.id) ?? fail(`SOURCE_UNKNOWN:${source.id}`);
  let rows: Row[];
  try { rows = JSON.parse(bytes.toString("utf8").replace(/^﻿/, "")) as Row[]; } catch { return fail(`JSON_INVALID:${source.id}`); }
  if (!Array.isArray(rows) || rows.length === 0) fail(`EMPTY:${source.id}`);
  const statewide = spec.office === "us_senate" || spec.office === "governor";
  const contests = new Map<string, { district: string | null; party: string; seats: number; candidates: { name: string; votes: number }[] }>();
  for (const row of rows) {
    if (row.RaceName !== spec.race) fail(`RACE_UNEXPECTED:${row.RaceName}`);
    if (row.PrecinctsReporting !== row.TotalPrecincts) fail(`INCOMPLETE:${source.id}:${row.AreaNum}`);
    const district = statewide ? (row.AreaNum.trim() === "" ? null : fail(`AREA_ON_STATEWIDE:${row.AreaNum}`)) : String(Number(row.AreaNum.trim().match(/^DISTRICT (\d+)$/)?.[1] ?? fail(`DISTRICT_UNRECOGNIZED:${row.AreaNum}`)));
    const party = row.PartyName.trim() || fail(`PARTY_MISSING:${row.calcCandidate}`);
    const key = `${district ?? ""}|${party}`;
    const entry = contests.get(key) ?? { district, party, seats: row.VoteFor, candidates: [] };
    if (entry.seats !== row.VoteFor) fail(`SEATS_INCONSISTENT:${key}`);
    entry.candidates.push({ name: row.calcCandidate.replace(/\s*\(write in\)\s*$/i, "").replace(/\s+/g, " ").trim(), votes: integer(row.calcCandidateVotes) });
    contests.set(key, entry);
  }
  return [...contests.values()].map((entry) => ({
    office: spec.office, district: entry.district, rawParty: entry.party, seats: entry.seats, candidates: entry.candidates,
    ...(spec.office === "state_upper" ? { special: true } : {}),
  }));
}

export const NEW_MEXICO_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NM",
  authority: "New Mexico Secretary of State, official primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: {
    "nm-2026-primary-us-senate-results-json": 2,
    "nm-2026-primary-us-house-results-json": 6,
    "nm-2026-primary-governor-results-json": 2,
    "nm-2026-primary-senate-results-json": 2,
    "nm-2026-primary-house-results-json": 103,
  },
  parse,
};
