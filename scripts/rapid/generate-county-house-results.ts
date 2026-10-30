import { sourceLockContent } from "../../src/rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const COMMIT = "df531089c78e6d0098db1a6bfb3849a066a06995";
const STATES = "ak al ar az ca co ct dc de fl ga hi ia id il in ks ky la ma md me mi mn mo ms mt nc nd ne nh nj nm nv ny oh ok or pa ri sc sd tn tx ut va vt wa wi wv wy".split(" ");
const OUTPUT = "data/metadata/rapid-county-house-results-projection-v1.json";
const byteCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(byteCompare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const countyNameKey = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+(?:county|parish|borough|census area)$/i, "").replace(/[^a-z0-9]/g, "");
const COUNTY_NAME_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = { "28065": { jeffdavis: "jeffersondavis" } };
const countyNameMatches = (source: string, census: string, fips: string) => (COUNTY_NAME_ALIASES[fips]?.[countyNameKey(source)] ?? countyNameKey(source)) === countyNameKey(census) || (census.toLowerCase().endsWith(" city") && countyNameKey(source) === countyNameKey(census.slice(0, -5)));

function csvLine(line: string): string[] {
  const fields: string[] = []; let field = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (quoted) { if (character === '"' && line[index + 1] === '"') { field += '"'; index++; } else if (character === '"') quoted = false; else field += character; }
    else if (character === '"' && field === "") quoted = true;
    else if (character === ",") { fields.push(field); field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("COUNTY_HOUSE_CSV_QUOTE_INVALID");
  fields.push(field.replace(/\r$/, ""));
  return fields;
}
function sourceRows(path: string): AsyncIterable<string> {
  const child = spawn("unzip", ["-p", path], { stdio: ["ignore", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  return (async function* () {
    for await (const line of lines) yield line;
    const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (code !== 0) throw new Error(`COUNTY_HOUSE_UNZIP_FAILED:${path}`);
  })();
}

type Group = { countyFips: string; stateCode: string; countyName: string; districtRaw: string | null; candidateName: string; candidateParty: string; candidatePartyDetailed: string; specialElection: boolean; writeIn: boolean; votes: number; suppressedSourceRows: number; sourceRowCount: number; sourceHasher: ReturnType<typeof createHash>; sourceLockId: string };

async function main() {
  const root = process.cwd();
  const lock = JSON.parse(await readFile(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const demographics = JSON.parse(await readFile(join(root, "data/metadata/rapid-county-demographics-projection-v1.json"), "utf8")) as { rows: readonly { countyFips: string; stateCode: string; countyName: string }[] };
  const counties = new Map(demographics.rows.map((row) => [row.countyFips, row]));
  const groups = new Map<string, Group>(), archiveCoverage: { stateCode: string; sourceLockId: string; strictTotalRows: number; coverageStatus: "strict_total_rows_retained" | "no_strict_total_rows" }[] = [];
  const quarantined = { geographyVintageMismatch: 0, countyNameFipsConflict: 0, nonCountyFips: 0, negativeVoteSentinel: 0 };
  let selectedSourceRows = 0, retainedSourceRows = 0, suppressedSourceRows = 0, integralDecimalRows = 0, blankDistrictSourceRows = 0;
  for (const state of STATES) {
    const sourceLockId = `medsl-2024-house-state-${state}`, path = `data/source/rapid/county-house-results/2024/${state}24.zip`;
    const bytes = await readFile(join(root, path)), entry = lock.entries.find((item) => item.id === sourceLockId);
    const expected = { id: sourceLockId, url: `https://raw.githubusercontent.com/MEDSL/2024-elections-official/${COMMIT}/individual_states/${state}24.zip`, retainedPath: path, retainedStatus: "retained", byteSize: bytes.length, sha256: sha(bytes), kind: "source", parentIds: [] };
    if (!entry || canonical(sourceLockContent(entry)) !== canonical(expected)) throw new Error(`COUNTY_HOUSE_SOURCE_BINDING_INVALID:${state}`);
    let header: string[] | null = null, rowNumber = 0, strictTotalRows = 0;
    for await (const line of sourceRows(join(root, path))) {
      rowNumber++;
      if (rowNumber === 1) { header = csvLine(line); continue; }
      if (!line) continue;
      const values = csvLine(line);
      if (!header || values.length !== header.length) throw new Error(`COUNTY_HOUSE_ROW_WIDTH_INVALID:${state}:${rowNumber}`);
      const at = (name: string) => values[header!.indexOf(name)]!;
      if (at("year") !== "2024" || at("office").toUpperCase() !== "US HOUSE" || at("stage") !== "GEN" || at("mode") !== "TOTAL") continue;
      strictTotalRows++; selectedSourceRows++;
      const countyFips = at("county_fips"), census = counties.get(countyFips);
      if (!/^\d{5}$/.test(countyFips)) { quarantined.nonCountyFips++; continue; }
      if (!census) { quarantined.geographyVintageMismatch++; continue; }
      if (census.stateCode !== at("state_po") || !countyNameMatches(at("county_name"), census.countyName, countyFips)) { quarantined.countyNameFipsConflict++; continue; }
      const rawVotes = at("votes");
      if (/^-(?:1|2|9)(?:\.0)?$/.test(rawVotes)) { quarantined.negativeVoteSentinel++; continue; }
      const suppressed = rawVotes === "*";
      if (!suppressed && !/^\d+(?:\.0)?$/.test(rawVotes)) throw new Error(`COUNTY_HOUSE_VOTE_INVALID:${state}:${rowNumber}`);
      if (!suppressed && rawVotes.endsWith(".0")) integralDecimalRows++;
      if (suppressed) suppressedSourceRows++;
      const districtRaw = at("district") || null;
      if (districtRaw === null) blankDistrictSourceRows++;
      const special = at("special") === "TRUE", writeIn = at("writein") === "TRUE";
      if (!special && at("special") !== "FALSE" || !writeIn && at("writein") !== "FALSE") throw new Error(`COUNTY_HOUSE_BOOLEAN_INVALID:${state}:${rowNumber}`);
      const identity = [countyFips, at("state_po"), at("county_name"), districtRaw ?? "", at("candidate"), at("party_simplified"), at("party_detailed"), special, writeIn, sourceLockId];
      const key = identity.join("\0");
      const group = groups.get(key) ?? { countyFips, stateCode: at("state_po"), countyName: at("county_name"), districtRaw, candidateName: at("candidate"), candidateParty: at("party_simplified"), candidatePartyDetailed: at("party_detailed"), specialElection: special, writeIn, votes: 0, suppressedSourceRows: 0, sourceRowCount: 0, sourceHasher: createHash("sha256"), sourceLockId };
      group.sourceRowCount++; group.suppressedSourceRows += suppressed ? 1 : 0; group.votes += suppressed ? 0 : Number(rawVotes); group.sourceHasher.update(`${rowNumber}\0${line}\n`); groups.set(key, group); retainedSourceRows++;
    }
    archiveCoverage.push({ stateCode: state.toUpperCase(), sourceLockId, strictTotalRows, coverageStatus: strictTotalRows ? "strict_total_rows_retained" : "no_strict_total_rows" });
  }
  const rows = [...groups.values()].map((group) => {
    const unsigned = { countyFips: group.countyFips, stateCode: group.stateCode, countyName: group.countyName, cycleYear: 2024 as const, office: "US HOUSE" as const, districtRaw: group.districtRaw, candidateName: group.candidateName, candidateParty: group.candidateParty, candidatePartyDetailed: group.candidatePartyDetailed, specialElection: group.specialElection, writeIn: group.writeIn, votes: group.suppressedSourceRows ? null : group.votes, suppressedSourceRows: group.suppressedSourceRows, sourceRowCount: group.sourceRowCount, sourceRowSetSha256: group.sourceHasher.digest("hex"), sourceLockId: group.sourceLockId, authority: "research_fallback" as const, winnerIdentity: null, formulaEligible: false as const };
    return { ...unsigned, rowSha256: hash("dsa-seats:rapid-county-house-results-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.stateCode, right.stateCode) || byteCompare(left.countyFips, right.countyFips) || byteCompare(left.districtRaw ?? "", right.districtRaw ?? "") || byteCompare(left.candidateName, right.candidateName) || byteCompare(left.candidatePartyDetailed, right.candidatePartyDetailed));
  archiveCoverage.sort((left, right) => byteCompare(left.stateCode, right.stateCode));
  const summary = { archives: 51, archivesWithStrictTotalRows: archiveCoverage.filter((row) => row.strictTotalRows > 0).length, archivesWithoutStrictTotalRows: archiveCoverage.filter((row) => row.strictTotalRows === 0).length, selectedSourceRows, retainedSourceRows, aggregateRows: rows.length, exactCountyCount: new Set(rows.map((row) => row.countyFips)).size, stateCount: new Set(rows.map((row) => row.stateCode)).size, suppressedSourceRows, integralDecimalRows, blankDistrictSourceRows, quarantined, formulaEligibleRows: 0, incompleteNationwideCoverage: true };
  const rowSetSha256 = hash("dsa-seats:rapid-county-house-results-row-set:v1", rows), sourceSetSha256 = hash("dsa-seats:rapid-county-house-results-source-set:v1", archiveCoverage);
  const unsigned = { schema: "rapid-county-house-results-projection-v1" as const, version: 1 as const, sourceCommit: COMMIT, archiveCoverage, rows, rowSetSha256, sourceSetSha256, summary };
  const output = { ...unsigned, packageSha256: hash("dsa-seats:rapid-county-house-results-package:v1", unsigned) };
  const outputBytes = Buffer.from(`${JSON.stringify(output)}\n`);
  try { await writeFile(join(root, OUTPUT), outputBytes, { flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !(await readFile(join(root, OUTPUT))).equals(outputBytes)) throw error; }
  process.stdout.write(`${JSON.stringify({ output: OUTPUT, byteSize: outputBytes.length, sha256: sha(outputBytes), summary })}\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : "COUNTY_HOUSE_RESULTS_GENERATION_FAILED"}\n`); process.exitCode = 1; });
