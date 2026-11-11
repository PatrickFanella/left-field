import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash, sha, exact } from "./shared";

export interface MissouriPrimaryResult {
  readonly resultId: string;
  readonly cycleYear: 2024;
  readonly electionDate: "2024-08-06";
  readonly districtLabel: "MO-01" | "MO-05";
  readonly sourceLockIds: readonly ["mo-2024-primary-results", "mo-2024-primary-results-layout-text"];
  readonly rawParty: "Democratic";
  readonly sourceCandidateNames: readonly string[];
  readonly candidateVotes: readonly number[];
  readonly totalVotes: number;
  readonly resultAuthorityStatus: "official_primary_result_pdf_retained_no_separate_certification_instrument";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}
export interface MissouriPrimaryResults {
  readonly schema: "rapid-house-primary-missouri-results-v1";
  readonly version: 1;
  readonly results: readonly MissouriPrimaryResult[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ observations: 2; candidateRows: 5; candidateVotes: 189506; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}
const PDF = { id: "mo-2024-primary-results", url: "https://www.sos.mo.gov/CMSImages/ElectionResultsStatistics/ActualResults-August62024.pdf", path: "data/source/rapid/house-primary/mo/2024/primary-results.pdf", bytes: 1763712, sha256: "c3cbf17b8598920730c77e58b97be404d2a015573ff876952eb025681577cb54", kind: "source", parentIds: [] } as const;
const TEXT = { id: "mo-2024-primary-results-layout-text", url: "urn:dsa-seats:derived-extract:mo-2024-primary-results:pdftotext-layout", path: "data/source/rapid/house-primary/mo/2024/primary-results-layout.txt", bytes: 299843, sha256: "82861106ea3a04615dc925687acb43c6011685b7cc81cff9957aaf1cc788d44e", kind: "derived_extract", parentIds: [PDF.id] } as const;

export function buildMissouriPrimaryResults(root = process.cwd()): MissouriPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const pdf = readFileSync(join(root, PDF.path)), textBytes = readFileSync(join(root, TEXT.path)), text = textBytes.toString("utf8");
  for (const pin of [PDF, TEXT]) { const bytes = pin === PDF ? pdf : textBytes, matches = lock.entries.filter((entry) => entry.id === pin.id), expected = { id: pin.id, url: pin.url, retainedPath: pin.path, retainedStatus: "retained", byteSize: pin.bytes, sha256: pin.sha256, kind: pin.kind, parentIds: [...pin.parentIds] }; if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) throw new Error(`MISSOURI_SOURCE_BINDING_INVALID:${pin.id}`); }
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || !/Missouri Office of Secretary of State\s+OFFICIAL RESULTS\s+Primary Election - August 6, 2024/.test(text)) throw new Error("MISSOURI_DOCUMENT_IDENTITY_INVALID");
  const districtOneA = /U\.S\. Representative\s+Republican\s+Republican\s+Republican\s+Republican\s+Republican\s+Democratic Democratic\s+District 1\s+Stan Hall\s+Laura Mitchell-Riley\s+Mike Hebron\s+Timothy Gartin\s+Andrew Jones\s+Cori Bush Wesley Bell[\s\S]*?Total\s+4008\s+3215\s+3247\s+996\s+4209\s+56723\s+63521/.test(text);
  const districtOneB = /U\.S\. Representative\s+Democratic\s+Democratic\s+Libertarian\s+District 1\s+Maria N\. Chappelle-Nadal Ron Harshaw\s+Rochelle A\. Riggins\s+Total[\s\S]*?Total\s+3279\s+735\s+272\s+140205/.test(text);
  const districtFive = /U\.S\. Representative\s+Republican\s+Democratic\s+Libertarian\s+District 5\s+Sean E\. Smith Emanuel Cleaver, II\s+William Truman \(Bill\) Wayne\s+Total[\s\S]*?Total\s+32574\s+65248\s+340\s+98162/.test(text);
  if (!districtOneA || !districtOneB || !districtFive) throw new Error("MISSOURI_TARGET_TABLE_INVALID");
  const inputs = [
    { districtLabel: "MO-01" as const, names: ["Cori Bush", "Wesley Bell", "Maria N. Chappelle-Nadal", "Ron Harshaw"], votes: [56723, 63521, 3279, 735] },
    { districtLabel: "MO-05" as const, names: ["Emanuel Cleaver, II"], votes: [65248] },
  ];
  const results = inputs.map(({ districtLabel, names, votes }) => { const totalVotes = votes.reduce((sum, value) => sum + value, 0); const unsigned = { resultId: `mo:primary:2024:${districtLabel.slice(-2)}:democratic`, cycleYear: 2024 as const, electionDate: "2024-08-06" as const, districtLabel, sourceLockIds: [PDF.id, TEXT.id] as const, rawParty: "Democratic" as const, sourceCandidateNames: names, candidateVotes: votes, totalVotes, resultAuthorityStatus: "official_primary_result_pdf_retained_no_separate_certification_instrument" as const, sourceWinnerStatus: "not_marked_by_source" as const, identity: null, scoreEligible: false as const }; return { ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-missouri-result:v1", unsigned) }; });
  const summary = { observations: 2 as const, candidateRows: 5 as const, candidateVotes: 189506 as const, scoreEligibleRows: 0 as const };
  if (results.reduce((sum, row) => sum + row.totalVotes, 0) !== summary.candidateVotes) throw new Error("MISSOURI_RESULTS_CLOSURE_INVALID");
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-missouri-result-set:v1", results), unsigned = { schema: "rapid-house-primary-missouri-results-v1" as const, version: 1 as const, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-missouri-package:v1", unsigned) };
}
export function validateMissouriPrimaryResults(value: unknown, root = process.cwd()): MissouriPrimaryResults { const expected = buildMissouriPrimaryResults(root); if (!exact(value, expected)) throw new Error("MISSOURI_RESULTS_INVALID"); return value as MissouriPrimaryResults; }
