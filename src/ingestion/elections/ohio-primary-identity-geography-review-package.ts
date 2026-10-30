import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import { validateOhioPrimaryIdentityCandidate, type OhioPrimaryIdentityCandidate } from "./ohio-current-incumbent-primary-linkage-candidate";
import { validateOhioPrimaryGeographyCandidate, type OhioPrimaryGeographyCandidate } from "./ohio-primary-geography-compatibility-candidate";

export const OHIO_PRIMARY_JOINT_REVIEW_V1 = "ohio-primary-identity-geography-review-package-v1" as const;
export const OHIO_PRIMARY_JOINT_RECORD_SET_SHA256 = "49974b55c218bf7b8c09b9ab762ec6b7dec58ca106ec4a4dbf5da78b9b8063e3";
export const OHIO_PRIMARY_JOINT_DECISION_SET_SHA256 = "273b432f54004f3b8ad8d08f61ca081b830c1c293767403f2ccb5a24ae6623d3";
export const OHIO_PRIMARY_JOINT_PACKAGE_SHA256 = "948275112e8e6264712e1a3009b435df30dadd7c68ee7c342286716c2f7bb73e";
export const OHIO_PRIMARY_JOINT_OUTPUT_FILE_SHA256 = "209ef0716bbc7dcdb3658f4ad7fbb29d684ec5566099fe0a23847f5fefe95da6";
export const OHIO_PRIMARY_JOINT_OUTPUT_BYTE_SIZE = 39_562;

const INPUTS = {
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1",
  proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  identityFile: "b4e47cf3f5b17811f83f531637b1f916ba7dea6afceb001ee10a251593912f28",
  identityPackage: "bbdf13d44228ca37c7076cedd0bca4dedb379b842d252f57c7c56fb8913f92b9",
  identitySet: "a6c2acd6383975e76cfd15055b2ebc388b6c6a7d953edb634b8323cf59fbe288",
  geographyFile: "6410d7bbb653994c6b624840eb993c708504f9facd31d169e24048576eb97da5",
  geographyPackage: "f45684cde798a8e3b6f6306b48255ef208520db2eccf5e5a7992ddf1b05ff924",
  geographySet: "140e09197591c86d93d3f526c4bd153bb132113642942b5237abbe13d9939a7e",
} as const;

const PARENTS = [
  "house-democratic-primary-source-selection-proposal-20260804-v1",
  "ohio-current-incumbent-primary-linkage-candidate-v1",
  "ohio-primary-geography-compatibility-candidate-v1",
] as const;
const REQUIRED_SOURCES = [
  [PARENTS[0], "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", 411_793, INPUTS.proposalFile, "review_proposal", ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"]],
  [PARENTS[1], "urn:dsa-seats:ohio-current-incumbent-primary-linkage-candidate:v1:2024-2026", "data/metadata/ohio-current-incumbent-primary-linkage-candidate-v1.json", 23_634, INPUTS.identityFile, "review_candidate", ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "ohio-house-democratic-primary-results-2022-2026-v4"]],
  [PARENTS[2], "urn:dsa-seats:ohio-primary-geography-compatibility-candidate:v1:2024-2026", "data/metadata/ohio-primary-geography-compatibility-candidate-v1.json", 18_717, INPUTS.geographyFile, "review_candidate", ["house-democratic-primary-source-selection-proposal-20260804-v1", "ohio-house-democratic-primary-results-2022-2026-v4", "ohio-current-incumbent-primary-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd119-39"]],
] as const;
const UNRESOLVED = ["collect-official-state-primary-results-and-certification-v1", "approve-historic-primary-candidate-identity-resolution-v1", "approve-historical-district-cd119-compatibility-v1", "decide-nonstandard-primary-disposition-treatment-v1", "approve-progressive-candidate-classification-method-v1"] as const;
const review = { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null };

export type OhioPrimaryJointReviewInput = Readonly<{ proposalJson: string; identityJson: string; geographyJson: string; sourceLockJson: string }>;
type LockEntry = Readonly<{ id?: string; url?: string; retainedPath?: string; retainedStatus?: string; byteSize?: number; sha256?: string; kind?: string; parentIds?: readonly string[] }>;
const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (code: string): never => { throw new Error(`Ohio primary joint review rejected: ${code}`); };
const parse = <T>(value: string, code: string): T => { try { return JSON.parse(value) as T; } catch { return fail(code); } };
const exactKeys = (value: unknown, keys: readonly string[]): boolean => typeof value === "object" && value !== null && canonicalJson(Object.keys(value as object).sort()) === canonicalJson([...keys].sort());

function validateLock(value: string): readonly LockEntry[] {
  const parsed = parse<{ entries?: unknown }>(value, "SOURCE_LOCK_JSON_INVALID");
  if (!Array.isArray(parsed.entries)) fail("SOURCE_LOCK_MISMATCH");
  const entries = parsed.entries as LockEntry[];
  for (const [id, url, path, bytes, hash, kind, parents] of REQUIRED_SOURCES) {
    const matches = entries.filter((entry) => entry.id === id), entry = matches[0];
    if (matches.length !== 1 || entry?.url !== url || entry.retainedPath !== path || entry.retainedStatus !== "retained" || entry.byteSize !== bytes || entry.sha256 !== hash || entry.kind !== kind || canonicalJson(entry.parentIds) !== canonicalJson(parents)) fail("SOURCE_LOCK_MISMATCH");
  }
  const output = entries.filter((entry) => entry.id === OHIO_PRIMARY_JOINT_REVIEW_V1);
  if (!OHIO_PRIMARY_JOINT_OUTPUT_FILE_SHA256) {
    if (output.length !== 0) fail("SOURCE_LOCK_MISMATCH");
  } else {
    const entry = output[0];
    if (output.length !== 1 || entry?.url !== "urn:dsa-seats:ohio-primary-identity-geography-review-package:v1:2024-2026" || entry.retainedPath !== "data/metadata/ohio-primary-identity-geography-review-package-v1.json" || entry.retainedStatus !== "retained" || entry.byteSize !== OHIO_PRIMARY_JOINT_OUTPUT_BYTE_SIZE || entry.sha256 !== OHIO_PRIMARY_JOINT_OUTPUT_FILE_SHA256 || entry.kind !== "review_proposal" || canonicalJson(entry.parentIds) !== canonicalJson(PARENTS)) fail("SOURCE_LOCK_MISMATCH");
  }
  return entries;
}

export function buildOhioPrimaryJointReviewPackage(input: OhioPrimaryJointReviewInput) {
  if (sha(input.proposalJson) !== INPUTS.proposalFile || sha(input.identityJson) !== INPUTS.identityFile || sha(input.geographyJson) !== INPUTS.geographyFile) fail("INPUT_HASH_MISMATCH");
  const proposal = validateHouseDemocraticPrimarySourceSelectionProposal(parse(input.proposalJson, "PROPOSAL_JSON_INVALID"));
  const identity = validateOhioPrimaryIdentityCandidate(parse<OhioPrimaryIdentityCandidate>(input.identityJson, "IDENTITY_JSON_INVALID"));
  const geography = validateOhioPrimaryGeographyCandidate(parse<OhioPrimaryGeographyCandidate>(input.geographyJson, "GEOGRAPHY_JSON_INVALID"));
  if (proposal.packageSha256 !== INPUTS.proposalPackage || identity.packageSha256 !== INPUTS.identityPackage || identity.observationSetSha256 !== INPUTS.identitySet || geography.packageSha256 !== INPUTS.geographyPackage || geography.rowSetSha256 !== INPUTS.geographySet || identity.review.resolution !== null || geography.review.resolution !== null || UNRESOLVED.some((id) => proposal.decisions.find((decision) => decision.decisionId === id)?.resolution !== null)) fail("PARENT_INVALID");
  const sources = (validateLock(input.sourceLockJson).filter((entry) => PARENTS.includes(entry.id as typeof PARENTS[number]))).map(sourceLockContent);
  const records = geography.rows.map((geo) => {
    const matches = identity.observations.filter((row) => row.observationId === geo.identityObservationId), identityRow = matches[0];
    if (matches.length !== 1 || identityRow === undefined || geo.identityRowSha256 !== identityRow.rowSha256 || geo.identityStatus !== identityRow.identityStatus || geo.contestId !== identityRow.contestId || geo.contestSha256 !== identityRow.contestSha256 || geo.resultAuthorityStatus !== identityRow.resultAuthorityStatus || geo.certificationStatus !== identityRow.certificationStatus || geo.sourceWinnerStatus !== identityRow.sourceWinnerStatus || geo.cycleYear !== identityRow.cycleYear || geo.electionDate !== identityRow.electionDate || geo.seatCycleId !== identityRow.seatCycleId || geo.districtCode !== identityRow.districtCode) fail("PARENT_JOIN_INVALID");
    const geographyCandidate = geo.compatibilityCandidate;
    const identityRationale = identityRow.evidenceClass === "derived_name_relationship" ? "documented_middle_name_omission_identity_candidate_pending_review" : "exact_same_district_name_candidate_pending_review";
    const unsigned = {
      reviewRecordId: `oh-primary-joint:${identityRow.cycleYear}:${identityRow.districtCode}`,
      identityObservationId: identityRow.observationId, geographyObservationId: geo.geographyObservationId,
      contestId: identityRow.contestId, contestSha256: identityRow.contestSha256, cycleYear: identityRow.cycleYear, electionDate: identityRow.electionDate, seatCycleId: identityRow.seatCycleId, districtCode: identityRow.districtCode,
      bioguideId: identityRow.rosterIdentity.bioguideId, officialHouseName: identityRow.rosterIdentity.officialHouseName, sourceCandidateName: identityRow.sourceCandidate.sourceCandidateName, sourceCandidateVotes: identityRow.sourceCandidate.votes,
      identityParentRowSha256: identityRow.rowSha256, identityStatus: identityRow.identityStatus, identityEvidenceClass: identityRow.evidenceClass, identityConfidence: identityRow.confidence, identityCandidate: true as const, identityApproved: false as const,
      geographyParentRowSha256: geo.rowSha256, targetCd119Geoid: geo.targetCd119Geoid, historicalCongressSession: geo.historicalCongressSession, historicalGeoid: geo.historicalGeoid, compatibilityDisposition: geo.compatibilityDisposition, geographyEvidenceClass: geo.evidenceClass, geographyConfidence: geo.confidence, geographyCandidate, geographyApproved: false as const,
      resultAuthorityStatus: identityRow.resultAuthorityStatus, certificationStatus: identityRow.certificationStatus, sourceWinnerStatus: identityRow.sourceWinnerStatus, nominationConclusion: null, resultConclusion: null,
      reviewCategory: geographyCandidate ? "identity_and_geography_candidates" as const : "identity_candidate_cd120_geography_pending" as const,
      identityDispositionPreserved: true as const, dispositionDecisionStatus: "unresolved" as const, jointApproved: false as const, progressiveClassificationStatus: "not_retained" as const,
      evaluatorUse: "excluded_pending_authority_identity_historical_geography_disposition_classification_and_publication_review" as const, scoreEligible: false as const,
      reviewerAction: geographyCandidate ? "review_identity_and_geography_independently" as const : "review_identity_while_retaining_cd120_geography_authority_pending" as const,
      rationaleCodes: geographyCandidate ? [identityRationale, "geography_candidate_pending_review", "source_winner_not_marked_no_nomination_or_result_inference", "partial_2022_county_evidence_not_converted_to_district_observation", "parent_candidates_not_approved_by_join"] : [identityRationale, "cd120_geography_authority_not_retained", "do_not_assume_cd119_continuity_for_2026", "partial_2022_county_evidence_not_converted_to_district_observation", "parent_candidates_not_approved_by_join"],
    };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:oh-primary-joint-row:v1\0", unsigned) };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.reviewRecordId), Buffer.from(right.reviewRecordId)));
  if (records.length !== 10 || new Set(records.map((row) => row.reviewRecordId)).size !== 10 || new Set(records.map((row) => row.identityObservationId)).size !== 10 || new Set(records.map((row) => row.geographyObservationId)).size !== 10 || records.some((row) => Number(row.cycleYear) === 2022)) fail("JOIN_CLOSURE_INVALID");
  const ids = records.map((row) => row.reviewRecordId);
  const decision = (decisionId: string, affectedComponent: string, parentDecisionId: string, recommendedDecision: string, workCompletedWhileWaiting: string) => ({
    decisionId, affectedComponent, parentDecisionId, question: `Review ${affectedComponent} independently for the scoped Ohio records.`, recommendedDecision,
    defaultReversibleAssumption: "exclude_affected_records_from_evaluator_and_publication" as const, alternatives: ["accept_scoped_candidate_evidence", "retain_exclusion_or_request_correction"] as const,
    consequences: ["accepted evidence remains separately gated from publication", "nonacceptance preserves current exclusion without blocking other work"] as const,
    confidence: "high" as const, evidenceRecordIds: ids, blocksAffectedPublication: true as const, blocksOtherWork: false as const, workCompletedWhileWaiting, review,
  });
  const decisions = [
    decision("oh-primary:accept-official-result-authority-v1", "official result authority", UNRESOLVED[0], "accept_official_canvass_workbook_authority_without_creating_source_winner_nomination_or_candidate_certification_claims", "All ten statewide target contests retain the exact official workbook authority and certification boundary; partial 2022 county evidence remains excluded."),
    decision("oh-primary:accept-geography-compatibility-v1", "historical geography compatibility", UNRESOLVED[2], "accept_five_cd119_geography_candidates_and_retain_five_cd120_authority_pending_rows", "Five 2024 candidates use exact CD119 keys; five 2026 rows remain unassessed pending CD120 authority; zero 2022 geography rows are created."),
    decision("oh-primary:accept-identity-links-v1", "candidate identity links", UNRESOLVED[1], "accept_eight_exact_and_two_documented_middle_name_omission_identity_candidates_without_claiming_a_direct_identifier_bridge", "Ten identity candidates are joined, including two derived Emilia Sykes relationships, and remain unapproved."),
    decision("oh-primary:retain-primary-disposition-exclusion-v1", "primary disposition treatment", UNRESOLVED[3], "retain_source_winner_unmarked_and_no_nomination_or_result_conclusion_pending_review", "No vote-rank, winner, nominee, uncontested, or other disposition inference is introduced."),
    decision("oh-primary:retain-progressive-classification-exclusion-v1", "progressive classification", UNRESOLVED[4], "retain_all_records_outside_progressive_classification_until_separate_evidence", "No progressive classification evidence is introduced by the identity/geography join."),
  ];
  const summary = { reviewRecords: 10 as const, identityAndGeographyCandidates: 5 as const, identityCandidateCd120GeographyPending: 5 as const, partialCountyEvidenceExcluded2022: 12 as const, districtReviewRecords2022: 0 as const, cd118ToCd119PlanContinuityCandidates: 0 as const, officialAuthorityRecords: 10 as const, identityCandidates: 10 as const, exactIdentityCandidates: 8 as const, derivedIdentityCandidates: 2 as const, geographyCandidates: 5 as const, proposedDecisions: 5 as const, jointApprovedRecords: 0 as const, scoreEligibleRecords: 0 as const };
  const unsigned = {
    schema: OHIO_PRIMARY_JOINT_REVIEW_V1, version: 1 as const, generatedAt: "2026-08-07T05:30:00.000Z" as const, sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const, publicationEligible: false as const, defaultUse: "exclude_from_evaluator_until_independent_authority_identity_geography_disposition_classification_and_publication_review" as const, review,
    inputs: { sourceSelectionProposal: { sourceLockId: PARENTS[0], fileSha256: INPUTS.proposalFile, packageSha256: INPUTS.proposalPackage }, identity: { sourceLockId: PARENTS[1], fileSha256: INPUTS.identityFile, packageSha256: INPUTS.identityPackage, observationSetSha256: INPUTS.identitySet }, geography: { sourceLockId: PARENTS[2], fileSha256: INPUTS.geographyFile, packageSha256: INPUTS.geographyPackage, rowSetSha256: INPUTS.geographySet } },
    sources, sourceSetSha256: digest("dsa-seats:oh-primary-joint-source-set:v1\0", sources),
    methodology: { joinKey: "identity_observation_id_and_parent_row_hash" as const, cyclesIncluded: [2024, 2026] as const, partial2022CountySegmentsCreateJointRecords: false as const, partialCountyEvidenceExcluded2022: 12 as const, decisionsReviewedIndependently: true as const, jointPackageApprovesParents: false as const, automaticApprovals: 0 as const, evaluatorNumericValues: 0 as const, cd120ContinuityInferred: false as const, rawTigerGeometryEqualityAssessed: false as const, overlapAssessed: false as const, populationEquivalenceAssessed: false as const },
    summary, records, reviewRecordSetSha256: digest("dsa-seats:oh-primary-joint-row-set:v1\0", records), decisions, decisionSetSha256: digest("dsa-seats:oh-primary-joint-decision-set:v1\0", decisions),
    inheritedDecisionResolutions: { authority: null, identity: null, geography: null, disposition: null, progressiveClassification: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:oh-primary-joint-package:v1\0", unsigned) };
}

export type OhioPrimaryJointReviewPackage = ReturnType<typeof buildOhioPrimaryJointReviewPackage>;
const TOP_KEYS = ["schema", "version", "generatedAt", "sourceCutoff", "reviewerOnly", "publicationEligible", "defaultUse", "review", "inputs", "sources", "sourceSetSha256", "methodology", "summary", "records", "reviewRecordSetSha256", "decisions", "decisionSetSha256", "inheritedDecisionResolutions", "packageSha256"] as const;
const RECORD_KEYS = ["reviewRecordId", "identityObservationId", "geographyObservationId", "contestId", "contestSha256", "cycleYear", "electionDate", "seatCycleId", "districtCode", "bioguideId", "officialHouseName", "sourceCandidateName", "sourceCandidateVotes", "identityParentRowSha256", "identityStatus", "identityEvidenceClass", "identityConfidence", "identityCandidate", "identityApproved", "geographyParentRowSha256", "targetCd119Geoid", "historicalCongressSession", "historicalGeoid", "compatibilityDisposition", "geographyEvidenceClass", "geographyConfidence", "geographyCandidate", "geographyApproved", "resultAuthorityStatus", "certificationStatus", "sourceWinnerStatus", "nominationConclusion", "resultConclusion", "reviewCategory", "identityDispositionPreserved", "dispositionDecisionStatus", "jointApproved", "progressiveClassificationStatus", "evaluatorUse", "scoreEligible", "reviewerAction", "rationaleCodes", "reviewRecordSha256"] as const;

export function validateOhioPrimaryJointReviewPackage(value: OhioPrimaryJointReviewPackage): OhioPrimaryJointReviewPackage {
  const { packageSha256, ...unsigned } = value;
  if (!exactKeys(value, TOP_KEYS) || value.schema !== OHIO_PRIMARY_JOINT_REVIEW_V1 || value.version !== 1 || value.generatedAt !== "2026-08-07T05:30:00.000Z" || value.sourceCutoff !== "2026-08-06" || !value.reviewerOnly || value.publicationEligible || canonicalJson(value.review) !== canonicalJson(review) || canonicalJson(value.summary) !== canonicalJson({ reviewRecords: 10, identityAndGeographyCandidates: 5, identityCandidateCd120GeographyPending: 5, partialCountyEvidenceExcluded2022: 12, districtReviewRecords2022: 0, cd118ToCd119PlanContinuityCandidates: 0, officialAuthorityRecords: 10, identityCandidates: 10, exactIdentityCandidates: 8, derivedIdentityCandidates: 2, geographyCandidates: 5, proposedDecisions: 5, jointApprovedRecords: 0, scoreEligibleRecords: 0 }) || value.records.length !== 10 || value.decisions.length !== 5) fail("PACKAGE_INVALID");
  for (const [index, row] of value.records.entries()) {
    const rowUnsigned = structuredClone(row) as Partial<typeof row>; delete rowUnsigned.reviewRecordSha256;
    const pending = row.cycleYear === 2026;
    // @ts-expect-error Runtime validation deliberately rejects an out-of-union 2022 mutation.
    if (!exactKeys(row, RECORD_KEYS) || row.reviewRecordId !== `oh-primary-joint:${row.cycleYear}:${row.districtCode}` || row.cycleYear === 2022 || row.identityStatus !== "proposed_identity_link" || !["exact_name_observation", "derived_name_relationship"].includes(row.identityEvidenceClass) || row.identityConfidence !== "high" || !row.identityCandidate || row.identityApproved || row.geographyApproved || row.jointApproved || row.scoreEligible || !row.identityDispositionPreserved || row.dispositionDecisionStatus !== "unresolved" || row.progressiveClassificationStatus !== "not_retained" || row.resultAuthorityStatus !== "secretary_official_canvass_workbook" || row.certificationStatus !== "official_canvass_workbook_separate_certificate_not_retained" || row.sourceWinnerStatus !== "not_marked_by_source" || row.nominationConclusion !== null || row.resultConclusion !== null || row.reviewRecordSha256 !== digest("dsa-seats:oh-primary-joint-row:v1\0", rowUnsigned) || (pending ? row.reviewCategory !== "identity_candidate_cd120_geography_pending" || row.historicalCongressSession !== "120" || row.historicalGeoid !== null || row.compatibilityDisposition !== "unassessed_cd120_authority_collection_pending" || row.geographyEvidenceClass !== "authority_pending" || row.geographyConfidence !== "none" || row.geographyCandidate : row.reviewCategory !== "identity_and_geography_candidates" || row.historicalCongressSession !== "119" || row.historicalGeoid !== row.targetCd119Geoid || row.compatibilityDisposition !== "same_cd119_session_and_geoid_exact_key_candidate" || row.geographyEvidenceClass !== "derived_exact_session_and_key" || row.geographyConfidence !== "high" || !row.geographyCandidate) || (index > 0 && row.reviewRecordId <= value.records[index - 1]!.reviewRecordId)) fail("ROW_INVALID");
    const expectedIdentityEvidence = row.districtCode === "13" ? "derived_name_relationship" : "exact_name_observation";
    if (row.identityEvidenceClass !== expectedIdentityEvidence) fail("IDENTITY_EVIDENCE_INVALID");
  }
  const ids = value.records.map((row) => row.reviewRecordId);
  if (value.decisions.some((decision) => canonicalJson(decision.review) !== canonicalJson(review) || canonicalJson(decision.evidenceRecordIds) !== canonicalJson(ids)) || canonicalJson(value.decisions.map((decision) => [decision.decisionId, decision.evidenceRecordIds.length])) !== canonicalJson([["oh-primary:accept-official-result-authority-v1", 10], ["oh-primary:accept-geography-compatibility-v1", 10], ["oh-primary:accept-identity-links-v1", 10], ["oh-primary:retain-primary-disposition-exclusion-v1", 10], ["oh-primary:retain-progressive-classification-exclusion-v1", 10]])) fail("DECISION_INVALID");
  if (value.reviewRecordSetSha256 !== digest("dsa-seats:oh-primary-joint-row-set:v1\0", value.records) || (OHIO_PRIMARY_JOINT_RECORD_SET_SHA256 && value.reviewRecordSetSha256 !== OHIO_PRIMARY_JOINT_RECORD_SET_SHA256) || value.decisionSetSha256 !== digest("dsa-seats:oh-primary-joint-decision-set:v1\0", value.decisions) || (OHIO_PRIMARY_JOINT_DECISION_SET_SHA256 && value.decisionSetSha256 !== OHIO_PRIMARY_JOINT_DECISION_SET_SHA256) || packageSha256 !== digest("dsa-seats:oh-primary-joint-package:v1\0", unsigned) || (OHIO_PRIMARY_JOINT_PACKAGE_SHA256 && packageSha256 !== OHIO_PRIMARY_JOINT_PACKAGE_SHA256)) fail("PACKAGE_INVALID");
  return value;
}
