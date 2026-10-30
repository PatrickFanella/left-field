import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { byteCompare, hash, sha, exact } from "./shared";

export interface CountyCvapRow {
  readonly countyFips: string;
  readonly stateCode: string;
  readonly countyName: string;
  readonly periodStart: "2020-01-01";
  readonly periodEnd: "2024-12-31";
  readonly citizenVotingAgePopulation: number;
  readonly votingAgePopulation: number;
  readonly sourceLockIds: readonly ["census-acs2024-5yr-table-b05003", "rapid-county-demographics-projection-v1"];
  readonly formulaEligible: false;
  readonly rowSha256: string;
}

export interface CountyCvapProjection {
  readonly schema: "rapid-county-cvap-projection-v1";
  readonly version: 1;
  readonly authority: "official_census_acs_2024_5year_b05003";
  readonly methodology: Readonly<{
    cvapDefinition: "native_or_naturalized_citizen_age_18_or_older";
    cvapFields: readonly ["B05003_E009", "B05003_E011", "B05003_E020", "B05003_E022"];
    votingAgeFields: readonly ["B05003_E008", "B05003_E019"];
    scoreUse: "context_only_until_exact_house_geography_join";
  }>;
  readonly rows: readonly CountyCvapRow[];
  readonly summary: Readonly<{ counties: 3222; cvapPresent: 3222; votingAgePresent: 3222; formulaEligibleRows: 0 }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const SOURCE = {
  id: "census-acs2024-5yr-table-b05003",
  url: "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b05003.dat",
  path: "data/source/rapid/county-demographics/acsdt5y2024-b05003.dat",
  bytes: 53_827_247,
  sha256: "ba1db3b8c01591b7cfa8d971e8d6b76c8ba53c9e116aacdeb0204c6200d4b7c0",
} as const;
const DEMOGRAPHICS = {
  id: "rapid-county-demographics-projection-v1",
  path: "data/metadata/rapid-county-demographics-projection-v1.json",
  bytes: 2_441_846,
  sha256: "ebbeb1127151a78985e97a7971d580edd637f746b63b6845353c63407989c8fc",
} as const;
const FIELDS = ["B05003_E008", "B05003_E009", "B05003_E011", "B05003_E019", "B05003_E020", "B05003_E022"] as const;

function parseTable(bytes: Buffer): Map<string, Record<(typeof FIELDS)[number], number>> {
  const lines = bytes.toString("utf8").trimEnd().split(/\r?\n/);
  const headers = lines[0]!.split("|");
  const indices = Object.fromEntries(["GEO_ID", ...FIELDS].map((field) => [field, headers.indexOf(field)]));
  if (Object.values(indices).some((index) => index < 0)) throw new Error("COUNTY_CVAP_COLUMN_MISSING");
  const rows = new Map<string, Record<(typeof FIELDS)[number], number>>();
  for (const line of lines.slice(1)) {
    const cells = line.split("|");
    const geoid = cells[indices.GEO_ID!];
    if (!geoid?.startsWith("0500000US")) continue;
    const countyFips = geoid.slice(-5);
    if (!/^\d{5}$/.test(countyFips) || rows.has(countyFips)) throw new Error("COUNTY_CVAP_GEOID_INVALID");
    const values = Object.fromEntries(FIELDS.map((field) => {
      const raw = cells[indices[field]!];
      if (!raw || !/^\d+$/.test(raw)) throw new Error(`COUNTY_CVAP_ESTIMATE_INVALID:${countyFips}:${field}`);
      return [field, Number(raw)];
    })) as Record<(typeof FIELDS)[number], number>;
    rows.set(countyFips, values);
  }
  if (rows.size !== 3222) throw new Error("COUNTY_CVAP_COUNTY_CLOSURE_INVALID");
  return rows;
}

export function buildCountyCvapProjection(root = process.cwd()): CountyCvapProjection {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const sourceBytes = readFileSync(join(root, SOURCE.path));
  const demographicsBytes = readFileSync(join(root, DEMOGRAPHICS.path));
  const sourceEntry = { id: SOURCE.id, url: SOURCE.url, retainedPath: SOURCE.path, retainedStatus: "retained", byteSize: SOURCE.bytes, sha256: SOURCE.sha256, kind: "source", parentIds: [] };
  const lockMatches = lock.entries.filter((entry) => entry.id === SOURCE.id);
  if (sourceBytes.length !== SOURCE.bytes || sha(sourceBytes) !== SOURCE.sha256 || lockMatches.length !== 1 || !exact(sourceLockContent(lockMatches[0]), sourceEntry)) throw new Error("COUNTY_CVAP_SOURCE_BINDING_INVALID");
  if (demographicsBytes.length !== DEMOGRAPHICS.bytes || sha(demographicsBytes) !== DEMOGRAPHICS.sha256) throw new Error("COUNTY_CVAP_DEMOGRAPHICS_BINDING_INVALID");
  const demographics = JSON.parse(demographicsBytes.toString("utf8")) as { rows: readonly { countyFips: string; stateCode: string; countyName: string }[] };
  const values = parseTable(sourceBytes);
  const rows = demographics.rows.map((county) => {
    const row = values.get(county.countyFips);
    if (!row) throw new Error(`COUNTY_CVAP_JOIN_MISSING:${county.countyFips}`);
    const votingAgePopulation = row.B05003_E008 + row.B05003_E019;
    const citizenVotingAgePopulation = row.B05003_E009 + row.B05003_E011 + row.B05003_E020 + row.B05003_E022;
    if (citizenVotingAgePopulation > votingAgePopulation) throw new Error(`COUNTY_CVAP_ARITHMETIC_INVALID:${county.countyFips}`);
    const unsigned = { countyFips: county.countyFips, stateCode: county.stateCode, countyName: county.countyName, periodStart: "2020-01-01" as const, periodEnd: "2024-12-31" as const, citizenVotingAgePopulation, votingAgePopulation, sourceLockIds: [SOURCE.id, DEMOGRAPHICS.id] as const, formulaEligible: false as const };
    return { ...unsigned, rowSha256: hash("dsa-seats:rapid-county-cvap-row:v1", unsigned) };
  });
  if (new Set(rows.map((row) => row.countyFips)).size !== 3222 || !exact([...values.keys()].sort(byteCompare), rows.map((row) => row.countyFips).sort(byteCompare))) throw new Error("COUNTY_CVAP_UNIVERSE_MISMATCH");
  const methodology = { cvapDefinition: "native_or_naturalized_citizen_age_18_or_older" as const, cvapFields: ["B05003_E009", "B05003_E011", "B05003_E020", "B05003_E022"] as const, votingAgeFields: ["B05003_E008", "B05003_E019"] as const, scoreUse: "context_only_until_exact_house_geography_join" as const };
  const summary = { counties: 3222 as const, cvapPresent: 3222 as const, votingAgePresent: 3222 as const, formulaEligibleRows: 0 as const };
  const rowSetSha256 = hash("dsa-seats:rapid-county-cvap-row-set:v1", rows);
  const unsigned = { schema: "rapid-county-cvap-projection-v1" as const, version: 1 as const, authority: "official_census_acs_2024_5year_b05003" as const, methodology, rows, summary, rowSetSha256 };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-county-cvap-package:v1", unsigned) };
}

export function validateCountyCvapProjection(value: unknown, root = process.cwd()): CountyCvapProjection {
  const expected = buildCountyCvapProjection(root);
  if (!exact(value, expected)) throw new Error("COUNTY_CVAP_PROJECTION_INVALID");
  return value as CountyCvapProjection;
}
