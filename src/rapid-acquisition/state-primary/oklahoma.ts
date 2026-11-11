import { parseCsv } from "../state-legislative-roster";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Oklahoma State Election Board. Returns are the race-level CSV export of the official results site (Export ->
 * Race Level Results - CSV) for the June 16, 2026 primary and the August 25, 2026 runoff primary; the Board's
 * 2026 results pages link that site as the official results. The export sits behind the site's public app login,
 * so the files were saved from it once (through enrapi/GetExtract/CSV/<date>) and retained; the URL recorded is
 * the page the export belongs to. Party comes from race_party; "(UNEXPIRED TERM)" races are special primaries.
 *
 * Oklahoma does not put a party's primary on the ballot when only one candidate files, so those nominations come
 * from the Board's 2026 candidate list book (filings April 1-3, compiled April 3, the official proof for printing
 * ballots): a party with exactly one filer for an office, and no contest in the primary returns, is reported as
 * an unopposed nomination. The book predates the April 7 withdrawal deadline and the Board's supplemental
 * withdrawal list is not published with it, so a sole filer who withdrew would be misreported; none is known.
 * Independents have no primary and are skipped.
 */
const BOOK_ID = "ok-2026-candidate-list-book-pdf";
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ok-2026-primary-state-results-csv", url: "https://results.okelections.gov/OKER/?elecDate=20260616#export-race-level-csv", path: "data/source/rapid/state-primary/ok/2026-primary-state-results.csv", cycleYear: 2026, electionDate: "2026-06-16", note: "Official results site export, race level; contested primaries only." },
  { id: "ok-2026-primary-runoff-state-results-csv", url: "https://results.okelections.gov/OKER/?elecDate=20260825#export-race-level-csv", path: "data/source/rapid/state-primary/ok/2026-primary-runoff-state-results.csv", cycleYear: 2026, electionDate: "2026-08-25", note: "Official results site export, race level, runoff primary." },
  { id: BOOK_ID, url: "https://oklahoma.gov/content/dam/ok/en/elections/candidate-filing-archives/2026-candidate-filing-archives/2026-candidate-list-book.pdf", path: "data/source/rapid/state-primary/ok/2026-candidate-list-book.pdf", cycleYear: 2026, electionDate: "2026-06-16", note: "Candidate list book, filings April 1-3, 2026; read for parties with a single filer, whose primary is not on the ballot.", pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`OKLAHOMA_PRIMARY_${code}`); };
const PARTIES: Readonly<Record<string, string>> = { REP: "Republican", DEM: "Democratic", LIB: "Libertarian" };

/** "FOR STATE SENATOR DISTRICT 17 (UNEXPIRED TERM)" and the book's headings to office, district and special. */
const officeOf = (raw: string): { office: PrimaryOffice; district: string | null; special: boolean } | null => {
  const special = /\((?:UNEXPIRED TERM|unexpired)\)/.test(raw), text = raw.replace(/\s*\((?:UNEXPIRED TERM|unexpired)\)/, "").trim();
  if (text === "GOVERNOR") return { office: "governor", district: null, special };
  if (text === "UNITED STATES SENATOR") return { office: "us_senate", district: null, special };
  const match = text.match(/^(UNITED STATES REPRESENTATIVE|STATE SENATOR|STATE REPRESENTATIVE) DISTRICT (\d+)$/);
  if (!match) return null;
  return { office: match[1] === "UNITED STATES REPRESENTATIVE" ? "us_house" : match[1] === "STATE SENATOR" ? "state_upper" : "state_lower", district: String(Number(match[2])), special };
};

const contestKey = (office: string, district: string | null, special: boolean, party: string): string => `${office}|${district ?? ""}|${special}|${party}`;

function parseReturns(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const rows = parseCsv(bytes.toString("utf8")), header = rows.shift() ?? fail("EMPTY");
  const col = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN:${name}`); };
  const description = col("race_description"), raceParty = col("race_party"), name = col("cand_name"), total = col("cand_tot_votes");
  const channels = [col("cand_absmail_votes"), col("cand_early_votes"), col("cand_elecday_votes")];
  const contests = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: number }[] }>();
  for (const row of rows) {
    if (row.length < header.length) continue;
    const office = officeOf(row[description]!.replace(/^FOR /, ""));
    if (!office) continue;
    const party = PARTIES[row[raceParty]!] ?? fail(`PARTY:${row[raceParty]}`);
    const votes = Number(row[total]);
    if (!Number.isSafeInteger(votes) || votes < 0 || channels.reduce((sum, channel) => sum + Number(row[channel]), 0) !== votes) fail(`VOTE_RECONCILIATION:${row[name]}`);
    const key = contestKey(office.office, office.district, office.special, party);
    const contest = contests.get(key) ?? { office: office.office, district: office.district, rawParty: party, ...(office.special ? { special: true } : {}), ...(source.id.includes("runoff") ? { stage: "runoff" as const } : {}), candidates: [] };
    if (contest.candidates.some((candidate) => candidate.name === row[name])) fail(`DUPLICATE_CANDIDATE:${row[name]}`);
    contest.candidates.push({ name: row[name]!, votes });
    contests.set(key, contest);
  }
  return [...contests.values()];
}

/** Candidate list book, pdftotext layout: office heading, "DISTRICT n - counties", party line, "00123 NAME   City, OK". */
type Filers = { base: NonNullable<ReturnType<typeof officeOf>>; party: string; names: string[] };
const DISTRICTED = /^(UNITED STATES REPRESENTATIVE|STATE SENATOR|STATE REPRESENTATIVE)$/;

function bookFilers(text: string): Map<string, Filers> {
  const filers = new Map<string, Filers>();
  let heading: string | null = null, office: ReturnType<typeof officeOf> = null, party: string | null = null, last: string[] | null = null, lastIndex = -1;
  // A page break leaves a form feed at the start of the next page's first line.
  for (const line of text.replace(/\f/g, "\n").split(/\r?\n/)) {
    // Office headings are centred far to the right; a wrapped ballot name is indented only a few columns.
    const centered = line.match(/^\s{15,}([A-Z][A-Z ]+[A-Z])\s*$/);
    if (centered) { heading = centered[1]!; office = DISTRICTED.test(heading) ? null : officeOf(heading); party = null; last = null; continue; }
    const district = line.match(/^DISTRICT (\d+)( \(unexpired\))?(?: - |\s*$)/);
    if (district && heading && DISTRICTED.test(heading)) { office = officeOf(`${heading} DISTRICT ${district[1]}${district[2] ? " (unexpired)" : ""}`); party = null; last = null; continue; }
    if (district) { office = null; continue; }
    const partyLine = line.match(/^(Republican|Democrat|Libertarian|Independent)\s*$/);
    if (partyLine) { party = partyLine[1] === "Democrat" ? "Democratic" : partyLine[1]!; last = null; continue; }
    // Ballot names are upper case and may hold runs of spaces ("JADAN   A. TERRAZAS"); the city that follows, at
    // times after a single space ("BARRY DWAINE CHRISTIAN Sayre"), is title case, every word with a lower-case letter.
    const filer = line.match(/^\d{5}\s+(\S.*?)\s+(?:[A-Z][a-z]+(?:[A-Z][a-z]+)*\.? )*[A-Z][a-z]+(?:[A-Z][a-z]+)*, OK\s*$/);
    if (filer && office && party) {
      const key = contestKey(office.office, office.district, office.special, party);
      const entry = filers.get(key) ?? { base: office, party, names: [] };
      entry.names.push(filer[1]!.replace(/\s+/g, " "));
      filers.set(key, entry); last = entry.names; lastIndex = entry.names.length - 1; continue;
    }
    // A long ballot name wraps onto an indented line with no filing number.
    const wrap = line.match(/^\s{4,14}([A-Z][A-Z.,' -]+?)\s*$/);
    if (wrap && last && office && party) { last[lastIndex] = `${last[lastIndex]} ${wrap[1]}`; last = null; continue; }
    if (line.trim() !== "") last = null;
  }
  return filers;
}

function parse(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  if (source.id !== BOOK_ID) return parseReturns(bytes, source);
  const returns = parseReturns(readSource("ok-2026-primary-state-results-csv"), SOURCES[0]!);
  const contested = new Set(returns.map((contest) => contestKey(contest.office, contest.district, contest.special ?? false, contest.rawParty!)));
  const filers = bookFilers(bytes.toString("utf8"));
  // Every candidate on a primary ballot filed, so the book must list each one under the same office and party;
  // this checks the book reading itself. The book may list more (a filer who withdrew by April 7).
  for (const contest of returns) {
    const listed = filers.get(contestKey(contest.office, contest.district, contest.special ?? false, contest.rawParty!))?.names ?? [];
    for (const candidate of contest.candidates) if (!listed.includes(candidate.name.replace(/\s+/g, " "))) fail(`BOOK_MISSING_CANDIDATE:${contest.office}:${contest.district}:${contest.rawParty}:${candidate.name}`);
  }
  return [...filers.entries()].flatMap(([key, entry]): RawPrimaryContest[] => {
    if (entry.party === "Independent" || entry.names.length !== 1) return [];
    if (contested.has(key)) fail(`SOLE_FILER_CONTESTED:${key}`);
    return [{ office: entry.base.office, district: entry.base.district, rawParty: entry.party, ...(entry.base.special ? { special: true } : {}), candidates: [{ name: entry.names[0]!, votes: null, winner: true }] }];
  });
}

export const OKLAHOMA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "OK",
  authority: "Oklahoma State Election Board, official primary results and 2026 candidate list book",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ok-2026-primary-state-results-csv": 76, "ok-2026-primary-runoff-state-results-csv": 17, [BOOK_ID]: 135 },
  parse,
};
