import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { NEW_YORK_DISPOSITION_V2_PACKAGE_SHA256, validateNewYorkPrimaryDispositionsV2Receipt } from "./new-york-house-democratic-primary-dispositions-v2-receipt";

export const NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_V1 = "new-york-metro-house-democratic-primary-county-authority-receipt-v1" as const;
export const NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_ROW_SET_SHA256 = "f2429615d10058819853637b63b1c7deceddbfc8068569dde8f68d813545189d" as const;
export const NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_PACKAGE_SHA256 = "9907f4f9a2e7ae4c3ad7efb2127901787a720f7eff51f83023b1d00b7fae12ea" as const;

type LockEntry = Readonly<{ id: string; url: string; retainedPath: string; retainedStatus: string; byteSize: number; sha256: string; kind: string; parentIds: readonly string[] }>;
type SourceLock = Readonly<{ version: number; entries: readonly LockEntry[] }>;
type Candidate = Readonly<{ sourceCandidateName: "John P Avlon" | "Nancy S Goroff"; votes: 19_383 | 8_253 }>;
export type NewYorkMetroPrimaryCountyAuthorityInput = {
  dispositionV2Json: string;
  cd119Bytes: Buffer;
  countyCodesBytes: Buffer;
  indexBytes: Buffer;
  resultBytes: Buffer;
  sourceLock: SourceLock;
};
type AuthorityRow = Readonly<{
  authorityId: "ny-metro-county-authority:2024:01:democratic";
  authorityRowSha256: string;
  seatCycleId: "ny:2024:us-house:01:democratic";
  cycleYear: 2024;
  electionDate: "2024-06-25";
  stateCode: "NY";
  districtCode: "01";
  party: "Democratic";
  office: "U.S. Representative";
  districtCountyFips: readonly ["103"];
  districtCountyNames: readonly ["Suffolk"];
  countyNameAuthoritySourceLockId: "census-new-york-county-codes-20260806";
  countyNameAuthorityFileSha256: string;
  districtBlockCount: 13_001;
  countyCompositionMethod: "2020_census_block_geoid_county_fips_from_retained_cd119_assignment";
  countyCompleteness: "all_geographic_counties_covered";
  authorityPublisher: "Suffolk County Board of Elections";
  resultScope: "single_county_whole_district";
  resultStatus: "county_board_final_results_candidate";
  certificationStatus: "signed_certification_not_separately_retained";
  supportedDisposition: "reported_contest";
  sourceContestId: "suffolk:2024:us-house:01:democratic";
  sourceLockIds: readonly ["suffolk-2024-primary-final-results-index", "suffolk-2024-house-democratic-primary-cd01-final-results"];
  sourceFileSha256s: readonly [string, string];
  electionDistrictsReported: 561;
  electionDistrictsTotal: 561;
  reportingCompleteness: "all_election_districts_reported";
  candidates: readonly [Candidate, Candidate];
  candidateVotes: 27_636;
  voteReconciliation: "candidate_sum_equals_reported_votes_cast";
  sourceWinnerStatus: "not_marked_by_source";
  evaluatorValues: Readonly<{ priorPrimaryMargin: null; priorDemocraticPrimaryVotes: null; priorProgressivePrimaryShare: null }>;
  scoreEligible: false;
}>;
export type NewYorkMetroPrimaryCountyAuthorityReceipt = Readonly<{
  schema: typeof NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_V1;
  version: 1;
  generatedAt: "2026-08-06T15:00:00.000Z";
  sourceCutoff: "2026-08-06";
  reviewerOnly: true;
  publicationEligible: false;
  review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null; resolution: null }>;
  parents: Readonly<{ dispositionV2: Readonly<{ sourceLockId: "new-york-house-democratic-primary-dispositions-2022-2024-v2"; fileSha256: string; packageSha256: typeof NEW_YORK_DISPOSITION_V2_PACKAGE_SHA256 }>; cd119BlockAssignment: Readonly<{ sourceLockId: "census-cd119-new-york-block-equivalency-extract-20260805"; fileSha256: string }>; countyCodeAuthority: Readonly<{ sourceLockId: "census-new-york-county-codes-20260806"; fileSha256: string }> }>;
  sources: readonly LockEntry[];
  authorities: readonly [AuthorityRow];
  authorityRowSetSha256: string;
  summary: Readonly<{ targetUnresolvedSeatCycles: 18; acceptedSeatCycles: 1; reportedContestCandidates: 1; certifiedUncontestedCandidates: 0; unresolvedSeatCyclesPreserved: 17; candidateVotes: 27_636; scoreEligibleRows: 0 }>;
  limitations: readonly string[];
  unresolvedGates: readonly string[];
  packageSha256: string;
}>;

const V2_FILE_SHA256 = "33520e143126e6e706222e00db9818ef43349ce2d2ce5e6c3424a3fead45dacf";
const CD119_SHA256 = "670447571d72c0465cd27ac9769c2e969669d7decb06a4198c653b755ff2e46a";
const COUNTY_CODES_SHA256 = "954a0769119995337c524336cfd021e1bac8166489b5940ea7411e78f2cf03fa";
const INDEX_SHA256 = "9af10cdb290935248cf871e63d405db5268abde541a0e1a58c2ef44c34116685";
const RESULT_SHA256 = "ddfc71580b84aceadae6cd90f8bc2218a58cf0e6056e2234da7abde6f33279f8";
const SOURCE_IDS = ["suffolk-2024-primary-final-results-index", "suffolk-2024-house-democratic-primary-cd01-final-results"] as const;
const LIMITATIONS = ["This receipt accepts one complete county final-result candidate and preserves the other seventeen target rows as unresolved.", "The official Suffolk results index labels the 2024 primary link Final Results, but no separately signed certification instrument is retained.", "Result or index absence is never interpreted as uncontested, no-primary, no-candidate, or zero votes.", "No candidate identity, historical geography compatibility, progressive classification, evaluator value, score, approval, publication, or deployment follows from this receipt."] as const;
const GATES = ["retain_remaining_ny_metro_county_ballot_and_result_authority", "retain_or_review_signed_suffolk_certification", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification", "complete_human_data_review_and_publication_approval"] as const;
const fail = (code: string): never => { throw new Error(`New York metro county authority rejected: ${code}`); };
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const exactEntry = (entries: readonly LockEntry[], id: string, expected: Omit<LockEntry, "id">): LockEntry => {
  const matches = entries.filter((entry) => entry.id === id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent({ id, ...expected }))) fail("SOURCE_LOCK_INVALID");
  return matches[0]!;
};
const fileEntry = (url: string, retainedPath: string, byteSize: number, sha256: string, kind: string, parentIds: readonly string[]) => ({ url, retainedPath, retainedStatus: "retained", byteSize, sha256, kind, parentIds });

function countyComposition(bytes: Buffer): readonly ["103"] {
  if (sha(bytes) !== CD119_SHA256) fail("CD119_BYTES_INVALID");
  const lines = bytes.toString("utf8").split(/\r?\n/);
  if (lines.shift() !== "GEOID,CDFP") fail("CD119_HEADER_INVALID");
  const counties = new Set<string>(); let blocks = 0;
  for (const line of lines) { if (!line) continue; const match = /^(36\d{13}),(\d{2})$/.exec(line); if (match === null) { throw new Error("New York metro county authority rejected: CD119_ROW_INVALID"); } if (match[2] === "01") { counties.add(match[1].slice(2, 5)); blocks++; } }
  if (blocks !== 13_001 || canonicalJson([...counties].sort()) !== canonicalJson(["103"])) fail("CD119_DISTRICT_SCOPE_INVALID");
  return ["103"];
}

function validateCountyNameAuthority(bytes: Buffer): void {
  if (sha(bytes) !== COUNTY_CODES_SHA256 || bytes.byteLength !== 44_499) fail("COUNTY_CODE_AUTHORITY_BYTES_INVALID");
  const html = bytes.toString("utf8");
  if (!/<td headers='header3'>36103<\/td>[\s\S]*?<td headers='header5'>103<\/td>[\s\S]*?<td headers='header7'>Suffolk<\/td>[\s\S]*?<td headers='header8'>Suffolk County<\/td>/.test(html)) fail("COUNTY_CODE_NAME_BINDING_INVALID");
}

function checkSources(input: NewYorkMetroPrimaryCountyAuthorityInput): readonly [LockEntry, LockEntry] {
  if (sha(input.indexBytes) !== INDEX_SHA256 || input.indexBytes.byteLength !== 56_832 || sha(input.resultBytes) !== RESULT_SHA256 || input.resultBytes.byteLength !== 15_863) fail("SOURCE_BYTES_INVALID");
  const index = input.indexBytes.toString("utf8"), result = input.resultBytes.toString("ascii");
  if (!index.includes("Election Results from 2002 onwards") || !index.includes("<strong>Final Results</strong>") || !index.includes("Primary Election 2024") || !index.includes("https://apps2.suffolkcountyny.gov/boe/eleres/24pe/default.htm")) fail("INDEX_AUTHORITY_INVALID");
  for (const text of ["Representative in Congress, 1st Congressional District", "(Democratic Party) (Elect 1)", "561 Election Districts", "100.00%", "27,636 Votes cast out of 182,886", "Avlon, John P", "19,383", "Goroff, Nancy S", "8,253"]) if (!result.includes(text)) fail("RESULT_AUTHORITY_INVALID");
  const indexEntry = exactEntry(input.sourceLock.entries, SOURCE_IDS[0], fileEntry("https://suffolkcountyny.gov/Departments/BOE/Election-Results", "data/source/elections/primary-results/new-york/suffolk/2024/election-results-index.html", 56_832, INDEX_SHA256, "official_results_index", []));
  const resultEntry = exactEntry(input.sourceLock.entries, SOURCE_IDS[1], fileEntry("https://apps2.suffolkcountyny.gov/boe/eleres/24pe/DEMs.htm", "data/source/elections/primary-results/new-york/suffolk/2024/cd01-democratic-final-results.html", 15_863, RESULT_SHA256, "official_final_result", [SOURCE_IDS[0]]));
  return [indexEntry, resultEntry];
}

export function buildNewYorkMetroPrimaryCountyAuthorityReceipt(input: NewYorkMetroPrimaryCountyAuthorityInput): NewYorkMetroPrimaryCountyAuthorityReceipt {
  const v2Bytes = Buffer.from(input.dispositionV2Json); if (sha(v2Bytes) !== V2_FILE_SHA256) fail("DISPOSITION_V2_BYTES_INVALID");
  const v2 = validateNewYorkPrimaryDispositionsV2Receipt(JSON.parse(input.dispositionV2Json));
  if (v2.packageSha256 !== NEW_YORK_DISPOSITION_V2_PACKAGE_SHA256 || v2.rows.filter((row) => row.disposition === "unresolved_outside_retained_authority_scope").length !== 18 || v2.rows.find((row) => row.seatCycleId === "ny:2024:us-house:01:democratic")?.disposition !== "unresolved_outside_retained_authority_scope") fail("DISPOSITION_V2_SCOPE_INVALID");
  const districtCountyFips = countyComposition(input.cd119Bytes), sources = (checkSources(input)).map(sourceLockContent);
  validateCountyNameAuthority(input.countyCodesBytes);
  exactEntry(input.sourceLock.entries, "new-york-house-democratic-primary-dispositions-2022-2024-v2", fileEntry("urn:dsa-seats:new-york-house-democratic-primary-dispositions:v2:2022-2024", "data/metadata/new-york-house-democratic-primary-dispositions-2022-2024-v2.json", 54_724, V2_FILE_SHA256, "review_candidate", ["new-york-house-democratic-primary-dispositions-2022-2024-v1", "new-york-city-house-democratic-primary-certified-results-2022-2024-v1"]));
  exactEntry(input.sourceLock.entries, "census-cd119-new-york-block-equivalency-extract-20260805", fileEntry("urn:dsa-seats:census-cd119-bef:36_NY_CD119.txt", "data/source/elections/primary-results/geography/new-york/current/36_NY_CD119.txt", 5_776_392, CD119_SHA256, "derived_extract", ["census-cd119-block-equivalency-bundle-20260805"]));
  exactEntry(input.sourceLock.entries, "census-new-york-county-codes-20260806", fileEntry("https://tigerweb.geo.census.gov/tigerwebmain/Files/bas26/tigerweb_bas26_county_ny.html", "data/source/elections/primary-results/geography/new-york/current/census-county-codes.html", 44_499, COUNTY_CODES_SHA256, "official_county_code_reference", []));
  const rowUnsigned = { authorityId: "ny-metro-county-authority:2024:01:democratic" as const, seatCycleId: "ny:2024:us-house:01:democratic" as const, cycleYear: 2024 as const, electionDate: "2024-06-25" as const, stateCode: "NY" as const, districtCode: "01" as const, party: "Democratic" as const, office: "U.S. Representative" as const, districtCountyFips, districtCountyNames: ["Suffolk"] as const, countyNameAuthoritySourceLockId: "census-new-york-county-codes-20260806" as const, countyNameAuthorityFileSha256: COUNTY_CODES_SHA256, districtBlockCount: 13_001 as const, countyCompositionMethod: "2020_census_block_geoid_county_fips_from_retained_cd119_assignment" as const, countyCompleteness: "all_geographic_counties_covered" as const, authorityPublisher: "Suffolk County Board of Elections" as const, resultScope: "single_county_whole_district" as const, resultStatus: "county_board_final_results_candidate" as const, certificationStatus: "signed_certification_not_separately_retained" as const, supportedDisposition: "reported_contest" as const, sourceContestId: "suffolk:2024:us-house:01:democratic" as const, sourceLockIds: [...SOURCE_IDS] as const, sourceFileSha256s: [INDEX_SHA256, RESULT_SHA256] as const, electionDistrictsReported: 561 as const, electionDistrictsTotal: 561 as const, reportingCompleteness: "all_election_districts_reported" as const, candidates: [{ sourceCandidateName: "John P Avlon" as const, votes: 19_383 as const }, { sourceCandidateName: "Nancy S Goroff" as const, votes: 8_253 as const }] as const, candidateVotes: 27_636 as const, voteReconciliation: "candidate_sum_equals_reported_votes_cast" as const, sourceWinnerStatus: "not_marked_by_source" as const, evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null }, scoreEligible: false as const };
  const authority = { ...rowUnsigned, authorityRowSha256: digest("dsa-seats:ny-metro-primary-county-authority-row:v1\0", rowUnsigned) };
  const authorities = [authority] as const, authorityRowSetSha256 = digest("dsa-seats:ny-metro-primary-county-authority-row-set:v1\0", authorities.map(({ authorityId, authorityRowSha256 }) => ({ authorityId, authorityRowSha256 })));
  const unsigned = { schema: NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_V1, version: 1 as const, generatedAt: "2026-08-06T15:00:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null }, parents: { dispositionV2: { sourceLockId: "new-york-house-democratic-primary-dispositions-2022-2024-v2" as const, fileSha256: V2_FILE_SHA256, packageSha256: NEW_YORK_DISPOSITION_V2_PACKAGE_SHA256 }, cd119BlockAssignment: { sourceLockId: "census-cd119-new-york-block-equivalency-extract-20260805" as const, fileSha256: CD119_SHA256 }, countyCodeAuthority: { sourceLockId: "census-new-york-county-codes-20260806" as const, fileSha256: COUNTY_CODES_SHA256 } }, sources, authorities, authorityRowSetSha256, summary: { targetUnresolvedSeatCycles: 18 as const, acceptedSeatCycles: 1 as const, reportedContestCandidates: 1 as const, certifiedUncontestedCandidates: 0 as const, unresolvedSeatCyclesPreserved: 17 as const, candidateVotes: 27_636 as const, scoreEligibleRows: 0 as const }, limitations: LIMITATIONS, unresolvedGates: GATES };
  return { ...unsigned, packageSha256: digest("dsa-seats:ny-metro-primary-county-authority-package:v1\0", unsigned) };
}

export function validateNewYorkMetroPrimaryCountyAuthorityReceipt(value: NewYorkMetroPrimaryCountyAuthorityReceipt, input: NewYorkMetroPrimaryCountyAuthorityInput): NewYorkMetroPrimaryCountyAuthorityReceipt {
  const rebuilt = buildNewYorkMetroPrimaryCountyAuthorityReceipt(input), { packageSha256, ...unsigned } = value;
  const setHash = digest("dsa-seats:ny-metro-primary-county-authority-row-set:v1\0", value.authorities.map(({ authorityId, authorityRowSha256 }) => ({ authorityId, authorityRowSha256 })));
  const row = value.authorities[0], { authorityRowSha256, ...rowUnsigned } = row;
  if (packageSha256 !== NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_PACKAGE_SHA256 || value.authorityRowSetSha256 !== NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_ROW_SET_SHA256 || setHash !== NEW_YORK_METRO_PRIMARY_COUNTY_AUTHORITY_ROW_SET_SHA256 || authorityRowSha256 !== digest("dsa-seats:ny-metro-primary-county-authority-row:v1\0", rowUnsigned) || packageSha256 !== digest("dsa-seats:ny-metro-primary-county-authority-package:v1\0", unsigned) || canonicalJson(value) !== canonicalJson(rebuilt) || row.candidateVotes !== row.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) || row.electionDistrictsReported !== row.electionDistrictsTotal || row.scoreEligible || Object.values(row.evaluatorValues).some((item) => item !== null)) fail("PACKAGE_INVARIANT_INVALID");
  return value;
}
