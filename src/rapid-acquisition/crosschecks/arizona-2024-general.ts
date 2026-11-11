/**
 * Reviewer-only comparison of Arizona's retained 2024 signed canvass
 * transcription with independently prepared OpenElections precinct files.
 *
 * It does not participate in state-legislative result construction, scoring,
 * factual records, or source precedence. The signed Arizona canvass remains
 * controlling; missing and non-bijective rows remain findings rather than
 * inferred corrections.
 */

import { readRetainedSource, readSourceLock } from "../intake/source-lock";

const ELECTION_DATE = "2024-11-05";
const COMPARISON_DATE = "2026-10-30";
const OE_COMMIT = "bf14331521f62f74cb17848ab11ca3dfd27f4f82";
const OFFICIAL_PDF_ID = "az-2024-general-canvass-signed-pdf";
const OFFICIAL_TRANSCRIPTION_ID = "az-2024-general-canvass-signed-pdf-transcription";
const OE_COUNTIES = ["apache", "cochise", "coconino", "gila", "graham", "greenlee", "la paz", "maricopa", "mohave", "navajo", "pima", "pinal", "santa_cruz", "yavapai", "yuma"] as const;

export type ArizonaCrosscheckRow = Readonly<{
  chamber: "upper" | "lower";
  district: string;
  party: string;
  candidate: string;
  officialVotes: number | null;
  openElectionsVotes: number | null;
  voteDifference: number | null;
  status: "matched" | "official_only" | "openelections_only";
}>;

export type ArizonaCrosscheckReport = Readonly<{
  schema: "arizona-2024-general-openelections-crosscheck-v1";
  electionDate: typeof ELECTION_DATE;
  comparisonDate: typeof COMPARISON_DATE;
  reviewerOnly: true;
  publicationEligible: false;
  controllingSource: "Arizona Secretary of State signed general canvass";
  comparisonSource: "OpenElections Arizona 2024 general precinct CSVs";
  provenance: readonly Readonly<{ id: string; url: string; retainedPath: string; sha256: string }>[];
  rows: readonly ArizonaCrosscheckRow[];
  summary: Readonly<{ matched: number; exactMatches: number; voteDifferences: number; officialOnly: number; openElectionsOnly: number }>;
  limitations: readonly string[];
}>;

export type ArizonaCrosscheckInput = Readonly<{
  officialTranscription: Buffer;
  openElectionsFiles: readonly Buffer[];
  provenance: ArizonaCrosscheckReport["provenance"];
}>;

const officialHeader = "page\tchamber\tdistrict\tparty\tcandidate\twrite_in\tvotes";
const oeHeader = ["county", "precinct", "office", "district", "party", "candidate", "votes"];
const normalize = (value: string): string => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const party = (value: string): string => ({ DEMOCRATIC: "DEM", DEMOCRAT: "DEM", REPUBLICAN: "REP", GREEN: "GRN", LIBERTARIAN: "LBT", INDEPENDENT: "IND" }[normalize(value)] ?? normalize(value));
const key = (chamber: string, district: string, value: string, candidate: string) => [chamber, String(Number(district)), party(value), normalize(candidate)].join("\0");
const districtNumber = (value: string): string | null => {
  const match = value.match(/^(?:Dist-)?(\d+)$/);
  return match ? String(Number(match[1])) : null;
};

/** Reads only the exact source-lock pins required by this review. */
export function readPinnedArizona2024GeneralOpenElectionsCrosscheck(root = process.cwd()): ArizonaCrosscheckInput {
  const lock = readSourceLock(root), source = (id: string) => readRetainedSource(lock, id, root);
  const officialPdf = source(OFFICIAL_PDF_ID), transcription = source(OFFICIAL_TRANSCRIPTION_ID);
  if (officialPdf.entry.url !== "https://web.archive.org/web/20251231153438id_/https://apps.azsos.gov/election/2024/ge/canvass/20241105_GeneralCanvass_Signed.pdf" || transcription.entry.url !== "urn:dsa-seats:reviewed-transcription:az-2024-general-canvass-signed-pdf" || transcription.entry.parentIds.length !== 1 || transcription.entry.parentIds[0] !== OFFICIAL_PDF_ID) throw new Error("AZ_GENERAL_CROSSCHECK_OFFICIAL_PIN_INVALID");
  const oe = OE_COUNTIES.map((county) => {
    const slug = county.replace(/ /g, "-").replace(/_/g, "-");
    const filename = `20241105__az__general__${county}__precinct.csv`;
    const id = `openelections-az-2024-general-${slug}-precinct`;
    const pinned = source(id), expectedPath = `data/source/crosschecks/az/2024/openelections/${filename}`, expectedUrl = `https://raw.githubusercontent.com/openelections/openelections-data-az/${OE_COMMIT}/2024/General/${filename.replace(/ /g, "%20")}`;
    if (pinned.entry.url !== expectedUrl || pinned.entry.retainedPath !== expectedPath || pinned.entry.kind !== "crosscheck_source") throw new Error(`AZ_GENERAL_CROSSCHECK_OE_PIN_INVALID:${id}`);
    return pinned;
  });
  const all = [officialPdf, transcription, ...oe];
  return { officialTranscription: transcription.bytes, openElectionsFiles: oe.map((entry) => entry.bytes), provenance: all.map(({ entry }) => ({ id: entry.id, url: entry.url, retainedPath: entry.retainedPath!, sha256: entry.sha256 })) };
}

function csv(text: string): string[][] {
  const rows: string[][] = [], row: string[] = [];
  let field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === "") quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push([...row]); row.length = 0; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("AZ_GENERAL_CROSSCHECK_CSV_QUOTE_INVALID");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push([...row]); }
  return rows;
}

export function buildArizona2024GeneralOpenElectionsCrosscheck(input: ArizonaCrosscheckInput): ArizonaCrosscheckReport {
  const official = new Map<string, Omit<ArizonaCrosscheckRow, "officialVotes" | "openElectionsVotes" | "voteDifference" | "status"> & { officialVotes: number }>();
  const officialLines = input.officialTranscription.toString("utf8").trimEnd().split("\n");
  if (officialLines[0] !== officialHeader) throw new Error("AZ_GENERAL_CROSSCHECK_OFFICIAL_HEADER_INVALID");
  for (const line of officialLines.slice(1)) {
    const cells = line.split("\t");
    if (cells.length !== 7 || !/^(?:upper|lower)$/.test(cells[1]!) || !/^\d+$/.test(cells[2]!) || !/^\d+$/.test(cells[6]!) || !Number.isSafeInteger(Number(cells[6]))) throw new Error("AZ_GENERAL_CROSSCHECK_OFFICIAL_ROW_INVALID");
    const row = { chamber: cells[1] as "upper" | "lower", district: String(Number(cells[2])), party: cells[3]!, candidate: cells[4]!, officialVotes: Number(cells[6]!) };
    const rowKey = key(row.chamber, row.district, row.party, row.candidate);
    if (official.has(rowKey)) throw new Error("AZ_GENERAL_CROSSCHECK_OFFICIAL_DUPLICATE");
    official.set(rowKey, row);
  }

  const comparison = new Map<string, Omit<ArizonaCrosscheckRow, "officialVotes" | "openElectionsVotes" | "voteDifference" | "status"> & { openElectionsVotes: number }>();
  const sourceRows = new Set<string>(), normalizedInContest = new Map<string, string>();
  for (const bytes of input.openElectionsFiles) {
    const rows = csv(bytes.toString("utf8"));
    if (rows.length === 0 || rows[0]!.slice(0, oeHeader.length).map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value).join("\0") !== oeHeader.join("\0")) throw new Error("AZ_GENERAL_CROSSCHECK_OE_HEADER_INVALID");
    for (const values of rows.slice(1)) {
      if (values.length < oeHeader.length) throw new Error("AZ_GENERAL_CROSSCHECK_OE_ROW_INVALID");
      const [county, precinct, office, district, rawParty, candidate, votes] = values;
      const chamber = office === "State Senate" ? "upper" : office === "State House" ? "lower" : null;
      if (!chamber) continue;
      // The OpenElections files retain non-candidate contest totals and
      // over/under-vote rows with no party. They are not candidate rows.
      if (!rawParty) continue;
      const normalizedDistrict = districtNumber(district ?? "");
      if (!county || !precinct || !normalizedDistrict || !candidate || !/^\d+$/.test(votes ?? "") || !Number.isSafeInteger(Number(votes))) throw new Error("AZ_GENERAL_CROSSCHECK_OE_ROW_INVALID");
      const row = { chamber, district: normalizedDistrict, party: rawParty!, candidate: candidate!, openElectionsVotes: Number(votes) } as const;
      const rawKey = [county, precinct, row.chamber, row.district, party(row.party), row.candidate].join("\0");
      if (sourceRows.has(rawKey)) throw new Error("AZ_GENERAL_CROSSCHECK_OE_DUPLICATE");
      sourceRows.add(rawKey);
      const collisionKey = [county, precinct, row.chamber, row.district, party(row.party), normalize(row.candidate)].join("\0"), priorName = normalizedInContest.get(collisionKey);
      if (priorName !== undefined && priorName !== row.candidate) throw new Error("AZ_GENERAL_CROSSCHECK_OE_NORMALIZED_COLLISION");
      normalizedInContest.set(collisionKey, row.candidate);
      const rowKey = key(row.chamber, row.district, row.party, row.candidate);
      const prior = comparison.get(rowKey);
      const total = (prior?.openElectionsVotes ?? 0) + row.openElectionsVotes;
      if (!Number.isSafeInteger(total)) throw new Error("AZ_GENERAL_CROSSCHECK_OE_TOTAL_INVALID");
      comparison.set(rowKey, { ...row, openElectionsVotes: total });
    }
  }

  const rows: ArizonaCrosscheckRow[] = [];
  for (const [rowKey, officialRow] of official) {
    const comparisonRow = comparison.get(rowKey);
    rows.push({ chamber: officialRow.chamber, district: officialRow.district, party: officialRow.party, candidate: officialRow.candidate, officialVotes: officialRow.officialVotes, openElectionsVotes: comparisonRow?.openElectionsVotes ?? null, voteDifference: comparisonRow ? comparisonRow.openElectionsVotes - officialRow.officialVotes : null, status: comparisonRow ? "matched" : "official_only" });
    comparison.delete(rowKey);
  }
  for (const comparisonRow of comparison.values()) rows.push({ chamber: comparisonRow.chamber, district: comparisonRow.district, party: comparisonRow.party, candidate: comparisonRow.candidate, officialVotes: null, openElectionsVotes: comparisonRow.openElectionsVotes, voteDifference: null, status: "openelections_only" });
  rows.sort((left, right) => left.chamber.localeCompare(right.chamber) || Number(left.district) - Number(right.district) || left.party.localeCompare(right.party) || left.candidate.localeCompare(right.candidate));
  const matched = rows.filter((row) => row.status === "matched"), differences = matched.filter((row) => row.voteDifference !== 0);
  return { schema: "arizona-2024-general-openelections-crosscheck-v1", electionDate: ELECTION_DATE, comparisonDate: COMPARISON_DATE, reviewerOnly: true, publicationEligible: false, controllingSource: "Arizona Secretary of State signed general canvass", comparisonSource: "OpenElections Arizona 2024 general precinct CSVs", provenance: input.provenance, rows, summary: { matched: matched.length, exactMatches: matched.length - differences.length, voteDifferences: differences.length, officialOnly: rows.filter((row) => row.status === "official_only").length, openElectionsOnly: rows.filter((row) => row.status === "openelections_only").length }, limitations: ["The Arizona signed canvass is controlling; this report does not correct it.", "Rows only match after chamber, district, normalized party, and normalized candidate-name equality.", "OpenElections precinct rows are aggregated statewide; source-only rows and nonzero differences are retained as review findings.", "This artifact is excluded from score, factual-record, and activation inputs."] };
}
