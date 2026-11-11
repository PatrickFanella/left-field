import type { StateGeneralSource } from "../state-legislative-general-results";
import { parseCsv } from "../state-legislative-roster";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * New York State Board of Elections, Elections Database export (the same
 * Civera ElectionStats database as the general-election adapter, now served
 * from ny.elstats3.civera.com), filtered to 2026 and the offices
 * Representative in Congress (13), State Senator (5) and Member of Assembly
 * (14). The June 23, 2026 primary is election 164; rows are one per
 * candidate per county.
 *
 * New York holds a primary only when it is contested, so the export has no
 * row for a nominee who ran unopposed, and no governor primary was held.
 * Minor-party (fusion) primaries do not decide a major-party holder's
 * nomination and are not read; only Democratic and Republican primaries are.
 * Votes are summed over counties. The export's `is_winner` is set per county
 * (the county leader), not per contest, so it is not read as a nominee mark;
 * the certified count orders the candidates. "Scattering" is the write-in
 * line; "Blank", "Void" and "Total Votes" are dropped.
 *
 * Unopposed nominations are read from the State Board's Amended Certification for the November 3, 2026 General
 * Election (Election Law section 4-112, dated October 7, 2026, version 10.7.2026), which names every party's
 * nominee per office and district. elections.ny.gov refuses this network (HTTP 403), so the PDF is the Internet
 * Archive's capture of the Board's file, placed by hand, and read from its pinned layout extract. Each section is
 * "Office:", "District:", "Counties:", "Vote For:" and a table of party lines; a nominee's given names print on
 * the line above the party label and the family name on the line below (the governor table prints both running
 * mates side by side; only the governor column is read). For each Democratic or Republican line for governor,
 * U.S. House, State Senate or Assembly whose party held no primary in the export above, the nominee is reported
 * as an unopposed nomination dated the June 23 primary. A party line with no nominee is skipped.
 */
const SEARCH = { global: { years: { from: 2026, to: 2026 } }, ballotQuestions: { text: "", types: [], number: "", divisions: [] }, contests: { candidates: [], divisions: [], offices: [{ id: 13 }, { id: 5 }, { id: 14 }] }, specialElectionsOnly: false, voterStats: false, stages: [] };
const PRIMARY = "ny-2026-primary-contests-csv";
const CERTIFICATION = "ny-2026-general-ballot-certification-pdf";
const SOURCES: readonly StateGeneralSource[] = [
  { id: PRIMARY, url: `https://ny.elstats3.civera.com/api/download_search.csv?search=${encodeURIComponent(JSON.stringify(SEARCH))}`, path: "data/source/rapid/state-primary/ny/2026-primary-contests.csv", cycleYear: 2026, electionDate: "2026-06-23", note: "Representative in Congress, State Senator and Member of Assembly contests for 2026 (primary election id 164); contested primaries only." },
  { id: CERTIFICATION, url: "https://web.archive.org/web/20261024223743id_/https://elections.ny.gov/system/files/documents/2026/10/accessible-2026-general-ballot-certification-10.7.2026.pdf", path: "data/source/rapid/state-primary/ny/2026-general-ballot-certification.pdf", cycleYear: 2026, electionDate: "2026-11-03", note: "State Board's amended certification of nominees for the November 3, 2026 general election (October 7, 2026), read for nominations with no primary. The official host refused this network (HTTP 403); this is the Internet Archive capture of the Board's file, placed by hand.", pdfLayoutExtract: true },
];

const PRIMARY_ELECTION_ID = "164";
const OFFICES: Readonly<Record<string, PrimaryOffice>> = { "Representative in Congress": "us_house", "State Senator": "state_upper", "Member of Assembly": "state_lower" };
const ACCOUNTING_ROWS = new Set(["Blank", "Void", "Total Votes"]);
const fail = (code: string): never => { throw new Error(`NEW_YORK_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);

function parse(bytes: Buffer): RawPrimaryContest[] {
  const table = parseCsv(bytes.toString("utf8").replace(/^﻿/, ""));
  const header = table[0] ?? fail("EMPTY");
  const column = (name: string): number => { const index = header.indexOf(name); return index >= 0 ? index : fail(`COLUMN_MISSING:${name}`); };
  const electionCol = column("election_id"), typeCol = column("election_type"), partyCol = column("primary_party"), officeCol = column("office_name"), districtCol = column("district_name"), contestCol = column("contest_id"), candidateIdCol = column("candidate_id"), nameCol = column("candidate_name"), divisionCol = column("division_type"), votesCol = column("votes"), seatsCol = column("number_seats");
  const contests = new Map<string, { office: PrimaryOffice; district: string; party: string; seats: number; candidates: Map<string, { name: string; votes: number; writeIn: boolean }> }>();
  for (const row of table.slice(1)) {
    if (row[electionCol] !== PRIMARY_ELECTION_ID) continue;
    if (row[typeCol] !== "Primary" || row[divisionCol] !== "County") fail(`ROW_KIND:${row[typeCol]}:${row[divisionCol]}`);
    const party = row[partyCol]!;
    if (party !== "Democratic" && party !== "Republican") continue;
    const name = row[nameCol]!;
    if (ACCOUNTING_ROWS.has(name)) continue;
    const office = OFFICES[row[officeCol]!] ?? fail(`OFFICE_UNKNOWN:${row[officeCol]}`);
    const key = row[contestCol]!;
    const entry = contests.get(key) ?? { office, district: row[districtCol]!, party, seats: integer(row[seatsCol]!), candidates: new Map() };
    if (entry.office !== office || entry.district !== row[districtCol] || entry.party !== party) fail(`CONTEST_INCONSISTENT:${key}`);
    const candidate = entry.candidates.get(row[candidateIdCol]!) ?? { name, votes: 0, writeIn: name === "Scattering" };
    candidate.votes += integer(row[votesCol]!);
    entry.candidates.set(row[candidateIdCol]!, candidate);
    contests.set(key, entry);
  }
  return [...contests.values()].map((entry) => ({ office: entry.office, district: entry.district, rawParty: entry.party, seats: entry.seats, candidates: [...entry.candidates.values()] }));
}

const CERTIFIED_OFFICES: Readonly<Record<string, PrimaryOffice>> = { "Governor and Lt. Governor": "governor", "Representative in Congress": "us_house", "State Senator": "state_upper", "Member of Assembly": "state_lower" };
const PAGE_FOOTER = /^\s*Certification for the November 3, 2026 General Election - Page \d+ of \d+\s*$/;
const contestKey = (office: PrimaryOffice, district: string | null, party: string): string => `${office}|${district ?? ""}|${party}`;

/** One certification section: the party lines of one office and district, each with the nominee's name as printed (or none). */
function certifiedLines(section: readonly string[], office: string): { party: string; name: string | null }[] {
  // Party labels start at the left margin; names are indented to the candidate column. The governor table has a
  // second (Lt. Governor) column, set off by a run of spaces, which is not read.
  const heading = section.findIndex((line) => line.includes("Candidate Name"));
  if (heading < 0) fail(`CERTIFICATION_HEADING:${office}`);
  const twoColumns = section[heading]!.indexOf("Candidate Name") !== section[heading]!.lastIndexOf("Candidate Name");
  const rows = section.slice(heading + 1).map((line) => {
    const margin = /^\s{0,3}\S/.test(line), chunks = line.trim().split(/\s{2,}/);
    const names = margin ? chunks.slice(1) : chunks;
    return { party: margin ? chunks[0]! : "", name: (twoColumns ? names.slice(0, 1) : names).join(" ") };
  });
  const isParty = (index: number): boolean => (rows[index]?.party ?? "") !== "";
  const isName = (index: number): boolean => !isParty(index) && (rows[index]?.name ?? "") !== "";
  const used = new Set<number>();
  const lines: { party: string; name: string | null }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (!isParty(index) || isParty(index - 1)) continue;
    let end = index;
    while (isParty(end + 1)) end += 1;
    // Given names on the line above the party label, family name on the line below; a multi-line label carries its own name parts.
    const parts: string[] = [];
    const inline = rows.slice(index, end + 1).some((row) => row.name !== "");
    if (inline) {
      for (let line = index; line <= end; line += 1) if (rows[line]!.name !== "") parts.push(rows[line]!.name);
      lines.push({ party: rows.slice(index, end + 1).map((row) => row.party).join(" "), name: parts.join(" ") });
      continue;
    }
    if (isName(index - 1)) { if (used.has(index - 1)) fail(`CERTIFICATION_NAME_AMBIGUOUS:${office}:${rows[index - 1]!.name}`); parts.push(rows[index - 1]!.name); used.add(index - 1); }
    for (let line = index; line <= end; line += 1) if (rows[line]!.name !== "") parts.push(rows[line]!.name);
    if (isName(end + 1)) { if (isParty(end + 2) && rows[end + 2]!.name === "") fail(`CERTIFICATION_NAME_AMBIGUOUS:${office}:${rows[end + 1]!.name}`); parts.push(rows[end + 1]!.name); used.add(end + 1); }
    lines.push({ party: rows.slice(index, end + 1).map((row) => row.party).join(" "), name: parts.length > 0 ? parts.join(" ") : null });
  }
  const orphan = rows.findIndex((_, index) => isName(index) && !used.has(index));
  if (orphan >= 0) fail(`CERTIFICATION_NAME_ORPHAN:${office}:${rows[orphan]!.name}`);
  return lines;
}

function parseCertification(text: string, primaries: readonly RawPrimaryContest[]): RawPrimaryContest[] {
  if (!text.includes("Amended Certification for the November 3, 2026 General Election")) fail("CERTIFICATION_TITLE");
  const contested = new Set(primaries.map((contest) => contestKey(contest.office, contest.district, contest.rawParty!)));
  const lines = text.replace(/\f/g, "\n").split("\n").filter((line) => !PAGE_FOOTER.test(line));
  // One heading carries stray text before it in the extract ("SteOffice: Member of Assembly", AD 97); every section has exactly one District line.
  const OFFICE = /^[A-Za-z]{0,3}Office:/;
  const starts = lines.flatMap((line, index) => OFFICE.test(line) ? [index] : []);
  if (starts.length !== lines.filter((line) => /^District:/.test(line)).length) fail("CERTIFICATION_SECTIONS");
  return starts.flatMap((start, position): RawPrimaryContest[] => {
    const section = lines.slice(start, starts[position + 1] ?? lines.length);
    const officeName = section[0]!.replace(OFFICE, "").trim();
    const office = CERTIFIED_OFFICES[officeName];
    if (office === undefined) return [];
    const district = (section[1] ?? "").match(/^District:\s+(\S.*?)\s*$/)?.[1] ?? fail(`CERTIFICATION_DISTRICT:${officeName}`);
    // The county list may wrap, so the vote-for line is found rather than counted.
    if (section.find((line) => line.startsWith("Vote For:"))?.replace(/\s+/g, " ").trim() !== "Vote For: 1") fail(`CERTIFICATION_VOTE_FOR:${officeName}:${district}`);
    const where = office === "governor" ? null : /^\d+$/.test(district) ? district : fail(`CERTIFICATION_DISTRICT:${officeName}:${district}`);
    if (office === "governor" && district !== "Statewide") fail(`CERTIFICATION_DISTRICT:${officeName}:${district}`);
    return certifiedLines(section, `${officeName} ${district}`).flatMap((line): RawPrimaryContest[] => {
      if ((line.party !== "Democratic" && line.party !== "Republican") || line.name === null || contested.has(contestKey(office, where, line.party))) return [];
      return [{ office, district: where, rawParty: line.party, electionDate: "2026-06-23", candidates: [{ name: line.name, votes: null, winner: true }] }];
    });
  });
}

export const NEW_YORK_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NY",
  authority: "New York State Board of Elections, Elections Database and general election certification",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [PRIMARY]: 80, [CERTIFICATION]: 330 },
  parse: (bytes, source, readSource) => source.id === PRIMARY ? parse(bytes) : source.id === CERTIFICATION ? parseCertification(bytes.toString("utf8"), parse(readSource(PRIMARY))) : fail(`SOURCE_UNKNOWN:${source.id}`),
};
