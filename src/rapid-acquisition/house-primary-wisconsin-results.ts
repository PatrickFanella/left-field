import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface WisconsinPrimaryResult {
  readonly resultId: `wi:primary:${2022 | 2024}:${"02" | "04"}:democratic`;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: "2022-08-09" | "2024-08-13";
  readonly districtLabel: "WI-02" | "WI-04";
  readonly sourceLockIds: readonly string[];
  readonly sourceContestId: string;
  readonly sourceOfficeTitle: string;
  readonly sourceCandidateNames: readonly string[];
  readonly candidateVotes: readonly number[];
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_state_canvass_report_retained";
  readonly certificationStatus: "official_canvass_report_no_separate_certification_instrument_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}

export interface WisconsinPrimaryResults {
  readonly schema: "rapid-house-primary-wisconsin-results-v1";
  readonly version: 1;
  readonly sources: readonly Readonly<{ cycleYear: 2022 | 2024; pdfSourceLockId: string; textSourceLockId: string }>[];
  readonly results: readonly WisconsinPrimaryResult[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ reportedContests: 4; candidateRows: 8; candidateVotes: 415288; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { cycleYear: 2022 as const, date: "2022-08-09" as const, generated: "8/26/2022 12:38:16 PM", pdf: { id: "wi-2022-primary-us-house-canvass", url: "https://elections.wi.gov/sites/default/files/documents/County%20by%20County%20Report%20-%202022%20Partisan%20Primary%20-%20Representative%20in%20Congress.pdf", path: "data/source/rapid/house-primary/wi/2022/us-house-county-canvass.pdf", bytes: 62_922, sha256: "9a921cfe761166050aaf4e8b2c83f57bd5bdbd38c1fbfd7ee746664dbaa55b99" }, text: { id: "wi-2022-primary-us-house-canvass-layout-text", url: "urn:dsa-seats:wi-2022-primary-us-house-canvass:pdftotext-layout-26.07.0", path: "data/source/rapid/house-primary/wi/2022/us-house-county-canvass-layout.txt", bytes: 47_260, sha256: "eec6844d29f41ece59838092030428bb5e08e51354a6dcf2400c4c895380f6a0" } },
  { cycleYear: 2024 as const, date: "2024-08-13" as const, generated: "8/26/2024 5:30:51 PM", pdf: { id: "wi-2024-primary-us-house-canvass", url: "https://elections.wi.gov/sites/default/files/documents/County%20by%20County%20Report_US%20Congress.pdf", path: "data/source/rapid/house-primary/wi/2024/us-house-county-canvass.pdf", bytes: 138_308, sha256: "c2a846f2abdf219b2680bbd654343e98df1993b5ea56f99718f0d0d5d6945fc7" }, text: { id: "wi-2024-primary-us-house-canvass-layout-text", url: "urn:dsa-seats:wi-2024-primary-us-house-canvass:pdftotext-layout-26.07.0", path: "data/source/rapid/house-primary/wi/2024/us-house-county-canvass-layout.txt", bytes: 57_350, sha256: "eb46a429a904921ac2bd2a11a9a445e96e02a1f11101b18f4bb16146f25c4b58" } },
] as const;
const EXPECTED = [
  { cycleYear: 2022 as const, district: "02" as const, candidate: "Mark Pocan", votes: 106_595, scattering: 198, total: 106_793 },
  { cycleYear: 2022 as const, district: "04" as const, candidate: "Gwen Moore", votes: 72_845, scattering: 325, total: 73_170 },
  { cycleYear: 2024 as const, district: "02" as const, candidate: "Mark Pocan", votes: 149_581, scattering: 316, total: 149_897 },
  { cycleYear: 2024 as const, district: "04" as const, candidate: "Gwen S. Moore", votes: 85_017, scattering: 411, total: 85_428 },
] as const;

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const exact = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const number = (value: string) => Number(value.split(",").join(""));

export function buildWisconsinPrimaryResults(root = process.cwd()): WisconsinPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const sourceText = new Map<number, string>();
  for (const source of SOURCES) {
    const pdf = readFileSync(join(root, source.pdf.path)), text = readFileSync(join(root, source.text.path));
    const pdfLock = { id: source.pdf.id, url: source.pdf.url, retainedPath: source.pdf.path, retainedStatus: "retained", byteSize: source.pdf.bytes, sha256: source.pdf.sha256, kind: "official_canvass_report", parentIds: [] };
    const textLock = { id: source.text.id, url: source.text.url, retainedPath: source.text.path, retainedStatus: "retained", byteSize: source.text.bytes, sha256: source.text.sha256, kind: "derived_extract", parentIds: [source.pdf.id] };
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || pdf.length !== source.pdf.bytes || sha(pdf) !== source.pdf.sha256 || text.length !== source.text.bytes || sha(text) !== source.text.sha256 || lock.entries.filter((entry) => entry.id === source.pdf.id).length !== 1 || lock.entries.filter((entry) => entry.id === source.text.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.pdf.id)), pdfLock) || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.text.id)), textLock)) throw new Error(`WISCONSIN_PRIMARY_SOURCE_BINDING_INVALID:${source.cycleYear}`);
    const value = text.toString("utf8");
    if (!value.includes(`WEC Canvass Reporting System`) || !value.includes(`${source.cycleYear} Partisan Primary`) || !value.includes(`Report Generated - ${source.generated}`)) throw new Error(`WISCONSIN_PRIMARY_DOCUMENT_IDENTITY_INVALID:${source.cycleYear}`);
    sourceText.set(source.cycleYear, value);
  }

  const results = EXPECTED.map((expected) => {
    const source = SOURCES.find((item) => item.cycleYear === expected.cycleYear)!;
    const heading = `REPRESENTATIVE IN CONGRESS DISTRICT ${Number(expected.district)} - Democratic`;
    const raw = sourceText.get(expected.cycleYear)!;
    const start = raw.indexOf(heading), end = raw.indexOf("Report Generated -", start);
    if (start < 0 || end < 0 || raw.indexOf(heading, start + 1) >= 0) throw new Error(`WISCONSIN_PRIMARY_CONTEST_CLOSURE_INVALID:${expected.cycleYear}:${expected.district}`);
    const section = raw.slice(start, end).replace(/\s+/g, " ").trim();
    const totals = section.match(/Office Totals:\s*([\d,]+)\s+([\d,]+)\s+([\d,]+)$/);
    if (!section.includes(expected.candidate) || !section.includes("SCATTERING") || !totals || number(totals[1]!) !== expected.total || number(totals[2]!) !== expected.votes || number(totals[3]!) !== expected.scattering || expected.votes + expected.scattering !== expected.total) throw new Error(`WISCONSIN_PRIMARY_CONTEST_INVALID:${expected.cycleYear}:${expected.district}`);
    const unsigned = { resultId: `wi:primary:${expected.cycleYear}:${expected.district}:democratic` as const, cycleYear: expected.cycleYear, electionDate: source.date, districtLabel: `WI-${expected.district}` as const, sourceLockIds: [source.pdf.id, source.text.id], sourceContestId: heading, sourceOfficeTitle: heading, sourceCandidateNames: [expected.candidate, "SCATTERING"], candidateVotes: [expected.votes, expected.scattering], totalVotes: expected.total, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_state_canvass_report_retained" as const, certificationStatus: "official_canvass_report_no_separate_certification_instrument_retained" as const, winnerIdentity: null, identity: null, scoreEligible: false as const };
    return { ...unsigned, resultSha256: hash("dsa-seats:rapid-house-primary-wisconsin-result:v1", unsigned) } as WisconsinPrimaryResult;
  });
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-wisconsin-result-set:v1", results);
  const summary = { reportedContests: 4 as const, candidateRows: 8 as const, candidateVotes: 415288 as const, scoreEligibleRows: 0 as const };
  const sources = SOURCES.map((source) => ({ cycleYear: source.cycleYear, pdfSourceLockId: source.pdf.id, textSourceLockId: source.text.id }));
  const unsigned = { schema: "rapid-house-primary-wisconsin-results-v1" as const, version: 1 as const, sources, results, resultSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-wisconsin-package:v1", unsigned) };
}

export function validateWisconsinPrimaryResults(value: unknown, root = process.cwd()): WisconsinPrimaryResults {
  const expected = buildWisconsinPrimaryResults(root);
  if (!exact(value, expected)) throw new Error("WISCONSIN_PRIMARY_RESULTS_INVALID");
  return value as WisconsinPrimaryResults;
}
