import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";

import { readSourceLock } from "./intake/source-lock";
import { readWorkbookCsvZipExtract, workbookExtractId } from "./intake/workbook-extract";
import { byteCompare, hash, sha, exact } from "./shared";

export interface AlabamaPrimaryResult {
  readonly resultId: string;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: "2022-05-24" | "2024-03-05";
  readonly districtLabel: "AL-02" | "AL-07";
  readonly sourceLockIds: readonly string[];
  readonly sourceCandidateNames: readonly string[];
  readonly candidateVotes: readonly number[];
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_secretary_precinct_workbooks_retained";
  readonly certificationStatus: "separate_certification_instrument_not_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}
export interface AlabamaRunoffEvidence {
  readonly evidenceId: "al:primary-runoff:2024:02:democratic";
  readonly sourceLockIds: readonly ["al-2024-primary-runoff-precinct-results"];
  readonly sourceCandidateNames: readonly ["Anthony Daniels", "Shomari Figures"];
  readonly candidateVotes: readonly [14006, 21962];
  readonly totalVotes: 35968;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly winnerIdentity: null;
  readonly scoreEligible: false;
}
export interface AlabamaPrimaryResults {
  readonly schema: "rapid-house-primary-alabama-results-v1";
  readonly version: 1;
  readonly results: readonly AlabamaPrimaryResult[];
  readonly sourceAbsent: readonly [{ readonly observationId: "al:primary:2022:07"; readonly sourceLockIds: readonly ["al-2022-primary-precinct-results"]; readonly status: "source_absent_no_disposition_inference" }];
  readonly runoffEvidence: AlabamaRunoffEvidence;
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ reportedContests: 3; sourceAbsent: 1; regularCandidateRows: 15; regularCandidateVotes: 145878; runoffCandidateRows: 2; runoffCandidateVotes: 35968; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { id: "al-2022-primary-precinct-results", path: "data/source/rapid/house-primary/al/2022/primary-precinct-results.zip", url: "https://www.sos.alabama.gov/sites/default/files/election-data/2022-06/2022%20Primary%20Precinct%20Results.zip", bytes: 956619, sha256: "d927aa38b0be4f855833648aeb873a537db8a222172bb630044b026622a23999", cycle: "2022" },
  { id: "al-2024-primary-precinct-results", path: "data/source/rapid/house-primary/al/2024/primary-precinct-results.zip", url: "https://www.sos.alabama.gov/sites/default/files/election-data/2024-04/2024%20Primary%20Precinct%20Results.ZIP", bytes: 705832, sha256: "8423328e37a00b430d23ea034547bc354d2c71f4038c950a4dc882aa08333cd2", cycle: "2024" },
  { id: "al-2024-primary-runoff-precinct-results", path: "data/source/rapid/house-primary/al/2024/primary-runoff-precinct-results.zip", url: "https://www.sos.alabama.gov/sites/default/files/election-data/2024-07/2024%20Primary%20Runoff%20Precinct%20Results.zip", bytes: 165748, sha256: "1538e5a6848a4989fe856cf538dd279f4992a8c9fdac6d6cd03978ad8017cdae", cycle: "2024-runoff" },
] as const;
const EXPECTED = {
  "2022": { "02": [["Phyllis Harvey-Hall", 16889], ["Vimal Patel", 7668]] },
  "2024": { "02": [["Anthony Daniels",12879],["James Averhart",1623],["Jeremy Gray",1580],["Juandalynn \"Le Le\" Givan",1260],["Larry Darnell Simpson",247],["Merika Coleman",3445],["Napoleon Bracy, Jr.",9010],["Phyllis Harvey-Hall",2007],["Shomari Figures",24979],["Vimal Patel",289],["Willie J. Lenard",199]], "07": [["Chris Davis",4712],["Terri A. Sewell",59091]] },
  "2024-runoff": { "02": [["Anthony Daniels",14006],["Shomari Figures",21962]] },
} as const;

function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quote = false;
  for (let index = 0; index < input.length; index++) { const char = input[index]; if (quote) { if (char === '"' && input[index + 1] === '"') { field += '"'; index++; } else if (char === '"') quote = false; else field += char; } else if (char === '"') quote = true; else if (char === ",") { row.push(field); field = ""; } else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; } else field += char; }
  if (quote) throw new Error("ALABAMA_CSV_UNTERMINATED_QUOTE"); if (field || row.length) { row.push(field); rows.push(row); } return rows;
}
function extract(bytes: Buffer, csvs: readonly (readonly [string, string])[], cycle: string): Record<string, readonly (readonly [string, number])[]> {
  {
    const members = Object.entries(unzipSync(bytes)).filter(([name]) => name.toLowerCase().endsWith(".xls"));
    if (members.length !== (cycle === "2024-runoff" ? 28 : 67) || csvs.length !== members.length) throw new Error(`ALABAMA_XLS_MEMBER_COUNT_INVALID:${cycle}`);
    // The CSVs are the pinned LibreOffice extracts of the retained zip's workbooks (see intake/workbook-extract.ts); no conversion runs here.
    const totals = new Map<string, Map<string, number>>();
    for (const [filename, text] of csvs) for (const row of parseCsv(text)) {
      const match = row[0]?.trim().match(/^UNITED STATES REPRESENTATIVE,\s+(2ND|7TH) CONGRESSIONAL DISTRICT$/); const party = row[1]?.trim(), rawName = row[2]?.trim(); if (!match || party !== "DEM" || !rawName || rawName === "Over Votes" || rawName === "Under Votes") continue;
      const district = match[1] === "2ND" ? "02" : "07", name = rawName === 'Juandalynn "Lele" Givan' ? 'Juandalynn "Le Le" Givan' : rawName; let votes = 0;
      for (const value of row.slice(3)) { const text = value.trim(); if (text && !/^\d+$/.test(text)) throw new Error(`ALABAMA_VOTE_INVALID:${cycle}:${filename}`); votes += text ? Number(text) : 0; }
      const candidates = totals.get(district) ?? new Map<string, number>(); candidates.set(name, (candidates.get(name) ?? 0) + votes); totals.set(district, candidates);
    }
    return Object.fromEntries([...totals].map(([district, candidates]) => [district, [...candidates].sort(([left], [right]) => byteCompare(left, right))]));
  }
}

export function buildAlabamaPrimaryResults(root = process.cwd()): AlabamaPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }; const extracted: Record<string, Record<string, readonly (readonly [string, number])[]>> = {};
  for (const source of SOURCES) { const bytes = readFileSync(join(root, source.path)), matches = lock.entries.filter((entry) => entry.id === source.id), expectedLock = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] }; if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expectedLock)) throw new Error(`ALABAMA_SOURCE_BINDING_INVALID:${source.id}`); extracted[source.cycle] = extract(bytes, readWorkbookCsvZipExtract(readSourceLock(root), workbookExtractId(source.id), source.id, root), source.cycle); }
  if (!exact(extracted, EXPECTED)) throw new Error("ALABAMA_EXTRACTED_RESULTS_INVALID");
  const results: AlabamaPrimaryResult[] = [];
  const configurations: readonly Readonly<{ cycleYear: 2022 | 2024; district: "02" | "07"; candidates: readonly (readonly [string, number])[] }>[] = [{ cycleYear: 2022, district: "02", candidates: EXPECTED["2022"]["02"] }, { cycleYear: 2024, district: "02", candidates: EXPECTED["2024"]["02"] }, { cycleYear: 2024, district: "07", candidates: EXPECTED["2024"]["07"] }];
  for (const { cycleYear, district, candidates } of configurations) { const sourceCandidateNames = candidates.map((row) => row[0]), candidateVotes = candidates.map((row) => row[1]), totalVotes = candidateVotes.reduce((sum, value) => sum + value, 0), unsigned = { resultId: `al:primary:${cycleYear}:${district}:democratic`, cycleYear, electionDate: cycleYear === 2022 ? "2022-05-24" as const : "2024-03-05" as const, districtLabel: `AL-${district}` as "AL-02" | "AL-07", sourceLockIds: [cycleYear === 2022 ? SOURCES[0].id : SOURCES[1].id], sourceCandidateNames, candidateVotes, totalVotes, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_secretary_precinct_workbooks_retained" as const, certificationStatus: "separate_certification_instrument_not_retained" as const, winnerIdentity: null, identity: null, scoreEligible: false as const }; results.push({ ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-alabama-result:v1", unsigned) }); }
  const runoffEvidence = { evidenceId: "al:primary-runoff:2024:02:democratic" as const, sourceLockIds: [SOURCES[2].id] as const, sourceCandidateNames: ["Anthony Daniels", "Shomari Figures"] as const, candidateVotes: [14006, 21962] as const, totalVotes: 35968 as const, sourceWinnerStatus: "not_marked_by_source" as const, winnerIdentity: null, scoreEligible: false as const };
  const sourceAbsent = [{ observationId: "al:primary:2022:07" as const, sourceLockIds: [SOURCES[0].id] as const, status: "source_absent_no_disposition_inference" as const }] as const; const summary = { reportedContests: 3 as const, sourceAbsent: 1 as const, regularCandidateRows: 15 as const, regularCandidateVotes: 145878 as const, runoffCandidateRows: 2 as const, runoffCandidateVotes: 35968 as const, scoreEligibleRows: 0 as const }; const resultSetSha256 = hash("dsa-seats:rapid-house-primary-alabama-result-set:v1", { results, sourceAbsent, runoffEvidence }), unsigned = { schema: "rapid-house-primary-alabama-results-v1" as const, version: 1 as const, results, sourceAbsent, runoffEvidence, resultSetSha256, summary }; return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-alabama-package:v1", unsigned) };
}
export function validateAlabamaPrimaryResults(value: unknown, root = process.cwd()): AlabamaPrimaryResults { const expected = buildAlabamaPrimaryResults(root); if (!exact(value, expected)) throw new Error("ALABAMA_RESULTS_INVALID"); return value as AlabamaPrimaryResults; }
