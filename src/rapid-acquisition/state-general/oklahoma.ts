import { parseCsv } from "../state-legislative-roster";
import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/** Normal browser Export -> Race Level Results CSV. Unopposed candidates
 * do not appear on Oklahoma ballots; absent races stay absent, never zero. */
export function parseOklahomaGeneral(bytes: Buffer): RawGeneralContest[] {
  const rows = parseCsv(bytes.toString("utf8")), header = rows.shift()!;
  const col = (name: string): number => { const i = header.indexOf(name); if(i < 0) throw new Error(`OK_GENERAL_COLUMN:${name}`); return i; };
  const description = col("race_description"), name = col("cand_name"), party = col("cand_party"), votes = col("cand_tot_votes");
  const channels = [col("cand_absmail_votes"), col("cand_early_votes"), col("cand_elecday_votes")];
  const races = new Map<string, {chamber: "upper" | "lower"; district: string; electionKind: "general" | "special_general"; candidates: {name: string; rawParty: string; votes: number}[]}>();
  for(const row of rows) {
    const m = row[description]!.match(/^FOR STATE (SENATOR|REPRESENTATIVE) DISTRICT (\d+)(?: (\(UNEXPIRED TERM\)))?$/); if(!m) continue;
    const count = Number(row[votes]); if(!Number.isSafeInteger(count) || count < 0 || channels.reduce((n,c)=>n + Number(row[c]),0) !== count) throw new Error("OK_GENERAL_VOTE_RECONCILIATION");
    const key = row[description]!, race = races.get(key) ?? {chamber:m[1] === "SENATOR" ? "upper" as const : "lower" as const,district:m[2]!,electionKind:m[3] ? "special_general" as const : "general" as const,candidates:[]};
    if(race.candidates.some(c=>c.name === row[name])) throw new Error("OK_GENERAL_DUPLICATE_CANDIDATE");
    race.candidates.push({name:row[name]!,rawParty:row[party]!,votes:count});races.set(key,race);
  }
  return [...races.values()];
}
const sources: StateGeneralSource[] = [2024,2022].map(year=>({id:`ok-${year}-general-state-results-csv`,url:`https://results.okelections.gov/OKER/?elecDate=${year}${year===2024?"1105":"1108"}#export-race-level-csv`,path:`data/source/rapid/state-general/ok/${year}-general-state-results.csv`,cycleYear:year,electionDate:`${year}-11-${year===2024?"05":"08"}`,note:"Official results browser export; only races on the general ballot, unopposed seats omitted by the publisher."}));
export const OKLAHOMA_GENERAL: StateGeneralAdapter = {stateCode:"OK",authority:"Oklahoma State Election Board, official general election results",sources,expectedContests:{"ok-2024-general-state-results-csv":44,"ok-2022-general-state-results-csv":38},parse:parseOklahomaGeneral};
