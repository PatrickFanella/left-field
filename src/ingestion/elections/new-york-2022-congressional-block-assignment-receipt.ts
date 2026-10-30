import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
type Input = { authorityBytes: Buffer; assignmentBytes: Buffer; cd118Bytes: Buffer; sourceLock: { version: 1; entries: LockEntry[] } };
export type NewYork2022BlockAssignmentReceipt = ReturnType<typeof assemble>;
export type NewYorkBlockAssignment = { sourcePlanId: string; blocks: Map<string, string>; districtCounts: Map<string, number>; header: { recordCount: number; headerLength: number; recordLength: number; updateDate: string; fields: Array<{ name: string; type: string; length: number; decimal: number }> } };

const AUTHORITY_SHA = "a36754eead5ee7b3bc6263fa0b47ebd8867de035c46a6b385467dc5c5bf8aa92", ASSIGNMENT_SHA = "460c38cf2cbbc07172782a2f508e6ad80a96a00dd4d57e5c22f6af011d42f3e6";
const sourceEntries: LockEntry[] = [
  { id: "ny-latfor-2022-congressional-map-authority", url: "https://latfor.state.ny.us/maps/?sec=2022_congress", retainedPath: "data/source/elections/primary-results/geography/new-york/2022/latfor-2022-congressional-maps.html", retainedStatus: "retained", byteSize: 7681, sha256: AUTHORITY_SHA, kind: "official_authority_page", parentIds: [] },
  { id: "ny-2022-court-ordered-congressional-block-assignment", url: "https://latfor.state.ny.us/maps/congress2022/Congress22_AmendedTechnicalCorrections_June_02_2022.dbf", retainedPath: "data/source/elections/primary-results/geography/new-york/2022/court-ordered-congressional-block-assignment.dbf", retainedStatus: "retained", byteSize: 6931754, sha256: ASSIGNMENT_SHA, kind: "official_block_assignment", parentIds: ["ny-latfor-2022-congressional-map-authority"] },
  { id: "census-cd118-block-equivalency-bundle-20260806", url: "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2023/118-congressional-district-bef/cd118.zip", retainedPath: "data/source/elections/primary-results/geography/new-york/historical/census-cd118-block-equivalency-bundle.zip", retainedStatus: "retained", byteSize: 25922515, sha256: "a2f38d0dd7c207fa144a88b66df9f59f8a6e5c27e932fbd4a32d1bcf587c5763", kind: "source", parentIds: [] },
  { id: "census-cd118-new-york-block-equivalency-extract-20260806", url: "urn:dsa-seats:census-cd118-bef:36_NY_CD118.txt", retainedPath: "data/source/elections/primary-results/geography/new-york/historical/36_NY_CD118.txt", retainedStatus: "retained", byteSize: 5776393, sha256: "359d8ec177dacf6511baf68c734a999ca9ff21ec4ef9897b85213838ed5c218a", kind: "derived_extract", parentIds: ["census-cd118-block-equivalency-bundle-20260806"] },
];
const OUTPUT_SIZE = 11669, OUTPUT_SHA = "dd0d8f450b632ce1e043dfc6b861e22de957e30cf9f2e8cc9eb438f018befbc9";
const outputEntry: LockEntry = { id: "new-york-2022-congressional-block-assignment-receipt-v1", url: "urn:dsa-seats:new-york-2022-congressional-block-assignment-receipt:v1:2026-08-06", retainedPath: "data/metadata/new-york-2022-congressional-block-assignment-receipt-v1.json", retainedStatus: "retained", byteSize: OUTPUT_SIZE, sha256: OUTPUT_SHA, kind: "evidence_receipt", parentIds: sourceEntries.map((entry) => entry.id) };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`NY_2022_BLOCK_ASSIGNMENT_RECEIPT_INVALID:${reason}`); };

export function parseNewYork2022BlockAssignment(bytes: Buffer): NewYorkBlockAssignment {
  if (bytes.length !== 6931754 || sha(bytes) !== ASSIGNMENT_SHA || bytes[0] !== 0x03) fail("dbf_bytes");
  const recordCount = bytes.readUInt32LE(4), headerLength = bytes.readUInt16LE(8), recordLength = bytes.readUInt16LE(10);
  const fields: Array<{ name: string; type: string; length: number; decimal: number }> = [];
  for (let offset = 32; offset < headerLength - 1; offset += 32) fields.push({ name: bytes.subarray(offset, offset + 11).toString("ascii").replace(/\0.*/, ""), type: String.fromCharCode(bytes[offset + 11]!), length: bytes[offset + 16]!, decimal: bytes[offset + 17]! });
  const expectedFields = [{ name: "BLOCK", type: "C", length: 15, decimal: 0 }, { name: "DISTRICTID", type: "N", length: 8, decimal: 0 }];
  if (recordCount !== 288819 || headerLength !== 97 || recordLength !== 24 || bytes[headerLength - 1] !== 0x0d || canonicalJson(fields) !== canonicalJson(expectedFields)) fail("dbf_schema");
  const blocks = new Map<string, string>(), districtCounts = new Map<string, number>();
  for (let index = 0; index < recordCount; index++) {
    const offset = headerLength + index * recordLength;
    if (bytes[offset] !== 0x20) fail("deleted_record");
    const geoid = bytes.subarray(offset + 1, offset + 16).toString("ascii").trim(), rawDistrict = bytes.subarray(offset + 16, offset + 24).toString("ascii").trim();
    if (!/^36\d{13}$/.test(geoid) || !/^(?:[1-9]|1\d|2[0-6])$/.test(rawDistrict) || blocks.has(geoid)) fail("record");
    const district = rawDistrict.padStart(2, "0"); blocks.set(geoid, district); districtCounts.set(district, (districtCounts.get(district) ?? 0) + 1);
  }
  if (blocks.size !== 288819 || canonicalJson([...districtCounts.keys()].sort()) !== canonicalJson(Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, "0")))) fail("inventory");
  return { sourcePlanId: "ny-court-ordered-congressional-plan-2022-technical-corrections-2022-06-02", blocks, districtCounts, header: { recordCount, headerLength, recordLength, updateDate: `20${String(bytes[1]).padStart(2, "0")}-${String(bytes[2]).padStart(2, "0")}-${String(bytes[3]).padStart(2, "0")}`, fields } };
}

export function parseNewYorkCensusBef(bytes: Buffer, session: "118" | "119") {
  const expected = session === "118" ? { size: 5776393, hash: "359d8ec177dacf6511baf68c734a999ca9ff21ec4ef9897b85213838ed5c218a", header: "GEOID, CDFP" } : { size: 5776392, hash: "670447571d72c0465cd27ac9769c2e969669d7decb06a4198c653b755ff2e46a", header: "GEOID,CDFP" };
  if (bytes.length !== expected.size || sha(bytes) !== expected.hash) fail(`cd${session}_bytes`);
  const lines = bytes.toString("utf8").trim().split(/\r?\n/); if (lines.shift() !== expected.header || lines.length !== 288819) fail(`cd${session}_schema`);
  const blocks = new Map<string, string>(), districtCounts = new Map<string, number>();
  for (const line of lines) { const parts = line.split(","); if (parts.length !== 2) fail(`cd${session}_record`); const geoid = parts[0]!.trim(), district = parts[1]!.trim().padStart(2, "0"); if (!/^36\d{13}$/.test(geoid) || !/^(?:0[1-9]|1\d|2[0-6])$/.test(district) || blocks.has(geoid)) fail(`cd${session}_record`); blocks.set(geoid, district); districtCounts.set(district, (districtCounts.get(district) ?? 0) + 1); }
  if (blocks.size !== 288819 || districtCounts.size !== 26) fail(`cd${session}_inventory`); return { blocks, districtCounts };
}

function exactEntry(entries: LockEntry[], expected: LockEntry) { const matches = entries.filter((entry) => entry.id === expected.id); if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`); return matches[0]!; }
function assemble(input: Input) {
  if (input.sourceLock.version !== 1 || sha(input.authorityBytes) !== AUTHORITY_SHA || sha(input.assignmentBytes) !== ASSIGNMENT_SHA) fail("input_bytes");
  const authority = input.authorityBytes.toString("utf8");
  if (!authority.includes("Congress22_AmendedTechnicalCorrections_June_02_2022.dbf") || !authority.includes("Download 2022 Congressional district block assignments") || !authority.includes("Updated June 2022 to reflect Court Ordered Technical Corrections of NY Congress Map")) fail("authority_claim");
  const parsed = parseNewYork2022BlockAssignment(input.assignmentBytes), cd118 = parseNewYorkCensusBef(input.cd118Bytes, "118"), sources = (sourceEntries.map((entry) => exactEntry(input.sourceLock.entries, entry))).map(sourceLockContent);
  if (OUTPUT_SHA) exactEntry(input.sourceLock.entries, outputEntry); else if (input.sourceLock.entries.some((entry) => entry.id === outputEntry.id)) fail("unexpected_output_lock");
  let cd118Differences = 0; for (const [geoid, district] of parsed.blocks) if (cd118.blocks.get(geoid) !== district) cd118Differences++; for (const geoid of cd118.blocks.keys()) if (!parsed.blocks.has(geoid)) cd118Differences++;
  if (cd118Differences !== 0 || parsed.blocks.size !== cd118.blocks.size) fail("cd118_concordance");
  const districts = [...parsed.districtCounts].sort(([a], [b]) => a.localeCompare(b)).map(([districtCode, blockCount]) => { const row = { districtCode, blockCount, blockCountMeaning: "2020_census_tabulation_blocks_not_population_voters_or_electoral_weight" as const }; return { ...row, rowSha256: digest("dsa-seats:ny-2022-block-assignment-district:v1\0", row) }; });
  const unsigned = {
    schema: "new-york-2022-congressional-block-assignment-receipt-v1" as const,
    version: 1 as const,
    generatedAt: "2026-08-06T16:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    originalPublisher: "New York State Legislative Task Force on Demographic Research and Reapportionment" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    sources,
    authority: { sourcePlanId: parsed.sourcePlanId, historicalCongressSession: "118" as const, landingPageClaim: "2022_congressional_block_assignments_updated_june_2022_for_court_ordered_technical_corrections" as const, assignmentFormat: "dBase_III_DBF" as const, assignmentUpdateDate: parsed.header.updateDate, censusBlockVintage: 2020 as const, censusCd118ExactConcordance: true as const, legalEffectAssessed: false as const, electionUseAssessed: false as const, reuseLicenseAssessed: false as const, publicationPermissionAssessed: false as const },
    schemaInspection: parsed.header,
    districts,
    summary: { assignmentRecords: 288819 as const, uniqueBlockGeoids: 288819 as const, districts: 26 as const, duplicateBlockGeoids: 0 as const, malformedBlockGeoids: 0 as const, censusCd118Records: 288819 as const, censusCd118AssignmentDifferences: 0 as const, continuityConclusions: 0 as const, electionConclusions: 0 as const, approvedRows: 0 as const, scoreEligibleRows: 0 as const },
    limitations: ["The receipt establishes the official assignment file identity and its block inventory only; it does not establish continuity with CD119.", "Block counts are not population, voter, partisan, or electoral weights.", "The landing page's court-ordered technical-corrections description is retained without independently adjudicating legal effect or election use.", "No explicit reuse license was identified on the retained LATFOR page; public availability and governmental provenance are not treated as publication permission or an affirmative license grant.", "No identity, nomination, result, approval, scoring, publication, or deployment conclusion is created."] as const,
    unresolvedGates: ["compare_exact_2020_block_membership_to_cd119", "review_split_district_crosswalks_without_threshold_inference", "independently_review_identity_geography_and_publication"] as const,
  };
  return { ...unsigned, districtSetSha256: digest("dsa-seats:ny-2022-block-assignment-district-set:v1\0", districts), packageSha256: digest("dsa-seats:ny-2022-block-assignment-package:v1\0", unsigned) };
}
export function buildNewYork2022BlockAssignmentReceipt(input: Input) { return assemble(input); }
export function validateNewYork2022BlockAssignmentReceipt(value: NewYork2022BlockAssignmentReceipt, input: Input) { if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift"); return value; }
