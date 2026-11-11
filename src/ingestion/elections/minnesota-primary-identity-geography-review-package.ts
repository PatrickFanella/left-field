import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import { validateMinnesotaPrimaryIdentityCandidate, type MinnesotaPrimaryIdentityCandidate } from "./minnesota-current-incumbent-primary-linkage-candidate";
import { validateMinnesotaPrimaryGeographyCandidate, type MinnesotaPrimaryGeographyCandidate } from "./minnesota-primary-geography-compatibility-candidate";

export const MINNESOTA_PRIMARY_JOINT_REVIEW_V1 = "minnesota-primary-identity-geography-review-package-v1" as const;
export const MINNESOTA_PRIMARY_JOINT_SOURCE_SET_SHA256 = "861a13ea5139b92382c4961e6819ffbc82cbc266b05cee979cfd8249f23e87fa" as const;
export const MINNESOTA_PRIMARY_JOINT_PARENT_PROJECTION_SHA256 = "0184b77ee43e61213308094d5d850e528b299eb324a9eb5fc9a01ec728794165" as const;
export const MINNESOTA_PRIMARY_JOINT_RECORD_SET_SHA256 = "a5a3915e67bd909facf11846af3247d020177891ca6da3aabe0f3ab2be001316" as const;
export const MINNESOTA_PRIMARY_JOINT_DECISION_SET_SHA256 = "fd6e6f5957c4d02c423d9b914e0ebc26f050038827a7f15a090df44994df6b9b" as const;
export const MINNESOTA_PRIMARY_JOINT_PACKAGE_SHA256 = "7fcec72547e0b063bdd53937d7038551f705989d7a043ee342201ba592f4cc75" as const;
export const MINNESOTA_PRIMARY_JOINT_OUTPUT_FILE_SHA256 = "560a9bc4bae7ddb35eab1ba1f66e8da3811493dedcb2f8b175ad6fac8dd76880" as const;
export const MINNESOTA_PRIMARY_JOINT_OUTPUT_BYTE_SIZE = 33_919 as const;
const INPUTS = {
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1",
  proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  identityFile: "fd010c1e43a61f6973154e0bf1ffb0e7259c089cea56700158387888a54dd234",
  identityPackage: "77baabd12581f1880c811dc75ab77a79481ca9a5388a920f5ca30cc85b0c3a61",
  identitySet: "77f4eb4b2c3ff31d9e861c25a4e9eb66560f90860246f53c48a0afda23ac747c",
  geographyFile: "5fa89511fb4453ff7dcfcc3684ed7af6cbb51ce12d360a98d7a54f50caedab23",
  geographyPackage: "81b0592927b90c9903ada7d65111134e00aa8e507395125e01c6f6131ceabb81",
  geographySet: "3404b652381d8316340e18f69dbdf06538da6fa46977e35bee225e49d0cbab0b",
} as const;
const PARENTS = [
  "house-democratic-primary-source-selection-proposal-20260804-v1",
  "minnesota-current-incumbent-primary-linkage-candidate-v1",
  "minnesota-primary-geography-compatibility-candidate-v1",
] as const;
const EXPECTED_SOURCES = [
  [PARENTS[0], "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", 411_793, INPUTS.proposalFile, "review_proposal", ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"]],
  [PARENTS[1], "urn:dsa-seats:minnesota-current-incumbent-primary-linkage-candidate:v1:2022-2024", "data/metadata/minnesota-current-incumbent-primary-linkage-candidate-v1.json", 15_485, INPUTS.identityFile, "review_candidate", ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "minnesota-house-democratic-primary-results-2022-2026-v1"]],
  [PARENTS[2], "urn:dsa-seats:minnesota-primary-geography-compatibility-candidate:v1:2022-2024", "data/metadata/minnesota-primary-geography-compatibility-candidate-v1.json", 16_047, INPUTS.geographyFile, "review_candidate", ["house-democratic-primary-source-selection-proposal-20260804-v1", "minnesota-house-democratic-primary-results-2022-2026-v1", "minnesota-current-incumbent-primary-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-27", "tiger-cd119-27"]],
] as const;
const UNRESOLVED_DECISIONS = [
  "collect-official-state-primary-results-and-certification-v1",
  "approve-historic-primary-candidate-identity-resolution-v1",
  "approve-historical-district-cd119-compatibility-v1",
  "decide-nonstandard-primary-disposition-treatment-v1",
  "approve-progressive-candidate-classification-method-v1",
] as const;
const review = { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null };
type Input = Readonly<{ proposalJson: string; identityJson: string; geographyJson: string; sourceLockJson: string }>;
type ReviewCategory = "identity_and_geography_candidates" | "geography_candidate_identity_source_unobserved";
type Decision = Readonly<{ decisionId: string; affectedComponent: string; parentDecisionId: string; question: string; recommendedDecision: string; defaultReversibleAssumption: "exclude_affected_records_from_evaluator_and_publication"; alternatives: readonly [string, string]; consequences: readonly [string, string]; confidence: "high"; evidenceRecordIds: readonly string[]; blocksAffectedPublication: true; blocksOtherWork: false; workCompletedWhileWaiting: string; review: typeof review }>;
const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (code: string): never => { throw new Error(`Minnesota primary joint review rejected: ${code}`); };
const parse = <T>(value: string, code: string): T => { try { return JSON.parse(value) as T; } catch { return fail(code); } };
const order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));

export function buildMinnesotaPrimaryJointReviewPackage(input: Input) {
  if (sha(input.proposalJson) !== INPUTS.proposalFile || sha(input.identityJson) !== INPUTS.identityFile || sha(input.geographyJson) !== INPUTS.geographyFile) fail("INPUT_HASH_MISMATCH");
  const proposal = validateHouseDemocraticPrimarySourceSelectionProposal(parse(input.proposalJson, "PROPOSAL_JSON_INVALID"));
  const identity = validateMinnesotaPrimaryIdentityCandidate(parse<MinnesotaPrimaryIdentityCandidate>(input.identityJson, "IDENTITY_JSON_INVALID"));
  const geography = validateMinnesotaPrimaryGeographyCandidate(parse<MinnesotaPrimaryGeographyCandidate>(input.geographyJson, "GEOGRAPHY_JSON_INVALID"));
  if (proposal.packageSha256 !== INPUTS.proposalPackage || identity.packageSha256 !== INPUTS.identityPackage || identity.observationSetSha256 !== INPUTS.identitySet || geography.packageSha256 !== INPUTS.geographyPackage || geography.rowSetSha256 !== INPUTS.geographySet || UNRESOLVED_DECISIONS.some((decisionId) => proposal.decisions.find((decision) => decision.decisionId === decisionId)?.resolution !== null)) fail("PARENT_INVALID");
  const lock = parse<{ entries?: Array<{ id?: string; url?: string; retainedPath?: string; retainedStatus?: string; byteSize?: number; sha256?: string; kind?: string; parentIds?: string[] }> }>(input.sourceLockJson, "SOURCE_LOCK_JSON_INVALID");
  if (!Array.isArray(lock.entries)) fail("SOURCE_LOCK_MISMATCH");
  const lockEntries = lock.entries ?? fail("SOURCE_LOCK_MISMATCH");
  const sources = (EXPECTED_SOURCES.map(([id, url, path, bytes, hash, kind, parents]) => {
    const matches = lockEntries.filter((entry) => entry.id === id), entry = matches[0];
    if (matches.length !== 1 || entry?.url !== url || entry.retainedPath !== path || entry.retainedStatus !== "retained" || entry.byteSize !== bytes || entry.sha256 !== hash || entry.kind !== kind || canonicalJson(entry.parentIds) !== canonicalJson(parents)) fail("SOURCE_LOCK_MISMATCH");
    return entry;
  })).map(sourceLockContent);
  const outputMatches = lockEntries.filter((entry) => entry.id === MINNESOTA_PRIMARY_JOINT_REVIEW_V1), output = outputMatches[0];
  if (outputMatches.length !== 1 || output?.url !== "urn:dsa-seats:minnesota-primary-identity-geography-review-package:v1:2022-2024" || output.retainedPath !== "data/metadata/minnesota-primary-identity-geography-review-package-v1.json" || output.retainedStatus !== "retained" || output.byteSize !== MINNESOTA_PRIMARY_JOINT_OUTPUT_BYTE_SIZE || output.sha256 !== MINNESOTA_PRIMARY_JOINT_OUTPUT_FILE_SHA256 || output.kind !== "review_proposal" || canonicalJson(output.parentIds) !== canonicalJson(PARENTS)) fail("SOURCE_LOCK_MISMATCH");
  const records = geography.rows.map((geo) => {
    const matches = identity.observations.filter((row) => row.observationId === geo.identityObservationId), identityRow = matches[0];
    if (matches.length !== 1 || identityRow === undefined || geo.identityRowSha256 !== identityRow.rowSha256 || geo.identityStatus !== identityRow.identityStatus || geo.contestId !== identityRow.sourceContestId || geo.contestSha256 !== identityRow.sourceContestSha256 || geo.resultAuthorityStatus !== identityRow.resultAuthorityStatus || geo.certificationStatus !== identityRow.certificationStatus || geo.cycleYear !== identityRow.cycleYear || geo.districtCode !== identityRow.districtCode || geo.seatCycleId !== identityRow.seatCycleId) fail("PARENT_JOIN_INVALID");
    const identityCandidate = identityRow.identityStatus === "proposed_identity_link";
    const reviewCategory: ReviewCategory = identityCandidate ? "identity_and_geography_candidates" : "geography_candidate_identity_source_unobserved";
    const unsigned = {
      reviewRecordId: `mn-primary-joint:${identityRow.cycleYear}:${identityRow.districtCode}`,
      identityObservationId: identityRow.observationId,
      geographyObservationId: geo.observationId,
      contestId: identityRow.sourceContestId,
      contestSha256: identityRow.sourceContestSha256,
      cycleYear: identityRow.cycleYear,
      seatCycleId: identityRow.seatCycleId,
      districtCode: identityRow.districtCode,
      identity: {
        parentRowSha256: identityRow.rowSha256,
        status: identityCandidate ? "candidate" as const : "source_unobserved" as const,
        identityStatus: identityRow.identityStatus,
        bioguideId: identityRow.rosterIdentity.bioguideId,
        officialHouseName: identityRow.rosterIdentity.officialHouseName,
        sourceCandidateId: identityRow.sourceCandidate?.sourceCandidateId ?? null,
        sourceCandidateName: identityRow.sourceCandidate?.sourceCandidateName ?? null,
        sourceCandidateVotes: identityRow.sourceCandidate?.votes ?? null,
        sourceCandidatePercentage: identityRow.sourceCandidate?.sourcePercentage ?? null,
        evidenceClass: identityRow.evidenceClass,
        confidence: identityRow.confidence,
        candidate: identityCandidate,
        approved: false as const,
      },
      geography: {
        parentRowSha256: geo.rowSha256,
        status: "candidate" as const,
        targetCd119Geoid: geo.targetCd119Geoid,
        historicalCongressSession: geo.historicalCongressSession,
        historicalGeoid: geo.historicalGeoid,
        compatibilityDisposition: geo.compatibilityDisposition,
        evidenceClass: geo.evidenceClass,
        confidence: geo.confidence,
        candidate: true as const,
        approved: false as const,
      },
      sourcePartyCode: identityRow.sourcePartyCode,
      resultAuthorityStatus: geo.resultAuthorityStatus,
      certificationStatus: geo.certificationStatus,
      sourceWinnerStatus: geo.sourceWinnerStatus,
      nominationConclusion: null,
      resultConclusion: null,
      reviewCategory,
      identityDispositionPreserved: true as const,
      dispositionDecisionStatus: "unresolved" as const,
      jointApproved: false as const,
      progressiveClassificationStatus: "not_retained" as const,
      evaluatorUse: "excluded_pending_authority_identity_historical_geography_disposition_classification_and_publication_review" as const,
      scoreEligible: false as const,
      reviewerAction: identityCandidate ? "review_identity_and_geography_independently" as const : "review_geography_while_preserving_source_unobserved_identity" as const,
      rationaleCodes: identityCandidate ? ["exact_same_district_name_candidate_pending_review", "raw_party_dfl_preserved", "portal_result_not_candidate_certification_or_winner", "parent_candidates_not_approved_by_join"] : ["source_absent_identity_preserved", "geography_candidate_does_not_create_contest_or_identity", "no_zero_no_primary_uncontested_nomination_or_winner_inference", "parent_candidates_not_approved_by_join"],
    };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:mn-primary-joint-row:v1\0", unsigned) };
  }).sort((left, right) => order(left.reviewRecordId, right.reviewRecordId));
  if (records.length !== 8 || new Set(records.map((row) => row.reviewRecordId)).size !== 8 || new Set(records.map((row) => row.identityObservationId)).size !== 8 || new Set(records.map((row) => row.geographyObservationId)).size !== 8) fail("JOIN_CLOSURE_INVALID");
  const allIds = records.map((row) => row.reviewRecordId), reportedIds = records.filter((row) => row.resultAuthorityStatus !== null).map((row) => row.reviewRecordId), identityIds = records.filter((row) => row.identity.candidate).map((row) => row.reviewRecordId);
  const decision = (decisionId: string, component: string, parentDecisionId: string, evidenceRecordIds: string[], recommendedDecision: string, work: string): Decision => ({ decisionId, affectedComponent: component, parentDecisionId, question: `Review ${component} independently for the scoped Minnesota records.`, recommendedDecision, defaultReversibleAssumption: "exclude_affected_records_from_evaluator_and_publication", alternatives: ["accept_scoped_candidate_evidence", "retain_exclusion_or_request_correction"], consequences: ["accepted evidence remains separately gated from publication", "nonacceptance preserves current exclusion without blocking other work"], confidence: "high", evidenceRecordIds, blocksAffectedPublication: true, blocksOtherWork: false, workCompletedWhileWaiting: work, review });
  const decisions = [
    decision("mn-primary:accept-official-portal-result-authority-v1", "official portal-reported result authority", UNRESOLVED_DECISIONS[0], reportedIds, "accept_official_portal_reported_result_authority_without_claiming_candidate_certification", "Five reported contests retain portal observations and event-level canvass metadata; exact report bytes, candidate certification, winner, and nominee claims remain absent."),
    decision("mn-primary:accept-geography-compatibility-v1", "historical geography compatibility", UNRESOLVED_DECISIONS[2], allIds, "accept_eight_geography_candidates_without_geometry_equality_overlap_or_population_equivalence_claim", "Complete CD118/CD119 district inventories and Census no-redraw authority are retained."),
    decision("mn-primary:accept-identity-links-v1", "candidate identity links", UNRESOLVED_DECISIONS[1], identityIds, "accept_five_exact_same_district_name_links_and_preserve_three_source_unobserved_rows", "Five exact same-district reporter-name observations are retained without a direct person identifier bridge; three source-absent rows have no candidate record."),
    decision("mn-primary:retain-primary-disposition-exclusion-v1", "primary disposition treatment", UNRESOLVED_DECISIONS[3], allIds, "retain_reported_and_source_unobserved_distinctions_pending_review", "Source absence remains nonnumeric and does not imply no primary, zero votes, nomination, winner, or uncontested status."),
    decision("mn-primary:retain-progressive-classification-exclusion-v1", "progressive classification", UNRESOLVED_DECISIONS[4], allIds, "retain_all_records_outside_progressive_classification_until_separate_evidence", "No progressive classification evidence is introduced by the identity/geography join."),
  ];
  const summary = { reviewRecords: 8 as const, identityAndGeographyCandidates: 5 as const, geographyCandidateIdentitySourceUnobserved: 3 as const, identityCandidates: 5 as const, geographyCandidates: 8 as const, officialPortalReportedAuthorityRecords: 5 as const, reportedContestRecords: 5 as const, sourceUnobservedRecords: 3 as const, proposedDecisions: 5 as const, jointApprovedRecords: 0 as const, scoreEligibleRecords: 0 as const };
  const parentProjection = records.map((row) => ({ reviewRecordId: row.reviewRecordId, identityObservationId: row.identityObservationId, identityParentRowSha256: row.identity.parentRowSha256, geographyObservationId: row.geographyObservationId, geographyParentRowSha256: row.geography.parentRowSha256, contestId: row.contestId, contestSha256: row.contestSha256, identityStatus: row.identity.identityStatus, reviewCategory: row.reviewCategory, resultAuthorityStatus: row.resultAuthorityStatus, certificationStatus: row.certificationStatus, sourceWinnerStatus: row.sourceWinnerStatus, compatibilityDisposition: row.geography.compatibilityDisposition, compatibilityCandidate: row.geography.candidate }));
  const unsigned = {
    schema: MINNESOTA_PRIMARY_JOINT_REVIEW_V1, version: 1 as const, generatedAt: "2026-08-06T23:00:00.000Z" as const, sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const, publicationEligible: false as const, defaultUse: "exclude_from_evaluator_until_independent_authority_identity_geography_disposition_classification_and_publication_review" as const, review,
    inputs: { sourceSelectionProposal: { sourceLockId: PARENTS[0], fileSha256: INPUTS.proposalFile, packageSha256: INPUTS.proposalPackage }, identity: { sourceLockId: PARENTS[1], fileSha256: INPUTS.identityFile, packageSha256: INPUTS.identityPackage, observationSetSha256: INPUTS.identitySet }, geography: { sourceLockId: PARENTS[2], fileSha256: INPUTS.geographyFile, packageSha256: INPUTS.geographyPackage, rowSetSha256: INPUTS.geographySet } },
    sources, sourceSetSha256: digest("dsa-seats:mn-primary-joint-source-set:v1\0", sources),
    methodology: { joinKey: "identity_observation_id_and_parent_row_hash" as const, decisionsReviewedIndependently: true as const, jointPackageApprovesParents: false as const, automaticApprovals: 0 as const, evaluatorNumericValues: 0 as const, rawTigerGeometryEqualityAssessed: false as const, overlapAssessed: false as const, populationEquivalenceAssessed: false as const },
    summary, records, parentProjectionSha256: digest("dsa-seats:mn-primary-joint-parent-projection:v1\0", parentProjection), reviewRecordSetSha256: digest("dsa-seats:mn-primary-joint-row-set:v1\0", records), decisions, decisionSetSha256: digest("dsa-seats:mn-primary-joint-decision-set:v1\0", decisions), inheritedDecisionResolutions: { authority: null, identity: null, geography: null, disposition: null, progressiveClassification: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:mn-primary-joint-package:v1\0", unsigned) };
}

export type MinnesotaPrimaryJointReviewPackage = ReturnType<typeof buildMinnesotaPrimaryJointReviewPackage>;

const TOP_KEYS = ["schema", "version", "generatedAt", "sourceCutoff", "reviewerOnly", "publicationEligible", "defaultUse", "review", "inputs", "sources", "sourceSetSha256", "methodology", "summary", "records", "parentProjectionSha256", "reviewRecordSetSha256", "decisions", "decisionSetSha256", "inheritedDecisionResolutions", "packageSha256"] as const;
const RECORD_KEYS = ["reviewRecordId", "identityObservationId", "geographyObservationId", "contestId", "contestSha256", "cycleYear", "seatCycleId", "districtCode", "identity", "geography", "sourcePartyCode", "resultAuthorityStatus", "certificationStatus", "sourceWinnerStatus", "nominationConclusion", "resultConclusion", "reviewCategory", "identityDispositionPreserved", "dispositionDecisionStatus", "jointApproved", "progressiveClassificationStatus", "evaluatorUse", "scoreEligible", "reviewerAction", "rationaleCodes", "reviewRecordSha256"] as const;
const IDENTITY_KEYS = ["parentRowSha256", "status", "identityStatus", "bioguideId", "officialHouseName", "sourceCandidateId", "sourceCandidateName", "sourceCandidateVotes", "sourceCandidatePercentage", "evidenceClass", "confidence", "candidate", "approved"] as const;
const GEOGRAPHY_KEYS = ["parentRowSha256", "status", "targetCd119Geoid", "historicalCongressSession", "historicalGeoid", "compatibilityDisposition", "evidenceClass", "confidence", "candidate", "approved"] as const;
const EXPECTED_RECORDS = [
  ["mn-primary-joint:2022:02", false], ["mn-primary-joint:2022:03", false], ["mn-primary-joint:2022:04", true], ["mn-primary-joint:2022:05", true],
  ["mn-primary-joint:2024:02", true], ["mn-primary-joint:2024:03", false], ["mn-primary-joint:2024:04", true], ["mn-primary-joint:2024:05", true],
] as const;
const exactKeys = (value: object, expected: readonly string[]): boolean => canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());

export function validateMinnesotaPrimaryJointReviewPackage(value: MinnesotaPrimaryJointReviewPackage): MinnesotaPrimaryJointReviewPackage {
  if (!exactKeys(value, TOP_KEYS) || value.schema !== MINNESOTA_PRIMARY_JOINT_REVIEW_V1 || value.version !== 1 || value.generatedAt !== "2026-08-06T23:00:00.000Z" || value.sourceCutoff !== "2026-08-06" || !value.reviewerOnly || value.publicationEligible || canonicalJson(value.review) !== canonicalJson(review) || value.defaultUse !== "exclude_from_evaluator_until_independent_authority_identity_geography_disposition_classification_and_publication_review" || value.records.length !== 8 || value.decisions.length !== 5 || value.methodology.automaticApprovals !== 0 || value.methodology.evaluatorNumericValues !== 0 || value.methodology.rawTigerGeometryEqualityAssessed || value.methodology.overlapAssessed || value.methodology.populationEquivalenceAssessed) fail("LIFECYCLE_INVALID");
  if (canonicalJson(value.summary) !== canonicalJson({ reviewRecords: 8, identityAndGeographyCandidates: 5, geographyCandidateIdentitySourceUnobserved: 3, identityCandidates: 5, geographyCandidates: 8, officialPortalReportedAuthorityRecords: 5, reportedContestRecords: 5, sourceUnobservedRecords: 3, proposedDecisions: 5, jointApprovedRecords: 0, scoreEligibleRecords: 0 }) || canonicalJson(value.inheritedDecisionResolutions) !== canonicalJson({ authority: null, identity: null, geography: null, disposition: null, progressiveClassification: null })) fail("SUMMARY_INVALID");
  for (const [index, row] of value.records.entries()) {
    const expected = EXPECTED_RECORDS[index], candidate = expected?.[1] ?? fail("RECORD_INVALID"), expectedId = expected[0];
    const unsigned = structuredClone(row) as Partial<typeof row>; delete unsigned.reviewRecordSha256;
    if (!exactKeys(row, RECORD_KEYS) || !exactKeys(row.identity, IDENTITY_KEYS) || !exactKeys(row.geography, GEOGRAPHY_KEYS) || row.reviewRecordId !== expectedId || row.identityObservationId !== expectedId.replace("mn-primary-joint", "mn:identity") || row.geographyObservationId !== expectedId.replace("mn-primary-joint", "mn:geography") || row.reviewRecordSha256 !== digest("dsa-seats:mn-primary-joint-row:v1\0", unsigned) || row.identity.identityStatus !== (candidate ? "proposed_identity_link" : "source_absent_district_cycle_unresolved") || row.identity.status !== (candidate ? "candidate" : "source_unobserved") || row.identity.candidate !== candidate || row.identity.approved || row.geography.status !== "candidate" || !row.geography.candidate || row.geography.approved || row.reviewCategory !== (candidate ? "identity_and_geography_candidates" : "geography_candidate_identity_source_unobserved") || !row.identityDispositionPreserved || row.dispositionDecisionStatus !== "unresolved" || row.jointApproved || row.progressiveClassificationStatus !== "not_retained" || row.evaluatorUse !== "excluded_pending_authority_identity_historical_geography_disposition_classification_and_publication_review" || row.scoreEligible || row.nominationConclusion !== null || row.resultConclusion !== null) fail("RECORD_INVALID");
    if (candidate) {
      if (row.contestId === null || row.contestSha256 === null || row.identity.sourceCandidateId === null || row.identity.sourceCandidateName === null || row.identity.sourceCandidateVotes === null || row.identity.sourceCandidatePercentage === null || row.identity.evidenceClass !== "exact_name_observation" || row.identity.confidence !== "high" || row.sourcePartyCode !== "DFL" || row.resultAuthorityStatus !== "official_portal_reported_result_not_claimed_as_certified_result_bytes" || row.certificationStatus !== "event_metadata_only_exact_report_bytes_not_retained" || row.sourceWinnerStatus !== "not_marked_by_source" || row.reviewerAction !== "review_identity_and_geography_independently") fail("REPORTED_RECORD_INVALID");
    } else if (row.contestId !== null || row.contestSha256 !== null || row.identity.sourceCandidateId !== null || row.identity.sourceCandidateName !== null || row.identity.sourceCandidateVotes !== null || row.identity.sourceCandidatePercentage !== null || row.identity.evidenceClass !== null || row.identity.confidence !== null || row.sourcePartyCode !== null || row.resultAuthorityStatus !== null || row.certificationStatus !== null || row.sourceWinnerStatus !== "not_applicable_no_reported_contest" || row.reviewerAction !== "review_geography_while_preserving_source_unobserved_identity") fail("SOURCE_UNOBSERVED_RECORD_INVALID");
  }
  const ids = value.records.map((row) => row.reviewRecordId), reportedIds = value.records.filter((row) => row.resultAuthorityStatus !== null).map((row) => row.reviewRecordId), identityIds = value.records.filter((row) => row.identity.candidate).map((row) => row.reviewRecordId);
  const expectedScopes = [["mn-primary:accept-official-portal-result-authority-v1", reportedIds], ["mn-primary:accept-geography-compatibility-v1", ids], ["mn-primary:accept-identity-links-v1", identityIds], ["mn-primary:retain-primary-disposition-exclusion-v1", ids], ["mn-primary:retain-progressive-classification-exclusion-v1", ids]];
  if (value.decisions.some((decision, index) => canonicalJson(decision.review) !== canonicalJson(review) || decision.blocksAffectedPublication !== true || decision.blocksOtherWork !== false || canonicalJson([decision.decisionId, decision.evidenceRecordIds]) !== canonicalJson(expectedScopes[index]))) fail("DECISION_INVALID");
  const projection = value.records.map((row) => ({ reviewRecordId: row.reviewRecordId, identityObservationId: row.identityObservationId, identityParentRowSha256: row.identity.parentRowSha256, geographyObservationId: row.geographyObservationId, geographyParentRowSha256: row.geography.parentRowSha256, contestId: row.contestId, contestSha256: row.contestSha256, identityStatus: row.identity.identityStatus, reviewCategory: row.reviewCategory, resultAuthorityStatus: row.resultAuthorityStatus, certificationStatus: row.certificationStatus, sourceWinnerStatus: row.sourceWinnerStatus, compatibilityDisposition: row.geography.compatibilityDisposition, compatibilityCandidate: row.geography.candidate }));
  const unsigned = structuredClone(value) as Partial<MinnesotaPrimaryJointReviewPackage>; delete unsigned.packageSha256;
  if (value.sourceSetSha256 !== digest("dsa-seats:mn-primary-joint-source-set:v1\0", value.sources) || value.sourceSetSha256 !== MINNESOTA_PRIMARY_JOINT_SOURCE_SET_SHA256 || value.parentProjectionSha256 !== digest("dsa-seats:mn-primary-joint-parent-projection:v1\0", projection) || value.parentProjectionSha256 !== MINNESOTA_PRIMARY_JOINT_PARENT_PROJECTION_SHA256 || value.reviewRecordSetSha256 !== digest("dsa-seats:mn-primary-joint-row-set:v1\0", value.records) || value.reviewRecordSetSha256 !== MINNESOTA_PRIMARY_JOINT_RECORD_SET_SHA256 || value.decisionSetSha256 !== digest("dsa-seats:mn-primary-joint-decision-set:v1\0", value.decisions) || value.decisionSetSha256 !== MINNESOTA_PRIMARY_JOINT_DECISION_SET_SHA256 || value.packageSha256 !== digest("dsa-seats:mn-primary-joint-package:v1\0", unsigned) || value.packageSha256 !== MINNESOTA_PRIMARY_JOINT_PACKAGE_SHA256) fail("PACKAGE_INVALID");
  return value;
}
