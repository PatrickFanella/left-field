import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
import type { NewYorkSourceEntry } from "./new-york-house-democratic-primary-reported-results-receipt";

type Candidate = Readonly<{
  sourceCandidateName: string;
  candidacyKind: "named_candidate" | "named_write_in";
  votes: number;
}>;

type CountyRow = Readonly<{ county: string; votes: readonly number[] }>;

export type OhioSummaryWorkbook = Readonly<{
  sheetName: "Master";
  title: string;
  districts: readonly Readonly<{
    districtCode: string;
    candidates: readonly Candidate[];
    countyRows: readonly CountyRow[];
    sourceTotalVotes: number;
  }>[];
}>;

const fail = (code: string): never => { throw new Error(`Ohio primary results rejected: ${code}`); };
const decode = (value: string): string => value
  .split("&lt;").join("<").split("&gt;").join(">").split("&quot;").join('"')
  .split("&apos;").join("'").split("&amp;").join("&").replace(/&#(\d+);/g, (_match: string, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match: string, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
const textNodes = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decode(match[1]!)).join("");
const columnNumber = (reference: string): number => {
  const letters = reference.match(/^[A-Z]+/)?.[0]; if (!letters) return fail("CELL_REFERENCE_INVALID");
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
};
const cellReference = (column: number, row: number): string => {
  let name = "", current = column;
  while (current > 0) { current--; name = String.fromCharCode(65 + current % 26) + name; current = Math.floor(current / 26); }
  return `${name}${row}`;
};
const number = (value: string | undefined): number => {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return fail("INTEGER_INVALID");
  const parsed = Number(value); if (!Number.isSafeInteger(parsed)) return fail("INTEGER_INVALID"); return parsed;
};

function file(files: Record<string, Uint8Array>, name: string): string {
  const value = files[name] ?? files[`/${name}`]; if (!value) return fail(`WORKBOOK_PART_MISSING:${name}`);
  return Buffer.from(value).toString("utf8");
}

function parseCells(sheetXml: string, sharedStrings: readonly string[]): Map<string, string> {
  const cells = new Map<string, string>();
  for (const match of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1]!, body = match[2] ?? "", reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
    if (!reference) return fail("CELL_REFERENCE_INVALID");
    const type = attributes.match(/\bt="([^"]+)"/)?.[1], raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
    let value: string;
    if (type === "s") { const index = number(raw); value = sharedStrings[index] ?? fail("SHARED_STRING_INVALID"); }
    else if (type === "inlineStr") value = textNodes(body);
    else value = raw === undefined ? "" : decode(raw);
    cells.set(reference, value);
  }
  return cells;
}

function districtFromOffice(value: string): number | null {
  if (!/(?:representative\s+to\s+congress|u\.?s\.?\s+representative)/i.test(value) || /\b(?:unexpired|term commencing|special)\b/i.test(value)) return null;
  const match = value.match(/district\s+(\d{1,2})\b/i) ?? value.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+district\b/i);
  return match ? Number(match[1]) : null;
}

function candidate(value: string): Omit<Candidate, "votes"> {
  if (!/\s+\(D\)\s*$/.test(value)) return fail("PARTY_LABEL_INVALID");
  let name = value.replace(/\s+\(D\)\s*$/, "").trim(), candidacyKind: Candidate["candidacyKind"] = "named_candidate";
  if (/\s+\(WI\)\*?\s*$/i.test(name)) { name = name.replace(/\s+\(WI\)\*?\s*$/i, "").trim(); candidacyKind = "named_write_in"; }
  if (!name) return fail("CANDIDATE_NAME_INVALID");
  return { sourceCandidateName: name, candidacyKind };
}

export function parseOhioSummaryWorkbook(bytes: Buffer | Uint8Array): OhioSummaryWorkbook {
  let files: Record<string, Uint8Array>; try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("XLSX_INVALID"); }
  const workbookXml = file(files, "xl/workbook.xml"), relationshipsXml = file(files, "xl/_rels/workbook.xml.rels");
  const master = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map((match) => match[1]!).find((attributes) => /\bname="Master"/.test(attributes));
  const relationshipId = master?.match(/(?:\br:id|\bid)="([^"]+)"/)?.[1]; if (!relationshipId) return fail("MASTER_SHEET_MISSING");
  const relationship = [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match) => match[1]!).find((attributes) => new RegExp(`\\bId="${relationshipId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(attributes));
  const target = relationship?.match(/\bTarget="([^"]+)"/)?.[1]; if (!target) return fail("MASTER_SHEET_MISSING");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sharedXml = files["xl/sharedStrings.xml"] ? file(files, "xl/sharedStrings.xml") : "", sharedStrings = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => textNodes(match[1]!));
  const sheetXml = file(files, sheetPath), cells = parseCells(sheetXml, sharedStrings);
  for (const merge of sheetXml.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"[^>]*\/?\s*>/g)) {
    const startColumn = columnNumber(merge[1]!), endColumn = columnNumber(merge[3]!), startRow = Number(merge[2]), endRow = Number(merge[4]), value = cells.get(`${merge[1]}${merge[2]}`) ?? "";
    for (let row = startRow; row <= endRow; row++) for (let column = startColumn; column <= endColumn; column++) cells.set(cellReference(column, row), value);
  }
  const totalRow = [...cells.entries()].find(([reference, value]) => /^A\d+$/.test(reference) && value.trim() === "Total")?.[0];
  const totalRowNumber = totalRow ? Number(totalRow.slice(1)) : 0; if (!totalRowNumber) return fail("TOTAL_ROW_MISSING");
  const percentageRow = [...cells.entries()].find(([reference, value]) => /^A\d+$/.test(reference) && value.trim() === "Percentage")?.[0];
  const percentageRowNumber = percentageRow ? Number(percentageRow.slice(1)) : 0; if (!percentageRowNumber || percentageRowNumber <= totalRowNumber) return fail("PERCENTAGE_ROW_MISSING");
  const maximumColumn = Math.max(...[...cells.keys()].map(columnNumber)), byDistrict = new Map<number, { candidateColumns: number[]; candidates: Omit<Candidate, "votes">[] }>();
  for (let column = 7; column <= maximumColumn; column++) {
    const office = cells.get(cellReference(column, 1))?.trim() ?? "", district = districtFromOffice(office); if (district === null) continue;
    const header = cells.get(cellReference(column, 2))?.trim(); if (!header) return fail("CANDIDATE_HEADER_MISSING");
    const group = byDistrict.get(district) ?? { candidateColumns: [], candidates: [] }; group.candidateColumns.push(column); group.candidates.push(candidate(header)); byDistrict.set(district, group);
  }
  const observedDistricts = [...byDistrict.keys()].sort((a, b) => a - b);
  if (observedDistricts.join(",") !== Array.from({ length: 15 }, (_, index) => index + 1).join(",")) return fail(`DISTRICT_SET_INVALID:${observedDistricts.join(",")}`);
  const maximumRow = Math.max(...[...cells.keys()].map((reference) => Number(reference.match(/\d+$/)?.[0] ?? 0)));
  const districts = [...byDistrict.entries()].sort(([left], [right]) => left - right).map(([district, group]) => {
    const candidates = group.candidates.map((item, index) => ({ ...item, votes: number(cells.get(cellReference(group.candidateColumns[index]!, totalRowNumber))) }));
    const countyRows: CountyRow[] = [];
    for (let row = percentageRowNumber + 1; row <= maximumRow; row++) {
      const county = cells.get(cellReference(1, row))?.trim(); if (!county) continue;
      const votes = group.candidateColumns.map((column) => { const raw = cells.get(cellReference(column, row)); return raw === undefined || raw === "" ? 0 : number(raw); });
      countyRows.push({ county, votes });
    }
    if (!countyRows.length || new Set(countyRows.map((row) => row.county)).size !== countyRows.length) return fail("COUNTY_ROWS_INVALID");
    if (candidates.some((item, index) => item.votes !== countyRows.reduce((sum, row) => sum + row.votes[index]!, 0))) return fail("VOTE_RECONCILIATION_INVALID");
    return { districtCode: String(district).padStart(2, "0"), candidates, countyRows, sourceTotalVotes: candidates.reduce((sum, item) => sum + item.votes, 0) };
  });
  return { sheetName: "Master", title: cells.get("A1")?.trim() ?? "", districts };
}

export const OHIO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1 = "ohio-house-democratic-primary-results-2022-2026-v1" as const;
export const OHIO_PRIMARY_CONTEST_SET_SHA256 = "9d88dc5660f8fe7e85481a503ea1b4269895fcf0bf6af78d9d39b0b279d6a505";
export const OHIO_PRIMARY_PACKAGE_SHA256 = "110dc14b66d637475df77560d4790bfed5c7770eb9e85d8cebd199a9c3c68327";
type Cycle = 2022 | 2024 | 2026;
type Input = Readonly<{ entry: NewYorkSourceEntry; bytes: Buffer | Uint8Array | string }>;
type Contest = Readonly<{
  contestId: string; contestSha256: string; cycleYear: 2024 | 2026; electionDate: "2024-03-19" | "2026-05-05"; stateCode: "OH"; districtCode: string; party: "Democratic"; office: "U.S. Representative"; eventKind: "regular"; stage: "primary"; nominationSystem: "partisan_primary";
  sourceLockId: string; sourceFileSha256: string; resultAuthorityStatus: "secretary_official_canvass_workbook"; certificationStatus: "official_canvass_workbook_separate_certificate_not_retained"; disposition: "reported_contest";
  candidates: readonly Candidate[]; sourceTotalVotes: number; voteReconciliation: "candidate_sum_equals_source_total_and_county_matrix"; sourceWinnerStatus: "not_marked_by_source"; winnerSourceCandidateName: null;
  currentIdentityStatus: "not_reviewed"; geographyStatus: "not_reviewed"; selectionStatus: "unselected"; scoreEligible: false; evaluatorValues: Readonly<{ priorPrimaryMargin: null; priorDemocraticPrimaryVotes: null; priorProgressivePrimaryShare: null }>;
}>;
type CycleSummary = Readonly<{
  cycleYear: Cycle; electionDate: "2022-05-03" | "2024-03-19" | "2026-05-05"; resultStatus: "official_portal_inventory_has_no_us_house_result_file" | "secretary_official_canvass_workbook"; targetObservations: 0 | 5;
  manifestFileGroups?: 6; manifestFiles?: 20; statewideContests?: 15; statewideCandidates?: number; statewideVotes?: number; statewideNamedWriteInCandidates?: number; sourceCountyRows?: 88; excludedNonRegularHouseContestBlocks?: number; sourceLockIds: readonly string[];
}>;
export type OhioPrimaryResultsReceipt = Readonly<{
  schema: typeof OHIO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1; version: 1; generatedAt: "2026-08-06T17:00:00.000Z"; sourceCutoff: "2026-08-06"; reviewerOnly: true; publicationEligible: false; review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null; resolution: null }>;
  originalPublisher: "Ohio Secretary of State"; status: "official_canvass_result_candidate_with_2022_portal_gap"; licenseOrReuseTerms: "not_stated_by_source";
  parentProposal: Readonly<{ id: "house-democratic-primary-source-selection-proposal-20260804-v1"; fileSha256: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1"; packageSha256: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" }>;
  decisionSupport: readonly Readonly<{ decisionId: string; lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" }>[]; inheritedDecisionResolutions: readonly Readonly<{ decisionId: string; resolution: null }>[];
  cycles: readonly CycleSummary[]; sources: readonly NewYorkSourceEntry[]; contests: readonly Contest[];
  summary: Readonly<{ cyclesWithHouseResults: 2; statewideContestsValidated: 30; statewideCandidatesValidated: 71; statewideVotesValidated: 1238127; targetObservations: 10; targetCandidates: 14; targetVotes: 540587; namedWriteInCandidates: 1; evaluatorNumericValues: 0; scoreEligibleContests: 0; contestSetSha256: string }>;
  limitations: readonly string[]; unresolvedGates: readonly string[]; packageSha256: string;
}>;

const EXPECTED: Readonly<Record<string, Readonly<{ url: string; path: string; size: number; hash: string; kind: string; parents: readonly string[] }>>> = {
  "oh-election-results-files-index-20260806": { url: "https://publicfiles.ohiosos.gov/election-results/files-index.json", path: "data/source/elections/primary-results/ohio/portal/files-index-20260806.json", size: 363585, hash: "738eb258e436459b7bb3e5ad6091e9753f60d0a9b3adeb68f7d0fc76be5da056", kind: "official_results_file_manifest", parents: [] },
  "oh-2022-may-primary-portal-manifest-extract": { url: "urn:dsa-seats:ohio:2022-may-primary:official-portal-manifest-extract:v1", path: "data/source/elections/primary-results/ohio/2022/may-03-portal-manifest-extract.json", size: 5062, hash: "69596596733a6a88b3433a56bd85a777e018ba8851a1f8ae0cd882259c30dc86", kind: "derived_extract", parents: ["oh-election-results-files-index-20260806"] },
  "oh-2022-may-primary-democratic-summary": { url: "https://publicfiles.ohiosos.gov/election-results/past-elections/2022/Primary%20Election%3A%20May%203%2C%202022/group2/summarylevelofficialresults_2022-05-03_primaryelection_democratic.xlsx", path: "data/source/elections/primary-results/ohio/2022/may-03-democratic-summary.xlsx", size: 62772, hash: "8ce6af5fce316abea9cfd3477926093e20f1eba4e54edc943a83ec1a5a8a8e9c", kind: "official_statewide_summary_exclusion_evidence", parents: ["oh-election-results-files-index-20260806"] },
  "oh-2024-march-primary-democratic-summary": { url: "https://publicfiles.ohiosos.gov/election-results/past-elections/2024/Primary%20Election%3A%20March%2019%2C%202024/group1/summary-level-official-results-primary-2024---democratic.xlsx", path: "data/source/elections/primary-results/ohio/2024/march-19-democratic-summary.xlsx", size: 156100, hash: "94b4ec212bc03bd90d8fe9f0acedac591affbe91a71aa02d63c73e703660ed64", kind: "official_statewide_canvass_result", parents: ["oh-election-results-files-index-20260806"] },
  "oh-2026-may-primary-democratic-summary": { url: "https://publicfiles.ohiosos.gov/election-results/past-elections/2026/Primary%2BSpecial%20Election%20-%20May%205%2C%202026/group1/summary-level-official-results-2026-primary---democratic.xlsx", path: "data/source/elections/primary-results/ohio/2026/may-05-democratic-summary.xlsx", size: 261632, hash: "d29da75827f0375a92e26a934e37e742a6cb46c1c5638912246312b0a0293118", kind: "official_statewide_canvass_result", parents: ["oh-election-results-files-index-20260806"] },
};
const IDS = Object.keys(EXPECTED).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
const TARGETS = new Set(["01", "03", "09", "11", "13"]), DECISIONS = ["collect-official-state-primary-results-and-certification-v1", "decide-nonstandard-primary-disposition-treatment-v1"] as const;
const LIMITATIONS = [
  "The complete retained May 3, 2022 portal election object has six file groups and twenty files but no U.S. House file; the plausible Democratic summary workbook likewise contains no U.S. House sheet or block. This is a source-coverage gap, not a no-contest or zero-vote disposition, and the separate August 2 legislative primary is not substituted.",
  "The 2024 and 2026 source workbooks label themselves Official Canvass and reconcile candidate totals to all 88 county rows. Separate signed certification instruments are not retained, so the receipt does not claim a stronger certification chain.",
  "The 2024 workbook also contains a district 6 unexpired-term contest; it is excluded from the regular-primary corpus rather than merged with the regular district 6 block.",
  "Ohio Secretary of State reuse terms do not state an open-data license for these files, so the receipt records licenseOrReuseTerms as not_stated_by_source.",
  "No numerical plurality is converted into a source winner marker, current identity, geography approval, selection, evaluator value, or publication approval.",
] as const;
const GATES = ["acquire_2022_us_house_results_from_official_county_certification_records", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification", "complete_human_data_review_and_publication_approval"] as const;
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const asBytes = (value: Input["bytes"]) => typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
function checked(input: Input): Buffer { const expected = EXPECTED[input.entry.id], value = asBytes(input.bytes); if (!expected || input.entry.url !== expected.url || input.entry.retainedPath !== expected.path || input.entry.retainedStatus !== "retained" || input.entry.byteSize !== expected.size || input.entry.sha256 !== expected.hash || input.entry.kind !== expected.kind || canonicalJson(input.entry.parentIds) !== canonicalJson(expected.parents) || value.length !== expected.size || sha(value) !== expected.hash) fail("SOURCE_RECEIPT_INVALID"); return value; }
function containsExact(value: unknown, target: string): boolean { if (canonicalJson(value) === target) return true; if (Array.isArray(value)) return value.some((item) => containsExact(item, target)); if (value && typeof value === "object") return Object.values(value).some((item) => containsExact(item, target)); return false; }
function sharedText(value: Buffer): string { const files = unzipSync(new Uint8Array(value)), raw = files["xl/sharedStrings.xml"]; if (!raw) return fail("SHARED_STRINGS_MISSING"); return textNodes(Buffer.from(raw).toString("utf8")); }

export function buildOhioPrimaryResultsReceipt(inputs: readonly Input[], parentInput: Readonly<{ value: unknown; bytes: Buffer | Uint8Array }>): OhioPrimaryResultsReceipt {
  const parentBytes = Buffer.from(parentInput.bytes), parent = validateHouseDemocraticPrimarySourceSelectionProposal(parentInput.value); if (sha(parentBytes) !== "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1" || parent.packageSha256 !== "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" || DECISIONS.some((id) => parent.decisions.find((decision) => decision.decisionId === id)?.resolution !== null)) fail("PARENT_INVALID");
  const byId = new Map(inputs.map((input) => [input.entry.id, input])); if (inputs.length !== IDS.length || byId.size !== IDS.length || IDS.some((id) => !byId.has(id))) fail("SOURCE_CLOSURE_INVALID"); for (const input of inputs) checked(input);
  const fullManifest = JSON.parse(checked(byId.get("oh-election-results-files-index-20260806")!).toString("utf8")) as unknown, extractBytes = checked(byId.get("oh-2022-may-primary-portal-manifest-extract")!), extractText = extractBytes.toString("utf8"), extract = JSON.parse(extractText) as { type?: unknown; fileGroups?: { description?: unknown; files?: unknown[] }[] };
  if (!containsExact(fullManifest, canonicalJson(extract)) || extract.type !== "Primary Election: May 3, 2022" || extract.fileGroups?.length !== 6 || extract.fileGroups.reduce((sum, group) => sum + (group.files?.length ?? 0), 0) !== 20 || /\b(?:congress|representative)\b/i.test(extractText)) fail("MANIFEST_EXCLUSION_INVALID");
  const y22 = checked(byId.get("oh-2022-may-primary-democratic-summary")!); if (!sharedText(y22).includes("May 3, 2022 Primary Election Official Canvass") || /Representative to Congress|U\.S\. Congress/i.test(sharedText(y22))) fail("RESULT_2022_EXCLUSION_INVALID");
  const parsed: Readonly<Record<2024 | 2026, OhioSummaryWorkbook>> = { 2024: parseOhioSummaryWorkbook(checked(byId.get("oh-2024-march-primary-democratic-summary")!)), 2026: parseOhioSummaryWorkbook(checked(byId.get("oh-2026-may-primary-democratic-summary")!)) };
  if (!parsed[2024].title.startsWith("March 19, 2024 Presidential Primary Election Official Canvass") || !parsed[2026].title.startsWith("May 5, 2026 Primary/Special Election Official Canvass")) fail("ELECTION_IDENTITY_INVALID");
  for (const year of [2024, 2026] as const) if (parsed[year].districts.some((district) => district.countyRows.length !== 88 || new Set(district.countyRows.map((row) => row.county)).size !== 88)) fail("COUNTY_CLOSURE_INVALID");
  const full = { 2024: { candidates: parsed[2024].districts.reduce((sum, item) => sum + item.candidates.length, 0), votes: parsed[2024].districts.reduce((sum, item) => sum + item.sourceTotalVotes, 0), writeIns: parsed[2024].districts.flatMap((item) => item.candidates).filter((item) => item.candidacyKind === "named_write_in").length }, 2026: { candidates: parsed[2026].districts.reduce((sum, item) => sum + item.candidates.length, 0), votes: parsed[2026].districts.reduce((sum, item) => sum + item.sourceTotalVotes, 0), writeIns: parsed[2026].districts.flatMap((item) => item.candidates).filter((item) => item.candidacyKind === "named_write_in").length } };
  if (canonicalJson(full) !== canonicalJson({ 2024: { candidates: 24, votes: 497362, writeIns: 0 }, 2026: { candidates: 47, votes: 740765, writeIns: 1 } })) fail("STATEWIDE_TOTAL_INVALID");
  const contests: Contest[] = []; for (const year of [2024, 2026] as const) for (const district of parsed[year].districts.filter((item) => TARGETS.has(item.districtCode))) { const sourceId = year === 2024 ? "oh-2024-march-primary-democratic-summary" : "oh-2026-may-primary-democratic-summary", unsigned = { contestId: `oh:${year}:regular:us-house:${district.districtCode}:democratic`, cycleYear: year, electionDate: year === 2024 ? "2024-03-19" as const : "2026-05-05" as const, stateCode: "OH" as const, districtCode: district.districtCode, party: "Democratic" as const, office: "U.S. Representative" as const, eventKind: "regular" as const, stage: "primary" as const, nominationSystem: "partisan_primary" as const, sourceLockId: sourceId, sourceFileSha256: EXPECTED[sourceId]!.hash, resultAuthorityStatus: "secretary_official_canvass_workbook" as const, certificationStatus: "official_canvass_workbook_separate_certificate_not_retained" as const, disposition: "reported_contest" as const, candidates: district.candidates, sourceTotalVotes: district.sourceTotalVotes, voteReconciliation: "candidate_sum_equals_source_total_and_county_matrix" as const, sourceWinnerStatus: "not_marked_by_source" as const, winnerSourceCandidateName: null, currentIdentityStatus: "not_reviewed" as const, geographyStatus: "not_reviewed" as const, selectionStatus: "unselected" as const, scoreEligible: false as const, evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null } }; contests.push({ ...unsigned, contestSha256: digest("dsa-seats:oh-house-democratic-primary-result:v1\0", unsigned) }); }
  const cycles: CycleSummary[] = [{ cycleYear: 2022, electionDate: "2022-05-03", resultStatus: "official_portal_inventory_has_no_us_house_result_file", manifestFileGroups: 6, manifestFiles: 20, targetObservations: 0, sourceLockIds: ["oh-election-results-files-index-20260806", "oh-2022-may-primary-portal-manifest-extract", "oh-2022-may-primary-democratic-summary"] }, ...([2024, 2026] as const).map((year): CycleSummary => ({ cycleYear: year, electionDate: year === 2024 ? "2024-03-19" : "2026-05-05", resultStatus: "secretary_official_canvass_workbook", targetObservations: 5, statewideContests: 15, statewideCandidates: full[year].candidates, statewideVotes: full[year].votes, statewideNamedWriteInCandidates: full[year].writeIns, sourceCountyRows: 88, excludedNonRegularHouseContestBlocks: year === 2024 ? 1 : 0, sourceLockIds: [year === 2024 ? "oh-2024-march-primary-democratic-summary" : "oh-2026-may-primary-democratic-summary"] }))];
  const contestSetSha256 = digest("dsa-seats:oh-house-democratic-primary-result-set:v1\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 }))), sources = (inputs.map((input) => input.entry).sort((left, right) => Buffer.compare(Buffer.from(left.id), Buffer.from(right.id)))).map(sourceLockContent), targetCandidates = contests.reduce((sum, item) => sum + item.candidates.length, 0), targetVotes = contests.reduce((sum, item) => sum + item.sourceTotalVotes, 0);
  const unsigned = { schema: OHIO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1, version: 1 as const, generatedAt: "2026-08-06T17:00:00.000Z" as const, sourceCutoff: "2026-08-06" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null }, originalPublisher: "Ohio Secretary of State" as const, status: "official_canvass_result_candidate_with_2022_portal_gap" as const, licenseOrReuseTerms: "not_stated_by_source" as const, parentProposal: { id: "house-democratic-primary-source-selection-proposal-20260804-v1" as const, fileSha256: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1" as const, packageSha256: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" as const }, decisionSupport: DECISIONS.map((decisionId) => ({ decisionId, lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" as const })), inheritedDecisionResolutions: DECISIONS.map((decisionId) => ({ decisionId, resolution: null })), cycles, sources, contests, summary: { cyclesWithHouseResults: 2 as const, statewideContestsValidated: 30 as const, statewideCandidatesValidated: 71 as const, statewideVotesValidated: 1238127 as const, targetObservations: 10 as const, targetCandidates: 14 as const, targetVotes: 540587 as const, namedWriteInCandidates: 1 as const, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const, contestSetSha256 }, limitations: LIMITATIONS, unresolvedGates: GATES };
  if (targetCandidates !== 14 || targetVotes !== 540587) fail("TARGET_TOTAL_INVALID"); return { ...unsigned, packageSha256: digest("dsa-seats:oh-house-democratic-primary-result-package:v1\0", unsigned) };
}

export function validateOhioPrimaryResultsReceipt(value: OhioPrimaryResultsReceipt): OhioPrimaryResultsReceipt {
  const { packageSha256, ...unsigned } = value, setHash = digest("dsa-seats:oh-house-democratic-primary-result-set:v1\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 }))), candidates = value.contests.reduce((sum, item) => sum + item.candidates.length, 0), votes = value.contests.reduce((sum, item) => sum + item.sourceTotalVotes, 0);
  if (value.cycles[0]?.cycleYear !== 2022 || value.cycles[0].resultStatus !== "official_portal_inventory_has_no_us_house_result_file" || value.cycles[0].targetObservations !== 0 || value.contests.some((item) => item.cycleYear === (2022 as number)) || value.contests.some((item) => !TARGETS.has(item.districtCode) || item.sourceWinnerStatus !== "not_marked_by_source" || item.winnerSourceCandidateName !== null || item.currentIdentityStatus !== "not_reviewed" || item.geographyStatus !== "not_reviewed" || item.selectionStatus !== "unselected" || item.scoreEligible || Object.values(item.evaluatorValues).some((entry) => entry !== null) || item.sourceTotalVotes !== item.candidates.reduce((sum, candidate) => sum + candidate.votes, 0))) fail("SEMANTIC_INVARIANT_INVALID");
  if (value.schema !== OHIO_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_V1 || value.version !== 1 || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null || value.licenseOrReuseTerms !== "not_stated_by_source" || packageSha256 !== OHIO_PRIMARY_PACKAGE_SHA256 || packageSha256 !== digest("dsa-seats:oh-house-democratic-primary-result-package:v1\0", unsigned) || setHash !== OHIO_PRIMARY_CONTEST_SET_SHA256 || value.summary.contestSetSha256 !== setHash || value.contests.length !== 10 || candidates !== 14 || votes !== 540587 || value.summary.targetCandidates !== candidates || value.summary.targetVotes !== votes || canonicalJson(value.limitations) !== canonicalJson(LIMITATIONS) || canonicalJson(value.unresolvedGates) !== canonicalJson(GATES)) fail("PACKAGE_INVARIANT_INVALID");
  if (value.contests.some((item) => { const { contestSha256, ...rest } = item; return contestSha256 !== digest("dsa-seats:oh-house-democratic-primary-result:v1\0", rest); })) fail("PACKAGE_INVARIANT_INVALID"); return value;
}
