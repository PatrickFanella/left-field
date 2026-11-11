import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { byteCompare, canonical, hash, sha } from "./shared";

const COMMIT = "df531089c78e6d0098db1a6bfb3849a066a06995";
const STATES = "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" ");
const OUTPUT = { id: "rapid-county-house-results-projection-v1", path: "data/metadata/rapid-county-house-results-projection-v1.json", url: "urn:dsa-seats:rapid-county-house-results-projection:v1:2024" } as const;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort(byteCompare).join("\0") === [...keys].sort(byteCompare).join("\0");
const hex = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export interface CountyHouseResultsProjection {
  readonly schema: "rapid-county-house-results-projection-v1";
  readonly version: 1;
  readonly sourceCommit: string;
  readonly archiveCoverage: readonly Readonly<Record<string, unknown>>[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly rowSetSha256: string;
  readonly sourceSetSha256: string;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly packageSha256: string;
}

export function validateCountyHouseResultsProjection(value: unknown, root = process.cwd()): CountyHouseResultsProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("COUNTY_HOUSE_PROJECTION_INVALID");
  const projection = value as Record<string, unknown>;
  if (!exactKeys(projection, ["schema", "version", "sourceCommit", "archiveCoverage", "rows", "rowSetSha256", "sourceSetSha256", "summary", "packageSha256"]) || projection.schema !== "rapid-county-house-results-projection-v1" || projection.version !== 1 || projection.sourceCommit !== COMMIT || !Array.isArray(projection.archiveCoverage) || !Array.isArray(projection.rows) || !projection.summary || typeof projection.summary !== "object" || Array.isArray(projection.summary)) throw new Error("COUNTY_HOUSE_PROJECTION_SHAPE_INVALID");
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const coverage = projection.archiveCoverage as Record<string, unknown>[];
  if (coverage.length !== 51 || coverage.map((row) => row.stateCode).join("\0") !== STATES.join("\0")) throw new Error("COUNTY_HOUSE_ARCHIVE_CLOSURE_INVALID");
  for (const row of coverage) {
    if (!exactKeys(row, ["stateCode", "sourceLockId", "strictTotalRows", "coverageStatus"]) || !STATES.includes(row.stateCode as string) || row.sourceLockId !== `medsl-2024-house-state-${String(row.stateCode).toLowerCase()}` || !Number.isSafeInteger(row.strictTotalRows) || (row.strictTotalRows as number) < 0 || row.coverageStatus !== ((row.strictTotalRows as number) > 0 ? "strict_total_rows_retained" : "no_strict_total_rows")) throw new Error("COUNTY_HOUSE_ARCHIVE_ROW_INVALID");
    const state = String(row.stateCode).toLowerCase(), path = `data/source/rapid/county-house-results/2024/${state}24.zip`, bytes = readFileSync(join(root, path));
    const expected = { id: row.sourceLockId, url: `https://raw.githubusercontent.com/MEDSL/2024-elections-official/${COMMIT}/individual_states/${state}24.zip`, retainedPath: path, retainedStatus: "retained", byteSize: bytes.length, sha256: sha(bytes), kind: "source", parentIds: [] };
    const matches = lock.entries.filter((entry) => entry.id === row.sourceLockId);
    if (matches.length !== 1 || canonical(sourceLockContent(matches[0])) !== canonical(expected)) throw new Error("COUNTY_HOUSE_ARCHIVE_SOURCE_INVALID");
  }
  const rows = projection.rows as Record<string, unknown>[], rowKeys = ["countyFips", "stateCode", "countyName", "cycleYear", "office", "districtRaw", "candidateName", "candidateParty", "candidatePartyDetailed", "specialElection", "writeIn", "votes", "suppressedSourceRows", "sourceRowCount", "sourceRowSetSha256", "sourceLockId", "authority", "winnerIdentity", "formulaEligible", "rowSha256"];
  const natural = new Set<string>(); let retainedSourceRows = 0, suppressedSourceRows = 0, blankDistrictSourceRows = 0;
  for (const row of rows) {
    if (!exactKeys(row, rowKeys) || typeof row.countyFips !== "string" || !/^\d{5}$/.test(row.countyFips) || typeof row.stateCode !== "string" || !STATES.includes(row.stateCode) || typeof row.countyName !== "string" || !row.countyName || row.cycleYear !== 2024 || row.office !== "US HOUSE" || !(row.districtRaw === null || typeof row.districtRaw === "string") || typeof row.candidateName !== "string" || !row.candidateName || typeof row.candidateParty !== "string" || typeof row.candidatePartyDetailed !== "string" || typeof row.specialElection !== "boolean" || typeof row.writeIn !== "boolean" || !Number.isSafeInteger(row.suppressedSourceRows) || (row.suppressedSourceRows as number) < 0 || !Number.isSafeInteger(row.sourceRowCount) || (row.sourceRowCount as number) < 1 || (row.suppressedSourceRows as number) > (row.sourceRowCount as number) || !hex(row.sourceRowSetSha256) || row.sourceLockId !== `medsl-2024-house-state-${row.stateCode.toLowerCase()}` || row.authority !== "research_fallback" || row.winnerIdentity !== null || row.formulaEligible !== false) throw new Error("COUNTY_HOUSE_ROW_INVALID");
    if ((row.suppressedSourceRows as number) > 0 ? row.votes !== null : !Number.isSafeInteger(row.votes) || (row.votes as number) < 0) throw new Error("COUNTY_HOUSE_VOTE_BOUNDARY_INVALID");
    const { rowSha256, ...unsigned } = row;
    if (!hex(rowSha256) || rowSha256 !== hash("dsa-seats:rapid-county-house-results-row:v1", unsigned)) throw new Error("COUNTY_HOUSE_ROW_HASH_INVALID");
    const key = [row.countyFips, row.stateCode, row.districtRaw ?? "", row.candidateName, row.candidateParty, row.candidatePartyDetailed, row.specialElection, row.writeIn, row.sourceLockId].join("\0");
    if (natural.has(key)) throw new Error("COUNTY_HOUSE_ROW_DUPLICATE"); natural.add(key);
    retainedSourceRows += row.sourceRowCount as number; suppressedSourceRows += row.suppressedSourceRows as number; blankDistrictSourceRows += row.districtRaw === null ? row.sourceRowCount as number : 0;
  }
  const expectedOrder = [...rows].sort((left, right) => byteCompare(left.stateCode as string, right.stateCode as string) || byteCompare(left.countyFips as string, right.countyFips as string) || byteCompare((left.districtRaw as string | null) ?? "", (right.districtRaw as string | null) ?? "") || byteCompare(left.candidateName as string, right.candidateName as string) || byteCompare(left.candidatePartyDetailed as string, right.candidatePartyDetailed as string));
  if (canonical(rows) !== canonical(expectedOrder) || projection.rowSetSha256 !== hash("dsa-seats:rapid-county-house-results-row-set:v1", rows) || projection.sourceSetSha256 !== hash("dsa-seats:rapid-county-house-results-source-set:v1", coverage)) throw new Error("COUNTY_HOUSE_SET_INVALID");
  const summary = projection.summary as Record<string, unknown>, expectedSummary = { archives: 51, archivesWithStrictTotalRows: 41, archivesWithoutStrictTotalRows: 10, selectedSourceRows: 871108, retainedSourceRows: 866655, aggregateRows: 13076, exactCountyCount: 2609, stateCount: 40, suppressedSourceRows: 9863, integralDecimalRows: 14322, blankDistrictSourceRows: 4092, quarantined: { geographyVintageMismatch: 3929, countyNameFipsConflict: 504, nonCountyFips: 16, negativeVoteSentinel: 4 }, formulaEligibleRows: 0, incompleteNationwideCoverage: true };
  const quarantine = expectedSummary.quarantined;
  if (canonical(summary) !== canonical(expectedSummary) || retainedSourceRows !== expectedSummary.retainedSourceRows || suppressedSourceRows !== expectedSummary.suppressedSourceRows || blankDistrictSourceRows !== expectedSummary.blankDistrictSourceRows || coverage.reduce((sum, row) => sum + (row.strictTotalRows as number), 0) !== expectedSummary.selectedSourceRows || expectedSummary.retainedSourceRows + Object.values(quarantine).reduce((sum, count) => sum + count, 0) !== expectedSummary.selectedSourceRows) throw new Error("COUNTY_HOUSE_SUMMARY_INVALID");
  const { packageSha256, ...unsigned } = projection;
  if (!hex(packageSha256) || packageSha256 !== hash("dsa-seats:rapid-county-house-results-package:v1", unsigned)) throw new Error("COUNTY_HOUSE_PACKAGE_INVALID");
  const outputBytes = readFileSync(join(root, OUTPUT.path)), output = lock.entries.filter((entry) => entry.id === OUTPUT.id);
  if (output.length === 1) {
    const expectedParents = [...coverage.map((row) => row.sourceLockId as string), "rapid-county-demographics-projection-v1"];
    const expectedOutput = { id: OUTPUT.id, url: OUTPUT.url, retainedPath: OUTPUT.path, retainedStatus: "retained", byteSize: outputBytes.length, sha256: sha(outputBytes), kind: "derived_artifact", parentIds: expectedParents };
    if (canonical(sourceLockContent(output[0])) !== canonical(expectedOutput)) throw new Error("COUNTY_HOUSE_OUTPUT_LOCK_INVALID");
  } else if (output.length !== 0) throw new Error("COUNTY_HOUSE_OUTPUT_LOCK_INVALID");
  return value as CountyHouseResultsProjection;
}
