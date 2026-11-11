import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";
import { byteCompare, hash, sha, exact } from "./shared";

export interface AtLargeCd119CountyUniverseRow {
  readonly stateCode: "AK" | "DE" | "ND" | "SD" | "VT" | "WY";
  readonly stateFips: "02" | "10" | "38" | "46" | "50" | "56";
  readonly districtCode: "00";
  readonly cd119Geoid: string;
  readonly countyFips: readonly string[];
  readonly countyCount: number;
  readonly censusBlockCount: number;
  readonly exactCountyUniverseMatch: true;
  readonly sourceLockIds: readonly ["census-cd119-block-equivalency-bundle-20260805", "rapid-county-demographics-projection-v1"];
  readonly rowSha256: string;
}

export interface AtLargeCd119CountyUniverseProjection {
  readonly schema: "rapid-at-large-cd119-county-universe-v1";
  readonly version: 1;
  readonly methodology: Readonly<{ sourceMember: "NationalCD119.txt"; countyKey: "first_five_digits_of_2020_tabulation_block_geoid"; eligibilityRule: "every_state_block_assigned_to_cd119_00_and_exact_gazetteer_county_set_equality" }>;
  readonly rows: readonly AtLargeCd119CountyUniverseRow[];
  readonly summary: Readonly<{ atLargeStates: 6; exactCountyUniverses: 6; counties: 189; incompatibleRows: 0 }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const BUNDLE = { id: "census-cd119-block-equivalency-bundle-20260805", url: "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2025/119-congressional-district-befs/cd119.zip", path: "data/source/elections/primary-results/geography/north-carolina/current/census-cd119-block-equivalency-bundle.zip", bytes: 22959130, sha256: "1433feb5178dc7b4188ee30f5f7f715851f4400740b8fe1ce606a876c6294bd6" } as const;
const DEMOGRAPHICS = { id: "rapid-county-demographics-projection-v1", path: "data/metadata/rapid-county-demographics-projection-v1.json", bytes: 2441846, sha256: "ebbeb1127151a78985e97a7971d580edd637f746b63b6845353c63407989c8fc" } as const;
const STATES = [["AK", "02", 30], ["DE", "10", 3], ["ND", "38", 53], ["SD", "46", 66], ["VT", "50", 14], ["WY", "56", 23]] as const;

export function buildAtLargeCd119CountyUniverse(root = process.cwd()): AtLargeCd119CountyUniverseProjection {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const bundle = readFileSync(join(root, BUNDLE.path)), demographicsBytes = readFileSync(join(root, DEMOGRAPHICS.path));
  const expected = { id: BUNDLE.id, url: BUNDLE.url, retainedPath: BUNDLE.path, retainedStatus: "retained", byteSize: BUNDLE.bytes, sha256: BUNDLE.sha256, kind: "source", parentIds: [] };
  const matches = lock.entries.filter((entry) => entry.id === BUNDLE.id);
  if (bundle.length !== BUNDLE.bytes || sha(bundle) !== BUNDLE.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected) || demographicsBytes.length !== DEMOGRAPHICS.bytes || sha(demographicsBytes) !== DEMOGRAPHICS.sha256) throw new Error("AT_LARGE_CD119_SOURCE_INVALID");
  const member = unzipSync(bundle)["NationalCD119.txt"];
  if (!member) throw new Error("AT_LARGE_CD119_MEMBER_MISSING");
  const relevant = new Map<string, { counties: Set<string>; blocks: number }>(STATES.map(([, fips]) => [fips, { counties: new Set<string>(), blocks: 0 }]));
  const lines = new TextDecoder().decode(member).trimEnd().split(/\r?\n/);
  if (lines[0] !== "GEOID,CDFP") throw new Error("AT_LARGE_CD119_HEADER_INVALID");
  for (const line of lines.slice(1)) {
    const [geoid, district, extra] = line.split(",");
    if (extra !== undefined || !/^\d{15}$/.test(geoid ?? "") || !/^[0-9A-Z]{2}$/.test(district ?? "")) throw new Error("AT_LARGE_CD119_ROW_INVALID");
    const state = relevant.get(geoid!.slice(0, 2));
    if (!state) continue;
    if (district !== "00") throw new Error(`AT_LARGE_CD119_NON_AT_LARGE_ASSIGNMENT:${geoid}`);
    state.counties.add(geoid!.slice(0, 5)); state.blocks++;
  }
  const demographics = JSON.parse(demographicsBytes.toString("utf8")) as { rows: readonly { stateCode: string; countyFips: string }[] };
  const rows = STATES.map(([stateCode, stateFips, expectedCount]) => {
    const source = relevant.get(stateFips)!, countyFips = [...source.counties].sort(byteCompare), expectedCounties = demographics.rows.filter((row) => row.stateCode === stateCode).map((row) => row.countyFips).sort(byteCompare);
    if (source.blocks === 0 || countyFips.length !== expectedCount || !exact(countyFips, expectedCounties)) throw new Error(`AT_LARGE_CD119_COUNTY_UNIVERSE_INVALID:${stateCode}`);
    const unsigned = { stateCode, stateFips, districtCode: "00" as const, cd119Geoid: `${stateFips}00`, countyFips, countyCount: countyFips.length, censusBlockCount: source.blocks, exactCountyUniverseMatch: true as const, sourceLockIds: [BUNDLE.id, DEMOGRAPHICS.id] as const };
    return { ...unsigned, rowSha256: hash("dsa-seats:rapid-at-large-cd119-county-universe-row:v1", unsigned) };
  });
  const methodology = { sourceMember: "NationalCD119.txt" as const, countyKey: "first_five_digits_of_2020_tabulation_block_geoid" as const, eligibilityRule: "every_state_block_assigned_to_cd119_00_and_exact_gazetteer_county_set_equality" as const };
  const summary = { atLargeStates: 6 as const, exactCountyUniverses: 6 as const, counties: 189 as const, incompatibleRows: 0 as const };
  const rowSetSha256 = hash("dsa-seats:rapid-at-large-cd119-county-universe-row-set:v1", rows), unsigned = { schema: "rapid-at-large-cd119-county-universe-v1" as const, version: 1 as const, methodology, rows, summary, rowSetSha256 };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-at-large-cd119-county-universe-package:v1", unsigned) };
}

export function validateAtLargeCd119CountyUniverse(value: unknown, root = process.cwd()): AtLargeCd119CountyUniverseProjection {
  const expected = buildAtLargeCd119CountyUniverse(root);
  if (!exact(value, expected)) throw new Error("AT_LARGE_CD119_PROJECTION_INVALID");
  return value as AtLargeCd119CountyUniverseProjection;
}
