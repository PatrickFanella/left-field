import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateConnecticutGeneralElectionCrosscheckReceipt } from "./connecticut-general-election-crosscheck-receipt";
import { validateConnecticutNominationStatutoryAuthorityReceipt } from "./connecticut-nomination-statutory-authority-receipt";
import { validateConnecticutPrimaryJointReviewPackage } from "./connecticut-primary-identity-geography-review-package";

type Input = { jointBytes: Buffer; generalBytes: Buffer; statutoryBytes: Buffer; sourceLockBytes: Buffer };
type RecordRow = {
  reviewRecordId: string; cycleYear: 2022 | 2024; districtCode: string; seatCycleId: string;
  reviewCategory: "identity_geography_general_crosscheck_and_statutory_authority_pending_human_review";
  identityGeographyReviewRecordId: string; identityGeographyReviewRecordSha256: string;
  generalElectionObservationId: string; generalElectionObservationSha256: string;
  generalElectionAppearanceStatus: "party_labeled_vote_column_present";
  electedDeclarationStatus: "not_present_in_retained_instrument" | "declared_elected_in_exact_scope_canvass";
  statutoryCycleRowSha256: string; statutoryTriggerFactsResolved: 0;
  cancellationTiming: "prior_to_opening_of_polls" | "before_commencement_of_early_voting";
  statutoryNominationConclusion: null; primaryNominationStatus: null; resultStatus: null;
  approved: false; evaluatorUse: "excluded_pending_independent_evidence_and_publication_review"; scoreEligible: false; reviewRecordSha256: string;
};
export type ConnecticutPrimaryEvidenceReviewPackageV2 = ReturnType<typeof buildConnecticutPrimaryEvidenceReviewPackageV2>;

const FILES = { joint: "3865508fcce8b0712854f10d8831ab8608499ba692e48f0575d36b0eb2d15d1f", general: "70e40dbad3ec17a4d7e8998e37c98033768450c8722f70e16ca3c1754ca6d3e1", statutory: "6c8ea07744001b26f2597b6c00b10e3d05e3329e459726b7beb4bf159575d089" } as const;
const sourceIds = ["connecticut-primary-identity-geography-review-package-v1", "connecticut-general-election-crosscheck-receipt-v1", "connecticut-nomination-statutory-authority-receipt-v1"] as const;
const SOURCE_SET_SHA256 = "446a9b011b4884805309c3721f3a4a6da469a8d0720014149601d27d42709be6";
const RECORD_SET_SHA256 = "765cc095a9847913fc7003487a89071d3d5425e1c53c839c65aaf86b8fbe765a";
const PACKAGE_SHA256 = "44cd85918cd7ccdc9e174ce11b37dfbb72ca28a150e35b61360a57c4298d9c73";
const outputLockEntry = { id: "connecticut-primary-evidence-review-package-v2", url: "urn:dsa-seats:connecticut-primary-evidence-review-package:v2:2022-2024", retainedPath: "data/metadata/connecticut-primary-evidence-review-package-v2.json", retainedStatus: "retained", byteSize: 17107, sha256: "a507d8094dc0a69f111202e3b9fc8d352575574ef82f6654f131c4088ac69f86", kind: "review_proposal", parentIds: [...sourceIds] } as const;
const review = { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null };
const summary = { reviewRecords: 10 as const, generalElectionAppearances: 10 as const, exactScopeElectedDeclarations: 5 as const, statutoryTriggerFactsResolved: 0 as const, primaryNominationConclusions: 0 as const, resultConclusions: 0 as const, approvedRecords: 0 as const, scoreEligibleRecords: 0 as const };
const evidenceDisposition = { identityGeographyParent: "proposed_unapproved" as const, generalElectionCrosscheckParent: "proposed_unapproved" as const, statutoryAuthorityParent: "proposed_unapproved_with_null_triggers" as const, inheritedApprovals: 0 as const, automaticApprovals: 0 as const };
const unresolvedGates = ["retain_complete_final_democratic_primary_ballot_or_candidacy_universe", "resolve_statutory_trigger_facts_from_direct_official_evidence", "independently_review_identity_and_geography_relationships", "independently_review_general_election_crosscheck", "complete_human_review_and_publication_approval"] as const;
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (): never => { throw new Error("CT_PRIMARY_EVIDENCE_REVIEW_V2_INVALID"); };
const exactKeys = (value: object, expected: readonly string[]) => canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());
const TOP_KEYS = ["defaultUse", "evidenceDisposition", "generatedAt", "packageSha256", "publicationEligible", "records", "review", "reviewRecordSetSha256", "reviewerOnly", "schema", "sourceCutoff", "sources", "summary", "unresolvedGates", "version"] as const;
const ROW_KEYS = ["approved", "cancellationTiming", "cycleYear", "districtCode", "electedDeclarationStatus", "evaluatorUse", "generalElectionAppearanceStatus", "generalElectionObservationId", "generalElectionObservationSha256", "identityGeographyReviewRecordId", "identityGeographyReviewRecordSha256", "primaryNominationStatus", "resultStatus", "reviewCategory", "reviewRecordId", "reviewRecordSha256", "scoreEligible", "seatCycleId", "statutoryCycleRowSha256", "statutoryNominationConclusion", "statutoryTriggerFactsResolved"] as const;

export function buildConnecticutPrimaryEvidenceReviewPackageV2(input: Input) {
  if (sha(input.jointBytes) !== FILES.joint || sha(input.generalBytes) !== FILES.general || sha(input.statutoryBytes) !== FILES.statutory) fail();
  const { joint, general, statutory, lock } = (() => { try { return { joint: validateConnecticutPrimaryJointReviewPackage(JSON.parse(input.jointBytes.toString("utf8"))), general: validateConnecticutGeneralElectionCrosscheckReceipt(JSON.parse(input.generalBytes.toString("utf8"))), statutory: validateConnecticutNominationStatutoryAuthorityReceipt(JSON.parse(input.statutoryBytes.toString("utf8"))), lock: JSON.parse(input.sourceLockBytes.toString("utf8")) as { entries?: Array<{ id: string }> } }; } catch { return fail(); } })();
  const sources = sourceIds.map((id) => { const matches = lock.entries?.filter((entry: { id: string }) => entry.id === id) ?? []; if (matches.length !== 1) fail(); return sourceLockContent(matches[0]); });
  const outputMatches = lock.entries?.filter((entry: { id: string }) => entry.id === outputLockEntry.id) ?? [];
  if (digest("dsa-seats:ct-primary-evidence-review-source-set:v2\0", sources) !== SOURCE_SET_SHA256 || outputMatches.length !== 1 || canonicalJson(sourceLockContent(outputMatches[0])) !== canonicalJson(sourceLockContent(outputLockEntry))) fail();
  const records: RecordRow[] = joint.records.map((jointRow, index) => {
    const generalRow = general.rows[index], statutoryRow = statutory.cycles.find((row) => row.cycleYear === jointRow.cycleYear);
    if (!generalRow || !statutoryRow) fail();
    const authority = statutoryRow!;
    if (generalRow.cycleYear !== jointRow.cycleYear || generalRow.districtCode !== jointRow.districtCode || jointRow.nominationStatus !== null || jointRow.resultStatus !== null || jointRow.jointApproved || jointRow.scoreEligible || generalRow.primaryNominationStatus !== null || generalRow.approved || generalRow.scoreEligible || Object.values(authority.triggerFacts).some((fact) => fact !== null) || authority.nominationConclusion !== null || authority.primaryCancellationStatus !== null || authority.approved || authority.scoreEligible) fail();
    const unsigned = { reviewRecordId: `ct-primary:evidence-review-v2:${jointRow.cycleYear}:${jointRow.districtCode}`, cycleYear: jointRow.cycleYear, districtCode: jointRow.districtCode, seatCycleId: jointRow.seatCycleId, reviewCategory: "identity_geography_general_crosscheck_and_statutory_authority_pending_human_review" as const, identityGeographyReviewRecordId: jointRow.reviewRecordId, identityGeographyReviewRecordSha256: jointRow.reviewRecordSha256, generalElectionObservationId: generalRow.observationId, generalElectionObservationSha256: generalRow.rowSha256, generalElectionAppearanceStatus: generalRow.generalElectionAppearanceStatus, electedDeclarationStatus: generalRow.electedDeclarationStatus, statutoryCycleRowSha256: authority.rowSha256, statutoryTriggerFactsResolved: 0 as const, cancellationTiming: authority.cancellationTiming, statutoryNominationConclusion: null, primaryNominationStatus: null, resultStatus: null, approved: false as const, evaluatorUse: "excluded_pending_independent_evidence_and_publication_review" as const, scoreEligible: false as const };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:ct-primary-evidence-review-row:v2\0", unsigned) };
  });
  if (records.length !== 10 || new Set(records.map((row) => row.reviewRecordId)).size !== 10) fail();
  const unsigned = { schema: "connecticut-primary-evidence-review-package-v2" as const, version: 2 as const, generatedAt: "2026-08-06T13:30:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, defaultUse: "exclude_from_evaluator_until_independent_evidence_and_publication_review" as const, review, sources, evidenceDisposition, summary, records, reviewRecordSetSha256: digest("dsa-seats:ct-primary-evidence-review-row-set:v2\0", records), unresolvedGates };
  return { ...unsigned, packageSha256: digest("dsa-seats:ct-primary-evidence-review-package:v2\0", unsigned) };
}

export function validateConnecticutPrimaryEvidenceReviewPackageV2(value: ConnecticutPrimaryEvidenceReviewPackageV2) {
  const { packageSha256, ...unsigned } = value;
  const invalidRow = value.records.length !== 10 || value.records.some((row, index) => { const unsignedRow: Partial<RecordRow> = { ...row }; delete unsignedRow.reviewRecordSha256; const cycle = index < 5 ? 2022 : 2024, district = String(index % 5 + 1).padStart(2, "0"); return !exactKeys(row, ROW_KEYS) || row.reviewRecordId !== `ct-primary:evidence-review-v2:${cycle}:${district}` || row.cycleYear !== cycle || row.districtCode !== district || row.seatCycleId !== `seat_house_ct_${district}_current` || row.reviewCategory !== "identity_geography_general_crosscheck_and_statutory_authority_pending_human_review" || row.identityGeographyReviewRecordId !== `ct-primary:joint:${cycle}:${district}` || row.generalElectionObservationId !== `ct-general-crosscheck:${cycle}:${district}` || row.generalElectionAppearanceStatus !== "party_labeled_vote_column_present" || row.electedDeclarationStatus !== (cycle === 2022 ? "not_present_in_retained_instrument" : "declared_elected_in_exact_scope_canvass") || row.statutoryTriggerFactsResolved !== 0 || row.cancellationTiming !== (cycle === 2022 ? "prior_to_opening_of_polls" : "before_commencement_of_early_voting") || row.statutoryNominationConclusion !== null || row.primaryNominationStatus !== null || row.resultStatus !== null || row.approved !== false || row.evaluatorUse !== "excluded_pending_independent_evidence_and_publication_review" || row.scoreEligible !== false || row.reviewRecordSha256 !== digest("dsa-seats:ct-primary-evidence-review-row:v2\0", unsignedRow); });
  if (!exactKeys(value, TOP_KEYS) || value.schema !== "connecticut-primary-evidence-review-package-v2" || value.version !== 2 || value.generatedAt !== "2026-08-06T13:30:00.000Z" || value.sourceCutoff !== "2026-08-06" || value.reviewerOnly !== true || value.publicationEligible !== false || value.defaultUse !== "exclude_from_evaluator_until_independent_evidence_and_publication_review" || canonicalJson(value.review) !== canonicalJson(review) || canonicalJson(value.evidenceDisposition) !== canonicalJson(evidenceDisposition) || canonicalJson(value.summary) !== canonicalJson(summary) || canonicalJson(value.unresolvedGates) !== canonicalJson(unresolvedGates) || digest("dsa-seats:ct-primary-evidence-review-source-set:v2\0", value.sources) !== SOURCE_SET_SHA256 || value.reviewRecordSetSha256 !== RECORD_SET_SHA256 || value.reviewRecordSetSha256 !== digest("dsa-seats:ct-primary-evidence-review-row-set:v2\0", value.records) || packageSha256 !== PACKAGE_SHA256 || packageSha256 !== digest("dsa-seats:ct-primary-evidence-review-package:v2\0", unsigned) || invalidRow) fail();
  return value;
}
