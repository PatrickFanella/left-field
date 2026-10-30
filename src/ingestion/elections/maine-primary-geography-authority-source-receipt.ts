import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { unzipSync } from "fflate";

import { canonicalJson } from "../fec/aipac-proposed-packages";

export const MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_V1 = "maine-primary-geography-authority-source-receipt-v1" as const;
// First-generation pins are deliberately blank until the separately generated reviewer receipt is retained.
export const MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_SET_SHA256 = "3b6560e9d785198c9c108b85341a9afa91a7dedb80ae65a87c2701b50ac6c0d7" as const;
export const MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_PACKAGE_SHA256 = "e3407eaf10aca8dcb526a88524b1a1ed466a031fcdaf6b1b0d038b16824f23a2" as const;
export const MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_SHA256 = "2564507cdd32043f4f4c0b25fb5c94fc15daad1a05d23400c9e27ba6996e2a4f" as const;
export const MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_BYTES = 15_743 as const;

type LockEntry = Readonly<{
  id: string;
  url: string;
  retainedPath: string;
  retainedStatus: "retained";
  byteSize: number;
  sha256: string;
  kind: string;
  parentIds: readonly string[];
}>;
type SourceLock = Readonly<{ version: number; entries: readonly LockEntry[] }>;

export type MainePrimaryGeographyAuthoritySourceReceiptInput = Readonly<{
  ld1739StatusBytes: Buffer;
  planLawPdfBytes: Buffer;
  planLawTextBytes: Buffer;
  currentDistrictStatuteBytes: Buffer;
  reapportionmentStatuteBytes: Buffer;
  cd118MaineAssignmentsBytes: Buffer;
  cd119MaineAssignmentsBytes: Buffer;
  censusPlanChangeAuthorityBytes: Buffer;
  tigerCd119ZipBytes: Buffer;
  sourceLock: SourceLock;
}>;

const PARENTS = [
  "maine-legislature-ld1739-status-20260807",
  "maine-pl-2021-c487-congressional-plan",
  "maine-pl-2021-c487-congressional-plan-text",
  "maine-mrsa-21a-1205a-congressional-districts-20260807",
  "maine-mrsa-21a-1206-reapportionment-20260807",
  "census-cd118-block-equivalency-bundle-20260806",
  "census-cd118-maine-block-equivalency-extract-20260807",
  "census-cd119-block-equivalency-bundle-20260805",
  "census-cd119-maine-block-equivalency-extract-20260807",
  "census-cd119-plan-change-authority-20260805",
  "tiger-cd119-23",
] as const;

const REQUIRED_SOURCES: readonly LockEntry[] = [
  { id: PARENTS[0], url: "https://legislature.maine.gov/legis/bills/display_ps.asp?paper=HP1305&PID=1456&snum=130", retainedPath: "data/source/elections/primary-results/geography/maine/authority/ld1739-status.html", retainedStatus: "retained", byteSize: 23_634, sha256: "c8d2b476ebf95c33de413e836850848fa2bd506902a20d8e698ecd46ee4625d2", kind: "official_plan_law_status", parentIds: [] },
  { id: PARENTS[1], url: "https://legislature.maine.gov/legis/bills/getPDF.asp?paper=HP1305&item=2&snum=130", retainedPath: "data/source/elections/primary-results/geography/maine/authority/pl-2021-c487-congressional-plan.pdf", retainedStatus: "retained", byteSize: 157_014, sha256: "1f8b086dfdc3e93ba6b35dab6383b5a7ec312bf571aa6a3ba391553041f0c291", kind: "official_plan_law", parentIds: [PARENTS[0]] },
  { id: PARENTS[2], url: "urn:dsa-seats:maine-pl-2021-c487:pdftotext-layout-26.07.0", retainedPath: "data/source/elections/primary-results/geography/maine/authority/pl-2021-c487-congressional-plan.txt", retainedStatus: "retained", byteSize: 3_080, sha256: "78a3106078478c2aa58d9cb3702ddbc6470a7e5fbbc30e4008ed4845cb2a5aff", kind: "derived_extract", parentIds: [PARENTS[1]] },
  { id: PARENTS[3], url: "https://legislature.maine.gov/statutes/21-A/title21-Asec1205-A.html", retainedPath: "data/source/elections/primary-results/geography/maine/authority/mrsa-title21a-section1205-a.html", retainedStatus: "retained", byteSize: 10_895, sha256: "558850b897f0fae7a5089d813554c7d891d0d0cedf8b86aea4069f1720225c96", kind: "official_current_plan_statute", parentIds: [] },
  { id: PARENTS[4], url: "https://legislature.maine.gov/legis/statutes/21-A/title21-Asec1206.html", retainedPath: "data/source/elections/primary-results/geography/maine/authority/mrsa-title21a-section1206.html", retainedStatus: "retained", byteSize: 12_802, sha256: "c597f99128f1b9f0f69891bf53d16219aa0ac540971870c405337a03bcac39d4", kind: "official_plan_duration_statute", parentIds: [] },
  { id: PARENTS[5], url: "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2023/118-congressional-district-bef/cd118.zip", retainedPath: "data/source/elections/primary-results/geography/new-york/historical/census-cd118-block-equivalency-bundle.zip", retainedStatus: "retained", byteSize: 25_922_515, sha256: "a2f38d0dd7c207fa144a88b66df9f59f8a6e5c27e932fbd4a32d1bcf587c5763", kind: "source", parentIds: [] },
  { id: PARENTS[6], url: "urn:dsa-seats:census-cd118-bef:23_ME_CD118.txt", retainedPath: "data/source/elections/primary-results/geography/maine/historical/23_ME_CD118.txt", retainedStatus: "retained", byteSize: 942_773, sha256: "3f9fea1bde2062980b2a854bbbfe2593184191798a487b7542751e648efef148", kind: "derived_extract", parentIds: [PARENTS[5]] },
  { id: PARENTS[7], url: "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2025/119-congressional-district-befs/cd119.zip", retainedPath: "data/source/elections/primary-results/geography/north-carolina/current/census-cd119-block-equivalency-bundle.zip", retainedStatus: "retained", byteSize: 22_959_130, sha256: "1433feb5178dc7b4188ee30f5f7f715851f4400740b8fe1ce606a876c6294bd6", kind: "source", parentIds: [] },
  { id: PARENTS[8], url: "urn:dsa-seats:census-cd119-bef:NationalCD119.txt:state-fips-23", retainedPath: "data/source/elections/primary-results/geography/maine/current/23_ME_CD119.txt", retainedStatus: "retained", byteSize: 942_772, sha256: "7920db5f0c0fb4f7029547f5fb7ee79b4454a811929764dfc795b981f610299e", kind: "derived_extract", parentIds: [PARENTS[7]] },
  { id: PARENTS[9], url: "https://www.census.gov/geographies/mapping-files/2025/dec/rdo/119-congressional-district-bef.html", retainedPath: "data/source/elections/primary-results/geography/census-119-congressional-district-bef.html", retainedStatus: "retained", byteSize: 324_827, sha256: "66a0551a6c3c6432bff0a6a6db23f221fbe02ead1d15221d7050633898914670", kind: "source", parentIds: [] },
  { id: PARENTS[10], url: "https://www2.census.gov/geo/tiger/TIGER2025/CD/tl_2025_23_cd119.zip", retainedPath: "data/source/tiger2025/tl_2025_23_cd119.zip", retainedStatus: "retained", byteSize: 358_233, sha256: "c92f890be463967aea2c0d09de468037e3b168cc9cd82a57d421c3d9c5e77c58", kind: "source", parentIds: [] },
];

type AssignmentInventory = Readonly<{ assignments: ReadonlyMap<string, "01" | "02">; districtCounts: Readonly<{ "01": 15_307; "02": 31_831 }>; assignmentSetSha256: string }>;
const sha = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason = ""): never => { throw new Error(`MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_INVALID${reason ? `:${reason}` : ""}`); };
const collapsed = (value: string): string => value.replace(/\s+/g, " ").trim();

function exactSourceEntries(sourceLock: SourceLock): readonly LockEntry[] {
  if (sourceLock.version !== 1 || !Array.isArray(sourceLock.entries)) fail("SOURCE_LOCK_VERSION");
  for (const expected of REQUIRED_SOURCES) {
    const matches = sourceLock.entries.filter((entry) => entry.id === expected.id);
    if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`SOURCE_LOCK_${expected.id}`);
  }
  return REQUIRED_SOURCES;
}

function parseAssignments(bytes: Buffer, expectedHash: string, header: "GEOID, CDFP" | "GEOID,CDFP"): AssignmentInventory {
  if (bytes.byteLength !== (header === "GEOID, CDFP" ? 942_773 : 942_772) || sha(bytes) !== expectedHash) fail("ASSIGNMENT_BYTES");
  const lines = bytes.toString("utf8").split(/\r?\n/);
  if (lines.shift() !== header || lines.at(-1) !== "") fail("ASSIGNMENT_HEADER");
  const assignments = new Map<string, "01" | "02">();
  for (const line of lines) {
    if (!line) continue;
    const match = /^(23\d{13}),\s?(01|02)$/.exec(line) ?? fail("ASSIGNMENT_ROW");
    if (assignments.has(match[1]!)) fail("ASSIGNMENT_DUPLICATE");
    assignments.set(match[1]!, match[2]! as "01" | "02");
  }
  const districtCounts = { "01": [...assignments.values()].filter((district) => district === "01").length, "02": [...assignments.values()].filter((district) => district === "02").length };
  if (assignments.size !== 47_138 || canonicalJson(districtCounts) !== canonicalJson({ "01": 15_307, "02": 31_831 })) fail("ASSIGNMENT_CLOSURE");
  return { assignments, districtCounts: districtCounts as AssignmentInventory["districtCounts"], assignmentSetSha256: digest("dsa-seats:maine-cd-block-assignment-set:v1\0", [...assignments].sort(([left], [right]) => left.localeCompare(right))) };
}

function inventoryTigerCd119(bytes: Buffer) {
  if (bytes.byteLength !== 358_233 || sha(bytes) !== REQUIRED_SOURCES[10]!.sha256) fail("TIGER_BYTES");
  const members = unzipSync(bytes);
  const dbf = members["tl_2025_23_cd119.dbf"];
  if (!dbf || Object.keys(members).sort().join(",") !== "tl_2025_23_cd119.cpg,tl_2025_23_cd119.dbf,tl_2025_23_cd119.prj,tl_2025_23_cd119.shp,tl_2025_23_cd119.shp.ea.iso.xml,tl_2025_23_cd119.shp.iso.xml,tl_2025_23_cd119.shx") fail("TIGER_ARCHIVE");
  const value = Buffer.from(dbf);
  if (value[0] !== 0x03 || value.readUInt32LE(4) !== 2 || value.readUInt16LE(8) !== 449 || value.readUInt16LE(10) !== 125 || value[448] !== 0x0d || 449 + 2 * 125 > value.length) fail("TIGER_DBF_HEADER");
  const fields: Array<Readonly<{ name: string; offset: number; length: number }>> = [];
  let offset = 1;
  for (let cursor = 32; cursor < 448; cursor += 32) {
    const name = value.subarray(cursor, cursor + 11).toString("ascii").replace(/\0.*$/, "").trim();
    const length = value[cursor + 16]!;
    if (!name || !length) fail("TIGER_DBF_FIELD");
    fields.push({ name, offset, length }); offset += length;
  }
  if (offset !== 125 || fields.map((field) => field.name).join(",") !== "STATEFP,CD119FP,GEOID,GEOIDFQ,NAMELSAD,LSAD,CDSESSN,MTFCC,FUNCSTAT,ALAND,AWATER,INTPTLAT,INTPTLON") fail("TIGER_DBF_LAYOUT");
  const rows = [0, 1].map((index) => {
    const start = 449 + index * 125;
    if (value[start] !== 0x20) fail("TIGER_DBF_DELETED");
    return Object.fromEntries(fields.map((field) => [field.name, value.subarray(start + field.offset, start + field.offset + field.length).toString("ascii").trim()]));
  }).sort((left, right) => String(left.GEOID).localeCompare(String(right.GEOID)));
  if (canonicalJson(rows.map((row) => ({ state: row.STATEFP, district: row.CD119FP, geoid: row.GEOID, session: row.CDSESSN, featureClass: row.MTFCC }))) !== canonicalJson([{ state: "23", district: "01", geoid: "2301", session: "119", featureClass: "G5200" }, { state: "23", district: "02", geoid: "2302", session: "119", featureClass: "G5200" }])) fail("TIGER_DBF_INVENTORY");
  return { stateFips: "23" as const, districts: ["01", "02"] as const, districtCount: 2 as const, dbfMemberSha256: sha(value) };
}

function assertAuthorityText(input: MainePrimaryGeographyAuthoritySourceReceiptInput): void {
  const status = input.ld1739StatusBytes.toString("utf8"), law = collapsed(input.planLawTextBytes.toString("utf8")), current = collapsed(input.currentDistrictStatuteBytes.toString("utf8")), reapportionment = collapsed(input.reapportionmentStatuteBytes.toString("utf8"));
  if (sha(input.ld1739StatusBytes) !== REQUIRED_SOURCES[0]!.sha256 || sha(input.planLawPdfBytes) !== REQUIRED_SOURCES[1]!.sha256 || sha(input.planLawTextBytes) !== REQUIRED_SOURCES[2]!.sha256 || sha(input.currentDistrictStatuteBytes) !== REQUIRED_SOURCES[3]!.sha256 || sha(input.reapportionmentStatuteBytes) !== REQUIRED_SOURCES[4]!.sha256) fail("AUTHORITY_BYTES");
  if (!status.includes("An Act To Reapportion Maine's Congressional Districts") || !status.includes("Final Disposition") || !status.includes("Enacted, Sep 29, 2021") || !status.includes("Governor's Action:") || !status.includes("Signed, Sep 29, 2021") || !status.includes("Chapter 487")) fail("STATUS_AUTHORITY");
  for (const phrase of ["APPROVED", "SEPTEMBER 29, 2021", "CHAPTER", "487", "An Act To Reapportion Maine's Congressional Districts", "for elections beginning in 2022", "This Act applies to the election of Representatives to the United States Congress first occurring in 2022 and thereafter", "First District. Population 681,179.", "Second District. Population 681,180."]) if (!law.includes(phrase)) fail("PLAN_LAW_TEXT");
  if (!current.includes("§1205-A. Congressional districts") || !current.includes("The State is divided into 2 districts for the election of Representatives to the United States Congress") || !current.includes("First District.") || !current.includes("Second District.") || !current.includes("PL 2021, c. 552, Pt. C, §1 (NEW).")) fail("CURRENT_STATUTE");
  if (!reapportionment.includes("§1206. Reapportionment") || !reapportionment.includes("In 2021 and every 10 years thereafter") || !reapportionment.includes("review the existing congressional districts") || !reapportionment.includes("If the districts do not conform to Supreme Judicial Court guidelines, the commission shall reapportion the State into congressional districts.")) fail("REAPPORTIONMENT_STATUTE");
}

function build(input: MainePrimaryGeographyAuthoritySourceReceiptInput) {
  const sources = (exactSourceEntries(input.sourceLock)).map(sourceLockContent);
  const outputMatches = input.sourceLock.entries.filter((entry) => entry.id === MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_V1);
  if (outputMatches.length !== 1 || canonicalJson(sourceLockContent(outputMatches[0])) !== canonicalJson(sourceLockContent({ id: MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_V1, url: "urn:dsa-seats:maine-primary-geography-authority-source-receipt:v1:2022-2026", retainedPath: "data/metadata/maine-primary-geography-authority-source-receipt-v1.json", retainedStatus: "retained", byteSize: MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_BYTES, sha256: MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_FILE_SHA256, kind: "evidence_receipt", parentIds: PARENTS }))) fail("OUTPUT_SOURCE_LOCK");
  assertAuthorityText(input);
  const cd118 = parseAssignments(input.cd118MaineAssignmentsBytes, REQUIRED_SOURCES[6]!.sha256, "GEOID, CDFP");
  const cd119 = parseAssignments(input.cd119MaineAssignmentsBytes, REQUIRED_SOURCES[8]!.sha256, "GEOID,CDFP");
  if (cd118.assignments.size !== cd119.assignments.size || [...cd118.assignments].some(([geoid, district]) => cd119.assignments.get(geoid) !== district) || cd118.assignmentSetSha256 !== cd119.assignmentSetSha256) fail("CD118_CD119_ASSIGNMENTS_DIFFER");
  const censusText = input.censusPlanChangeAuthorityBytes.toString("utf8");
  if (sha(input.censusPlanChangeAuthorityBytes) !== REQUIRED_SOURCES[9]!.sha256 || !censusText.includes("five states (Alabama, Georgia, Louisiana, New York, and North Carolina) that redrew their congressional district plans for the 119th Congress") || censusText.includes("five states (Alabama, Georgia, Louisiana, Maine, and North Carolina)")) fail("CENSUS_PLAN_CHANGE_AUTHORITY");
  const tigerCd119Inventory = inventoryTigerCd119(input.tigerCd119ZipBytes);
  const baseRows = ([2022, 2024, 2026] as const).flatMap((cycleYear) => (["01", "02"] as const).map((districtCode) => {
    const disposition = cycleYear === 2022 ? "official_enacted_plan_and_identical_cd118_cd119_assignment_candidate" as const : cycleYear === 2024 ? "same_cd119_session_assignment_candidate" as const : "state_law_continuing_plan_candidate_without_cd120_census_geometry" as const;
    const evidenceClass = cycleYear === 2022 ? "direct_official_law_and_derived_complete_assignment_identity" as const : cycleYear === 2024 ? "derived_same_complete_cd119_session_assignment" as const : "direct_official_current_law_plan_continuity_without_cd120_geometry" as const;
    const unsigned = { geographyAuthorityObservationId: `me:geography-authority:${cycleYear}:${districtCode}`, cycleYear, districtCode, electionDate: cycleYear === 2022 ? "2022-06-14" as const : cycleYear === 2024 ? "2024-06-11" as const : "2026-06-09" as const, targetCongressSession: "119" as const, historicalCongressSession: cycleYear === 2022 ? "118" as const : cycleYear === 2024 ? "119" as const : "120" as const, disposition, evidenceClass, cd118Cd119AssignmentIdentitySupport: cycleYear === 2022, exactCd119SessionAssignmentSupport: cycleYear === 2024, stateLawPlanContinuitySupport: cycleYear === 2026, compatibilityCandidate: true as const, cd120CensusGeometryRetained: false as const, rawGeometryEqualityAssessed: false as const, sourcePlanToCd119ExactBlockConcordanceAssessed: false as const, approved: false as const, scoreEligible: false as const, evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null } };
    return { ...unsigned, rowSha256: digest("dsa-seats:maine-primary-geography-authority-row:v1\0", unsigned) };
  }));
  const cycleDispositionRows = baseRows.sort((left, right) => left.geographyAuthorityObservationId.localeCompare(right.geographyAuthorityObservationId));
  const cycleDispositionRowSetSha256 = digest("dsa-seats:maine-primary-geography-authority-row-set:v1\0", cycleDispositionRows);
  const unsigned = {
    schema: MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_V1, version: 1 as const, generatedAt: "2026-08-07T10:30:00.000Z" as const, sourceCutoff: "2026-08-07" as const,
    reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    sources, authority: { planLaw: "Maine Public Law 2021, chapter 487" as const, enactedOn: "2021-09-29" as const, appliesBeginning: 2022 as const, currentDistrictStatute: "21-A MRSA §1205-A" as const, reapportionmentStatute: "21-A MRSA §1206" as const, congressionalDistrictCount: 2 as const, planStatus: "enacted_and_signed_official_plan_law" as const },
    censusPlanChangeAuthority: { sourceLockId: PARENTS[9], statesExplicitlyNamedAsRedrawn: ["AL", "GA", "LA", "NY", "NC"] as const, maineExplicitlyExcluded: true as const, inferenceBoundary: "not_named_in_five_state_cd119_redraw_list_is_not_a_raw_geometry_equality_or_cd120_claim" as const },
    blockAssignments: { stateFips: "23" as const, cd118Rows: 47_138 as const, cd119Rows: 47_138 as const, identicalNormalizedAssignments: true as const, districtCounts: { "01": 15_307 as const, "02": 31_831 as const }, assignmentSetSha256: cd118.assignmentSetSha256, historicalHeader: "GEOID, CDFP" as const, currentHeader: "GEOID,CDFP" as const },
    tigerCd119Inventory,
    methodology: { authorityBasis: "enacted_ld1739_public_law_current_statutes_complete_census_block_assignments_census_redraw_scope_and_tiger_cd119_inventory" as const, cycleTreatment: "2022_enacted_plan_plus_identical_cd118_cd119_assignment_2024_same_cd119_session_2026_current_state_law_continuity_without_cd120_census_geometry" as const, assignmentComparison: "complete_normalized_geoid_to_district_assignment_equality_between_retained_cd118_and_cd119_extracts" as const, rawGeometryEqualityAssessed: false as const, sourcePlanToCd119ExactBlockConcordanceAssessed: false as const, stateLawPlanContinuityAssessed: true as const, cd120CensusGeometryAssessed: false as const, automaticDecisionClosure: false as const, evaluatorNumericValues: 0 as const },
    cycleDispositionRows, cycleDispositionRowSetSha256,
    summary: { cycleRows: 6 as const, cd118Cd119SupportableRows: 2 as const, cd119SameSessionSupportableRows: 2 as const, stateLawPlanContinuitySupportableRows: 2 as const, compatibilityCandidateRows: 6 as const, cd120CensusGeometryRows: 0 as const, approvedRows: 0 as const, scoreEligibleRows: 0 as const },
    limitations: ["The exact retained CD118/CD119 block-assignment comparison is a Census assignment comparison, not an assessment of equality between raw TIGER geometries or the enacted plan geometry.", "The Census five-state CD119 redraw list excludes Maine, but does not establish any congressional-district result, candidate identity, election administration, or CD120 conclusion.", "The 2026 state-law plan-continuity candidates rely on the enacted '2022 and thereafter' rule, current codification, and decennial review cadence; no Census CD120 geometry or exact CD120 GEOID is retained or inferred, and no historical-geography approval, score, publication, or deployment follows."] as const,
    unresolvedGates: ["review_historical_district_compatibility", "review_2026_state_law_plan_continuity_without_cd120_census_geometry", "complete_human_data_review_and_publication_approval"] as const,
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:maine-primary-geography-authority-source-receipt:v1\0", unsigned) };
}

export type MainePrimaryGeographyAuthoritySourceReceipt = ReturnType<typeof build>;
export function buildMainePrimaryGeographyAuthoritySourceReceipt(input: MainePrimaryGeographyAuthoritySourceReceiptInput): MainePrimaryGeographyAuthoritySourceReceipt { return build(input); }

export function validateMainePrimaryGeographyAuthoritySourceReceipt(value: MainePrimaryGeographyAuthoritySourceReceipt): MainePrimaryGeographyAuthoritySourceReceipt {
  const { packageSha256, ...unsigned } = value;
  const exactKeys = (candidate: object, keys: readonly string[]) => canonicalJson(Object.keys(candidate).sort()) === canonicalJson([...keys].sort());
  if (!exactKeys(value, ["schema", "version", "generatedAt", "sourceCutoff", "reviewerOnly", "publicationEligible", "review", "sources", "authority", "censusPlanChangeAuthority", "blockAssignments", "tigerCd119Inventory", "methodology", "cycleDispositionRows", "cycleDispositionRowSetSha256", "summary", "limitations", "unresolvedGates", "packageSha256"])) fail("PACKAGE_FIELDS");
  const expectedIds = PARENTS;
  const expectedRows = [[2022, "01", "official_enacted_plan_and_identical_cd118_cd119_assignment_candidate"], [2022, "02", "official_enacted_plan_and_identical_cd118_cd119_assignment_candidate"], [2024, "01", "same_cd119_session_assignment_candidate"], [2024, "02", "same_cd119_session_assignment_candidate"], [2026, "01", "state_law_continuing_plan_candidate_without_cd120_census_geometry"], [2026, "02", "state_law_continuing_plan_candidate_without_cd120_census_geometry"]] as const;
  const rowsValid = value.cycleDispositionRows.length === 6 && value.cycleDispositionRows.every((row, index) => {
    const rowUnsigned = { ...row } as { rowSha256?: string }; delete rowUnsigned.rowSha256;
    const expected = expectedRows[index]!;
    const expectedEvidence = row.cycleYear === 2022 ? "direct_official_law_and_derived_complete_assignment_identity" : row.cycleYear === 2024 ? "derived_same_complete_cd119_session_assignment" : "direct_official_current_law_plan_continuity_without_cd120_geometry";
    const expectedSession = row.cycleYear === 2022 ? "118" : row.cycleYear === 2024 ? "119" : "120";
    const expectedDate = row.cycleYear === 2022 ? "2022-06-14" : row.cycleYear === 2024 ? "2024-06-11" : "2026-06-09";
    return exactKeys(row, ["geographyAuthorityObservationId", "cycleYear", "districtCode", "electionDate", "targetCongressSession", "historicalCongressSession", "disposition", "evidenceClass", "cd118Cd119AssignmentIdentitySupport", "exactCd119SessionAssignmentSupport", "stateLawPlanContinuitySupport", "compatibilityCandidate", "cd120CensusGeometryRetained", "rawGeometryEqualityAssessed", "sourcePlanToCd119ExactBlockConcordanceAssessed", "approved", "scoreEligible", "evaluatorValues", "rowSha256"]) && row.rowSha256 === digest("dsa-seats:maine-primary-geography-authority-row:v1\0", rowUnsigned) && row.geographyAuthorityObservationId === `me:geography-authority:${row.cycleYear}:${row.districtCode}` && row.cycleYear === expected[0] && row.districtCode === expected[1] && row.electionDate === expectedDate && row.targetCongressSession === "119" && row.historicalCongressSession === expectedSession && row.disposition === expected[2] && row.evidenceClass === expectedEvidence && row.cd118Cd119AssignmentIdentitySupport === (row.cycleYear === 2022) && row.exactCd119SessionAssignmentSupport === (row.cycleYear === 2024) && row.stateLawPlanContinuitySupport === (row.cycleYear === 2026) && row.compatibilityCandidate && !row.cd120CensusGeometryRetained && !row.approved && !row.scoreEligible && row.rawGeometryEqualityAssessed === false && row.sourcePlanToCd119ExactBlockConcordanceAssessed === false && canonicalJson(row.evaluatorValues) === canonicalJson({ priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null });
  });
  const expectedAuthority = { planLaw: "Maine Public Law 2021, chapter 487", enactedOn: "2021-09-29", appliesBeginning: 2022, currentDistrictStatute: "21-A MRSA §1205-A", reapportionmentStatute: "21-A MRSA §1206", congressionalDistrictCount: 2, planStatus: "enacted_and_signed_official_plan_law" };
  const expectedCensus = { sourceLockId: PARENTS[9], statesExplicitlyNamedAsRedrawn: ["AL", "GA", "LA", "NY", "NC"], maineExplicitlyExcluded: true, inferenceBoundary: "not_named_in_five_state_cd119_redraw_list_is_not_a_raw_geometry_equality_or_cd120_claim" };
  const expectedAssignments = { stateFips: "23", cd118Rows: 47138, cd119Rows: 47138, identicalNormalizedAssignments: true, districtCounts: { "01": 15307, "02": 31831 }, assignmentSetSha256: "623b804a4699b5d74df42be3d4d7e3b2948a8cdc609b90c6579d90152c327a1f", historicalHeader: "GEOID, CDFP", currentHeader: "GEOID,CDFP" };
  const expectedTiger = { stateFips: "23", districts: ["01", "02"], districtCount: 2, dbfMemberSha256: "21cc2db0b76dea890b77f232b716b1635d4cce9d788b164ea88a4194f2b2f663" };
  const expectedMethodology = { authorityBasis: "enacted_ld1739_public_law_current_statutes_complete_census_block_assignments_census_redraw_scope_and_tiger_cd119_inventory", cycleTreatment: "2022_enacted_plan_plus_identical_cd118_cd119_assignment_2024_same_cd119_session_2026_current_state_law_continuity_without_cd120_census_geometry", assignmentComparison: "complete_normalized_geoid_to_district_assignment_equality_between_retained_cd118_and_cd119_extracts", rawGeometryEqualityAssessed: false, sourcePlanToCd119ExactBlockConcordanceAssessed: false, stateLawPlanContinuityAssessed: true, cd120CensusGeometryAssessed: false, automaticDecisionClosure: false, evaluatorNumericValues: 0 };
  const expectedLimitations = ["The exact retained CD118/CD119 block-assignment comparison is a Census assignment comparison, not an assessment of equality between raw TIGER geometries or the enacted plan geometry.", "The Census five-state CD119 redraw list excludes Maine, but does not establish any congressional-district result, candidate identity, election administration, or CD120 conclusion.", "The 2026 state-law plan-continuity candidates rely on the enacted '2022 and thereafter' rule, current codification, and decennial review cadence; no Census CD120 geometry or exact CD120 GEOID is retained or inferred, and no historical-geography approval, score, publication, or deployment follows."];
  const expectedGates = ["review_historical_district_compatibility", "review_2026_state_law_plan_continuity_without_cd120_census_geometry", "complete_human_data_review_and_publication_approval"];
  if (value.schema !== MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_V1 || value.version !== 1 || value.generatedAt !== "2026-08-07T10:30:00.000Z" || value.sourceCutoff !== "2026-08-07" || !value.reviewerOnly || value.publicationEligible || canonicalJson(value.review) !== canonicalJson({ status: "proposed", reviewer: null, reviewedAt: null, resolution: null }) || canonicalJson(value.sources) !== canonicalJson(REQUIRED_SOURCES) || canonicalJson(value.sources.map((entry) => entry.id)) !== canonicalJson(expectedIds) || canonicalJson(value.authority) !== canonicalJson(expectedAuthority) || canonicalJson(value.censusPlanChangeAuthority) !== canonicalJson(expectedCensus) || canonicalJson(value.blockAssignments) !== canonicalJson(expectedAssignments) || canonicalJson(value.tigerCd119Inventory) !== canonicalJson(expectedTiger) || canonicalJson(value.methodology) !== canonicalJson(expectedMethodology) || !rowsValid || value.cycleDispositionRowSetSha256 !== digest("dsa-seats:maine-primary-geography-authority-row-set:v1\0", value.cycleDispositionRows) || canonicalJson(value.summary) !== canonicalJson({ cycleRows: 6, cd118Cd119SupportableRows: 2, cd119SameSessionSupportableRows: 2, stateLawPlanContinuitySupportableRows: 2, compatibilityCandidateRows: 6, cd120CensusGeometryRows: 0, approvedRows: 0, scoreEligibleRows: 0 }) || canonicalJson(value.limitations) !== canonicalJson(expectedLimitations) || canonicalJson(value.unresolvedGates) !== canonicalJson(expectedGates) || packageSha256 !== digest("dsa-seats:maine-primary-geography-authority-source-receipt:v1\0", unsigned) || value.cycleDispositionRowSetSha256 !== MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_SET_SHA256 || packageSha256 !== MAINE_PRIMARY_GEOGRAPHY_AUTHORITY_SOURCE_RECEIPT_PACKAGE_SHA256) fail("PACKAGE_INVARIANT");
  return value;
}
