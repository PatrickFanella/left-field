import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
/* eslint-disable @typescript-eslint/no-explicit-any -- source-lock JSON is runtime validated */
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";

type Input = {
  statute2021: Buffer; statute2021Sha256: string;
  supplement2022: Buffer; supplement2022Sha256: string;
  statute2023: Buffer; statute2023Sha256: string;
  supplement2024: Buffer; supplement2024Sha256: string;
  nominationReceiptBytes: Buffer;
  sourceLock: any;
};
type TriggerFacts = {
  otherCandidateReachedConventionThreshold: null;
  timelyConformingNonEndorsedCandidacyFiled: null;
  deathWithdrawalOrDisqualificationOccurred: null;
  replacementCandidacyFiled: null;
  remainingCandidateCountNoGreaterThanPositions: null;
};
type CycleRow = {
  cycleYear: 2022 | 2024;
  sectionSources: Record<"9-400" | "9-415" | "9-416" | "9-426" | "9-429", string>;
  supplementFinding: "no_reviewed_section_amendment" | "sections_9-426_and_9-429_amended_effective_2024-01-01";
  cancellationTiming: "prior_to_opening_of_polls" | "before_commencement_of_early_voting";
  triggerFacts: TriggerFacts;
  primaryCancellationStatus: null;
  nominationConclusion: null;
  approved: false;
  scoreEligible: false;
  rowSha256: string;
};
export type ConnecticutNominationStatutoryAuthorityReceipt = ReturnType<typeof buildConnecticutNominationStatutoryAuthorityReceipt>;

const FILES = {
  statute2021: [371695, "a7b5d6cfff1f702eda31605f37ffbe82afe6c7228c5aa0be08a602101e6c6e33"],
  supplement2022: [51593, "955ff66d75f59c30679399e51bfcbce34eed1d2d34099eada7ed08ec8d852b64"],
  statute2023: [389864, "f422baa761ad7fbcff8a8883e997ca0077c6b1f940dcc1749b240b83f57c8c59"],
  supplement2024: [42304, "b6b1f2a94b17591a3447dad2e27cfb871b23f334f73b012702c5a5615c98331a"],
} as const;
const NOMINATION_RECEIPT_SHA256 = "076b40df2f7fbac8325e2131c3fd000967d3c944c74932e7dcb49954fcd9bacb";
const sourceIds = ["ct-2021-chapter-153", "ct-2022-chapter-153-supplement", "ct-2023-chapter-153", "ct-2024-chapter-153-supplement", "connecticut-primary-nomination-authority-receipt-v1"] as const;
const SOURCE_SET_SHA256 = "68248e83426da1ad1a2bf60ee904f7b9e835ff5caaaacc474d66a71aae888ba2";
const PACKAGE_SHA256 = "0359093fa128ec5829095be0c86024d68b700c4dad9e3648b67df3587adee5f6";
const CYCLE_SET_SHA256 = "61029ccf7a0c91ecaf8451432ebb93b14eb1b1c34713ff52f5a9e3229634ba74";
const outputLockEntry = { id: "connecticut-nomination-statutory-authority-receipt-v1", url: "urn:dsa-seats:connecticut-nomination-statutory-authority-receipt:v1:2022-2024", retainedPath: "data/metadata/connecticut-nomination-statutory-authority-receipt-v1.json", retainedStatus: "retained", byteSize: 7159, sha256: "6c8ea07744001b26f2597b6c00b10e3d05e3329e459726b7beb4bf159575d089", kind: "review_evidence_receipt", parentIds: [...sourceIds] } as const;
const sections = ["9-400", "9-415", "9-416", "9-426", "9-429"] as const;
const review = { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null };
const conditionalRules = {
  "9-400": "Defines qualifying district-office candidacy routes and timely conforming filing requirements.",
  "9-415": "A qualifying non-endorsed candidacy triggers a primary, subject to section 9-416a.",
  "9-416": "The endorsed candidate is deemed lawfully chosen only when no other person reached the convention threshold and no timely conforming non-endorsed candidacy was filed.",
  "9-426": "Cancellation consequences require a filed candidacy followed by death, withdrawal, or disqualification under the cycle-specific timing rule.",
  "9-429": "Cancellation after attrition requires nonreplacement and a remaining candidate count no greater than the positions to be filled.",
} as const;
const summary = { cycles: 2 as const, reviewedSectionsPerCycle: 5 as const, resolvedTriggerFacts: 0 as const, primaryCancellationConclusions: 0 as const, nominationConclusions: 0 as const, approvedCycles: 0 as const, scoreEligibleCycles: 0 as const };
const limitations = [
  "The statutes define conditional legal consequences; the retained endorsement forms and candidate-list observation do not establish the required trigger facts.",
  "The 2022 supplement does not amend the five reviewed sections; the 2024 supplement supplies the effective amendments to sections 9-426 and 9-429.",
  "No nominee, no-primary, cancellation, ballot-placement, certification, withdrawal, death, disqualification, replacement, or filing conclusion is inferred.",
] as const;
const unresolvedGates = ["retain_complete_final_democratic_primary_ballot_or_candidacy_universe", "resolve_statutory_trigger_facts_from_direct_official_evidence", "human_legal_review", "complete_human_review_and_publication_approval"] as const;
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (): never => { throw new Error("CT_NOMINATION_STATUTORY_AUTHORITY_RECEIPT_INVALID"); };
const nullFacts = (): TriggerFacts => ({ otherCandidateReachedConventionThreshold: null, timelyConformingNonEndorsedCandidacyFiled: null, deathWithdrawalOrDisqualificationOccurred: null, replacementCandidacyFiled: null, remainingCandidateCountNoGreaterThanPositions: null });
const hasSection = (text: string, section: string) => text.includes(`id="sec_${section.replace("-", "-")}"`);
const exactKeys = (value: object, expected: readonly string[]) => canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());
const TOP_LEVEL_KEYS = ["conditionalRules", "cycleSetSha256", "cycles", "generatedAt", "limitations", "originalPublishers", "packageSha256", "publicationEligible", "review", "reviewerOnly", "schema", "sourceCutoff", "sources", "summary", "unresolvedGates", "version"] as const;
const CYCLE_KEYS = ["approved", "cancellationTiming", "cycleYear", "nominationConclusion", "primaryCancellationStatus", "rowSha256", "scoreEligible", "sectionSources", "supplementFinding", "triggerFacts"] as const;
const TRIGGER_KEYS = ["deathWithdrawalOrDisqualificationOccurred", "otherCandidateReachedConventionThreshold", "remainingCandidateCountNoGreaterThanPositions", "replacementCandidacyFiled", "timelyConformingNonEndorsedCandidacyFiled"] as const;

export function buildConnecticutNominationStatutoryAuthorityReceipt(input: Input) {
  for (const key of Object.keys(FILES) as (keyof typeof FILES)[]) { const bytes = input[key], [size, expected] = FILES[key]; if (bytes.length !== size || sha(bytes) !== expected || input[`${key}Sha256` as keyof Input] !== expected) fail(); }
  if (sha(input.nominationReceiptBytes) !== NOMINATION_RECEIPT_SHA256) fail();
  let nominationReceipt: any; try { nominationReceipt = JSON.parse(input.nominationReceiptBytes.toString("utf8")); } catch { fail(); }
  if (nominationReceipt?.schema !== "connecticut-primary-nomination-authority-receipt-v1" || nominationReceipt?.observations?.length !== 10 || nominationReceipt.observations.some((row: any) => row.nominationStatus !== null || row.resultStatus !== null || row.scoreEligible)) fail();
  const sources = sourceIds.map((id) => { const matches = input.sourceLock.entries?.filter((entry: any) => entry.id === id) ?? []; if (matches.length !== 1) fail(); return sourceLockContent(matches[0]); });
  const outputMatches = input.sourceLock.entries?.filter((entry: any) => entry.id === outputLockEntry.id) ?? [];
  if (digest("dsa-seats:ct-nomination-statutory-authority-source-set:v1\0", sources) !== SOURCE_SET_SHA256 || outputMatches.length !== 1 || canonicalJson(sourceLockContent(outputMatches[0])) !== canonicalJson(sourceLockContent(outputLockEntry))) fail();
  const text2021 = input.statute2021.toString("utf8"), text2022 = input.supplement2022.toString("utf8"), text2023 = input.statute2023.toString("utf8"), text2024 = input.supplement2024.toString("utf8");
  if (!sections.every((section) => hasSection(text2021, section) && hasSection(text2023, section)) || sections.some((section) => hasSection(text2022, section)) || !hasSection(text2024, "9-426") || !hasSection(text2024, "9-429") || ["9-400", "9-415", "9-416"].some((section) => hasSection(text2024, section)) || !text2021.includes("prior to the opening of the polls at such primary") || !text2024.includes("before the commencement of the period of early voting at the primary") || !text2024.includes("effective January 1, 2024")) fail();
  const baseRows = [
    { cycleYear: 2022 as const, sectionSources: Object.fromEntries(sections.map((section) => [section, "ct-2021-chapter-153"])) as CycleRow["sectionSources"], supplementFinding: "no_reviewed_section_amendment" as const, cancellationTiming: "prior_to_opening_of_polls" as const },
    { cycleYear: 2024 as const, sectionSources: { "9-400": "ct-2023-chapter-153", "9-415": "ct-2023-chapter-153", "9-416": "ct-2023-chapter-153", "9-426": "ct-2024-chapter-153-supplement", "9-429": "ct-2024-chapter-153-supplement" }, supplementFinding: "sections_9-426_and_9-429_amended_effective_2024-01-01" as const, cancellationTiming: "before_commencement_of_early_voting" as const },
  ];
  const cycles: CycleRow[] = baseRows.map((row) => { const unsigned = { ...row, triggerFacts: nullFacts(), primaryCancellationStatus: null, nominationConclusion: null, approved: false as const, scoreEligible: false as const }; return { ...unsigned, rowSha256: digest("dsa-seats:ct-nomination-statutory-authority-row:v1\0", unsigned) }; });
  const unsigned = { schema: "connecticut-nomination-statutory-authority-receipt-v1" as const, version: 1 as const, generatedAt: "2026-08-06T12:30:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, review, originalPublishers: ["Connecticut General Assembly", "Connecticut Secretary of the State"] as const, sources, conditionalRules, cycles, cycleSetSha256: digest("dsa-seats:ct-nomination-statutory-authority-cycle-set:v1\0", cycles), summary, limitations, unresolvedGates };
  return { ...unsigned, packageSha256: digest("dsa-seats:ct-nomination-statutory-authority-package:v1\0", unsigned) };
}

export function validateConnecticutNominationStatutoryAuthorityReceipt(value: ConnecticutNominationStatutoryAuthorityReceipt) {
  const { packageSha256, ...unsigned } = value;
  const expectedRows = [{ cycleYear: 2022, timing: "prior_to_opening_of_polls", supplement: "no_reviewed_section_amendment" }, { cycleYear: 2024, timing: "before_commencement_of_early_voting", supplement: "sections_9-426_and_9-429_amended_effective_2024-01-01" }] as const;
  const invalidRow = value.cycles.length !== 2 || value.cycles.some((row, index) => { const unsignedRow: Partial<CycleRow> = { ...row }; delete unsignedRow.rowSha256; const expected = expectedRows[index]!; return !exactKeys(row, CYCLE_KEYS) || !exactKeys(row.triggerFacts, TRIGGER_KEYS) || row.cycleYear !== expected.cycleYear || row.cancellationTiming !== expected.timing || row.supplementFinding !== expected.supplement || Object.values(row.triggerFacts).some((fact) => fact !== null) || row.primaryCancellationStatus !== null || row.nominationConclusion !== null || row.approved !== false || row.scoreEligible !== false || row.rowSha256 !== digest("dsa-seats:ct-nomination-statutory-authority-row:v1\0", unsignedRow); });
  if (!exactKeys(value, TOP_LEVEL_KEYS) || packageSha256 !== PACKAGE_SHA256 || packageSha256 !== digest("dsa-seats:ct-nomination-statutory-authority-package:v1\0", unsigned) || value.cycleSetSha256 !== CYCLE_SET_SHA256 || value.cycleSetSha256 !== digest("dsa-seats:ct-nomination-statutory-authority-cycle-set:v1\0", value.cycles) || digest("dsa-seats:ct-nomination-statutory-authority-source-set:v1\0", value.sources) !== SOURCE_SET_SHA256 || value.schema !== "connecticut-nomination-statutory-authority-receipt-v1" || value.version !== 1 || value.generatedAt !== "2026-08-06T12:30:00.000Z" || value.sourceCutoff !== "2026-08-06" || value.reviewerOnly !== true || value.publicationEligible !== false || canonicalJson(value.originalPublishers) !== canonicalJson(["Connecticut General Assembly", "Connecticut Secretary of the State"]) || canonicalJson(value.review) !== canonicalJson(review) || canonicalJson(value.conditionalRules) !== canonicalJson(conditionalRules) || canonicalJson(value.summary) !== canonicalJson(summary) || canonicalJson(value.limitations) !== canonicalJson(limitations) || canonicalJson(value.unresolvedGates) !== canonicalJson(unresolvedGates) || invalidRow) fail();
  const expectedSectionSources = [{ "9-400": "ct-2021-chapter-153", "9-415": "ct-2021-chapter-153", "9-416": "ct-2021-chapter-153", "9-426": "ct-2021-chapter-153", "9-429": "ct-2021-chapter-153" }, { "9-400": "ct-2023-chapter-153", "9-415": "ct-2023-chapter-153", "9-416": "ct-2023-chapter-153", "9-426": "ct-2024-chapter-153-supplement", "9-429": "ct-2024-chapter-153-supplement" }];
  if (value.cycles.some((row, index) => canonicalJson(row.sectionSources) !== canonicalJson(expectedSectionSources[index]))) fail();
  return value;
}
