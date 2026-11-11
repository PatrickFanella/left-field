import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateConnecticutFinalPrimaryBallotReceipt } from "./connecticut-final-primary-ballot-receipt";
import { validateConnecticutPrimaryEvidenceReviewPackageV2 } from "./connecticut-primary-evidence-review-package-v2";

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
type Input = { v2Bytes: Buffer; ballotBytes: Buffer; catalogBytes: Buffer; sourceLockBytes: Buffer };
export type ConnecticutPrimaryEvidenceReviewPackageV3 = ReturnType<typeof assemble>;

const FILES = { v2: "a507d8094dc0a69f111202e3b9fc8d352575574ef82f6654f131c4088ac69f86", ballot: "89534d72aec69f72cb71b134390d0a30c281125b75b65a2c83f79b2e2c7ab26f" } as const;
const parentEntries: LockEntry[] = [
  { id: "connecticut-primary-evidence-review-package-v2", url: "urn:dsa-seats:connecticut-primary-evidence-review-package:v2:2022-2024", retainedPath: "data/metadata/connecticut-primary-evidence-review-package-v2.json", retainedStatus: "retained", byteSize: 17107, sha256: FILES.v2, kind: "review_proposal", parentIds: ["connecticut-primary-identity-geography-review-package-v1", "connecticut-general-election-crosscheck-receipt-v1", "connecticut-nomination-statutory-authority-receipt-v1"] },
  { id: "connecticut-final-primary-ballot-receipt-v1", url: "urn:dsa-seats:connecticut-final-primary-ballot-receipt:v1:2026-08-06", retainedPath: "data/metadata/connecticut-final-primary-ballot-receipt-v1.json", retainedStatus: "retained", byteSize: 350414, sha256: FILES.ballot, kind: "evidence_receipt", parentIds: ["ct-final-primary-ballot-source-catalog-v1"] },
];
const outputEntry: LockEntry = { id: "connecticut-primary-evidence-review-package-v3", url: "urn:dsa-seats:connecticut-primary-evidence-review-package:v3:2022-2024", retainedPath: "data/metadata/connecticut-primary-evidence-review-package-v3.json", retainedStatus: "retained", byteSize: 26472, sha256: "9ac5a19b42ce7e5fabfb0f307a28b52486f54c349f9d348aa0d9712e3b58f5ca", kind: "review_proposal", parentIds: parentEntries.map((entry) => entry.id) };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`CT_PRIMARY_EVIDENCE_REVIEW_V3_INVALID:${reason}`); };

function exactEntry(entries: LockEntry[], expected: LockEntry) {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
  return matches[0]!;
}

function inputs(input: Input) {
  if (sha(input.v2Bytes) !== FILES.v2 || sha(input.ballotBytes) !== FILES.ballot) fail("parent_bytes");
  let lock: { version: 1; entries: LockEntry[] }, v2: ReturnType<typeof validateConnecticutPrimaryEvidenceReviewPackageV2>, ballot: ReturnType<typeof validateConnecticutFinalPrimaryBallotReceipt>;
  try {
    lock = JSON.parse(input.sourceLockBytes.toString("utf8"));
    v2 = validateConnecticutPrimaryEvidenceReviewPackageV2(JSON.parse(input.v2Bytes.toString("utf8")));
    ballot = validateConnecticutFinalPrimaryBallotReceipt(JSON.parse(input.ballotBytes.toString("utf8")), { catalogBytes: input.catalogBytes, sourceLock: lock });
  } catch { return fail("parent_validation"); }
  if (lock.version !== 1 || parentEntries.map((entry) => exactEntry(lock.entries, entry)).length !== 2) fail("parent_source_set");
  exactEntry(lock.entries, outputEntry);
  return { lock, v2, ballot };
}

function assemble(input: Input) {
  const { v2, ballot } = inputs(input);
  const records = v2.records.map((parent) => {
    const cycle = ballot.indexCoverage.find((row) => row.cycleYear === parent.cycleYear);
    if (!cycle) return fail("cycle_evidence");
    if (parent.primaryNominationStatus !== null || parent.resultStatus !== null || parent.statutoryTriggerFactsResolved !== 0 || parent.statutoryNominationConclusion !== null || parent.approved || parent.scoreEligible) fail("parent_record");
    const row = {
      reviewRecordId: `ct-primary:evidence-review-v3:${parent.cycleYear}:${parent.districtCode}`,
      cycleYear: parent.cycleYear,
      districtCode: parent.districtCode,
      seatCycleId: parent.seatCycleId,
      parentReviewRecordId: parent.reviewRecordId,
      parentReviewRecordSha256: parent.reviewRecordSha256,
      inheritedEvidence: {
        generalElectionAppearanceStatus: parent.generalElectionAppearanceStatus,
        electedDeclarationStatus: parent.electedDeclarationStatus,
        cancellationTiming: parent.cancellationTiming,
        statutoryTriggerFactsResolved: 0 as const,
        statutoryNominationConclusion: null,
      },
      ballotCorpusEvidence: {
        evidenceScope: "cycle_level_statewide_context_not_district_assignment" as const,
        ballotReceiptSourceLockId: "connecticut-final-primary-ballot-receipt-v1" as const,
        ballotReceiptPackageSha256: ballot.packageSha256,
        documentSetSha256: ballot.documentSetSha256,
        townRowSetSha256: ballot.townRowSetSha256,
        cycleYear: parent.cycleYear,
        indexedTownRows: cycle.townRows,
        linkedDemocraticBallots: cycle.democraticBallotLinks,
        noDemocraticBallotLinkRows: cycle.noDemocraticBallotLinkRows,
        linkedBallotsWithHouseOfficeContest: 0 as const,
        townToDistrictCoverage: "not_assessed" as const,
        districtBallotExhaustiveness: "not_assessed" as const,
        ballotNominationConclusion: null,
        ballotResultConclusion: null,
      },
      primaryNominationStatus: null,
      resultStatus: null,
      approved: false as const,
      evaluatorUse: "excluded_pending_corpus_scope_statutory_and_publication_review" as const,
      scoreEligible: false as const,
    };
    return { ...row, reviewRecordSha256: digest("dsa-seats:ct-primary-evidence-review-row:v3\0", row) };
  });
  if (records.length !== 10 || new Set(records.map((row) => row.reviewRecordId)).size !== 10) fail("record_universe");
  const recordIds = records.map((row) => row.reviewRecordId);
  const decision = (decisionId: string, topic: string, question: string, recommendedDecision: string, defaultAssumption: string, consequences: string) => ({ decisionId, topic, question, recommendedDecision, defaultAssumption, alternatives: [recommendedDecision, "reject_and_return_to_evidence_collection"] as const, consequences, confidence: "high" as const, blocksAffectedPublication: true as const, blocksOtherWork: false as const, evidenceRecordIds: recordIds, status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null });
  const decisions = [
    decision("ct-primary-v3:accept-posted-ballot-corpus-scope-v1", "posted ballot corpus integrity and limited scope", "Accept the two official indexes and 196 linked ballots as a complete record of the posted corpus represented by those indexes?", "accept_as_cycle_level_evidence_context_only", "exclude_from_evaluator_until_reviewed", "Acceptance permits reviewer use as cycle-level context but establishes no district coverage, primary disposition, or legal finality."),
    decision("ct-primary-v3:retain-primary-disposition-exclusion-v1", "primary disposition exclusion", "Should zero observed House office rows and blank Democratic index cells remain non-dispositive?", "retain_non_dispositive_exclusion", "do_not_infer_primary_disposition", "The recommended choice preserves no-primary, no-candidate, uncontested, withdrawal, death, disqualification, and cancellation as unresolved."),
    decision("ct-primary-v3:retain-statutory-nomination-exclusion-v1", "statutory and nomination exclusion", "Should statutory application remain pending direct trigger facts and human legal review?", "retain_statutory_and_nomination_exclusion", "do_not_apply_statute_or_name_nominee", "The recommended choice prevents combining ballot absence, timing, or general-election appearance into a nomination mechanism or conclusion."),
  ];
  const unsigned = {
    schema: "connecticut-primary-evidence-review-package-v3" as const,
    version: 3 as const,
    generatedAt: "2026-08-06T14:30:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_corpus_scope_statutory_and_publication_review" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    sources: (parentEntries).map(sourceLockContent),
    methodology: { joinKey: "cycle_year_only_for_ballot_context" as const, townToDistrictCrosswalkPerformed: false as const, districtSpecificBallotCompletenessClaimed: false as const, postedBallotCorpusLegalFinalityClaimed: false as const, automaticApprovals: 0 as const, evaluatorNumericValues: 0 as const },
    evidenceDisposition: { v2Parent: "proposed_unapproved" as const, ballotReceiptParent: "proposed_unapproved_cycle_level_context" as const, inheritedApprovals: 0 as const, automaticApprovals: 0 as const },
    summary: { reviewRecords: 10 as const, cycles: 2 as const, ballotIndexTownRows: 338 as const, linkedDemocraticBallots: 196 as const, noDemocraticBallotLinkRows: 142 as const, linkedBallotsWithHouseOfficeContest: 0 as const, ballotEvidenceAttachedRecords: 10 as const, districtSpecificBallotJoins: 0 as const, primaryNominationConclusions: 0 as const, resultConclusions: 0 as const, approvedRecords: 0 as const, scoreEligibleRecords: 0 as const },
    records,
    decisions,
    unresolvedGates: ["independently_review_posted_ballot_corpus_scope", "determine_whether_posted_corpus_satisfies_final_candidacy_universe_requirement", "resolve_statutory_trigger_facts_from_direct_official_evidence", "human_legal_review_of_statutory_effect", "independently_review_identity_geography_and_general_election_relationships", "complete_human_review_and_publication_approval"] as const,
  };
  return {
    ...unsigned,
    reviewRecordSetSha256: digest("dsa-seats:ct-primary-evidence-review-row-set:v3\0", records.map(({ reviewRecordId, reviewRecordSha256 }) => ({ reviewRecordId, reviewRecordSha256 }))),
    decisionSetSha256: digest("dsa-seats:ct-primary-evidence-review-decision-set:v3\0", decisions),
    packageSha256: digest("dsa-seats:ct-primary-evidence-review-package:v3\0", unsigned),
  };
}

export function buildConnecticutPrimaryEvidenceReviewPackageV3(input: Input) { return assemble(input); }
export function validateConnecticutPrimaryEvidenceReviewPackageV3(value: ConnecticutPrimaryEvidenceReviewPackageV3, input: Input) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
