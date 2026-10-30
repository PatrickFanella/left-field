import { readRetainedSource, readSourceLock, type SourceLock } from "../rapid-acquisition/intake/source-lock";
import { readStateLegislativeGeneralResults } from "../rapid-acquisition/state-legislative-general-results";
import { readStateLegislativeRoster } from "../rapid-acquisition/state-legislative-roster";
import { buildNationwideSourceRegistry } from "./nationwide-intake";

/** This explicit list prevents a missing retained source from hiding a state or DC. */
export const COVERAGE_JURISDICTIONS = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" }, { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "District of Columbia" },
] as const;

type Code = (typeof COVERAGE_JURISDICTIONS)[number]["code"];
type Retention = "retained" | "not_retained";
type LocalFamily = "county" | "municipal" | "school_district" | "special_district" | "township" | "local_judicial" | "other_local";
type RosterEvidence = Readonly<{ status: Retention; artifactIds: readonly string[]; rosterPeopleCount: number; note: string }>;
type HistoricalEvidence = Readonly<{ status: Retention; artifactIds: readonly string[]; historicalContestCount: number; cycles: readonly number[]; note: string }>;
type LocalArtifactEvidence = Readonly<{ artifactId: string; historicalContestCount: number; cycles: readonly number[]; coverageFamilies: readonly LocalFamily[]; observedOfficeFamilies: readonly string[] }>;

export interface NationwideOfficeCoverageInventory {
  readonly schema: "nationwide-office-coverage-inventory-v1";
  readonly version: 1;
  readonly methodology: Readonly<{ completenessRule: "no_jurisdiction_or_office_family_is_complete_without_a_sourced_seat_denominator"; holderRule: "retained_roster_rows_are_not_current_holder_claims"; discoveryRule: "configured_discovery_source_is_not_retained_government_unit_coverage" }>;
  readonly jurisdictions: readonly Readonly<{
    code: Code; name: string;
    stateLegislative: Readonly<{
      roster: RosterEvidence;
      historicalResults: HistoricalEvidence;
      authorizedSeatDenominator: Readonly<{ status: "retained"; count: number; sourceIds: readonly string[]; referenceDate: "2025-04-30"; rosterSnapshotDate: string; rosterPeopleDelta: number; note: string }>;
    }>;
    localHistoricalResults: Readonly<{ status: Retention; artifacts: readonly LocalArtifactEvidence[]; historicalContestCount: number; note: string }>;
    governmentUnitDiscovery: Readonly<{ status: "configured_without_retained_rows" | "not_registered"; sourceStatus: "discontinued" | "not_assessed" | "not_registered"; sourceKey: string | null; nextStep: string }>;
    /** Full elected-office denominator, never filled by state-legislative counts. */
    seatDenominator: Readonly<{ status: "unknown"; count: null; note: string }>;
    currentHolderIdentity: Readonly<{ status: "not_assessed"; note: string }>;
    acquisitionGaps: readonly string[];
  }>[];
  readonly separateScopes: readonly Readonly<{ scope: "us_territories" | "tribal_nations" | "federal_release"; jurisdictionCodes?: readonly string[]; status: "separate_scope_not_in_this_inventory"; nextStep: string }>[];
  readonly officeFamilies: readonly Readonly<{ family: "federal" | "state_legislative" | "statewide_executive" | "statewide_judicial" | "county" | "municipal" | "school_district" | "special_district" | "township" | "local_judicial"; level: "federal" | "state" | "local"; coverageRule: string }>[];
  readonly summary: Readonly<{ jurisdictionsTracked: number; stateLegislativeRosterJurisdictions: number; stateLegislativeHistoricalResultJurisdictions: number; stateLegislativeAuthorizedSeatDenominatorJurisdictions: number; localHistoricalResultJurisdictions: number; fullOfficeDenominatorKnownJurisdictions: 0; governmentUnitDiscoveryConfiguredJurisdictions: number; governmentUnitDiscoveryWithoutRetainedRows: number; governmentUnitDiscoverySourcesRequiringReplacement: number }>;
}

type LocalArtifact = LocalArtifactEvidence & Readonly<{ stateCode: Code }>;
const LOCAL_ARTIFACTS: readonly Readonly<{ id: string; stateCode: Code }>[] = [
  { id: "rapid-indiana-local-office-primary-results-v1", stateCode: "IN" },
  { id: "rapid-new-mexico-county-office-primary-results-v1", stateCode: "NM" },
  { id: "rapid-north-carolina-local-office-primary-results-v1", stateCode: "NC" },
  { id: "rapid-north-carolina-local-office-general-results-v1", stateCode: "NC" },
  { id: "rapid-north-carolina-soil-water-general-results-v1", stateCode: "NC" },
  { id: "rapid-north-carolina-sanitary-general-results-v1", stateCode: "NC" },
];
const NCSL_LAYOUT_ID = "ncsl-state-legislative-partisan-composition-2025-layout";
const NCSL_PDF_ID = "ncsl-state-legislative-partisan-composition-2025";
const DC_CHARTER_ID = "dc-home-rule-act-council-membership";
const GUS_URL = "https://www.census.gov/programs-surveys/gus.html";

const family = (value: string): LocalFamily => {
  const text = value.toLowerCase();
  if (text.includes("township")) return "township";
  if (text.includes("judge") || text.includes("court")) return "local_judicial";
  if (text.includes("education") || text.includes("school")) return "school_district";
  if (text.includes("sanitary") || text.includes("soil") || text.includes("water")) return "special_district";
  if (text.includes("municipal") || text.includes("city") || text.includes("town_")) return "municipal";
  if (text.includes("county") || text.includes("register_of_deeds") || text.includes("probate")) return "county";
  return "other_local";
};

function readLocalArtifacts(root: string, lock: SourceLock): readonly LocalArtifact[] {
  return LOCAL_ARTIFACTS.map(({ id, stateCode }) => {
    const value = JSON.parse(readRetainedSource(lock, id, root).bytes.toString("utf8")) as { contests?: readonly { cycleYear?: unknown; office?: unknown; officeFamily?: unknown }[] };
    if (!Array.isArray(value.contests)) throw new Error(`OFFICE_COVERAGE_LOCAL_ARTIFACT_INVALID:${id}`);
    const observedOfficeFamilies = [...new Set(value.contests.map((contest) => String(contest.office ?? contest.officeFamily ?? "unknown")))].sort();
    const cycles = [...new Set(value.contests.map((contest) => contest.cycleYear).filter((year): year is number => Number.isSafeInteger(year)))].sort((a, b) => a - b);
    return { stateCode, artifactId: id, historicalContestCount: value.contests.length, cycles, observedOfficeFamilies, coverageFamilies: [...new Set(observedOfficeFamilies.map(family))].sort() };
  });
}

/** Parses the pinned table; statewide counts are never copied into code. */
export function parseNcslAuthorizedStateLegislativeSeatCounts(text: string): ReadonlyMap<Code, number> {
  if (!text.startsWith("2025 State & Legislative Partisan Composition") || !text.includes("30-Apr-25")) throw new Error("OFFICE_COVERAGE_NCSL_EDITION_INVALID");
  const counts = new Map<Code, number>();
  for (const { code, name } of COVERAGE_JURISDICTIONS) {
    const line = text.split(/\r?\n/).find((candidate) => candidate.startsWith(name));
    const total = line?.slice(name.length).trim().match(/^(\d+)\b/)?.[1];
    if (!total) throw new Error(`OFFICE_COVERAGE_NCSL_STATE_MISSING:${code}`);
    counts.set(code, Number(total));
  }
  return counts;
}

function retainedAuthorizedSeatCounts(root: string, lock: SourceLock): ReadonlyMap<Code, number> {
  const pdf = readRetainedSource(lock, NCSL_PDF_ID, root);
  const layout = readRetainedSource(lock, NCSL_LAYOUT_ID, root);
  if (pdf.entry.url !== "https://documents.ncsl.org/wwwncsl/Elections/Legis_Control_2025_4.30.25.pdf" || !pdf.bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || JSON.stringify(layout.entry.parentIds) !== JSON.stringify([NCSL_PDF_ID])) throw new Error("OFFICE_COVERAGE_NCSL_LINEAGE_INVALID");
  const counts = parseNcslAuthorizedStateLegislativeSeatCounts(layout.bytes.toString("utf8"));
  const charter = readRetainedSource(lock, DC_CHARTER_ID, root).bytes.toString("utf8");
  if (!/Council established[^.]*shall consist of 13 members/i.test(charter) || counts.get("DC") !== 13) throw new Error("OFFICE_COVERAGE_DC_CHARTER_COUNT_INVALID");
  return counts;
}

const officeFamilies = [
  { family: "federal", level: "federal", coverageRule: "Outside this intake inventory; the federal release is separately qualified." },
  { family: "state_legislative", level: "state", coverageRule: "Roster people, historical contests, and authorized seat counts remain separate measures." },
  { family: "statewide_executive", level: "state", coverageRule: "Requires a retained state-office roster and a sourced office denominator." },
  { family: "statewide_judicial", level: "state", coverageRule: "Requires jurisdiction-specific election or appointment authority and a sourced office denominator." },
  { family: "county", level: "local", coverageRule: "Requires government-unit discovery before county seat coverage can be measured." },
  { family: "municipal", level: "local", coverageRule: "Requires government-unit discovery and local-office authority evidence before coverage can be measured." },
  { family: "school_district", level: "local", coverageRule: "Requires district discovery and election-authority evidence before coverage can be measured." },
  { family: "special_district", level: "local", coverageRule: "Requires special-district discovery and office-selection evidence before coverage can be measured." },
  { family: "township", level: "local", coverageRule: "Requires township discovery and selection-method evidence before coverage can be measured." },
  { family: "local_judicial", level: "local", coverageRule: "Requires local judicial office and selection-method evidence before coverage can be measured." },
] as const;

export function buildNationwideOfficeCoverageInventory(root = process.cwd(), lock: SourceLock = readSourceLock(root)): NationwideOfficeCoverageInventory {
  const roster = readStateLegislativeRoster(root, lock), general = readStateLegislativeGeneralResults(root, lock), localArtifacts = readLocalArtifacts(root, lock), authorizedSeats = retainedAuthorizedSeatCounts(root, lock);
  const rosterPeople = new Map<string, number>();
  for (const row of roster.rows) rosterPeople.set(row.stateCode, (rosterPeople.get(row.stateCode) ?? 0) + 1);
  const generalByState = new Map(general.states.map((state) => [state.stateCode, state]));
  const localByState = new Map<Code, LocalArtifact[]>();
  for (const artifact of localArtifacts) localByState.set(artifact.stateCode, [...(localByState.get(artifact.stateCode) ?? []), artifact]);
  const discoveryByState = new Map<string, ReturnType<typeof buildNationwideSourceRegistry>[number]>(buildNationwideSourceRegistry().filter((entry) => entry.family === "discovery").map((entry) => [entry.stateCode, entry]));
  const jurisdictions = COVERAGE_JURISDICTIONS.map(({ code, name }) => {
    const rosterPeopleCount = rosterPeople.get(code) ?? 0, result = generalByState.get(code), local = localByState.get(code) ?? [], discovery = discoveryByState.get(code), count = authorizedSeats.get(code)!;
    return {
      code, name,
      stateLegislative: {
        roster: rosterPeopleCount === 0 ? { status: "not_retained" as const, artifactIds: [], rosterPeopleCount: 0, note: "No retained roster-person rows were found for this jurisdiction." } : { status: "retained" as const, artifactIds: ["state-legislative-roster-v1"], rosterPeopleCount, note: "Retained roster-person rows; neither seat records nor current-holder assertions." },
        historicalResults: !result ? { status: "not_retained" as const, artifactIds: [], historicalContestCount: 0, cycles: [], note: "No retained state-legislative general-results summary was found for this jurisdiction." } : { status: "retained" as const, artifactIds: ["state-legislative-general-results-v1", ...result.sourceIds], historicalContestCount: result.contests, cycles: result.cycles, note: "Retained official general-election contests; cycle coverage does not prove every seat or election is present." },
        authorizedSeatDenominator: { status: "retained" as const, count, sourceIds: code === "DC" ? [NCSL_PDF_ID, NCSL_LAYOUT_ID, DC_CHARTER_ID] : [NCSL_PDF_ID, NCSL_LAYOUT_ID], referenceDate: "2025-04-30" as const, rosterSnapshotDate: roster.snapshotDate, rosterPeopleDelta: rosterPeopleCount - count, note: "Dated NCSL legislative membership count, with DC independently checked against its charter. The roster has a different date and may include nonvoting roles; this delta does not identify vacancies or prove completeness." },
      },
      localHistoricalResults: local.length === 0 ? { status: "not_retained" as const, artifacts: [], historicalContestCount: 0, note: "No retained local-office historical-results artifact is registered for this jurisdiction." } : { status: "retained" as const, artifacts: local.map(({ artifactId, historicalContestCount, cycles, coverageFamilies, observedOfficeFamilies }) => ({ artifactId, historicalContestCount, cycles, coverageFamilies, observedOfficeFamilies })), historicalContestCount: local.reduce((sum, artifact) => sum + artifact.historicalContestCount, 0), note: "Each retained artifact remains distinct; local office-family and government-unit denominators remain unknown." },
      governmentUnitDiscovery: discovery ? { status: "configured_without_retained_rows" as const, sourceStatus: discovery.sourceUrl === GUS_URL ? "discontinued" as const : "not_assessed" as const, sourceKey: discovery.sourceKey, nextStep: discovery.sourceUrl === GUS_URL ? "Replace the discontinued GUS slot with a current Census government-organization source, retain a snapshot, then map elected bodies and office-selection methods." : "Retain and review a Census government-unit snapshot, then map elected bodies and office-selection methods." } : { status: "not_registered" as const, sourceStatus: "not_registered" as const, sourceKey: null, nextStep: "Add DC to the nationwide discovery registry before making any unit-coverage claim." },
      seatDenominator: { status: "unknown" as const, count: null, note: "The state-legislative count above does not cover executive, judicial, county, municipal, school-district, special-district, or township offices." },
      currentHolderIdentity: { status: "not_assessed" as const, note: "This inventory does not promote roster names to current-holder identities." },
      acquisitionGaps: ["Retain a government-unit snapshot and identify elected bodies.", "Retain state-specific official office, term, and election authority evidence.", "Record a sourced full elected-office denominator before calculating completeness."],
    };
  });
  return { schema: "nationwide-office-coverage-inventory-v1", version: 1, methodology: { completenessRule: "no_jurisdiction_or_office_family_is_complete_without_a_sourced_seat_denominator", holderRule: "retained_roster_rows_are_not_current_holder_claims", discoveryRule: "configured_discovery_source_is_not_retained_government_unit_coverage" }, jurisdictions, separateScopes: [{ scope: "us_territories", jurisdictionCodes: ["AS", "GU", "MP", "PR", "VI"], status: "separate_scope_not_in_this_inventory", nextStep: "Retain territorial charters, official rosters, and office-selection rules before claiming territorial completeness." }, { scope: "tribal_nations", status: "separate_scope_not_in_this_inventory", nextStep: "Inventory each sovereign tribal government using its public office and election sources, distinct jurisdiction identifiers, and selection rules." }, { scope: "federal_release", status: "separate_scope_not_in_this_inventory", nextStep: "Read the separately qualified federal release rather than projecting it into this state/local intake inventory." }], officeFamilies, summary: { jurisdictionsTracked: jurisdictions.length, stateLegislativeRosterJurisdictions: jurisdictions.filter((row) => row.stateLegislative.roster.status === "retained").length, stateLegislativeHistoricalResultJurisdictions: jurisdictions.filter((row) => row.stateLegislative.historicalResults.status === "retained").length, stateLegislativeAuthorizedSeatDenominatorJurisdictions: jurisdictions.filter((row) => row.stateLegislative.authorizedSeatDenominator.count !== null).length, localHistoricalResultJurisdictions: jurisdictions.filter((row) => row.localHistoricalResults.status === "retained").length, fullOfficeDenominatorKnownJurisdictions: 0, governmentUnitDiscoveryConfiguredJurisdictions: jurisdictions.filter((row) => row.governmentUnitDiscovery.status === "configured_without_retained_rows").length, governmentUnitDiscoveryWithoutRetainedRows: jurisdictions.filter((row) => row.governmentUnitDiscovery.status === "configured_without_retained_rows").length, governmentUnitDiscoverySourcesRequiringReplacement: jurisdictions.filter((row) => row.governmentUnitDiscovery.sourceStatus === "discontinued").length } };
}

export const serializeNationwideOfficeCoverageInventory = (value: NationwideOfficeCoverageInventory): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
