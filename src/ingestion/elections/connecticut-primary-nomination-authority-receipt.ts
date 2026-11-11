import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
type Lock = { version: 1; entries: LockEntry[] };
type Observation = { observationId: string; cycleYear: 2022 | 2024; stateCode: "CT"; districtCode: string; office: "U.S. Representative"; party: "Democratic"; candidateName: string; formSelection: "endorsed"; transcriptionMethod: "manual_visual_review"; sourcePage: 1; sourceRecord: "democratic_endorsement_form"; sourceLockId: string; nominationStatus: null; resultStatus: null; scoreEligible: false; rowSha256: string };
export type ConnecticutNominationAuthorityReceipt = ReturnType<typeof buildConnecticutNominationAuthorityReceipt>;

const names = ["John B. Larson", "Joe Courtney", "Rosa L. DeLauro", "Jim Himes", "Jahana Hayes"] as const;
const sourceIds = [
  "ct-2022-endorsement-certificate-index", "ct-2024-endorsement-certificate-index", "ct-2024-democratic-primary-candidate-list-index",
  ...[2022, 2024].flatMap((year) => [1,2,3,4,5].map((district) => `ct-${year}-cd${String(district).padStart(2,"0")}-endorsement-certificate-bundle`)),
  "ct-2024-democratic-primary-candidate-list",
];
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (): never => { throw new Error("CT_NOMINATION_AUTHORITY_RECEIPT_INVALID"); };
const SOURCE_SET_SHA256 = "7e590e18da24d98c94cb8d6ea60d43fe3ea020428ceeb6b8e6ba3ffe193a3399";
const candidateListEvidence = { cycleYear: 2024 as const, party: "Democratic" as const, sourceLockId: "ct-2024-democratic-primary-candidate-list", statewidePages: 28 as const, congressionalOfficeRows: 0 as const, inference: "no_congressional_office_listed_in_statewide_democratic_primary_candidate_list" as const, nominationConclusion: null };
const summary = { certificateBundles: 10 as const, democraticEndorsementObservations: 10 as const, statewidePrimaryCandidateLists: 1 as const, congressionalPrimaryListRows: 0 as const, nominationConclusions: 0 as const, evaluatorNumericValues: 0 as const, scoreEligibleRows: 0 as const };
const limitations = ["Certificate forms establish the selected endorsement field, not final nomination, ballot placement, primary outcome, or certification.", "The statewide 2024 Democratic primary candidate list contains no congressional office row; absence alone does not distinguish no valid challenge from a later withdrawal, death, disqualification, or cancellation.", "Address-bearing source PDFs are hash-locked but nonretained; this receipt contains only the minimum district, party, candidate, form-selection, and provenance fields."] as const;
const unresolvedGates = ["retain_complete_final_democratic_primary_ballot_or_candidacy_universe", "retain_statutory_nomination_authority_and_cancellation_status", "retain_final_general_election_nominee_crosscheck", "review_candidate_identity_and_historical_geography", "complete_human_review_and_publication_approval"] as const;

export function buildConnecticutNominationAuthorityReceipt(lock: Lock) {
  if (lock.version !== 1) fail();
  const sources = sourceIds.map((id) => { const matches = lock.entries.filter((entry) => entry.id === id); if (matches.length !== 1) fail(); return sourceLockContent(matches[0]!); });
  if (digest("dsa-seats:ct-nomination-authority-source-set:v1\0", sources) !== SOURCE_SET_SHA256) fail();
  const observations: Observation[] = [];
  for (const cycleYear of [2022, 2024] as const) for (let district = 1; district <= 5; district++) {
    const districtCode = String(district).padStart(2, "0");
    const unsigned = { observationId: `ct-nomination:${cycleYear}:${districtCode}:democratic`, cycleYear, stateCode: "CT" as const, districtCode, office: "U.S. Representative" as const, party: "Democratic" as const, candidateName: names[district - 1]!, formSelection: "endorsed" as const, transcriptionMethod: "manual_visual_review" as const, sourcePage: 1 as const, sourceRecord: "democratic_endorsement_form" as const, sourceLockId: `ct-${cycleYear}-cd${districtCode}-endorsement-certificate-bundle`, nominationStatus: null, resultStatus: null, scoreEligible: false as const };
    observations.push({ ...unsigned, rowSha256: digest("dsa-seats:ct-nomination-authority-observation:v1\0", unsigned) });
  }
  const unsigned = { schema: "connecticut-primary-nomination-authority-receipt-v1" as const, version: 1 as const, generatedAt: "2026-08-06T09:00:00.000Z" as const, sourceCutoff: "2026-08-06" as const, originalPublisher: "Connecticut Secretary of the State" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null }, licenseStatus: "unassessed" as const, sources: (sources).map(sourceLockContent), observations, candidateListEvidence, summary, limitations, unresolvedGates };
  return { ...unsigned, observationSetSha256: digest("dsa-seats:ct-nomination-authority-observation-set:v1\0", observations.map(({observationId,rowSha256}) => ({observationId,rowSha256}))), packageSha256: digest("dsa-seats:ct-nomination-authority-package:v1\0", unsigned) };
}

export function validateConnecticutNominationAuthorityReceipt(value: ConnecticutNominationAuthorityReceipt) {
  const { packageSha256, observationSetSha256, ...unsigned } = value;
  const set = digest("dsa-seats:ct-nomination-authority-observation-set:v1\0", value.observations.map(({observationId,rowSha256}) => ({observationId,rowSha256})));
  const invalidRow = value.observations.some((row, index) => { const unsignedRow: Partial<Observation> = { ...row }; delete unsignedRow.rowSha256; const cycleYear = index < 5 ? 2022 : 2024, districtCode = String(index % 5 + 1).padStart(2,"0"); return row.observationId !== `ct-nomination:${cycleYear}:${districtCode}:democratic` || row.cycleYear !== cycleYear || row.stateCode !== "CT" || row.districtCode !== districtCode || row.office !== "U.S. Representative" || row.party !== "Democratic" || row.candidateName !== names[index % 5] || row.transcriptionMethod !== "manual_visual_review" || row.sourceLockId !== `ct-${cycleYear}-cd${districtCode}-endorsement-certificate-bundle` || row.formSelection !== "endorsed" || row.sourcePage !== 1 || row.sourceRecord !== "democratic_endorsement_form" || row.nominationStatus !== null || row.resultStatus !== null || row.scoreEligible || row.rowSha256 !== digest("dsa-seats:ct-nomination-authority-observation:v1\0", unsignedRow); });
  if (packageSha256 !== digest("dsa-seats:ct-nomination-authority-package:v1\0", unsigned) || observationSetSha256 !== set || digest("dsa-seats:ct-nomination-authority-source-set:v1\0", value.sources) !== SOURCE_SET_SHA256 || canonicalJson(value.candidateListEvidence) !== canonicalJson(candidateListEvidence) || canonicalJson(value.summary) !== canonicalJson(summary) || canonicalJson(value.limitations) !== canonicalJson(limitations) || canonicalJson(value.unresolvedGates) !== canonicalJson(unresolvedGates) || value.schema !== "connecticut-primary-nomination-authority-receipt-v1" || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || !value.reviewerOnly || value.publicationEligible || value.observations.length !== 10 || invalidRow) fail();
  return value;
}
