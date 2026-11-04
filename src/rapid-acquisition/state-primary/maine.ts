import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Maine Secretary of State, official tabulations of the June 9, 2026 primary,
 * as listed on the 2026 election results page (retained as
 * maine-2026-election-results-index). Every party primary for an office has
 * its own workbook, and unopposed candidates are printed, so every party that
 * fielded a candidate has a contest.
 *
 * Plurality workbooks ("FINAL"): one block per district (or one statewide
 * block). A block opens with a header row ("DIS", "CTY", "Municipality",
 * then one column per candidate as "LAST, FIRST", then "BLANK" and "TBC";
 * one header misspells "Municipalitly"), followed by a residence row (and a
 * "(Declared Write-in)" row for declared write-in candidates, who are kept
 * as named candidates), municipality rows, a "STATE UOCAVA" row, sometimes
 * county subtotal rows ("YOR Total", "AND Totals"), and a closing "Total" / "State
 * Total(s)" row. The adapter sums the municipality and UOCAVA rows and fails
 * if the printed total disagrees.
 *
 * Ranked-choice contests (governor, both parties; the Democratic 2nd
 * District; Republican Senate 4 and House 58) are read from the official RCV
 * summary report, whose "Winner(s)" line is the source's winner mark; the
 * contest reports the final round's tallies, eliminated candidates at zero.
 *
 * The official host refuses this network (HTTP 403). The CD1 Democratic
 * workbook and the CD2 Democratic RCV summary are the bytes already retained
 * from maine.gov (maine-2026-house-democratic-primary-cd01-results and
 * maine-2026-house-democratic-primary-cd02-rcv-summary), copied to these paths
 * by hand. Every other file was placed by hand from the Internet Archive
 * capture named as its url.
 */
type Spec = StateGeneralSource & { office: PrimaryOffice; party: string; district?: string; kind: "workbook" | "rcv" };
const ARCHIVE = (stamp: string, file: string): string => `https://web.archive.org/web/${stamp}id_/https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/${file}`;
const OFFICIAL = (file: string): string => `https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/${file}`;
const DIR = "data/source/rapid/state-primary/me";
const archived = "Internet Archive capture of the official file; maine.gov refuses this network. Placed by hand.";
const copied = "Copied by hand from the bytes already retained from maine.gov under the same official url.";
const base = { cycleYear: 2026, electionDate: "2026-06-09" } as const;
const SOURCES: readonly Spec[] = [
  { ...base, id: "me-2026-primary-us-senate-democratic-xlsx", url: ARCHIVE("20260917052339", "US%20Senate%20DEM%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-us-senate-dem.xlsx`, note: `U.S. Senate, Democratic. ${archived}`, office: "us_senate", party: "Democratic", kind: "workbook" },
  { ...base, id: "me-2026-primary-us-senate-republican-xlsx", url: ARCHIVE("20260917052345", "US%20Senate%20REP%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-us-senate-rep.xlsx`, note: `U.S. Senate, Republican. ${archived}`, office: "us_senate", party: "Republican", kind: "workbook" },
  { ...base, id: "me-2026-primary-us-house-1-democratic-xlsx", url: OFFICIAL("Rep%20to%20Congress%20Dist%201%20FINAL.xlsx"), path: `${DIR}/2026-primary-us-house-1-dem.xlsx`, note: `U.S. House District 1, Democratic. ${copied}`, office: "us_house", party: "Democratic", district: "1", kind: "workbook" },
  { ...base, id: "me-2026-primary-us-house-1-republican-xlsx", url: ARCHIVE("20260805213857", "Rep%20to%20Congress%20Dis%201%20REP%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-us-house-1-rep.xlsx`, note: `U.S. House District 1, Republican. ${archived}`, office: "us_house", party: "Republican", district: "1", kind: "workbook" },
  { ...base, id: "me-2026-primary-us-house-2-republican-xlsx", url: ARCHIVE("20260707223502", "Rep%20to%20Congress%20Dis%202%20REP%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-us-house-2-rep.xlsx`, note: `U.S. House District 2, Republican. ${archived}`, office: "us_house", party: "Republican", district: "2", kind: "workbook" },
  { ...base, id: "me-2026-primary-state-senate-democratic-xlsx", url: ARCHIVE("20260707223501", "State%20Senate%20DEM%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-state-senate-dem.xlsx`, note: `State Senate, Democratic, every district. ${archived}`, office: "state_upper", party: "Democratic", kind: "workbook" },
  { ...base, id: "me-2026-primary-state-senate-republican-xlsx", url: ARCHIVE("20260707223501", "State%20Senate%20REP%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-state-senate-rep.xlsx`, note: `State Senate, Republican, every district. ${archived}`, office: "state_upper", party: "Republican", kind: "workbook" },
  { ...base, id: "me-2026-primary-state-house-democratic-xlsx", url: ARCHIVE("20260707223500", "Rep%20to%20the%20Legislature%20DEM%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-state-house-dem.xlsx`, note: `Representative to the Legislature, Democratic, every district. ${archived}`, office: "state_lower", party: "Democratic", kind: "workbook" },
  { ...base, id: "me-2026-primary-state-house-green-independent-xlsx", url: ARCHIVE("20260707223501", "Rep%20to%20Legislature%20Green%20Independent.xlsx"), path: `${DIR}/2026-primary-state-house-green.xlsx`, note: `Representative to the Legislature, Green Independent. ${archived}`, office: "state_lower", party: "Green Independent", kind: "workbook" },
  { ...base, id: "me-2026-primary-state-house-republican-xlsx", url: ARCHIVE("20260707223504", "Rep%20to%20the%20Legislature%20REP%20-%20FINAL.xlsx"), path: `${DIR}/2026-primary-state-house-rep.xlsx`, note: `Representative to the Legislature, Republican, every district. ${archived}`, office: "state_lower", party: "Republican", kind: "workbook" },
  { ...base, id: "me-2026-primary-us-house-2-democratic-rcv-summary-pdf", url: OFFICIAL("CG2%20Democratic%20RCV%20Summary%20Report.pdf"), path: `${DIR}/2026-primary-us-house-2-dem-rcv-summary.pdf`, note: `U.S. House District 2, Democratic, ranked-choice summary. ${copied}`, pdfLayoutExtract: true, office: "us_house", party: "Democratic", district: "2", kind: "rcv" },
  { ...base, id: "me-2026-primary-governor-democratic-rcv-summary-pdf", url: ARCHIVE("20260819175125", "GOV%20Democratic%20RCV%20Summary%20Report.pdf"), path: `${DIR}/2026-primary-governor-dem-rcv-summary.pdf`, note: `Governor, Democratic, ranked-choice summary. ${archived}`, pdfLayoutExtract: true, office: "governor", party: "Democratic", kind: "rcv" },
  { ...base, id: "me-2026-primary-governor-republican-rcv-summary-pdf", url: ARCHIVE("20260707223505", "GOV%20Republican%20RCV%20Summary%20Reportxlsx.pdf"), path: `${DIR}/2026-primary-governor-rep-rcv-summary.pdf`, note: `Governor, Republican, ranked-choice summary. ${archived}`, pdfLayoutExtract: true, office: "governor", party: "Republican", kind: "rcv" },
  { ...base, id: "me-2026-primary-state-senate-4-republican-rcv-summary-pdf", url: ARCHIVE("20260707223503", "REP%20SS4%20RCV%20Summary%20Report.pdf"), path: `${DIR}/2026-primary-state-senate-4-rep-rcv-summary.pdf`, note: `State Senate District 4, Republican, ranked-choice summary. ${archived}`, pdfLayoutExtract: true, office: "state_upper", party: "Republican", district: "4", kind: "rcv" },
  { ...base, id: "me-2026-primary-state-house-58-republican-rcv-summary-pdf", url: ARCHIVE("20260707223457", "REP%20SR58%20RCV%20Summary%20Report.pdf"), path: `${DIR}/2026-primary-state-house-58-rep-rcv-summary.pdf`, note: `Representative to the Legislature District 58, Republican, ranked-choice summary. ${archived}`, pdfLayoutExtract: true, office: "state_lower", party: "Republican", district: "58", kind: "rcv" },
];

const ACCOUNTING = /^(blank|blanks|tbc|tbd|)$/i;
const fail = (code: string): never => { throw new Error(`MAINE_PRIMARY_${code}`); };
const integer = (value: string): number => { const trimmed = value.replace(/,/g, "").trim(); return trimmed === "" ? 0 : /^\d+$/.test(trimmed) ? Number(trimmed) : fail(`INTEGER_INVALID:${value}`); };
/** "SHORT, STANLEY BYRON JR." becomes "STANLEY BYRON SHORT JR."; "Bridges, Dexter E., Jr." becomes "Dexter E. Bridges Jr.". */
const displayName = (value: string): string => {
  const [last, first, comma] = value.split(",").map((part) => part.trim());
  if (!first) return value.trim();
  if (comma) return `${first} ${last} ${comma}`;
  const suffix = first.match(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i)?.[1];
  return suffix ? `${first.slice(0, -suffix.length).trim()} ${last} ${suffix}` : `${first} ${last}`;
};

function parseWorkbook(bytes: Buffer, spec: Spec): RawPrimaryContest[] {
  const sheet = readWorkbookSheet(bytes, "Sheet1");
  const cell = (column: number, row: number): string => sheet.at(column, row).trim();
  // A block's header row opens with "DIS" (district files) or "CTY" (statewide files); the municipality label sits
  // in the next column after "CTY", on the header row or (House District 3) on the row below.
  const starts: number[] = [];
  for (let row = 1; row <= sheet.maxRow; row++) if (/^(DIS|CTY)$/.test(cell(1, row))) starts.push(row);
  if (starts.length === 0) fail(`NO_BLOCK:${spec.id}`);
  return starts.map((start, index) => {
    const end = (starts[index + 1] ?? sheet.maxRow + 1) - 1;
    const districtColumn = cell(1, start) === "DIS" ? 1 : 0, municipality = districtColumn ? 3 : 2;
    if (!/^CTY$/i.test(cell(municipality - 1, start)) || ![cell(municipality, start), cell(municipality, start + 1)].some((label) => /^Municipal/i.test(label))) fail(`HEADER:${spec.id}:${start}`);
    const columns: { column: number; name: string }[] = [];
    for (let column = municipality + 1; column <= sheet.maxColumn; column++) if (!ACCOUNTING.test(cell(column, start))) columns.push({ column, name: displayName(cell(column, start)) });
    if (columns.length === 0) fail(`NO_CANDIDATES:${spec.id}:${start}`);
    const sums = columns.map(() => 0), districts = new Set<string>();
    let totalRow = 0, data = false;
    for (let row = start + 1; row <= end; row++) {
      const label = cell(municipality, row);
      if (/^(state )?totals?$/i.test(label)) { totalRow = row; break; }
      if (label === "" || / totals?$/i.test(label)) continue;
      // Residence and "(Declared Write-in)" rows sit between the header and the first municipality.
      if (!data && columns.some((entry) => !/^\d*$/.test(cell(entry.column, row)))) continue;
      data = true;
      if (districtColumn) districts.add(String(integer(cell(districtColumn, row))));
      columns.forEach((entry, position) => { sums[position]! += integer(cell(entry.column, row)); });
    }
    if (totalRow === 0) fail(`TOTAL_ROW_MISSING:${spec.id}:${start}`);
    columns.forEach((entry, position) => { if (integer(cell(entry.column, totalRow)) !== sums[position]) fail(`TOTAL_MISMATCH:${spec.id}:${start}:${entry.name}`); });
    let district: string | null = null;
    if (spec.office === "state_lower" || spec.office === "state_upper") {
      if (districts.size !== 1) fail(`DISTRICT_AMBIGUOUS:${spec.id}:${start}:${[...districts].join(",")}`);
      district = [...districts][0]!;
    } else if (spec.office === "us_house") {
      if (districts.size > 1 || (districts.size === 1 && !districts.has(spec.district!))) fail(`HOUSE_DISTRICT:${spec.id}:${[...districts].join(",")}`);
      district = spec.district!;
    }
    return { office: spec.office, district, rawParty: spec.party, candidates: columns.map((entry, position) => ({ name: entry.name, votes: sums[position]! })) };
  });
}

/** An RCV summary report's pdftotext layout: "Winner(s)", a "Rounds" header, then one line per candidate with a count per round. */
function parseRcvSummary(bytes: Buffer, spec: Spec): RawPrimaryContest[] {
  const lines = bytes.toString("utf8").split(/\r?\n/);
  const winner = lines.map((line) => line.match(/^Winner\(s\)\s+(.+?)\s*$/)?.[1]).find((value) => value !== undefined) ?? fail(`WINNER_MISSING:${spec.id}`);
  const rounds = lines.findIndex((line) => /^Rounds\s+Round 1\b/.test(line));
  if (rounds < 0) fail(`ROUNDS_MISSING:${spec.id}`);
  const roundCount = (lines[rounds]!.match(/Round \d+/g) ?? []).length;
  const candidates: { name: string; votes: number; winner?: boolean }[] = [];
  for (const line of lines.slice(rounds + 1)) {
    if (/^(Eliminated|Elected)\b/.test(line) || line.trim() === "") continue;
    const match = line.match(/^(.+?)\s{2,}([\d\s]+)$/);
    if (!match) fail(`LINE:${spec.id}:${line}`);
    const counts = match![2]!.trim().split(/\s+/).map(Number);
    if (counts.length !== roundCount) fail(`ROUND_COUNT:${spec.id}:${line}`);
    if (/^Exhausted Ballots$/i.test(match![1]!.trim())) break;
    candidates.push({ name: displayName(match![1]!), votes: counts[roundCount - 1]!, ...(match![1]!.trim() === winner ? { winner: true } : {}) });
  }
  if (candidates.filter((candidate) => candidate.winner).length !== 1) fail(`WINNER_UNMATCHED:${spec.id}:${winner}`);
  return [{ office: spec.office, district: spec.district ?? null, rawParty: spec.party, candidates }];
}

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const spec = SOURCES.find((candidate) => candidate.id === source.id) ?? fail(`SOURCE_UNKNOWN:${source.id}`);
  return spec.kind === "rcv" ? parseRcvSummary(bytes, spec) : parseWorkbook(bytes, spec);
}

export const MAINE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "ME",
  authority: "Maine Secretary of State, official 2026 primary tabulations and ranked-choice summary reports",
  system: "partisan",
  sources: SOURCES.map(({ id, url, path, cycleYear, electionDate, note, pdfLayoutExtract }) => ({ id, url, path, cycleYear, electionDate, note, ...(pdfLayoutExtract ? { pdfLayoutExtract } : {}) })),
  expectedContests: {
    "me-2026-primary-us-senate-democratic-xlsx": 1, "me-2026-primary-us-senate-republican-xlsx": 1, "me-2026-primary-us-house-1-democratic-xlsx": 1, "me-2026-primary-us-house-1-republican-xlsx": 1,
    "me-2026-primary-us-house-2-republican-xlsx": 1, "me-2026-primary-state-senate-democratic-xlsx": 34, "me-2026-primary-state-senate-republican-xlsx": 25, "me-2026-primary-state-house-democratic-xlsx": 137,
    "me-2026-primary-state-house-green-independent-xlsx": 1, "me-2026-primary-state-house-republican-xlsx": 127, "me-2026-primary-us-house-2-democratic-rcv-summary-pdf": 1,
    "me-2026-primary-governor-democratic-rcv-summary-pdf": 1, "me-2026-primary-governor-republican-rcv-summary-pdf": 1, "me-2026-primary-state-senate-4-republican-rcv-summary-pdf": 1, "me-2026-primary-state-house-58-republican-rcv-summary-pdf": 1,
  },
  parse,
};
