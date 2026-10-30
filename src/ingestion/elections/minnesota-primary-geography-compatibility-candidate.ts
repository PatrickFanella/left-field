import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import { validateMinnesotaPrimaryReceipt, type MinnesotaPrimaryReceipt } from "./minnesota-house-democratic-primary-results-receipt";
import { validateMinnesotaPrimaryIdentityCandidate, type MinnesotaPrimaryIdentityCandidate } from "./minnesota-current-incumbent-primary-linkage-candidate";

const INPUTS = {
  proposalFile: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1", proposalPackage: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb",
  receiptFile: "8ccf5fb90e7851e62a953a3e211db55fad0e5891b9178ff8186de0abf5b827d2", receiptPackage: "336094811277f867f5370b53f7b8568733a73a3d2c45b7fa4e5faa3071866e84",
  identityFile: "fd010c1e43a61f6973154e0bf1ffb0e7259c089cea56700158387888a54dd234", identityPackage: "77baabd12581f1880c811dc75ab77a79481ca9a5388a920f5ca30cc85b0c3a61",
  authorityFile: "66a0551a6c3c6432bff0a6a6db23f221fbe02ead1d15221d7050633898914670",
  cd118File: "4d466968af5759e647552ff99943773dbcde5b6317d4f2d2affa8ed12e09a652", cd118Dbf: "e1ca8fffc724a9fab808971f1ccff1c23df71d574608e14d87c7470e0166a13e",
  cd119File: "4b7a969ad818b03cda1dc8294b6d945280d6e5ac4771aed03d8548aa1dae69f7", cd119Dbf: "463a030370f56b728d0abce98e9a1fb7df47a025ff20d3246ea0b12f56cc26f3",
} as const;
export const MINNESOTA_PRIMARY_GEOGRAPHY_V1 = "minnesota-primary-geography-compatibility-candidate-v1" as const;
export const MINNESOTA_PRIMARY_GEOGRAPHY_SOURCE_SET_SHA256 = "6a682ec471e01c243790214adee8812ea4f7cd242379610b227721b387fff0e3" as const;
export const MINNESOTA_PRIMARY_GEOGRAPHY_PARENT_PROJECTION_SHA256 = "a02996d76b538d2924d93fd0eaec64e9295bfe4d3e5ea1e7a8538a12c3d90100" as const;
export const MINNESOTA_PRIMARY_GEOGRAPHY_ROW_SET_SHA256 = "3404b652381d8316340e18f69dbdf06538da6fa46977e35bee225e49d0cbab0b" as const;
export const MINNESOTA_PRIMARY_GEOGRAPHY_PACKAGE_SHA256 = "81b0592927b90c9903ada7d65111134e00aa8e507395125e01c6f6131ceabb81" as const;
export const MINNESOTA_PRIMARY_GEOGRAPHY_OUTPUT_FILE_SHA256 = "5fa89511fb4453ff7dcfcc3684ed7af6cbb51ce12d360a98d7a54f50caedab23" as const;
export const MINNESOTA_PRIMARY_GEOGRAPHY_OUTPUT_BYTE_SIZE = 16_047 as const;
const SOURCE_IDS = ["house-democratic-primary-source-selection-proposal-20260804-v1", "minnesota-house-democratic-primary-results-2022-2026-v1", "minnesota-current-incumbent-primary-linkage-candidate-v1", "census-cd119-plan-change-authority-20260805", "tiger-cd118-27", "tiger-cd119-27"] as const;
const SOURCE_EXPECTED = [
  [SOURCE_IDS[0], "urn:dsa-seats:house-democratic-primary-source-selection-proposal:v1:2026-08-04", "data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json", 411_793, INPUTS.proposalFile, "review_proposal", ["dsa-target-factual-projection-20260804-v1", "dsa-target-incumbent-roster-20260804-v1", "fec-2026-congressional-primary-dates", "geo-national-cd119"]],
  [SOURCE_IDS[1], "urn:dsa-seats:minnesota-house-democratic-primary-results:v1:2022-2026", "data/metadata/minnesota-house-democratic-primary-results-2022-2026-v1.json", 30_489, INPUTS.receiptFile, "review_evidence_receipt", ["house-democratic-primary-source-selection-proposal-20260804-v1", "mn-2022-primary-results-landing", "mn-2022-primary-media-files-index", "mn-2022-primary-ushouse-results", "mn-2022-primary-candidate-table", "mn-2022-state-primary-canvass-document-record", "mn-2024-primary-results-landing", "mn-2024-primary-ushouse-results", "mn-2024-primary-candidate-table", "mn-2024-primary-media-file-layout", "mn-2024-state-primary-canvass-document-record", "mn-primary-date-and-omission-statute-204d03-20260806"]],
  [SOURCE_IDS[2], "urn:dsa-seats:minnesota-current-incumbent-primary-linkage-candidate:v1:2022-2024", "data/metadata/minnesota-current-incumbent-primary-linkage-candidate-v1.json", 15_485, INPUTS.identityFile, "review_candidate", ["dsa-target-incumbent-roster-20260804-v1", "house-democratic-primary-source-selection-proposal-20260804-v1", "house-xml", "congress-legislators-current-20260804", "minnesota-house-democratic-primary-results-2022-2026-v1"]],
  [SOURCE_IDS[3], "https://www.census.gov/geographies/mapping-files/2025/dec/rdo/119-congressional-district-bef.html", "data/source/elections/primary-results/geography/census-119-congressional-district-bef.html", 324_827, INPUTS.authorityFile, "source", []],
  [SOURCE_IDS[4], "https://www2.census.gov/geo/tiger/TIGER2022/CD/tl_2022_27_cd118.zip", "data/source/tiger2022/tl_2022_27_cd118.zip", 1_417_044, INPUTS.cd118File, "source", []],
  [SOURCE_IDS[5], "https://www2.census.gov/geo/tiger/TIGER2025/CD/tl_2025_27_cd119.zip", "data/source/tiger2025/tl_2025_27_cd119.zip", 862_757, INPUTS.cd119File, "source", []],
] as const;

type Input = Readonly<{ proposal: unknown; proposalFileSha256: string; receipt: MinnesotaPrimaryReceipt; receiptFileSha256: string; identity: MinnesotaPrimaryIdentityCandidate; identityFileSha256: string; authorityHtml: string; authorityFileSha256: string; cd118Zip: Buffer; cd118FileSha256: string; cd118Dbf: Buffer; cd119Zip: Buffer; cd119FileSha256: string; cd119Dbf: Buffer; sourceLock: unknown }>;
const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (code: string): never => { throw new Error(`Minnesota primary geography rejected: ${code}`); };

function inventory(bytes: Buffer, session: "118" | "119"): Array<{ session: string; geoid: string }> {
  if (bytes.length < 65 || bytes[0] !== 3) fail("DBF_INVALID");
  const count = bytes.readUInt32LE(4), header = bytes.readUInt16LE(8), record = bytes.readUInt16LE(10);
  const fields: Array<{ name: string; length: number; offset: number }> = [];
  let recordOffset = 1;
  for (let cursor = 32; cursor + 32 <= header && bytes[cursor] !== 13; cursor += 32) {
    const name = bytes.subarray(cursor, cursor + 11).toString("ascii").replace(/\0.*$/, "").trim(), length = bytes[cursor + 16]!;
    if (!name || length < 1) fail("DBF_INVALID");
    fields.push({ name, length, offset: recordOffset }); recordOffset += length;
  }
  if (count !== 8 || header + count * record > bytes.length || recordOffset !== record || bytes[header - 1] !== 13) fail("DBF_CLOSURE_INVALID");
  const old = session === "118", stateField = old ? "STATEFP20" : "STATEFP", geoidField = old ? "GEOID20" : "GEOID", districtField = old ? "CD118FP" : "CD119FP";
  const rows = Array.from({ length: count }, (_, index) => {
    const start = header + index * record;
    if (bytes[start] !== 32) fail("DBF_INVALID");
    const row = Object.fromEntries(fields.map((field) => [field.name, bytes.subarray(start + field.offset, start + field.offset + field.length).toString("ascii").trim()]));
    return { session, state: row[stateField], geoid: row[geoidField] ?? "", district: row[districtField], sourceSession: row.CDSESSN };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.geoid), Buffer.from(right.geoid)));
  if (rows.some((row, index) => { const district = String(index + 1).padStart(2, "0"); return row.state !== "27" || row.geoid !== `27${district}` || row.district !== district || row.sourceSession !== session; })) fail("DBF_INVENTORY_INVALID");
  return rows.map(({ geoid }) => ({ session, geoid }));
}

export function buildMinnesotaPrimaryGeographyCandidate(input: Input) {
  const actual = [input.proposalFileSha256, input.receiptFileSha256, input.identityFileSha256, input.authorityFileSha256, sha256(input.authorityHtml), input.cd118FileSha256, sha256(input.cd118Zip), sha256(input.cd118Dbf), input.cd119FileSha256, sha256(input.cd119Zip), sha256(input.cd119Dbf)];
  const expected = [INPUTS.proposalFile, INPUTS.receiptFile, INPUTS.identityFile, INPUTS.authorityFile, INPUTS.authorityFile, INPUTS.cd118File, INPUTS.cd118File, INPUTS.cd118Dbf, INPUTS.cd119File, INPUTS.cd119File, INPUTS.cd119Dbf];
  if (actual.some((value, index) => value !== expected[index])) fail("INPUT_HASH_MISMATCH");
  const proposal = validateHouseDemocraticPrimarySourceSelectionProposal(input.proposal), receipt = validateMinnesotaPrimaryReceipt(input.receipt), identity = validateMinnesotaPrimaryIdentityCandidate(input.identity);
  if (proposal.packageSha256 !== INPUTS.proposalPackage || receipt.packageSha256 !== INPUTS.receiptPackage || identity.packageSha256 !== INPUTS.identityPackage || proposal.decisions.find((decision) => decision.decisionId === "approve-historical-district-cd119-compatibility-v1")?.resolution !== null) fail("PARENT_INVALID");
  const authorityPhrase = "five states (Alabama, Georgia, Louisiana, New York, and North Carolina) that redrew their congressional district plans for the 119th Congress";
  if (!input.authorityHtml.includes(authorityPhrase) || input.authorityHtml.includes("five states (Alabama, Minnesota")) fail("AUTHORITY_INVALID");
  const keys = new Set([...inventory(input.cd118Dbf, "118"), ...inventory(input.cd119Dbf, "119")].map((row) => `${row.session}:${row.geoid}`));
  const lock = input.sourceLock as { entries?: Array<{ id?: string; url?: string; retainedPath?: string; retainedStatus?: string; byteSize?: number; sha256?: string; kind?: string; parentIds?: string[] }> };
  if (!Array.isArray(lock.entries)) fail("SOURCE_LOCK_MISMATCH");
  const lockEntries = lock.entries ?? fail("SOURCE_LOCK_MISMATCH");
  const sources = (SOURCE_EXPECTED.map(([id, url, path, byteSize, hash, kind, parents]) => {
    const matches = lockEntries.filter((entry) => entry.id === id), entry = matches[0];
    if (matches.length !== 1 || entry?.url !== url || entry.retainedPath !== path || entry.retainedStatus !== "retained" || entry.byteSize !== byteSize || entry.sha256 !== hash || entry.kind !== kind || canonicalJson(entry.parentIds) !== canonicalJson(parents)) fail("SOURCE_LOCK_MISMATCH");
    return entry;
  })).map(sourceLockContent);
  const outputMatches = lockEntries.filter((entry) => entry.id === MINNESOTA_PRIMARY_GEOGRAPHY_V1), output = outputMatches[0];
  if (outputMatches.length !== 1 || output?.url !== "urn:dsa-seats:minnesota-primary-geography-compatibility-candidate:v1:2022-2024" || output.retainedPath !== "data/metadata/minnesota-primary-geography-compatibility-candidate-v1.json" || output.retainedStatus !== "retained" || output.byteSize !== MINNESOTA_PRIMARY_GEOGRAPHY_OUTPUT_BYTE_SIZE || output.sha256 !== MINNESOTA_PRIMARY_GEOGRAPHY_OUTPUT_FILE_SHA256 || output.kind !== "review_candidate" || canonicalJson(output.parentIds) !== canonicalJson(SOURCE_IDS)) fail("SOURCE_LOCK_MISMATCH");
  const rows = identity.observations.map((observation) => {
    const historicalCongressSession = observation.cycleYear === 2022 ? "118" as const : "119" as const, geoid = `27${observation.districtCode}`;
    if (!keys.has(`${historicalCongressSession}:${geoid}`) || !keys.has(`119:${geoid}`)) fail("GEOGRAPHY_KEY_MISSING");
    const unsigned = {
      observationId: `mn:geography:${observation.cycleYear}:${observation.districtCode}`,
      identityObservationId: observation.observationId, identityRowSha256: observation.rowSha256, identityStatus: observation.identityStatus,
      contestId: observation.sourceContestId, contestSha256: observation.sourceContestSha256,
      resultAuthorityStatus: observation.resultAuthorityStatus,
      certificationStatus: observation.certificationStatus,
      sourceWinnerStatus: observation.sourceContestId === null ? "not_applicable_no_reported_contest" as const : observation.sourceWinnerStatus,
      cycleYear: observation.cycleYear, seatCycleId: observation.seatCycleId, districtCode: observation.districtCode,
      targetCd119Geoid: geoid, historicalCongressSession, historicalGeoid: geoid,
      compatibilityDisposition: observation.cycleYear === 2022 ? "official_no_plan_change_declaration_same_geoid_key_candidate" as const : "same_cd119_session_and_geoid_exact_key_candidate" as const,
      evidenceClass: observation.cycleYear === 2022 ? "direct_official_plan_continuity_and_derived_key" as const : "derived_exact_session_and_key" as const,
      confidence: "high" as const, compatibilityCandidate: true as const, compatibilityApproved: false as const, identityApproved: false as const,
      identityDispositionPreserved: true as const, evaluatorUse: "excluded_pending_identity_historical_geography_disposition_review_and_publication_approval" as const, scoreEligible: false as const,
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:mn-primary-geography-row:v1\0", unsigned) };
  });
  const summary = { identityRows: 8 as const, identityProposedLinks: 5 as const, identitySourceAbsentRows: 3 as const, cd118ToCd119PlanContinuityCandidates: 4 as const, exactCd119SessionKeyCandidates: 4 as const, numberedDistrictsPerRetainedLayer: 8 as const, specialDistrictRowsPerRetainedLayer: 0 as const, compatibilityCandidates: 8 as const, automaticallyApprovedRows: 0 as const, scoreEligibleRows: 0 as const };
  const parentProjection = rows.map((row) => { const copy = structuredClone(row) as Partial<typeof row>; delete copy.rowSha256; return copy; });
  const parentProjectionSha256 = digest("dsa-seats:mn-primary-geography-parent-projection:v1\0", parentProjection);
  const unsigned = {
    schema: MINNESOTA_PRIMARY_GEOGRAPHY_V1, version: 1 as const, generatedAt: "2026-08-06T22:00:00.000Z" as const, sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    decisionId: "approve-historical-district-cd119-compatibility-v1" as const, decisionResolution: null,
    sources, sourceSetSha256: digest("dsa-seats:mn-primary-geography-source-set:v1\0", sources),
    methodology: { rawTigerGeometryEqualityAssessed: false as const, overlapThresholdUsed: false as const, populationEquivalenceAssessed: false as const, future2026Rows: 0 as const },
    summary, parentProjectionSha256, rows, rowSetSha256: digest("dsa-seats:mn-primary-geography-row-set:v1\0", rows),
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:mn-primary-geography-package:v1\0", unsigned) };
}

export type MinnesotaPrimaryGeographyCandidate = ReturnType<typeof buildMinnesotaPrimaryGeographyCandidate>;
export function validateMinnesotaPrimaryGeographyCandidate(value: MinnesotaPrimaryGeographyCandidate): MinnesotaPrimaryGeographyCandidate {
  if (value.schema !== MINNESOTA_PRIMARY_GEOGRAPHY_V1 || value.version !== 1 || value.generatedAt !== "2026-08-06T22:00:00.000Z" || value.sourceCutoff !== "2026-08-06" || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null || value.decisionResolution !== null || value.rows.length !== 8) fail("LIFECYCLE_INVALID");
  if (value.rows.some((row) => { const unsigned = structuredClone(row) as Omit<typeof row, "rowSha256"> & { rowSha256?: string }; delete unsigned.rowSha256; return row.rowSha256 !== digest("dsa-seats:mn-primary-geography-row:v1\0", unsigned) || !row.compatibilityCandidate || row.compatibilityApproved || row.identityApproved || !row.identityDispositionPreserved || row.scoreEligible; })) fail("ROW_INVALID");
  const summary = { identityRows: 8, identityProposedLinks: 5, identitySourceAbsentRows: 3, cd118ToCd119PlanContinuityCandidates: 4, exactCd119SessionKeyCandidates: 4, numberedDistrictsPerRetainedLayer: 8, specialDistrictRowsPerRetainedLayer: 0, compatibilityCandidates: 8, automaticallyApprovedRows: 0, scoreEligibleRows: 0 };
  const projection = value.rows.map((row) => { const copy = structuredClone(row) as Partial<typeof row>; delete copy.rowSha256; return copy; });
  const unsigned = structuredClone(value) as Partial<MinnesotaPrimaryGeographyCandidate>; delete unsigned.packageSha256;
  if (canonicalJson(value.summary) !== canonicalJson(summary) || value.sourceSetSha256 !== digest("dsa-seats:mn-primary-geography-source-set:v1\0", value.sources) || value.sourceSetSha256 !== MINNESOTA_PRIMARY_GEOGRAPHY_SOURCE_SET_SHA256 || value.parentProjectionSha256 !== digest("dsa-seats:mn-primary-geography-parent-projection:v1\0", projection) || value.parentProjectionSha256 !== MINNESOTA_PRIMARY_GEOGRAPHY_PARENT_PROJECTION_SHA256 || value.rowSetSha256 !== digest("dsa-seats:mn-primary-geography-row-set:v1\0", value.rows) || value.rowSetSha256 !== MINNESOTA_PRIMARY_GEOGRAPHY_ROW_SET_SHA256 || value.packageSha256 !== digest("dsa-seats:mn-primary-geography-package:v1\0", unsigned) || value.packageSha256 !== MINNESOTA_PRIMARY_GEOGRAPHY_PACKAGE_SHA256) fail("PACKAGE_INVALID");
  return value;
}
