import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  validateOhioPrimaryResultsReceipt,
  type OhioPrimaryResultsReceipt,
} from "./ohio-house-democratic-primary-results-receipt";
import type { NewYorkSourceEntry } from "./new-york-house-democratic-primary-reported-results-receipt";

const fail = (code: string): never => { throw new Error(`Ohio primary results v2 rejected: ${code}`); };
const countyFail = (code: string): never => { throw new Error(`Ohio 2022 county results rejected: ${code}`); };
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

type Candidate = Readonly<{ sourceCandidateName: string; candidacyKind: "named_candidate"; votes: number }>;
export type Ohio2022CountyResult = Readonly<{
  county: "Hamilton" | "Franklin" | "Wood" | "Cuyahoga" | "Summit";
  districtCode: "01" | "03" | "09" | "11" | "13";
  candidates: readonly Candidate[];
  sourceTotalVotes: number;
  precinctsReported: number | null;
  precinctsTotal: number | null;
}>;

const EXPECTED_RESULTS: Readonly<Record<string, Ohio2022CountyResult>> = {
  "oh-2022-may-primary-hamilton-official-cumulative": { county: "Hamilton", districtCode: "01", candidates: [{ sourceCandidateName: "Greg Landsman", candidacyKind: "named_candidate", votes: 23463 }], sourceTotalVotes: 23463, precinctsReported: 374, precinctsTotal: 374 },
  "oh-2022-may-primary-franklin-official-group-detail": { county: "Franklin", districtCode: "03", candidates: [{ sourceCandidateName: "Joyce Beatty", candidacyKind: "named_candidate", votes: 48241 }], sourceTotalVotes: 48241, precinctsReported: 543, precinctsTotal: 543 },
  "oh-2022-may-primary-wood-official-summary": { county: "Wood", districtCode: "09", candidates: [{ sourceCandidateName: "Marcy Kaptur", candidacyKind: "named_candidate", votes: 2547 }], sourceTotalVotes: 2547, precinctsReported: 43, precinctsTotal: 43 },
  "oh-2022-may-primary-cuyahoga-official-results-by-contest": { county: "Cuyahoga", districtCode: "11", candidates: [{ sourceCandidateName: "Shontel Brown", candidacyKind: "named_candidate", votes: 44841 }, { sourceCandidateName: "Nina Turner", candidacyKind: "named_candidate", votes: 22830 }], sourceTotalVotes: 67671, precinctsReported: null, precinctsTotal: null },
  "oh-2022-may-primary-summit-amended-official-summary": { county: "Summit", districtCode: "13", candidates: [{ sourceCandidateName: "Emilia Sykes", candidacyKind: "named_candidate", votes: 26466 }], sourceTotalVotes: 26466, precinctsReported: 420, precinctsTotal: 420 },
};

export function parseOhio2022CountyResult(sourceId: string, text: string): Ohio2022CountyResult {
  const expected = EXPECTED_RESULTS[sourceId]; if (!expected) return countyFail("SOURCE_ID_INVALID");
  const compact = text.replace(/\r/g, "");
  const checks: Readonly<Record<string, readonly RegExp[]>> = {
    "oh-2022-may-primary-hamilton-official-cumulative": [/P22 Official Results/, /May 03, 2022/, /Representative to Congress \(1st District\).*Democratic Party[\s\S]*Greg Landsman\s+5,561\s+100\.00%\s+17,902\s+100\.00%\s+23,463\s+100\.00%/, /Counted\s+Total\s+Percent[\s\S]*374\s+374\s+100\.00%/],
    "oh-2022-may-primary-franklin-official-group-detail": [/2022 Primary Election/, /May 3, 2022[\s\S]*OFFICIAL RESULTS/, /Dem For Representative to Congress \(3rd District\)[\s\S]*Joyce Beatty\s+48,241\s+100\.00%/, /Precincts Reporting\s+543 of 543/],
    "oh-2022-may-primary-wood-official-summary": [/May 3, 2022/, /Official Election Results/, /Representative to Congress \(9th District\) \(DEM\)[\s\S]*Precincts Reported: 43 of 43 \(100\.00%\)[\s\S]*Marcy Kaptur\s+2,547\s+100\.00%/],
    "oh-2022-may-primary-cuyahoga-official-results-by-contest": [/May 3, 2022\s+Official Results/, /Primary Election/, /DEM - UNITED STATES REP 11TH CONG DISTRICT[\s\S]*Shontel Brown[.\s]+44,841\s+66\.26[\s\S]*Nina Turner[.\s]+22,830\s+33\.74/],
    "oh-2022-may-primary-summit-amended-official-summary": [/SUMMIT COUNTY, OHIO\s+Amended Official Results/, /05\/03\/22 PRIMARY ELECTION/, /Representative to Congress 13th District[\s\S]*WITH 420 OF 420 PRECINCTS COUNTED[\s\S]*Emilia Sykes[.\s]+26,466\s+100\.00/],
  };
  if (checks[sourceId]!.some((pattern) => !pattern.test(compact))) return countyFail("SOURCE_SEMANTICS_INVALID");
  return expected;
}

type CountyInput = Readonly<{ entry: NewYorkSourceEntry; bytes: Buffer | Uint8Array; text: string }>;
const EXPECTED_SOURCES: Readonly<Record<string, Readonly<{ url: string; path: string; size: number; hash: string; textHash: string }>>> = {
  "oh-2022-may-primary-hamilton-official-cumulative": { url: "https://votehamiltoncountyohio.gov/files/files/elections/May2022/P22%20Official%20Cumulative%28FINAL%29%28NoPrecExecs%29.pdf", path: "data/source/elections/primary-results/ohio/2022/county-boe/hamilton-official-cumulative.pdf", size: 372037, hash: "43298f4a4f5cf37b3a18a5cc66f88b4bf29c4136fb7ea092268ffa257341ab22", textHash: "198a07af9f4dd8ba644b91e32248cd4e8eb1ee3b307356056c79d07b22c2e5cc" },
  "oh-2022-may-primary-franklin-official-group-detail": { url: "https://vote.franklincountyohio.gov/getmedia/ac77f783-6f22-404e-9c64-3b527e62b4fd/Official-Results-Franklin-County-Only-Group-Detail", path: "data/source/elections/primary-results/ohio/2022/county-boe/franklin-official-group-detail.pdf", size: 268555, hash: "d75ce506f457d7974b4a8410b3f82996238bad19f802209494a4099667d1fffa", textHash: "bd05a3c41dd3c827359768dfe025ec6182fb1033d638b7d4dac7e9c08cb9bd99" },
  "oh-2022-may-primary-wood-official-summary": { url: "https://www.co.wood.oh.us/BOE/Election_Results/2022/05_2022%20OfficialSummaryReportRPT.pdf", path: "data/source/elections/primary-results/ohio/2022/county-boe/wood-official-summary.pdf", size: 192093, hash: "e7d43e9bbf0a471e91b3aae25ffc7ff6c04b409161d057ca7614e207c35e19bb", textHash: "b56374a8c811e8c1a8cba15b20df9bd511b548d475ce7a281b272759ef12ebd9" },
  "oh-2022-may-primary-cuyahoga-official-results-by-contest": { url: "https://boe.cuyahogacounty.gov/elections/GetDocumentById/68d6ce83-b017-4955-867f-9a3e4c32e022/", path: "data/source/elections/primary-results/ohio/2022/county-boe/cuyahoga-official-results-by-contest.html", size: 262144, hash: "a88f4724ed265e406fd5d711b402a07c753bb704e1eda4d8e3af97da8ebdbfb6", textHash: "3661710fcd59f22d292ce62c28d8a43f29dcaf5af238712b30f8a94423f7108c" },
  "oh-2022-may-primary-summit-amended-official-summary": { url: "https://www.boe.ohio.gov/summit/c/elecres/elect050322P.htm", path: "data/source/elections/primary-results/ohio/2022/county-boe/summit-amended-official-summary.html", size: 174228, hash: "c76d2eafd052ff23404c6f4ea259de70e1f56a3c976f9773ad24f9773142abf1", textHash: "c76d2eafd052ff23404c6f4ea259de70e1f56a3c976f9773ad24f9773142abf1" },
};

const REQUIRED = [
  { districtCode: "01", required: ["Hamilton:partial", "Warren:full"], retained: ["Hamilton:partial"], missing: ["Warren:full"] },
  { districtCode: "03", required: ["Franklin:partial"], retained: ["Franklin:partial"], missing: [] },
  { districtCode: "09", required: ["Defiance:full", "Erie:full", "Fulton:full", "Lucas:full", "Ottawa:full", "Sandusky:full", "Williams:full", "Wood:partial"], retained: ["Wood:partial"], missing: ["Defiance:full", "Erie:full", "Fulton:full", "Lucas:full", "Ottawa:full", "Sandusky:full", "Williams:full"] },
  { districtCode: "11", required: ["Cuyahoga:partial"], retained: ["Cuyahoga:partial"], missing: [] },
  { districtCode: "13", required: ["Portage:partial", "Stark:partial", "Summit:full"], retained: ["Summit:full"], missing: ["Portage:partial", "Stark:partial"] },
] as const;

type V2Contest = OhioPrimaryResultsReceipt["contests"][number];
type CountyResultSegment = Ohio2022CountyResult & Readonly<{ sourceLockId: string; sourceFileSha256: string; semanticTextSha256: string; lifecycle: "county_segment_progress_not_district_observation" }>;

// Filled from the deterministic generated artifact below, then enforced by the
// standalone validator so recomputing internal digests cannot legitimize drift.
export const OHIO_PRIMARY_V2_PACKAGE_SHA256 = "8a5de1394634fa2f415b380ea2f7f49b8a142cbfe5a62dfc278f917af9281636";
export const OHIO_PRIMARY_V2_CONTEST_SET_SHA256 = "8641d3802c2791c0d18bc3b32d3f5c4337de560d4a7d4141f98384e9964de360";

export type OhioPrimaryResultsReceiptV2 = Readonly<{
  schema: "ohio-house-democratic-primary-results-2022-2026-v2";
  version: 2;
  generatedAt: "2026-08-06T18:30:00.000Z";
  sourceCutoff: "2026-08-06";
  reviewerOnly: true;
  publicationEligible: false;
  review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null; resolution: null }>;
  status: "official_canvass_result_candidate_with_partial_2022_county_progress";
  parentReceipt: Readonly<{ id: "ohio-house-democratic-primary-results-2022-2026-v1"; fileSha256: string; packageSha256: string }>;
  geographyAuthority: Readonly<{ url: string; status: "verified_location_not_retained_cloudflare_403"; use: "research_derived_county_closure_matrix_not_geography_approval" }>;
  countyCoverage2022: typeof REQUIRED;
  countyResultSegments2022: readonly CountyResultSegment[];
  sources: readonly NewYorkSourceEntry[];
  contests: readonly V2Contest[];
  summary: Readonly<{ cyclesWithHouseResults: 2; statewideContestsValidated: 30; statewideCandidatesValidated: 71; statewideVotesValidated: 1238127; targetObservations: 10; targetCandidates: 14; targetVotes: 540587; namedWriteInCandidates: 1; countySegmentsRequired2022: 15; countySegmentsRetained2022: 5; countySegmentCandidates2022: 6; countySegmentVotes2022: 168388; districtClosureClaims2022: 0; districtsPending2022: 5; evaluatorNumericValues: 0; scoreEligibleContests: 0; contestSetSha256: string }>;
  limitations: readonly string[];
  unresolvedGates: readonly string[];
  packageSha256: string;
}>;

function checked(input: CountyInput): Ohio2022CountyResult {
  const expected = EXPECTED_SOURCES[input.entry.id], bytes = Buffer.from(input.bytes);
  if (!expected || input.entry.url !== expected.url || input.entry.retainedPath !== expected.path || input.entry.retainedStatus !== "retained" || input.entry.byteSize !== expected.size || input.entry.sha256 !== expected.hash || (input.entry.kind as string) !== "official_county_canvass_result" || input.entry.parentIds.length !== 0 || bytes.length !== expected.size || sha(bytes) !== expected.hash) fail("SOURCE_RECEIPT_INVALID");
  if (sha(Buffer.from(input.text, "utf8")) !== expected.textHash) fail("SOURCE_TEXT_INVALID");
  return parseOhio2022CountyResult(input.entry.id, input.text);
}

export function buildOhioPrimaryResultsReceiptV2(inputs: readonly CountyInput[], parentInput: Readonly<{ value: unknown; bytes: Buffer | Uint8Array }>): OhioPrimaryResultsReceiptV2 {
  const parentBytes = Buffer.from(parentInput.bytes), parent = validateOhioPrimaryResultsReceipt(parentInput.value as OhioPrimaryResultsReceipt);
  if (sha(parentBytes) !== "84bc99ea4e6fb80d726f50900aeed3a71707c114895a0ba85fe98cba47cae848" || parent.packageSha256 !== "110dc14b66d637475df77560d4790bfed5c7770eb9e85d8cebd199a9c3c68327") fail("PARENT_INVALID");
  const byId = new Map(inputs.map((input) => [input.entry.id, input]));
  const ids = Object.keys(EXPECTED_SOURCES);
  if (inputs.length !== ids.length || byId.size !== ids.length || ids.some((id) => !byId.has(id))) fail("SOURCE_CLOSURE_INVALID");
  const countyResultSegments2022: CountyResultSegment[] = ids.map((sourceLockId) => ({
    ...checked(byId.get(sourceLockId)!),
    sourceLockId,
    sourceFileSha256: EXPECTED_SOURCES[sourceLockId]!.hash,
    semanticTextSha256: EXPECTED_SOURCES[sourceLockId]!.textHash,
    lifecycle: "county_segment_progress_not_district_observation",
  }));
  const contests: V2Contest[] = [...parent.contests].sort((left, right) => left.contestId.localeCompare(right.contestId));
  const contestSetSha256 = digest("dsa-seats:oh-house-democratic-primary-result-set:v2\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const sources = ([...parent.sources, ...inputs.map((input) => input.entry)].sort((left, right) => left.id.localeCompare(right.id))).map(sourceLockContent);
  const limitations = [
    "The Ohio Secretary of State March 2, 2022 county-population and filing-location PDF is verified at its official URL but its bytes remain unretained because the portal returned a Cloudflare 403; the exact 15-segment matrix is research-derived and is not a geography approval.",
    "No 2022 district observation is emitted because the controlling county-composition authority bytes are not retained. Even rows whose research-derived matrix has no missing county segment remain county-segment progress rather than district totals.",
    "No unofficial Portage report, modern district map, population allocation, or August 2 legislative-primary result is substituted. Stark and Portage remain unresolved alongside the required whole-county sources.",
    "The county reports label themselves official or amended official results. Separate signed county certification instruments are not retained, so the receipt does not claim a stronger chain.",
    "No numerical plurality is converted into a source winner marker, identity, geography approval, selection, evaluator value, or publication approval.",
  ];
  const unresolvedGates = ["retain_march_2_2022_congressional_county_universe_authority_bytes", "acquire_warren_and_seven_oh09_whole_county_official_results", "acquire_stark_and_portage_oh13_official_district_scoped_results", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification", "complete_human_data_review_and_publication_approval"];
  const unsigned = {
    schema: "ohio-house-democratic-primary-results-2022-2026-v2" as const, version: 2 as const, generatedAt: "2026-08-06T18:30:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null }, status: "official_canvass_result_candidate_with_partial_2022_county_progress" as const,
    parentReceipt: { id: "ohio-house-democratic-primary-results-2022-2026-v1" as const, fileSha256: sha(parentBytes), packageSha256: parent.packageSha256 }, geographyAuthority: { url: "https://www.ohiosos.gov/assets/dir2022-27-04-congressionaldistrictfilinglocation-sos-2022-03-02.pdf", status: "verified_location_not_retained_cloudflare_403" as const, use: "research_derived_county_closure_matrix_not_geography_approval" as const }, countyCoverage2022: REQUIRED, countyResultSegments2022, sources, contests,
    summary: { cyclesWithHouseResults: 2 as const, statewideContestsValidated: 30 as const, statewideCandidatesValidated: 71 as const, statewideVotesValidated: 1238127 as const, targetObservations: 10 as const, targetCandidates: 14 as const, targetVotes: 540587 as const, namedWriteInCandidates: 1 as const, countySegmentsRequired2022: 15 as const, countySegmentsRetained2022: 5 as const, countySegmentCandidates2022: 6 as const, countySegmentVotes2022: 168388 as const, districtClosureClaims2022: 0 as const, districtsPending2022: 5 as const, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const, contestSetSha256 }, limitations, unresolvedGates,
  };
  return validateOhioPrimaryResultsReceiptV2({ ...unsigned, packageSha256: digest("dsa-seats:oh-house-democratic-primary-result-package:v2\0", unsigned) });
}

export function validateOhioPrimaryResultsReceiptV2(value: OhioPrimaryResultsReceiptV2): OhioPrimaryResultsReceiptV2 {
  const { packageSha256, ...unsigned } = value;
  const setHash = digest("dsa-seats:oh-house-democratic-primary-result-set:v2\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const candidates = value.contests.reduce((sum, contest) => sum + contest.candidates.length, 0), votes = value.contests.reduce((sum, contest) => sum + contest.sourceTotalVotes, 0);
  if (value.schema !== "ohio-house-democratic-primary-results-2022-2026-v2" || value.version !== 2 || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null) fail("LIFECYCLE_INVARIANT_INVALID");
  if (value.parentReceipt.id !== "ohio-house-democratic-primary-results-2022-2026-v1" || value.parentReceipt.fileSha256 !== "84bc99ea4e6fb80d726f50900aeed3a71707c114895a0ba85fe98cba47cae848" || value.parentReceipt.packageSha256 !== "110dc14b66d637475df77560d4790bfed5c7770eb9e85d8cebd199a9c3c68327") fail("PARENT_INVARIANT_INVALID");
  const expectedSegments = Object.keys(EXPECTED_SOURCES).map((sourceLockId) => ({ ...EXPECTED_RESULTS[sourceLockId]!, sourceLockId, sourceFileSha256: EXPECTED_SOURCES[sourceLockId]!.hash, semanticTextSha256: EXPECTED_SOURCES[sourceLockId]!.textHash, lifecycle: "county_segment_progress_not_district_observation" }));
  if (canonicalJson(value.countyCoverage2022) !== canonicalJson(REQUIRED) || canonicalJson(value.countyResultSegments2022) !== canonicalJson(expectedSegments) || value.contests.some((contest) => (contest.cycleYear as number) === 2022) || value.contests.some((contest) => contest.sourceWinnerStatus !== "not_marked_by_source" || contest.winnerSourceCandidateName !== null || contest.currentIdentityStatus !== "not_reviewed" || contest.geographyStatus !== "not_reviewed" || contest.selectionStatus !== "unselected" || contest.scoreEligible || Object.values(contest.evaluatorValues).some((entry) => entry !== null) || contest.sourceTotalVotes !== contest.candidates.reduce((sum, candidate) => sum + candidate.votes, 0))) fail("SEMANTIC_INVARIANT_INVALID");
  if (value.contests.length !== 10 || candidates !== 14 || votes !== 540587 || value.summary.cyclesWithHouseResults !== 2 || value.summary.targetObservations !== 10 || value.summary.targetCandidates !== candidates || value.summary.targetVotes !== votes || value.summary.countySegmentsRequired2022 !== 15 || value.summary.countySegmentsRetained2022 !== 5 || value.summary.countySegmentCandidates2022 !== 6 || value.summary.countySegmentVotes2022 !== 168388 || value.summary.districtClosureClaims2022 !== 0 || value.summary.districtsPending2022 !== 5 || value.summary.evaluatorNumericValues !== 0 || value.summary.scoreEligibleContests !== 0 || value.summary.contestSetSha256 !== setHash) fail("SUMMARY_INVARIANT_INVALID");
  if (packageSha256 !== OHIO_PRIMARY_V2_PACKAGE_SHA256) fail("PACKAGE_CANONICAL_HASH_INVALID");
  if (value.summary.contestSetSha256 !== OHIO_PRIMARY_V2_CONTEST_SET_SHA256) fail("CONTEST_SET_CANONICAL_HASH_INVALID");
  if (packageSha256 !== digest("dsa-seats:oh-house-democratic-primary-result-package:v2\0", unsigned)) fail("PACKAGE_DIGEST_INVALID");
  return value;
}
