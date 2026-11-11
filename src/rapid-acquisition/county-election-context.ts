import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";

import { validateCountyDemographicsProjection } from "./county-demographics";
import { byteCompare, hash, sha, exact } from "./shared";

export interface CountyElectionContextRow {
  readonly countyFips: string;
  readonly stateCode: string;
  readonly countyName: string;
  readonly cycleYear: 2022 | 2024;
  readonly jurisdictionName: string;
  readonly registeredVoters: number | null;
  readonly ballotsCast: number | null;
  readonly turnoutShareOfRegistered: number | null;
  readonly reportingUnitDefinition: "eavs_jurisdiction_exact_census_county_fips";
  readonly sourceLockId: "eac-2022-eavs-public-release-v1-1-csv" | "eac-2024-eavs-public-release-v2-csv";
  readonly formulaEligible: false;
  readonly rowSha256: string;
}
export interface CountyElectionContextProjection {
  readonly schema: "rapid-county-election-context-projection-v1";
  readonly version: 1;
  readonly rows: readonly CountyElectionContextRow[];
  readonly rowSetSha256: string;
  readonly summary: Readonly<{ countyCycleRows: 5946; exactCountyRows2022: 2974; exactCountyRows2024: 2972; excludedNonCountyJurisdictions2022: 8; excludedNonCountyJurisdictions2024: 9; registrationPresent2022: 2918; registrationPresent2024: 2918; ballotsPresent2022: 2967; ballotsPresent2024: 2967; formulaEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = {
  2022: { id: "eac-2022-eavs-public-release-v1-1-csv", url: "https://www.eac.gov/sites/default/files/2023-12/2022_EAVS_for_Public_Release_nolabel_V1.1_CSV.zip", path: "data/source/rapid/county-election-context/2022_EAVS_for_Public_Release_nolabel_V1.1_CSV.zip", bytes: 2048270, sha256: "063a38eca8ee1e82aa4b60ef33eee124a58bd288f10d05126957620719d32acc", member: "2022_EAVS_for_Public_Release_nolabel_V1.1_CSV.csv" },
  2024: { id: "eac-2024-eavs-public-release-v2-csv", url: "https://www.eac.gov/sites/default/files/2026-02/2024_EAVS_for_Public_Release_nolabel_V2_csv.zip", path: "data/source/rapid/county-election-context/2024_EAVS_for_Public_Release_nolabel_V2_csv.zip", bytes: 2119187, sha256: "4073b9f48e1791d44a78ddc543379f6c040c31ce733dfa47676330b4d7f6d6df", member: "2024_EAVS_for_Public_Release_nolabel_V2.csv" },
} as const;

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
  if (quoted) throw new Error("COUNTY_ELECTION_CONTEXT_CSV_QUOTE_INVALID");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push([...row]); }
  return rows;
}
function measure(value: string): number | null { if (value === "") return null; if (!/^-?\d+$/.test(value)) throw new Error("COUNTY_ELECTION_CONTEXT_MEASURE_INVALID"); const parsed = Number(value); return parsed < 0 ? null : parsed; }

export function buildCountyElectionContextProjection(root = process.cwd()): CountyElectionContextProjection {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const demographics = validateCountyDemographicsProjection(JSON.parse(readFileSync(join(root, "data/metadata/rapid-county-demographics-projection-v1.json"), "utf8")), root), counties = new Map(demographics.rows.map((row) => [row.countyFips, row]));
  const rows: CountyElectionContextRow[] = [];
  for (const cycleYear of [2022, 2024] as const) {
    const source = SOURCES[cycleYear], bytes = readFileSync(join(root, source.path)), matches = lock.entries.filter((entry) => entry.id === source.id), expected = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] };
    if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) throw new Error(`COUNTY_ELECTION_CONTEXT_SOURCE_BINDING_INVALID:${source.id}`);
    const archive = unzipSync(bytes); if (Object.keys(archive).length !== 1 || !archive[source.member]) throw new Error("COUNTY_ELECTION_CONTEXT_ARCHIVE_INVALID");
    const parsed = csv(new TextDecoder().decode(archive[source.member])), headers = parsed[0]!, required = ["FIPSCode", "Jurisdiction_Name", "State_Abbr", "A1a", "F1a"];
    for (const field of required) if (!headers.includes(field)) throw new Error(`COUNTY_ELECTION_CONTEXT_COLUMN_MISSING:${field}`);
    const indices = Object.fromEntries(required.map((field) => [field, headers.indexOf(field)]));
    const seen = new Set<string>();
    for (const values of parsed.slice(1)) {
      if (values.length !== headers.length) throw new Error("COUNTY_ELECTION_CONTEXT_ROW_WIDTH_INVALID");
      const sourceFips = values[indices.FIPSCode!]!; if (!/^\d{10}$/.test(sourceFips) || !sourceFips.endsWith("00000")) continue;
      const countyFips = sourceFips.slice(0, 5), county = counties.get(countyFips); if (!county) continue; if (seen.has(countyFips)) throw new Error("COUNTY_ELECTION_CONTEXT_FIPS_INVALID"); seen.add(countyFips);
      const stateCode = values[indices.State_Abbr!]!, jurisdictionName = values[indices.Jurisdiction_Name!]!, registeredVoters = measure(values[indices.A1a!]!), ballotsCast = measure(values[indices.F1a!]!);
      if (stateCode !== county.stateCode || !jurisdictionName) throw new Error("COUNTY_ELECTION_CONTEXT_IDENTITY_INVALID");
      const unsigned = { countyFips, stateCode, countyName: county.countyName, cycleYear, jurisdictionName, registeredVoters, ballotsCast, turnoutShareOfRegistered: registeredVoters && ballotsCast !== null ? ballotsCast / registeredVoters : null, reportingUnitDefinition: "eavs_jurisdiction_exact_census_county_fips" as const, sourceLockId: source.id, formulaEligible: false as const };
      rows.push({ ...unsigned, rowSha256: hash("dsa-seats:rapid-county-election-context-row:v1", unsigned) });
    }
    const expectedCount = cycleYear === 2022 ? 2974 : 2972; if (seen.size !== expectedCount) throw new Error(`COUNTY_ELECTION_CONTEXT_CLOSURE_INVALID:${cycleYear}`);
  }
  rows.sort((left, right) => left.cycleYear - right.cycleYear || byteCompare(left.countyFips, right.countyFips));
  const summary = { countyCycleRows: 5946 as const, exactCountyRows2022: 2974 as const, exactCountyRows2024: 2972 as const, excludedNonCountyJurisdictions2022: 8 as const, excludedNonCountyJurisdictions2024: 9 as const, registrationPresent2022: 2918 as const, registrationPresent2024: 2918 as const, ballotsPresent2022: 2967 as const, ballotsPresent2024: 2967 as const, formulaEligibleRows: 0 as const };
  const actual = { registrationPresent2022: rows.filter((row) => row.cycleYear === 2022 && row.registeredVoters !== null).length, registrationPresent2024: rows.filter((row) => row.cycleYear === 2024 && row.registeredVoters !== null).length, ballotsPresent2022: rows.filter((row) => row.cycleYear === 2022 && row.ballotsCast !== null).length, ballotsPresent2024: rows.filter((row) => row.cycleYear === 2024 && row.ballotsCast !== null).length };
  if (rows.length !== 5946 || !exact(actual, { registrationPresent2022: summary.registrationPresent2022, registrationPresent2024: summary.registrationPresent2024, ballotsPresent2022: summary.ballotsPresent2022, ballotsPresent2024: summary.ballotsPresent2024 }) || rows.some((row) => row.formulaEligible)) throw new Error("COUNTY_ELECTION_CONTEXT_SUMMARY_INVALID");
  const rowSetSha256 = hash("dsa-seats:rapid-county-election-context-row-set:v1", rows), unsigned = { schema: "rapid-county-election-context-projection-v1" as const, version: 1 as const, rows, rowSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-county-election-context-package:v1", unsigned) };
}
export function validateCountyElectionContextProjection(value: unknown, root = process.cwd()): CountyElectionContextProjection { const expected = buildCountyElectionContextProjection(root); if (!exact(value, expected)) throw new Error("COUNTY_ELECTION_CONTEXT_PROJECTION_INVALID"); return value as CountyElectionContextProjection; }
