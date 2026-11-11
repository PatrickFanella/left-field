import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readSourceLock } from "./intake/source-lock";
import { readWorkbookCsvExtract, workbookExtractId } from "./intake/workbook-extract";
import { hash, sha, exact } from "./shared";

export interface TennesseePrimaryResult {
  readonly resultId: `tn:primary:${2022 | 2024}:09:democratic`;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: "2022-08-04" | "2024-08-01";
  readonly districtLabel: "TN-09";
  readonly sourceLockIds: readonly string[];
  readonly precinctRows: 125;
  readonly sourceCandidateNames: readonly string[];
  readonly candidateVotes: readonly number[];
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_secretary_precinct_workbook_retained";
  readonly certificationStatus: "separate_certification_instrument_not_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}
export interface TennesseePrimaryResults {
  readonly schema: "rapid-house-primary-tennessee-results-v1";
  readonly version: 1;
  readonly results: readonly TennesseePrimaryResult[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ reportedContests: 2; candidateRows: 7; candidateVotes: 111265; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { year: 2022 as const, id: "tn-2022-primary-precinct-results", path: "data/source/rapid/house-primary/tn/2022/primary-results-by-precinct.xlsx", url: "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/20220804ResultsbyPrecinct.xlsx", bytes: 5883199, sha256: "e48044d15f8bac515280dae069ef0e7468a07424df6826cd5d62985c312f9849" },
  { year: 2024 as const, id: "tn-2024-primary-precinct-results", path: "data/source/rapid/house-primary/tn/2024/primary-results-by-precinct.xlsx", url: "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/20240801AllbyPrecinct.xlsx", bytes: 1613430, sha256: "3e3589f37aa7680894e711151905dcdbb121b16d32c37414f6e28ddd42090e65" },
] as const;
const EXPECTED = {
  2022: [["M. Latroy Alexandria-Williams", 8449], ["Steve Cohen", 62055], ["Write-In - Ollie O. Nelson", 2]],
  2024: [["M Latroy A-Williams", 1936], ["Steve Cohen", 30042], ["Kasandra L Smith", 1523], ["Corey Strong", 7258]],
} as const;
const HEADER = ["COUNTY","PRCTSEQ","PRECINCT","BALSEQID","JURISID","SECJURISID","CANDGROUP","OFFICENAME","ELECTDATE","ELECTTYPE",...Array.from({ length: 10 }, (_, index) => [`COL${index + 1}HDG`,`RNAME${index + 1}`,`PARTY${index + 1}`,`PVTALLY${index + 1}`]).flat()];

function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quote = false;
  for (let index = 0; index < input.length; index++) { const char = input[index]; if (quote) { if (char === '"' && input[index + 1] === '"') { field += '"'; index++; } else if (char === '"') quote = false; else field += char; } else if (char === '"') quote = true; else if (char === ",") { row.push(field); field = ""; } else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; } else field += char; }
  if (quote) throw new Error("TENNESSEE_CSV_UNTERMINATED_QUOTE"); if (field || row.length) { row.push(field); rows.push(row); } return rows;
}

function extract(csvText: string, year: 2022 | 2024): { precinctRows: number; candidates: readonly (readonly [string, number])[] } {
  {
    // The CSV is the pinned LibreOffice extract of the retained workbook (see intake/workbook-extract.ts); no conversion runs here.
    const rows = parseCsv(csvText);
    if (!exact(rows[0], HEADER)) throw new Error(`TENNESSEE_HEADER_INVALID:${year}`);
    const target = rows.slice(1).filter((row) => row[7]?.trim() === "United States House of Representatives District 9" && row[9]?.trim() === "Democratic Primary");
    const totals = new Map<string, number>();
    for (const row of target) for (let candidate = 0; candidate < 10; candidate++) { const name = row[11 + candidate * 4]?.trim(), party = row[12 + candidate * 4]?.trim(), votes = row[13 + candidate * 4]?.trim(); if (!name && !votes) continue; if (!name || party !== "Democratic" || !votes || !/^\d+$/.test(votes)) throw new Error(`TENNESSEE_CANDIDATE_INVALID:${year}`); totals.set(name, (totals.get(name) ?? 0) + Number(votes)); }
    return { precinctRows: target.length, candidates: [...totals] };
  }
}

export function buildTennesseePrimaryResults(root = process.cwd()): TennesseePrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const results: TennesseePrimaryResult[] = [];
  for (const source of SOURCES) {
    const bytes = readFileSync(join(root, source.path));
    const expectedLock = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] };
    if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || lock.entries.filter((entry) => entry.id === source.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.id)), expectedLock)) throw new Error(`TENNESSEE_SOURCE_BINDING_INVALID:${source.year}`);
    if (bytes.subarray(0, 2).toString("binary") !== "PK") throw new Error(`TENNESSEE_WORKBOOK_INVALID:${source.year}`);
    const extracted = extract(readWorkbookCsvExtract(readSourceLock(root), workbookExtractId(source.id), source.id, root), source.year);
    if (extracted.precinctRows !== 125 || !exact(extracted.candidates, EXPECTED[source.year])) throw new Error(`TENNESSEE_EXTRACTED_RESULTS_INVALID:${source.year}`);
    const sourceCandidateNames = extracted.candidates.map((row) => row[0]), candidateVotes = extracted.candidates.map((row) => row[1]), totalVotes = candidateVotes.reduce((sum, value) => sum + value, 0);
    const unsigned = { resultId: `tn:primary:${source.year}:09:democratic` as const, cycleYear: source.year, electionDate: source.year === 2022 ? "2022-08-04" as const : "2024-08-01" as const, districtLabel: "TN-09" as const, sourceLockIds: [source.id], precinctRows: 125 as const, sourceCandidateNames, candidateVotes, totalVotes, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_secretary_precinct_workbook_retained" as const, certificationStatus: "separate_certification_instrument_not_retained" as const, winnerIdentity: null, identity: null, scoreEligible: false as const };
    results.push({ ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-tennessee-result:v1", unsigned) });
  }
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-tennessee-result-set:v1", results), summary = { reportedContests: 2 as const, candidateRows: 7 as const, candidateVotes: 111265 as const, scoreEligibleRows: 0 as const }, unsigned = { schema: "rapid-house-primary-tennessee-results-v1" as const, version: 1 as const, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-tennessee-package:v1", unsigned) };
}
export function validateTennesseePrimaryResults(value: unknown, root = process.cwd()): TennesseePrimaryResults { const expected = buildTennesseePrimaryResults(root); if (!exact(value, expected)) throw new Error("TENNESSEE_RESULTS_INVALID"); return value as TennesseePrimaryResults; }
