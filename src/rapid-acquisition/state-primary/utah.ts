import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Utah, June 23, 2026 primary. Parties nominate at convention; a primary is
 * held only where a candidate gathered signatures or the convention left two,
 * so most seats have none. Four kinds of official file cover the ledger's
 * offices, each read from its `pdftotext -layout` extract:
 *
 * - The Lieutenant Governor's statewide canvass certification (signed July
 *   20, 2026) with the certified results of every multi-county federal and
 *   legislative primary. Each table sets up to four contests side by side:
 *   a title line, a party line, a line of candidate names, county rows, then
 *   "Total Votes Cast Per Candidate" and "Total Votes Cast in Contest" lines.
 *   Candidates are assigned to contests left to right until each contest's
 *   total is reached. The certification names single-county winners only "for
 *   informational purposes"; those results are certified by the county.
 * - The county canvass summaries for the counties with single-county
 *   legislative or congressional primaries (Salt Lake, Davis and Utah), as
 *   posted to the state results site's report library. Only the
 *   single-county contests the state certification lists are read; a
 *   multi-county contest's county share is not a contest.
 * - The Lieutenant Governor's amended general election certification
 *   (September 21, 2026), the official list of every party's nominee. Seats
 *   whose party nominated without a primary are reported from it as an
 *   unopposed nomination (`votes: null`, marked winner). Unaffiliated
 *   candidates are not party nominees and are skipped. Its text layer is OCR,
 *   so headings are matched loosely ("Rep1·esentatives", "Distl'ict").
 *
 * The 2026 congressional map is new: the four districts' numbers do not
 * follow the holders' old districts. No write-in lines appear in these files.
 */
const STATE_CANVASS = "ut-2026-primary-state-canvass-certification-pdf";
const GENERAL_CERTIFICATION = "ut-2026-general-candidate-certification-pdf";
const CDN = "https://electionresults.utah.gov/cdn/results/a7510980-7b10-4aca-a2d8-ff92951aca1c";

/** Single-county contests each county summary contributes, keyed as `office|district|party`. */
const COUNTY_CONTESTS: Readonly<Record<string, readonly string[]>> = {
  "ut-2026-primary-salt-lake-county-canvass-pdf": ["us_house|1|Democratic", "state_upper|13|Democratic", "state_upper|14|Democratic", "state_lower|21|Democratic", "state_lower|34|Democratic", "state_lower|38|Republican", "state_lower|40|Democratic", "state_lower|41|Republican", "state_lower|44|Republican", "state_lower|48|Republican"],
  "ut-2026-primary-davis-county-canvass-pdf": ["state_upper|6|Republican", "state_lower|14|Republican", "state_lower|16|Republican", "state_lower|17|Republican"],
  "ut-2026-primary-utah-county-canvass-pdf": ["state_upper|21|Republican"],
};

const SOURCES: readonly StateGeneralSource[] = [
  {
    id: STATE_CANVASS,
    url: "https://vote.utah.gov/wp-content/uploads/2026/07/2026-Primary-Election-Certification.pdf",
    path: "data/source/rapid/state-primary/ut/2026-primary-election-certification.pdf",
    cycleYear: 2026,
    electionDate: "2026-06-23",
    note: "Lieutenant Governor's certified statewide canvass: the multi-county U.S. House, Senate and House primaries.",
    pdfLayoutExtract: true,
  },
  {
    id: "ut-2026-primary-salt-lake-county-canvass-pdf",
    url: `${CDN}/FINAL%20OFFICIAL%20ElectionSummaryReportRPT_c0adf0b7-ec19-42d4-a310-d2168d9b7811.pdf`,
    path: "data/source/rapid/state-primary/ut/2026-primary-salt-lake-county-final-official-summary.pdf",
    cycleYear: 2026,
    electionDate: "2026-06-23",
    note: "Salt Lake County's final official results (July 7, 2026), from the state results site: ten single-county primaries.",
    pdfLayoutExtract: true,
  },
  {
    id: "ut-2026-primary-davis-county-canvass-pdf",
    url: `${CDN}/Results_c7c1fc7e-f23b-45cf-b6bf-bf4fc557d373.pdf`,
    path: "data/source/rapid/state-primary/ut/2026-primary-davis-county-official-summary.pdf",
    cycleYear: 2026,
    electionDate: "2026-06-23",
    note: "Davis County's official summary results (July 7, 2026), from the state results site: four single-county primaries.",
    pdfLayoutExtract: true,
  },
  {
    id: "ut-2026-primary-utah-county-canvass-pdf",
    url: `${CDN}/Election%20Summary%20OFFICIAL%20RESULTS_b221f192-fe77-4468-a02a-6f9aed35124f.pdf`,
    path: "data/source/rapid/state-primary/ut/2026-primary-utah-county-official-summary.pdf",
    cycleYear: 2026,
    electionDate: "2026-06-23",
    note: "Utah County's official summary results (July 7, 2026), from the state results site: Senate District 21.",
    pdfLayoutExtract: true,
  },
  {
    id: GENERAL_CERTIFICATION,
    url: "https://vote.utah.gov/wp-content/uploads/2026/09/2026-General-Election-Certification-Amended-09-21.pdf",
    path: "data/source/rapid/state-primary/ut/2026-general-election-certification-amended-09-21.pdf",
    cycleYear: 2026,
    electionDate: "2026-06-23",
    note: "Lieutenant Governor's amended general election certification: every party nominee, read for seats nominated without a primary.",
    pdfLayoutExtract: true,
  },
];

type Office = RawPrimaryContest["office"];
const fail = (code: string): never => { throw new Error(`UTAH_PRIMARY_${code}`); };
const tidy = (value: string): string => value.replace(/\s+/g, " ").trim();
const count = (value: string): number => /^\d{1,3}(,\d{3})*$/.test(value) ? Number(value.replace(/,/g, "")) : fail(`COUNT:${value}`);
const PARTY: Readonly<Record<string, string>> = { REP: "Republican", DEM: "Democratic", Republican: "Republican", Democratic: "Democratic" };
const key = (office: Office, district: string | null, party: string): string => `${office}|${district ?? ""}|${party}`;

/** Splits a layout line into cells separated by two or more spaces, with their start columns. */
const cellsOf = (line: string): { text: string; start: number }[] => [...line.matchAll(/\S+(?: \S+)*/g)].map((match) => ({ text: match[0]!, start: match.index! }));

const STATE_TITLE = /^(U\.S\. House|Utah Senate|Utah House|State Board of Education) District (\d+)$/;

function parseStateCanvass(text: string): RawPrimaryContest[] {
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const end = lines.findIndex((line) => /Single-County Races/.test(line));
  const contests: RawPrimaryContest[] = [];
  for (let index = 0; index < (end < 0 ? lines.length : end); index++) {
    const titles = cellsOf(lines[index]!);
    if (titles.length === 0 || !titles.every((cell) => STATE_TITLE.test(cell.text))) continue;
    const next = (from: number): number => { let cursor = from; while (cursor < lines.length && lines[cursor]!.trim() === "") cursor++; return cursor; };
    const partyLine = next(index + 1), nameLine = next(partyLine + 1);
    const parties = cellsOf(lines[partyLine]!).map((cell) => PARTY[cell.text] ?? fail(`PARTY:${cell.text}`));
    if (parties.length !== titles.length) fail(`PARTY_COUNT:${lines[index]!.trim()}`);
    const names = cellsOf(lines[nameLine]!).map((cell) => cell.text);
    let cursor = nameLine + 1;
    while (cursor < lines.length && !/^Total Votes Cast Per/.test(lines[cursor]!)) cursor++;
    const votes = cellsOf(lines[next(cursor + 1)]!).map((cell) => count(cell.text));
    while (cursor < lines.length && !/^Total Votes Cast in/.test(lines[cursor]!)) cursor++;
    const totals = cellsOf(lines[next(cursor + 1)]!).map((cell) => count(cell.text));
    if (votes.length !== names.length || totals.length !== titles.length) fail(`COLUMNS:${lines[index]!.trim()}`);
    // Candidates run left to right; each contest takes candidates until its certified total is reached.
    let candidate = 0;
    titles.forEach((title, column) => {
      const [, kind, district] = title.text.match(STATE_TITLE)!;
      const taken: { name: string; votes: number }[] = [];
      while (taken.reduce((sum, entry) => sum + entry.votes, 0) < totals[column]! && candidate < names.length) taken.push({ name: names[candidate]!, votes: votes[candidate++]! });
      if (taken.reduce((sum, entry) => sum + entry.votes, 0) !== totals[column]) fail(`TOTAL_MISMATCH:${title.text}`);
      if (kind === "State Board of Education") return;
      const office: Office = kind === "U.S. House" ? "us_house" : kind === "Utah Senate" ? "state_upper" : "state_lower";
      contests.push({ office, district: district!, rawParty: parties[column]!, candidates: taken });
    });
    if (candidate !== names.length) fail(`CANDIDATES_LEFT:${lines[index]!.trim()}`);
    index = cursor;
  }
  return contests;
}

const COUNTY_TITLE = /^(?:(REP|DEM) )?(?:Republican for )?(U\.S\. HOUSE|CONGRESSIONAL|STATE SENATE|STATE HOUSE|SENATE|HOUSE) DISTRICT (\d+)(?: \((REP|DEM)\))?(?: \(Vote for \d+\))?$/i;
const CANDIDATE = /^\s{0,4}([A-Z"][A-Z0-9 .,'"()-]*[A-Z.)"])\s{2,}(\d{1,3}(?:,\d{3})*)(?:\s+[\d.]+%)?\s*$/;

function parseCountySummary(text: string, sourceId: string): RawPrimaryContest[] {
  const wanted = new Set(COUNTY_CONTESTS[sourceId] ?? fail(`SOURCE_UNKNOWN:${sourceId}`));
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const isTitle = (index: number): boolean => {
    if (/\(Vote for \d+\)\s*$/i.test(lines[index]!)) return true;
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor]!.trim() === "") cursor++;
    return lines[index]!.trim() !== "" && /^Vote For \d+$/.test(lines[cursor]?.trim() ?? "");
  };
  const contests: RawPrimaryContest[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!isTitle(index)) continue;
    const title = tidy(lines[index]!);
    const match = title.match(COUNTY_TITLE);
    if (!match) continue;
    const kind = match[2]!.toUpperCase(), party = PARTY[(match[1] ?? match[4] ?? "").toUpperCase()] ?? fail(`PARTY:${title}`);
    const office: Office = kind === "U.S. HOUSE" || kind === "CONGRESSIONAL" ? "us_house" : kind.endsWith("SENATE") ? "state_upper" : "state_lower";
    if (!wanted.delete(key(office, match[3]!, party))) continue;
    const candidates: { name: string; votes: number }[] = [];
    let cursor = index + 1, total: number | null = null;
    for (; cursor < lines.length && !isTitle(cursor); cursor++) {
      const line = lines[cursor]!;
      const totalMatch = line.match(/^Total Votes\s+([\d,]+)\s*$/);
      if (totalMatch) { total = count(totalMatch[1]!); break; }
      const row = line.match(CANDIDATE);
      if (row) candidates.push({ name: tidy(row[1]!), votes: count(row[2]!) });
    }
    if (candidates.length === 0) fail(`NO_CANDIDATES:${title}`);
    if (total !== null && candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== total) fail(`TOTAL_MISMATCH:${title}`);
    contests.push({ office, district: match[3]!, rawParty: party, candidates });
    index = cursor - 1;
  }
  if (wanted.size > 0) fail(`CONTEST_MISSING:${sourceId}:${[...wanted].join(",")}`);
  return contests;
}

/**
 * OCR misreadings in the certification's text layer. Every nominee name was compared with the same office's
 * candidates on the Lieutenant Governor's 2026 general election results site (electionresults.utah.gov,
 * general11032026); these fourteen differed and take that site's spelling. Birtcher and Black (pages 12 and 14)
 * were also checked against the scan.
 */
const OCR_CORRECTIONS: Readonly<Record<string, string>> = {
  "JESS BlRTCHER": "JESS BIRTCHER", "KARL! BLACK": "KARLI BLACK", "RICHARDS ROBILLARD": "RICHARD S ROBILLARD", "CHRJS REID": "CHRIS REID",
  "BARBARAJ.HAGGERTY": "BARBARA J. HAGGERTY", "JASONB KYLE": "JASON B KYLE", "RICHARDT NOWAK": "RICHARD T NOWAK", "MICHAELE FINCH": "MICHAEL E FINCH",
  "WALES N EMATOLLAHI": "WALES NEMATOLLAHI", "TYNLEYBEAN": "TYNLEY BEAN", "CANDICE B. PJERUCCI": "CANDICE B. PIERUCCI", "VALL. PETERSON": "VAL L. PETERSON",
  "SCOTTHCHEW": "SCOTT H CHEW", "EVA MWELDON": "EVA M WELDON", "APRJL A PINKSTON": "APRIL A PINKSTON", "GLENNDWEBB": "GLENN D WEBB",
};
const NOMINEE_PARTIES = new Set(["Republican", "Democratic", "Libertarian", "Constitution", "Forward", "Independent American", "Green", "United Utah"]);
const OFFICE_HEADING = /^\s*(U\.S\. House of Representatives|Utah Senate|Utah House\s*of\s*Rep\S*sentatives|Utah State Board of Education)\s+Dis\S*ct\s+(\d+)\./;

function parseGeneralCertification(text: string, primaryKeys: ReadonlySet<string>): RawPrimaryContest[] {
  const nominees = new Map<string, { office: Office; district: string; party: string; names: string[] }>();
  let current: { office: Office; district: string } | null = null;
  for (const line of text.replace(/\f/g, "\n").split(/\r?\n/)) {
    const heading = line.match(OFFICE_HEADING);
    if (heading) {
      current = heading[1]!.startsWith("Utah State Board") ? null : { office: heading[1] === "U.S. House of Representatives" ? "us_house" : heading[1] === "Utah Senate" ? "state_upper" : "state_lower", district: heading[2]! };
      continue;
    }
    if (/^[A-Z][A-Z ,]{5,}$/.test(line.trim())) { current = null; continue; }
    const row = line.match(/^\s*(\S.*?\S)\s{2,}(\S.*?)\s*$/);
    if (!current || !row) continue;
    const party = tidy(row[2]!);
    // The column header reads "Candidate  Party", OCR'd as "Candidale" or "Ca11didate".
    if (party === "Party" || party === "Unaffiliated") continue;
    if (!NOMINEE_PARTIES.has(party)) fail(`PARTY:${party}`);
    const entry = nominees.get(key(current.office, current.district, party)) ?? { ...current, party, names: [] };
    const name = tidy(row[1]!);
    if (!/^[A-Z"][A-Z .,'"()-]*$/.test(OCR_CORRECTIONS[name] ?? name)) fail(`NAME_UNREADABLE:${name}`);
    entry.names.push(OCR_CORRECTIONS[name] ?? name);
    nominees.set(key(current.office, current.district, party), entry);
  }
  return [...nominees.entries()].filter(([entryKey]) => !primaryKeys.has(entryKey)).map(([, entry]) => {
    if (entry.names.length !== 1) fail(`NOMINEES:${entry.office}:${entry.district}:${entry.party}`);
    return { office: entry.office, district: entry.district, rawParty: entry.party, candidates: [{ name: entry.names[0]!, votes: null, winner: true }] };
  });
}

function parse(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const text = bytes.toString("utf8");
  if (source.id === STATE_CANVASS) return parseStateCanvass(text);
  if (source.id in COUNTY_CONTESTS) return parseCountySummary(text, source.id);
  if (source.id !== GENERAL_CERTIFICATION) return fail(`SOURCE_UNKNOWN:${source.id}`);
  const primaries = [...parseStateCanvass(readSource(STATE_CANVASS).toString("utf8")), ...Object.keys(COUNTY_CONTESTS).flatMap((id) => parseCountySummary(readSource(id).toString("utf8"), id))];
  return parseGeneralCertification(text, new Set(primaries.map((contest) => key(contest.office, contest.district, contest.rawParty!))));
}

export const UTAH_PRIMARY: StatePrimaryAdapter = {
  stateCode: "UT",
  authority: "Utah Lieutenant Governor's Office and county clerks, certified primary canvass and nominee certification",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [STATE_CANVASS]: 9, "ut-2026-primary-salt-lake-county-canvass-pdf": 10, "ut-2026-primary-davis-county-canvass-pdf": 4, "ut-2026-primary-utah-county-canvass-pdf": 1, [GENERAL_CERTIFICATION]: 177 },
  parse,
};
