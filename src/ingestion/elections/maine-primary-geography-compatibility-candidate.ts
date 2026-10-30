import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import { MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_BYTES, MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_SHA256, MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_PACKAGE_SHA256, MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_SET_SHA256, validateMainePrimaryGeographyAuthoritySourceReceipt, type MainePrimaryGeographyAuthoritySourceReceipt } from "./maine-primary-geography-authority-source-receipt";
import { MAINE_PRIMARY_IDENTITY_FILE_BYTES, MAINE_PRIMARY_IDENTITY_FILE_SHA256, MAINE_PRIMARY_IDENTITY_PACKAGE_SHA256, MAINE_PRIMARY_IDENTITY_SET_SHA256, validateMainePrimaryIdentityCandidate, type MainePrimaryIdentityCandidate } from "./maine-current-incumbent-primary-linkage-candidate";
import { MAINE_PRIMARY_CONTEST_SET_SHA256, MAINE_PRIMARY_FILE_BYTES, MAINE_PRIMARY_FILE_SHA256, MAINE_PRIMARY_PACKAGE_SHA256, MAINE_PRIMARY_TARGET_OBSERVATION_SET_SHA256, validateMainePrimaryResultsReceipt, type MainePrimaryResultsReceipt } from "./maine-house-democratic-primary-results-receipt";

export const MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_V1 = "maine-primary-geography-compatibility-candidate-v1" as const;
// First-generation pins are deliberately blank until this proposed candidate is generated and source-locked.
export const MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_SET_SHA256 = "f67496dfbab0fb9ca222be2bc463abd2546f0810ad8c467a6388a26d49f73e6d" as const;
export const MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_PACKAGE_SHA256 = "12d8fbc3142a2704bcb21e9ea169276d135fcda98d401c2c0b95e79ad27474f3" as const;
export const MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_FILE_SHA256 = "da85b195e8c98e04575121a2a816c1c779724a6459e7cc5f5863603676c3131e" as const;
export const MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_FILE_BYTES = 20_729 as const;

type LockEntry = Readonly<{ id: string; url: string; retainedPath: string; retainedStatus: "retained"; byteSize: number; sha256: string; kind: string; parentIds: readonly string[] }>;
type SourceLock = Readonly<{ version: number; entries: readonly LockEntry[] }>;
export type MainePrimaryGeographyCompatibilityCandidateInput = Readonly<{ proposalJson: string; resultsReceiptJson: string; identityCandidateJson: string; authorityReceiptJson: string; sourceLock: SourceLock }>;

const PARENTS = ["house-democratic-primary-source-selection-proposal-20260804-v1", "maine-house-democratic-primary-results-2022-2026-v1", "maine-current-incumbent-primary-linkage-candidate-v1", "maine-primary-geography-authority-source-receipt-v1"] as const;
const INPUTS = {
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1",
  proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  resultsFile: MAINE_PRIMARY_FILE_SHA256, resultsPackage: MAINE_PRIMARY_PACKAGE_SHA256,
  identityFile: MAINE_PRIMARY_IDENTITY_FILE_SHA256, identityPackage: MAINE_PRIMARY_IDENTITY_PACKAGE_SHA256,
  authorityFile: MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_SHA256, authorityPackage: MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_PACKAGE_SHA256,
} as const;
const REQUIRED: readonly LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", retainedPath: "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", retainedStatus: "retained", byteSize: 411_793, sha256: INPUTS.proposalFile, kind: "review_proposal", parentIds: ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"] },
  { id: PARENTS[1], url: "urn:dsa-seats:maine-house-democratic-primary-results:v1:2022-2026", retainedPath: "data/metadata/maine-house-democratic-primary-results-2022-2026-v1.json", retainedStatus: "retained", byteSize: MAINE_PRIMARY_FILE_BYTES, sha256: INPUTS.resultsFile, kind: "review_candidate", parentIds: [PARENTS[0], "maine-2022-house-democratic-primary-cd01-results", "maine-2022-house-democratic-primary-cd02-results", "maine-2024-house-democratic-primary-cd01-results", "maine-2024-house-democratic-primary-cd02-results", "maine-2026-house-democratic-primary-cd01-results", "maine-2026-house-democratic-primary-cd02-first-choice-results", "maine-2026-house-democratic-primary-cd02-rcv-summary-layout-text"] },
  { id: PARENTS[2], url: "urn:dsa-seats:maine-current-incumbent-primary-linkage-candidate:v1:2022-2026", retainedPath: "data/metadata/maine-current-incumbent-primary-linkage-candidate-v1.json", retainedStatus: "retained", byteSize: MAINE_PRIMARY_IDENTITY_FILE_BYTES, sha256: INPUTS.identityFile, kind: "review_candidate", parentIds: ["dsa-target-incumbent-roster-20260804-v1", PARENTS[0], "house-xml", "congress-legislators-current-20260804", PARENTS[1]] },
  { id: PARENTS[3], url: "urn:dsa-seats:maine-primary-geography-authority-source-receipt:v1:2022-2026", retainedPath: "data/metadata/maine-primary-geography-authority-source-receipt-v1.json", retainedStatus: "retained", byteSize: MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_BYTES, sha256: INPUTS.authorityFile, kind: "evidence_receipt", parentIds: ["maine-legislature-ld1739-status-20260807", "maine-pl-2021-c487-congressional-plan", "maine-pl-2021-c487-congressional-plan-text", "maine-mrsa-21a-1205a-congressional-districts-20260807", "maine-mrsa-21a-1206-reapportionment-20260807", "census-cd118-block-equivalency-bundle-20260806", "census-cd118-maine-block-equivalency-extract-20260807", "census-cd119-block-equivalency-bundle-20260805", "census-cd119-maine-block-equivalency-extract-20260807", "census-cd119-plan-change-authority-20260805", "tiger-cd119-23"] },
];

const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_INVALID:${reason}`); };
const parse = (value: string, reason: string): unknown => { try { return JSON.parse(value); } catch { return fail(reason); } };
const exact = (entries: readonly LockEntry[], expected: LockEntry): void => { const matches = entries.filter((entry) => entry.id === expected.id); if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail("SOURCE_LOCK"); };

function parents(input: MainePrimaryGeographyCompatibilityCandidateInput) {
  if (input.sourceLock.version !== 1 || sha(input.proposalJson) !== INPUTS.proposalFile || sha(input.resultsReceiptJson) !== INPUTS.resultsFile || sha(input.identityCandidateJson) !== INPUTS.identityFile || sha(input.authorityReceiptJson) !== INPUTS.authorityFile) fail("INPUT_BYTES");
  for (const entry of REQUIRED) exact(input.sourceLock.entries, entry);
  const output = input.sourceLock.entries.filter((entry) => entry.id === MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_V1);
  if (output.length !== 1 || canonicalJson(sourceLockContent(output[0])) !== canonicalJson(sourceLockContent({ id: MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_V1, url: "urn:dsa-seats:maine-primary-geography-compatibility-candidate:v1:2022-2026", retainedPath: "data/metadata/maine-primary-geography-compatibility-candidate-v1.json", retainedStatus: "retained", byteSize: MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_FILE_BYTES, sha256: MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_FILE_SHA256, kind: "review_candidate", parentIds: PARENTS }))) fail("OUTPUT_LOCK");
  const proposal = validateHouseDemocraticPrimarySourceSelectionProposal(parse(input.proposalJson, "PROPOSAL_JSON"));
  const results = validateMainePrimaryResultsReceipt(parse(input.resultsReceiptJson, "RESULTS_JSON") as MainePrimaryResultsReceipt);
  const identity = validateMainePrimaryIdentityCandidate(parse(input.identityCandidateJson, "IDENTITY_JSON") as MainePrimaryIdentityCandidate);
  const authority = validateMainePrimaryGeographyAuthoritySourceReceipt(parse(input.authorityReceiptJson, "AUTHORITY_JSON") as MainePrimaryGeographyAuthoritySourceReceipt);
  if (proposal.packageSha256 !== INPUTS.proposalPackage || results.packageSha256 !== INPUTS.resultsPackage || results.summary.contestSetSha256 !== MAINE_PRIMARY_CONTEST_SET_SHA256 || results.summary.targetObservationSetSha256 !== MAINE_PRIMARY_TARGET_OBSERVATION_SET_SHA256 || identity.packageSha256 !== INPUTS.identityPackage || identity.observationSetSha256 !== MAINE_PRIMARY_IDENTITY_SET_SHA256 || authority.packageSha256 !== INPUTS.authorityPackage || authority.cycleDispositionRowSetSha256 !== MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_SET_SHA256) fail("PARENT_INVARIANT");
  const decision = proposal.decisions.find((entry) => entry.decisionId === "approve-historical-district-cd119-compatibility-v1");
  if (!decision || decision.resolution !== null || results.review.resolution !== null || identity.review.resolution !== null || authority.review.resolution !== null) fail("PARENT_REVIEW_STATE");
  return { proposal, results, identity, authority };
}

function assemble(input: MainePrimaryGeographyCompatibilityCandidateInput) {
  const parent = parents(input);
  const authorityByKey = new Map(parent.authority.cycleDispositionRows.map((row) => [`${row.cycleYear}:${row.districtCode}`, row]));
  if (authorityByKey.size !== 6 || parent.identity.observations.length !== 6) fail("PARENT_ROW_CLOSURE");
  const rows = parent.identity.observations.map((identity) => {
    const authority = authorityByKey.get(`${identity.cycleYear}:${identity.sourceDistrictCode}`) ?? fail("AUTHORITY_JOIN_MISSING");
    if (authority.electionDate !== identity.electionDate || authority.districtCode !== identity.sourceDistrictCode || authority.geographyAuthorityObservationId !== `me:geography-authority:${identity.cycleYear}:${identity.sourceDistrictCode}` || !authority.compatibilityCandidate || authority.approved || authority.scoreEligible || identity.identityApproved || identity.scoreEligible) fail("PARENT_ROW_MISMATCH");
    const historicalGeoid = identity.cycleYear === 2026 ? null : `23${identity.sourceDistrictCode}`;
    if (authority.historicalCongressSession !== (identity.cycleYear === 2022 ? "118" : identity.cycleYear === 2024 ? "119" : "120") || (identity.cycleYear !== 2026 && authority.disposition !== (identity.cycleYear === 2022 ? "official_enacted_plan_and_identical_cd118_cd119_assignment_candidate" : "same_cd119_session_assignment_candidate")) || (identity.cycleYear === 2026 && authority.disposition !== "state_law_continuing_plan_candidate_without_cd120_census_geometry")) fail("AUTHORITY_TREATMENT");
    const unsigned = {
      geographyObservationId: `me:geography:${identity.cycleYear}:${identity.sourceDistrictCode}`,
      identityObservationId: identity.observationId, parentIdentityRowSha256: identity.rowSha256,
      geographyAuthorityObservationId: authority.geographyAuthorityObservationId, parentAuthorityRowSha256: authority.rowSha256,
      cycleYear: identity.cycleYear, electionDate: identity.electionDate, targetSeatId: identity.targetSeatId, bioguideId: identity.bioguideId, officialHouseName: identity.officialHouseName,
      districtCode: identity.sourceDistrictCode, targetCd119Geoid: `23${identity.sourceDistrictCode}`, historicalCongressSession: authority.historicalCongressSession, historicalGeoid,
      sourceContestId: identity.sourceContestId, sourceContestSha256: identity.sourceContestSha256, identityStatus: identity.identityStatus, relationshipDisposition: identity.relationshipDisposition,
      sourceCandidateName: identity.sourceCandidateName, sourceCandidateVotes: identity.sourceCandidateVotes, resultAuthorityStatus: identity.resultAuthorityStatus, certificationStatus: identity.certificationStatus,
      sourceWinnerStatus: identity.sourceWinnerStatus, winnerSourceCandidateName: identity.winnerSourceCandidateName, sourceWinnerIdentityTreatment: identity.sourceWinnerIdentityTreatment,
      rcvFirstChoiceNamedCandidateDelta: identity.rcvFirstChoiceNamedCandidateDelta, rcvSourcePrecedenceResolution: identity.rcvSourcePrecedenceResolution,
      compatibilityDisposition: authority.disposition, geographyEvidenceClass: authority.evidenceClass, compatibilityCandidate: authority.compatibilityCandidate,
      cd118Cd119AssignmentIdentitySupport: authority.cd118Cd119AssignmentIdentitySupport, exactCd119SessionAssignmentSupport: authority.exactCd119SessionAssignmentSupport, stateLawPlanContinuitySupport: authority.stateLawPlanContinuitySupport,
      cd120CensusGeometryRetained: false as const, noCd120CensusGeoidInferred: identity.cycleYear === 2026,
      rawGeometryEqualityAssessed: false as const, sourcePlanToCd119ExactBlockConcordanceAssessed: false as const,
      identityApproved: false as const, compatibilityApproved: false as const, selectionStatus: identity.selectionStatus,
      evaluatorUse: "excluded_pending_identity_historical_geography_disposition_classification_and_publication_review" as const,
      evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null }, scoreEligible: false as const,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:maine-primary-geography-row:v1\0", unsigned) };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.geographyObservationId), Buffer.from(right.geographyObservationId)));
  const me02 = rows.find((row) => row.geographyObservationId === "me:geography:2026:02") ?? fail("ME02_MISSING");
  if (rows.length !== 6 || rows.filter((row) => row.compatibilityCandidate).length !== 6 || rows.filter((row) => row.cycleYear === 2022 && row.historicalGeoid !== null).length !== 2 || rows.filter((row) => row.cycleYear === 2024 && row.historicalGeoid !== null).length !== 2 || rows.filter((row) => row.cycleYear === 2026 && row.historicalGeoid === null && row.stateLawPlanContinuitySupport && row.noCd120CensusGeoidInferred).length !== 2 || rows.some((row) => row.identityApproved || row.compatibilityApproved || row.scoreEligible || row.cd120CensusGeometryRetained) || me02.identityStatus !== "current_incumbent_not_observed_in_source_candidate_set" || me02.sourceCandidateName !== null || me02.sourceWinnerStatus !== "explicit_rcv_summary_winner" || me02.winnerSourceCandidateName !== "Dunlap, Matthew G." || me02.rcvFirstChoiceNamedCandidateDelta !== 81) fail("ROW_CLOSURE");
  const unsigned = {
    schema: MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_V1, version: 1 as const, generatedAt: "2026-08-07T11:00:00.000Z" as const, sourceCutoff: "2026-08-07" as const,
    reviewerOnly: true as const, publicationEligible: false as const, defaultUse: "exclude_from_evaluator_until_identity_historical_geography_disposition_classification_and_publication_review" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    parents: {
      proposal: { sourceLockId: PARENTS[0], fileSha256: INPUTS.proposalFile, packageSha256: parent.proposal.packageSha256 },
      resultsReceipt: { sourceLockId: PARENTS[1], fileSha256: INPUTS.resultsFile, packageSha256: parent.results.packageSha256, contestSetSha256: parent.results.summary.contestSetSha256, targetObservationSetSha256: parent.results.summary.targetObservationSetSha256 },
      identityCandidate: { sourceLockId: PARENTS[2], fileSha256: INPUTS.identityFile, packageSha256: parent.identity.packageSha256, observationSetSha256: parent.identity.observationSetSha256 },
      geographyAuthorityReceipt: { sourceLockId: PARENTS[3], fileSha256: INPUTS.authorityFile, packageSha256: parent.authority.packageSha256, cycleDispositionRowSetSha256: parent.authority.cycleDispositionRowSetSha256 },
    },
    methodology: { joinKey: "cycle_year_and_source_district_code_with_exact_parent_row_hashes" as const, targetGeoidRule: "maine_state_fips_23_plus_two_digit_district_code_for_cd119_inventory_key" as const, historicalTreatment: "2022_cd118_assignment_identity_2024_same_cd119_session_2026_state_law_continuity_without_cd120_census_geometry_or_geoid" as const, rawGeometryEqualityAssessed: false as const, sourcePlanToCd119ExactBlockConcordanceAssessed: false as const, cd120CensusGeometryAssessed: false as const, automaticDecisionClosure: false as const, evaluatorNumericValues: 0 as const },
    rows, rowSetSha256: digest("dsa-seats:maine-primary-geography-row-set:v1\0", rows),
    summary: { identityObservations: 6 as const, geographyAuthorityObservations: 6 as const, joinedRows: 6 as const, cd118Cd119Candidates: 2 as const, sameCd119SessionCandidates: 2 as const, stateLawContinuingPlanCandidatesWithoutCd120Geometry: 2 as const, compatibilityCandidates: 6 as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const },
    decisionSupport: { informsDecisionId: "approve-historical-district-cd119-compatibility-v1" as const, lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" as const, status: "proposed" as const, recommendedResolution: "retain_six_maine_historical_geography_compatibility_candidates_with_2026_law_continuity_and_no_cd120_census_geometry_claim" as const, defaultAssumption: "exclude_all_rows_until_identity_historical_geography_disposition_classification_and_publication_review" as const, reviewerResolution: null, reviewer: null, reviewedAt: null },
    limitations: ["A matching Maine Census CD118/CD119 assignment inventory supports the 2022 candidate treatment but is not a raw-geometry equality or enacted-plan-to-Census-layer equality finding.", "The 2026 candidates derive only from retained state-law continuity evidence. No Census CD120 geometry, CD120 inventory, historical GEOID, candidate identity approval, winner conclusion, score, publication, or deployment is inferred.", "The explicit 2026 ME02 RCV winner and 81-vote first-choice delta remain source-result facts only; Jared Golden's source nonappearance remains nonidentity evidence."],
    unresolvedGates: ["review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_2026_state_law_plan_continuity_without_cd120_census_geometry", "review_ranked_choice_primary_disposition_and_formula", "complete_human_data_review_and_publication_approval"],
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:maine-primary-geography-candidate:v1\0", unsigned) };
}

export type MainePrimaryGeographyCompatibilityCandidate = ReturnType<typeof assemble>;
export function buildMainePrimaryGeographyCompatibilityCandidate(input: MainePrimaryGeographyCompatibilityCandidateInput): MainePrimaryGeographyCompatibilityCandidate { return assemble(input); }
export function validateMainePrimaryGeographyCompatibilityCandidate(value: MainePrimaryGeographyCompatibilityCandidate, input: MainePrimaryGeographyCompatibilityCandidateInput): MainePrimaryGeographyCompatibilityCandidate {
  const rebuilt = assemble(input);
  if (canonicalJson(value) !== canonicalJson(rebuilt) || (MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_SET_SHA256 && value.rowSetSha256 !== MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_SET_SHA256) || (MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_PACKAGE_SHA256 && value.packageSha256 !== MAINE_PRIMARY_GEOGRAPHY_COMPATIBILITY_CANDIDATE_PACKAGE_SHA256)) fail("SEMANTIC_OR_HASH_DRIFT");
  return value;
}
