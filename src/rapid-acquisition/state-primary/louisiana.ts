import { unzipSync } from "fflate";

import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Louisiana Secretary of State, results workbooks of the first closed party primary (May 16, 2026) and the second
 * party primary (June 27, 2026), from the Secretary of State's results bucket; the workbooks were published after
 * each canvass. Louisiana's closed party primaries cover only U.S. Senate in 2026: the Governor suspended the
 * May 16 U.S. House party primaries so the Legislature could redraw the congressional map, and the House races
 * moved to the November open primary. No legislative or governor seat was up.
 *
 * The workbook's XML uses an `x:` namespace prefix the shared workbook reader does not handle, so the first sheet
 * (Multi-Parish(Parish)) is read here directly: a contest heading row, a row of "Name (PARTY)" columns, a "Total
 * Votes" row, then one row per parish. Parish rows are summed and must equal the printed totals.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "la-2026-primary-results-workbook", url: "https://s3-us-west-2.amazonaws.com/mediaresults.sos.la.gov/HumanReadableElectionResults/20260516/Election+Results+(05-16-2026).xlsx", path: "data/source/rapid/state-primary/la/2026-primary-results.xlsx", cycleYear: 2026, electionDate: "2026-05-16", note: "First party primary: U.S. Senate, Democratic and Republican." },
  { id: "la-2026-primary-runoff-results-workbook", url: "https://s3-us-west-2.amazonaws.com/mediaresults.sos.la.gov/HumanReadableElectionResults/20260627/Election+Results+(06-27-2026).xlsx", path: "data/source/rapid/state-primary/la/2026-primary-runoff-results.xlsx", cycleYear: 2026, electionDate: "2026-06-27", note: "Second party primary: U.S. Senate, Democratic and Republican." },
];

const fail = (code: string): never => { throw new Error(`LOUISIANA_PRIMARY_${code}`); };
const decode = (text: string): string => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Rows of the first sheet as arrays of cell text; cells carry no references, so position is column order. */
function firstSheetRows(bytes: Buffer): string[][] {
  const files = unzipSync(new Uint8Array(bytes));
  const xml = Buffer.from(files["xl/worksheets/sheet1.xml"] ?? fail("SHEET1_MISSING")).toString("utf8");
  if (!xml.includes("<x:sheetData>")) fail("SHEET_SHAPE");
  return [...xml.matchAll(/<x:row\b[^>]*?(?:\/>|>([\s\S]*?)<\/x:row>)/g)].map((row) =>
    [...(row[1] ?? "").matchAll(/<x:c\b[^>]*?(?:\/>|>([\s\S]*?)<\/x:c>)/g)].map((cell) => decode(cell[1]?.match(/<x:(?:t|v)>([\s\S]*?)<\/x:(?:t|v)>/)?.[1] ?? "").trim()));
}

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const rows = firstSheetRows(bytes), contests: RawPrimaryContest[] = [];
  for (let index = 0; index < rows.length; index++) {
    const heading = rows[index]![0]?.match(/^U\. S\. Senator -- (Democratic|Republican) Party$/);
    if (!heading) continue;
    const names = rows[index + 1]!, totals = rows[index + 2]!;
    if (totals[0] !== "Total Votes") fail(`TOTAL_ROW:${source.id}:${heading[1]}`);
    const candidates = names.flatMap((label, column) => {
      if (column === 0 || label === "") return [];
      const match = label.match(/^(.+) \(([A-Z]+)\)$/) ?? fail(`CANDIDATE:${label}`);
      const total = totals[column] ?? "";
      if (!/^\d+$/.test(total)) fail(`TOTAL:${label}`);
      let sum = 0;
      for (let row = index + 3; row < rows.length && (rows[row]![0] ?? "") !== ""; row++) {
        const value = rows[row]![column] ?? "";
        if (!/^\d+$/.test(value)) fail(`PARISH_VOTES:${label}:${row}`);
        sum += Number(value);
      }
      if (sum !== Number(total)) fail(`RECONCILIATION:${label}`);
      return [{ name: match[1]!, votes: Number(total) }];
    });
    contests.push({ office: "us_senate", district: null, rawParty: heading[1]!, ...(source.id.includes("runoff") ? { stage: "runoff" as const } : {}), candidates });
  }
  return contests;
}

export const LOUISIANA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "LA",
  authority: "Louisiana Secretary of State, 2026 closed party primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "la-2026-primary-results-workbook": 2, "la-2026-primary-runoff-results-workbook": 2 },
  parse: (bytes, source) => parse(bytes, source),
};
