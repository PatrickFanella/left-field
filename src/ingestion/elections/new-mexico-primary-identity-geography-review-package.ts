import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import { validateNewMexicoPrimaryIdentityCandidate, type NewMexicoPrimaryIdentityCandidate } from "./new-mexico-current-incumbent-primary-linkage-candidate";
import { validateNewMexicoPrimaryGeographyCandidate, type NewMexicoPrimaryGeographyCandidate } from "./new-mexico-primary-geography-compatibility-candidate";

export const NEW_MEXICO_PRIMARY_JOINT_REVIEW_V1 = "new-mexico-primary-identity-geography-review-package-v1" as const;
export const NEW_MEXICO_PRIMARY_JOINT_RECORD_SET_SHA256 = "29033d920d005ec96cf82925b96ff7953a0784edbd60c0db7576341e35183dc3";
export const NEW_MEXICO_PRIMARY_JOINT_DECISION_SET_SHA256 = "afdef5f837f3666d2008f13fc91330c238fdad4df8b401248c8133179aadaf1a";
export const NEW_MEXICO_PRIMARY_JOINT_PACKAGE_SHA256 = "b11ecdc2ad4b02d24bff70f878638fa3b3761a4f449655341afd4815644338d9";
export const NEW_MEXICO_PRIMARY_JOINT_OUTPUT_FILE_SHA256 = "d3bb4a9d909c2772a7ccbdd6e78441ff2310fb1cf44a1165c55831502e01830b";
export const NEW_MEXICO_PRIMARY_JOINT_OUTPUT_BYTE_SIZE = 34_840;

const INPUTS = {
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1",
  proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  identityFile: "3168dd12c54063af9e6108f64933ec35fd87dbae84afdcaa8c729e4960115e36",
  identityPackage: "d80ff1b59482b020643a6215aecdfca733b4b52ddb21c3d419ff2d0ea3ab1adf",
  identitySet: "ad2d5c14d05a4ad3d569341ee9d9ae00e24fd44f0adf604dbe1c6dbd13dd08b1",
  geographyFile: "65d3c31d5a8b1d59d045cfbee81789da56cc2d2aabea284cb1b40dafa9966e87",
  geographyPackage: "ac4331bd84d6a05a660cf62b2bde0c819ad404a82f33d54f8f5ac808f296e9af",
  geographySet: "e69637b098ee9f709cee64be52590c11899f4a2bbd1653f2c63d2da030193f81",
} as const;

const PARENTS = ["house-democratic-primary-source-selection-proposal-20260804-v1", "new-mexico-current-incumbent-primary-linkage-candidate-v1", "new-mexico-primary-geography-compatibility-candidate-v1"] as const;
const REQUIRED = [
  [PARENTS[0], "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", 411_793, INPUTS.proposalFile, "review_proposal", ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"]],
  [PARENTS[1], "urn:dsa-seats:new-mexico-current-incumbent-primary-linkage-candidate:v1:2026-08-07", "data/metadata/new-mexico-current-incumbent-primary-linkage-candidate-v1.json", 25_591, INPUTS.identityFile, "review_candidate", ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "new-mexico-house-democratic-primary-results-2022-2026-v1"]],
  [PARENTS[2], "urn:dsa-seats:new-mexico-primary-geography-compatibility-candidate:v1:2022-2026", "data/metadata/new-mexico-primary-geography-compatibility-candidate-v1.json", 18_168, INPUTS.geographyFile, "review_candidate", ["house-democratic-primary-source-selection-proposal-20260804-v1", "new-mexico-house-democratic-primary-results-2022-2026-v1", "new-mexico-current-incumbent-primary-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-35", "tiger-cd119-35"]],
] as const;
const CONTROL = ["collect-official-state-primary-results-and-certification-v1", "approve-historic-primary-candidate-identity-resolution-v1", "approve-historical-district-cd119-compatibility-v1", "decide-nonstandard-primary-disposition-treatment-v1", "approve-progressive-candidate-classification-method-v1"] as const;
const review = { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null };
type Input = { proposalJson: string; identityJson: string; geographyJson: string; sourceLockJson: string };
type LockEntry = { id?: string; url?: string; retainedPath?: string; retainedStatus?: string; byteSize?: number; sha256?: string; kind?: string; parentIds?: readonly string[] };
const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (code: string): never => { throw new Error(`New Mexico primary joint review rejected: ${code}`); };
const parse = <T>(value: string): T => { try { return JSON.parse(value) as T; } catch { return fail("JSON_INVALID"); } };
const exactKeys = (value: unknown, keys: readonly string[]): boolean => typeof value === "object" && value !== null && !Array.isArray(value) && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());

export function buildNewMexicoPrimaryJointReviewPackage(input: Input) {
  if (sha(input.proposalJson) !== INPUTS.proposalFile || sha(input.identityJson) !== INPUTS.identityFile || sha(input.geographyJson) !== INPUTS.geographyFile) fail("INPUT_HASH_MISMATCH");
  const proposal = validateHouseDemocraticPrimarySourceSelectionProposal(parse(input.proposalJson));
  const identity = validateNewMexicoPrimaryIdentityCandidate(parse<NewMexicoPrimaryIdentityCandidate>(input.identityJson));
  const geography = validateNewMexicoPrimaryGeographyCandidate(parse<NewMexicoPrimaryGeographyCandidate>(input.geographyJson));
  if (proposal.packageSha256 !== INPUTS.proposalPackage || identity.packageSha256 !== INPUTS.identityPackage || identity.observationSetSha256 !== INPUTS.identitySet || geography.packageSha256 !== INPUTS.geographyPackage || geography.rowSetSha256 !== INPUTS.geographySet || identity.review.resolution !== null || geography.review.resolution !== null || CONTROL.some((id) => proposal.decisions.find((row) => row.decisionId === id)?.resolution !== null)) fail("PARENT_INVALID");

  const lock = parse<{ entries?: LockEntry[] }>(input.sourceLockJson);
  const entries = lock.entries ?? fail("SOURCE_LOCK_MISMATCH");
  if (!Array.isArray(entries)) fail("SOURCE_LOCK_MISMATCH");
  for (const [id, url, path, bytes, hash, kind, parents] of REQUIRED) {
    const matches = entries.filter((entry) => entry.id === id), entry = matches[0];
    if (matches.length !== 1 || entry?.url !== url || entry.retainedPath !== path || entry.retainedStatus !== "retained" || entry.byteSize !== bytes || entry.sha256 !== hash || entry.kind !== kind || canonicalJson(entry.parentIds) !== canonicalJson(parents)) fail("SOURCE_LOCK_MISMATCH");
  }
  const output = entries.filter((entry) => entry.id === NEW_MEXICO_PRIMARY_JOINT_REVIEW_V1);
  if (NEW_MEXICO_PRIMARY_JOINT_OUTPUT_FILE_SHA256) {
    const entry = output[0];
    if (output.length !== 1 || entry?.url !== "urn:dsa-seats:new-mexico-primary-identity-geography-review-package:v1:2022-2026" || entry.retainedPath !== "data/metadata/new-mexico-primary-identity-geography-review-package-v1.json" || entry.retainedStatus !== "retained" || entry.byteSize !== NEW_MEXICO_PRIMARY_JOINT_OUTPUT_BYTE_SIZE || entry.sha256 !== NEW_MEXICO_PRIMARY_JOINT_OUTPUT_FILE_SHA256 || entry.kind !== "review_proposal" || canonicalJson(entry.parentIds) !== canonicalJson(PARENTS)) fail("SOURCE_LOCK_MISMATCH");
  } else if (output.length) fail("SOURCE_LOCK_MISMATCH");

  const records = geography.rows.map((geo) => {
    const matches = identity.observations.filter((row) => row.observationId === geo.identityObservationId), person = matches[0];
    if (matches.length !== 1 || !person || geo.identityRowSha256 !== person.rowSha256 || geo.contestId !== person.sourceContestId || geo.contestSha256 !== person.sourceContestSha256 || geo.targetSeatId !== person.targetSeatId || geo.districtCode !== person.currentTargetDistrictCode || geo.sourceDistrictCode !== person.sourceDistrictCode || geo.cycleYear !== person.cycleYear || geo.electionDate !== person.electionDate || geo.resultAuthorityStatus !== person.resultAuthorityStatus || geo.certificationStatus !== person.certificationStatus || geo.sourceWinnerStatus !== person.sourceWinnerStatus) fail("JOIN_INVALID");
    const category = geo.compatibilityCandidate ? "identity_and_geography_candidates" as const : "identity_candidate_cd120_geography_pending" as const;
    const unsigned = {
      reviewRecordId: `nm-primary-joint:${person.cycleYear}:${person.currentTargetDistrictCode}`,
      identityObservationId: person.observationId,
      geographyObservationId: geo.geographyObservationId,
      sourceContestId: person.sourceContestId,
      sourceContestSha256: person.sourceContestSha256,
      cycleYear: person.cycleYear,
      electionDate: person.electionDate,
      targetSeatId: person.targetSeatId,
      currentTargetDistrictCode: person.currentTargetDistrictCode,
      sourceDistrictCode: person.sourceDistrictCode,
      bioguideId: person.bioguideId,
      officialHouseName: person.officialHouseName,
      sourceCandidateId: person.sourceCandidateId,
      sourceCandidateName: person.sourceCandidateName,
      sourceCandidateVotes: person.sourceCandidateVotes,
      identityParentRowSha256: person.rowSha256,
      identityStatus: person.identityStatus,
      identityEvidenceClass: person.evidenceClass,
      identityConfidence: person.confidence,
      directIdentifierBridgeAvailable: person.directIdentifierBridgeAvailable,
      identityCandidate: true as const,
      identityApproved: false as const,
      geographyParentRowSha256: geo.rowSha256,
      targetCd119Geoid: geo.targetCd119Geoid,
      historicalCongressSession: geo.historicalCongressSession,
      historicalGeoid: geo.historicalGeoid,
      compatibilityDisposition: geo.compatibilityDisposition,
      geographyEvidenceClass: geo.evidenceClass,
      geographyConfidence: geo.confidence,
      geographyCandidate: geo.compatibilityCandidate,
      geographyApproved: false as const,
      resultAuthorityStatus: person.resultAuthorityStatus,
      certificationStatus: person.certificationStatus,
      sourceWinnerStatus: person.sourceWinnerStatus,
      winnerConclusion: null,
      nominationConclusion: null,
      resultConclusion: null,
      reviewCategory: category,
      identityDispositionPreserved: true as const,
      dispositionDecisionStatus: "unresolved" as const,
      jointApproved: false as const,
      progressiveClassificationStatus: "not_retained" as const,
      evaluatorUse: "excluded_pending_authority_identity_historical_geography_disposition_classification_and_publication_review" as const,
      scoreEligible: false as const,
      reviewerAction: geo.compatibilityCandidate ? "review_identity_and_geography_independently" as const : "review_identity_while_retaining_cd120_geography_authority_pending" as const,
    };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:nm-primary-joint-row:v1\0", unsigned) };
  }).sort((a, b) => a.reviewRecordId.localeCompare(b.reviewRecordId));
  if (records.length !== 9 || new Set(records.map((row) => row.reviewRecordId)).size !== 9 || new Set(records.map((row) => row.identityObservationId)).size !== 9 || new Set(records.map((row) => row.geographyObservationId)).size !== 9) fail("CLOSURE_INVALID");

  const ids = records.map((row) => row.reviewRecordId);
  const decision = (decisionId: string, parentDecisionId: string, affectedComponent: string, recommendedDecision: string) => ({ decisionId, parentDecisionId, affectedComponent, question: `Review ${affectedComponent} independently for all nine New Mexico records.`, recommendedDecision, defaultReversibleAssumption: "exclude_affected_records_from_evaluator_and_publication" as const, alternatives: ["accept_scoped_candidate_evidence", "retain_exclusion_or_request_correction"] as const, consequences: ["accepted evidence remains separately gated from publication", "nonacceptance preserves exclusion without blocking other work"] as const, confidence: "high" as const, evidenceRecordIds: ids, blocksAffectedPublication: true as const, blocksOtherWork: false as const, review });
  const decisions = [
    decision("nm-primary:accept-official-result-authority-v1", CONTROL[0], "official result authority", "accept_nine_secretary_official_federal_result_observations_with_cycle_specific_certification_boundaries_without_winner_or_nomination_claims"),
    decision("nm-primary:accept-geography-compatibility-v1", CONTROL[2], "historical geography compatibility", "accept_six_geography_candidates_and_retain_three_cd120_authority_pending_rows"),
    decision("nm-primary:accept-identity-links-v1", CONTROL[1], "candidate identity links", "accept_three_exact_and_six_documented_name_relationship_candidates_without_direct_identifier_bridge"),
    decision("nm-primary:retain-primary-disposition-exclusion-v1", CONTROL[3], "primary disposition treatment", "retain_source_winner_unmarked_and_null_winner_nomination_and_result_conclusions"),
    decision("nm-primary:retain-progressive-classification-exclusion-v1", CONTROL[4], "progressive classification", "retain_all_records_outside_progressive_classification_until_separate_evidence"),
  ];
  const summary = { reviewRecords: 9 as const, identityAndGeographyCandidates: 6 as const, identityCandidateCd120GeographyPending: 3 as const, officialAuthorityRecords: 9 as const, identityCandidates: 9 as const, geographyCandidates: 6 as const, exactIdentityCandidates: 3 as const, derivedIdentityCandidates: 6 as const, proposedDecisions: 5 as const, jointApprovedRecords: 0 as const, scoreEligibleRecords: 0 as const };
  const sources = (entries.filter((entry) => PARENTS.includes(entry.id as typeof PARENTS[number]))).map(sourceLockContent);
  const unsigned = {
    schema: NEW_MEXICO_PRIMARY_JOINT_REVIEW_V1,
    version: 1 as const,
    generatedAt: "2026-08-07T10:15:00.000Z" as const,
    sourceCutoff: "2026-08-07" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_independent_authority_identity_geography_disposition_classification_and_publication_review" as const,
    review,
    inputs: { proposal: { sourceLockId: PARENTS[0], fileSha256: INPUTS.proposalFile, packageSha256: INPUTS.proposalPackage }, identity: { sourceLockId: PARENTS[1], fileSha256: INPUTS.identityFile, packageSha256: INPUTS.identityPackage, observationSetSha256: INPUTS.identitySet }, geography: { sourceLockId: PARENTS[2], fileSha256: INPUTS.geographyFile, packageSha256: INPUTS.geographyPackage, rowSetSha256: INPUTS.geographySet } },
    sources,
    sourceSetSha256: digest("dsa-seats:nm-primary-joint-source-set:v1\0", sources),
    methodology: { joinKey: "identity_observation_id_and_parent_row_hash" as const, decisionsReviewedIndependently: true as const, jointPackageApprovesParents: false as const, automaticApprovals: 0 as const, evaluatorNumericValues: 0 as const, cd120ContinuityInferred: false as const, rawTigerGeometryEqualityAssessed: false as const, overlapAssessed: false as const, populationEquivalenceAssessed: false as const },
    summary,
    records,
    reviewRecordSetSha256: digest("dsa-seats:nm-primary-joint-row-set:v1\0", records),
    decisions,
    decisionSetSha256: digest("dsa-seats:nm-primary-joint-decision-set:v1\0", decisions),
    inheritedDecisionResolutions: { authority: null, identity: null, geography: null, disposition: null, progressiveClassification: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:nm-primary-joint-package:v1\0", unsigned) };
}

export type NewMexicoPrimaryJointReviewPackage = ReturnType<typeof buildNewMexicoPrimaryJointReviewPackage>;

const TOP_KEYS = ["schema", "version", "generatedAt", "sourceCutoff", "reviewerOnly", "publicationEligible", "defaultUse", "review", "inputs", "sources", "sourceSetSha256", "methodology", "summary", "records", "reviewRecordSetSha256", "decisions", "decisionSetSha256", "inheritedDecisionResolutions", "packageSha256"] as const;
const RECORD_KEYS = ["reviewRecordId", "identityObservationId", "geographyObservationId", "sourceContestId", "sourceContestSha256", "cycleYear", "electionDate", "targetSeatId", "currentTargetDistrictCode", "sourceDistrictCode", "bioguideId", "officialHouseName", "sourceCandidateId", "sourceCandidateName", "sourceCandidateVotes", "identityParentRowSha256", "identityStatus", "identityEvidenceClass", "identityConfidence", "directIdentifierBridgeAvailable", "identityCandidate", "identityApproved", "geographyParentRowSha256", "targetCd119Geoid", "historicalCongressSession", "historicalGeoid", "compatibilityDisposition", "geographyEvidenceClass", "geographyConfidence", "geographyCandidate", "geographyApproved", "resultAuthorityStatus", "certificationStatus", "sourceWinnerStatus", "winnerConclusion", "nominationConclusion", "resultConclusion", "reviewCategory", "identityDispositionPreserved", "dispositionDecisionStatus", "jointApproved", "progressiveClassificationStatus", "evaluatorUse", "scoreEligible", "reviewerAction", "reviewRecordSha256"] as const;

export function validateNewMexicoPrimaryJointReviewPackage(value: NewMexicoPrimaryJointReviewPackage): NewMexicoPrimaryJointReviewPackage {
  const { packageSha256, ...unsigned } = value;
  const expectedSummary = { reviewRecords: 9, identityAndGeographyCandidates: 6, identityCandidateCd120GeographyPending: 3, officialAuthorityRecords: 9, identityCandidates: 9, geographyCandidates: 6, exactIdentityCandidates: 3, derivedIdentityCandidates: 6, proposedDecisions: 5, jointApprovedRecords: 0, scoreEligibleRecords: 0 };
  if (!exactKeys(value, TOP_KEYS) || value.schema !== NEW_MEXICO_PRIMARY_JOINT_REVIEW_V1 || value.version !== 1 || value.generatedAt !== "2026-08-07T10:15:00.000Z" || value.sourceCutoff !== "2026-08-07" || !value.reviewerOnly || value.publicationEligible || canonicalJson(value.review) !== canonicalJson(review) || canonicalJson(value.summary) !== canonicalJson(expectedSummary) || value.records.length !== 9 || value.decisions.length !== 5) fail("PACKAGE_INVALID");
  if (value.records.some((row, index) => {
    if (!exactKeys(row, RECORD_KEYS)) return true;
    const rowUnsigned = structuredClone(row) as Partial<typeof row>; delete rowUnsigned.reviewRecordSha256;
    const pending = row.cycleYear === 2026;
    const expectedCertification = row.cycleYear === 2022 ? "official_results_archive_retained_no_separate_signed_certificate" : "state_canvass_certification_announcement_retained_exact_certificate_bytes_not_retained";
    return row.reviewRecordId !== `nm-primary-joint:${row.cycleYear}:${row.currentTargetDistrictCode}` || row.reviewRecordSha256 !== digest("dsa-seats:nm-primary-joint-row:v1\0", rowUnsigned) || row.identityStatus !== "proposed_identity_link" || row.identityConfidence !== "high" || row.directIdentifierBridgeAvailable || !row.identityCandidate || row.identityApproved || row.geographyApproved || row.jointApproved || row.scoreEligible || row.resultAuthorityStatus !== "secretary_official_federal_results_export_retained" || row.certificationStatus !== expectedCertification || row.sourceWinnerStatus !== "not_marked_by_source" || row.winnerConclusion !== null || row.nominationConclusion !== null || row.resultConclusion !== null || !row.identityDispositionPreserved || row.dispositionDecisionStatus !== "unresolved" || row.progressiveClassificationStatus !== "not_retained" || (pending ? row.reviewCategory !== "identity_candidate_cd120_geography_pending" || row.historicalCongressSession !== "120" || row.historicalGeoid !== null || row.compatibilityDisposition !== "unassessed_cd120_authority_collection_pending" || row.geographyEvidenceClass !== "authority_pending" || row.geographyConfidence !== "none" || row.geographyCandidate : row.reviewCategory !== "identity_and_geography_candidates" || row.historicalGeoid !== row.targetCd119Geoid || !row.geographyCandidate || row.geographyConfidence !== "high") || (index > 0 && row.reviewRecordId <= value.records[index - 1]!.reviewRecordId);
  })) fail("ROW_INVALID");
  if (value.records.filter((row) => row.identityEvidenceClass === "exact_name_observation").length !== 3 || value.records.filter((row) => row.identityEvidenceClass === "derived_name_relationship").length !== 6) fail("ROW_INVALID");
  const ids = value.records.map((row) => row.reviewRecordId);
  if (value.decisions.some((decision) => canonicalJson(decision.review) !== canonicalJson(review) || canonicalJson(decision.evidenceRecordIds) !== canonicalJson(ids)) || canonicalJson(value.decisions.map((decision) => decision.decisionId)) !== canonicalJson(["nm-primary:accept-official-result-authority-v1", "nm-primary:accept-geography-compatibility-v1", "nm-primary:accept-identity-links-v1", "nm-primary:retain-primary-disposition-exclusion-v1", "nm-primary:retain-progressive-classification-exclusion-v1"])) fail("DECISION_INVALID");
  if (value.reviewRecordSetSha256 !== digest("dsa-seats:nm-primary-joint-row-set:v1\0", value.records) || (NEW_MEXICO_PRIMARY_JOINT_RECORD_SET_SHA256 && value.reviewRecordSetSha256 !== NEW_MEXICO_PRIMARY_JOINT_RECORD_SET_SHA256) || value.decisionSetSha256 !== digest("dsa-seats:nm-primary-joint-decision-set:v1\0", value.decisions) || (NEW_MEXICO_PRIMARY_JOINT_DECISION_SET_SHA256 && value.decisionSetSha256 !== NEW_MEXICO_PRIMARY_JOINT_DECISION_SET_SHA256) || packageSha256 !== digest("dsa-seats:nm-primary-joint-package:v1\0", unsigned) || (NEW_MEXICO_PRIMARY_JOINT_PACKAGE_SHA256 && packageSha256 !== NEW_MEXICO_PRIMARY_JOINT_PACKAGE_SHA256)) fail("PACKAGE_INVALID");
  return value;
}
