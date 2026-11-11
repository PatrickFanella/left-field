import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";
import { count } from "../state-general/layout-columns";

/**
 * Oregon Secretary of State, official abstract of votes for the May 19, 2026
 * primary (PDF); the build reads its pinned `pdftotext -layout` extract. The
 * same bytes are retained for the House layer as
 * `or-2026-primary-official-abstract-pdf`.
 *
 * Under a centred office heading ("US Senator", "US Representative",
 * "Governor", "State Senator", "State Representative"), district offices
 * print "5th District" (sometimes wrapped as "18th" / "District"), then each
 * party block: the party ("Democrat", "Republican"), a row of surnames ("*"
 * marks the nominee) ending in "Misc." (write-ins), a row "County" followed by
 * given names (which can wrap to a further line), one row per county and, for
 * multi-county contests, a "Total" row. A block too wide for one page
 * continues on the next under "Democrat (cont.)"; its columns are appended to
 * the same contest, and only the last part carries "Misc.".
 *
 * Every column of the PDF is right-aligned: a name and its counts end at the
 * same x. Crowded name rows print two columns one space apart ("Moro Mendoza
 * Ruvalcaba Stine"), so each word goes to the first column whose right edge
 * (the widest county count) it does not pass by more than two characters.
 * County rows are summed per column and checked against the Total row.
 *
 * A candidate nominated by write-in on another party's ballot is printed with
 * "(WI)" after the given name and is reported as a named candidate. Unopposed
 * candidates are printed.
 */
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SOURCES: readonly StateGeneralSource[] = [
  { id: "or-2026-primary-abstract-pdf", url: "https://records.sos.state.or.us/ORSOSWebDrawer/Record/16180585/File/document", path: "data/source/rapid/state-primary/or/2026-primary-abstract.pdf", cycleYear: 2026, electionDate: "2026-05-19", note: "Official abstract of votes: U.S. Senate, 6 House districts, governor, State Senate and State House contests, Democratic and Republican.", userAgent: BROWSER, pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`OREGON_PRIMARY_${code}`); };
const OFFICES: Readonly<Record<string, RawPrimaryContest["office"]>> = { "US Senator": "us_senate", "US Representative": "us_house", Governor: "governor", "State Senator": "state_upper", "State Representative": "state_lower" };
const STATEWIDE = new Set<RawPrimaryContest["office"]>(["us_senate", "governor"]);
const EDGE_TOLERANCE = 2;

type Word = Readonly<{ text: string; end: number }>;
type Contest = { office: RawPrimaryContest["office"]; district: string | null; rawParty: string; candidates: { name: string; votes: number; winner?: boolean; writeIn?: boolean }[] };

const words = (line: string): Word[] => [...line.matchAll(/\S+/g)].map((match) => ({ text: match[0], end: match.index! + match[0].length }));
const counts = (line: string): Word[] => words(line).filter((word) => count(word.text) !== null);

/** Joins the words of a name row per column: each word belongs to the first column whose right edge it does not pass. */
function columns(rightEdges: readonly number[], line: string, where: string): string[] {
  const out = rightEdges.map(() => [] as string[]);
  for (const word of words(line)) {
    const column = rightEdges.findIndex((edge) => word.end <= edge + EDGE_TOLERANCE);
    if (column < 0) fail(`WORD_PAST_LAST_COLUMN:${where}:${word.text}`);
    out[column]!.push(word.text);
  }
  return out.map((parts) => parts.join(" "));
}

function parse(bytes: Buffer): RawPrimaryContest[] {
  const lines = bytes.toString("utf8").replace(/\f/g, "\n").split(/\r?\n/);
  const contests = new Map<string, Contest>();
  let office: RawPrimaryContest["office"] | null = null, district: string | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (/Abstract of Votes/.test(line)) continue;
    const heading = line.match(/^\s{20,}(\S.*?)\s*$/);
    if (heading) {
      const next = OFFICES[heading[1]!] ?? null;
      if (next !== office) district = null;
      office = next;
      continue;
    }
    const ordinal = line.match(/^\s*(\d+)(?:st|nd|rd|th) District\s*$/);
    if (ordinal) { district = ordinal[1]!; continue; }
    const wrapped = line.match(/^\s*(\d+)(?:st|nd|rd|th)\s*$/);
    if (wrapped && /^\s*District\s*$/.test(lines[index + 1] ?? "")) { district = wrapped[1]!; index++; continue; }
    const party = line.match(/^\s*(Democrat|Republican)( \(cont\.\))?\s*$/);
    if (!party || office === null) continue;
    if (STATEWIDE.has(office) !== (district === null)) fail(`DISTRICT:${office}:${district}:${index + 1}`);
    const where = `${office}:${district ?? "statewide"}:${party[1]}`;
    // The surname row, then "County" and the given names, which can wrap to lines without counts.
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor]!.trim() === "") cursor++;
    const surnameLine = lines[cursor++] ?? "";
    if (!/^\s*County\b/.test(lines[cursor] ?? "")) fail(`BLOCK_HEADER:${where}:${index + 1}`);
    const givenLines = [lines[cursor++]!.replace(/^(\s*)County/, "$1      ")];
    while (cursor < lines.length && lines[cursor]!.trim() !== "" && counts(lines[cursor]!).length === 0) givenLines.push(lines[cursor++]!);
    const rows: Word[][] = [];
    let total: number[] | null = null;
    for (; cursor < lines.length; cursor++) {
      const row = lines[cursor]!;
      if (row.trim() === "") break;
      const values = counts(row);
      if (/^\s+Total\b/.test(row)) { total = values.map((word) => count(word.text)!); continue; }
      // A line with no counts (the page footer) ends the block like a blank line.
      if (values.length === 0) break;
      rows.push(values);
    }
    if (rows.length === 0) fail(`NO_COUNTIES:${where}`);
    const width = rows[0]!.length;
    if (rows.some((row) => row.length !== width)) fail(`ROW_WIDTH:${where}`);
    const sums = Array.from({ length: width }, (_value, column) => rows.reduce((sum, row) => sum + count(row[column]!.text)!, 0));
    if (total && (total.length !== width || total.some((value, column) => value !== sums[column]))) fail(`TOTAL_MISMATCH:${where}`);
    const rightEdges = Array.from({ length: width }, (_value, column) => Math.max(...rows.map((row) => row[column]!.end)));
    const surnames = columns(rightEdges, surnameLine, where);
    const given = givenLines.map((text) => columns(rightEdges, text, where)).reduce((joined, row) => joined.map((value, column) => `${value} ${row[column]}`.trim()));
    const misc = surnames[width - 1] === "Misc.";
    if (surnames.some((text, column) => text === "" || (text === "Misc.") !== (misc && column === width - 1))) fail(`SURNAMES:${where}:${surnames.join("|")}`);
    if (given.some((text, column) => (text === "") !== (misc && column === width - 1))) fail(`GIVEN_NAMES:${where}:${given.join("|")}`);
    const contest = contests.get(where), continued = party[2] !== undefined;
    if (continued !== (contest !== undefined)) fail(`CONTINUATION:${where}:${index + 1}`);
    const entry: Contest = contest ?? { office, district, rawParty: party[1]!, candidates: [] };
    if (entry.candidates.some((candidate) => candidate.writeIn)) fail(`AFTER_MISC:${where}`);
    surnames.forEach((surname, column) => {
      if (misc && column === width - 1) { entry.candidates.push({ name: "Misc.", votes: sums[column]!, writeIn: true }); return; }
      const marked = surname.match(/^(\*{0,2})(.+)$/)!;
      entry.candidates.push({ name: `${given[column]!.replace(/\s*\(WI\)$/, "")} ${marked[2]}`, votes: sums[column]!, ...(marked[1] ? { winner: true } : {}) });
    });
    contests.set(where, entry);
    index = cursor;
  }
  for (const [key, contest] of contests) if (!contest.candidates.some((candidate) => candidate.writeIn)) fail(`MISC_MISSING:${key}`);
  return [...contests.values()];
}

export const OREGON_PRIMARY: StatePrimaryAdapter = {
  stateCode: "OR",
  authority: "Oregon Secretary of State, official primary abstract of votes",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "or-2026-primary-abstract-pdf": 166 },
  parse: (bytes) => parse(bytes),
};
