import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import {
  NC_PRIMARY_CONTEST_SET_SHA256,
  NC_PRIMARY_PACKAGE_SHA256,
  validateNcPrimaryReceipt,
} from "./north-carolina-house-democratic-primary-results-receipt";

const RECEIPT_FILE_SHA256 = "a171f1940bf9445413a9b0ff88889408271779c954e00dbd0b4b52013e1f5d7b";
const DECISION_ID = "nc-2022-primary-archive-canvass-source-precedence-v1";
const SHA = z.string().regex(/^[a-f0-9]{64}$/);
const SOURCE_IDS = [
  "nc-2022-primary-official-results-archive",
  "nc-2022-primary-state-canvass-by-contest",
] as const;
const AFFECTED_CONTESTS = [
  "nc:2022:regular:us-house:03:democratic",
  "nc:2022:regular:us-house:11:democratic",
] as const;
const EXPECTED_DIFFERENCES = [
  { contestId: AFFECTED_CONTESTS[0], sourceCandidateName: "Barbara D. Gaskins", archiveVotes: 23042, canvassVotes: 23051, delta: 9 },
  { contestId: AFFECTED_CONTESTS[0], sourceCandidateName: "Joe Swartz", archiveVotes: 5492, canvassVotes: 5495, delta: 3 },
  { contestId: AFFECTED_CONTESTS[1], sourceCandidateName: "Jasmine Beach-Ferrara", archiveVotes: 32476, canvassVotes: 32478, delta: 2 },
  { contestId: AFFECTED_CONTESTS[1], sourceCandidateName: "Jay Carey", archiveVotes: 3857, canvassVotes: 3858, delta: 1 },
] as const;

const source = z.strictObject({
  sourceLockId: z.enum(SOURCE_IDS),
  url: z.string().url(),
  retainedPath: z.string().min(1),
  retainedStatus: z.literal("retained"),
  sha256: SHA,
  byteSize: z.number().int().positive(),
  kind: z.literal("source"),
  parentIds: z.array(z.never()).length(0),
});
const difference = z.strictObject({
  contestId: z.enum(AFFECTED_CONTESTS),
  sourceCandidateName: z.enum(["Barbara D. Gaskins", "Joe Swartz", "Jasmine Beach-Ferrara", "Jay Carey"]),
  archiveVotes: z.number().int().nonnegative(),
  canvassVotes: z.number().int().nonnegative(),
  delta: z.number().int().positive(),
  rowSha256: SHA,
});

export const ncPrimarySourcePrecedenceDecisionSchema = z.strictObject({
  schema: z.literal("north-carolina-primary-source-precedence-decision-v1"),
  version: z.literal(1),
  generatedAt: z.literal("2026-08-06T00:30:00.000Z"),
  sourceCutoff: z.literal("2026-08-05"),
  decisionId: z.literal(DECISION_ID),
  affectedComponent: z.literal("north_carolina_2022_democratic_us_house_primary_candidate_totals"),
  reviewerOnly: z.literal(true),
  publicationEligible: z.literal(false),
  scoreEligible: z.literal(false),
  inputs: z.strictObject({
    receiptSourceLockId: z.literal("north-carolina-house-democratic-primary-results-2022-2026-v1"),
    receiptFileSha256: z.literal(RECEIPT_FILE_SHA256),
    receiptPackageSha256: z.literal(NC_PRIMARY_PACKAGE_SHA256),
    receiptContestSetSha256: z.literal(NC_PRIMARY_CONTEST_SET_SHA256),
    sources: z.array(source).length(2),
  }),
  question: z.literal("Which retained official source should control the four conflicting 2022 North Carolina Democratic U.S. House primary candidate totals?"),
  evidence: z.strictObject({
    scope: z.strictObject({
      cycleYear: z.literal(2022),
      reportedContestsInSourceCohort: z.literal(9),
      affectedContestIds: z.tuple([z.literal(AFFECTED_CONTESTS[0]), z.literal(AFFECTED_CONTESTS[1])]),
      conflictingCandidateRows: z.literal(4),
    }),
    archiveVotes: z.literal(424306),
    canvassVotes: z.literal(424321),
    delta: z.literal(15),
    differenceCount: z.literal(4),
    differences: z.array(difference).length(4),
    conflictSetSha256: SHA,
    evidenceSha256: SHA,
  }),
  recommendedDecision: z.strictObject({
    choice: z.literal("use_final_state_canvass_for_certified_2022_candidate_totals"),
    confidence: z.literal("high"),
    rationaleCodes: z.tuple([
      z.literal("state_canvass_is_final_certification_instrument"),
      z.literal("candidate_specific_differences_are_exactly_reconciled"),
      z.literal("archive_remains_retained_as_reporting_provenance"),
    ]),
    consequences: z.tuple([
      z.literal("four_candidate_totals_in_nc03_and_nc11_would_increase_by_15_votes_in_aggregate"),
      z.literal("all_unaffected_2022_archive_candidate_totals_remain_unchanged"),
      z.literal("approval_would_authorize_a_successor_candidate_only_not_publication_or_scoring"),
    ]),
  }),
  defaultReversibleAssumption: z.strictObject({
    choice: z.literal("exclude_affected_rows_pending_review"),
    affectedContestIds: z.tuple([z.literal(AFFECTED_CONTESTS[0]), z.literal(AFFECTED_CONTESTS[1])]),
    evaluatorUse: z.literal("excluded"),
    publicationUse: z.literal("excluded"),
    unaffectedRows: z.literal("remain_reviewer_only_under_parent_receipt_lifecycle"),
  }),
  alternatives: z.tuple([
    z.strictObject({ choice: z.literal("use_archive_totals"), consequence: z.literal("preserves_export_values_but_conflicts_with_the_final_state_canvass") }),
    z.strictObject({ choice: z.literal("exclude_all_2022_results"), consequence: z.literal("avoids_precedence_but_withholds_31_candidate_totals_that_do_not_conflict") }),
  ]),
  blocks: z.strictObject({
    blocksAffectedCandidateTotals: z.literal(true),
    blocksUnrelatedWork: z.literal(false),
    doesNotResolve: z.tuple([
      z.literal("current_incumbent_identity"),
      z.literal("historical_geography"),
      z.literal("primary_disposition"),
      z.literal("progressive_classification"),
      z.literal("evaluator_eligibility"),
      z.literal("publication"),
    ]),
  }),
  workCompletedWhileWaiting: z.tuple([
    z.literal("retained_both_official_source_files_with_sha256_and_byte_size"),
    z.literal("reproduced_all_four_candidate_differences_and_the_15_vote_aggregate_delta"),
    z.literal("kept_all_affected_rows_score_and_publication_ineligible"),
  ]),
  resolution: z.strictObject({
    status: z.literal("proposed"),
    decision: z.null(),
    reviewer: z.null(),
    reviewedAt: z.null(),
    rationale: z.null(),
  }),
  packageSha256: SHA,
});

export type NcPrimarySourcePrecedenceDecision = z.infer<typeof ncPrimarySourcePrecedenceDecisionSchema>;
type SourceLockEntry = { id: string; url: string; retainedPath: string; retainedStatus: string; sha256: string; byteSize: number; kind: string; parentIds: string[] };
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value)).digest("hex");
const expectedSource = {
  [SOURCE_IDS[0]]: { url: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2022_05_17/results_pct_20220517.zip", retainedPath: "data/source/elections/primary-results/north-carolina/2022/official-results.zip", sha256: "705b203290e4131455d3e1d3bb31cf496260c68c88cbe734b84bda5318ede3c1", byteSize: 2181778 },
  [SOURCE_IDS[1]]: { url: "https://s3.amazonaws.com/dl.ncsbe.gov/State_Board_Meeting_Docs/2022-06-09/Canvass/State_Composite_Abstract_Report_by_Contest.pdf", retainedPath: "data/source/elections/primary-results/north-carolina/2022/state-canvass-by-contest.pdf", sha256: "113d6104e0d75106f9641888c30e5a029de00a2e8755ddb4006e4f21a804c194", byteSize: 674350 },
} as const;
const expectedReceiptParents = ["house-democratic-primary-source-selection-proposal-20260804-v1", SOURCE_IDS[0], SOURCE_IDS[1], "nc-2024-primary-official-results-archive", "nc-2024-primary-state-canvass-by-contest", "nc-2026-primary-official-results-archive"];
const fail = (code: string): never => { throw new Error(`North Carolina source-precedence decision rejected: ${code}`); };

export function buildNcPrimarySourcePrecedenceDecision(input: Readonly<{
  receipt: unknown;
  receiptFileSha256: string;
  sourceLockEntries: SourceLockEntry[];
}>): NcPrimarySourcePrecedenceDecision {
  if (input.receiptFileSha256 !== RECEIPT_FILE_SHA256) fail("RECEIPT_FILE_HASH_MISMATCH");
  const receipt = validateNcPrimaryReceipt(input.receipt);
  const comparison = receipt.canvassComparisons.find((row: { cycleYear: number }) => row.cycleYear === 2022);
  if (!comparison || comparison.archiveVotes !== 424306 || comparison.canvassVotes !== 424321 || comparison.differenceCount !== 4 || canonicalJson(comparison.differences) !== canonicalJson(EXPECTED_DIFFERENCES)) fail("CONFLICT_EVIDENCE_MISMATCH");
  const relevantIds = new Set<string>([...SOURCE_IDS, "north-carolina-house-democratic-primary-results-2022-2026-v1"]);
  const relevantEntries = (input.sourceLockEntries.filter((entry) => relevantIds.has(entry.id))).map(sourceLockContent);
  if (relevantEntries.length !== relevantIds.size || relevantEntries.some((entry, index) => relevantEntries.findIndex((candidate) => candidate.id === entry.id) !== index)) fail("SOURCE_LOCK_CLOSURE_MISMATCH");
  const entries = new Map(input.sourceLockEntries.map((entry) => [entry.id, entry]));
  const receiptEntry = entries.get("north-carolina-house-democratic-primary-results-2022-2026-v1");
  if (!receiptEntry || receiptEntry.url !== "urn:dsa-seats:north-carolina-house-democratic-primary-results:v1:2022-2026" || receiptEntry.retainedPath !== "data/metadata/north-carolina-house-democratic-primary-results-2022-2026-v1.json" || receiptEntry.retainedStatus !== "retained" || receiptEntry.sha256 !== RECEIPT_FILE_SHA256 || receiptEntry.byteSize !== 48201 || receiptEntry.kind !== "review_candidate" || canonicalJson(receiptEntry.parentIds) !== canonicalJson(expectedReceiptParents)) fail("RECEIPT_SOURCE_LOCK_MISMATCH");
  const sources = SOURCE_IDS.map((sourceLockId) => {
    const entry = entries.get(sourceLockId), expected = expectedSource[sourceLockId];
    if (!entry) throw new Error("North Carolina source-precedence decision rejected: SOURCE_LOCK_MISSING");
    if (entry.retainedStatus !== "retained" || entry.url !== expected.url || entry.retainedPath !== expected.retainedPath || entry.sha256 !== expected.sha256 || entry.byteSize !== expected.byteSize || entry.kind !== "source" || entry.parentIds.length !== 0) fail("SOURCE_LOCK_MISMATCH");
    return { sourceLockId, url: entry.url, retainedPath: entry.retainedPath, retainedStatus: "retained" as const, sha256: entry.sha256, byteSize: entry.byteSize, kind: "source" as const, parentIds: [] };
  });
  const differences = EXPECTED_DIFFERENCES.map((row) => ({ ...row, rowSha256: digest("dsa-seats:nc-primary-source-precedence-conflict-row:v1\0", row) }));
  const evidenceUnsigned = {
    scope: { cycleYear: 2022 as const, reportedContestsInSourceCohort: 9 as const, affectedContestIds: AFFECTED_CONTESTS, conflictingCandidateRows: 4 as const },
    archiveVotes: 424306 as const,
    canvassVotes: 424321 as const,
    delta: 15 as const,
    differenceCount: 4 as const,
    differences,
    conflictSetSha256: digest("dsa-seats:nc-primary-source-precedence-conflict-set:v1\0", differences.map(({ rowSha256, ...row }) => ({ ...row, rowSha256 }))),
  };
  const unsigned = {
    schema: "north-carolina-primary-source-precedence-decision-v1" as const,
    version: 1 as const,
    generatedAt: "2026-08-06T00:30:00.000Z" as const,
    sourceCutoff: "2026-08-05" as const,
    decisionId: DECISION_ID,
    affectedComponent: "north_carolina_2022_democratic_us_house_primary_candidate_totals" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    scoreEligible: false as const,
    inputs: { receiptSourceLockId: "north-carolina-house-democratic-primary-results-2022-2026-v1" as const, receiptFileSha256: RECEIPT_FILE_SHA256, receiptPackageSha256: NC_PRIMARY_PACKAGE_SHA256, receiptContestSetSha256: NC_PRIMARY_CONTEST_SET_SHA256, sources },
    question: "Which retained official source should control the four conflicting 2022 North Carolina Democratic U.S. House primary candidate totals?" as const,
    evidence: { ...evidenceUnsigned, evidenceSha256: digest("dsa-seats:nc-primary-source-precedence-evidence:v1\0", evidenceUnsigned) },
    recommendedDecision: { choice: "use_final_state_canvass_for_certified_2022_candidate_totals" as const, confidence: "high" as const, rationaleCodes: ["state_canvass_is_final_certification_instrument", "candidate_specific_differences_are_exactly_reconciled", "archive_remains_retained_as_reporting_provenance"] as const, consequences: ["four_candidate_totals_in_nc03_and_nc11_would_increase_by_15_votes_in_aggregate", "all_unaffected_2022_archive_candidate_totals_remain_unchanged", "approval_would_authorize_a_successor_candidate_only_not_publication_or_scoring"] as const },
    defaultReversibleAssumption: { choice: "exclude_affected_rows_pending_review" as const, affectedContestIds: AFFECTED_CONTESTS, evaluatorUse: "excluded" as const, publicationUse: "excluded" as const, unaffectedRows: "remain_reviewer_only_under_parent_receipt_lifecycle" as const },
    alternatives: [{ choice: "use_archive_totals" as const, consequence: "preserves_export_values_but_conflicts_with_the_final_state_canvass" as const }, { choice: "exclude_all_2022_results" as const, consequence: "avoids_precedence_but_withholds_31_candidate_totals_that_do_not_conflict" as const }] as const,
    blocks: { blocksAffectedCandidateTotals: true as const, blocksUnrelatedWork: false as const, doesNotResolve: ["current_incumbent_identity", "historical_geography", "primary_disposition", "progressive_classification", "evaluator_eligibility", "publication"] as const },
    workCompletedWhileWaiting: ["retained_both_official_source_files_with_sha256_and_byte_size", "reproduced_all_four_candidate_differences_and_the_15_vote_aggregate_delta", "kept_all_affected_rows_score_and_publication_ineligible"] as const,
    resolution: { status: "proposed" as const, decision: null, reviewer: null, reviewedAt: null, rationale: null },
  };
  return validateNcPrimarySourcePrecedenceDecision({ ...unsigned, packageSha256: digest("dsa-seats:nc-primary-source-precedence-decision:v1\0", unsigned) });
}

export function validateNcPrimarySourcePrecedenceDecision(value: unknown): NcPrimarySourcePrecedenceDecision {
  const parsed = ncPrimarySourcePrecedenceDecisionSchema.parse(value);
  const { packageSha256, ...unsigned } = parsed;
  if (packageSha256 !== digest("dsa-seats:nc-primary-source-precedence-decision:v1\0", unsigned)) fail("PACKAGE_HASH_MISMATCH");
  const { evidenceSha256, ...evidenceUnsigned } = parsed.evidence;
  if (evidenceSha256 !== digest("dsa-seats:nc-primary-source-precedence-evidence:v1\0", evidenceUnsigned)) fail("EVIDENCE_HASH_MISMATCH");
  const conflicts = parsed.evidence.differences.map(({ rowSha256, ...row }) => {
    if (rowSha256 !== digest("dsa-seats:nc-primary-source-precedence-conflict-row:v1\0", row)) fail("CONFLICT_ROW_HASH_MISMATCH");
    return row;
  });
  if (canonicalJson(conflicts) !== canonicalJson(EXPECTED_DIFFERENCES) || parsed.evidence.conflictSetSha256 !== digest("dsa-seats:nc-primary-source-precedence-conflict-set:v1\0", parsed.evidence.differences)) fail("CONFLICT_SET_HASH_MISMATCH");
  if (canonicalJson(parsed.inputs.sources.map((row) => row.sourceLockId)) !== canonicalJson(SOURCE_IDS)) fail("SOURCE_SET_MISMATCH");
  for (const sourceInput of parsed.inputs.sources) {
    const expected = expectedSource[sourceInput.sourceLockId];
    if (sourceInput.url !== expected.url || sourceInput.retainedPath !== expected.retainedPath || sourceInput.sha256 !== expected.sha256 || sourceInput.byteSize !== expected.byteSize) fail("SOURCE_BINDING_MISMATCH");
  }
  return parsed;
}
