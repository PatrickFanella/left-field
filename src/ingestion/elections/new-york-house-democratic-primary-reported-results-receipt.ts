import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";

export const NEW_YORK_HOUSE_DEMOCRATIC_PRIMARY_REPORTED_RESULTS_V1 = "new-york-house-democratic-primary-reported-results-receipt-v1" as const;
export const NEW_YORK_REPORTED_CONTEST_SET_SHA256 = "f0b4ebcae9dee7cb689503dc9a4532d140e963c3df2dcc9ebbdd1cef358447d6" as const;
export const NEW_YORK_REPORTED_PACKAGE_SHA256 = "5ba3280bd2a837281877a0fb70979b42501afd6e7e9d8567149e1b22942e125b" as const;
const METHODOLOGY_PACKAGE = "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" as const;
const EXPECTED = [
  [2022, "03", "258"], [2022, "16", "259"], [2022, "17", "260"], [2022, "18", "263"], [2022, "19", "264"], [2022, "20", "265"], [2022, "21", "266"], [2022, "22", "267"], [2022, "26", "271"],
  [2024, "16", "5580"], [2024, "22", "5567"],
] as const;
const ADMIN = ["Scattering", "Blank", "Void"] as const;
const GATES = ["retain_complete_state_contest_universe_and_no_contest_dispositions", "retain_independent_final_certification", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification"] as const;
type Cycle = 2022 | 2024;
type Bytes = Buffer | Uint8Array | string;
export type NewYorkSourceEntry = Readonly<{ id: string; url: string; retainedPath: string; retainedStatus: "retained"; byteSize: number; sha256: string; kind: "source"; parentIds: readonly string[] }>;
export type NewYorkReportedResultInput = Readonly<{ entry: NewYorkSourceEntry; bytes: Bytes }>;
type Candidate = Readonly<{ candidateName: string; votes: number }>;
type County = Readonly<{ countyName: string; candidateVotes: readonly number[]; scattering: number; blank: number; void: number; totalVotes: number }>;
export type NewYorkReportedContest = Readonly<{
  contestId: string; contestSha256: string; cycleYear: Cycle; electionDate: "2022-08-23" | "2024-06-25"; stateCode: "NY"; districtCode: string; authorityContestId: string;
  sourceLockId: string; sourceFileSha256: string; resultDocumentSourceLockId: string; office: "U.S. Representative"; stage: "primary"; party: "Democratic";
  resultStatus: "official_reported_contest_candidate"; certificationStatus: "not_independently_retained"; candidates: readonly Candidate[];
  scattering: number; blank: number; void: number; totalVotes: number; counties: readonly County[]; horizontalReconciliation: "exact"; verticalReconciliation: "exact";
  incumbentIdentityStatus: "not_reviewed"; historicalGeographyStatus: "not_reviewed"; scoreEligible: false;
  evaluatorValues: Readonly<{ priorPrimaryMargin: null; priorDemocraticPrimaryVotes: null; priorProgressivePrimaryShare: null }>;
}>;
export type NewYorkReportedResultsReceipt = Readonly<{
  schema: typeof NEW_YORK_HOUSE_DEMOCRATIC_PRIMARY_REPORTED_RESULTS_V1; version: 1; generatedAt: "2026-08-05T14:00:00.000Z"; sourceCutoff: "2026-08-05"; reviewerOnly: true; publicationEligible: false;
  review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null }>;
  methodologyParent: Readonly<{ sourceLockId: "house-democratic-primary-source-selection-proposal-20260804-v1"; packageSha256: typeof METHODOLOGY_PACKAGE }>;
  originalPublisher: "New York State Board of Elections result system"; status: "reported_contest_corpus_candidate"; certificationStatus: "not_independently_retained";
  resultDocuments: readonly NewYorkSourceEntry[]; sources: readonly NewYorkSourceEntry[]; contests: readonly NewYorkReportedContest[];
  stateUniverseClosure: Readonly<{ expectedCongressionalDistrictsPerCycle: 26; observedReportedContests2022: 9; observedReportedContests2024: 2; unclassifiedDistricts2022: 17; unclassifiedDistricts2024: 24; status: "incomplete_missing_no_contest_disposition_authority"; absenceNeverMeansZero: true }>;
  june2022Event: Readonly<{ date: "2022-06-28"; houseContestStatus: "researched_not_source_locked_do_not_use" }>;
  unresolvedGates: readonly ["retain_complete_state_contest_universe_and_no_contest_dispositions", "retain_independent_final_certification", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification"];
  summary: Readonly<{ cycles: 2; reportedContests: 11; candidates: number; candidateVotes: number; administrativeVotes: number; totalVotes: number; counties: number; contestSetSha256: string; evaluatorNumericValues: 0; scoreEligibleContests: 0 }>;
  packageSha256: string;
}>;

export class NewYorkReportedResultsError extends Error { constructor(readonly code: string) { super(`New York reported primary results rejected: ${code}`); this.name = "NewYorkReportedResultsError"; } }
const fail = (code: string): never => { throw new NewYorkReportedResultsError(code); };
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const bytewise = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const bytes = (value: Bytes): Buffer => typeof value === "string" ? Buffer.from(value) : Buffer.from(value);

function csvRows(text: string): string[][] {
  if (!text.length || text.includes("\0")) fail("CSV_TEXT_INVALID");
  const rows: string[][] = [], row: string[] = []; let field = "", quoted = false, start = true, closed = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]!; if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; continue; } if (closed) { if (c === ",") { row.push(field); field = ""; start = true; closed = false; continue; } if (c === "\n") { row.push(field); rows.push([...row]); row.length = 0; field = ""; start = true; closed = false; continue; } if (c === "\r" && text[i + 1] === "\n") continue; fail("CSV_POST_QUOTE_INVALID"); } if (start && c === '"') { quoted = true; start = false; continue; } if (c === ",") { row.push(field); field = ""; start = true; continue; } if (c === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push([...row]); row.length = 0; field = ""; start = true; continue; } if (c === '"') fail("CSV_UNQUOTED_QUOTE"); field += c; start = false; }
  if (quoted) fail("CSV_UNTERMINATED_QUOTE"); if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push([...row]); } return rows;
}

function coordinates(entry: NewYorkSourceEntry): { cycle: Cycle; district: string; authority: string } {
  const match = /^ny-(2022|2024)-house-democratic-primary-cd-(\d{2})-contest-(\d+)$/.exec(entry.id); if (!match) return fail("SOURCE_ID_INVALID");
  const cycle = Number(match[1]) as Cycle, district = match[2]!, authority = match[3]!;
  if (!EXPECTED.some((row) => row[0] === cycle && row[1] === district && row[2] === authority) || entry.retainedPath !== `data/source/elections/primary-results/new-york/${cycle}/ny-cd-${district}-contest-${authority}.csv` || canonicalJson(entry.parentIds) !== canonicalJson([`ny-${cycle}-house-primary-official-results-document`])) fail("SOURCE_COORDINATES_INVALID");
  return { cycle, district, authority };
}

function parse(input: NewYorkReportedResultInput): NewYorkReportedContest {
  const source = bytes(input.bytes), { cycle, district, authority } = coordinates(input.entry);
  if (source.byteLength !== input.entry.byteSize || sha(source) !== input.entry.sha256 || input.entry.retainedStatus !== "retained" || input.entry.kind !== "source") fail("SOURCE_RECEIPT_MISMATCH");
  const rows = csvRows(new TextDecoder("utf-8", { fatal: true }).decode(source)); if (rows.length < 4 || rows[0]!.length !== rows[1]!.length || rows.some((row) => row.length !== rows[0]!.length)) fail("CROSSTAB_SHAPE_INVALID");
  const names = rows[0]!, parties = rows[1]!; if (names[0] !== "" || names[1] !== "" || parties[0] !== "" || parties[1] !== "") fail("CROSSTAB_LEADING_COLUMNS_INVALID");
  const candidateIndexes: number[] = []; for (let i = 2; i < names.length; i++) if (parties[i] === "Democratic") candidateIndexes.push(i);
  if (!candidateIndexes.length || candidateIndexes.some((i) => !names[i]) || new Set(candidateIndexes.map((i) => names[i])).size !== candidateIndexes.length) fail("CANDIDATE_HEADER_INVALID");
  const adminIndexes = ADMIN.map((name) => names.indexOf(name)); const totalIndex = names.indexOf("Total Votes");
  if (adminIndexes.some((i) => i < 0) || totalIndex < 0 || new Set([...candidateIndexes, ...adminIndexes, totalIndex]).size !== names.length - 2 || [...adminIndexes, totalIndex].some((i) => parties[i] !== "")) fail("ADMIN_HEADER_INVALID");
  const numericRows = rows.slice(2).map((row) => { if (!row[0] || !row[1] || row.slice(2).some((value) => !/^\d+$/.test(value))) fail("CROSSTAB_ROW_INVALID"); const values = row.slice(2).map(Number); if (values.some((value) => !Number.isSafeInteger(value))) fail("CROSSTAB_NUMBER_INVALID"); const total = values[totalIndex - 2]!; if (values.slice(0, totalIndex - 2).reduce((sum, value) => sum + value, 0) !== total) fail("HORIZONTAL_RECONCILIATION_FAILED"); return { label: row[0]!, name: row[1]!, values }; });
  const districtRow = numericRows[0]!; if (districtRow.label !== "Congressional District" || districtRow.name !== String(Number(district)) || numericRows.slice(1).some((row) => row.label !== "County")) fail("ROW_SCOPE_INVALID");
  for (let column = 0; column < districtRow.values.length; column++) if (numericRows.slice(1).reduce((sum, row) => sum + row.values[column]!, 0) !== districtRow.values[column]) fail("VERTICAL_RECONCILIATION_FAILED");
  const read = (values: number[], index: number) => values[index - 2]!;
  const candidates = candidateIndexes.map((index) => ({ candidateName: names[index]!, votes: read(districtRow.values, index) }));
  const counties = numericRows.slice(1).map((row) => ({ countyName: row.name.trim(), candidateVotes: candidateIndexes.map((index) => read(row.values, index)), scattering: read(row.values, adminIndexes[0]!), blank: read(row.values, adminIndexes[1]!), void: read(row.values, adminIndexes[2]!), totalVotes: read(row.values, totalIndex) }));
  const unsigned = { contestId: `ny:${cycle}:us-house:${district}:democratic`, cycleYear: cycle, electionDate: (cycle === 2022 ? "2022-08-23" : "2024-06-25") as "2022-08-23" | "2024-06-25", stateCode: "NY" as const, districtCode: district, authorityContestId: authority, sourceLockId: input.entry.id, sourceFileSha256: input.entry.sha256, resultDocumentSourceLockId: `ny-${cycle}-house-primary-official-results-document`, office: "U.S. Representative" as const, stage: "primary" as const, party: "Democratic" as const, resultStatus: "official_reported_contest_candidate" as const, certificationStatus: "not_independently_retained" as const, candidates, scattering: read(districtRow.values, adminIndexes[0]!), blank: read(districtRow.values, adminIndexes[1]!), void: read(districtRow.values, adminIndexes[2]!), totalVotes: read(districtRow.values, totalIndex), counties, horizontalReconciliation: "exact" as const, verticalReconciliation: "exact" as const, incumbentIdentityStatus: "not_reviewed" as const, historicalGeographyStatus: "not_reviewed" as const, scoreEligible: false as const, evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null } };
  return { ...unsigned, contestSha256: digest("dsa-seats:ny-house-democratic-primary-reported-contest:v1\0", unsigned) };
}

export function buildNewYorkReportedResultsReceipt(input: Readonly<{ documents: readonly NewYorkSourceEntry[]; results: readonly NewYorkReportedResultInput[] }>): NewYorkReportedResultsReceipt {
  const documents = ([...input.documents].sort((a, b) => bytewise(a.id, b.id))).map(sourceLockContent); if (canonicalJson(documents.map((row) => row.id)) !== canonicalJson(["ny-2022-house-primary-official-results-document", "ny-2024-house-primary-official-results-document"])) fail("DOCUMENT_CLOSURE_INVALID");
  const contests = input.results.map(parse).sort((a, b) => bytewise(a.contestId, b.contestId)), sources = (input.results.map((row) => row.entry).sort((a, b) => bytewise(a.id, b.id))).map(sourceLockContent);
  const expectedIds = EXPECTED.map(([cycle, district, authority]) => `ny-${cycle}-house-democratic-primary-cd-${district}-contest-${authority}`).sort(bytewise); if (canonicalJson(sources.map((row) => row.id)) !== canonicalJson(expectedIds)) fail("RESULT_CLOSURE_INVALID");
  const contestSetSha256 = digest("dsa-seats:ny-house-democratic-primary-reported-set:v1\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const candidateVotes = contests.reduce((sum, contest) => sum + contest.candidates.reduce((subtotal, candidate) => subtotal + candidate.votes, 0), 0), administrativeVotes = contests.reduce((sum, contest) => sum + contest.scattering + contest.blank + contest.void, 0);
  const unsigned = { schema: NEW_YORK_HOUSE_DEMOCRATIC_PRIMARY_REPORTED_RESULTS_V1, version: 1 as const, generatedAt: "2026-08-05T14:00:00.000Z" as const, sourceCutoff: "2026-08-05" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null }, methodologyParent: { sourceLockId: "house-democratic-primary-source-selection-proposal-20260804-v1" as const, packageSha256: METHODOLOGY_PACKAGE }, originalPublisher: "New York State Board of Elections result system" as const, status: "reported_contest_corpus_candidate" as const, certificationStatus: "not_independently_retained" as const, resultDocuments: documents, sources, contests, stateUniverseClosure: { expectedCongressionalDistrictsPerCycle: 26 as const, observedReportedContests2022: 9 as const, observedReportedContests2024: 2 as const, unclassifiedDistricts2022: 17 as const, unclassifiedDistricts2024: 24 as const, status: "incomplete_missing_no_contest_disposition_authority" as const, absenceNeverMeansZero: true as const }, june2022Event: { date: "2022-06-28" as const, houseContestStatus: "researched_not_source_locked_do_not_use" as const }, unresolvedGates: GATES, summary: { cycles: 2 as const, reportedContests: 11 as const, candidates: contests.reduce((sum, contest) => sum + contest.candidates.length, 0), candidateVotes, administrativeVotes, totalVotes: candidateVotes + administrativeVotes, counties: contests.reduce((sum, contest) => sum + contest.counties.length, 0), contestSetSha256, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const } };
  return { ...unsigned, packageSha256: digest("dsa-seats:ny-house-democratic-primary-reported-package:v1\0", unsigned) };
}

export function validateNewYorkReportedResultsReceipt(value: NewYorkReportedResultsReceipt): NewYorkReportedResultsReceipt {
  const { packageSha256, ...unsigned } = value; const contestSet = digest("dsa-seats:ny-house-democratic-primary-reported-set:v1\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const expectedSourceIds = EXPECTED.map(([cycle, district, authority]) => `ny-${cycle}-house-democratic-primary-cd-${district}-contest-${authority}`).sort(bytewise), candidateVotes = value.contests.reduce((sum, contest) => sum + contest.candidates.reduce((subtotal, candidate) => subtotal + candidate.votes, 0), 0), administrativeVotes = value.contests.reduce((sum, contest) => sum + contest.scattering + contest.blank + contest.void, 0);
  if (packageSha256 !== NEW_YORK_REPORTED_PACKAGE_SHA256 || packageSha256 !== digest("dsa-seats:ny-house-democratic-primary-reported-package:v1\0", unsigned) || value.reviewerOnly !== true || value.publicationEligible !== false || value.certificationStatus !== "not_independently_retained" || canonicalJson(value.unresolvedGates) !== canonicalJson(GATES) || canonicalJson(value.resultDocuments.map((row) => row.id)) !== canonicalJson(["ny-2022-house-primary-official-results-document", "ny-2024-house-primary-official-results-document"]) || canonicalJson(value.sources.map((row) => row.id)) !== canonicalJson(expectedSourceIds) || value.stateUniverseClosure.status !== "incomplete_missing_no_contest_disposition_authority" || !value.stateUniverseClosure.absenceNeverMeansZero || value.summary.reportedContests !== 11 || value.summary.candidates !== value.contests.reduce((sum, contest) => sum + contest.candidates.length, 0) || value.summary.candidateVotes !== candidateVotes || value.summary.administrativeVotes !== administrativeVotes || value.summary.totalVotes !== candidateVotes + administrativeVotes || value.summary.counties !== value.contests.reduce((sum, contest) => sum + contest.counties.length, 0) || value.summary.contestSetSha256 !== NEW_YORK_REPORTED_CONTEST_SET_SHA256 || value.summary.contestSetSha256 !== contestSet || value.summary.evaluatorNumericValues !== 0 || value.summary.scoreEligibleContests !== 0 || value.contests.some((contest) => { const { contestSha256, ...row } = contest; return contestSha256 !== digest("dsa-seats:ny-house-democratic-primary-reported-contest:v1\0", row) || contest.scoreEligible || contest.certificationStatus !== "not_independently_retained" || Object.values(contest.evaluatorValues).some((item) => item !== null) || contest.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) + contest.scattering + contest.blank + contest.void !== contest.totalVotes; })) fail("PACKAGE_INVARIANT_INVALID"); return value;
}
