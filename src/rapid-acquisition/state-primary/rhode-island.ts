import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Rhode Island Board of Elections, official results of the 2026 statewide
 * primary on its results site (electionresults.ri.gov, an Enhanced Voting
 * app): the site's own JSON export of the whole election, created
 * 2026-09-15 when the Board certified the primary. The election record marks
 * these as official results and dates the primary September 9, 2026.
 *
 * Statewide ballot items are one per party and office, named "DEM Governor",
 * "REP Representative in Congress District 1", "DEM Senator in General
 * Assembly District 5" and so on; unopposed primaries are printed. The
 * export carries no winner mark and no write-in lines. An asterisk after a
 * name marks the party-endorsed candidate on Rhode Island's primary ballot
 * (it is on losing candidates too), so it is removed and is not a winner
 * mark. Local contests (`localResults`) are not read.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ri-2026-primary-export-json", url: "https://electionresults.ri.gov/cdn/results/RhodeIsland/export-RI2026StatewidePrimary.json", path: "data/source/rapid/state-primary/ri/2026-primary-export.json", cycleYear: 2026, electionDate: "2026-09-09", note: "Results site JSON export of the certified 2026 statewide primary (created 2026-09-15, the certification date); every party and office." },
];

type Document = { electionDate: string; results: { ballotItems: { name: string; voteFor: number; contestType: string; ballotOptions: { name: string; voteCount: number; politicalParty: string }[] }[] } };
const fail = (code: string): never => { throw new Error(`RHODE_ISLAND_PRIMARY_${code}`); };

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "Senator in Congress") return { office: "us_senate", district: null };
  if (raw === "Governor") return { office: "governor", district: null };
  const match = raw.match(/^(Representative in Congress|Senator in General Assembly|Representative in General Assembly) District (\d+)$/);
  if (!match) return null;
  const office: PrimaryOffice = match[1] === "Representative in Congress" ? "us_house" : match[1] === "Senator in General Assembly" ? "state_upper" : "state_lower";
  return { office, district: match[2]! };
};

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const document = JSON.parse(bytes.toString("utf8")) as Document;
  if (document.electionDate !== source.electionDate) fail(`DATE:${document.electionDate}`);
  return document.results.ballotItems.flatMap((item): RawPrimaryContest[] => {
    const match = item.name.match(/^(DEM|REP) (.+)$/);
    if (!match) return [];
    const office = officeOf(match[2]!);
    if (!office) return [];
    if (item.contestType !== "Candidate") fail(`CONTEST_TYPE:${item.name}`);
    return [{ ...office, rawParty: match[1]!, seats: item.voteFor, candidates: item.ballotOptions.map((option) => {
      if (!Number.isSafeInteger(option.voteCount)) fail(`VOTES:${item.name}:${option.name}`);
      return { name: option.name.replace(/\*$/, "").trim(), votes: option.voteCount };
    }) }];
  });
}

export const RHODE_ISLAND_PRIMARY: StatePrimaryAdapter = {
  stateCode: "RI",
  authority: "Rhode Island Board of Elections, official results site export",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ri-2026-primary-export-json": 141 },
  parse,
};
