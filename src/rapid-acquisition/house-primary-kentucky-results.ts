import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash, sha, exact } from "./shared";

export interface KentuckyPrimaryResult {
  readonly resultId: "ky:primary:2024:03:democratic";
  readonly cycleYear: 2024;
  readonly electionDate: "2024-05-21";
  readonly districtLabel: "KY-03";
  readonly sourceLockIds: readonly ["ky-2024-primary-results", "ky-2024-primary-results-layout-text"];
  readonly rawParty: "Democratic Party";
  readonly sourceCandidateNames: readonly ["Morgan McGARVEY", "Geoffrey M. \"Geoff\" YOUNG", "Jared RANDALL"];
  readonly candidateVotes: readonly [44275, 5875, 2491];
  readonly totalVotes: 52641;
  readonly resultAuthorityStatus: "official_primary_result_pdf_retained_no_separate_certification_instrument";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}

export interface KentuckyPrimaryResults {
  readonly schema: "rapid-house-primary-kentucky-results-v1";
  readonly version: 1;
  readonly results: readonly [KentuckyPrimaryResult];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ observations: 1; candidateRows: 3; candidateVotes: 52641; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const PDF = { id: "ky-2024-primary-results", url: "https://elect.ky.gov/results/2020-2029/Documents/2024%20Primary%20Results.pdf", path: "data/source/rapid/house-primary/ky/2024/primary-results.pdf", bytes: 211411, sha256: "9308e1c41742ab18cd8b9a28b0b6fc3d2318515a1ce9f4eec7b869b3d01f39d8", kind: "source", parentIds: [] } as const;
const TEXT = { id: "ky-2024-primary-results-layout-text", url: "urn:dsa-seats:derived-extract:ky-2024-primary-results:pdftotext-layout", path: "data/source/rapid/house-primary/ky/2024/primary-results-layout.txt", bytes: 75426, sha256: "622352708fd7a67ca9884ad00cc183dd866d0432bd05eec97e15193656914fa2", kind: "derived_extract", parentIds: [PDF.id] } as const;

export function buildKentuckyPrimaryResults(root = process.cwd()): KentuckyPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const pdf = readFileSync(join(root, PDF.path)), textBytes = readFileSync(join(root, TEXT.path)), text = textBytes.toString("utf8");
  for (const pin of [PDF, TEXT]) {
    const bytes = pin === PDF ? pdf : textBytes, matches = lock.entries.filter((entry) => entry.id === pin.id);
    const expected = { id: pin.id, url: pin.url, retainedPath: pin.path, retainedStatus: "retained", byteSize: pin.bytes, sha256: pin.sha256, kind: pin.kind, parentIds: [...pin.parentIds] };
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) throw new Error(`KENTUCKY_SOURCE_BINDING_INVALID:${pin.id}`);
  }
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || !/Commonwealth of Kentucky\s+Michael G\. Adams, Secretary of State\s+2024 Primary Election Results/.test(text)) throw new Error("KENTUCKY_DOCUMENT_IDENTITY_INVALID");
  const section = text.match(/US Representative\s+3rd Congressional District\s+Democratic Party\s+Morgan\s+Geoffrey M\. "Geoff"\s+Jared\s+McGARVEY\s+YOUNG\s+RANDALL\s+Jefferson\s+44,275\s+5,875\s+2,491\s+Total Votes\s+44,275\s+5,875\s+2,491/);
  if (!section) throw new Error("KENTUCKY_TARGET_TABLE_INVALID");
  const sourceCandidateNames = ["Morgan McGARVEY", "Geoffrey M. \"Geoff\" YOUNG", "Jared RANDALL"] as const;
  const candidateVotes = [44275, 5875, 2491] as const;
  const totalVotes = candidateVotes.reduce<number>((sum, value) => sum + value, 0) as 52641;
  const unsigned = { resultId: "ky:primary:2024:03:democratic" as const, cycleYear: 2024 as const, electionDate: "2024-05-21" as const, districtLabel: "KY-03" as const, sourceLockIds: [PDF.id, TEXT.id] as const, rawParty: "Democratic Party" as const, sourceCandidateNames, candidateVotes, totalVotes, resultAuthorityStatus: "official_primary_result_pdf_retained_no_separate_certification_instrument" as const, sourceWinnerStatus: "not_marked_by_source" as const, identity: null, scoreEligible: false as const };
  const result = { ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-kentucky-result:v1", unsigned) };
  const results = [result] as const, summary = { observations: 1 as const, candidateRows: 3 as const, candidateVotes: 52641 as const, scoreEligibleRows: 0 as const };
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-kentucky-result-set:v1", results);
  const packageUnsigned = { schema: "rapid-house-primary-kentucky-results-v1" as const, version: 1 as const, results, resultSetSha256, summary };
  return { ...packageUnsigned, packageSha256: hash("dsa-seats:rapid-house-primary-kentucky-package:v1", packageUnsigned) };
}

export function validateKentuckyPrimaryResults(value: unknown, root = process.cwd()): KentuckyPrimaryResults {
  const expected = buildKentuckyPrimaryResults(root);
  if (!exact(value, expected)) throw new Error("KENTUCKY_RESULTS_INVALID");
  return value as KentuckyPrimaryResults;
}
