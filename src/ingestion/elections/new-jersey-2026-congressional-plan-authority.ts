import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";

export const NEW_JERSEY_2026_PLAN_AUTHORITY_RECEIPT = "new-jersey-2026-congressional-plan-authority-receipt-v1" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type NewJersey2026PlanAuthorityInput = Readonly<{
  publicationsBytes: Buffer;
  mapBytes: Buffer;
  mapTextBytes: Buffer;
  statuteBytes: Buffer;
  componentsBytes: Buffer;
  componentsTextBytes: Buffer;
  currentBlocksBytes: Buffer;
  sourceLock: { version: number; entries: LockEntry[] };
}>;
const REQUIRED: LockEntry[] = [
  { id: "nj-division-elections-current-publications-20260806", url: "https://www.nj.gov/state/elections/doe-publications.shtml", retainedPath: "data/source/elections/primary-results/geography/new-jersey/2026/division-of-elections-publications.html", retainedStatus: "retained", byteSize: 84477, sha256: "8467d476299f067bee7730c4d3166815a10c712eb03677a2bc762cb5e850e305", kind: "official_current_authority", parentIds: [] },
  { id: "nj-congressional-districts-2022-2031-map", url: "https://www.nj.gov/state/elections/assets/pdf/2022-congressional-districts/2022-2031-congressional-map.pdf", retainedPath: "data/source/elections/primary-results/geography/new-jersey/2026/2022-2031-congressional-map.pdf", retainedStatus: "retained", byteSize: 4308764, sha256: "50b402ec5e72d748c9a0df0874da47b5033bfef7bc23051b0f1971df1d8d5989", kind: "official_plan_map", parentIds: ["nj-division-elections-current-publications-20260806"] },
  { id: "nj-congressional-districts-2022-2031-map-text", url: "urn:dsa-seats:2022-2031-congressional-map.pdf:pdftotext-layout-26.07.0", retainedPath: "data/source/elections/primary-results/geography/new-jersey/2026/2022-2031-congressional-map.txt", retainedStatus: "retained", byteSize: 109052, sha256: "eccd3c9a06f42fc5c3b5d466bccdf512b2497a7ea2161810504b046a7a32cb67", kind: "derived_extract", parentIds: ["nj-congressional-districts-2022-2031-map"] },
  { id: "nj-njsa-19-46-12-current-statute-20260806", url: "https://www.nj.gov/state/dos-statutes-elections-19-40-49.shtml", retainedPath: "data/source/elections/primary-results/geography/new-jersey/2026/njsa-19-46-12.html", retainedStatus: "retained", byteSize: 481252, sha256: "674521be68ed4439af64067039350b3e02d9781acaa89aad806568e8013941d1", kind: "official_statute", parentIds: [] },
  { id: "nj-congressional-2022-plan-components-report", url: "https://www.nj.gov/state/elections/assets/pdf/2022-congressional-districts/njcd-2022-plan-components-report.pdf", retainedPath: "data/source/elections/primary-results/geography/new-jersey/2026/njcd-2022-plan-components-report.pdf", retainedStatus: "retained", byteSize: 764850, sha256: "2e12b2f7c9ef3537797179ce289ae1141e72eb0222eeda7b6afbf5382b37f994", kind: "official_plan_components", parentIds: ["nj-division-elections-current-publications-20260806"] },
  { id: "nj-congressional-2022-plan-components-report-text", url: "urn:dsa-seats:njcd-2022-plan-components-report.pdf:pdftotext-layout-26.07.0", retainedPath: "data/source/elections/primary-results/geography/new-jersey/2026/njcd-2022-plan-components-report.txt", retainedStatus: "retained", byteSize: 638480, sha256: "2448443c4dbc07c77a2978404b3cfa9a3efbd4ff804d9fb4c443d7b5b5d95d33", kind: "derived_extract", parentIds: ["nj-congressional-2022-plan-components-report"] },
  { id: "census-cd119-new-jersey-block-equivalency-extract-20260806", url: "urn:dsa-seats:census-cd119-bef:NationalCD119.txt:state-fips-34", retainedPath: "data/source/elections/primary-results/geography/new-jersey/current/34_NJ_CD119.txt", retainedStatus: "retained", byteSize: 2759452, sha256: "c1466600e71aba587fa51258a4f242cebd6be4faad38750773d08654762bfb5d", kind: "derived_extract", parentIds: ["census-cd119-block-equivalency-bundle-20260805"] },
];
const OUTPUT_ENTRY: LockEntry = { id: NEW_JERSEY_2026_PLAN_AUTHORITY_RECEIPT, url: "urn:dsa-seats:new-jersey-2026-congressional-plan-authority-receipt:v1:2026-08-06", retainedPath: "data/metadata/new-jersey-2026-congressional-plan-authority-receipt-v1.json", retainedStatus: "retained", byteSize: 4294, sha256: "8d9256e823b9ad0157dcfc7c1f47f3b45c557f50069a82fe063ae4b0704541da", kind: "evidence_receipt", parentIds: REQUIRED.map((entry) => entry.id) };
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`NEW_JERSEY_2026_PLAN_AUTHORITY_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function parseBlocks(bytes: Buffer) {
  const lines = bytes.toString("utf8").split(/\r?\n/);
  if (lines.shift() !== "GEOID,CDFP") fail("block_header");
  const assignments = new Map<string, string>();
  for (const line of lines) {
    if (!line) continue;
    const match = /^(34\d{13}),(\d{2})$/.exec(line) ?? fail("block_row");
    if (assignments.has(match[1]!)) fail("duplicate_block");
    assignments.set(match[1]!, match[2]!);
  }
  const districts = [...new Set(assignments.values())].sort();
  if (assignments.size !== 137972 || districts.join(",") !== "01,02,03,04,05,06,07,08,09,10,11,12") fail("block_closure");
  return { assignments, districts };
}

function parseComponentBlocks(text: string, assignments: Map<string, string>) {
  let district: string | null = null;
  const observed = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const districtMatch = /^District (\d{1,2})$/.exec(line);
    if (districtMatch) district = districtMatch[1]!.padStart(2, "0");
    const blockMatch = /^Block:\s+(34\d{13})\s+\d[\d,]*$/.exec(line);
    if (!blockMatch) continue;
    const currentDistrict: string = district ?? fail("component_block_without_district");
    if (observed.has(blockMatch[1]!) || !assignments.has(blockMatch[1]!)) fail("component_block_crosscheck");
    observed.set(blockMatch[1]!, currentDistrict);
  }
  if (observed.size !== 11858) fail("component_block_closure");
  return observed;
}

function assemble(input: NewJersey2026PlanAuthorityInput) {
  if (input.sourceLock.version !== 1) fail("source_lock_version");
  const bytes = [input.publicationsBytes, input.mapBytes, input.mapTextBytes, input.statuteBytes, input.componentsBytes, input.componentsTextBytes, input.currentBlocksBytes];
  if (bytes.some((value, index) => sha(value) !== REQUIRED[index]!.sha256)) fail("input_bytes");
  for (const entry of REQUIRED) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);
  const publications = input.publicationsBytes.toString("utf8");
  const mapText = input.mapTextBytes.toString("utf8");
  const statute = input.statuteBytes.toString("utf8");
  const components = input.componentsTextBytes.toString("utf8");
  if (!publications.includes(">NJ Congressional Districts 2022-2031<") || !publications.includes("2022-2031-congressional-map.pdf")) fail("current_publication_semantics");
  if (!mapText.includes("Congressional Districts:") || !mapText.includes("2022-2031") || !mapText.includes("Adopted by the New Jersey Redistricting Commission on December 22, 2021")) fail("map_semantics");
  if (!statute.includes("NJSA 19:46-12 Use of districts") || !statute.includes("shall be used thereafter for the election of members of the House of Representatives") || !statute.includes("shall remain unaltered through the next year ending in zero")) fail("statute_semantics");
  if (!components.includes("Plan Name: NJ_CONG_SUMBIT12222021")) fail("components_semantics");
  const { assignments, districts } = parseBlocks(input.currentBlocksBytes);
  const componentBlocks = parseComponentBlocks(components, assignments);
  const matchingComponentBlocks = [...componentBlocks].filter(([geoid, district]) => assignments.get(geoid) === district).length;
  const mismatchedComponentBlocks = componentBlocks.size - matchingComponentBlocks;
  const district08ToCd11910 = [...componentBlocks].filter(([geoid, district]) => district === "08" && assignments.get(geoid) === "10").length;
  const district10ToCd11908 = [...componentBlocks].filter(([geoid, district]) => district === "10" && assignments.get(geoid) === "08").length;
  if (matchingComponentBlocks !== 11694 || mismatchedComponentBlocks !== 164 || district08ToCd11910 !== 86 || district10ToCd11908 !== 78) fail("component_mismatch_closure");
  const unsigned = {
    schema: NEW_JERSEY_2026_PLAN_AUTHORITY_RECEIPT,
    version: 1 as const,
    generatedAt: "2026-08-06T22:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    authority: {
      currentPlanLabel: "NJ Congressional Districts 2022-2031" as const,
      adoptedOn: "2021-12-22" as const,
      continuityStatute: "NJSA 19:46-12" as const,
      conclusion: "official_current_2022_2031_plan_continues_for_2026_absent_invalidating_judgment" as const,
      censusCd120ProductClaimed: false as const,
    },
    sources: REQUIRED.map((entry) => ({ sourceLockId: entry.id, sha256: entry.sha256, kind: entry.kind, parentIds: entry.parentIds })),
    blockInventory: { stateFips: "34" as const, uniqueBlocks: assignments.size, districts, assignmentSetSha256: digest("dsa-seats:nj-cd119-block-assignments:v1\0", [...assignments]) },
    planComponentsAssessment: {
      planName: "NJ_CONG_SUMBIT12222021" as const,
      explicitBlocks: componentBlocks.size,
      districts: [...new Set(componentBlocks.values())].sort(),
      matchingCd119Assignments: matchingComponentBlocks,
      mismatchedCd119Assignments: mismatchedComponentBlocks,
      mismatchPairs: { district08ToCd11910, district10ToCd11908 },
      useAsAdoptedMembershipEvidence: false as const,
      disposition: "retained_official_ancillary_report_excluded_from_membership_claim_due_to_164_assignment_mismatches" as const,
      assignmentSetSha256: digest("dsa-seats:nj-plan-component-blocks:v1\0", [...componentBlocks]),
    },
    methodology: {
      authorityBasis: "current_division_publication_plus_adopted_map_plus_njsa_19_46_12" as const,
      censusBlockRole: "complete_cd119_membership_for_the_explicitly_continuing_state_plan" as const,
      rawGeometryEqualityAssessed: false as const,
      overlapThresholdUsed: false as const,
      districtNumberContinuityAloneUsed: false as const,
      populationVoterOrElectoralWeightsUsed: false as const,
      courtInvalidationAssessment: "not_separately_researched_or_retained" as const,
      reuseAssessment: "public_official_sources_no_explicit_reuse_license_identified" as const,
    },
    lifecycle: { geographyCandidateCreated: false as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const, publicationEligible: false as const, deployed: false as const },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:nj-2026-plan-authority-receipt:v1\0", unsigned) };
}

export type NewJersey2026CongressionalPlanAuthorityReceipt = ReturnType<typeof assemble>;
export function buildNewJersey2026CongressionalPlanAuthorityReceipt(input: NewJersey2026PlanAuthorityInput) { return assemble(input); }
export function validateNewJersey2026CongressionalPlanAuthorityReceipt(value: NewJersey2026CongressionalPlanAuthorityReceipt, input: NewJersey2026PlanAuthorityInput) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
