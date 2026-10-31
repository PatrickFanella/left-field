import type { StateChamber } from "./state-legislative-roster";
import { readStateLegislativeRoster } from "./state-legislative-roster";
import { readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { US_STATE_NAMES } from "./us-states";
import { IDAHO_HOUSE_AUTHORITY_IDS, verifyIdahoHouseSeatAuthority } from "./idaho-house-seat-authority";

/**
 * An exact mapping from an OpenStates role identifier to an OCD division.
 *
 * This mapping identifies source labels only. It does not establish that a
 * current roster district and an earlier election district have the same
 * boundaries: that requires plan/version or geometry evidence outside this
 * crosswalk.
 */
export interface OcdOpenStatesRoleMapping {
  readonly divisionId: string;
  readonly openStatesDistrict: string;
}

export type OcdDivisionMatch =
  | Readonly<{ status: "mapped"; divisionId: string; openStatesDistrict: string }>
  | Readonly<{ status: "unmapped"; openStatesDistrict: string }>
  | Readonly<{ status: "ambiguous"; openStatesDistrict: string; divisionIds: readonly string[] }>;

export type OcdLabelMatchMethod = "exact" | "normalized" | "unmapped" | "ambiguous";

export interface StateSeatIdentityInput {
  readonly stateCode: string;
  readonly chamber: StateChamber;
  /** Preserve the publisher's label exactly; this is not a district-key normalizer. */
  readonly district: string;
  /** A separately elected seat in the same district; never used as a division suffix. */
  readonly seatSlot: number;
}

export type StateSeatOcdDivisionMatch = OcdDivisionMatch & Readonly<{
  stateCode: string;
  chamber: StateChamber;
  district: string;
  seatSlot: number;
  /** Exact source label first; conservative case/separator normalization only as a fallback. */
  labelMatchMethod: OcdLabelMatchMethod;
}>;

export type StateLegislativeOcdCrosswalkRow = StateSeatOcdDivisionMatch & Readonly<{
  readonly seatId: string;
  readonly openStatesId: string;
  /** OCD role mappings do not carry plan dates or geometry. */
  readonly planCompatibility: "unreviewed";
  readonly districtSeatPosition?: "A" | "B";
}>;

export interface StateLegislativeOcdCrosswalkChamberSummary {
  readonly stateCode: string;
  readonly chamber: StateChamber;
  readonly seats: number;
  readonly mapped: number;
  readonly exact: number;
  readonly normalized: number;
  readonly unmapped: number;
  readonly ambiguous: number;
  readonly additionalMultiMemberSlots: number;
  readonly planCompatibility: "unreviewed";
}

export interface StateLegislativeOcdCrosswalk {
  readonly schema: "state-legislative-ocd-crosswalk-v1";
  readonly version: 1;
  readonly methodology: Readonly<{
    identity: "exact_then_conservative_normalized_openstates_role_label_to_ocd_division";
    planCompatibility: "unreviewed";
    historicalGeography: "not_inferred_from_identifier_equality";
    idahoHouseAuthoritySourceIds: readonly string[];
  }>;
  readonly source: Readonly<{
    repository: "https://github.com/opencivicdata/ocd-division-ids";
    revision: "f1ab837759a241279c66b066d2fc40190a0eb3de";
    license: "CC0-1.0";
    retainedDirectory: "data/source/identity/ocd/ocd-division-ids-f1ab837";
  }>;
  readonly roster: Readonly<{ schema: "state-legislative-roster-v1"; packageSha256: string; snapshotDate: string }>;
  readonly chambers: readonly StateLegislativeOcdCrosswalkChamberSummary[];
  readonly rows: readonly StateLegislativeOcdCrosswalkRow[];
}

const fail = (code: string): never => { throw new Error(`STATE_LEG_OCD_${code}`); };
const RETAINED_DIRECTORY = "data/source/identity/ocd/ocd-division-ids-f1ab837";
const OCD_REPOSITORY = "https://github.com/opencivicdata/ocd-division-ids";
const OCD_REVISION = "f1ab837759a241279c66b066d2fc40190a0eb3de";
const OCD_RAW_BASE_URL = `https://raw.githubusercontent.com/opencivicdata/ocd-division-ids/${OCD_REVISION}`;
const OCD_LICENSE_SOURCE_ID = "ocd-division-ids-license-openstates-f1ab837";
const UNICAMERAL_OPENSTATES_ROLE: Readonly<Record<string, "upper">> = { DC: "upper", NE: "upper" };

/**
 * Parse the two-column Open Civic Data/OpenStates mapping file. The published
 * artifact contains unquoted values; reject unexpected CSV rather than
 * silently applying a lossy parser to an identity crosswalk.
 */
export function parseOcdOpenStatesRoleCsv(text: string): readonly OcdOpenStatesRoleMapping[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line !== "");
  if (lines[0] !== "id,openstates_district") fail("CSV_HEADER_INVALID");
  return lines.slice(1).map((line, index) => {
    const cells = line.split(",");
    if (cells.length !== 2 || !cells[0] || !cells[1] || cells.some((cell) => cell.includes('"'))) fail(`CSV_ROW_INVALID:${index + 2}`);
    const [divisionId, openStatesDistrict] = cells;
    if (!divisionId!.startsWith("ocd-division/")) fail(`DIVISION_ID_INVALID:${index + 2}`);
    return { divisionId: divisionId!, openStatesDistrict: openStatesDistrict! };
  });
}

/** Resolve only an exact source identifier; no whitespace, case, or numeric coercion is applied. */
export function matchExactOcdDivision(
  openStatesDistrict: string,
  mappings: readonly OcdOpenStatesRoleMapping[],
): OcdDivisionMatch {
  const divisionIds = [...new Set(mappings.filter((mapping) => mapping.openStatesDistrict === openStatesDistrict).map((mapping) => mapping.divisionId))].sort();
  if (divisionIds.length === 0) return { status: "unmapped", openStatesDistrict };
  if (divisionIds.length === 1) return { status: "mapped", openStatesDistrict, divisionId: divisionIds[0]! };
  return { status: "ambiguous", openStatesDistrict, divisionIds };
}

/**
 * OpenStates' role mapping names state chambers `lower`, `upper`, and
 * `legislature`. This helper preserves the source district label and returns
 * an unmapped result for labels that the retained mapping does not contain.
 */
export function openStatesDistrictId({ stateCode, chamber, district }: StateSeatIdentityInput): string {
  const chamberPart = chamber === "unicameral" ? (UNICAMERAL_OPENSTATES_ROLE[stateCode] ?? fail(`UNICAMERAL_ROLE_UNSUPPORTED:${stateCode}`)) : chamber;
  return `${stateCode.toLowerCase()}-${chamberPart}-${district}`;
}

/** Normalize case, separators, and numeric padding; retain words and letter suffixes. */
export function normalizedOpenStatesDistrictId(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").split("-").map((part) => {
    const match = part.match(/^0*(\d+)([a-z]*)$/);
    return match ? `${Number(match[1])}${match[2]}` : part;
  }).join("-");
}

function matchCandidates(openStatesDistrict: string, candidates: readonly OcdOpenStatesRoleMapping[]): OcdDivisionMatch {
  const divisionIds = [...new Set(candidates.map((mapping) => mapping.divisionId))].sort();
  if (divisionIds.length === 0) return { status: "unmapped", openStatesDistrict };
  if (divisionIds.length === 1) return { status: "mapped", openStatesDistrict, divisionId: divisionIds[0]! };
  return { status: "ambiguous", openStatesDistrict, divisionIds };
}

function normalizedCandidates(openStatesDistrict: string, mappings: readonly OcdOpenStatesRoleMapping[]): readonly OcdOpenStatesRoleMapping[] {
  const normalized = normalizedOpenStatesDistrictId(openStatesDistrict);
  const direct = mappings.filter((mapping) => normalizedOpenStatesDistrictId(mapping.openStatesDistrict) === normalized);
  if (direct.length > 0) return direct;
  if (normalized.startsWith("nh-lower-")) {
    // NH roster labels omit the explicit `County No.` words used in the pinned OpenStates roles.
    return mappings.filter((mapping) => normalizedOpenStatesDistrictId(mapping.openStatesDistrict.replace("-county-no-", "-")) === normalized);
  }
  if (normalized.startsWith("dc-upper-ward-")) {
    // The roster spells ward labels; the pinned OpenStates role labels carry just the ward number.
    return mappings.filter((mapping) => normalizedOpenStatesDistrictId(mapping.openStatesDistrict) === normalized.replace("-ward-", "-"));
  }
  if (normalized.startsWith("sc-lower-")) {
    // The pinned SC roles prefix House district numbers with `hd-`.
    return mappings.filter((mapping) => normalizedOpenStatesDistrictId(mapping.openStatesDistrict).replace("sc-lower-hd-", "sc-lower-") === normalized);
  }
  const idaho = /^id-lower-([1-9]|[12]\d|3[0-5])[ab]$/.exec(normalized);
  if (idaho) {
    // Idaho positions A/B elect separate members from the entire shared district.
    return mappings.filter((mapping) => normalizedOpenStatesDistrictId(mapping.openStatesDistrict) === `id-lower-${idaho[1]}`);
  }
  return [];
}

export function matchStateSeatOcdDivision(
  seat: StateSeatIdentityInput,
  mappings: readonly OcdOpenStatesRoleMapping[],
): StateSeatOcdDivisionMatch {
  const openStatesDistrict = openStatesDistrictId(seat);
  const exact = matchExactOcdDivision(openStatesDistrict, mappings);
  const match = exact.status === "unmapped" ? matchCandidates(openStatesDistrict, normalizedCandidates(openStatesDistrict, mappings)) : exact;
  const labelMatchMethod: OcdLabelMatchMethod = exact.status === "mapped" ? "exact" : match.status === "mapped" ? "normalized" : match.status;
  return {
    ...match,
    stateCode: seat.stateCode,
    chamber: seat.chamber,
    district: seat.district,
    seatSlot: seat.seatSlot,
    labelMatchMethod,
  };
}

const sourceIdForState = (stateCode: string): string => `ocd-division-ids-${stateCode.toLowerCase()}-openstates-f1ab837`;

function verifiedOcdSource(
  input: Readonly<{ id: string; url: string; retainedPath: string }>,
  lock: SourceLock,
  root: string,
): Buffer {
  const { entry, bytes } = readRetainedSource(lock, input.id, root);
  if (entry.url !== input.url || entry.retainedPath !== input.retainedPath) fail(`SOURCE_PIN_MISMATCH:${input.id}`);
  return bytes;
}

function mappingsForState(root: string, lock: SourceLock, stateCode: string): readonly OcdOpenStatesRoleMapping[] {
  const filename = `state-${stateCode.toLowerCase()}-openstates.csv`;
  const bytes = verifiedOcdSource({
    id: sourceIdForState(stateCode),
    url: `${OCD_RAW_BASE_URL}/identifiers/country-us/openstates/${filename}`,
    retainedPath: `${RETAINED_DIRECTORY}/${filename}`,
  }, lock, root);
  return parseOcdOpenStatesRoleCsv(bytes.toString("utf8"));
}

function verifyOcdLicense(root: string, lock: SourceLock): void {
  const bytes = verifiedOcdSource({
    id: OCD_LICENSE_SOURCE_ID,
    url: `${OCD_RAW_BASE_URL}/LICENSE.md`,
    retainedPath: `${RETAINED_DIRECTORY}/LICENSE.md`,
  }, lock, root);
  if (!bytes.toString("utf8").startsWith("All copyright and related rights are waived worldwide through the CC0 1.0 Universal")) fail("LICENSE_CONTENT_INVALID");
}

/**
 * Creates a review-only crosswalk from the frozen roster artifact. The output
 * intentionally leaves score and roster artifacts untouched, and labels every
 * mapped identifier as plan compatibility unreviewed.
 */
export function buildStateLegislativeOcdCrosswalk(root = process.cwd(), lock: SourceLock = readSourceLock(root)): StateLegislativeOcdCrosswalk {
  const roster = readStateLegislativeRoster(root, lock);
  verifyOcdLicense(root, lock);
  verifyIdahoHouseSeatAuthority(root, lock);
  const stateCodes = Object.keys(US_STATE_NAMES).sort();
  const available = new Map(stateCodes.map((stateCode) => [stateCode, mappingsForState(root, lock, stateCode)]));
  const rows = roster.rows.map((seat): StateLegislativeOcdCrosswalkRow => ({
    ...matchStateSeatOcdDivision(seat, available.get(seat.stateCode) ?? fail(`STATE_MAPPING_MISSING:${seat.stateCode}`)),
    seatId: seat.seatId,
    openStatesId: seat.openStatesId,
    planCompatibility: "unreviewed",
    ...(seat.stateCode === "ID" && seat.chamber === "lower" && /^[1-9]\d?[AB]$/.test(seat.district) ? { districtSeatPosition: seat.district.slice(-1) as "A" | "B" } : {}),
  })).sort((left, right) => left.seatId.localeCompare(right.seatId));
  if (new Set(rows.map((row) => row.seatId)).size !== rows.length) fail("SEAT_ID_DUPLICATE");
  const chamberGroups = new Map<string, StateLegislativeOcdCrosswalkRow[]>();
  for (const row of rows) {
    const key = `${row.stateCode}|${row.chamber}`;
    chamberGroups.set(key, [...(chamberGroups.get(key) ?? []), row]);
  }
  const chambers = [...chamberGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, chamberRows]) => {
    const first = chamberRows[0] ?? fail(`CHAMBER_SUMMARY_INVALID:${key}`);
    return {
      stateCode: first.stateCode,
      chamber: first.chamber,
      seats: chamberRows.length,
      mapped: chamberRows.filter((row) => row.status === "mapped").length,
      exact: chamberRows.filter((row) => row.labelMatchMethod === "exact").length,
      normalized: chamberRows.filter((row) => row.labelMatchMethod === "normalized").length,
      unmapped: chamberRows.filter((row) => row.status === "unmapped").length,
      ambiguous: chamberRows.filter((row) => row.status === "ambiguous").length,
      additionalMultiMemberSlots: chamberRows.filter((row) => row.seatSlot > 1).length,
      planCompatibility: "unreviewed" as const,
    };
  });
  if (chambers.length !== roster.summary.chambers) fail("CHAMBER_COVERAGE_INCOMPLETE");
  return {
    schema: "state-legislative-ocd-crosswalk-v1",
    version: 1,
    methodology: {
      identity: "exact_then_conservative_normalized_openstates_role_label_to_ocd_division",
      planCompatibility: "unreviewed",
      historicalGeography: "not_inferred_from_identifier_equality",
      idahoHouseAuthoritySourceIds: IDAHO_HOUSE_AUTHORITY_IDS,
    },
    source: {
      repository: OCD_REPOSITORY,
      revision: OCD_REVISION,
      license: "CC0-1.0",
      retainedDirectory: RETAINED_DIRECTORY,
    },
    roster: { schema: roster.schema, packageSha256: roster.packageSha256, snapshotDate: roster.snapshotDate },
    chambers,
    rows,
  };
}

/** Top-level evidence remains readable while each of thousands of rows stays on one deterministic line. */
export function serializeStateLegislativeOcdCrosswalk(value: StateLegislativeOcdCrosswalk): string {
  const section = (key: string, item: unknown): string => `  ${JSON.stringify(key)}: ${JSON.stringify(item, null, 2).replace(/\n/g, "\n  ")}`;
  const sections = [
    section("schema", value.schema),
    section("version", value.version),
    section("methodology", value.methodology),
    section("source", value.source),
    section("roster", value.roster),
    section("chambers", value.chambers),
  ];
  const rows = value.rows.map((row) => `    ${JSON.stringify(row)}`).join(",\n");
  return `{\n${sections.join(",\n")},\n  "rows": [\n${rows}\n  ]\n}\n`;
}
