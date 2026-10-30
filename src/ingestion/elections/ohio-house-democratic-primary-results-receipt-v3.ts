import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  validateOhioPrimaryResultsReceiptV2,
  type OhioPrimaryResultsReceiptV2,
} from "./ohio-house-democratic-primary-results-receipt-v2";
import type { NewYorkSourceEntry } from "./new-york-house-democratic-primary-reported-results-receipt";

const fail = (code: string): never => { throw new Error(`Ohio primary results v3 rejected: ${code}`); };
const countyFail = (code: string): never => { throw new Error(`Ohio 2022 county results v3 rejected: ${code}`); };
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

type Candidate = Readonly<{ sourceCandidateName: string; candidacyKind: "named_candidate"; votes: number }>;
export type Ohio2022CountyResultV3 = Readonly<{
  county: "Warren" | "Erie" | "Ottawa" | "Sandusky" | "Williams";
  districtCode: "01" | "09";
  candidates: readonly Candidate[];
  sourceTotalVotes: number;
  precinctsReported: number;
  precinctsTotal: number;
  finalityCaveat: null | "official_archive_and_report_label_conflict";
}>;

const EXPECTED_RESULTS: Readonly<Record<string, Ohio2022CountyResultV3>> = {
  "oh-2022-may-primary-warren-official-results": { county: "Warren", districtCode: "01", candidates: [{ sourceCandidateName: "Greg Landsman", candidacyKind: "named_candidate", votes: 4867 }], sourceTotalVotes: 4867, precinctsReported: 175, precinctsTotal: 175, finalityCaveat: null },
  "oh-2022-may-primary-erie-official-canvass": { county: "Erie", districtCode: "09", candidates: [{ sourceCandidateName: "Marcy Kaptur", candidacyKind: "named_candidate", votes: 3388 }], sourceTotalVotes: 3388, precinctsReported: 62, precinctsTotal: 62, finalityCaveat: null },
  "oh-2022-may-primary-ottawa-amended-official-summary": { county: "Ottawa", districtCode: "09", candidates: [{ sourceCandidateName: "Marcy Kaptur", candidacyKind: "named_candidate", votes: 2138 }], sourceTotalVotes: 2138, precinctsReported: 36, precinctsTotal: 36, finalityCaveat: null },
  "oh-2022-may-primary-sandusky-official-canvass": { county: "Sandusky", districtCode: "09", candidates: [{ sourceCandidateName: "Marcy Kaptur", candidacyKind: "named_candidate", votes: 2177 }], sourceTotalVotes: 2177, precinctsReported: 58, precinctsTotal: 58, finalityCaveat: null },
  "oh-2022-may-primary-williams-official-cumulative": { county: "Williams", districtCode: "09", candidates: [{ sourceCandidateName: "Marcy Kaptur", candidacyKind: "named_candidate", votes: 756 }], sourceTotalVotes: 756, precinctsReported: 28, precinctsTotal: 28, finalityCaveat: "official_archive_and_report_label_conflict" },
};

export function parseOhio2022CountyResultV3(sourceId: string, text: string): Ohio2022CountyResultV3 {
  const expected = EXPECTED_RESULTS[sourceId]; if (!expected) return countyFail("SOURCE_ID_INVALID");
  const checks: Readonly<Record<string, readonly RegExp[]>> = {
    "oh-2022-may-primary-warren-official-results": [/Official Election Results/, /Contest: Representative to Congress -1st District \(Dem\), VOTE FOR 1, Precincts Reported: 175 of 175 \(100%\)[\s\S]{0,12000}Greg Landsman[\s\S]{0,1200}data-votes="true" class="content-data">4,867</],
    "oh-2022-may-primary-erie-official-canvass": [/Official Canvass/, /2022 Primary Election/, /May 3, 2022[\s\S]*DEM Representative to Congress \(9th District\)[\s\S]*Marcy Kaptur\s+3,388\s+100\.00%[\s\S]*Precincts Reporting\s+62 of 62/],
    "oh-2022-may-primary-ottawa-amended-official-summary": [/Amended Official Results/, /2022 Primary Election/, /Election Day Precincts Reporting\s+36 of 36/, /May 3, 2022[\s\S]*DEM Representative to Congress 9th District[\s\S]*Marcy Kaptur\s+2,138\s+100\.00%[\s\S]*Contest Totals\s+2,267/],
    "oh-2022-may-primary-sandusky-official-canvass": [/Official Results/, /2022 Primary Election/, /Election Day Precincts Reporting\s+58 of 58/, /May 3, 2022[\s\S]*Dem Representative to Congress 9th Dist[\s\S]*Marcy Kaptur\s+2,177\s+100\.00%[\s\S]*Contest Totals\s+2,380/],
    "oh-2022-may-primary-williams-official-cumulative": [/Cumulative Results Report[\s\S]*Williams County[\s\S]*Unofficial Results/, /Official Results[\s\S]*Precincts Reporting[\s\S]*28 of 28 = 100\.00%/, /For Representative to Congress \(9th District\) - Democratic Party[\s\S]*Marcy Kaptur[\s\S]*756\s+100\.00%/],
  };
  if (checks[sourceId]!.some((pattern) => !pattern.test(text))) return countyFail("SOURCE_SEMANTICS_INVALID");
  return expected;
}

type CountyInput = Readonly<{ entry: NewYorkSourceEntry; bytes: Buffer | Uint8Array; text: string }>;
const EXPECTED_SOURCES: Readonly<Record<string, Readonly<{ url: string; path: string; size: number; hash: string; textHash: string }>>> = {
  "oh-2022-may-primary-warren-official-results": { url: "https://liveresults.boe.ohio.gov/warrenoh/LiveResults/en/Index_7.html", path: "data/source/elections/primary-results/ohio/2022/county-boe/warren-official-results.html", size: 12570673, hash: "eace77a04275e47919af9dc08c1f8fece729b6b80a58c0497fffb782015fdca0", textHash: "eace77a04275e47919af9dc08c1f8fece729b6b80a58c0497fffb782015fdca0" },
  "oh-2022-may-primary-erie-official-canvass": { url: "https://www.boe.ohio.gov/erie/c/elecres/20220503results.pdf", path: "data/source/elections/primary-results/ohio/2022/county-boe/erie-official-canvass.pdf", size: 160976, hash: "e15821ff0bc19a6b532da77237f879740873869821ad05d4ce1f91ce642ab72a", textHash: "df7bc9e92554ee94648c966e523c22f37b03e454424599021bad56e27c79a22a" },
  "oh-2022-may-primary-ottawa-amended-official-summary": { url: "https://boe.ottawa.oh.gov/wp-content/uploads/2022/06/Amended-Official-Summary.pdf", path: "data/source/elections/primary-results/ohio/2022/county-boe/ottawa-amended-official-summary.pdf", size: 48279, hash: "1ba473a90485d1b35d75076d152556a7883d201ee7ae25d2b77e9c2cb34d576c", textHash: "2be225835e2618b496d3bf82a5c0eda77e62ec1e7b5dce27347ffd73543858d9" },
  "oh-2022-may-primary-sandusky-official-canvass": { url: "https://sanduskycountyoh.gov/uploads/board%20of%20elections/2022/Sandusky%20Official%20Canvass%20May%202022.pdf", path: "data/source/elections/primary-results/ohio/2022/county-boe/sandusky-official-canvass.pdf", size: 212301, hash: "2bdafad3985b1d1960e6e6b2d6c28bd760386af8d58d827832e76cb6711f9c27", textHash: "f392d69d38a0634ac9c0d61a55582f9a0c11f111d003107b2e0426a2b2a0e0e1" },
  "oh-2022-may-primary-williams-official-cumulative": { url: "https://www.williamscountyoh.gov/DocumentCenter/View/2323/Official-Cumulative-Results-May-3-2022", path: "data/source/elections/primary-results/ohio/2022/county-boe/williams-official-cumulative.pdf", size: 370181, hash: "4d6c8a09907a172f60a9bde228a108c66b183c7cf1bfb58d910470ad752fe3c9", textHash: "07103dd4f5a584fdf8519f4289fd0f853220226d1818352656a13c43b87d994a" },
};

const REQUIRED = [
  { districtCode: "01", required: ["Hamilton:partial", "Warren:full"], retained: ["Hamilton:partial", "Warren:full"], missing: [] },
  { districtCode: "03", required: ["Franklin:partial"], retained: ["Franklin:partial"], missing: [] },
  { districtCode: "09", required: ["Defiance:full", "Erie:full", "Fulton:full", "Lucas:full", "Ottawa:full", "Sandusky:full", "Williams:full", "Wood:partial"], retained: ["Erie:full", "Ottawa:full", "Sandusky:full", "Williams:full", "Wood:partial"], missing: ["Defiance:full", "Fulton:full", "Lucas:full"] },
  { districtCode: "11", required: ["Cuyahoga:partial"], retained: ["Cuyahoga:partial"], missing: [] },
  { districtCode: "13", required: ["Portage:partial", "Stark:partial", "Summit:full"], retained: ["Summit:full"], missing: ["Portage:partial", "Stark:partial"] },
] as const;

type Segment = Readonly<{ county: string; districtCode: string; candidates: readonly Candidate[]; sourceTotalVotes: number; precinctsReported: number | null; precinctsTotal: number | null; finalityCaveat: null | "official_archive_and_report_label_conflict"; sourceLockId: string; sourceFileSha256: string; semanticTextSha256: string; lifecycle: "county_segment_progress_not_district_observation" }>;
export const OHIO_PRIMARY_V3_PACKAGE_SHA256 = "4ea53334aa91c5bdc45ef63305a611a133c8f06804a03440fb664c4fcf30d109";
export const OHIO_PRIMARY_V3_CONTEST_SET_SHA256 = "f45a0de76d61ccd752dbbcc5604fe6a8cd7997798393970e1ab1aed18f28b556";

export type OhioPrimaryResultsReceiptV3 = Readonly<{
  schema: "ohio-house-democratic-primary-results-2022-2026-v3"; version: 3; generatedAt: "2026-08-06T19:30:00.000Z"; sourceCutoff: "2026-08-06"; reviewerOnly: true; publicationEligible: false;
  review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null; resolution: null }>;
  status: "official_county_canvass_progress_with_unretained_geography_authority";
  parentReceipt: Readonly<{ id: "ohio-house-democratic-primary-results-2022-2026-v2"; fileSha256: string; packageSha256: string }>;
  geographyAuthority: OhioPrimaryResultsReceiptV2["geographyAuthority"];
  countyCoverage2022: typeof REQUIRED; countyResultSegments2022: readonly Segment[]; sources: readonly NewYorkSourceEntry[]; contests: OhioPrimaryResultsReceiptV2["contests"];
  summary: Readonly<{ cyclesWithHouseResults: 2; targetObservations: 10; targetCandidates: 14; targetVotes: 540587; countySegmentsRequired2022: 15; countySegmentsRetained2022: 10; countySegmentsMissing2022: 5; countySegmentCandidates2022: 11; countySegmentVotes2022: 181714; districtClosureClaims2022: 0; districtsPending2022: 5; evaluatorNumericValues: 0; scoreEligibleContests: 0; contestSetSha256: string }>;
  limitations: readonly string[]; unresolvedGates: readonly string[]; packageSha256: string;
}>;

function checked(input: CountyInput): Ohio2022CountyResultV3 {
  const expected = EXPECTED_SOURCES[input.entry.id], bytes = Buffer.from(input.bytes);
  if (!expected || input.entry.url !== expected.url || input.entry.retainedPath !== expected.path || input.entry.retainedStatus !== "retained" || input.entry.byteSize !== expected.size || input.entry.sha256 !== expected.hash || (input.entry.kind as string) !== "official_county_canvass_result" || input.entry.parentIds.length !== 0 || bytes.length !== expected.size || sha(bytes) !== expected.hash) fail("SOURCE_RECEIPT_INVALID");
  if (sha(Buffer.from(input.text, "utf8")) !== expected.textHash) fail("SOURCE_TEXT_INVALID");
  return parseOhio2022CountyResultV3(input.entry.id, input.text);
}

export function buildOhioPrimaryResultsReceiptV3(inputs: readonly CountyInput[], parentInput: Readonly<{ value: unknown; bytes: Buffer | Uint8Array }>): OhioPrimaryResultsReceiptV3 {
  const parentBytes = Buffer.from(parentInput.bytes), parent = validateOhioPrimaryResultsReceiptV2(parentInput.value as OhioPrimaryResultsReceiptV2);
  if (sha(parentBytes) !== "589cf7ee3fe2bdba37ae0d9b4b29230dc073e9ff2680f1586fa37214dd03e4f7" || parent.packageSha256 !== "8a5de1394634fa2f415b380ea2f7f49b8a142cbfe5a62dfc278f917af9281636") fail("PARENT_INVALID");
  const ids = Object.keys(EXPECTED_SOURCES), byId = new Map(inputs.map((input) => [input.entry.id, input]));
  if (inputs.length !== ids.length || byId.size !== ids.length || ids.some((id) => !byId.has(id))) fail("SOURCE_CLOSURE_INVALID");
  const inherited = parent.countyResultSegments2022.map((segment) => ({ ...segment, finalityCaveat: null }));
  const additions: Segment[] = ids.map((sourceLockId) => ({ ...checked(byId.get(sourceLockId)!), sourceLockId, sourceFileSha256: EXPECTED_SOURCES[sourceLockId]!.hash, semanticTextSha256: EXPECTED_SOURCES[sourceLockId]!.textHash, lifecycle: "county_segment_progress_not_district_observation" }));
  const countyResultSegments2022 = [...inherited, ...additions];
  const contests = parent.contests;
  const contestSetSha256 = digest("dsa-seats:oh-house-democratic-primary-result-set:v3\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const sources = ([...parent.sources, ...inputs.map((input) => input.entry)].sort((left, right) => left.id.localeCompare(right.id))).map(sourceLockContent);
  const limitations = [
    "The official March 2, 2022 county-composition PDF renders at its Secretary of State URL, but direct byte retrieval remains blocked by Cloudflare; no 2022 district observation is emitted without retained authority bytes.",
    "OH-09 still lacks source-locked final county totals for Defiance, Fulton, and Lucas. Lucas's surviving result snapshot is explicitly unofficial and is excluded; Defiance precinct and Fulton rendered evidence are not substituted for exact retained total-bearing payloads.",
    "The Williams County archive calls the retained report official and its body says Official Results, but the vendor footer also says Unofficial Results. The segment preserves that conflict and cannot establish district finality, selection, or publication.",
    "No county segment is converted into a district total, source winner, identity, geography approval, evaluator value, score, review approval, or publication state.",
  ];
  const unresolvedGates = ["retain_march_2_2022_congressional_county_universe_authority_bytes", "acquire_defiance_fulton_lucas_oh09_exact_official_totals", "resolve_williams_finality_label_conflict", "acquire_stark_and_portage_oh13_official_district_scoped_results", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification", "complete_human_data_review_and_publication_approval"];
  const unsigned = {
    schema: "ohio-house-democratic-primary-results-2022-2026-v3" as const, version: 3 as const, generatedAt: "2026-08-06T19:30:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null }, status: "official_county_canvass_progress_with_unretained_geography_authority" as const,
    parentReceipt: { id: "ohio-house-democratic-primary-results-2022-2026-v2" as const, fileSha256: sha(parentBytes), packageSha256: parent.packageSha256 }, geographyAuthority: parent.geographyAuthority, countyCoverage2022: REQUIRED, countyResultSegments2022, sources, contests,
    summary: { cyclesWithHouseResults: 2 as const, targetObservations: 10 as const, targetCandidates: 14 as const, targetVotes: 540587 as const, countySegmentsRequired2022: 15 as const, countySegmentsRetained2022: 10 as const, countySegmentsMissing2022: 5 as const, countySegmentCandidates2022: 11 as const, countySegmentVotes2022: 181714 as const, districtClosureClaims2022: 0 as const, districtsPending2022: 5 as const, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const, contestSetSha256 }, limitations, unresolvedGates,
  };
  return validateOhioPrimaryResultsReceiptV3({ ...unsigned, packageSha256: digest("dsa-seats:oh-house-democratic-primary-result-package:v3\0", unsigned) });
}

export function validateOhioPrimaryResultsReceiptV3(value: OhioPrimaryResultsReceiptV3): OhioPrimaryResultsReceiptV3 {
  const { packageSha256, ...unsigned } = value;
  const setHash = digest("dsa-seats:oh-house-democratic-primary-result-set:v3\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  if (value.schema !== "ohio-house-democratic-primary-results-2022-2026-v3" || value.version !== 3 || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null) fail("LIFECYCLE_INVARIANT_INVALID");
  if (value.parentReceipt.id !== "ohio-house-democratic-primary-results-2022-2026-v2" || value.parentReceipt.fileSha256 !== "589cf7ee3fe2bdba37ae0d9b4b29230dc073e9ff2680f1586fa37214dd03e4f7" || value.parentReceipt.packageSha256 !== "8a5de1394634fa2f415b380ea2f7f49b8a142cbfe5a62dfc278f917af9281636") fail("PARENT_INVARIANT_INVALID");
  const candidateCount = value.countyResultSegments2022.reduce((sum, row) => sum + row.candidates.length, 0), segmentVotes = value.countyResultSegments2022.reduce((sum, row) => sum + row.sourceTotalVotes, 0);
  if (canonicalJson(value.countyCoverage2022) !== canonicalJson(REQUIRED) || value.countyResultSegments2022.length !== 10 || candidateCount !== 11 || segmentVotes !== 181714 || value.contests.some((contest) => (contest.cycleYear as number) === 2022) || value.countyResultSegments2022.some((row) => row.lifecycle !== "county_segment_progress_not_district_observation" || row.sourceTotalVotes !== row.candidates.reduce((sum, candidate) => sum + candidate.votes, 0))) fail("SEMANTIC_INVARIANT_INVALID");
  if (value.contests.length !== 10 || value.summary.targetObservations !== 10 || value.summary.targetCandidates !== 14 || value.summary.targetVotes !== 540587 || value.summary.countySegmentsRequired2022 !== 15 || value.summary.countySegmentsRetained2022 !== 10 || value.summary.countySegmentsMissing2022 !== 5 || value.summary.countySegmentCandidates2022 !== candidateCount || value.summary.countySegmentVotes2022 !== segmentVotes || value.summary.districtClosureClaims2022 !== 0 || value.summary.districtsPending2022 !== 5 || value.summary.evaluatorNumericValues !== 0 || value.summary.scoreEligibleContests !== 0 || value.summary.contestSetSha256 !== setHash) fail("SUMMARY_INVARIANT_INVALID");
  if (packageSha256 !== OHIO_PRIMARY_V3_PACKAGE_SHA256) fail("PACKAGE_CANONICAL_HASH_INVALID");
  if (value.summary.contestSetSha256 !== OHIO_PRIMARY_V3_CONTEST_SET_SHA256) fail("CONTEST_SET_CANONICAL_HASH_INVALID");
  if (packageSha256 !== digest("dsa-seats:oh-house-democratic-primary-result-package:v3\0", unsigned)) fail("PACKAGE_DIGEST_INVALID");
  return value;
}
