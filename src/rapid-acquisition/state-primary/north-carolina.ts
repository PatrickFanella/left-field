import { unzipSync } from "fflate";

import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * North Carolina State Board of Elections, March 3, 2026 primary precinct
 * results (zipped tab-delimited text, the 2024 general layout). Contest names
 * read "NC HOUSE OF REPRESENTATIVES DISTRICT 001 (DEM)", "US HOUSE OF
 * REPRESENTATIVES DISTRICT 11 (REP)" and "US SENATE (DEM)"; every row,
 * non-geographic "precincts" included, belongs in the contest total. The file
 * marks no winners. No second primary was held for these offices: the Board
 * published no results for one.
 *
 * North Carolina holds no primary for a party with a single candidate. Those
 * nominees come from the Board's 2026 candidate listing, whose rows dated
 * 11/03/2026 are the candidates on the general ballot, one row per county. A
 * Democratic or Republican candidate there whose party had no primary for the
 * contest was nominated unopposed.
 */
const RESULTS = "nc-2026-primary-results-pct-zip", LISTING = "nc-2026-primary-candidate-listing-csv";
const SOURCES: readonly StateGeneralSource[] = [
  { id: RESULTS, url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2026_03_03/results_pct_20260303.zip", path: "data/source/rapid/state-primary/nc/2026-primary-results-pct.zip", cycleYear: 2026, electionDate: "2026-03-03", note: "Precinct results of the March 3 primaries, as re-issued after the canvass (April 16)." },
  { id: LISTING, url: "https://s3.amazonaws.com/dl.ncsbe.gov/Elections/2026/Candidate%20Filing/Candidate_Listing_2026.csv", path: "data/source/rapid/state-primary/nc/2026-candidate-listing.csv", cycleYear: 2026, electionDate: "2026-03-03", note: "State Board candidate listing: names the nominees whose primary was not held because unopposed." },
];

const fail = (code: string): never => { throw new Error(`NORTH_CAROLINA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);
const PARTY: Readonly<Record<string, string>> = { DEM: "Democratic", REP: "Republican" };

type Office = Pick<RawPrimaryContest, "office" | "district">;
const officeOf = (raw: string): Office | null => {
  if (raw === "US SENATE") return { office: "us_senate", district: null };
  const match = raw.match(/^(US HOUSE OF REPRESENTATIVES|NC HOUSE OF REPRESENTATIVES|NC STATE SENATE) DISTRICT (\d+)$/);
  if (!match) return null;
  return { office: match[1] === "US HOUSE OF REPRESENTATIVES" ? "us_house" : match[1] === "NC STATE SENATE" ? "state_upper" : "state_lower", district: String(Number(match[2])) };
};
const keyOf = (office: Office, party: string): string => `${office.office}|${office.district ?? ""}|${party}`;

function parseResults(bytes: Buffer): RawPrimaryContest[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("ZIP_INVALID"); }
  const name = Object.keys(files).find((file) => /^results_pct_\d{8}\.txt$/.test(file)) ?? fail("RESULTS_FILE_MISSING");
  const lines = Buffer.from(files[name]!).toString("latin1").split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines[0]!.split("\t").map((cell) => cell.trim());
  const column = (label: string): number => { const index = header.indexOf(label); return index >= 0 ? index : fail(`COLUMN_MISSING:${label}`); };
  const contestCol = column("Contest Name"), choiceCol = column("Choice"), votesCol = column("Total Votes"), seatsCol = column("Vote For");
  const contests = new Map<string, RawPrimaryContest & { tally: Map<string, { name: string; votes: number; writeIn: boolean }> }>();
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const contest = cells[contestCol]!.trim();
    const match = contest.match(/^(.+) \((DEM|REP)\)$/);
    const office = match ? officeOf(match[1]!) : null;
    if (!match || !office) continue;
    const entry = contests.get(contest) ?? { ...office, rawParty: PARTY[match[2]!]!, seats: integer(cells[seatsCol]!.trim()), candidates: [], tally: new Map() };
    const choice = cells[choiceCol]!.trim(), writeIn = /\(Write-In\)$|^Write-In \(Miscellaneous\)$/.test(choice);
    const candidate = entry.tally.get(choice) ?? { name: choice.replace(/\s*\(Write-In\)$/, ""), votes: 0, writeIn };
    candidate.votes += integer(cells[votesCol]!.trim());
    entry.tally.set(choice, candidate);
    contests.set(contest, entry);
  }
  return [...contests.values()].map(({ tally, ...contest }) => ({ ...contest, candidates: [...tally.values()] }));
}

function parseListing(bytes: Buffer, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const table = parseCsv(bytes.toString("utf8"));
  const header = table[0]!.map((cell) => cell.trim());
  const column = (label: string): number => { const index = header.indexOf(label); return index >= 0 ? index : fail(`LISTING_COLUMN_MISSING:${label}`); };
  const dateCol = column("election_dt"), contestCol = column("contest_name"), nameCol = column("name_on_ballot"), partyCol = column("party_candidate"), unexpiredCol = column("is_unexpired");
  const held = new Set(parseResults(readSource(RESULTS)).map((contest) => keyOf(contest, contest.rawParty!)));
  const nominees = new Map<string, Office & { party: string; names: Set<string> }>();
  for (const row of table.slice(1)) {
    if (row.length < header.length || row[dateCol] !== "11/03/2026" || row[unexpiredCol] !== "FALSE") continue;
    const office = officeOf(row[contestCol]!.trim()), party = PARTY[row[partyCol]!.trim()];
    if (!office || !party || held.has(keyOf(office, party))) continue;
    const key = keyOf(office, party);
    const entry = nominees.get(key) ?? { ...office, party, names: new Set<string>() };
    entry.names.add(row[nameCol]!.replace(/\s+/g, " ").trim());
    nominees.set(key, entry);
  }
  return [...nominees.values()].map((entry) => {
    if (entry.names.size !== 1) fail(`UNOPPOSED_NOT_ONE:${entry.office}:${entry.district}:${entry.party}:${[...entry.names].join("/")}`);
    return { office: entry.office, district: entry.district, rawParty: entry.party, candidates: [{ name: [...entry.names][0]!, votes: null, winner: true }] };
  });
}

export const NORTH_CAROLINA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NC",
  authority: "North Carolina State Board of Elections, 2026 primary results and candidate listing",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [RESULTS]: 81, [LISTING]: 247 },
  parse: (bytes, source, readSource) => source.id === LISTING ? parseListing(bytes, readSource) : parseResults(bytes),
};
