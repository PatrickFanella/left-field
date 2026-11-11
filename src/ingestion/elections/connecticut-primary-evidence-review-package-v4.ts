import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateConnecticutEventDispositionsReceipt } from "./connecticut-house-democratic-primary-event-dispositions-receipt";
import { validateConnecticutPrimaryEvidenceReviewPackageV3 } from "./connecticut-primary-evidence-review-package-v3";

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
type Input = { v3Bytes: Buffer; eventDispositionBytes: Buffer; v2Bytes: Buffer; ballotBytes: Buffer; catalogBytes: Buffer; sourceLockBytes: Buffer };

const FILES = {
  v3: "9ac5a19b42ce7e5fabfb0f307a28b52486f54c349f9d348aa0d9712e3b58f5ca",
  eventDisposition: "9b536a55c52c4db79f9e734b312be7066704c2bc24a5d82df249662546a58ff6",
} as const;
const PACKAGES = {
  v3: "3b1b56f41552005223396ff0bcd46704853fc383350d98b0b6eb039404dc349c",
  v3Records: "9404bf96bdec976cfb83c9af9c9f435595619b96282abcf6e9e971ea21fa9301",
  v3Decisions: "d258b618aa07dee7ced9319763b3db57730215c7aeafec08609aeaea6d4dfcf4",
  eventDisposition: "7dcaf4cea0d1a817ff863010bfc2c3fd45cafc1880f8ff2c3951cdf6b81cc257",
  eventRows: "5b2f083f3e693d78a7b4b232a7c677007e6c65eb9259109d59c8e45137cc3dcf",
} as const;
const OUTPUT = {
  file: "21a4ff15eb74e35661db3a576765788276914129d18ff62e1f376f64470627e3",
  bytes: 42909,
  package: "dac0b4096d60194d0868f3ae097c23589df9aff0fc11df91a9b4e5575e350ac5",
  records: "fd834c4e6ff2cc6b09776489c2e026d11f66013470dae6eb2f0e823730f522c2",
  eventEvidence: "b43d7da0c88db9387efc71e70322d59c804690d9f9548395b3d86e60d4fdbcfd",
  decisions: "e93902a5af6dbe3a553ee2d78fc13676b62fc535857f52f9d1197ce03076694a",
} as const;

const parentEntries: LockEntry[] = [
  { id: "connecticut-primary-evidence-review-package-v3", url: "urn:dsa-seats:connecticut-primary-evidence-review-package:v3:2022-2024", retainedPath: "data/metadata/connecticut-primary-evidence-review-package-v3.json", retainedStatus: "retained", byteSize: 26472, sha256: FILES.v3, kind: "review_proposal", parentIds: ["connecticut-primary-evidence-review-package-v2", "connecticut-final-primary-ballot-receipt-v1"] },
  { id: "connecticut-house-democratic-primary-event-dispositions-2022-2024-v1", url: "urn:dsa-seats:connecticut-house-democratic-primary-event-dispositions:v1:2022-2024", retainedPath: "data/metadata/connecticut-house-democratic-primary-event-dispositions-2022-2024-v1.json", retainedStatus: "retained", byteSize: 18631, sha256: FILES.eventDisposition, kind: "review_candidate", parentIds: ["ct-2022-primary-event-discovery-response", "ct-2022-primary-event-598-results-response", "ct-2024-primary-event-discovery-response", "ct-2024-primary-event-583-results-response"] },
];
const outputEntry: LockEntry = { id: "connecticut-primary-evidence-review-package-v4", url: "urn:dsa-seats:connecticut-primary-evidence-review-package:v4:2022-2024", retainedPath: "data/metadata/connecticut-primary-evidence-review-package-v4.json", retainedStatus: "retained", byteSize: OUTPUT.bytes, sha256: OUTPUT.file, kind: "review_proposal", parentIds: parentEntries.map((entry) => entry.id) };

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`CT_PRIMARY_EVIDENCE_REVIEW_V4_INVALID:${reason}`); };

function exactEntry(entries: LockEntry[], expected: LockEntry) {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
}

function checkedInputs(input: Input) {
  if (sha(input.v3Bytes) !== FILES.v3 || sha(input.eventDispositionBytes) !== FILES.eventDisposition) fail("parent_bytes");
  let lock: { version: 1; entries: LockEntry[] };
  let v3: ReturnType<typeof validateConnecticutPrimaryEvidenceReviewPackageV3>;
  let eventDisposition: ReturnType<typeof validateConnecticutEventDispositionsReceipt>;
  try {
    lock = JSON.parse(input.sourceLockBytes.toString("utf8"));
    const parsedV3 = JSON.parse(input.v3Bytes.toString("utf8"));
    v3 = validateConnecticutPrimaryEvidenceReviewPackageV3(parsedV3, { v2Bytes: input.v2Bytes, ballotBytes: input.ballotBytes, catalogBytes: input.catalogBytes, sourceLockBytes: input.sourceLockBytes });
    eventDisposition = validateConnecticutEventDispositionsReceipt(JSON.parse(input.eventDispositionBytes.toString("utf8")));
  } catch { return fail("parent_validation"); }
  if (lock.version !== 1) fail("source_lock_version");
  for (const entry of parentEntries) exactEntry(lock.entries, entry);
  exactEntry(lock.entries, outputEntry);
  if (v3.schema !== "connecticut-primary-evidence-review-package-v3" || v3.packageSha256 !== PACKAGES.v3 || v3.reviewRecordSetSha256 !== PACKAGES.v3Records || v3.decisionSetSha256 !== PACKAGES.v3Decisions || v3.review?.status !== "proposed" || v3.review?.reviewer !== null || v3.review?.reviewedAt !== null || v3.review?.resolution !== null || v3.records?.length !== 10 || v3.decisions?.length !== 3) fail("v3_package");
  if (eventDisposition.packageSha256 !== PACKAGES.eventDisposition || eventDisposition.summary.dispositionSetSha256 !== PACKAGES.eventRows) fail("event_package");
  return { v3, eventDisposition };
}

function assemble(input: Input) {
  const { v3, eventDisposition } = checkedInputs(input);
  const records = v3.records.map((parent) => {
    const eventRow = eventDisposition.rows.find((row) => row.cycleYear === parent.cycleYear && row.districtCode === parent.districtCode) ?? fail("event_row_join");
    const event = eventDisposition.events.find((row) => row.cycleYear === parent.cycleYear) ?? fail("event_join");
    if (eventRow.seatCycleId !== `ct:${parent.cycleYear}:us-house:${parent.districtCode}:democratic`) fail("event_seat_cycle_join");
    if (parent.primaryNominationStatus !== null || parent.resultStatus !== null || parent.approved !== false || parent.scoreEligible !== false) fail("parent_lifecycle");
    const row = {
      reviewRecordId: `ct-primary:evidence-review-v4:${parent.cycleYear}:${parent.districtCode}`,
      cycleYear: parent.cycleYear,
      districtCode: parent.districtCode,
      seatCycleId: parent.seatCycleId,
      parentV3ReviewRecordId: parent.reviewRecordId,
      parentV3ReviewRecordSha256: parent.reviewRecordSha256,
      inheritedEvidence: parent.inheritedEvidence,
      ballotCorpusEvidence: parent.ballotCorpusEvidence,
      eventDispositionEvidence: {
        evidenceScope: "complete_official_event_enumeration_non_dispositive" as const,
        eventDispositionSourceLockId: parentEntries[1]!.id,
        eventDispositionPackageSha256: eventDisposition.packageSha256,
        dispositionSetSha256: eventDisposition.summary.dispositionSetSha256,
        parentEventRowSha256: eventRow.rowSha256,
        eventEvidenceId: eventRow.eventEvidenceId,
        officialEventId: event.eventId,
        advertisedResultCount: event.advertisedResultCount,
        enumeratedResultCount: event.enumeratedResultCount,
        resultSetSha256: event.resultSetSha256,
        democraticHouseResultCount: event.democraticHouseResultCount,
        observedDisposition: eventRow.disposition,
        certificationStatus: eventDisposition.certificationStatus,
        nominationDisposition: null,
        selectedContestId: null,
        voteValues: null,
        dispositionConclusion: null,
        resultConclusion: null,
      },
      primaryNominationStatus: null,
      resultStatus: null,
      approved: false as const,
      evaluatorUse: "excluded_pending_event_scope_corpus_scope_statutory_and_publication_review" as const,
      evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null },
      scoreEligible: false as const,
    };
    return { ...row, reviewRecordSha256: digest("dsa-seats:ct-primary-evidence-review-row:v4\0", row) };
  });
  const expectedIds = [2022, 2024].flatMap((year) => ["01", "02", "03", "04", "05"].map((district) => `ct-primary:evidence-review-v4:${year}:${district}`));
  if (canonicalJson(records.map((row) => row.reviewRecordId)) !== canonicalJson(expectedIds) || new Set(records.map((row) => row.parentV3ReviewRecordId)).size !== 10 || new Set(records.map((row) => row.eventDispositionEvidence.parentEventRowSha256)).size !== 10) fail("record_universe");
  const recordIds = records.map((row) => row.reviewRecordId);
  const withDecisionHash = <T extends object>(decision: T) => ({ ...decision, decisionSha256: digest("dsa-seats:ct-primary-evidence-review-decision:v4\0", decision) });
  const inheritedDecisions = v3.decisions.map((decision) => withDecisionHash({ ...decision, evidenceRecordIds: recordIds }));
  const eventDecision = withDecisionHash({
    decisionId: "ct-primary-v4:accept-official-event-enumeration-scope-v1",
    topic: "official event enumeration integrity and limited scope",
    question: "Accept the complete official 2022 and 2024 August primary event enumerations as evidence that no Democratic House contest is reported in those events, without inferring a primary disposition or result?",
    recommendedDecision: "accept_as_no_reported_contest_evidence_only",
    defaultAssumption: "exclude_from_evaluator_until_independently_reviewed",
    alternatives: ["accept_as_no_reported_contest_evidence_only", "reject_and_return_to_evidence_collection"],
    consequences: "Acceptance records only the absence of a reported Democratic House contest in each enumerated event; it establishes no no-primary, no-candidate, uncontested, nominee, cancellation, winner, vote, result, or certification conclusion.",
    confidence: "high",
    blocksAffectedPublication: true,
    blocksOtherWork: false,
    evidenceRecordIds: recordIds,
    status: "proposed",
    reviewer: null,
    reviewedAt: null,
    resolution: null,
  } as const);
  const decisions = [...inheritedDecisions, eventDecision];
  const unsigned = {
    schema: "connecticut-primary-evidence-review-package-v4" as const,
    version: 4 as const,
    generatedAt: "2026-08-07T06:45:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: "exclude_from_evaluator_until_event_scope_corpus_scope_statutory_and_publication_review" as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    sources: (parentEntries).map(sourceLockContent),
    methodology: {
      eventJoinKey: "cycle_year_and_district_code" as const,
      completeOfficialEventEnumerationClaimed: true as const,
      noReportedContestObservationIsPrimaryDisposition: false as const,
      eventAbsenceConvertedToZeroVotes: false as const,
      eventAbsenceConvertedToNominationOrResult: false as const,
      townToDistrictCrosswalkPerformed: false as const,
      districtSpecificBallotCompletenessClaimed: false as const,
      automaticApprovals: 0 as const,
      evaluatorNumericValues: 0 as const,
    },
    evidenceDisposition: {
      v3Parent: "proposed_unapproved" as const,
      eventDispositionParent: "proposed_unapproved_no_reported_contest_evidence" as const,
      inheritedApprovals: 0 as const,
      automaticApprovals: 0 as const,
    },
    summary: {
      reviewRecords: 10 as const,
      cycles: 2 as const,
      completeOfficialEvents: 2 as const,
      advertisedEventResults: 39 as const,
      enumeratedEventResults: 39 as const,
      democraticHouseEventResults: 0 as const,
      eventEvidenceAttachedRecords: 10 as const,
      noReportedContestObservations: 10 as const,
      ballotEvidenceAttachedRecords: 10 as const,
      ballotIndexTownRows: 338 as const,
      linkedDemocraticBallots: 196 as const,
      noDemocraticBallotLinkRows: 142 as const,
      linkedBallotsWithHouseOfficeContest: 0 as const,
      districtSpecificBallotJoins: 0 as const,
      primaryNominationConclusions: 0 as const,
      resultConclusions: 0 as const,
      approvedRecords: 0 as const,
      scoreEligibleRecords: 0 as const,
      eventScopeDecisions: 1 as const,
      automaticApprovals: 0 as const,
    },
    records,
    decisions,
    unresolvedGates: [
      "independently_review_official_event_enumeration_scope",
      ...v3.unresolvedGates,
    ],
  };
  return {
    ...unsigned,
    reviewRecordSetSha256: digest("dsa-seats:ct-primary-evidence-review-row-set:v4\0", records.map((row) => ({ reviewRecordId: row.reviewRecordId, reviewRecordSha256: row.reviewRecordSha256 }))),
    eventEvidenceSetSha256: digest("dsa-seats:ct-primary-evidence-review-event-evidence-set:v4\0", records.map((row) => ({ reviewRecordId: row.reviewRecordId, eventDispositionEvidence: row.eventDispositionEvidence }))),
    decisionSetSha256: digest("dsa-seats:ct-primary-evidence-review-decision-set:v4\0", decisions),
    packageSha256: digest("dsa-seats:ct-primary-evidence-review-package:v4\0", unsigned),
  };
}

export type ConnecticutPrimaryEvidenceReviewPackageV4 = ReturnType<typeof assemble>;
export function buildConnecticutPrimaryEvidenceReviewPackageV4(input: Input) { return assemble(input); }
export function validateConnecticutPrimaryEvidenceReviewPackageV4(value: ConnecticutPrimaryEvidenceReviewPackageV4, input: Input) {
  if (value.packageSha256 !== OUTPUT.package || value.reviewRecordSetSha256 !== OUTPUT.records || value.eventEvidenceSetSha256 !== OUTPUT.eventEvidence || value.decisionSetSha256 !== OUTPUT.decisions) fail("immutable_output_hashes");
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
