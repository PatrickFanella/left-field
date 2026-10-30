import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import { MAINE_PRIMARY_IDENTITY_FILE_BYTES, MAINE_PRIMARY_IDENTITY_FILE_SHA256, MAINE_PRIMARY_IDENTITY_PACKAGE_SHA256, MAINE_PRIMARY_IDENTITY_SET_SHA256, validateMainePrimaryIdentityCandidate, type MainePrimaryIdentityCandidate } from "./maine-current-incumbent-primary-linkage-candidate";
import { type MainePrimaryGeographyCompatibilityCandidate } from "./maine-primary-geography-compatibility-candidate";

export const MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_PACKAGE_V1 = "maine-primary-identity-geography-review-package-v1" as const;
export const MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_FILE_BYTES = 31_735 as const;
export const MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_FILE_SHA256 = "eda87181e5eedae58e1ca3a79a1f5703e9030ca86086b29605adc2e925815275" as const;
export const MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_RECORD_SET_SHA256 = "8fe903813e1e924e1c173577e9ce29f1b542cf3d1c11b8cab9eed8c855122e38" as const;
export const MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_DECISION_SET_SHA256 = "5048910d5632be13576707553d42e4bc5e30caba59d9927a930e206deb4dcf14" as const;
export const MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_PACKAGE_SHA256 = "ee5cc894c95fb17a662c1197125078909d5e042ed42d3915f351801d8f01a283" as const;

type LockEntry = Readonly<{ id?: string; url?: string; retainedPath?: string; retainedStatus?: string; byteSize?: number; sha256?: string; kind?: string; parentIds?: readonly string[] }>;
export type MainePrimaryIdentityGeographyReviewInput = Readonly<{ proposalJson: string; identityCandidateJson: string; geographyCandidateJson: string; sourceLockJson: string }>;

const PARENTS = ["house-democratic-primary-source-selection-proposal-20260804-v1", "maine-current-incumbent-primary-linkage-candidate-v1", "maine-primary-geography-compatibility-candidate-v1"] as const;
const INPUTS = {
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1", proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  identityFile: MAINE_PRIMARY_IDENTITY_FILE_SHA256, identityPackage: MAINE_PRIMARY_IDENTITY_PACKAGE_SHA256, identitySet: MAINE_PRIMARY_IDENTITY_SET_SHA256,
  geographyFile: "da85b195e8c98e04575121a2a816c1c779724a6459e7cc5f5863603676c3131e", geographyPackage: "12d8fbc3142a2704bcb21e9ea169276d135fcda98d401c2c0b95e79ad27474f3", geographySet: "f67496dfbab0fb9ca222be2bc463abd2546f0810ad8c467a6388a26d49f73e6d",
} as const;
const REQUIRED_SOURCES = [
  [PARENTS[0], "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", 411_793, INPUTS.proposalFile, "review_proposal", ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"]],
  [PARENTS[1], "urn:dsa-seats:maine-current-incumbent-primary-linkage-candidate:v1:2022-2026", "data/metadata/maine-current-incumbent-primary-linkage-candidate-v1.json", MAINE_PRIMARY_IDENTITY_FILE_BYTES, INPUTS.identityFile, "review_candidate", ["dsa-target-incumbent-roster-20260804-v1", PARENTS[0], "house-xml", "congress-legislators-current-20260804", "maine-house-democratic-primary-results-2022-2026-v1"]],
  [PARENTS[2], "urn:dsa-seats:maine-primary-geography-compatibility-candidate:v1:2022-2026", "data/metadata/maine-primary-geography-compatibility-candidate-v1.json", 20_729, INPUTS.geographyFile, "review_candidate", [PARENTS[0], "maine-house-democratic-primary-results-2022-2026-v1", PARENTS[1], "maine-primary-geography-authority-source-receipt-v1"]],
] as const;
const DECISIONS = ["collect-official-state-primary-results-and-certification-v1", "approve-historical-district-cd119-compatibility-v1", "approve-historic-primary-candidate-identity-resolution-v1", "decide-nonstandard-primary-disposition-treatment-v1", "approve-progressive-candidate-classification-method-v1"] as const;
const review = { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null };
const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_INVALID:${reason}`); };
const parse = <T>(value: string, reason: string): T => { try { return JSON.parse(value) as T; } catch { return fail(reason); } };

function validateSourceLock(value: string): readonly LockEntry[] {
  const parsed = parse<{ version?: unknown; entries?: unknown }>(value, "SOURCE_LOCK_JSON");
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) fail("SOURCE_LOCK");
  const entries = parsed.entries as LockEntry[];
  for (const [id, url, retainedPath, byteSize, expectedSha, kind, parentIds] of REQUIRED_SOURCES) {
    const matches = entries.filter((entry) => entry.id === id), entry = matches[0];
    if (matches.length !== 1 || entry?.url !== url || entry.retainedPath !== retainedPath || entry.retainedStatus !== "retained" || entry.byteSize !== byteSize || entry.sha256 !== expectedSha || entry.kind !== kind || canonicalJson(entry.parentIds) !== canonicalJson(parentIds)) fail("SOURCE_LOCK");
  }
  const output = entries.filter((entry) => entry.id === MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_PACKAGE_V1);
  const outputEntry = output[0];
  if (output.length !== 1 || outputEntry?.url !== "urn:dsa-seats:maine-primary-identity-geography-review-package:v1:2022-2026" || outputEntry.retainedPath !== "data/metadata/maine-primary-identity-geography-review-package-v1.json" || outputEntry.retainedStatus !== "retained" || outputEntry.byteSize !== MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_FILE_BYTES || outputEntry.sha256 !== MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_FILE_SHA256 || outputEntry.kind !== "review_proposal" || canonicalJson(outputEntry.parentIds) !== canonicalJson(PARENTS)) fail("OUTPUT_LOCK");
  return entries;
}

function assemble(input: MainePrimaryIdentityGeographyReviewInput) {
  if (sha(input.proposalJson) !== INPUTS.proposalFile || sha(input.identityCandidateJson) !== INPUTS.identityFile || sha(input.geographyCandidateJson) !== INPUTS.geographyFile) fail("INPUT_BYTES");
  const proposal = validateHouseDemocraticPrimarySourceSelectionProposal(parse(input.proposalJson, "PROPOSAL_JSON"));
  const identity = validateMainePrimaryIdentityCandidate(parse<MainePrimaryIdentityCandidate>(input.identityCandidateJson, "IDENTITY_JSON"));
  const geography = parse<MainePrimaryGeographyCompatibilityCandidate>(input.geographyCandidateJson, "GEOGRAPHY_JSON");
  if (proposal.packageSha256 !== INPUTS.proposalPackage || identity.packageSha256 !== INPUTS.identityPackage || identity.observationSetSha256 !== INPUTS.identitySet || geography.schema !== "maine-primary-geography-compatibility-candidate-v1" || geography.packageSha256 !== INPUTS.geographyPackage || geography.rowSetSha256 !== INPUTS.geographySet || identity.review.resolution !== null || geography.review.resolution !== null || DECISIONS.some((decisionId) => proposal.decisions.find((decision) => decision.decisionId === decisionId)?.resolution !== null)) fail("PARENT_INVARIANT");
  const sources = (validateSourceLock(input.sourceLockJson).filter((entry) => PARENTS.includes(entry.id as typeof PARENTS[number]))).map(sourceLockContent);
  const identityById = new Map(identity.observations.map((row) => [row.observationId, row]));
  if (identityById.size !== 6 || geography.rows.length !== 6) fail("PARENT_ROW_CLOSURE");
  const records = geography.rows.map((geo) => {
    const identityRow = identityById.get(geo.identityObservationId) ?? fail("IDENTITY_JOIN");
    if (geo.parentIdentityRowSha256 !== identityRow.rowSha256 || geo.cycleYear !== identityRow.cycleYear || geo.electionDate !== identityRow.electionDate || geo.districtCode !== identityRow.sourceDistrictCode || geo.targetSeatId !== identityRow.targetSeatId || geo.bioguideId !== identityRow.bioguideId || geo.sourceContestId !== identityRow.sourceContestId || geo.sourceContestSha256 !== identityRow.sourceContestSha256 || geo.identityStatus !== identityRow.identityStatus || geo.sourceCandidateName !== identityRow.sourceCandidateName || geo.sourceCandidateVotes !== identityRow.sourceCandidateVotes || geo.resultAuthorityStatus !== identityRow.resultAuthorityStatus || geo.certificationStatus !== identityRow.certificationStatus || geo.sourceWinnerStatus !== identityRow.sourceWinnerStatus || geo.winnerSourceCandidateName !== identityRow.winnerSourceCandidateName || geo.rcvFirstChoiceNamedCandidateDelta !== identityRow.rcvFirstChoiceNamedCandidateDelta || !geo.compatibilityCandidate || geo.identityApproved || geo.compatibilityApproved || geo.scoreEligible || identityRow.identityApproved || identityRow.scoreEligible) fail("PARENT_JOIN");
    const identityCandidate = identityRow.identityStatus === "proposed_identity_link";
    const reviewCategory = identityCandidate ? "identity_and_geography_candidates" as const : "geography_candidate_identity_source_unobserved" as const;
    const unsigned = {
      reviewRecordId: `me-primary-joint:${geo.cycleYear}:${geo.districtCode}`,
      identityObservationId: identityRow.observationId, identityParentRowSha256: identityRow.rowSha256,
      geographyObservationId: geo.geographyObservationId, geographyParentRowSha256: geo.rowSha256, geographyAuthorityObservationId: geo.geographyAuthorityObservationId, geographyAuthorityParentRowSha256: geo.parentAuthorityRowSha256,
      cycleYear: geo.cycleYear, electionDate: geo.electionDate, targetSeatId: geo.targetSeatId, bioguideId: geo.bioguideId, officialHouseName: geo.officialHouseName, districtCode: geo.districtCode,
      sourceContestId: geo.sourceContestId, sourceContestSha256: geo.sourceContestSha256, sourceCandidateName: geo.sourceCandidateName, sourceCandidateVotes: geo.sourceCandidateVotes,
      identityStatus: identityRow.identityStatus, relationshipDisposition: identityRow.relationshipDisposition, identityEvidenceClass: identityRow.evidenceClass, identityConfidence: identityRow.confidence, identityCandidate, identityApproved: false as const,
      targetCd119Geoid: geo.targetCd119Geoid, historicalCongressSession: geo.historicalCongressSession, historicalGeoid: geo.historicalGeoid, compatibilityDisposition: geo.compatibilityDisposition, geographyEvidenceClass: geo.geographyEvidenceClass, geographyCandidate: geo.compatibilityCandidate, geographyApproved: false as const,
      cd118Cd119AssignmentIdentitySupport: geo.cd118Cd119AssignmentIdentitySupport, exactCd119SessionAssignmentSupport: geo.exactCd119SessionAssignmentSupport, stateLawPlanContinuitySupport: geo.stateLawPlanContinuitySupport, cd120CensusGeometryRetained: false as const, noCd120CensusGeoidInferred: geo.noCd120CensusGeoidInferred,
      resultAuthorityStatus: geo.resultAuthorityStatus, certificationStatus: geo.certificationStatus, sourceWinnerStatus: geo.sourceWinnerStatus, winnerSourceCandidateName: geo.winnerSourceCandidateName, sourceWinnerIdentityTreatment: geo.sourceWinnerIdentityTreatment, rcvFirstChoiceNamedCandidateDelta: geo.rcvFirstChoiceNamedCandidateDelta, rcvSourcePrecedenceResolution: geo.rcvSourcePrecedenceResolution,
      reviewCategory, resultAuthorityReviewStatus: "proposed" as const, rankedChoiceDispositionReviewStatus: "exclude_pending_review" as const, progressiveClassificationStatus: "exclude_pending_separate_evidence" as const,
      jointApproved: false as const, evaluatorUse: "excluded_pending_result_authority_identity_historical_geography_ranked_choice_disposition_progressive_classification_and_publication_review" as const, evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null }, scoreEligible: false as const,
    };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:maine-primary-joint-review-row:v1\0", unsigned) };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.reviewRecordId), Buffer.from(right.reviewRecordId)));
  const allIds = records.map((record) => record.reviewRecordId);
  const me02 = records.at(-1) ?? fail("ME02_MISSING");
  if (records.length !== 6 || new Set(allIds).size !== 6 || records.filter((record) => record.reviewCategory === "identity_and_geography_candidates").length !== 5 || records.filter((record) => record.reviewCategory === "geography_candidate_identity_source_unobserved").length !== 1 || records.filter((record) => record.identityEvidenceClass === "exact_name_observation").length !== 2 || records.filter((record) => record.identityEvidenceClass === "derived_name_relationship").length !== 3 || records.filter((record) => !record.identityCandidate).length !== 1 || records.filter((record) => record.geographyCandidate).length !== 6 || records.filter((record) => record.cd118Cd119AssignmentIdentitySupport).length !== 2 || records.filter((record) => record.exactCd119SessionAssignmentSupport).length !== 2 || records.filter((record) => record.stateLawPlanContinuitySupport).length !== 2 || records.some((record) => record.identityApproved || record.geographyApproved || record.jointApproved || record.scoreEligible || record.cd120CensusGeometryRetained) || me02.reviewCategory !== "geography_candidate_identity_source_unobserved" || me02.identityCandidate || !me02.geographyCandidate || me02.sourceCandidateName !== null || me02.sourceWinnerStatus !== "explicit_rcv_summary_winner" || me02.winnerSourceCandidateName !== "Dunlap, Matthew G." || me02.rcvFirstChoiceNamedCandidateDelta !== 81 || me02.historicalGeoid !== null || !me02.noCd120CensusGeoidInferred) fail("RECORD_CLOSURE");
  const decision = (decisionId: string, parentDecisionId: typeof DECISIONS[number], affectedComponent: string, recommendedDecision: string, workCompletedWhileWaiting: string) => ({ decisionId, parentDecisionId, affectedComponent, question: `Review ${affectedComponent} independently for all six Maine primary review records.`, recommendedDecision, defaultReversibleAssumption: "exclude_affected_records_from_evaluator_and_publication" as const, alternatives: ["accept_scoped_candidate_evidence", "retain_exclusion_or_request_correction"] as const, consequences: ["acceptance remains separately gated from publication", "nonacceptance preserves exclusion without blocking other work"] as const, confidence: "high" as const, evidenceRecordIds: allIds, blocksAffectedPublication: true as const, blocksOtherWork: false as const, workCompletedWhileWaiting, review });
  const decisions = [
    decision("me-primary:review-result-authority-v1", DECISIONS[0], "official result authority", "accept_retained_maine_secretary_primary_tabulations_with_cycle_specific_certification_boundaries_and_no_new_winner_or_nomination_conclusion", "All six result rows preserve exact source authority and certification boundaries."),
    decision("me-primary:review-geography-compatibility-v1", DECISIONS[1], "historical geography compatibility", "accept_six_geography_candidates_with_two_cd118_cd119_two_same_cd119_and_two_state_law_continuity_without_cd120_geometry", "All six candidate treatments and the explicit CD120 boundary are retained."),
    decision("me-primary:review-identity-links-v1", DECISIONS[2], "candidate identity links", "accept_five_exact_or_documented_name_relationship_candidates_and_retain_one_2026_me02_current_incumbent_source_nonappearance", "Five candidate links and the Golden nonappearance are isolated without inventing a direct identifier bridge."),
    decision("me-primary:retain-ranked-choice-nonstandard-disposition-exclusion-v1", DECISIONS[3], "ranked-choice and nonstandard primary disposition", "retain_ranked_choice_and_nonstandard_primary_disposition_exclusion_pending_separate_review", "The Dunlap result-only marker and 81-vote delta remain facts, not selection, winner, nomination, or score conclusions."),
    decision("me-primary:retain-progressive-classification-exclusion-v1", DECISIONS[4], "progressive candidate classification", "retain_all_six_records_outside_progressive_classification_until_separate_evidence_and_review", "No progressive classification evidence is introduced by this joint package."),
  ];
  const unsigned = {
    schema: MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_PACKAGE_V1, version: 1 as const, generatedAt: "2026-08-07T11:15:00.000Z" as const, sourceCutoff: "2026-08-07" as const,
    reviewerOnly: true as const, publicationEligible: false as const, defaultUse: "exclude_from_evaluator_until_independent_result_authority_identity_historical_geography_ranked_choice_disposition_progressive_classification_and_publication_review" as const, review,
    inputs: { proposal: { sourceLockId: PARENTS[0], fileSha256: INPUTS.proposalFile, packageSha256: proposal.packageSha256 }, identityCandidate: { sourceLockId: PARENTS[1], fileSha256: INPUTS.identityFile, packageSha256: identity.packageSha256, observationSetSha256: identity.observationSetSha256 }, geographyCandidate: { sourceLockId: PARENTS[2], fileSha256: INPUTS.geographyFile, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 } },
    sources, sourceSetSha256: digest("dsa-seats:maine-primary-joint-review-source-set:v1\0", sources),
    methodology: { joinKey: "identity_observation_id_and_exact_identity_parent_row_hash" as const, allParentRowsRetained: true as const, reviewsIndependent: true as const, jointPackageApprovesParents: false as const, rawGeometryEqualityAssessed: false as const, sourcePlanToCd119ExactBlockConcordanceAssessed: false as const, cd120CensusGeometryAssessed: false as const, evaluatorNumericValues: 0 as const },
    summary: { reviewRecords: 6 as const, identityAndGeographyCandidates: 5 as const, geographyCandidateIdentitySourceUnobserved: 1 as const, exactNameIdentityCandidates: 2 as const, derivedNameIdentityCandidates: 3 as const, identityNonappearanceRecords: 1 as const, cd118Cd119Candidates: 2 as const, sameCd119SessionCandidates: 2 as const, stateLawContinuingPlanCandidatesWithoutCd120Geometry: 2 as const, geographyCandidates: 6 as const, proposedDecisions: 5 as const, jointApprovedRecords: 0 as const, scoreEligibleRecords: 0 as const },
    records, reviewRecordSetSha256: digest("dsa-seats:maine-primary-joint-review-record-set:v1\0", records), decisions, decisionSetSha256: digest("dsa-seats:maine-primary-joint-review-decision-set:v1\0", decisions),
    inheritedDecisionResolutions: { resultAuthority: null, geography: null, identity: null, rankedChoiceDisposition: null, progressiveClassification: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:maine-primary-joint-review-package:v1\0", unsigned) };
}

export type MainePrimaryIdentityGeographyReviewPackage = ReturnType<typeof assemble>;
export function buildMainePrimaryIdentityGeographyReviewPackage(input: MainePrimaryIdentityGeographyReviewInput): MainePrimaryIdentityGeographyReviewPackage { return assemble(input); }
export function validateMainePrimaryIdentityGeographyReviewPackage(value: MainePrimaryIdentityGeographyReviewPackage, input: MainePrimaryIdentityGeographyReviewInput): MainePrimaryIdentityGeographyReviewPackage {
  const rebuilt = assemble(input);
  if (canonicalJson(value) !== canonicalJson(rebuilt) || (MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_RECORD_SET_SHA256 && value.reviewRecordSetSha256 !== MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_RECORD_SET_SHA256) || (MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_DECISION_SET_SHA256 && value.decisionSetSha256 !== MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_DECISION_SET_SHA256) || (MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_PACKAGE_SHA256 && value.packageSha256 !== MAINE_PRIMARY_IDENTITY_GEOGRAPHY_REVIEW_PACKAGE_SHA256)) fail("SEMANTIC_OR_HASH_DRIFT");
  return value;
}
