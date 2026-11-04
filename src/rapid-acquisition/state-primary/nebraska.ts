import { assign, cells, count } from "../state-general/layout-columns";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Nebraska Board of State Canvassers, official report of the May 12, 2026
 * primary (the Secretary of State's canvass book, certified June 8), read
 * from its pinned `pdftotext -layout` extract. Each contest is a county
 * table: a heading ("Republican Party Nomination", "Legislative District 4"),
 * candidate names over one or two lines, a "County" row, then a "Total" row
 * with one count per candidate. The source marks each nominee, or each of the
 * two candidates advancing, with "✓". Two tables can sit side by side (split
 * at the right-hand table's "County" column), and a long table can continue
 * its county list in a second column group to the right of the first, which
 * the "Total" row ends with a county name; only the first group is read.
 * "— continued" pages repeat a table without its total and are skipped.
 *
 * The U.S. Senate, U.S. House and governor primaries are partisan (Republican,
 * Democratic, Libertarian, Legal Marijuana NOW); a party that "did not make a
 * nomination" has no table. The Legislature is nonpartisan: every candidate
 * runs on one ballot and the top two advance, uncontested districts included.
 * The 24 even-numbered districts were on the ballot for four-year terms;
 * District 41 elected the two years left of its term ("Two Year Term"),
 * reported as a special contest. Write-in columns ("(Write-In)", "Write-In
 * Scatterings") are marked as write-ins.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ne-2026-primary-canvass-book-pdf", url: "https://sos.nebraska.gov/sites/default/files/doc/elections/2026/2026_Primary_Canvass_Book.pdf", path: "data/source/rapid/state-primary/ne/2026-primary-canvass-book.pdf", cycleYear: 2026, electionDate: "2026-05-12", note: "Official report of the Board of State Canvassers, certified 2026-06-08: U.S. Senate, U.S. House, governor by party, and the nonpartisan Legislature.", pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`NEBRASKA_PRIMARY_${code}`); };

type Office = Pick<RawPrimaryContest, "office" | "district">;
const PARTY_HEADING = /(Republican|Democratic|Libertarian|Legal Marijuana NOW) Party Nomination(?: \(([^)]+)\))?/g;
const LEGISLATIVE_HEADING = /Legislative District (\d+)( – Two Year Term)?/g;
const OTHER_OFFICE = /^\s*(Statewide Constitutional Offices|Secretary of State|State Treasurer|Attorney General|Auditor of Public Accounts|State Offices|Public Service Commissioner|Member of the State Board of Education|Member of the Board of Regents.*|Community Colleges|Member of Board of Governors.*)\s*$/;

/** The office a party heading's parenthetical names must agree with the section it sits in. */
const agrees = (office: Office, label: string | undefined): boolean => label === undefined
  || (office.office === "us_senate" && label === "United States Senate")
  || (office.office === "governor" && label === "Governor")
  || (office.office === "us_house" && label === `Congressional District ${office.district}`);

/** One table's candidates from its slice of the layout: names above the "Total" row, counts on it. */
function readTable(lines: readonly string[], where: string): { name: string; votes: number; winner: boolean; writeIn: boolean }[] {
  const end = lines.findIndex((line) => /^\s*Total\s/.test(line));
  if (end < 0) fail(`TOTAL_MISSING:${where}`);
  const row = cells(lines[end]!);
  if (row[0]?.text !== "Total") fail(`TOTAL_ROW:${where}`);
  const counts: typeof row = [];
  for (const cell of row.slice(1)) { if (count(cell.text) === null) break; counts.push(cell); }
  if (counts.length === 0) fail(`NO_COUNTS:${where}`);
  // A second column group starts with a county name on the Total row; header cells there belong to it.
  const boundary = row[counts.length + 1]?.start ?? Infinity;
  const anchors = counts.map((cell) => cell.centre), names = anchors.map(() => [] as string[]);
  for (const line of lines.slice(0, end)) {
    const header = cells(line).filter((cell) => cell.text !== "County" && cell.centre < boundary);
    assign(anchors, header).forEach((text, column) => { if (text) names[column]!.push(text); });
  }
  return counts.map((cell, column) => {
    const label = names[column]!.reduce((joined, part) => joined === "" ? part : joined.endsWith("-") ? `${joined}${part}` : `${joined} ${part}`, "");
    if (label === "") fail(`NAME_MISSING:${where}:${column}`);
    const writeIn = /write-?in/i.test(label);
    return { name: label.replace(/✓/g, "").replace(/\(Write-In\)/i, "").replace(/\s+/g, " ").trim(), votes: count(cell.text)!, winner: label.includes("✓"), writeIn };
  });
}

function parse(bytes: Buffer): RawPrimaryContest[] {
  const lines = bytes.toString("utf8").replace(/\f/g, "\n").split(/\r?\n/);
  const contests: RawPrimaryContest[] = [];
  let office: Office | null = null, legislature = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.includes("....")) continue; // table of contents
    if (/^\s*Member of the United States Senate – Six Year Term\s*$/.test(line)) { office = { office: "us_senate", district: null }; legislature = false; continue; }
    const congressional = line.match(/^\s*Congressional District (\d+) – Two Year Term\s*$/);
    if (congressional) { office = { office: "us_house", district: congressional[1]! }; legislature = false; continue; }
    if (/^\s*Governor\s*$/.test(line)) { office = { office: "governor", district: null }; legislature = false; continue; }
    if (/^\s*Member of the Legislature\s*$/.test(line)) { office = null; legislature = true; continue; }
    if (OTHER_OFFICE.test(line)) { office = null; legislature = false; continue; }
    if (/continued\s*$/.test(line)) continue;
    const headings = legislature ? [...line.matchAll(LEGISLATIVE_HEADING)] : [...line.matchAll(PARTY_HEADING)];
    if (headings.length === 0 || (!legislature && office === null)) continue;
    // The table runs to the next heading line.
    const isHeading = (text: string): boolean => (legislature ? /Legislative District \d+/ : /Party (Nomination|did not make)/).test(text) || /^\s*(Member of|Primary Election – )/.test(text);
    let next = index + 1;
    while (next < lines.length && !isHeading(lines[next]!) && next - index < 16) next++;
    const block = lines.slice(index + 1, next);
    let splits = [0, Infinity];
    if (headings.length === 2) {
      const right = Math.min(...block.flatMap((text) => [...text.matchAll(/County/g)].map((match) => match.index!).filter((at) => at > 40)));
      if (!Number.isFinite(right)) fail(`TABLE_BOUNDARY:${index + 1}`);
      splits = [0, right, Infinity];
    } else if (headings.length !== 1) fail(`HEADINGS:${index + 1}`);
    headings.forEach((heading, side) => {
      const slice = block.map((text) => text.slice(splits[side]!, splits[side + 1]! === Infinity ? undefined : splits[side + 1]!));
      if (legislature) {
        const where = `LD${heading[1]}`;
        const candidates = readTable(slice, where);
        const named = candidates.filter((candidate) => !candidate.writeIn).length;
        if (candidates.filter((candidate) => candidate.winner).length !== Math.min(2, named)) fail(`ADVANCING_MARKS:${where}`);
        contests.push({ office: "state_unicameral", district: heading[1]!, rawParty: null, system: "top_two", ...(heading[2] ? { special: true } : {}), candidates: candidates.map(({ name, votes, winner, writeIn }) => ({ name, votes, ...(winner ? { winner } : {}), ...(writeIn ? { writeIn } : {}) })) });
        return;
      }
      const current = office!;
      if (!agrees(current, heading[2])) fail(`OFFICE_DISAGREES:${index + 1}:${heading[2]}`);
      const where = `${current.office}:${current.district ?? ""}:${heading[1]}`;
      const candidates = readTable(slice, where);
      if (candidates.filter((candidate) => candidate.winner).length !== 1 || candidates.some((candidate) => candidate.writeIn)) fail(`NOMINEE_MARKS:${where}`);
      contests.push({ ...current, rawParty: heading[1]!, candidates: candidates.map(({ name, votes, winner }) => ({ name, votes, ...(winner ? { winner } : {}) })) });
    });
  }
  return contests;
}

export const NEBRASKA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NE",
  authority: "Nebraska Board of State Canvassers, official primary canvass book",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ne-2026-primary-canvass-book-pdf": 40 },
  parse: (bytes) => parse(bytes),
};
