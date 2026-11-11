import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash, sha, exact } from "./shared";

export interface MississippiPrimaryResult {
  readonly resultId: "ms:primary:2024:02:democratic";
  readonly cycleYear: 2024;
  readonly electionDate: "2024-03-12";
  readonly districtLabel: "MS-02";
  readonly sourceLockIds: readonly ["ms-2024-primary-results", "ms-2024-primary-statewide-democratic-recap", "ms-2024-primary-statewide-democratic-recap-layout-text"];
  readonly rawParty: "Democrat";
  readonly sourceCandidateNames: readonly ["Bennie G. Thompson"];
  readonly candidateVotes: readonly [44295];
  readonly totalVotes: 44295;
  readonly resultAuthorityStatus: "official_statewide_democratic_recap_pdf_retained_no_separate_certification_instrument";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}
export interface MississippiPrimaryResults { readonly schema: "rapid-house-primary-mississippi-results-v1"; readonly version: 1; readonly results: readonly [MississippiPrimaryResult]; readonly resultSetSha256: string; readonly summary: Readonly<{ observations: 1; candidateRows: 1; candidateVotes: 44295; scoreEligibleRows: 0 }>; readonly packageSha256: string; }
const INDEX = { id: "ms-2024-primary-results", url: "https://www.sos.ms.gov/elections/electionResults/2024DemocraticPrimary.asp", path: "data/source/rapid/house-primary/ms/2024/primary-results.html", bytes: 22695, sha256: "73d36cc3d47095e7378db4414d239fb9f84c3e1a9a48bfe3cc48b758b996796f", kind: "source", parentIds: [] } as const;
const PDF = { id: "ms-2024-primary-statewide-democratic-recap", url: "https://www.sos.ms.gov/elections/electionResults/2024DemocraticPrimary/Statewide%20Democratic%20Recap.pdf", path: "data/source/rapid/house-primary/ms/2024/statewide-democratic-recap.pdf", bytes: 1490416, sha256: "c885b427e8950f4aa5255697aaeb065c315cc47289563f09621a39e7dd98dd03", kind: "source", parentIds: [INDEX.id] } as const;
const TEXT = { id: "ms-2024-primary-statewide-democratic-recap-layout-text", url: "urn:dsa-seats:derived-extract:ms-2024-primary-statewide-democratic-recap:pdftotext-layout", path: "data/source/rapid/house-primary/ms/2024/statewide-democratic-recap-layout.txt", bytes: 20231, sha256: "b641a76e838ddbbb3ed9f4995d9147d9e813a5d15106bd56d7990579cdf7a38c", kind: "derived_extract", parentIds: [PDF.id] } as const;

export function buildMississippiPrimaryResults(root = process.cwd()): MississippiPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const bytesById = new Map([[INDEX.id, readFileSync(join(root, INDEX.path))], [PDF.id, readFileSync(join(root, PDF.path))], [TEXT.id, readFileSync(join(root, TEXT.path))]]);
  for (const pin of [INDEX, PDF, TEXT]) { const bytes = bytesById.get(pin.id)!, matches = lock.entries.filter((entry) => entry.id === pin.id), expected = { id: pin.id, url: pin.url, retainedPath: pin.path, retainedStatus: "retained", byteSize: pin.bytes, sha256: pin.sha256, kind: pin.kind, parentIds: [...pin.parentIds] }; if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) throw new Error(`MISSISSIPPI_SOURCE_BINDING_INVALID:${pin.id}`); }
  const index = bytesById.get(INDEX.id)!.toString("utf8"), pdf = bytesById.get(PDF.id)!, text = bytesById.get(TEXT.id)!.toString("utf8");
  if (!/href="2024DemocraticPrimary\/Statewide%20Democratic%20Recap\.pdf"/.test(index) || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || !/Official Results\s+Total Votes Reported by Counties for Presidential Primary\s+Date of Election: 3\/12\/2024/.test(text)) throw new Error("MISSISSIPPI_DOCUMENT_IDENTITY_INVALID");
  if (!/US House Of Rep 02-2nd Congressional\s+District[\s\S]*?Bennie G\. Thompson\s+Democrat[\s\S]*?TOTAL[\s\S]*?Bennie G\. Thompson\s+Democrat\s+X\s+566\s+X\s+507\s+1001\s+44295/.test(text)) throw new Error("MISSISSIPPI_TARGET_TABLE_INVALID");
  const unsigned = { resultId: "ms:primary:2024:02:democratic" as const, cycleYear: 2024 as const, electionDate: "2024-03-12" as const, districtLabel: "MS-02" as const, sourceLockIds: [INDEX.id, PDF.id, TEXT.id] as const, rawParty: "Democrat" as const, sourceCandidateNames: ["Bennie G. Thompson"] as const, candidateVotes: [44295] as const, totalVotes: 44295 as const, resultAuthorityStatus: "official_statewide_democratic_recap_pdf_retained_no_separate_certification_instrument" as const, sourceWinnerStatus: "not_marked_by_source" as const, identity: null, scoreEligible: false as const };
  const result = { ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-mississippi-result:v1", unsigned) }, results = [result] as const, summary = { observations: 1 as const, candidateRows: 1 as const, candidateVotes: 44295 as const, scoreEligibleRows: 0 as const }, resultSetSha256 = hash("dsa-seats:rapid-house-primary-mississippi-result-set:v1", results), packageUnsigned = { schema: "rapid-house-primary-mississippi-results-v1" as const, version: 1 as const, results, resultSetSha256, summary };
  return { ...packageUnsigned, packageSha256: hash("dsa-seats:rapid-house-primary-mississippi-package:v1", packageUnsigned) };
}
export function validateMississippiPrimaryResults(value: unknown, root = process.cwd()): MississippiPrimaryResults { const expected = buildMississippiPrimaryResults(root); if (!exact(value, expected)) throw new Error("MISSISSIPPI_RESULTS_INVALID"); return value as MississippiPrimaryResults; }
