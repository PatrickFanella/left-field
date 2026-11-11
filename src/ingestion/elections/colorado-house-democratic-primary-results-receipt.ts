import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import type { NewYorkSourceEntry } from "./new-york-house-democratic-primary-reported-results-receipt";

export const COLORADO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1 = "colorado-house-democratic-primary-results-2022-2026-v1" as const;
export const COLORADO_PRIMARY_CONTEST_SET_SHA256 = "b1619063732c5ea17bc37e473239abb18faa3dc948671420b98357e58fd26116";
export const COLORADO_PRIMARY_PACKAGE_SHA256 = "c5f2e3c5bda8b027b9879911e07a99d3623a656a5aa717a5408079dc15bf4b55";
type Cycle = 2022 | 2024 | 2026;
type Bytes = Buffer | Uint8Array | string;
export type ColoradoPrimaryInput = Readonly<{ entry: NewYorkSourceEntry; bytes: Bytes }>;
type Candidate = Readonly<{ sourceCandidateName: string; candidacyKind: "named_candidate" | "named_write_in"; votes: number }>;
type CountyRow = Readonly<{ county: string; votes: readonly number[]; sourceTotalVotes: number }>;
type Authority = "official_secretary_abstract" | "official_certified_biennial_abstract" | "signed_secretary_statewide_abstract";
type Certification = "certification_announcement_and_signed_statewide_abstract_retained" | "certified_publication_no_separate_signed_certificate_retained" | "signed_secretary_certificate_bound_to_abstract";
type Contest = Readonly<{
  contestId: string;
  contestSha256: string;
  cycleYear: Cycle;
  electionDate: "2022-06-28" | "2024-06-25" | "2026-06-30";
  stateCode: "CO";
  districtCode: string;
  party: "Democratic";
  office: "U.S. House of Representatives";
  sourceLockIds: readonly string[];
  resultAuthorityStatus: Authority;
  certificationStatus: Certification;
  reportingCompleteness: "all_source_county_rows_reconciled_to_candidate_and_district_totals";
  candidates: readonly Candidate[];
  countyRows: readonly CountyRow[];
  sourceTotalVotes: number;
  voteReconciliation: "county_candidate_matrix_equals_candidate_and_district_totals";
  sourceWinnerStatus: "not_marked_by_source";
  winnerSourceCandidateName: null;
  currentIdentityStatus: "not_reviewed";
  geographyStatus: "not_reviewed";
  selectionStatus: "unselected";
  scoreEligible: false;
  evaluatorValues: Readonly<{ priorPrimaryMargin: null; priorDemocraticPrimaryVotes: null; priorProgressivePrimaryShare: null }>;
}>;
type CycleSummary = Readonly<{ cycleYear: Cycle; electionDate: Contest["electionDate"]; resultAuthorityStatus: Authority; certificationStatus: Certification; districtContests: 8; sourceLockIds: readonly string[] }>;
export type ColoradoPrimaryResultsReceipt = Readonly<{
  schema: typeof COLORADO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1;
  version: 1;
  generatedAt: "2026-08-06T16:00:00.000Z";
  sourceCutoff: "2026-08-06";
  reviewerOnly: true;
  publicationEligible: false;
  review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null; resolution: null }>;
  originalPublisher: "Colorado Secretary of State";
  status: "official_abstract_result_candidate";
  licenseOrReuseTerms: "not_stated_by_source";
  parentProposal: Readonly<{ id: "house-democratic-primary-source-selection-proposal-20260804-v1"; fileSha256: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1"; packageSha256: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" }>;
  decisionSupport: readonly Readonly<{ decisionId: string; lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" }>[];
  inheritedDecisionResolutions: readonly Readonly<{ decisionId: string; resolution: null }>[];
  cycles: readonly CycleSummary[];
  sources: readonly NewYorkSourceEntry[];
  contests: readonly Contest[];
  summary: Readonly<{ contests: 24; contests2022: 8; contests2024: 8; contests2026: 8; countyRows: 249; zeroVoteCountyRows: 7; candidates: 39; namedWriteInCandidates: 2; candidateVotes: 1800710; targetDistrictCycleRows: 12; evaluatorNumericValues: 0; scoreEligibleContests: 0; contestSetSha256: string }>;
  limitations: readonly string[];
  unresolvedGates: readonly string[];
  packageSha256: string;
}>;

const EXPECTED: Readonly<Record<string, Readonly<{ url: string; path: string; size: number; hash: string; kind: string; parents: readonly string[] }>>> = {
  "co-2022-primary-certification-announcement": { url: "https://www.coloradosos.gov/pubs/newsRoom/pressReleases/2022/PR20220725PrimaryCertification.html", path: "data/source/elections/primary-results/colorado/2022/certification-announcement.html", size: 31898, hash: "68844cf221707fd6460bfdcc7b442b9e1dc2db41ea7be49ad4483e66ab2ad5c6", kind: "official_certification_announcement", parents: [] },
  "co-2022-primary-signed-statewide-abstract": { url: "https://www.coloradosos.gov/pubs/newsRoom/pressReleases/2022/2022StatePrimaryAbstract.pdf", path: "data/source/elections/primary-results/colorado/2022/state-primary-certificate-and-statewide-abstract.pdf", size: 665510, hash: "b6d17a430a10bfd55bcaf7fa05a20689bb67020026d0ef75dd5247f015ecc004", kind: "official_signed_statewide_abstract", parents: ["co-2022-primary-certification-announcement"] },
  "co-2022-democratic-us-house-official-abstract": { url: "https://www.coloradosos.gov/pubs/elections/Results/Abstract/2022/primary/democratic/usRepresentatives.html", path: "data/source/elections/primary-results/colorado/2022/democratic-us-house-official-abstract.html", size: 51812, hash: "44f1b5bad3cabf2370e6996dc0680736ad237fe780ba03ae913e44428898d149", kind: "official_statewide_abstract_result", parents: ["co-2022-primary-signed-statewide-abstract"] },
  "co-2024-biennial-certified-abstract": { url: "https://www.coloradosos.gov/pubs/elections/Results/2024/2024BiennialAbstract.pdf", path: "data/source/elections/primary-results/colorado/2024/2024-biennial-abstract.pdf", size: 3804176, hash: "68f9513cced12bf82b651bae9bc641e594ac0b5441670306eb07b9a158ed23f5", kind: "official_certified_biennial_abstract", parents: [] },
  "co-2024-democratic-us-house-normalized-transcription": { url: "urn:dsa-seats:colorado:2024-biennial-abstract:democratic-us-house:normalized-v1", path: "data/source/elections/primary-results/colorado/2024/democratic-us-house-normalized.json", size: 13355, hash: "a8d9bab1f0d62afaa49e3c7680576a0c2a0460563c71fa7d017d6a1d314bc112", kind: "derived_extract", parents: ["co-2024-biennial-certified-abstract"] },
  "co-2026-primary-signed-statewide-abstract": { url: "https://www.coloradosos.gov/pubs/elections/Results/2026/2026PrimaryStateAbstractofResultsCast.pdf", path: "data/source/elections/primary-results/colorado/2026/state-primary-signed-statewide-abstract.pdf", size: 646208, hash: "807e10067804ca143853d15d13c8a0807dde64aed918a645ffd9428f035ff7aa", kind: "official_signed_statewide_abstract", parents: [] },
  "co-2026-democratic-us-house-normalized-transcription": { url: "urn:dsa-seats:colorado:2026-signed-statewide-abstract:democratic-us-house:visually-verified-normalized-v1", path: "data/source/elections/primary-results/colorado/2026/democratic-us-house-normalized.json", size: 14012, hash: "31aa5a37ec0e08da76113c65dcae0ce05d559c054c8869a6c49e7aa0c6434f40", kind: "derived_extract", parents: ["co-2026-primary-signed-statewide-abstract"] },
};
const IDS = Object.keys(EXPECTED).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const SOURCE_IDS: Readonly<Record<Cycle, readonly string[]>> = {
  2022: ["co-2022-primary-certification-announcement", "co-2022-primary-signed-statewide-abstract", "co-2022-democratic-us-house-official-abstract"],
  2024: ["co-2024-biennial-certified-abstract", "co-2024-democratic-us-house-normalized-transcription"],
  2026: ["co-2026-primary-signed-statewide-abstract", "co-2026-democratic-us-house-normalized-transcription"],
};
const CYCLE: Readonly<Record<Cycle, Readonly<{ date: Contest["electionDate"]; authority: Authority; certification: Certification }>>> = {
  2022: { date: "2022-06-28", authority: "official_secretary_abstract", certification: "certification_announcement_and_signed_statewide_abstract_retained" },
  2024: { date: "2024-06-25", authority: "official_certified_biennial_abstract", certification: "certified_publication_no_separate_signed_certificate_retained" },
  2026: { date: "2026-06-30", authority: "signed_secretary_statewide_abstract", certification: "signed_secretary_certificate_bound_to_abstract" },
};
const COUNTY_COUNTS = [3, 12, 27, 21, 1, 5, 11, 3] as const;
const DECISIONS = ["collect-official-state-primary-results-and-certification-v1", "decide-nonstandard-primary-disposition-treatment-v1"] as const;
const LIMITATIONS = [
  "The retained 2022 certification announcement binds the official result page to the separately retained signed statewide abstract; the HTML result table supplies the machine-readable county matrix.",
  "The 2024 Biennial Abstract explicitly describes its primary results as official and certified, but no separate signed certificate is retained for that cycle.",
  "The image-only 2026 abstract contains the Secretary's signed certificate; its normalized Democratic House tables are a visually checked extraction aid, while the retained PDF remains authoritative.",
  "Colorado Secretary of State reuse terms do not state an open-data license for these publications, so this reviewer-only receipt records licenseOrReuseTerms as not_stated_by_source.",
  "Source candidate names and named write-ins are retained as reported; no winner, current-incumbent identity, historical-geography compatibility, progressive classification, selection, evaluator value, or publication approval is inferred.",
] as const;
const GATES = ["review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification", "complete_human_data_review_and_publication_approval"] as const;
const fail = (code: string): never => { throw new Error(`Colorado primary results rejected: ${code}`); };
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const bytes = (value: Bytes) => typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
const bytewise = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const integer = (value: string): number => { const normalized = value.split(",").join(""); if (!/^(?:0|[1-9]\d*)$/.test(normalized)) fail("INTEGER_INVALID"); return Number(normalized); };
const text = (value: string): string => value.replace(/<[^>]+>/g, "").split("&amp;").join("&").split("&#8217;").join("’").split("&#8220;").join("“").split("&#8221;").join("”").trim();

function checked(input: ColoradoPrimaryInput): Buffer {
  const expected = EXPECTED[input.entry.id], value = bytes(input.bytes);
  if (!expected || input.entry.url !== expected.url || input.entry.retainedPath !== expected.path || input.entry.retainedStatus !== "retained" || input.entry.byteSize !== expected.size || input.entry.sha256 !== expected.hash || input.entry.kind !== expected.kind || canonicalJson(input.entry.parentIds) !== canonicalJson(expected.parents) || value.length !== expected.size || sha(value) !== expected.hash) fail("SOURCE_RECEIPT_INVALID");
  return value;
}

type ParsedTable = Readonly<{ districtCode: string; candidates: readonly Candidate[]; countyRows: readonly CountyRow[]; sourceTotalVotes: number }>;
function validateTables(value: unknown, cycleYear: Cycle): readonly ParsedTable[] {
  if (!Array.isArray(value) || value.length !== 8) fail("TABLE_SET_INVALID");
  const tables = value as ParsedTable[];
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index]!, districtCode = String(index + 1).padStart(2, "0");
    if (table.districtCode !== districtCode || !Array.isArray(table.candidates) || !table.candidates.length || !Array.isArray(table.countyRows) || table.countyRows.length !== COUNTY_COUNTS[index] || new Set(table.countyRows.map((row) => row.county)).size !== table.countyRows.length || !Number.isSafeInteger(table.sourceTotalVotes) || table.sourceTotalVotes < 0) fail("TABLE_SHAPE_INVALID");
    if (table.candidates.some((candidate) => !candidate.sourceCandidateName || !["named_candidate", "named_write_in"].includes(candidate.candidacyKind) || !Number.isSafeInteger(candidate.votes) || candidate.votes < 0) || new Set(table.candidates.map((candidate) => candidate.sourceCandidateName)).size !== table.candidates.length) fail("CANDIDATE_INVALID");
    if (table.countyRows.some((row) => !row.county || row.county === "Total" || !Array.isArray(row.votes) || row.votes.length !== table.candidates.length || row.votes.some((votes) => !Number.isSafeInteger(votes) || votes < 0) || !Number.isSafeInteger(row.sourceTotalVotes) || row.sourceTotalVotes < 0 || row.votes.reduce((sum, votes) => sum + votes, 0) !== row.sourceTotalVotes)) fail("COUNTY_ROW_INVALID");
    if (table.candidates.some((candidate, candidateIndex) => candidate.votes !== table.countyRows.reduce((sum, row) => sum + row.votes[candidateIndex]!, 0)) || table.sourceTotalVotes !== table.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) || table.sourceTotalVotes !== table.countyRows.reduce((sum, row) => sum + row.sourceTotalVotes, 0)) fail("VOTE_RECONCILIATION_INVALID");
  }
  const expectedCandidates = cycleYear === 2026 ? 15 : 12, expectedVotes = cycleYear === 2022 ? 508675 : cycleYear === 2024 ? 475390 : 816645;
  if (tables.reduce((sum, table) => sum + table.candidates.length, 0) !== expectedCandidates || tables.reduce((sum, table) => sum + table.sourceTotalVotes, 0) !== expectedVotes) fail("CYCLE_TOTAL_INVALID");
  return tables;
}

function parse2022(html: string): readonly ParsedTable[] {
  if (!html.includes("Representative to the 118th United States Congress") || !html.includes("Colorado Secretary of State")) fail("RESULT_2022_AUTHORITY_INVALID");
  const tables: ParsedTable[] = [];
  for (let district = 1; district <= 8; district++) {
    const districtCode = String(district).padStart(2, "0"), heading = new RegExp(`<h3[^>]*>District ${district}</h3>`), start = html.search(heading); if (start < 0) fail("RESULT_2022_DISTRICT_MISSING");
    const remainder = html.slice(start), tableMatch = remainder.match(/<table[^>]*>([\s\S]*?)<\/table>/); if (tableMatch === null) return fail("RESULT_2022_TABLE_MISSING");
    const tableBody = tableMatch[1]!, header = [...tableBody.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => text(match[1])); if (header[0] !== "County" || header.at(-1) !== "Total" || header.length < 3) fail("RESULT_2022_HEADER_INVALID");
    const names = header.slice(1, -1).map((name) => name.replace(/\s*\(DEM\)$/, ""));
    const rows = [...tableBody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]))).filter((row) => row.length > 0);
    const parsed = rows.map((row) => ({ county: row[0]!, votes: row.slice(1, -1).map(integer), sourceTotalVotes: integer(row.at(-1)!) })), total = parsed.pop();
    if (total === undefined) return fail("RESULT_2022_TABLE_SHAPE_INVALID");
    if (total.county !== "Total" || parsed.length !== COUNTY_COUNTS[district - 1]) fail("RESULT_2022_TABLE_SHAPE_INVALID");
    tables.push({ districtCode, candidates: names.map((sourceCandidateName, index) => ({ sourceCandidateName, candidacyKind: "named_candidate" as const, votes: total.votes[index]! })), countyRows: parsed, sourceTotalVotes: total.sourceTotalVotes });
  }
  return validateTables(tables, 2022);
}

function addContest(contests: Contest[], cycleYear: Cycle, table: ParsedTable): void {
  const cycle = CYCLE[cycleYear], unsigned = {
    contestId: `co:${cycleYear}:us-house:${table.districtCode}:democratic`, cycleYear, electionDate: cycle.date, stateCode: "CO" as const, districtCode: table.districtCode, party: "Democratic" as const, office: "U.S. House of Representatives" as const,
    sourceLockIds: SOURCE_IDS[cycleYear], resultAuthorityStatus: cycle.authority, certificationStatus: cycle.certification, reportingCompleteness: "all_source_county_rows_reconciled_to_candidate_and_district_totals" as const,
    candidates: table.candidates, countyRows: table.countyRows, sourceTotalVotes: table.sourceTotalVotes, voteReconciliation: "county_candidate_matrix_equals_candidate_and_district_totals" as const,
    sourceWinnerStatus: "not_marked_by_source" as const, winnerSourceCandidateName: null, currentIdentityStatus: "not_reviewed" as const, geographyStatus: "not_reviewed" as const, selectionStatus: "unselected" as const, scoreEligible: false as const,
    evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null },
  };
  contests.push({ ...unsigned, contestSha256: digest("dsa-seats:co-house-democratic-primary-result:v1\0", unsigned) });
}

export function buildColoradoPrimaryResultsReceipt(inputs: readonly ColoradoPrimaryInput[]): ColoradoPrimaryResultsReceipt {
  const byId = new Map(inputs.map((input) => [input.entry.id, input])); if (inputs.length !== IDS.length || byId.size !== IDS.length || IDS.some((id) => !byId.has(id))) fail("SOURCE_CLOSURE_INVALID");
  for (const input of inputs) checked(input);
  const announcement = checked(byId.get("co-2022-primary-certification-announcement")!).toString("utf8");
  if (!announcement.includes("announced the certification of the 2022 Primary Election") || !announcement.includes("signed off on the final results") || !announcement.includes("2022StatePrimaryAbstract.pdf") || !announcement.includes("2022 State Primary Certificate including the Statewide Abstract")) fail("RESULT_2022_CERTIFICATION_INVALID");
  const signed2022 = checked(byId.get("co-2022-primary-signed-statewide-abstract")!), abstract2024 = checked(byId.get("co-2024-biennial-certified-abstract")!), signed2026 = checked(byId.get("co-2026-primary-signed-statewide-abstract")!);
  if (!signed2022.subarray(0, 5).equals(Buffer.from("%PDF-")) || !abstract2024.subarray(0, 5).equals(Buffer.from("%PDF-")) || !signed2026.subarray(0, 5).equals(Buffer.from("%PDF-"))) fail("PDF_SIGNATURE_INVALID");
  const parsed2024 = JSON.parse(checked(byId.get("co-2024-democratic-us-house-normalized-transcription")!).toString("utf8")) as unknown, parsed2026 = JSON.parse(checked(byId.get("co-2026-democratic-us-house-normalized-transcription")!).toString("utf8")) as unknown;
  const tables: Readonly<Record<Cycle, readonly ParsedTable[]>> = { 2022: parse2022(checked(byId.get("co-2022-democratic-us-house-official-abstract")!).toString("utf8")), 2024: validateTables(parsed2024, 2024), 2026: validateTables(parsed2026, 2026) };
  const contests: Contest[] = []; for (const cycleYear of [2022, 2024, 2026] as const) for (const table of tables[cycleYear]) addContest(contests, cycleYear, table);
  const contestSetSha256 = digest("dsa-seats:co-house-democratic-primary-result-set:v1\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 }))), sources = (inputs.map((input) => input.entry).sort((left, right) => bytewise(left.id, right.id))).map(sourceLockContent);
  const cycles = ([2022, 2024, 2026] as const).map((cycleYear) => ({ cycleYear, electionDate: CYCLE[cycleYear].date, resultAuthorityStatus: CYCLE[cycleYear].authority, certificationStatus: CYCLE[cycleYear].certification, districtContests: 8 as const, sourceLockIds: SOURCE_IDS[cycleYear] }));
  const unsigned = {
    schema: COLORADO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1, version: 1 as const, generatedAt: "2026-08-06T16:00:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null }, originalPublisher: "Colorado Secretary of State" as const, status: "official_abstract_result_candidate" as const, licenseOrReuseTerms: "not_stated_by_source" as const,
    parentProposal: { id: "house-democratic-primary-source-selection-proposal-20260804-v1" as const, fileSha256: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1" as const, packageSha256: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" as const },
    decisionSupport: DECISIONS.map((decisionId) => ({ decisionId, lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" as const })), inheritedDecisionResolutions: DECISIONS.map((decisionId) => ({ decisionId, resolution: null })), cycles, sources, contests,
    summary: { contests: 24 as const, contests2022: 8 as const, contests2024: 8 as const, contests2026: 8 as const, countyRows: 249 as const, zeroVoteCountyRows: 7 as const, candidates: 39 as const, namedWriteInCandidates: 2 as const, candidateVotes: 1800710 as const, targetDistrictCycleRows: 12 as const, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const, contestSetSha256 },
    limitations: LIMITATIONS, unresolvedGates: GATES,
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:co-house-democratic-primary-result-package:v1\0", unsigned) };
}

export function validateColoradoPrimaryResultsReceipt(value: ColoradoPrimaryResultsReceipt): ColoradoPrimaryResultsReceipt {
  const { packageSha256, ...unsigned } = value, contestSetSha256 = digest("dsa-seats:co-house-democratic-primary-result-set:v1\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 }))), candidates = value.contests.reduce((sum, contest) => sum + contest.candidates.length, 0), countyRows = value.contests.reduce((sum, contest) => sum + contest.countyRows.length, 0), votes = value.contests.reduce((sum, contest) => sum + contest.sourceTotalVotes, 0), writeIns = value.contests.reduce((sum, contest) => sum + contest.candidates.filter((candidate) => candidate.candidacyKind === "named_write_in").length, 0), zeroRows = value.contests.reduce((sum, contest) => sum + contest.countyRows.filter((row) => row.sourceTotalVotes === 0).length, 0);
  if (value.schema !== COLORADO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1 || value.version !== 1 || value.sourceCutoff !== "2026-08-06" || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null || value.licenseOrReuseTerms !== "not_stated_by_source" || packageSha256 !== COLORADO_PRIMARY_PACKAGE_SHA256 || packageSha256 !== digest("dsa-seats:co-house-democratic-primary-result-package:v1\0", unsigned) || contestSetSha256 !== COLORADO_PRIMARY_CONTEST_SET_SHA256 || value.summary.contestSetSha256 !== contestSetSha256 || value.contests.length !== 24 || candidates !== 39 || countyRows !== 249 || votes !== 1800710 || writeIns !== 2 || zeroRows !== 7 || value.summary.candidates !== candidates || value.summary.countyRows !== countyRows || value.summary.candidateVotes !== votes || value.summary.namedWriteInCandidates !== writeIns || value.summary.zeroVoteCountyRows !== zeroRows || canonicalJson(value.limitations) !== canonicalJson(LIMITATIONS) || canonicalJson(value.unresolvedGates) !== canonicalJson(GATES)) fail("PACKAGE_INVARIANT_INVALID");
  if (value.contests.some((contest, index) => { const { contestSha256, ...rest } = contest, expectedCycle = ([2022, 2024, 2026] as const)[Math.floor(index / 8)], expectedDistrict = String((index % 8) + 1).padStart(2, "0"); return contest.contestId !== `co:${expectedCycle}:us-house:${expectedDistrict}:democratic` || contest.cycleYear !== expectedCycle || contest.districtCode !== expectedDistrict || contestSha256 !== digest("dsa-seats:co-house-democratic-primary-result:v1\0", rest) || contest.countyRows.length !== COUNTY_COUNTS[index % 8] || contest.countyRows.some((row) => row.votes.length !== contest.candidates.length || row.votes.reduce((sum, item) => sum + item, 0) !== row.sourceTotalVotes) || contest.candidates.some((candidate, candidateIndex) => candidate.votes !== contest.countyRows.reduce((sum, row) => sum + row.votes[candidateIndex]!, 0)) || contest.sourceTotalVotes !== contest.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) || contest.sourceWinnerStatus !== "not_marked_by_source" || contest.winnerSourceCandidateName !== null || contest.currentIdentityStatus !== "not_reviewed" || contest.geographyStatus !== "not_reviewed" || contest.selectionStatus !== "unselected" || contest.scoreEligible || Object.values(contest.evaluatorValues).some((item) => item !== null); })) fail("PACKAGE_INVARIANT_INVALID");
  return value;
}
