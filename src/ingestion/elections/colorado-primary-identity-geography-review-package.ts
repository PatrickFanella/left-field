import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateColoradoPrimaryIdentityCandidate, type ColoradoPrimaryIdentityCandidate } from "./colorado-current-incumbent-primary-linkage-candidate";
import { validateColoradoPrimaryGeographyCandidate, type ColoradoPrimaryGeographyCandidate } from "./colorado-primary-geography-compatibility-candidate";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";

export const COLORADO_PRIMARY_JOINT_REVIEW_V1 = "colorado-primary-identity-geography-review-package-v1" as const;
export const COLORADO_PRIMARY_JOINT_RECORD_SET_SHA256 = "cfb14cc39f52673300b03128ec74655f0cd90fba1f3d3330e7aab27ff25764f4";
export const COLORADO_PRIMARY_JOINT_DECISION_SET_SHA256 = "807dc9071e43772b6cc204a81db4024fbc21c3eae04fd2f4c40eee839e34181a";
export const COLORADO_PRIMARY_JOINT_PACKAGE_SHA256 = "af02da688e774bf121c5077b16b59fbee020ceaed6fdee1f37bc8c73542b0f77";
export const COLORADO_PRIMARY_JOINT_OUTPUT_FILE_SHA256 = "f920f5b690b503f4210e6695bc4ebeac366818e565d538080d5463490351876f";
export const COLORADO_PRIMARY_JOINT_OUTPUT_BYTE_SIZE = 43_770;

const INPUTS = {
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1",
  proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  identityFile: "ece5bc2b4938fb8ef2c1d9716e7b0ce19057e7f9671fb4eaa4ec6304f4b5d04a",
  identityPackage: "6d89eb3cfeba6da05abafd4daf710fea55d282291c19ea10b83abc2a1b4e6649",
  identitySet: "2fe869fd9b90f549e47c0916eb02c4b9644584ecf4d95a4711015d570e056e9e",
  geographyFile: "1e9e6aa7a56ffe7c5004774c93986d4f8bacc27ecd26a266813221995624105f",
  geographyPackage: "22c04b207893b8715299ee9893167bb61ff413abf3b8712edbaa790d963d1af3",
  geographySet: "62e51d28abedaee49b3b9d1dfd10dff4406bd56916e223532b4b67c380a59200",
} as const;

const PARENTS = [
  "house-democratic-primary-source-selection-proposal-20260804-v1",
  "colorado-current-incumbent-primary-linkage-candidate-v1",
  "colorado-primary-geography-compatibility-candidate-v1",
] as const;

const REQUIRED_SOURCES = [
  [PARENTS[0], "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", 411_793, INPUTS.proposalFile, "review_proposal", ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"]],
  [PARENTS[1], "urn:dsa-seats:colorado-current-incumbent-primary-linkage-candidate:v1:2022-2026", "data/metadata/colorado-current-incumbent-primary-linkage-candidate-v1.json", 21_291, INPUTS.identityFile, "review_candidate", ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "colorado-house-democratic-primary-results-2022-2026-v1"]],
  [PARENTS[2], "urn:dsa-seats:colorado-primary-geography-compatibility-candidate:v1:2022-2026", "data/metadata/colorado-primary-geography-compatibility-candidate-v1.json", 22_020, INPUTS.geographyFile, "review_candidate", ["house-democratic-primary-source-selection-proposal-20260804-v1", "colorado-house-democratic-primary-results-2022-2026-v1", "colorado-current-incumbent-primary-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-08", "tiger-cd119-08"]],
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
type LockEntry = Readonly<{ id?: string; url?: string; retainedPath?: string; retainedStatus?: string; byteSize?: number; sha256?: string; kind?: string; parentIds?: readonly string[] }>;
type ReviewCategory = "identity_and_geography_candidates" | "identity_candidate_cd120_geography_pending";
const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (code: string): never => { throw new Error(`Colorado primary joint review rejected: ${code}`); };
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
  const output = entries.filter((entry) => entry.id === COLORADO_PRIMARY_JOINT_REVIEW_V1);
  if (!COLORADO_PRIMARY_JOINT_OUTPUT_FILE_SHA256) {
    if (output.length !== 0) fail("SOURCE_LOCK_MISMATCH");
  } else {
    const entry = output[0];
    if (output.length !== 1 || entry?.url !== "urn:dsa-seats:colorado-primary-identity-geography-review-package:v1:2022-2026" || entry.retainedPath !== "data/metadata/colorado-primary-identity-geography-review-package-v1.json" || entry.retainedStatus !== "retained" || entry.byteSize !== COLORADO_PRIMARY_JOINT_OUTPUT_BYTE_SIZE || entry.sha256 !== COLORADO_PRIMARY_JOINT_OUTPUT_FILE_SHA256 || entry.kind !== "review_proposal" || canonicalJson(entry.parentIds) !== canonicalJson(PARENTS)) fail("SOURCE_LOCK_MISMATCH");
  }
  return entries;
}

export function buildColoradoPrimaryJointReviewPackage(input: Input) {
  if (sha(input.proposalJson) !== INPUTS.proposalFile || sha(input.identityJson) !== INPUTS.identityFile || sha(input.geographyJson) !== INPUTS.geographyFile) fail("INPUT_HASH_MISMATCH");
  const proposal = validateHouseDemocraticPrimarySourceSelectionProposal(parse(input.proposalJson, "PROPOSAL_JSON_INVALID"));
  const identity = validateColoradoPrimaryIdentityCandidate(parse<ColoradoPrimaryIdentityCandidate>(input.identityJson, "IDENTITY_JSON_INVALID"));
  const geography = validateColoradoPrimaryGeographyCandidate(parse<ColoradoPrimaryGeographyCandidate>(input.geographyJson, "GEOGRAPHY_JSON_INVALID"));
  if (proposal.packageSha256 !== INPUTS.proposalPackage || identity.packageSha256 !== INPUTS.identityPackage || identity.observationSetSha256 !== INPUTS.identitySet || geography.packageSha256 !== INPUTS.geographyPackage || geography.rowSetSha256 !== INPUTS.geographySet || identity.review.resolution !== null || geography.review.resolution !== null || UNRESOLVED_DECISIONS.some((id) => proposal.decisions.find((decision) => decision.decisionId === id)?.resolution !== null)) fail("PARENT_INVALID");
  const sources = (validateLock(input.sourceLockJson).filter((entry) => PARENTS.includes(entry.id as typeof PARENTS[number]))).map(sourceLockContent);
  const records = geography.rows.map((geo) => {
    const matches = identity.observations.filter((row) => row.observationId === geo.identityObservationId), identityRow = matches[0];
    if (matches.length !== 1 || identityRow === undefined || geo.identityRowSha256 !== identityRow.rowSha256 || geo.identityStatus !== identityRow.identityStatus || geo.contestId !== identityRow.contestId || geo.contestSha256 !== identityRow.contestSha256 || geo.resultAuthorityStatus !== identityRow.resultAuthorityStatus || geo.certificationStatus !== identityRow.certificationStatus || geo.sourceWinnerStatus !== identityRow.sourceWinnerStatus || geo.cycleYear !== identityRow.cycleYear || geo.electionDate !== identityRow.electionDate || geo.seatCycleId !== identityRow.seatCycleId || geo.districtCode !== identityRow.districtCode) fail("PARENT_JOIN_INVALID");
    const geographyCandidate = geo.compatibilityCandidate;
    const reviewCategory: ReviewCategory = geographyCandidate ? "identity_and_geography_candidates" : "identity_candidate_cd120_geography_pending";
    const unsigned = {
      reviewRecordId: `co-primary-joint:${identityRow.cycleYear}:${identityRow.districtCode}`,
      identityObservationId: identityRow.observationId,
      geographyObservationId: geo.geographyObservationId,
      contestId: identityRow.contestId,
      contestSha256: identityRow.contestSha256,
      cycleYear: identityRow.cycleYear,
      electionDate: identityRow.electionDate,
      seatCycleId: identityRow.seatCycleId,
      districtCode: identityRow.districtCode,
      bioguideId: identityRow.rosterIdentity.bioguideId,
      officialHouseName: identityRow.rosterIdentity.officialHouseName,
      sourceCandidateName: identityRow.sourceCandidate.sourceCandidateName,
      sourceCandidateVotes: identityRow.sourceCandidate.votes,
      identityParentRowSha256: identityRow.rowSha256,
      identityStatus: identityRow.identityStatus,
      identityEvidenceClass: identityRow.evidenceClass,
      identityConfidence: identityRow.confidence,
      identityCandidate: true as const,
      identityApproved: false as const,
      geographyParentRowSha256: geo.rowSha256,
      targetCd119Geoid: geo.targetCd119Geoid,
      historicalCongressSession: geo.historicalCongressSession,
      historicalGeoid: geo.historicalGeoid,
      compatibilityDisposition: geo.compatibilityDisposition,
      geographyEvidenceClass: geo.evidenceClass,
      geographyConfidence: geo.confidence,
      geographyCandidate,
      geographyApproved: false as const,
      resultAuthorityStatus: identityRow.resultAuthorityStatus,
      certificationStatus: identityRow.certificationStatus,
      sourceWinnerStatus: identityRow.sourceWinnerStatus,
      nominationConclusion: null,
      resultConclusion: null,
      reviewCategory,
      identityDispositionPreserved: true as const,
      dispositionDecisionStatus: "unresolved" as const,
      jointApproved: false as const,
      progressiveClassificationStatus: "not_retained" as const,
      evaluatorUse: "excluded_pending_authority_identity_historical_geography_disposition_classification_and_publication_review" as const,
      scoreEligible: false as const,
      reviewerAction: geographyCandidate ? "review_identity_and_geography_independently" as const : "review_identity_while_retaining_cd120_geography_authority_pending" as const,
      rationaleCodes: geographyCandidate ? ["exact_same_district_name_candidate_pending_review", "geography_candidate_pending_review", "source_winner_not_marked_no_nomination_or_result_inference", "parent_candidates_not_approved_by_join"] : ["exact_same_district_name_candidate_pending_review", "cd120_geography_authority_not_retained", "do_not_assume_cd119_continuity_for_2026", "parent_candidates_not_approved_by_join"],
    };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:co-primary-joint-row:v1\0", unsigned) };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.reviewRecordId), Buffer.from(right.reviewRecordId)));
  if (records.length !== 12 || new Set(records.map((row) => row.reviewRecordId)).size !== 12 || new Set(records.map((row) => row.identityObservationId)).size !== 12 || new Set(records.map((row) => row.geographyObservationId)).size !== 12) fail("JOIN_CLOSURE_INVALID");
  const allIds = records.map((row) => row.reviewRecordId), geographyIds = records.filter((row) => row.geographyCandidate).map((row) => row.reviewRecordId);
  const decision = (decisionId: string, affectedComponent: string, parentDecisionId: string, evidenceRecordIds: readonly string[], recommendedDecision: string, workCompletedWhileWaiting: string) => ({
    decisionId, affectedComponent, parentDecisionId, question: `Review ${affectedComponent} independently for the scoped Colorado records.`, recommendedDecision,
    defaultReversibleAssumption: "exclude_affected_records_from_evaluator_and_publication" as const,
    alternatives: ["accept_scoped_candidate_evidence", "retain_exclusion_or_request_correction"] as const,
    consequences: ["accepted evidence remains separately gated from publication", "nonacceptance preserves current exclusion without blocking other work"] as const,
    confidence: "high" as const, evidenceRecordIds, blocksAffectedPublication: true as const, blocksOtherWork: false as const, workCompletedWhileWaiting, review,
  });
  const decisions = [
    decision("co-primary:accept-official-result-authority-v1", "official result authority", UNRESOLVED_DECISIONS[0], allIds, "accept_cycle_specific_official_result_authority_without_creating_source_winner_nomination_or_candidate_certification_claims", "All twelve target contests retain their exact cycle-specific official authority and certification boundaries."),
    decision("co-primary:accept-geography-compatibility-v1", "historical geography compatibility", UNRESOLVED_DECISIONS[2], allIds, "accept_eight_cd118_cd119_geography_candidates_and_retain_four_cd120_authority_pending_rows", "Eight 2022/2024 candidates are supported by retained official geography evidence; four 2026 rows remain unassessed pending CD120 authority."),
    decision("co-primary:accept-identity-links-v1", "candidate identity links", UNRESOLVED_DECISIONS[1], allIds, "accept_twelve_exact_same_district_name_identity_candidates_without_claiming_a_direct_identifier_bridge", "Twelve exact reporter-name observations are joined to current House identities and remain unapproved."),
    decision("co-primary:retain-primary-disposition-exclusion-v1", "primary disposition treatment", UNRESOLVED_DECISIONS[3], allIds, "retain_source_winner_unmarked_and_no_nomination_or_result_conclusion_pending_review", "No vote-rank, winner, nominee, uncontested, or other disposition inference is introduced."),
    decision("co-primary:retain-progressive-classification-exclusion-v1", "progressive classification", UNRESOLVED_DECISIONS[4], allIds, "retain_all_records_outside_progressive_classification_until_separate_evidence", "No progressive classification evidence is introduced by the identity/geography join."),
  ];
  const summary = { reviewRecords: 12 as const, identityAndGeographyCandidates: 8 as const, identityCandidateCd120GeographyPending: 4 as const, officialAuthorityRecords: 12 as const, identityCandidates: 12 as const, geographyCandidates: 8 as const, proposedDecisions: 5 as const, jointApprovedRecords: 0 as const, scoreEligibleRecords: 0 as const };
  if (geographyIds.length !== 8 || records.filter((row) => row.reviewCategory === "identity_candidate_cd120_geography_pending").length !== 4) fail("SUMMARY_INVALID");
  const unsigned = {
    schema: COLORADO_PRIMARY_JOINT_REVIEW_V1, version: 1 as const, generatedAt: "2026-08-07T00:20:00.000Z" as const, sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const, publicationEligible: false as const, defaultUse: "exclude_from_evaluator_until_independent_authority_identity_geography_disposition_classification_and_publication_review" as const, review,
    inputs: { sourceSelectionProposal: { sourceLockId: PARENTS[0], fileSha256: INPUTS.proposalFile, packageSha256: INPUTS.proposalPackage }, identity: { sourceLockId: PARENTS[1], fileSha256: INPUTS.identityFile, packageSha256: INPUTS.identityPackage, observationSetSha256: INPUTS.identitySet }, geography: { sourceLockId: PARENTS[2], fileSha256: INPUTS.geographyFile, packageSha256: INPUTS.geographyPackage, rowSetSha256: INPUTS.geographySet } },
    sources, sourceSetSha256: digest("dsa-seats:co-primary-joint-source-set:v1\0", sources),
    methodology: { joinKey: "identity_observation_id_and_parent_row_hash" as const, decisionsReviewedIndependently: true as const, jointPackageApprovesParents: false as const, automaticApprovals: 0 as const, evaluatorNumericValues: 0 as const, cd120ContinuityInferred: false as const, rawTigerGeometryEqualityAssessed: false as const, overlapAssessed: false as const, populationEquivalenceAssessed: false as const },
    summary, records, reviewRecordSetSha256: digest("dsa-seats:co-primary-joint-row-set:v1\0", records), decisions, decisionSetSha256: digest("dsa-seats:co-primary-joint-decision-set:v1\0", decisions), inheritedDecisionResolutions: { authority: null, identity: null, geography: null, disposition: null, progressiveClassification: null },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:co-primary-joint-package:v1\0", unsigned) };
}

export type ColoradoPrimaryJointReviewPackage = ReturnType<typeof buildColoradoPrimaryJointReviewPackage>;

const TOP_KEYS = ["schema", "version", "generatedAt", "sourceCutoff", "reviewerOnly", "publicationEligible", "defaultUse", "review", "inputs", "sources", "sourceSetSha256", "methodology", "summary", "records", "reviewRecordSetSha256", "decisions", "decisionSetSha256", "inheritedDecisionResolutions", "packageSha256"] as const;
const RECORD_KEYS = ["reviewRecordId", "identityObservationId", "geographyObservationId", "contestId", "contestSha256", "cycleYear", "electionDate", "seatCycleId", "districtCode", "bioguideId", "officialHouseName", "sourceCandidateName", "sourceCandidateVotes", "identityParentRowSha256", "identityStatus", "identityEvidenceClass", "identityConfidence", "identityCandidate", "identityApproved", "geographyParentRowSha256", "targetCd119Geoid", "historicalCongressSession", "historicalGeoid", "compatibilityDisposition", "geographyEvidenceClass", "geographyConfidence", "geographyCandidate", "geographyApproved", "resultAuthorityStatus", "certificationStatus", "sourceWinnerStatus", "nominationConclusion", "resultConclusion", "reviewCategory", "identityDispositionPreserved", "dispositionDecisionStatus", "jointApproved", "progressiveClassificationStatus", "evaluatorUse", "scoreEligible", "reviewerAction", "rationaleCodes", "reviewRecordSha256"] as const;

export function validateColoradoPrimaryJointReviewPackage(value: ColoradoPrimaryJointReviewPackage): ColoradoPrimaryJointReviewPackage {
  const { packageSha256, ...unsigned } = value;
  if (!exactKeys(value, TOP_KEYS) || value.schema !== COLORADO_PRIMARY_JOINT_REVIEW_V1 || value.version !== 1 || value.generatedAt !== "2026-08-07T00:20:00.000Z" || value.sourceCutoff !== "2026-08-06" || !value.reviewerOnly || value.publicationEligible || canonicalJson(value.review) !== canonicalJson(review) || canonicalJson(value.summary) !== canonicalJson({ reviewRecords: 12, identityAndGeographyCandidates: 8, identityCandidateCd120GeographyPending: 4, officialAuthorityRecords: 12, identityCandidates: 12, geographyCandidates: 8, proposedDecisions: 5, jointApprovedRecords: 0, scoreEligibleRecords: 0 }) || value.records.length !== 12 || value.decisions.length !== 5) fail("PACKAGE_INVALID");
  for (const [index, row] of value.records.entries()) {
    const rowUnsigned = structuredClone(row) as Partial<typeof row>; delete rowUnsigned.reviewRecordSha256;
    const pending = row.cycleYear === 2026;
    const authority = row.cycleYear === 2022 ? ["official_secretary_abstract", "certification_announcement_and_signed_statewide_abstract_retained"] : row.cycleYear === 2024 ? ["official_certified_biennial_abstract", "certified_publication_no_separate_signed_certificate_retained"] : ["signed_secretary_statewide_abstract", "signed_secretary_certificate_bound_to_abstract"];
    if (!exactKeys(row, RECORD_KEYS) || row.reviewRecordId !== `co-primary-joint:${row.cycleYear}:${row.districtCode}` || row.identityStatus !== "proposed_identity_link" || row.identityEvidenceClass !== "exact_name_observation" || row.identityConfidence !== "high" || !row.identityCandidate || row.identityApproved || row.geographyApproved || row.jointApproved || row.scoreEligible || !row.identityDispositionPreserved || row.dispositionDecisionStatus !== "unresolved" || row.progressiveClassificationStatus !== "not_retained" || row.sourceWinnerStatus !== "not_marked_by_source" || row.nominationConclusion !== null || row.resultConclusion !== null || row.resultAuthorityStatus !== authority[0] || row.certificationStatus !== authority[1] || row.reviewRecordSha256 !== digest("dsa-seats:co-primary-joint-row:v1\0", rowUnsigned) || (pending ? row.reviewCategory !== "identity_candidate_cd120_geography_pending" || row.historicalCongressSession !== "120" || row.historicalGeoid !== null || row.compatibilityDisposition !== "unassessed_cd120_authority_collection_pending" || row.geographyEvidenceClass !== "authority_pending" || row.geographyConfidence !== "none" || row.geographyCandidate : row.reviewCategory !== "identity_and_geography_candidates" || row.historicalGeoid !== row.targetCd119Geoid || !row.geographyCandidate || row.geographyConfidence !== "high") || (index > 0 && row.reviewRecordId <= value.records[index - 1]!.reviewRecordId)) fail("ROW_INVALID");
  }
  const ids = value.records.map((row) => row.reviewRecordId);
  if (value.decisions.some((decision) => canonicalJson(decision.review) !== canonicalJson(review)) || canonicalJson(value.decisions.map((decision) => [decision.decisionId, decision.evidenceRecordIds.length])) !== canonicalJson([["co-primary:accept-official-result-authority-v1", 12], ["co-primary:accept-geography-compatibility-v1", 12], ["co-primary:accept-identity-links-v1", 12], ["co-primary:retain-primary-disposition-exclusion-v1", 12], ["co-primary:retain-progressive-classification-exclusion-v1", 12]]) || value.decisions.some((decision) => canonicalJson(decision.evidenceRecordIds) !== canonicalJson(ids))) fail("DECISION_INVALID");
  if (value.reviewRecordSetSha256 !== digest("dsa-seats:co-primary-joint-row-set:v1\0", value.records) || (COLORADO_PRIMARY_JOINT_RECORD_SET_SHA256 && value.reviewRecordSetSha256 !== COLORADO_PRIMARY_JOINT_RECORD_SET_SHA256) || value.decisionSetSha256 !== digest("dsa-seats:co-primary-joint-decision-set:v1\0", value.decisions) || (COLORADO_PRIMARY_JOINT_DECISION_SET_SHA256 && value.decisionSetSha256 !== COLORADO_PRIMARY_JOINT_DECISION_SET_SHA256) || packageSha256 !== digest("dsa-seats:co-primary-joint-package:v1\0", unsigned) || (COLORADO_PRIMARY_JOINT_PACKAGE_SHA256 && packageSha256 !== COLORADO_PRIMARY_JOINT_PACKAGE_SHA256)) fail("PACKAGE_INVALID");
  return value;
}
