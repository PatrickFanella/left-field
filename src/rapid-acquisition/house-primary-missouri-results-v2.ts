import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type MissouriPrimaryResult, validateMissouriPrimaryResults } from "./house-primary-missouri-results";
import { hash, sha, exact } from "./shared";

export interface MissouriPrimaryResult2022 {
  readonly resultId: "mo:primary:2022:01:democratic" | "mo:primary:2022:05:democratic";
  readonly cycleYear: 2022;
  readonly electionDate: "2022-08-02";
  readonly districtLabel: "MO-01" | "MO-05";
  readonly sourceLockIds: readonly ["mo-2022-primary-results-archived", "mo-2022-primary-results-layout-text"];
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
export interface MissouriPrimaryResultsV2 {
  readonly schema: "rapid-house-primary-missouri-results-v2";
  readonly version: 2;
  readonly parentPackageSha256: string;
  readonly results: readonly [MissouriPrimaryResult2022, MissouriPrimaryResult2022, MissouriPrimaryResult, MissouriPrimaryResult];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ observations: 4; candidateRows: 12; candidateVotes: 354070; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}
const PDF = { id: "mo-2022-primary-results-archived", url: "https://web.archive.org/web/20250826141506id_/https://www.sos.mo.gov/CMSImages/ElectionResultsStatistics/ActualResults-August22022.pdf", path: "data/source/rapid/house-primary/mo/2022/primary-results.pdf", bytes: 1_283_832, sha256: "9d62384135197ee0722eb5be00ac4c2b4eb05a05b65b04c9723298a26b06db06", kind: "archived_official_source", parentIds: [] } as const;
const TEXT = { id: "mo-2022-primary-results-layout-text", url: "urn:dsa-seats:derived-extract:mo-2022-primary-results-archived:pdftotext-layout", path: "data/source/rapid/house-primary/mo/2022/primary-results-layout.txt", bytes: 228_460, sha256: "fc7bf0c8dbb53609eff74250310f9bf5bf13d36eb309ddd8c00d5b02ee51dee5", kind: "derived_extract", parentIds: [PDF.id] } as const;

export function buildMissouriPrimaryResultsV2(root = process.cwd()): MissouriPrimaryResultsV2 {
  const parent = validateMissouriPrimaryResults(JSON.parse(readFileSync(join(root, "data/metadata/rapid-house-primary-missouri-results-v1.json"), "utf8")), root);
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  let text = "";
  for (const pin of [PDF, TEXT]) {
    const bytes = readFileSync(join(root, pin.path));
    if (pin === TEXT) text = bytes.toString("utf8");
    const expected = { id: pin.id, url: pin.url, retainedPath: pin.path, retainedStatus: "retained", byteSize: pin.bytes, sha256: pin.sha256, kind: pin.kind, parentIds: [...pin.parentIds] };
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256 || lock.entries.filter((entry) => entry.id === pin.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === pin.id)), expected)) throw new Error(`MISSOURI_2022_SOURCE_BINDING_INVALID:${pin.id}`);
  }
  if (!/Missouri Office of Secretary of State\s+OFFICIAL RESULTS\s+Primary Election - August 2, 2022/.test(text)) throw new Error("MISSOURI_2022_DOCUMENT_IDENTITY_INVALID");
  if (!/U\.S\. Representative[\s\S]*?District 1[\s\S]*?Ron Harshaw Michael Daniels\s+Cori Bush Earl Childress Steve Roberts[\s\S]*?Total\s+5153\s+6937\s+4260\s+1065\s+1683\s+65326\s+929\s+25015/.test(text)) throw new Error("MISSOURI_2022_DISTRICT_01_INVALID");
  if (!/U\.S\. Representative[\s\S]*?District 5[\s\S]*?Emanuel Cleaver, II Maite Salazar[\s\S]*?Total\s+13246\s+5833\s+20475\s+60399\s+10147\s+589/.test(text)) throw new Error("MISSOURI_2022_DISTRICT_05_INVALID");
  const inputs = [
    { districtLabel: "MO-01" as const, names: ["Ron Harshaw", "Michael Daniels", "Cori Bush", "Earl Childress", "Steve Roberts"] as const, votes: [1065, 1683, 65326, 929, 25015] as const },
    { districtLabel: "MO-05" as const, names: ["Emanuel Cleaver, II", "Maite Salazar"] as const, votes: [60399, 10147] as const },
  ];
  const added = inputs.map(({ districtLabel, names, votes }) => {
    const totalVotes = votes.reduce<number>((sum, value) => sum + value, 0);
    const unsigned = { resultId: `mo:primary:2022:${districtLabel.slice(-2)}:democratic` as MissouriPrimaryResult2022["resultId"], cycleYear: 2022 as const, electionDate: "2022-08-02" as const, districtLabel, sourceLockIds: [PDF.id, TEXT.id] as const, rawParty: "Democratic" as const, sourceCandidateNames: names, candidateVotes: votes, totalVotes, resultAuthorityStatus: "official_primary_result_pdf_retained_no_separate_certification_instrument" as const, sourceWinnerStatus: "not_marked_by_source" as const, identity: null, scoreEligible: false as const };
    return { ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-missouri-result:v2", unsigned) };
  });
  const results = [added[0]!, added[1]!, parent.results[0]!, parent.results[1]!] as const;
  const summary = { observations: 4 as const, candidateRows: 12 as const, candidateVotes: 354070 as const, scoreEligibleRows: 0 as const };
  if (results.reduce((sum, row) => sum + row.totalVotes, 0) !== summary.candidateVotes || results.some((row) => row.identity !== null || row.sourceWinnerStatus !== "not_marked_by_source" || row.scoreEligible)) throw new Error("MISSOURI_RESULTS_V2_CLOSURE_INVALID");
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-missouri-result-set:v2", results);
  const unsigned = { schema: "rapid-house-primary-missouri-results-v2" as const, version: 2 as const, parentPackageSha256: parent.packageSha256, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-missouri-package:v2", unsigned) };
}
export function validateMissouriPrimaryResultsV2(value: unknown, root = process.cwd()): MissouriPrimaryResultsV2 { const expected = buildMissouriPrimaryResultsV2(root); if (!exact(value, expected)) throw new Error("MISSOURI_RESULTS_V2_INVALID"); return value as MissouriPrimaryResultsV2; }
