import { cells } from "../state-general/layout-columns";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Wisconsin Elections Commission, canvass results of the August 11, 2026
 * partisan primary (WEC Canvass Reporting System PDF, published August 28
 * after the canvass was certified on August 25), read from its pinned
 * `pdftotext -layout` extract. The report runs office by office ("Office
 * REPRESENTATIVE TO THE ASSEMBLY DISTRICT 2"), then party by party ("Party:
 * Republican  Total Votes: 5,594"), one row per candidate: an optional
 * "Winner" mark, votes, percent, the name and the candidate's party. Every
 * party with ballot access has a block, including those with no candidate
 * (only a SCATTERING line); every filed candidate is printed, unopposed or
 * not. The Constitution Party block is labelled with the office ("STATE
 * SENATOR DISTRICT 7 - Constitution"), sometimes wrapped onto a second line.
 *
 * The name is printed in its own column, sometimes on the line above or below
 * its count, so each party block pairs its counts and names in order and
 * checks both the pairing and the block total. Office and party headers repeat
 * at the top of each page; a repeated block continues the one before it.
 * "SCATTERING" and names marked "(write-in)" are write-ins. A party block
 * with no ballot candidate is left out.
 *
 * All 99 Assembly districts and the 17 odd-numbered Senate districts were on
 * the ballot, with the eight congressional districts and governor; there was
 * no U.S. Senate election. elections.wi.gov refuses this project's egress
 * (HTTP 403), so the file is the Internet Archive capture of the official PDF
 * taken on October 6, 2026.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "wi-2026-primary-canvass-results-pdf", url: "https://web.archive.org/web/20261006001223id_/https://elections.wi.gov/sites/default/files/documents/August%202026%20Partisan%20Primary_Summary%20Results.pdf", path: "data/source/rapid/state-primary/wi/2026-partisan-primary-canvass-results.pdf", cycleYear: 2026, electionDate: "2026-08-11", note: "WEC canvass results certified 2026-08-25; Internet Archive capture (2026-10-06) of the elections.wi.gov PDF, which refuses this egress with HTTP 403. Governor, eight congressional, 17 Senate and 99 Assembly districts, every party.", pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`WISCONSIN_PRIMARY_${code}`); };
const integer = (value: string): number => { const digits = value.replace(/,/g, ""); return /^\d+$/.test(digits) ? Number(digits) : fail(`INTEGER_INVALID:${value}`); };
/** Cells from this column on are the candidate's party; the name column sits well to the left of it. */
const PARTY_COLUMN = 90;

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "GOVERNOR") return { office: "governor", district: null };
  const match = raw.match(/^(REPRESENTATIVE IN CONGRESS|STATE SENATOR|REPRESENTATIVE TO THE ASSEMBLY) DISTRICT (\d+)$/);
  if (!match) return null;
  const office: PrimaryOffice = match[1] === "REPRESENTATIVE IN CONGRESS" ? "us_house" : match[1] === "STATE SENATOR" ? "state_upper" : "state_lower";
  return { office, district: match[2]! };
};

type Block = { base: Pick<RawPrimaryContest, "office" | "district">; rawParty: string; total: number | null; rows: { votes: number; winner: boolean }[]; names: string[] };

function parse(bytes: Buffer): RawPrimaryContest[] {
  const lines = bytes.toString("utf8").replace(/\f/g, "\n").split(/\r?\n/);
  const blocks = new Map<string, Block>();
  let office: { label: string; base: Pick<RawPrimaryContest, "office" | "district"> | null } | null = null;
  let block: Block | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.trim() === "" || /^\s*(Report Generated|WEC Canvass Reporting System|Canvass Results for)/.test(line)) continue;
    if (/^\s*(Number of|Votes\s+Total Votes|Received)\b/.test(line)) continue;
    const officeLine = line.match(/^\s*Office\s+(.+?)\s+Total Votes:/);
    if (officeLine) { office = { label: officeLine[1]!, base: officeOf(officeLine[1]!) }; block = null; continue; }
    if (!office?.base) continue;
    const partyLine = line.match(/^\s*Party:\s+(.+?)(?:\s+Total Votes:)?(?:\s+([\d,]+))?\s*$/);
    if (partyLine) {
      let label = partyLine[1]!.trim();
      // The Constitution Party's label carries the office and can wrap: "... DISTRICT 1 -" then "Constitution".
      if (label.endsWith("-")) { index++; label = `${label} ${lines[index]!.trim()}`; }
      const rawParty = label.startsWith(`${office.label} - `) ? label.slice(office.label.length + 3) : label;
      if (/[A-Z]{4,} DISTRICT|^GOVERNOR/.test(rawParty)) fail(`PARTY_LABEL:${label}`);
      const key = `${office.label}|${rawParty}`;
      block = blocks.get(key) ?? { base: office.base, rawParty, total: null, rows: [], names: [] };
      if (partyLine[2] !== undefined) {
        const total = integer(partyLine[2]);
        if (block.total !== null && block.total !== total) fail(`PARTY_TOTAL_INCONSISTENT:${key}`);
        block.total = total;
      }
      blocks.set(key, block);
      continue;
    }
    if (/^\s*Total Votes:\s*$/.test(line)) continue;
    if (!block) fail(`ROW_OUTSIDE_PARTY:${index + 1}`);
    const row = line.match(/^\s*(Winner\s+)?([\d,]+)\s+(\d*\.?\d*%)(.*)$/);
    const rest = row ? row[4]! : line;
    if (row) block!.rows.push({ votes: integer(row[2]!), winner: row[1] !== undefined });
    const offset = line.length - rest.length;
    for (const cell of cells(rest)) if (cell.start + offset < PARTY_COLUMN) block!.names.push(cell.text);
  }
  const contests: RawPrimaryContest[] = [];
  for (const [key, entry] of blocks) {
    if (entry.rows.length !== entry.names.length) fail(`PAIRING:${key}:${entry.rows.length}:${entry.names.length}`);
    if (entry.total === null || entry.total !== entry.rows.reduce((sum, row) => sum + row.votes, 0)) fail(`TOTAL_MISMATCH:${key}`);
    const candidates = entry.rows.map((row, at) => {
      const label = entry.names[at]!, writeIn = label === "SCATTERING" || /\(write-?in\)/i.test(label);
      return { name: label === "SCATTERING" ? "Scattering" : label.replace(/\s*\(write-?in\)/i, "").trim(), votes: row.votes, ...(row.winner ? { winner: true } : {}), ...(writeIn ? { writeIn: true } : {}) };
    });
    if (!candidates.some((candidate) => !candidate.writeIn)) continue;
    contests.push({ ...entry.base, rawParty: entry.rawParty, candidates });
  }
  return contests;
}

export const WISCONSIN_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WI",
  authority: "Wisconsin Elections Commission, partisan primary canvass results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "wi-2026-primary-canvass-results-pdf": 238 },
  parse: (bytes) => parse(bytes),
};
