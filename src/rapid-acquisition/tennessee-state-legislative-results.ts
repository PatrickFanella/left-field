import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readSourceLock } from "./intake/source-lock";
import { readWorkbookCsvExtract, workbookExtractId } from "./intake/workbook-extract";
import { byteCompare, hash, sha, exact } from "./shared";

export interface TennesseeStateLegislativeSourceObservation {
  readonly sourceName: string;
  readonly votes: number;
  readonly entryKind: "source_named_candidate" | "source_no_candidate_qualified_marker";
}
export interface TennesseeStateLegislativeContest {
  readonly contestId: string;
  readonly cycleYear: 2022 | 2024;
  readonly electionDate: "2022-08-04" | "2024-08-01";
  readonly chamber: "upper" | "lower";
  readonly district: string;
  readonly rawOfficeTitle: string;
  readonly rawParty: "D" | "R";
  readonly sourceObservations: readonly TennesseeStateLegislativeSourceObservation[];
  readonly precinctRows: number;
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_secretary_precinct_workbook_retained";
  readonly certificationStatus: "separate_certification_instrument_not_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly sourceLockIds: readonly string[];
  readonly formulaEligible: false;
  readonly contestSha256: string;
}
export interface TennesseeStateLegislativeResults {
  readonly schema: "rapid-tennessee-state-legislative-primary-results-v1";
  readonly version: 1;
  readonly contests: readonly TennesseeStateLegislativeContest[];
  readonly contestSetSha256: string;
  readonly summary: Readonly<{ officeDistrictRows: 231; partyContests: 462; sourceObservationRows: 571; candidateVotes: 1793535; precinctPartyRows: 12938; sourceNoCandidateQualifiedMarkers: number; formulaEligibleContests: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { year: 2022 as const, id: "tn-2022-primary-precinct-results", path: "data/source/rapid/house-primary/tn/2022/primary-results-by-precinct.xlsx", url: "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/20220804ResultsbyPrecinct.xlsx", bytes: 5883199, sha256: "e48044d15f8bac515280dae069ef0e7468a07424df6826cd5d62985c312f9849", date: "2022-08-04" as const },
  { year: 2024 as const, id: "tn-2024-primary-precinct-results", path: "data/source/rapid/house-primary/tn/2024/primary-results-by-precinct.xlsx", url: "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/20240801AllbyPrecinct.xlsx", bytes: 1613430, sha256: "3e3589f37aa7680894e711151905dcdbb121b16d32c37414f6e28ddd42090e65", date: "2024-08-01" as const },
] as const;
const HEADER = ["COUNTY","PRCTSEQ","PRECINCT","BALSEQID","JURISID","SECJURISID","CANDGROUP","OFFICENAME","ELECTDATE","ELECTTYPE",...Array.from({ length: 10 }, (_, index) => [`COL${index + 1}HDG`,`RNAME${index + 1}`,`PARTY${index + 1}`,`PVTALLY${index + 1}`]).flat()];
const EXPECTED = { 2022: { offices: 116, contests: 232, observations: 287, votes: 974115, precinctRows: 6325 }, 2024: { offices: 115, contests: 230, observations: 284, votes: 819420, precinctRows: 6613 } } as const;

function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quote = false;
  for (let index = 0; index < input.length; index++) { const char = input[index]; if (quote) { if (char === '"' && input[index + 1] === '"') { field += '"'; index++; } else if (char === '"') quote = false; else field += char; } else if (char === '"') quote = true; else if (char === ",") { row.push(field); field = ""; } else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; } else field += char; }
  if (quote) throw new Error("TENNESSEE_STATE_LEGISLATIVE_CSV_UNTERMINATED_QUOTE"); if (field || row.length) { row.push(field); rows.push(row); } return rows;
}

function expectedDistricts(year: 2022 | 2024, chamber: "upper" | "lower"): Set<string> {
  if (chamber === "lower") return new Set(Array.from({ length: 99 }, (_, index) => String(index + 1).padStart(3, "0")));
  return new Set(Array.from({ length: year === 2022 ? 17 : 16 }, (_, index) => String(year === 2022 ? index * 2 + 1 : index * 2 + 2).padStart(2, "0")));
}

function extract(csvText: string, source: typeof SOURCES[number]): TennesseeStateLegislativeContest[] {
  {
    // The CSV is the pinned LibreOffice extract of the retained workbook (see intake/workbook-extract.ts); no conversion runs here.
    const rows = parseCsv(csvText); if (!exact(rows[0], HEADER)) throw new Error(`TENNESSEE_STATE_LEGISLATIVE_HEADER_INVALID:${source.year}`);
    const grouped = new Map<string, { chamber: "upper" | "lower"; district: string; title: string; party: "D" | "R"; precinctRows: number; totals: Map<string, number> }>();
    for (const row of rows.slice(1)) {
      const title = row[7]?.trim() ?? "", upper = title.match(/^Tennessee Senate District (\d+)$/), lower = title.match(/^Tennessee House of Representatives District (\d+)$/); if (!upper && !lower) continue;
      const electionType = row[9]?.trim(), party = electionType === "Democratic Primary" ? "D" as const : electionType === "Republican Primary" ? "R" as const : null; if (!party) throw new Error(`TENNESSEE_STATE_LEGISLATIVE_PARTY_INVALID:${source.year}`);
      const chamber = upper ? "upper" as const : "lower" as const, district = String(Number((upper ?? lower)![1])).padStart(chamber === "upper" ? 2 : 3, "0"), key = `${chamber}:${district}:${party}`;
      const group = grouped.get(key) ?? { chamber, district, title, party, precinctRows: 0, totals: new Map<string, number>() }; group.precinctRows++;
      for (let slot = 0; slot < 10; slot++) { const name = row[11 + slot * 4]?.trim(), rawParty = row[12 + slot * 4]?.trim(), votes = row[13 + slot * 4]?.trim(); if (!name && !votes) continue; const expectedParty = party === "D" ? "Democratic" : "Republican"; if (!name || rawParty !== expectedParty || !votes || !/^\d+$/.test(votes)) throw new Error(`TENNESSEE_STATE_LEGISLATIVE_OBSERVATION_INVALID:${source.year}`); group.totals.set(name, (group.totals.get(name) ?? 0) + Number(votes)); }
      grouped.set(key, group);
    }
    for (const chamber of ["lower", "upper"] as const) { const actual = new Set([...grouped.values()].filter((row) => row.chamber === chamber).map((row) => row.district)); if (!exact([...actual].sort(byteCompare), [...expectedDistricts(source.year, chamber)].sort(byteCompare))) throw new Error(`TENNESSEE_STATE_LEGISLATIVE_DISTRICT_CLOSURE_INVALID:${source.year}:${chamber}`); }
    const contests = [...grouped.values()].map((group) => {
      const sourceObservations = [...group.totals].map(([sourceName, votes]) => ({ sourceName, votes, entryKind: sourceName === "No Candidate Qualified" ? "source_no_candidate_qualified_marker" as const : "source_named_candidate" as const }));
      const unsigned = { contestId: `tn:state-leg-primary:${source.year}:${group.chamber}:${group.district}:${group.party}`, cycleYear: source.year, electionDate: source.date, chamber: group.chamber, district: group.district, rawOfficeTitle: group.title, rawParty: group.party, sourceObservations, precinctRows: group.precinctRows, totalVotes: sourceObservations.reduce((sum, row) => sum + row.votes, 0), sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_secretary_precinct_workbook_retained" as const, certificationStatus: "separate_certification_instrument_not_retained" as const, winnerIdentity: null, identity: null, sourceLockIds: [source.id], formulaEligible: false as const };
      return { ...unsigned, contestSha256: hash("dsa-seats:rapid-tennessee-state-legislative-contest:v1", unsigned) };
    });
    contests.sort((left, right) => byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
    const expected = EXPECTED[source.year], offices = new Set(contests.map((row) => `${row.chamber}:${row.district}`)).size;
    if (offices !== expected.offices || contests.length !== expected.contests || contests.reduce((sum, row) => sum + row.sourceObservations.length, 0) !== expected.observations || contests.reduce((sum, row) => sum + row.totalVotes, 0) !== expected.votes || contests.reduce((sum, row) => sum + row.precinctRows, 0) !== expected.precinctRows) throw new Error(`TENNESSEE_STATE_LEGISLATIVE_SUMMARY_INVALID:${source.year}`);
    return contests;
  }
}

export function buildTennesseeStateLegislativeResults(root = process.cwd()): TennesseeStateLegislativeResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, contests: TennesseeStateLegislativeContest[] = [];
  for (const source of SOURCES) {
    const bytes = readFileSync(join(root, source.path)), expectedLock = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "source", parentIds: [] };
    if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || lock.entries.filter((entry) => entry.id === source.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.id)), expectedLock)) throw new Error(`TENNESSEE_STATE_LEGISLATIVE_SOURCE_INVALID:${source.year}`);
    if (bytes.subarray(0, 2).toString("binary") !== "PK") throw new Error(`TENNESSEE_STATE_LEGISLATIVE_WORKBOOK_INVALID:${source.year}`);
    contests.push(...extract(readWorkbookCsvExtract(readSourceLock(root), workbookExtractId(source.id), source.id, root), source));
  }
  contests.sort((left, right) => left.cycleYear - right.cycleYear || byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
  const markers = contests.reduce((sum, row) => sum + row.sourceObservations.filter((entry) => entry.entryKind === "source_no_candidate_qualified_marker").length, 0);
  const summary = { officeDistrictRows: 231 as const, partyContests: 462 as const, sourceObservationRows: 571 as const, candidateVotes: 1793535 as const, precinctPartyRows: 12938 as const, sourceNoCandidateQualifiedMarkers: markers, formulaEligibleContests: 0 as const };
  if (contests.length !== summary.partyContests || contests.some((row) => row.formulaEligible || row.sourceWinnerStatus !== "not_marked_by_source")) throw new Error("TENNESSEE_STATE_LEGISLATIVE_LIFECYCLE_INVALID");
  const contestSetSha256 = hash("dsa-seats:rapid-tennessee-state-legislative-contest-set:v1", contests), unsigned = { schema: "rapid-tennessee-state-legislative-primary-results-v1" as const, version: 1 as const, contests, contestSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-tennessee-state-legislative-package:v1", unsigned) };
}
export function validateTennesseeStateLegislativeResults(value: unknown, root = process.cwd()): TennesseeStateLegislativeResults { const expected = buildTennesseeStateLegislativeResults(root); if (!exact(value, expected)) throw new Error("TENNESSEE_STATE_LEGISLATIVE_RESULTS_INVALID"); return value as TennesseeStateLegislativeResults; }
