import { unzipSync } from "fflate";

import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * South Carolina Election Commission, 2026 primary results (Clarity ENR
 * summary.zip, every election reporting "County Certified Results"): the
 * June 9 statewide primaries, the recount of those primaries, the June 23
 * runoffs, and two special primaries: the Republican U.S. Senate primary of
 * August 11 and its August 25 runoff, held to renominate after the nominee
 * Lindsey Graham died, and the September 1 State Senate 15 primary for a
 * vacancy. Contest names read "U.S.  House of Representatives, District  1 -
 * DEM (Vote For 1)" with irregular spacing. The summaries mark no winners.
 *
 * The recount (State House 36, Republican) replaces the same contest in the
 * June 9 file, which is skipped there.
 *
 * South Carolina prints no primary for a party with a single filed candidate.
 * Those nominations come from the Commission's candidate tracking system: the
 * 2026 general election candidate list for the U.S. House and the State
 * House, whose status "Active" marks a candidate on the general ballot. A
 * Democratic or Republican "Active" candidate whose party had no printed
 * primary or runoff in that district was nominated unopposed. The list is
 * served only in answer to a POST of the search form.
 */
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ENR = "https://www.enr-scvotes.org/SC";
const clarity = (id: string, election: string, file: string, electionDate: string, note: string): StateGeneralSource =>
  ({ id, url: `${ENR}/${election}/reports/summary.zip`, path: `data/source/rapid/state-primary/sc/${file}`, cycleYear: 2026, electionDate, note, userAgent: BROWSER });
const candidateList = (id: string, office: string, file: string, note: string): StateGeneralSource =>
  ({ id, url: "https://vrems.scvotes.sc.gov/Candidate/CandidateSearch/", postBody: `ElectionId=22596&SelectedOffice=${office}&SelectedCandidateStatus=All&SelectedPoliticalParty=All&SelectedFilingLocation=All&CandidateFirstName=&CandidateLastName=`, path: `data/source/rapid/state-primary/sc/${file}`, cycleYear: 2026, electionDate: "2026-06-09", note, userAgent: BROWSER });

const PRIMARY = "sc-2026-primary-clarity-summary-zip", RECOUNT = "sc-2026-primary-recount-clarity-summary-zip", RUNOFF = "sc-2026-primary-runoff-clarity-summary-zip";
const SPECIAL_SENATE = "sc-2026-primary-special-us-senate-clarity-summary-zip", SPECIAL_SENATE_RUNOFF = "sc-2026-primary-runoff-special-us-senate-clarity-summary-zip", SPECIAL_SENATE_15 = "sc-2026-primary-special-state-senate-15-clarity-summary-zip";
const HOUSE_LIST = "sc-2026-primary-us-house-candidate-list-html", STATE_HOUSE_LIST = "sc-2026-primary-state-house-candidate-list-html";
const CLARITY_IDS = [PRIMARY, RECOUNT, RUNOFF, SPECIAL_SENATE, SPECIAL_SENATE_RUNOFF, SPECIAL_SENATE_15];

const SOURCES: readonly StateGeneralSource[] = [
  clarity(PRIMARY, "126294/375593", "2026-primary-clarity-summary.zip", "2026-06-09", "June 9 statewide primaries, contested primaries only."),
  clarity(RECOUNT, "126666/375603", "2026-primary-recount-clarity-summary.zip", "2026-06-09", "Recount of the June 9 primaries: State House 36, Republican."),
  clarity(RUNOFF, "126718/376464", "2026-primary-runoff-clarity-summary.zip", "2026-06-23", "June 23 statewide primary runoffs."),
  clarity(SPECIAL_SENATE, "127017/378537", "2026-primary-special-us-senate-clarity-summary.zip", "2026-08-11", "August 11 special Republican U.S. Senate primary after the nominee's death."),
  clarity(SPECIAL_SENATE_RUNOFF, "127179/379277", "2026-primary-runoff-special-us-senate-clarity-summary.zip", "2026-08-25", "August 25 runoff of the special Republican U.S. Senate primary."),
  clarity(SPECIAL_SENATE_15, "127227/379276", "2026-primary-special-state-senate-15-clarity-summary.zip", "2026-09-01", "September 1 special primary for State Senate 15."),
  candidateList(HOUSE_LIST, "378", "2026-general-us-house-candidate-list.html", "Candidate tracking system, 2026 general election, U.S. House: names the nominees of primaries not printed because unopposed."),
  candidateList(STATE_HOUSE_LIST, "380", "2026-general-state-house-candidate-list.html", "Candidate tracking system, 2026 general election, State House: names the nominees of primaries not printed because unopposed."),
];

const fail = (code: string): never => { throw new Error(`SOUTH_CAROLINA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);
const PARTY: Readonly<Record<string, string>> = { DEM: "Democratic", REP: "Republican" };

type Office = Pick<RawPrimaryContest, "office" | "district">;
const officeOf = (raw: string): Office | null => {
  if (raw === "Governor" || raw === "Governor and Lieutenant Governor") return { office: "governor", district: null };
  if (raw === "U.S. Senate") return { office: "us_senate", district: null };
  const match = raw.match(/^(U\.S\. House of Representatives|State House of Representatives|State Senate), District (\d+)$/);
  if (!match) return null;
  return { office: match[1] === "U.S. House of Representatives" ? "us_house" : match[1] === "State Senate" ? "state_upper" : "state_lower", district: match[2]! };
};
const keyOf = (office: Office, party: string): string => `${office.office}|${office.district ?? ""}|${party}`;

function parseClarity(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail(`ZIP_INVALID:${source.id}`); }
  const table = parseCsv(Buffer.from(files["summary.csv"] ?? fail(`SUMMARY_MISSING:${source.id}`)).toString("latin1"));
  const header = table[0]!.map((cell) => cell.trim().toLowerCase());
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const contestCol = column("contest name"), nameCol = column("choice name"), votesCol = column("total votes");
  const recounted = source.id === PRIMARY ? new Set(parseClarity(readSource(RECOUNT), { ...source, id: RECOUNT }, readSource).map((contest) => keyOf(contest, contest.rawParty!))) : new Set<string>();
  const stage = source.id === RUNOFF || source.id === SPECIAL_SENATE_RUNOFF ? "runoff" as const : "primary" as const;
  const special = source.id === SPECIAL_SENATE || source.id === SPECIAL_SENATE_RUNOFF || source.id === SPECIAL_SENATE_15;
  const contests = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: number; writeIn: boolean }[] }>();
  for (const row of table.slice(1)) {
    if (row.length < header.length) continue;
    const contest = row[contestCol]!.replace(/\s+/g, " ").trim();
    const match = contest.match(/^(.+?) - (DEM|REP) \(Vote For (\d+)\)$/);
    const office = match ? officeOf(match[1]!.trim()) : null;
    if (!match || !office) continue;
    const party = PARTY[match[2]!]!;
    if (recounted.has(keyOf(office, party))) continue;
    const entry = contests.get(contest) ?? { ...office, rawParty: party, stage, ...(special ? { special } : {}), seats: Number(match[3]), candidates: [] };
    const name = row[nameCol]!.replace(/\s+/g, " ").replace(/ - \*[^*]+\*$/, "").trim();
    entry.candidates.push({ name, votes: integer(row[votesCol]!.trim()), writeIn: /^write-?ins?$/i.test(name) });
    contests.set(contest, entry);
  }
  return [...contests.values()];
}

const decode = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function parseCandidateList(bytes: Buffer, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const html = bytes.toString("utf8");
  if (!html.includes('id="gridCandidateSearch"')) fail("CANDIDATE_GRID_MISSING");
  const printed = new Set(CLARITY_IDS.flatMap((id) => parseClarity(readSource(id), { ...SOURCES.find((source) => source.id === id)!, id }, readSource)).map((contest) => keyOf(contest, contest.rawParty!)));
  const nominees = new Map<string, Office & { party: string; names: string[] }>();
  for (const row of html.matchAll(/<tr data-index="\d+"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => decode(cell[1]!));
    if (cells.length !== 7) fail(`ROW_CELLS:${cells.length}`);
    const [officeName, , name, , party, , status] = cells as [string, string, string, string, string, string, string];
    const office = officeOf(officeName);
    if (!office) fail(`OFFICE:${officeName}`);
    if (status !== "Active" || (party !== "Democratic" && party !== "Republican")) continue;
    const key = keyOf(office!, party);
    if (printed.has(key)) continue;
    const entry = nominees.get(key) ?? { ...office!, party, names: [] };
    entry.names.push(name);
    nominees.set(key, entry);
  }
  return [...nominees.values()].map((entry) => {
    if (entry.names.length !== 1) fail(`UNOPPOSED_NOT_ONE:${entry.office}:${entry.district}:${entry.party}:${entry.names.length}`);
    return { office: entry.office, district: entry.district, rawParty: entry.party, candidates: [{ name: entry.names[0]!, votes: null, winner: true }] };
  });
}

export const SOUTH_CAROLINA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "SC",
  authority: "South Carolina Election Commission, 2026 primary results and candidate tracking system",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [PRIMARY]: 66, [RECOUNT]: 1, [RUNOFF]: 7, [SPECIAL_SENATE]: 1, [SPECIAL_SENATE_RUNOFF]: 1, [SPECIAL_SENATE_15]: 1, [HOUSE_LIST]: 5, [STATE_HOUSE_LIST]: 174 },
  parse: (bytes, source, readSource) => source.id === HOUSE_LIST || source.id === STATE_HOUSE_LIST ? parseCandidateList(bytes, readSource) : parseClarity(bytes, source, readSource),
};
