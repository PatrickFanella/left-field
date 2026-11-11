import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";
import { byteCompare, hash, sha, exact } from "./shared";

export interface CountyDemographicRow {
  readonly countyFips: string;
  readonly stateCode: string;
  readonly countyName: string;
  readonly periodStart: "2020-01-01";
  readonly periodEnd: "2024-12-31";
  readonly population: number;
  readonly medianHouseholdIncome: number | null;
  readonly renterShare: number | null;
  readonly age18To34Share: number | null;
  readonly populationDensityPerSquareMile: number;
  readonly sourceLockIds: readonly string[];
  readonly formulaEligible: false;
  readonly rowSha256: string;
}
export interface CountyDemographicsProjection {
  readonly schema: "rapid-county-demographics-projection-v1";
  readonly version: 1;
  readonly authority: "official_census_acs_2024_5year_and_gazetteer";
  readonly rows: readonly CountyDemographicRow[];
  readonly rowSetSha256: string;
  readonly summary: Readonly<{ counties: 3222; populationPresent: 3222; medianIncomeMissing: number; renterShareMissing: number; ageShareMissing: number; densityPresent: 3222; formulaEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { id: "census-acs2024-5yr-table-b01001", url: "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b01001.dat", path: "data/source/rapid/county-demographics/acsdt5y2024-b01001.dat", bytes: 200356282, sha256: "1637b18a96881b81e050df1cd3d5ac38a33208b9b69b40e1dbeb3c4e13718f0e" },
  { id: "census-acs2024-5yr-table-b01003", url: "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b01003.dat", path: "data/source/rapid/county-demographics/acsdt5y2024-b01003.dat", bytes: 18313708, sha256: "38d1a992bb058d184009b10b9b34987279aee575e4323165cfb5706c69b6ca90" },
  { id: "census-acs2024-5yr-table-b19013", url: "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b19013.dat", path: "data/source/rapid/county-demographics/acsdt5y2024-b19013.dat", bytes: 17917916, sha256: "b25a176b0e6c339b6f3a2a0d3d8446bf06f5f080b4395993ec9a8313efb1c229" },
  { id: "census-acs2024-5yr-table-b25003", url: "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25003.dat", path: "data/source/rapid/county-demographics/acsdt5y2024-b25003.dat", bytes: 26901770, sha256: "68e963e1ed60fcf6b0658579cefc6498b7a9eb780b9f3e87fd1b9775c4d4ac6c" },
  { id: "census-2024-gazetteer-counties-national", url: "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip", path: "data/source/rapid/county-demographics/2024_Gaz_counties_national.zip", bytes: 141679, sha256: "3c337402b5c6e8d5aa26b4278ccf4edc8989f2683765b3ffbf22296cdb2df3a0" },
] as const;
const ALL_SOURCE_IDS = SOURCES.map((source) => source.id);

function table(bytes: Buffer, required: readonly string[]) {
  const lines = bytes.toString("utf8").trimEnd().split(/\r?\n/), headers = lines[0]!.split("|");
  for (const field of ["GEO_ID", ...required]) if (!headers.includes(field)) throw new Error(`COUNTY_DEMOGRAPHICS_COLUMN_MISSING:${field}`);
  const indices = Object.fromEntries(["GEO_ID", ...required].map((field) => [field, headers.indexOf(field)]));
  const rows = new Map<string, Record<string, string>>();
  for (const line of lines.slice(1)) {
    const cells = line.split("|"), geoid = cells[indices.GEO_ID!];
    if (!geoid?.startsWith("0500000US")) continue;
    const fips = geoid.slice(-5); if (!/^\d{5}$/.test(fips) || rows.has(fips)) throw new Error("COUNTY_DEMOGRAPHICS_GEOID_INVALID");
    rows.set(fips, Object.fromEntries(required.map((field) => [field, cells[indices[field]!] ?? ""])));
  }
  if (rows.size !== 3222) throw new Error("COUNTY_DEMOGRAPHICS_COUNTY_CLOSURE_INVALID");
  return rows;
}
function estimate(value: string | undefined): number | null { if (value === undefined || value === "" || !/^-?\d+$/.test(value)) throw new Error("COUNTY_DEMOGRAPHICS_ESTIMATE_INVALID"); const parsed = Number(value); return parsed < 0 ? null : parsed; }

export function buildCountyDemographicsProjection(root = process.cwd()): CountyDemographicsProjection {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, bytes = new Map<string, Buffer>();
  for (const source of SOURCES) {
    const value = readFileSync(join(root, source.path)); bytes.set(source.id, value);
    const expected = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] };
    const matches = lock.entries.filter((entry) => entry.id === source.id);
    if (value.length !== source.bytes || sha(value) !== source.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) throw new Error(`COUNTY_DEMOGRAPHICS_SOURCE_BINDING_INVALID:${source.id}`);
  }
  const ages = ["B01001_E001", "B01001_E007", "B01001_E008", "B01001_E009", "B01001_E010", "B01001_E011", "B01001_E012", "B01001_E031", "B01001_E032", "B01001_E033", "B01001_E034", "B01001_E035", "B01001_E036"];
  const age = table(bytes.get(SOURCES[0].id)!, ages), population = table(bytes.get(SOURCES[1].id)!, ["B01003_E001"]), income = table(bytes.get(SOURCES[2].id)!, ["B19013_E001"]), housing = table(bytes.get(SOURCES[3].id)!, ["B25003_E001", "B25003_E003"]);
  const archive = unzipSync(bytes.get(SOURCES[4].id)!); if (Object.keys(archive).length !== 1 || !archive["2024_Gaz_counties_national.txt"]) throw new Error("COUNTY_DEMOGRAPHICS_GAZETTEER_ARCHIVE_INVALID");
  const gazetteer = new Map<string, { stateCode: string; countyName: string; landSquareMiles: number }>();
  for (const line of new TextDecoder().decode(archive["2024_Gaz_counties_national.txt"]).trimEnd().split(/\r?\n/).slice(1)) {
    const cells = line.split("\t").map((cell) => cell.trim()), [stateCode, fips, , countyName, , , landSquareMiles] = cells, land = Number(landSquareMiles);
    if (!/^[A-Z]{2}$/.test(stateCode!) || !/^\d{5}$/.test(fips!) || !countyName || !(land > 0) || gazetteer.has(fips!)) throw new Error("COUNTY_DEMOGRAPHICS_GAZETTEER_ROW_INVALID");
    gazetteer.set(fips!, { stateCode: stateCode!, countyName, landSquareMiles: land });
  }
  if (gazetteer.size !== 3222 || !exact([...age.keys()].sort(byteCompare), [...population.keys()].sort(byteCompare)) || !exact([...age.keys()].sort(byteCompare), [...income.keys()].sort(byteCompare)) || !exact([...age.keys()].sort(byteCompare), [...housing.keys()].sort(byteCompare)) || !exact([...age.keys()].sort(byteCompare), [...gazetteer.keys()].sort(byteCompare))) throw new Error("COUNTY_DEMOGRAPHICS_UNIVERSE_MISMATCH");
  const rows = [...age.keys()].sort(byteCompare).map((countyFips) => {
    const ageValues = age.get(countyFips)!, pop = estimate(population.get(countyFips)!.B01003_E001), agePop = estimate(ageValues.B01001_E001), medianHouseholdIncome = estimate(income.get(countyFips)!.B19013_E001), occupied = estimate(housing.get(countyFips)!.B25003_E001), renters = estimate(housing.get(countyFips)!.B25003_E003), geo = gazetteer.get(countyFips)!;
    if (pop === null || agePop !== pop) throw new Error("COUNTY_DEMOGRAPHICS_POPULATION_MISMATCH");
    const ageParts = ages.slice(1).map((field) => estimate(ageValues[field]));
    const age18To34Share = ageParts.some((value) => value === null) || pop === 0 ? null : ageParts.reduce<number>((sum, value) => sum + value!, 0) / pop;
    const renterShare = occupied === null || renters === null || occupied === 0 ? null : renters / occupied;
    const unsigned = { countyFips, stateCode: geo.stateCode, countyName: geo.countyName, periodStart: "2020-01-01" as const, periodEnd: "2024-12-31" as const, population: pop, medianHouseholdIncome, renterShare, age18To34Share, populationDensityPerSquareMile: pop / geo.landSquareMiles, sourceLockIds: ALL_SOURCE_IDS, formulaEligible: false as const };
    return { ...unsigned, rowSha256: hash("dsa-seats:rapid-county-demographics-row:v1", unsigned) };
  });
  const summary = { counties: 3222 as const, populationPresent: 3222 as const, medianIncomeMissing: rows.filter((row) => row.medianHouseholdIncome === null).length, renterShareMissing: rows.filter((row) => row.renterShare === null).length, ageShareMissing: rows.filter((row) => row.age18To34Share === null).length, densityPresent: 3222 as const, formulaEligibleRows: 0 as const };
  const rowSetSha256 = hash("dsa-seats:rapid-county-demographics-row-set:v1", rows), unsigned = { schema: "rapid-county-demographics-projection-v1" as const, version: 1 as const, authority: "official_census_acs_2024_5year_and_gazetteer" as const, rows, rowSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-county-demographics-package:v1", unsigned) };
}
export function validateCountyDemographicsProjection(value: unknown, root = process.cwd()): CountyDemographicsProjection { const expected = buildCountyDemographicsProjection(root); if (!exact(value, expected)) throw new Error("COUNTY_DEMOGRAPHICS_PROJECTION_INVALID"); return value as CountyDemographicsProjection; }
