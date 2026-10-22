import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";
import { type Cell, cells, count } from "./layout-columns";

/**
 * South Dakota Secretary of State, 2024 general election official canvass
 * with the State Canvassing Board certificate (PDF exported from Excel). The
 * build reads its pinned `pdftotext -layout` extract. Each race block opens
 * with a title ("State Senator District 05", sometimes wrapped over two or
 * three lines), then candidate headings "Name - PARTY" whose words wrap
 * within their column, county rows, and a "Total" row with one total per
 * candidate in column order. Each heading ends in a party code; heading
 * words are placed under the nearest party code, taken left to right.
 *
 * All 35 Senate districts and every House seat were on the 2024 ballot, with
 * uncontested races listed. House districts elect two members together (vote
 * for two), except 26 and 28, which are split into single-member subdistricts
 * 26A/26B and 28A/28B as the roster labels them. South Dakota has no write-in
 * voting. Minnehaha County's recount of House District 15 moved each
 * candidate's total by one or two votes (scanned county certificate); the
 * statewide canvass totals are kept, a margin change under 0.05 points.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "sd-2024-general-canvass-with-certificate-pdf",
    url: "https://sdsos.gov/elections-voting/assets/Archive/2024%20Assets/Recount-Canvass-and-Canvass-Docs-General/2024GeneralElectionCanvassWithCert.pdf",
    path: "data/source/rapid/state-general/sd/2024-general-canvass-with-certificate.pdf",
    cycleYear: 2024,
    electionDate: "2024-11-05",
    note: "35 Senate contests and 37 House contests (33 two-seat districts and subdistricts 26A, 26B, 28A, 28B).",
    pdfLayoutExtract: true,
  },
];

const fail = (code: string): never => { throw new Error(`SOUTH_DAKOTA_GENERAL_${code}`); };
const tidy = (value: string): string => value.replace(/\s+/g, " ").trim();
const PARTY = /^(?:DEM|REP|LIB|IND|CON|NON|NPA)$/;
const TITLE = /^State (Senator|Representative) District (\d+)([AB]?)$/;

const nearest = (anchors: readonly number[], centre: number): number => anchors.reduce((best, anchor, index) => Math.abs(anchor - centre) < Math.abs(anchors[best]! - centre) ? index : best, 0);

/**
 * Splits a heading cell where pdftotext set two candidates' text one space apart. A cell breaks after "Name -" when a
 * name follows and after "- PARTY" when more words follow ("Steve Natz - DEM Chris Karr - REP"). A remaining segment
 * whose words fall under two columns with no hyphen between the names ("Amy D. Rambow Josephine Garcia -") breaks
 * where a name word changes column, but only when both parts keep two or more words, so a given name is not torn
 * from its surname ("Joni Tschetter -") and a trailing "- DEM" stays with its name.
 */
function splitHeading(cell: Cell, anchors: readonly number[]): Cell[] {
  const words = [...cell.text.matchAll(/\S+/g)].map((match) => ({ text: match[0]!, start: cell.start + match.index! }));
  const segments: (typeof words)[] = [[]];
  words.forEach((word, index) => {
    const previous = words[index - 1];
    if (previous && ((previous.text === "-" && !PARTY.test(word.text)) || (PARTY.test(previous.text) && words[index - 2]?.text === "-"))) segments.push([]);
    segments[segments.length - 1]!.push(word);
  });
  const parts = segments.flatMap((segment) => {
    const columns = segment.map((word) => nearest(anchors, word.start + word.text.length / 2));
    const split = columns.findIndex((column, index) => index >= 2 && index <= segment.length - 2 && column !== columns[index - 1] && segment[index]!.text !== "-" && !PARTY.test(segment[index]!.text));
    return split > 0 ? [segment.slice(0, split), segment.slice(split)] : [segment];
  });
  return parts.map((part) => {
    const start = part[0]!.start, end = part[part.length - 1]!.start + part[part.length - 1]!.text.length;
    return { text: part.map((word) => word.text).join(" "), start, end, centre: (start + end) / 2 };
  });
}

function parse(bytes: Buffer): RawGeneralContest[] {
  const lines = bytes.toString("utf8").replace(/\f/g, "\n").split(/\r?\n/);
  const contests: RawGeneralContest[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*State\b/.test(lines[index]!)) continue;
    // A title wraps over at most three non-blank lines ("State" / "Representative" / "District 28B").
    let title = "", cursor = index;
    while (cursor < lines.length && cursor < index + 4 && !TITLE.test(title)) {
      if (lines[cursor]!.trim() !== "") title = tidy(`${title} ${lines[cursor]}`);
      cursor++;
    }
    const match = title.match(TITLE);
    if (!match) continue;
    // Heading lines end with the "County" column label, which can share a line with heading words; a county row whose
    // counts wrap to the next line ("Lincoln") follows it.
    const heading: string[] = [];
    while (cursor < lines.length && !cells(lines[cursor]!).some((cell) => count(cell.text) !== null)) {
      const line = lines[cursor++]!;
      heading.push(line.replace(/^(\s*)County\b/, (_all, lead: string) => `${lead}      `));
      if (/^\s*County\b/.test(line)) break;
    }
    let totals: Cell[] | null = null;
    for (; cursor < lines.length; cursor++) {
      if (/^\s*Total\s/.test(lines[cursor]!)) { totals = cells(lines[cursor]!).slice(1); break; }
      if (/^\s*State\b/.test(lines[cursor]!)) break;
    }
    if (!totals || totals.length === 0) return fail(`TOTALS_MISSING:${title}`);
    // Each heading ends in one party code, so the codes' centres, in left-to-right order, mark the columns.
    const anchors = heading.flatMap((line) => [...line.matchAll(/\S+/g)].filter((word) => PARTY.test(word[0]!)).map((word) => word.index! + word[0]!.length / 2)).sort((left, right) => left - right);
    if (anchors.length !== totals.length) return fail(`PARTY_COUNT:${title}:${anchors.length}/${totals.length}`);
    const columns = anchors.map(() => [] as string[]);
    for (const line of heading) for (const cell of cells(line).flatMap((part) => splitHeading(part, anchors))) columns[nearest(anchors, cell.centre)]!.push(cell.text);
    const chamber = match[1] === "Senator" ? "upper" as const : "lower" as const;
    const district = `${Number(match[2])}${match[3]}`;
    contests.push({
      chamber, district, ...(chamber === "lower" && match[3] === "" ? { seats: 2 } : {}),
      candidates: columns.map((parts, column) => {
        // A surname hyphen at a line end leaves "Sutton- Butler".
        const candidate = tidy(parts.join(" ")).replace(/(\p{L})- (\p{L})/gu, "$1-$2").match(/^(.+?) ?- ?([A-Z]{3})$/);
        if (!candidate || !PARTY.test(candidate[2]!)) return fail(`HEADING:${title}:${tidy(parts.join(" "))}`);
        return { name: candidate[1]!, rawParty: candidate[2]!, votes: count(totals![column]!.text) ?? fail(`TOTAL_CELL:${title}:${totals![column]!.text}`) };
      }),
    });
    index = cursor;
  }
  return contests;
}

export const SOUTH_DAKOTA_GENERAL: StateGeneralAdapter = {
  stateCode: "SD",
  authority: "South Dakota Secretary of State, 2024 general election official canvass",
  sources: SOURCES,
  expectedContests: { "sd-2024-general-canvass-with-certificate-pdf": 72 },
  parse: (bytes) => parse(bytes),
};
