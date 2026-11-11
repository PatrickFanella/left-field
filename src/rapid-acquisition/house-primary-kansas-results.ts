import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { hash, exact } from "./shared";

type Cells = Map<string, string>;
export interface KansasPrimaryResult {
  readonly resultId: string;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: string;
  readonly districtLabel: "KS-03";
  readonly sourceLockId: string;
  readonly rawParty: "Democratic";
  readonly sourceCandidateName: "Davids, Sharice";
  readonly candidateVotes: number;
  readonly segmentVotes: Readonly<{ statewideMasterExcludingSpecialCountySheets: number; johnsonCounty: number; wyandotteCounty: number }>;
  readonly masterPrecinctRows: number;
  readonly redactedTargetPrecinctCells: number;
  readonly resultAuthorityStatus: "official_precinct_workbook_retained_not_claimed_certified";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}
export interface KansasPrimaryResults {
  readonly schema: "rapid-house-primary-kansas-results-v1";
  readonly version: 1;
  readonly results: readonly KansasPrimaryResult[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ observations: 2; candidateRows: 2; candidateVotes: 141782; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textNodes = (value: string) => [...value.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decode(match[1]!)).join("");
const file = (files: Record<string, Uint8Array>, path: string) => { const value = files[path]; if (!value) throw new Error(`KANSAS_XLSX_MEMBER_MISSING:${path}`); return Buffer.from(value).toString("utf8"); };
const column = (number: number) => { let value = ""; for (let current = number; current > 0;) { current--; value = String.fromCharCode(65 + current % 26) + value; current = Math.floor(current / 26); } return value; };
const integer = (value: string, code: string) => { const parsed = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed)) throw new Error(code); return parsed; };

function parseCells(xml: string, shared: readonly string[]): Cells {
  const cells = new Map<string, string>(); let cursor = 0;
  while (true) {
    const start = xml.indexOf("<c ", cursor); if (start < 0) break;
    const openEnd = xml.indexOf(">", start), end = xml.indexOf("</c>", openEnd); if (openEnd < 0 || end < 0) throw new Error("KANSAS_XLSX_CELL_INVALID");
    const attributes = xml.slice(start + 2, openEnd), body = xml.slice(openEnd + 1, end), reference = attributes.match(/\br="([^"]+)"/)?.[1], type = attributes.match(/\bt="([^"]+)"/)?.[1];
    const valueStart = body.indexOf("<v>"), valueEnd = valueStart < 0 ? -1 : body.indexOf("</v>", valueStart), raw = valueStart < 0 || valueEnd < 0 ? undefined : body.slice(valueStart + 3, valueEnd);
    if (!reference) throw new Error("KANSAS_XLSX_CELL_REFERENCE_MISSING");
    const value = type === "s" ? shared[integer(raw ?? "", "KANSAS_XLSX_SHARED_INDEX_INVALID")] : type === "inlineStr" ? textNodes(body) : raw === undefined ? "" : decode(raw);
    if (value === undefined) throw new Error("KANSAS_XLSX_SHARED_VALUE_MISSING"); cells.set(reference, value);
    cursor = end + 4;
  }
  return cells;
}

function workbookSheets(bytes: Buffer): Readonly<{ names: readonly string[]; cells: Readonly<Record<string, Cells>> }> {
  let files: Record<string, Uint8Array>; try { files = unzipSync(new Uint8Array(bytes)); } catch { throw new Error("KANSAS_XLSX_INVALID"); }
  const workbook = file(files, "xl/workbook.xml"), relationships = file(files, "xl/_rels/workbook.xml.rels"), sharedXml = file(files, "xl/sharedStrings.xml"), shared = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => textNodes(match[1]!));
  const cells: Record<string, Cells> = {}, names: string[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const attributes = sheet[1]!, name = decode(attributes.match(/\bname="([^"]+)"/)?.[1] ?? ""), id = attributes.match(/\br:id="([^"]+)"/)?.[1]; if (!name || !id) throw new Error("KANSAS_XLSX_SHEET_INVALID");
    const relation = [...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match) => match[1]!).find((value) => value.match(/\bId="([^"]+)"/)?.[1] === id), target = relation?.match(/\bTarget="([^"]+)"/)?.[1]; if (!target) throw new Error("KANSAS_XLSX_SHEET_RELATION_INVALID");
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`; names.push(name);
    if (/^(OfficialPrecinctLevelResults|U\.S\. HOUSE|JOHNSON|WYANDOTTE)$/.test(name)) cells[name] = parseCells(file(files, path), shared);
  }
  return { names, cells };
}

function maxRow(cells: Cells) { return Math.max(...[...cells.keys()].map((reference) => Number(reference.match(/\d+$/)?.[0] ?? 0))); }
function specialTotal(cells: Cells, headerPattern: RegExp, candidateName: string): Readonly<{ votes: number; redacted: number }> {
  const maximumColumn = Math.max(...[...cells.keys()].map((reference) => { const letters = reference.match(/^[A-Z]+/)?.[0] ?? ""; return [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0); }));
  const targetColumns = Array.from({ length: maximumColumn }, (_, index) => index + 1).filter((index) => headerPattern.test(cells.get(`${column(index)}1`) ?? "") && cells.get(`${column(index)}2`) === "DEM" && cells.get(`${column(index)}3`) === candidateName);
  if (targetColumns.length !== 1) throw new Error("KANSAS_SPECIAL_TARGET_COLUMN_INVALID"); const target = targetColumns[0]!;
  const totalRows = Array.from({ length: maxRow(cells) }, (_, index) => index + 1).filter((row) => cells.get(`B${row}`) === "COUNTY TOTALS");
  if (totalRows.length !== 1) throw new Error("KANSAS_SPECIAL_TOTAL_ROW_INVALID");
  let redacted = 0; for (let row = 4; row < totalRows[0]!; row++) if (cells.get(`${column(target)}${row}`) === "Redacted") redacted++;
  return { votes: integer(cells.get(`${column(target)}${totalRows[0]}`) ?? "", "KANSAS_SPECIAL_TOTAL_INVALID"), redacted };
}

function parseCycle(bytes: Buffer, cycleYear: 2022 | 2024): KansasPrimaryResult {
  const sourceLockId = `ks-${cycleYear}-primary-us-house-precinct-results`, workbook = workbookSheets(bytes);
  const masterName = cycleYear === 2022 ? "OfficialPrecinctLevelResults" : "U.S. HOUSE", expectedNames = [masterName, "JOHNSON", "SEDGWICK", "SHAWNEE", "WYANDOTTE"];
  if (!exact(workbook.names, expectedNames)) throw new Error("KANSAS_XLSX_SHEET_SET_INVALID");
  const master = workbook.cells[masterName]!;
  if (!["County", "Precinct", "Race", "Candidate", "Party", "Votes", "VTD"].every((value, index) => master.get(`${column(index + 1)}1`) === value)) throw new Error("KANSAS_MASTER_HEADER_INVALID");
  let masterVotes = 0, masterPrecinctRows = 0; const maximumMasterRow = maxRow(master);
  for (let row = 2; row <= maximumMasterRow; row++) {
    if (master.get(`C${row}`) !== "United States House of Representatives 3" || master.get(`E${row}`) !== "Democratic") continue;
    if (master.get(`D${row}`) !== "Davids, Sharice") throw new Error("KANSAS_MASTER_CANDIDATE_INVALID"); masterVotes += integer(master.get(`F${row}`) ?? "", "KANSAS_MASTER_VOTE_INVALID"); masterPrecinctRows++;
  }
  const expectedMaster = cycleYear === 2022 ? { rows: 145, votes: 4669 } : { rows: 146, votes: 1260 };
  if (masterPrecinctRows !== expectedMaster.rows || masterVotes !== expectedMaster.votes) throw new Error("KANSAS_MASTER_CLOSURE_INVALID");
  const johnson = specialTotal(workbook.cells.JOHNSON!, /(?:US Rep 3|United States Representative 3rd District)/, "Sharice Davids"), wyandotte = specialTotal(workbook.cells.WYANDOTTE!, /United States Representative (?:3rd District|3rd District)/, "Sharice Davids");
  const expected = cycleYear === 2022 ? { johnson: 93377, wyandotte: 5899, total: 103945, redacted: 9 } : { johnson: 34604, wyandotte: 1973, total: 37837, redacted: 10 };
  const candidateVotes = masterVotes + johnson.votes + wyandotte.votes, redactedTargetPrecinctCells = johnson.redacted + wyandotte.redacted;
  if (johnson.votes !== expected.johnson || wyandotte.votes !== expected.wyandotte || candidateVotes !== expected.total || redactedTargetPrecinctCells !== expected.redacted) throw new Error(`KANSAS_SEGMENT_CLOSURE_INVALID:${cycleYear}:${masterVotes}:${johnson.votes}:${wyandotte.votes}:${redactedTargetPrecinctCells}`);
  const unsigned = { resultId: `ks:primary:${cycleYear}:03:democratic`, cycleYear, electionDate: cycleYear === 2022 ? "2022-08-02" : "2024-08-06", districtLabel: "KS-03" as const, sourceLockId, rawParty: "Democratic" as const, sourceCandidateName: "Davids, Sharice" as const, candidateVotes, segmentVotes: { statewideMasterExcludingSpecialCountySheets: masterVotes, johnsonCounty: johnson.votes, wyandotteCounty: wyandotte.votes }, masterPrecinctRows, redactedTargetPrecinctCells, resultAuthorityStatus: "official_precinct_workbook_retained_not_claimed_certified" as const, sourceWinnerStatus: "not_marked_by_source" as const, identity: null, scoreEligible: false as const };
  return { ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-kansas-result:v1", unsigned) };
}

const PINS = {
  2022: { id: "ks-2022-primary-us-house-precinct-results", url: "https://sos.ks.gov/elections/22elec/2022-Primary-Election-US-House-of-Representatives-Results-By-Precinct.xlsx", path: "data/source/rapid/house-primary/ks/2022/us-house-precinct-results.xlsx", bytes: 300587, sha256: "dc7d3f65012fb13ca4a045f2931529deee7d6351b584f4cf86c42db316dd0319" },
  2024: { id: "ks-2024-primary-us-house-precinct-results", url: "https://sos.ks.gov/elections/24elec/2024-Primary-Election-United-States-House-of-Representatives-Precinct%20Results.xlsx", path: "data/source/rapid/house-primary/ks/2024/us-house-precinct-results.xlsx", bytes: 487805, sha256: "8ada8f05d50714e42baa14314ed94fbf4d9c228165e350309a1f3e8717c66c73" },
} as const;
const cached = new Map<string, KansasPrimaryResults>();
export function buildKansasPrimaryResults(root = process.cwd()): KansasPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const sourceBytes = ([2022, 2024] as const).map((year) => { const pin = PINS[year], bytes = readFileSync(join(root, pin.path)), digest = createHash("sha256").update(bytes).digest("hex"), matches = lock.entries.filter((entry) => entry.id === pin.id); if (bytes.length !== pin.bytes || digest !== pin.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), { id: pin.id, url: pin.url, retainedPath: pin.path, retainedStatus: "retained", byteSize: pin.bytes, sha256: pin.sha256, kind: "source", parentIds: [] })) throw new Error(`KANSAS_SOURCE_BINDING_INVALID:${year}`); return bytes; });
  const cacheKey = `${root}:${PINS[2022].sha256}:${PINS[2024].sha256}`, prior = cached.get(cacheKey); if (prior) return prior;
  const results = [parseCycle(sourceBytes[0]!, 2022), parseCycle(sourceBytes[1]!, 2024)];
  const summary = { observations: 2 as const, candidateRows: 2 as const, candidateVotes: 141782 as const, scoreEligibleRows: 0 as const };
  if (results.reduce((sum, row) => sum + row.candidateVotes, 0) !== summary.candidateVotes || results.some((row) => row.scoreEligible || row.identity !== null || row.sourceWinnerStatus !== "not_marked_by_source")) throw new Error("KANSAS_RESULTS_CLOSURE_INVALID");
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-kansas-result-set:v1", results), unsigned = { schema: "rapid-house-primary-kansas-results-v1" as const, version: 1 as const, results, resultSetSha256, summary };
  const value = { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-kansas-package:v1", unsigned) }; cached.set(cacheKey, value); return value;
}
export function validateKansasPrimaryResults(value: unknown, root = process.cwd()): KansasPrimaryResults { const expected = buildKansasPrimaryResults(root); if (!exact(value, expected)) throw new Error("KANSAS_RESULTS_INVALID"); return value as KansasPrimaryResults; }
