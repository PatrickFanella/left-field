import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * New Hampshire Secretary of State, results of the September 8, 2026 state
 * primary: one workbook per office and party, linked from the 2026 Democratic
 * and Republican state primary pages. A workbook's header row lists every
 * candidate as "Name, p" (lower-case party letter) and ends with a
 * "Write-Ins" column; one row per town follows, then a "TOTALS" row. The
 * adapter re-sums the town rows and fails if the printed totals disagree.
 * Names printed with the other party's letter received write-in votes on this
 * party's ballot; they are kept as named lines. The unnamed "Write-Ins" column
 * is the write-in aggregate.
 *
 * Coverage is partial. sos.nh.gov refuses this network (HTTP 403), the
 * ElectionStats host nh.electionstats.com answers only "site not found", and
 * the Internet Archive holds a capture of only one 2026 primary workbook: the
 * Democratic 2nd Congressional District. Every other Democratic file listed
 * on the archived 2026 Democratic primary page (captured 2026-09-28), and
 * every Republican file under the same naming, returns 404 from the archive;
 * the archived Republican page (2026-09-09) predates its result links, and
 * the archive refuses new captures (Save Page Now) from this network.
 */
type Spec = StateGeneralSource & { office: PrimaryOffice; party: string; district: string | null; sheet: string };
const SOURCES: readonly Spec[] = [
  {
    id: "nh-2026-primary-us-house-2-democratic-xlsx",
    url: "https://web.archive.org/web/20261006075148id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2026-sp-congressional-district-2-democratic.xlsx",
    path: "data/source/rapid/state-primary/nh/2026-sp-congressional-district-2-democratic.xlsx",
    cycleYear: 2026, electionDate: "2026-09-08",
    note: "U.S. House District 2, Democratic. Internet Archive capture of the official workbook; sos.nh.gov refuses this network. Placed by hand.",
    office: "us_house", party: "Democratic", district: "2", sheet: "con2 Dem",
  },
];

const PARTY_LETTERS: Readonly<Record<string, string>> = { Democratic: "d", Republican: "r" };
const fail = (code: string): never => { throw new Error(`NEW_HAMPSHIRE_PRIMARY_${code}`); };
const integer = (value: string): number => { const trimmed = value.replace(/,/g, "").trim(); return trimmed === "" ? 0 : /^\d+$/.test(trimmed) ? Number(trimmed) : fail(`INTEGER_INVALID:${value}`); };

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const spec = SOURCES.find((candidate) => candidate.id === source.id) ?? fail(`SOURCE_UNKNOWN:${source.id}`);
  const sheet = readWorkbookSheet(bytes, spec.sheet);
  const cell = (column: number, row: number): string => sheet.at(column, row).trim();
  let header = 0;
  for (let row = 1; row <= sheet.maxRow && header === 0; row++) for (let column = 2; column <= sheet.maxColumn; column++) if (/,\s*[a-z]$/.test(cell(column, row))) { header = row; break; }
  if (header === 0) fail(`HEADER_MISSING:${spec.id}`);
  const columns: { column: number; name: string; writeIn: boolean }[] = [];
  for (let column = 2; column <= sheet.maxColumn; column++) {
    const label = cell(column, header), named = label.match(/^(.+),\s*([a-z])$/);
    if (named) columns.push({ column, name: named[1]!.trim(), writeIn: false });
    else if (/^Write-?Ins?$/i.test(label)) columns.push({ column, name: "Write-Ins", writeIn: true });
    else if (label !== "") fail(`COLUMN_UNKNOWN:${spec.id}:${label}`);
  }
  if (!columns.some((entry) => !entry.writeIn && cell(entry.column, header).endsWith(`, ${PARTY_LETTERS[spec.party] ?? fail(`PARTY:${spec.party}`)}`))) fail(`NO_PARTY_CANDIDATE:${spec.id}`);
  const sums = columns.map(() => 0);
  let totals = 0;
  for (let row = header + 1; row <= sheet.maxRow; row++) {
    const town = cell(1, row);
    if (/^totals?$/i.test(town)) { totals = row; break; }
    if (town === "") continue;
    columns.forEach((entry, position) => { sums[position]! += integer(cell(entry.column, row)); });
  }
  if (totals === 0) fail(`TOTALS_MISSING:${spec.id}`);
  columns.forEach((entry, position) => { if (integer(cell(entry.column, totals)) !== sums[position]) fail(`TOTAL_MISMATCH:${spec.id}:${entry.name}`); });
  return [{ office: spec.office, district: spec.district, rawParty: spec.party, candidates: columns.map((entry, position) => ({ name: entry.name, votes: sums[position]!, ...(entry.writeIn ? { writeIn: true } : {}) })) }];
}

export const NEW_HAMPSHIRE_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NH",
  authority: "New Hampshire Secretary of State, 2026 state primary results",
  system: "partisan",
  sources: SOURCES.map(({ id, url, path, cycleYear, electionDate, note }) => ({ id, url, path, cycleYear, electionDate, note })),
  expectedContests: { "nh-2026-primary-us-house-2-democratic-xlsx": 1 },
  parse,
};
