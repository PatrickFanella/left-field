import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateCountyDemographicsProjection } from "./county-demographics";
import { byteCompare, hash, sha, exact } from "./shared";

const SOURCE = {
  id: "medsl-2024-senate-county-results",
  url: "https://raw.githubusercontent.com/MEDSL/2024-elections-official/df531089c78e6d0098db1a6bfb3849a066a06995/2024-senate-county.csv",
  path: "data/source/rapid/county-senate-results/2024-senate-county.csv",
  bytes: 1170326,
  sha256: "6bb49fe67db5a7dcf30862fab81effc0fcfa456cb41326dd5fa9cd9fb8c60b81",
} as const;

export interface CountySenateResultRow {
  readonly countyFips: string;
  readonly stateCode: string;
  readonly countyName: string;
  readonly cycleYear: 2024;
  readonly office: "US SENATE";
  readonly candidateName: string;
  readonly candidateParty: string;
  readonly candidatePartyDetailed: string;
  readonly votes: number;
  readonly totalVotes: number;
  readonly writeIn: boolean;
  readonly specialElection: boolean;
  readonly sourceVersion: string;
  readonly sourceLockId: "medsl-2024-senate-county-results";
  readonly authority: "research_fallback";
  readonly winnerIdentity: null;
  readonly formulaEligible: false;
  readonly rowSha256: string;
}

export interface CountySenateResultsProjection {
  readonly schema: "rapid-county-senate-results-projection-v1";
  readonly version: 1;
  readonly rows: readonly CountySenateResultRow[];
  readonly rowSetSha256: string;
  readonly summary: Readonly<{ selectedSourceRows: 8713; candidateRows: 8659; exactCountyCount: 1714; stateCount: 29; specialElectionRows: 186; writeInRows: 2274; zeroVoteRows: 1259; quarantined: Readonly<{ countyNameFipsConflict: 6; geographyVintageMismatch: 45; nonCounty: 3 }>; formulaEligibleRows: 0; missingHouseCountyCoverage: true }>;
  readonly packageSha256: string;
}


function csv(text: string): string[][] {
  const rows: string[][] = [], row: string[] = []; let field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (quoted) { if (character === '"' && text[index + 1] === '"') { field += '"'; index++; } else if (character === '"') quoted = false; else field += character; }
    else if (character === '"' && field === "") quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push([...row]); row.length = 0; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("COUNTY_SENATE_RESULTS_CSV_QUOTE_INVALID");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push([...row]); }
  return rows;
}
function bool(value: string): boolean { if (value === "TRUE") return true; if (value === "FALSE") return false; throw new Error("COUNTY_SENATE_RESULTS_BOOLEAN_INVALID"); }
function nonNegative(value: string): number { if (!/^\d+$/.test(value)) throw new Error("COUNTY_SENATE_RESULTS_MEASURE_INVALID"); return Number(value); }
const stripDiacritics = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const countyNameKey = (value: string) => stripDiacritics(value).toLowerCase().replace(/\s+(?:county|parish|borough|census area)$/i, "").replace(/[^a-z0-9]/g, "");
const COUNTY_NAME_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "28065": { jeffdavis: "jeffersondavis" }, // MEDSL abbreviation; Census: Jefferson Davis County.
};
function countyNameMatches(sourceName: string, censusName: string, countyFips: string): boolean {
  const source = COUNTY_NAME_ALIASES[countyFips]?.[countyNameKey(sourceName)] ?? countyNameKey(sourceName), census = countyNameKey(censusName);
  return source === census || (censusName.toLowerCase().endsWith(" city") && source === countyNameKey(censusName.slice(0, -5)));
}

export function buildCountySenateResultsProjection(root = process.cwd()): CountySenateResultsProjection {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const sourceBytes = readFileSync(join(root, SOURCE.path));
  const expectedLock = { id: SOURCE.id, url: SOURCE.url, retainedPath: SOURCE.path, retainedStatus: "retained", byteSize: SOURCE.bytes, sha256: SOURCE.sha256, kind: "source", parentIds: [] };
  const matches = lock.entries.filter((entry) => entry.id === SOURCE.id);
  if (sourceBytes.length !== SOURCE.bytes || sha(sourceBytes) !== SOURCE.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expectedLock)) throw new Error("COUNTY_SENATE_RESULTS_SOURCE_BINDING_INVALID");

  const counties = new Map(validateCountyDemographicsProjection(JSON.parse(readFileSync(join(root, "data/metadata/rapid-county-demographics-projection-v1.json"), "utf8")), root).rows.map((row) => [row.countyFips, row]));
  const parsed = csv(sourceBytes.toString("utf8")), header = parsed[0]!, required = ["year", "state_po", "office", "county_name", "county_fips", "candidate", "party_detailed", "party_simplified", "writein", "mode", "votes", "totalvotes", "stage", "special", "unofficial", "version"];
  for (const field of required) if (!header.includes(field)) throw new Error(`COUNTY_SENATE_RESULTS_COLUMN_MISSING:${field}`);
  const index = Object.fromEntries(required.map((field) => [field, header.indexOf(field)]));
  const rows: CountySenateResultRow[] = [], quarantined = { countyNameFipsConflict: 0, geographyVintageMismatch: 0, nonCounty: 0 };
  let selectedSourceRows = 0;
  for (const values of parsed.slice(1)) {
    if (values.length !== header.length) throw new Error("COUNTY_SENATE_RESULTS_ROW_WIDTH_INVALID");
    if (values[index.year!] !== "2024" || values[index.office!]!.toUpperCase() !== "US SENATE" || values[index.mode!] !== "TOTAL" || values[index.stage!] !== "GEN" || values[index.unofficial!] !== "FALSE") continue;
    selectedSourceRows++;
    const countyFips = values[index.county_fips!]!, county = counties.get(countyFips);
    if (!/^\d{5}$/.test(countyFips)) { quarantined.nonCounty++; continue; }
    if (!county) { quarantined.geographyVintageMismatch++; continue; }
    const stateCode = values[index.state_po!]!, countyName = values[index.county_name!]!, candidateName = values[index.candidate!]!, candidatePartyDetailed = values[index.party_detailed!]!, candidateParty = values[index.party_simplified!]!, sourceVersion = values[index.version!]!;
    if (!/^[A-Z]{2}$/.test(stateCode) || stateCode !== county.stateCode || !countyName || !candidateName || !candidateParty || !candidatePartyDetailed || !/^(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{2}|\d{8})$/.test(sourceVersion)) throw new Error("COUNTY_SENATE_RESULTS_IDENTITY_INVALID");
    if (!countyNameMatches(countyName, county.countyName, countyFips)) { quarantined.countyNameFipsConflict++; continue; }
    const unsigned = { countyFips, stateCode, countyName, cycleYear: 2024 as const, office: "US SENATE" as const, candidateName, candidateParty, candidatePartyDetailed, votes: nonNegative(values[index.votes!]!), totalVotes: nonNegative(values[index.totalvotes!]!), writeIn: bool(values[index.writein!]!), specialElection: bool(values[index.special!]!), sourceVersion, sourceLockId: SOURCE.id, authority: "research_fallback" as const, winnerIdentity: null, formulaEligible: false as const };
    rows.push({ ...unsigned, rowSha256: hash("dsa-seats:rapid-county-senate-results-row:v1", unsigned) });
  }
  rows.sort((left, right) => byteCompare(left.countyFips, right.countyFips) || byteCompare(left.candidateName, right.candidateName) || byteCompare(left.candidatePartyDetailed, right.candidatePartyDetailed));
  const naturalKeys = new Set<string>(), contestRows = new Map<string, CountySenateResultRow[]>();
  for (const row of rows) {
    const naturalKey = [row.countyFips, row.specialElection, row.candidateName, row.candidatePartyDetailed, row.writeIn].join("\0");
    if (naturalKeys.has(naturalKey) || row.votes > row.totalVotes) throw new Error("COUNTY_SENATE_RESULTS_ROW_CLOSURE_INVALID");
    naturalKeys.add(naturalKey);
    const contestKey = `${row.countyFips}\0${row.specialElection}`; contestRows.set(contestKey, [...(contestRows.get(contestKey) ?? []), row]);
  }
  for (const contest of contestRows.values()) if (new Set(contest.map((row) => row.totalVotes)).size !== 1 || contest.reduce((sum, row) => sum + row.votes, 0) !== contest[0]!.totalVotes) throw new Error("COUNTY_SENATE_RESULTS_CONTEST_CLOSURE_INVALID");
  const summary = { selectedSourceRows: 8713 as const, candidateRows: 8659 as const, exactCountyCount: 1714 as const, stateCount: 29 as const, specialElectionRows: 186 as const, writeInRows: 2274 as const, zeroVoteRows: 1259 as const, quarantined: { countyNameFipsConflict: 6 as const, geographyVintageMismatch: 45 as const, nonCounty: 3 as const }, formulaEligibleRows: 0 as const, missingHouseCountyCoverage: true as const };
  const actual = { selectedSourceRows, candidateRows: rows.length, exactCountyCount: new Set(rows.map((row) => row.countyFips)).size, stateCount: new Set(rows.map((row) => row.stateCode)).size, specialElectionRows: rows.filter((row) => row.specialElection).length, writeInRows: rows.filter((row) => row.writeIn).length, zeroVoteRows: rows.filter((row) => row.votes === 0).length, quarantined, formulaEligibleRows: rows.filter((row) => row.formulaEligible).length, missingHouseCountyCoverage: true };
  if (!exact(actual, summary) || selectedSourceRows !== rows.length + quarantined.countyNameFipsConflict + quarantined.geographyVintageMismatch + quarantined.nonCounty || rows.some((row) => row.winnerIdentity !== null || row.formulaEligible)) throw new Error("COUNTY_SENATE_RESULTS_SUMMARY_INVALID");
  const rowSetSha256 = hash("dsa-seats:rapid-county-senate-results-row-set:v1", rows), unsigned = { schema: "rapid-county-senate-results-projection-v1" as const, version: 1 as const, rows, rowSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-county-senate-results-package:v1", unsigned) };
}

const cache = new Map<string, CountySenateResultsProjection>();
export function validateCountySenateResultsProjection(value: unknown, root = process.cwd()): CountySenateResultsProjection { const expected = cache.get(root) ?? buildCountySenateResultsProjection(root); cache.set(root, expected); if (!exact(value, expected)) throw new Error("COUNTY_SENATE_RESULTS_PROJECTION_INVALID"); return value as CountySenateResultsProjection; }
