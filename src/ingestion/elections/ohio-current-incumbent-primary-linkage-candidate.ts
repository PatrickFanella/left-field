import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateDsaTargetIncumbentRoster } from "../identity/incumbent-tenure-factual-candidate";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import { validateOhioPrimaryResultsReceiptV4, type OhioPrimaryResultsReceiptV4 } from "./ohio-house-democratic-primary-results-receipt-v4";

export const OHIO_PRIMARY_IDENTITY_V1 = "ohio-current-incumbent-primary-linkage-candidate-v1" as const;
export const OHIO_PRIMARY_IDENTITY_OBSERVATION_SET_SHA256 = "a6c2acd6383975e76cfd15055b2ebc388b6c6a7d953edb634b8323cf59fbe288";
export const OHIO_PRIMARY_IDENTITY_PACKAGE_SHA256 = "bbdf13d44228ca37c7076cedd0bca4dedb379b842d252f57c7c56fb8913f92b9";
export const OHIO_PRIMARY_IDENTITY_OUTPUT_FILE_SHA256 = "b4e47cf3f5b17811f83f531637b1f916ba7dea6afceb001ee10a251593912f28";
export const OHIO_PRIMARY_IDENTITY_OUTPUT_BYTE_SIZE = 23_634;

const INPUTS = {
  rosterFile: "8ae9bb3423e6160d00b5395186c42550e28811b817a482650875d87de71079e1", rosterPackage: "cf068848595dee99882ae74a6bef2b76061597fe0daa3c86b30c71bdcae18fee",
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1", proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  houseFile: "4ccea8259aff2df6a175545e45bdac2dfcdf0085a9cc7ab6c46aa80527bc524b", congressFile: "bc48cccd12df96164e5a2415fc41e838ca255fe85c297731515529692f7982cf",
  receiptFile: "9104931022e1fdc671f69678fe2dc4a8d8da44d087f65575ca69af16a3dd2b09", receiptPackage: "f8acd66b060daac23ad13c3054ff42a32c3124ea6986e356a9d82710bff1d295", receiptSet: "30c855938a5462946a0a7962ffc5f523a480f9875da752508810547396d8a3f7",
} as const;
const TARGETS = [
  { districtCode: "01", bioguideId: "L000601", officialHouseName: "Greg Landsman" },
  { districtCode: "03", bioguideId: "B001281", officialHouseName: "Joyce Beatty" },
  { districtCode: "09", bioguideId: "K000009", officialHouseName: "Marcy Kaptur" },
  { districtCode: "11", bioguideId: "B001313", officialHouseName: "Shontel M. Brown" },
  { districtCode: "13", bioguideId: "S001223", officialHouseName: "Emilia Strong Sykes" },
] as const;
const PARENTS = ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "ohio-house-democratic-primary-results-2022-2026-v4"] as const;
const REQUIRED = [
  [PARENTS[0], "urn:dsa-seats:dsa-target-incumbent-roster:v1:2026-08-04", "data/metadata/dsa-target-incumbent-roster-20260804-v1.json", 21_001, INPUTS.rosterFile, "production_projection_receipt", ["congress-legislators-current-20260804", "dsa-target-factual-projection-20260804-v1"]],
  [PARENTS[1], "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", 411_793, INPUTS.proposalFile, "review_proposal", ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"]],
  [PARENTS[2], "https://clerk.house.gov/xml/lists/MemberData.xml", "data/source/identity/house-member-data.xml", 556_140, INPUTS.houseFile, "source", []],
  [PARENTS[3], "https://unitedstates.github.io/congress-legislators/legislators-current.json", "data/source/identity/congress-legislators-current-20260804.json", 1_466_894, INPUTS.congressFile, "source", []],
  [PARENTS[4], "urn:dsa-seats:ohio-house-democratic-primary-results:v4:2022-2026", "data/metadata/ohio-house-democratic-primary-results-2022-2026-v4.json", 38_893, INPUTS.receiptFile, "review_evidence_receipt", ["ohio-house-democratic-primary-results-2022-2026-v3", "oh-2022-may-primary-fulton-results-index", "oh-2022-may-primary-fulton-official-wrapper", "oh-2022-may-primary-fulton-official-summary", "oh-2022-may-primary-stark-official-tabulation"]],
] as const;
type Input = Readonly<{ roster: unknown; rosterFileSha256: string; proposal: unknown; proposalFileSha256: string; houseXml: string; houseFileSha256: string; congressJson: string; congressFileSha256: string; receipt: OhioPrimaryResultsReceiptV4; receiptFileSha256: string; sourceLock: unknown }>;
type LockEntry = Readonly<{ id?: string; url?: string; retainedPath?: string; retainedStatus?: string; byteSize?: number; sha256?: string; kind?: string; parentIds?: readonly string[] }>;
const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const norm = (value: string): string => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const fail = (code: string): never => { throw new Error(`Ohio primary identity rejected: ${code}`); };
const tag = (block: string, name: string): string => block.match(new RegExp(`<${name}(?: [^>]*)?>([^<]*)</${name}>`))?.[1] ?? "";
const exactKeys = (value: unknown, keys: readonly string[]): boolean => typeof value === "object" && value !== null && canonicalJson(Object.keys(value as object).sort()) === canonicalJson([...keys].sort());

export function buildOhioPrimaryIdentityCandidate(input: Input) {
  const hashes = [input.rosterFileSha256, input.proposalFileSha256, input.houseFileSha256, input.congressFileSha256, input.receiptFileSha256, sha(input.houseXml), sha(input.congressJson)];
  const expected = [INPUTS.rosterFile, INPUTS.proposalFile, INPUTS.houseFile, INPUTS.congressFile, INPUTS.receiptFile, INPUTS.houseFile, INPUTS.congressFile];
  if (hashes.some((value, index) => value !== expected[index])) fail("INPUT_HASH_MISMATCH");
  const roster = validateDsaTargetIncumbentRoster(input.roster), proposal = validateHouseDemocraticPrimarySourceSelectionProposal(input.proposal), receipt = validateOhioPrimaryResultsReceiptV4(input.receipt);
  const identityDecision = proposal.decisions.find((decision) => decision.decisionId === "approve-historic-primary-candidate-identity-resolution-v1");
  const dispositionDecision = proposal.decisions.find((decision) => decision.decisionId === "decide-nonstandard-primary-disposition-treatment-v1");
  if (roster.rosterSha256 !== INPUTS.rosterPackage || proposal.packageSha256 !== INPUTS.proposalPackage || receipt.packageSha256 !== INPUTS.receiptPackage || receipt.summary.contestSetSha256 !== INPUTS.receiptSet || receipt.review.resolution !== null || identityDecision?.resolution !== null || dispositionDecision?.resolution !== null || receipt.contests.some((contest) => Number(contest.cycleYear) === 2022) || receipt.summary.districtClosureClaims2022 !== 0) fail("PARENT_INVALID");
  const entries = (input.sourceLock as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) fail("SOURCE_LOCK_MISMATCH");
  for (const [id, url, path, bytes, hash, kind, parents] of REQUIRED) {
    const matches = (entries as LockEntry[]).filter((entry) => entry.id === id), entry = matches[0];
    if (matches.length !== 1 || entry?.url !== url || entry.retainedPath !== path || entry.retainedStatus !== "retained" || entry.byteSize !== bytes || entry.sha256 !== hash || entry.kind !== kind || canonicalJson(entry.parentIds) !== canonicalJson(parents)) fail("SOURCE_LOCK_MISMATCH");
  }
  const output = (entries as LockEntry[]).filter((entry) => entry.id === OHIO_PRIMARY_IDENTITY_V1);
  if (!OHIO_PRIMARY_IDENTITY_OUTPUT_FILE_SHA256) { if (output.length) fail("SOURCE_LOCK_MISMATCH"); }
  else { const entry = output[0]; if (output.length !== 1 || entry?.url !== "urn:dsa-seats:ohio-current-incumbent-primary-linkage-candidate:v1:2024-2026" || entry.retainedPath !== "data/metadata/ohio-current-incumbent-primary-linkage-candidate-v1.json" || entry.retainedStatus !== "retained" || entry.byteSize !== OHIO_PRIMARY_IDENTITY_OUTPUT_BYTE_SIZE || entry.sha256 !== OHIO_PRIMARY_IDENTITY_OUTPUT_FILE_SHA256 || entry.kind !== "review_candidate" || canonicalJson(entry.parentIds) !== canonicalJson(PARENTS)) fail("SOURCE_LOCK_MISMATCH"); }
  let people: Array<{ id?: { bioguide?: string }; name?: { official_full?: string }; terms?: Array<{ state?: string; district?: number }> }>;
  try { people = JSON.parse(input.congressJson) as typeof people; } catch { return fail("CONGRESS_JSON_INVALID"); }
  const blocks = [...input.houseXml.matchAll(/<member>([\s\S]*?)<\/member>/g)].map((match) => match[1]!);
  const observations = receipt.contests.map((contest) => {
    const target = TARGETS.find((row) => row.districtCode === contest.districtCode) ?? fail("TARGET_INVALID"), seatCycleId = `seat_house_oh_${target.districtCode}_current`;
    const rosterMatches = roster.rows.filter((row) => row.seatCycleId === seatCycleId), houseMatches = blocks.filter((block) => tag(block, "bioguideID") === target.bioguideId), peopleMatches = people.filter((person) => person.id?.bioguide === target.bioguideId);
    const block = houseMatches[0], person = peopleMatches[0], term = person?.terms?.at(-1);
    if (rosterMatches.length !== 1 || rosterMatches[0]?.bioguideId !== target.bioguideId || houseMatches.length !== 1 || peopleMatches.length !== 1 || !block || tag(block, "statedistrict") !== `OH${target.districtCode}` || tag(block, "official-name") !== target.officialHouseName || person?.name?.official_full !== target.officialHouseName || term?.state !== "OH" || String(term.district).padStart(2, "0") !== target.districtCode) fail("OFFICIAL_IDENTITY_CLOSURE_INVALID");
    const firstLast = `${tag(block, "firstname")} ${tag(block, "lastname")}`, candidates = contest.candidates.filter((candidate) => norm(candidate.sourceCandidateName) === norm(target.officialHouseName) || norm(candidate.sourceCandidateName) === norm(firstLast));
    if (candidates.length !== 1) fail("CANDIDATE_MATCH_INVALID");
    const sourceCandidate = candidates[0]!, derived = target.bioguideId === "S001223";
    const matchMethod = derived ? "derived_middle_name_omission_same_district" as const : norm(sourceCandidate.sourceCandidateName) === norm(target.officialHouseName) ? "exact_normalized_official_house_name_same_district" as const : "exact_normalized_house_first_last_name_same_district" as const;
    const unsigned = {
      observationId: `oh:identity:${contest.cycleYear}:${contest.districtCode}`, contestId: contest.contestId, contestSha256: contest.contestSha256, cycleYear: contest.cycleYear, electionDate: contest.electionDate, districtCode: contest.districtCode, seatCycleId,
      rosterIdentity: { bioguideId: target.bioguideId, officialHouseName: target.officialHouseName }, sourceCandidate: { sourceCandidateName: sourceCandidate.sourceCandidateName, candidacyKind: sourceCandidate.candidacyKind, votes: sourceCandidate.votes }, sourceCandidateCount: contest.candidates.length, sourceContestVotes: contest.sourceTotalVotes,
      resultAuthorityStatus: contest.resultAuthorityStatus, certificationStatus: contest.certificationStatus, sourceWinnerStatus: contest.sourceWinnerStatus,
      identityStatus: "proposed_identity_link" as const, directIdentifierBridgeAvailable: false as const, matchMethod, evidenceClass: derived ? "derived_name_relationship" as const : "exact_name_observation" as const, confidence: "high" as const, relationshipDisposition: "proposed_identity_link_pending_documented_review" as const,
      identityApproved: false as const, historicalGeographyStatus: "separate_candidate_not_approved" as const, evaluatorUse: "excluded_pending_authorized_identity_and_historical_geography_review" as const, scoreEligible: false as const,
      rationaleCodes: derived ? ["documented_middle_name_omission_same_district", "house_clerk_first_last_name_matches_source", "congress_legislators_official_identity_closure", "source_candidate_has_no_direct_person_identifier", "source_winner_not_marked"] : [matchMethod, "same_district_and_cycle", "source_candidate_has_no_direct_person_identifier", "source_winner_not_marked"],
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:oh-primary-identity-row:v1\0", unsigned) };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.observationId), Buffer.from(right.observationId)));
  if (observations.length !== 10 || new Set(observations.map((row) => row.observationId)).size !== 10) fail("OBSERVATION_CLOSURE_INVALID");
  const summary = { targetSeats: 5 as const, reportedContestObservations: 10 as const, exactNameObservations: 8 as const, derivedNameRelationships: 2 as const, proposedIdentityLinks: 10 as const, partialCountyEvidenceExcluded2022: 12 as const, districtIdentityObservations2022: 0 as const, directIdentifierBridges: 0 as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const };
  const sources = (REQUIRED.map(([id]) => (entries as LockEntry[]).find((entry) => entry.id === id)!)).map(sourceLockContent);
  const unsigned = {
    schema: OHIO_PRIMARY_IDENTITY_V1, version: 1 as const, generatedAt: "2026-08-07T04:20:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, defaultUse: "exclude_from_evaluator_until_authorized_identity_and_historical_geography_review" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null }, inputs: { roster: { sourceLockId: PARENTS[0], fileSha256: INPUTS.rosterFile, rosterSha256: INPUTS.rosterPackage }, proposal: { sourceLockId: PARENTS[1], fileSha256: INPUTS.proposalFile, packageSha256: INPUTS.proposalPackage }, houseClerk: { sourceLockId: PARENTS[2], fileSha256: INPUTS.houseFile }, congressLegislators: { sourceLockId: PARENTS[3], fileSha256: INPUTS.congressFile }, receipt: { sourceLockId: PARENTS[4], fileSha256: INPUTS.receiptFile, packageSha256: INPUTS.receiptPackage, contestSetSha256: INPUTS.receiptSet } },
    sources, methodology: { scope: "five_current_ohio_democratic_target_seats_times_two_closed_statewide_cycles" as const, cyclesIncluded: [2024, 2026] as const, partial2022CountySegmentsCreateIdentityObservations: false as const, directIdentifierBridgeAvailable: false as const, automaticDecisionClosure: false as const, evaluatorNumericValues: 0 as const }, summary, observations, observationSetSha256: digest("dsa-seats:oh-primary-identity-row-set:v1\0", observations),
    decisionSupport: { informsDecisionId: "approve-historic-primary-candidate-identity-resolution-v1" as const, analysisConclusion: "eight_exact_and_two_derived_identity_links_proposed_while_partial_2022_county_evidence_creates_no_identity_observation" as const, lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" as const },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:oh-primary-identity-package:v1\0", unsigned) };
}

export type OhioPrimaryIdentityCandidate = ReturnType<typeof buildOhioPrimaryIdentityCandidate>;
const TOP_KEYS = ["schema", "version", "generatedAt", "sourceCutoff", "reviewerOnly", "publicationEligible", "defaultUse", "review", "inputs", "sources", "methodology", "summary", "observations", "observationSetSha256", "decisionSupport", "packageSha256"] as const;
const ROW_KEYS = ["observationId", "contestId", "contestSha256", "cycleYear", "electionDate", "districtCode", "seatCycleId", "rosterIdentity", "sourceCandidate", "sourceCandidateCount", "sourceContestVotes", "resultAuthorityStatus", "certificationStatus", "sourceWinnerStatus", "identityStatus", "directIdentifierBridgeAvailable", "matchMethod", "evidenceClass", "confidence", "relationshipDisposition", "identityApproved", "historicalGeographyStatus", "evaluatorUse", "scoreEligible", "rationaleCodes", "rowSha256"] as const;
export function validateOhioPrimaryIdentityCandidate(value: OhioPrimaryIdentityCandidate): OhioPrimaryIdentityCandidate {
  const { packageSha256, ...unsigned } = value;
  if (!exactKeys(value, TOP_KEYS) || value.schema !== OHIO_PRIMARY_IDENTITY_V1 || value.version !== 1 || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null || value.observations.length !== 10 || canonicalJson(value.summary) !== canonicalJson({ targetSeats: 5, reportedContestObservations: 10, exactNameObservations: 8, derivedNameRelationships: 2, proposedIdentityLinks: 10, partialCountyEvidenceExcluded2022: 12, districtIdentityObservations2022: 0, directIdentifierBridges: 0, automaticallyApprovedRows: 0, scoreEligibleRows: 0 })) fail("LIFECYCLE_INVALID");
  for (const row of value.observations) {
    const rowUnsigned = structuredClone(row) as Partial<typeof row>; delete rowUnsigned.rowSha256; const derived = row.districtCode === "13";
    if (!exactKeys(row, ROW_KEYS) || Number(row.cycleYear) === 2022 || row.identityStatus !== "proposed_identity_link" || row.directIdentifierBridgeAvailable || row.confidence !== "high" || row.relationshipDisposition !== "proposed_identity_link_pending_documented_review" || row.identityApproved || row.scoreEligible || row.historicalGeographyStatus !== "separate_candidate_not_approved" || row.sourceWinnerStatus !== "not_marked_by_source" || row.resultAuthorityStatus !== "secretary_official_canvass_workbook" || row.certificationStatus !== "official_canvass_workbook_separate_certificate_not_retained" || row.evidenceClass !== (derived ? "derived_name_relationship" : "exact_name_observation") || row.matchMethod !== (derived ? "derived_middle_name_omission_same_district" : row.districtCode === "11" && row.cycleYear === 2024 ? "exact_normalized_house_first_last_name_same_district" : "exact_normalized_official_house_name_same_district") || row.rowSha256 !== digest("dsa-seats:oh-primary-identity-row:v1\0", rowUnsigned)) fail("ROW_INVALID");
  }
  const set = digest("dsa-seats:oh-primary-identity-row-set:v1\0", value.observations);
  if (value.observationSetSha256 !== set || (OHIO_PRIMARY_IDENTITY_OBSERVATION_SET_SHA256 && value.observationSetSha256 !== OHIO_PRIMARY_IDENTITY_OBSERVATION_SET_SHA256) || packageSha256 !== digest("dsa-seats:oh-primary-identity-package:v1\0", unsigned) || (OHIO_PRIMARY_IDENTITY_PACKAGE_SHA256 && packageSha256 !== OHIO_PRIMARY_IDENTITY_PACKAGE_SHA256)) fail("PACKAGE_INVALID");
  return value;
}
