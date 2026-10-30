import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
type Candidate = Readonly<{
  sourceCandidateName: string;
  candidacyKind: "named_candidate";
  votes: number;
}>;

export type Ohio2022CountyResultV4 = Readonly<{
  county: "Fulton" | "Stark";
  districtCode: "09" | "13";
  candidates: readonly Candidate[];
  sourceTotalVotes: number;
  precinctsReported: number;
  precinctsTotal: number;
  finalityCaveat: null;
}>;

const fail = (): never => {
  throw new Error("Ohio 2022 county results v4 rejected: SOURCE_SEMANTICS_INVALID");
};

export function parseOhio2022CountyResultV4(sourceId: string, text: string): Ohio2022CountyResultV4 {
  if (sourceId === "oh-2022-may-primary-fulton-official-summary") {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return fail(); }
    if (!Array.isArray(parsed)) return fail();
    const matches = parsed.filter((value): value is Record<string, unknown> => (
      typeof value === "object"
      && value !== null
      && (value as Record<string, unknown>).C === "For U.S. Representative (9th District) - DEM"
    ));
    if (matches.length !== 1) return fail();
    const contest = matches[0]!;
    if (
      JSON.stringify(contest.CH) !== JSON.stringify(["Marcy Kaptur"])
      || JSON.stringify(contest.P) !== JSON.stringify(["DEM"])
      || JSON.stringify(contest.V) !== JSON.stringify([1448])
      || JSON.stringify(contest.PCT) !== JSON.stringify([100])
      || contest.TP !== 29
      || contest.PR !== 29
    ) return fail();
    return { county: "Fulton", districtCode: "09", candidates: [{ sourceCandidateName: "Marcy Kaptur", candidacyKind: "named_candidate", votes: 1448 }], sourceTotalVotes: 1448, precinctsReported: 29, precinctsTotal: 29, finalityCaveat: null };
  }
  if (sourceId === "oh-2022-may-primary-stark-official-tabulation") {
    if (/Unofficial Tabulation Results/.test(text)) return fail();
    const officialContest = /Election Summary Report[\s\S]{0,500}Closed Primary[\s\S]{0,500}Stark County[\s\S]{0,500}May 03, 2022[\s\S]{0,500}Official Tabulation Results[\s\S]{0,50000}Dem US Representative To Congress - 13th District \(Vote for 1\)\s+DEM\s+Precincts Reported: 184 of 184 \(100\.00%\)[\s\S]{0,300}Emilia Sykes\s+9,664[\s\S]{0,100}Total Votes\s+9,664/;
    if (!officialContest.test(text)) return fail();
    return { county: "Stark", districtCode: "13", candidates: [{ sourceCandidateName: "Emilia Sykes", candidacyKind: "named_candidate", votes: 9664 }], sourceTotalVotes: 9664, precinctsReported: 184, precinctsTotal: 184, finalityCaveat: null };
  }
  return fail();
}

const receiptFail = (code: string): never => {
  throw new Error(`Ohio primary results v4 rejected: ${code}`);
};
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

type CountyInput = Readonly<{ entry: NewYorkSourceEntry; bytes: Buffer | Uint8Array; text: string }>;
type Segment = OhioPrimaryResultsReceiptV3["countyResultSegments2022"][number];
const EXPECTED_SOURCES: Readonly<Record<string, Readonly<{ url: string; path: string; size: number; hash: string; textHash: string; kind: string; parentIds: readonly string[]; segment: boolean }>>> = {
  "oh-2022-may-primary-fulton-results-index": { url: "https://www.boe.ohio.gov/fulton/election-info/election-results/", path: "data/source/elections/primary-results/ohio/2022/county-boe/fulton-results-index.html", size: 40770, hash: "1d1a2de563c8be754d55aa78a626a4ba7f75841c94db53b452b9b4fe844be14a", textHash: "1d1a2de563c8be754d55aa78a626a4ba7f75841c94db53b452b9b4fe844be14a", kind: "official_results_index", parentIds: [], segment: false },
  "oh-2022-may-primary-fulton-official-wrapper": { url: "https://www.boe.ohio.gov/fulton/c/elecres/20220503results-live.htm", path: "data/source/elections/primary-results/ohio/2022/county-boe/fulton-official-results-wrapper.html", size: 633, hash: "88f3569dafed2565e17bc173a7e03ab64dd222a25d2db503e3d414e32c10353e", textHash: "88f3569dafed2565e17bc173a7e03ab64dd222a25d2db503e3d414e32c10353e", kind: "official_result_wrapper", parentIds: ["oh-2022-may-primary-fulton-results-index"], segment: false },
  "oh-2022-may-primary-fulton-official-summary": { url: "https://results.enr.clarityelections.com/OH/Fulton/112980/292928/json/en/summary.json", path: "data/source/elections/primary-results/ohio/2022/county-boe/fulton-official-summary.json", size: 23285, hash: "37fcf6413875aef655d54f68024fc8e76ba9540d3c326e5bc34804f1231a693c", textHash: "37fcf6413875aef655d54f68024fc8e76ba9540d3c326e5bc34804f1231a693c", kind: "official_county_canvass_result", parentIds: ["oh-2022-may-primary-fulton-official-wrapper"], segment: true },
  "oh-2022-may-primary-stark-official-tabulation": { url: "https://www.starkcountyohio.gov/Document_center/Offices/Board%20of%20Elections/Election%20result/pri22.pdf?t=202309211015500", path: "data/source/elections/primary-results/ohio/2022/county-boe/stark-official-tabulation.pdf", size: 416122, hash: "58de21d502f2946d81b28911eea0e7d98a854fad732f1156ee28f4380ccc576f", textHash: "6fa9e2fb69773347e1c65a6111fb611f96cb31bc2e4d289c7d5b8fff35447721", kind: "official_county_canvass_result", parentIds: [], segment: true },
};
const REQUIRED = [
  { districtCode: "01", required: ["Hamilton:partial", "Warren:full"], retained: ["Hamilton:partial", "Warren:full"], missing: [] },
  { districtCode: "03", required: ["Franklin:partial"], retained: ["Franklin:partial"], missing: [] },
  { districtCode: "09", required: ["Defiance:full", "Erie:full", "Fulton:full", "Lucas:full", "Ottawa:full", "Sandusky:full", "Williams:full", "Wood:partial"], retained: ["Erie:full", "Fulton:full", "Ottawa:full", "Sandusky:full", "Williams:full", "Wood:partial"], missing: ["Defiance:full", "Lucas:full"] },
  { districtCode: "11", required: ["Cuyahoga:partial"], retained: ["Cuyahoga:partial"], missing: [] },
  { districtCode: "13", required: ["Portage:partial", "Stark:partial", "Summit:full"], retained: ["Stark:partial", "Summit:full"], missing: ["Portage:partial"] },
] as const;

export const OHIO_PRIMARY_V4_PACKAGE_SHA256 = "f8acd66b060daac23ad13c3054ff42a32c3124ea6986e356a9d82710bff1d295";
export const OHIO_PRIMARY_V4_CONTEST_SET_SHA256 = "30c855938a5462946a0a7962ffc5f523a480f9875da752508810547396d8a3f7";

export type OhioPrimaryResultsReceiptV4 = Readonly<{
  schema: "ohio-house-democratic-primary-results-2022-2026-v4";
  version: 4;
  generatedAt: "2026-08-06T20:00:00.000Z";
  sourceCutoff: "2026-08-06";
  reviewerOnly: true;
  publicationEligible: false;
  review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null; resolution: null }>;
  status: "official_county_canvass_progress_with_unretained_geography_authority";
  parentReceipt: Readonly<{ id: "ohio-house-democratic-primary-results-2022-2026-v3"; fileSha256: string; packageSha256: string }>;
  geographyAuthority: OhioPrimaryResultsReceiptV3["geographyAuthority"];
  countyCoverage2022: typeof REQUIRED;
  countyResultSegments2022: readonly Segment[];
  sources: readonly NewYorkSourceEntry[];
  contests: OhioPrimaryResultsReceiptV3["contests"];
  summary: Readonly<{ cyclesWithHouseResults: 2; targetObservations: 10; targetCandidates: 14; targetVotes: 540587; countySegmentsRequired2022: 15; countySegmentsRetained2022: 12; countySegmentsMissing2022: 3; countySegmentCandidates2022: 13; countySegmentVotes2022: 192826; districtClosureClaims2022: 0; districtsPending2022: 5; evaluatorNumericValues: 0; scoreEligibleContests: 0; contestSetSha256: string }>;
  limitations: readonly string[];
  unresolvedGates: readonly string[];
  packageSha256: string;
}>;

function checked(input: CountyInput): void {
  const expected = EXPECTED_SOURCES[input.entry.id], bytes = Buffer.from(input.bytes);
  if (!expected || input.entry.url !== expected.url || input.entry.retainedPath !== expected.path || input.entry.retainedStatus !== "retained" || input.entry.byteSize !== expected.size || input.entry.sha256 !== expected.hash || (input.entry.kind as string) !== expected.kind || canonicalJson(input.entry.parentIds) !== canonicalJson(expected.parentIds) || bytes.length !== expected.size || sha(bytes) !== expected.hash) receiptFail("SOURCE_RECEIPT_INVALID");
  if (sha(Buffer.from(input.text, "utf8")) !== expected.textHash) receiptFail("SOURCE_TEXT_INVALID");
}

export function buildOhioPrimaryResultsReceiptV4(inputs: readonly CountyInput[], parentInput: Readonly<{ value: unknown; bytes: Buffer | Uint8Array }>): OhioPrimaryResultsReceiptV4 {
  const parentBytes = Buffer.from(parentInput.bytes), parent = validateOhioPrimaryResultsReceiptV3(parentInput.value as OhioPrimaryResultsReceiptV3);
  if (sha(parentBytes) !== "dc7baadc8bc7a314824532a54a1df1d054044942464bbef2b2401ff9533ad1c5" || parent.packageSha256 !== "4ea53334aa91c5bdc45ef63305a611a133c8f06804a03440fb664c4fcf30d109") receiptFail("PARENT_INVALID");
  const ids = Object.keys(EXPECTED_SOURCES), byId = new Map(inputs.map((input) => [input.entry.id, input]));
  if (inputs.length !== ids.length || byId.size !== ids.length || ids.some((id) => !byId.has(id))) receiptFail("SOURCE_CLOSURE_INVALID");
  inputs.forEach(checked);
  const additions: Segment[] = ids.filter((sourceLockId) => EXPECTED_SOURCES[sourceLockId]!.segment).map((sourceLockId) => ({ ...parseOhio2022CountyResultV4(sourceLockId, byId.get(sourceLockId)!.text), sourceLockId, sourceFileSha256: EXPECTED_SOURCES[sourceLockId]!.hash, semanticTextSha256: EXPECTED_SOURCES[sourceLockId]!.textHash, lifecycle: "county_segment_progress_not_district_observation" }));
  const countyResultSegments2022 = [...parent.countyResultSegments2022, ...additions];
  const contests = parent.contests;
  const contestSetSha256 = digest("dsa-seats:oh-house-democratic-primary-result-set:v4\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const sources = ([...parent.sources, ...inputs.map((input) => input.entry)].sort((left, right) => left.id.localeCompare(right.id))).map(sourceLockContent);
  const limitations = [
    "The official March 2, 2022 county-composition PDF renders at its Secretary of State URL, but direct byte retrieval remains blocked by Cloudflare; no 2022 district observation is emitted without retained authority bytes.",
    "OH-09 still lacks source-locked final county totals for Defiance and Lucas. Defiance's official precinct canvass is not summed, and Lucas's exact surviving payload is explicitly unofficial.",
    "OH-13 still lacks a clean retained Portage result. The county route and document title say official, but the source footer says Unofficial SOVC and direct PDF retrieval returned a Cloudflare challenge.",
    "The inherited Williams County archive/report conflict remains explicit: official labels coexist with an unofficial vendor footer.",
    "No county segment is converted into a district total, source winner, identity, geography approval, evaluator value, score, review approval, or publication state.",
  ];
  const unresolvedGates = ["retain_march_2_2022_congressional_county_universe_authority_bytes", "acquire_defiance_and_lucas_oh09_exact_official_totals", "resolve_williams_finality_label_conflict", "acquire_clean_portage_oh13_official_district_scoped_result", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification", "complete_human_data_review_and_publication_approval"];
  const unsigned = {
    schema: "ohio-house-democratic-primary-results-2022-2026-v4" as const, version: 4 as const, generatedAt: "2026-08-06T20:00:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null }, status: "official_county_canvass_progress_with_unretained_geography_authority" as const,
    parentReceipt: { id: "ohio-house-democratic-primary-results-2022-2026-v3" as const, fileSha256: sha(parentBytes), packageSha256: parent.packageSha256 }, geographyAuthority: parent.geographyAuthority, countyCoverage2022: REQUIRED, countyResultSegments2022, sources, contests,
    summary: { cyclesWithHouseResults: 2 as const, targetObservations: 10 as const, targetCandidates: 14 as const, targetVotes: 540587 as const, countySegmentsRequired2022: 15 as const, countySegmentsRetained2022: 12 as const, countySegmentsMissing2022: 3 as const, countySegmentCandidates2022: 13 as const, countySegmentVotes2022: 192826 as const, districtClosureClaims2022: 0 as const, districtsPending2022: 5 as const, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const, contestSetSha256 }, limitations, unresolvedGates,
  };
  return validateOhioPrimaryResultsReceiptV4({ ...unsigned, packageSha256: digest("dsa-seats:oh-house-democratic-primary-result-package:v4\0", unsigned) });
}

export function validateOhioPrimaryResultsReceiptV4(value: OhioPrimaryResultsReceiptV4): OhioPrimaryResultsReceiptV4 {
  const { packageSha256, ...unsigned } = value;
  const setHash = digest("dsa-seats:oh-house-democratic-primary-result-set:v4\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  if (value.schema !== "ohio-house-democratic-primary-results-2022-2026-v4" || value.version !== 4 || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null) receiptFail("LIFECYCLE_INVARIANT_INVALID");
  if (value.parentReceipt.id !== "ohio-house-democratic-primary-results-2022-2026-v3" || value.parentReceipt.fileSha256 !== "dc7baadc8bc7a314824532a54a1df1d054044942464bbef2b2401ff9533ad1c5" || value.parentReceipt.packageSha256 !== "4ea53334aa91c5bdc45ef63305a611a133c8f06804a03440fb664c4fcf30d109") receiptFail("PARENT_INVARIANT_INVALID");
  const candidateCount = value.countyResultSegments2022.reduce((sum, row) => sum + row.candidates.length, 0), segmentVotes = value.countyResultSegments2022.reduce((sum, row) => sum + row.sourceTotalVotes, 0);
  if (canonicalJson(value.countyCoverage2022) !== canonicalJson(REQUIRED) || value.countyResultSegments2022.length !== 12 || candidateCount !== 13 || segmentVotes !== 192826 || value.contests.some((contest) => (contest.cycleYear as number) === 2022) || value.countyResultSegments2022.some((row) => row.lifecycle !== "county_segment_progress_not_district_observation" || row.sourceTotalVotes !== row.candidates.reduce((sum, candidate) => sum + candidate.votes, 0))) receiptFail("SEMANTIC_INVARIANT_INVALID");
  if (value.contests.length !== 10 || value.summary.targetObservations !== 10 || value.summary.targetCandidates !== 14 || value.summary.targetVotes !== 540587 || value.summary.countySegmentsRequired2022 !== 15 || value.summary.countySegmentsRetained2022 !== 12 || value.summary.countySegmentsMissing2022 !== 3 || value.summary.countySegmentCandidates2022 !== candidateCount || value.summary.countySegmentVotes2022 !== segmentVotes || value.summary.districtClosureClaims2022 !== 0 || value.summary.districtsPending2022 !== 5 || value.summary.evaluatorNumericValues !== 0 || value.summary.scoreEligibleContests !== 0 || value.summary.contestSetSha256 !== setHash) receiptFail("SUMMARY_INVARIANT_INVALID");
  if (packageSha256 !== OHIO_PRIMARY_V4_PACKAGE_SHA256) receiptFail("PACKAGE_CANONICAL_HASH_INVALID");
  if (value.summary.contestSetSha256 !== OHIO_PRIMARY_V4_CONTEST_SET_SHA256) receiptFail("CONTEST_SET_CANONICAL_HASH_INVALID");
  if (packageSha256 !== digest("dsa-seats:oh-house-democratic-primary-result-package:v4\0", unsigned)) receiptFail("PACKAGE_DIGEST_INVALID");
  return value;
}
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  validateOhioPrimaryResultsReceiptV3,
  type OhioPrimaryResultsReceiptV3,
} from "./ohio-house-democratic-primary-results-receipt-v3";
import type { NewYorkSourceEntry } from "./new-york-house-democratic-primary-reported-results-receipt";
