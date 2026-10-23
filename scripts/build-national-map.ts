/**
 * Builds the browser map artifacts from the retained Census cartographic
 * boundary files (GENZ2025, shoreline-clipped):
 *
 *   public/map-data/national-v1.json                 states and 119th-Congress districts
 *   public/map-data/state-legislative/<st>-v1.json   upper and lower districts for one state
 *
 * Every layer is projected once with mapshaper's albersusa (Alaska and Hawaii
 * inset) and scaled to the same pixel frame, so a state view is a zoom into
 * the national frame and all layers line up. Paths are SVG path strings in
 * that frame. Puerto Rico and the other territories are left out: they elect
 * no voting House member, senator or state legislature covered by the index.
 * albersusa drops the Aleutian parts west of 180° and a few remote islets;
 * mapshaper reports them as unprojectable.
 *
 * Usage: npx tsx scripts/build-national-map.ts [--pin]
 * --pin records every written artifact in data/source-lock.json with the
 * Census sources as parents.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { derivedArtifactEntry, readSourceLock, readRetainedSource, upsertSourceLockEntry, writeSourceLock } from "@/rapid-acquisition/intake/source-lock";
import { TIGER_2025_JURISDICTIONS } from "@/ingestion/tiger/national";
import { stateLegislativeDistrictKey } from "@/lib/map-district-key";

const SOURCES = { states: "census-cb2025-states-5m", cd: "census-cb2025-cd119-500k", sldu: "census-cb2025-sldu-500k", sldl: "census-cb2025-sldl-500k" } as const;
export const MAP_WIDTH = 975;
const MAPSHAPER = join(process.cwd(), "node_modules/.bin/mapshaper");

type Ring = [number, number][];
type Feature = { properties: Record<string, string>; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Ring[] | Ring[][] } | null };

const lock = readSourceLock();
const work = mkdtempSync(join(tmpdir(), "national-map-"));

/** Projects and simplifies one retained source; returns its features in albersusa metres. */
function layer(sourceId: string, filter: string, simplify: string): Feature[] {
  const { entry, bytes } = readRetainedSource(lock, sourceId);
  const zip = join(work, `${sourceId}.zip`), out = join(work, `${sourceId}.json`);
  writeFileSync(zip, bytes);
  execFileSync(MAPSHAPER, ["-i", zip, "-filter", filter, "-proj", "albersusa", "-simplify", simplify, "keep-shapes", "-o", "format=geojson", "precision=1", out], { stdio: ["ignore", "ignore", "inherit"] });
  const features = (JSON.parse(readFileSync(out, "utf8")) as { features: Feature[] }).features.filter((feature) => feature.geometry);
  if (!features.length) throw new Error(`NATIONAL_MAP_EMPTY_LAYER:${entry.id}`);
  return features;
}

const polygons = (feature: Feature): Ring[][] => feature.geometry!.type === "Polygon" ? [feature.geometry!.coordinates as Ring[]] : feature.geometry!.coordinates as Ring[][];
const STATES_ONLY = "Number(STATEFP) < 60";
const states = layer(SOURCES.states, STATES_ONLY, "10%");

// One frame for every layer, fixed by the state outlines.
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const feature of states) for (const polygon of polygons(feature)) for (const [x, y] of polygon.flat()) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
const scale = (MAP_WIDTH - 10) / (maxX - minX);
const height = Math.ceil((maxY - minY) * scale + 10);
const px = ([x, y]: [number, number]): [number, number] => [5 + (x - minX) * scale, 5 + (maxY - y) * scale];

function draw(feature: Feature, digits: number): { path: string; bbox: [number, number, number, number] } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const path = polygons(feature).flatMap((polygon) => polygon.map((ring) => {
    let last = "";
    const points: string[] = [];
    for (const point of ring) {
      const [x, y] = px(point);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const text = `${x.toFixed(digits)} ${y.toFixed(digits)}`;
      if (text !== last) points.push(text);
      last = text;
    }
    return points.length >= 3 ? `M${points.join("L")}Z` : "";
  })).join("");
  const round = (value: number) => Number(value.toFixed(1));
  return { path, bbox: [round(x0), round(y0), round(x1), round(y1)] };
}

const byCode = <T extends { stateCode: string }>(rows: T[]): T[] => rows.sort((a, b) => a.stateCode.localeCompare(b.stateCode));
const stateRows = byCode(states.map((feature) => ({ stateCode: feature.properties.STUSPS!, name: feature.properties.NAME!, ...draw(feature, 1) })));
// DC's delegate does not vote and is not in the index; its outline stays in the state layer.
const houseRows = byCode(layer(SOURCES.cd, `${STATES_ONLY} && STATEFP !== "11"`, "8%").map((feature) => ({ stateCode: TIGER_2025_JURISDICTIONS[feature.properties.STATEFP as keyof typeof TIGER_2025_JURISDICTIONS], districtCode: feature.properties.CD119FP!, ...draw(feature, 1) })))
  .sort((a, b) => a.stateCode.localeCompare(b.stateCode) || a.districtCode.localeCompare(b.districtCode));
if (stateRows.length !== 51) throw new Error(`NATIONAL_MAP_STATE_COUNT:${stateRows.length}`);
if (houseRows.length !== 435) throw new Error(`NATIONAL_MAP_HOUSE_COUNT:${houseRows.length}`);

const written: { id: string; path: string; bytes: Buffer; parents: string[] }[] = [];
const write = (id: string, path: string, value: unknown, parents: string[]) => {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  mkdirSync(join(process.cwd(), path, ".."), { recursive: true });
  writeFileSync(join(process.cwd(), path), bytes);
  written.push({ id, path, bytes, parents });
};

write("national-map-v1", "public/map-data/national-v1.json", {
  schema: "national-map-v1",
  source: "U.S. Census Bureau cartographic boundary files, 2025 (cb_2025_us_state_5m, cb_2025_us_cd119_500k)",
  width: MAP_WIDTH, height,
  states: stateRows.map(({ stateCode, name, path, bbox }) => ({ stateCode, name, path, bbox })),
  house: houseRows.map(({ stateCode, districtCode, path }) => ({ stateCode, districtCode, path })),
}, [SOURCES.states, SOURCES.cd]);

const upper = layer(SOURCES.sldu, STATES_ONLY, "20%"), lower = layer(SOURCES.sldl, STATES_ONLY, "20%");
const nhFloterialId = "nh-house-floterial-2022-shapefile";
const nhFloterial = layer(nhFloterialId, "FloatHse22.trim() !== ''", "20%");
const nhCounties: Record<string, string> = { BE: "Belknap", CA: "Carroll", CH: "Cheshire", CO: "Coos", GR: "Grafton", HI: "Hillsborough", ME: "Merrimack", RO: "Rockingham", ST: "Strafford", SU: "Sullivan" };
for (const { stateCode } of stateRows) {
  const chamber = (features: Feature[]) => features.filter((feature) => feature.properties.STUSPS === stateCode)
    .map((feature) => ({ name: feature.properties.NAME!, key: stateLegislativeDistrictKey(stateCode, feature.properties.NAME!), path: draw(feature, 2).path }))
    .sort((a, b) => a.key.localeCompare(b.key, "en-US", { numeric: true }));
  const value = { schema: "state-legislative-map-v1", stateCode, upper: chamber(upper), lower: chamber(lower) };
  // Census puts DC council wards in the upper layer. Citywide council
  // positions use the retained DC state boundary, drawn before ward polygons.
  if (stateCode === "DC") {
    const city = stateRows.find(row => row.stateCode === "DC")!;
    value.upper = [
      { name: "At-Large", key: stateLegislativeDistrictKey("DC", "At-Large"), path: city.path },
      { name: "Chairman", key: stateLegislativeDistrictKey("DC", "Chairman"), path: city.path },
      ...value.upper.map(row => ({ ...row, name: `Ward ${row.name}`, key: stateLegislativeDistrictKey("DC", `Ward ${row.name}`) })),
    ];
    if (value.upper.length !== 10) throw new Error(`NATIONAL_MAP_DC_WARDS:${value.upper.length}`);
  }
  if (stateCode === "NH") {
    for (const feature of nhFloterial) {
      const code = feature.properties.FloatHse22!.trim(), match = code.match(/^([A-Z]{2})(\d+)$/);
      if (!match || !nhCounties[match[1]!]) throw new Error(`NATIONAL_MAP_NH_FLOTERIAL:${code}`);
      const name = `${nhCounties[match[1]!]} ${Number(match[2])}`;
      value.lower.push({ name, key: stateLegislativeDistrictKey("NH", name), path: draw(feature, 2).path });
    }
    if (new Set(value.lower.map(row => row.key)).size !== value.lower.length) throw new Error("NATIONAL_MAP_NH_DUPLICATE");
  }
  if (!value.upper.length && !value.lower.length) continue;
  write(`state-legislative-map-${stateCode.toLowerCase()}-v1`, `public/map-data/state-legislative/${stateCode.toLowerCase()}-v1.json`, value, stateCode === "DC" ? [SOURCES.sldu, SOURCES.states] : stateCode === "NH" ? [SOURCES.sldu, SOURCES.sldl, nhFloterialId] : [SOURCES.sldu, SOURCES.sldl]);
}
rmSync(work, { recursive: true, force: true });

for (const artifact of written) console.log(`${artifact.path} ${artifact.bytes.length} bytes sha256 ${createHash("sha256").update(artifact.bytes).digest("hex").slice(0, 12)}`);
if (process.argv.includes("--pin")) {
  let next = readSourceLock();
  for (const artifact of written) next = upsertSourceLockEntry(next, derivedArtifactEntry({ id: artifact.id, url: `urn:dsa-seats:${artifact.id.replace(/-v1$/, ":v1")}`, retainedPath: artifact.path, bytes: artifact.bytes, kind: "derived_map", parentIds: artifact.parents }));
  writeSourceLock(next);
  console.log(`pinned ${written.length} map artifacts`);
}
