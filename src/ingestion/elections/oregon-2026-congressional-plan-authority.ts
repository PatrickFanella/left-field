import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";

export const OREGON_2026_PLAN_AUTHORITY_RECEIPT = "oregon-2026-congressional-plan-authority-receipt-v1" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type Oregon2026PlanAuthorityInput = Readonly<{ redistrictingPageBytes: Buffer; enrolledBillBytes: Buffer; enrolledBillTextBytes: Buffer; mapGuideBytes: Buffer; mapGuideTextBytes: Buffer; currentBlocksBytes: Buffer; sourceLock: { version: number; entries: LockEntry[] } }>;

const REQUIRED: LockEntry[] = [
  { id: "oregon-redistricting-current-page-20260806", url: "https://www.oregonlegislature.gov/redistricting", retainedPath: "data/source/elections/primary-results/geography/oregon/2026/redistricting.html", retainedStatus: "retained", byteSize: 217642, sha256: "6245dc38c5f71b429ac84cd7c522e4abac0d48224883b9d479fbe3d2421e162a", kind: "official_current_authority", parentIds: [] },
  { id: "oregon-sb881-enrolled-congressional-plan", url: "https://olis.oregonlegislature.gov/liz/2021S1/Downloads/MeasureDocument/SB881/Enrolled", retainedPath: "data/source/elections/primary-results/geography/oregon/2026/sb881-enrolled.pdf", retainedStatus: "retained", byteSize: 111345, sha256: "6df87e57e01ffcc2f91cea546cff87eb2841d99044e7abb02e1d68f4fa641873", kind: "official_plan_law", parentIds: ["oregon-redistricting-current-page-20260806"] },
  { id: "oregon-sb881-enrolled-congressional-plan-text", url: "urn:dsa-seats:sb881-enrolled.pdf:pdftotext-layout-26.07.0", retainedPath: "data/source/elections/primary-results/geography/oregon/2026/sb881-enrolled.txt", retainedStatus: "retained", byteSize: 151144, sha256: "2a152d43078a07eabe3755f6edb4374f8b18a0761d1d603b60cf59fd7afe2aff", kind: "derived_extract", parentIds: ["oregon-sb881-enrolled-congressional-plan"] },
  { id: "oregon-lpro-interactive-map-data-guide-20260806", url: "https://www.oregonlegislature.gov/lpro/mapsfaqs/Interactive_District_Map_Data.pdf", retainedPath: "data/source/elections/primary-results/geography/oregon/2026/interactive-map-data.pdf", retainedStatus: "retained", byteSize: 189331, sha256: "4638db7a6891d343add13cb82520e8852c5872a72a8a5dd6bb46381b9833b42c", kind: "official_current_map_guide", parentIds: [] },
  { id: "oregon-lpro-interactive-map-data-guide-text-20260806", url: "urn:dsa-seats:interactive-map-data.pdf:pdftotext-layout-26.07.0", retainedPath: "data/source/elections/primary-results/geography/oregon/2026/interactive-map-data.txt", retainedStatus: "retained", byteSize: 11426, sha256: "620b4c8c01f9fd573f78686ef82c59b29a16724de3f2a2932bc6fbadfedef06a", kind: "derived_extract", parentIds: ["oregon-lpro-interactive-map-data-guide-20260806"] },
  { id: "census-cd119-oregon-block-equivalency-extract-20260806", url: "urn:dsa-seats:census-cd119-bef:NationalCD119.txt:state-fips-41", retainedPath: "data/source/elections/primary-results/geography/oregon/current/41_OR_CD119.txt", retainedStatus: "retained", byteSize: 2616152, sha256: "34295664add30fff21d16739e5bbdf2e3a6dd1ba5b96c3f988371963f9625ad5", kind: "derived_extract", parentIds: ["census-cd119-block-equivalency-bundle-20260805"] },
];
const OUTPUT: LockEntry = { id: OREGON_2026_PLAN_AUTHORITY_RECEIPT, url: "urn:dsa-seats:oregon-2026-congressional-plan-authority-receipt:v1:2026-08-06", retainedPath: "data/metadata/oregon-2026-congressional-plan-authority-receipt-v1.json", retainedStatus: "retained", byteSize: 3530, sha256: "68091a085eb0e395869dc4284b31d7755d90e8ba4cb26b6b2752473c5484df71", kind: "evidence_receipt", parentIds: REQUIRED.map((entry) => entry.id) };
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`OREGON_2026_PLAN_AUTHORITY_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => { const matches = entries.filter((entry) => entry.id === expected.id); if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`); };

function parseBlocks(bytes: Buffer) {
  const lines = bytes.toString("utf8").split(/\r?\n/);
  if (lines.shift() !== "GEOID,CDFP") fail("block_header");
  const assignments = new Map<string, string>();
  for (const line of lines) {
    if (!line) continue;
    const match = /^(41\d{13}),(0[1-6])$/.exec(line) ?? fail("block_row");
    if (assignments.has(match[1]!)) fail("duplicate_block");
    assignments.set(match[1]!, match[2]!);
  }
  const districts = [...new Set(assignments.values())].sort();
  const districtBlockCounts = Object.fromEntries(districts.map((district) => [district, [...assignments.values()].filter((value) => value === district).length]));
  if (assignments.size !== 130807 || canonicalJson(districtBlockCounts) !== canonicalJson({ "01": 15034, "02": 50388, "03": 12862, "04": 24209, "05": 16434, "06": 11880 })) fail("block_closure");
  return { assignments, districts, districtBlockCounts };
}

function assemble(input: Oregon2026PlanAuthorityInput) {
  if (input.sourceLock.version !== 1) fail("source_lock_version");
  const bytes = [input.redistrictingPageBytes, input.enrolledBillBytes, input.enrolledBillTextBytes, input.mapGuideBytes, input.mapGuideTextBytes, input.currentBlocksBytes];
  if (bytes.some((value, index) => sha(value) !== REQUIRED[index]!.sha256)) fail("input_bytes");
  for (const entry of REQUIRED) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT);
  const page = input.redistrictingPageBytes.toString("utf8"), bill = input.enrolledBillTextBytes.toString("utf8"), guide = input.mapGuideTextBytes.toString("utf8");
  if (!page.includes("completed the adoption of new congressional and legislative redistricting plans") || !page.includes("Senate Bill 881 A") || !page.includes("signed into law by Governor Brown") || !page.includes("upheld by the courts")) fail("current_page_semantics");
  if (!bill.includes("Enrolled Senate Bill 881 (SB 881-A)") || !bill.includes("into six congressional districts composed, respectively") || !bill.includes("Repassed by Senate September 27, 2021") || !bill.includes("Passed by House September 27, 2021")) fail("bill_semantics");
  if (!guide.includes("Congressional Districts") || !guide.includes("Data Source: Legislative Policy and Research Office (LPRO)") || !guide.includes("redistricting plans adopted on September 27, 2021")) fail("guide_semantics");
  const { assignments, districts, districtBlockCounts } = parseBlocks(input.currentBlocksBytes);
  const unsigned = {
    schema: OREGON_2026_PLAN_AUTHORITY_RECEIPT,
    version: 1 as const,
    generatedAt: "2026-08-06T23:45:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    authority: { planLaw: "Enrolled Senate Bill 881 (SB 881-A)" as const, adoptedOn: "2021-09-27" as const, congressionalDistricts: 6 as const, currentLproLayerUsesAdoptedPlan: true as const, conclusion: "current_official_lpro_layer_is_based_on_the_2021_adopted_congressional_plan" as const, direct2026ElectionAdministrationPlanUseAssessed: false as const, censusCd120ProductClaimed: false as const },
    sources: REQUIRED.map((entry) => ({ sourceLockId: entry.id, sha256: entry.sha256, kind: entry.kind, parentIds: entry.parentIds })),
    blockInventory: { stateFips: "41" as const, uniqueBlocks: assignments.size, districts, districtBlockCounts, assignmentSetSha256: digest("dsa-seats:or-cd119-block-assignments:v1\0", [...assignments]) },
    methodology: { authorityBasis: "current_legislature_page_plus_enrolled_sb881_plus_current_lpro_map_data_guide" as const, censusBlockRole: "complete_census_cd119_block_membership_inventory" as const, sourcePlanToCd119ExactBlockConcordanceAssessed: false as const, rawGeometryEqualityAssessed: false as const, overlapThresholdUsed: false as const, districtNumberContinuityAloneUsed: false as const, legalPermanenceAssessed: false as const, courtInvalidationAssessment: "current_legislature_page_states_plan_upheld_no_separate_court_docket_search_retained" as const, reuseAssessment: "public_official_sources_no_explicit_reuse_license_identified" as const },
    lifecycle: { geographyCandidateCreated: false as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const, publicationEligible: false as const, deployed: false as const },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:or-2026-plan-authority-receipt:v1\0", unsigned) };
}

export type Oregon2026CongressionalPlanAuthorityReceipt = ReturnType<typeof assemble>;
export function buildOregon2026CongressionalPlanAuthorityReceipt(input: Oregon2026PlanAuthorityInput) { return assemble(input); }
export function validateOregon2026CongressionalPlanAuthorityReceipt(value: Oregon2026CongressionalPlanAuthorityReceipt, input: Oregon2026PlanAuthorityInput) { if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift"); return value; }
