import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Nevada Secretary of State, statewide results page of the June 9, 2026
 * primary (ElectionSummary.aspx), headed "2026 Official Statewide Primary
 * Election Results". The Secretary of State's site refuses this project's
 * network (Incapsula), and many Internet Archive captures of the page hold
 * only the Incapsula stub; the retained file is the full capture of
 * October 15, 2026, after the canvass.
 *
 * Unlike the general pages, each primary contest heading names the party:
 * "State Assembly, District  1 (Democratic)", one row per candidate as
 * "SURNAME, GIVEN", then percent, total and county columns. The page marks
 * no winner. "NONE OF THESE CANDIDATES" (federal and statewide offices) is
 * not a candidate and is left out.
 *
 * Nevada prints no primary when a party has only one candidate (NRS
 * 293.260): that candidate is nominated without a vote. Two companion
 * sources name those nominees, and each reports them as an unopposed contest:
 * - the Legislative Counsel Bureau Research Division's list of 2026 primary
 *   legislative candidates (last updated March 26, 2026, after filing and
 *   withdrawal closed), compiled from the Secretary of State's certified
 *   list, which the Secretary of State's own copy cannot be retained (the
 *   Internet Archive's captures of it are truncated). A Democratic or
 *   Republican candidate who is the only one of their party in the district
 *   is an unopposed nominee; a party with two or more must have a printed
 *   contest with the same number of candidates.
 * - the Clark County Election Department's "Contests and Candidates in the
 *   2026 Elections" (June 24, 2026), which lists every candidate filed for
 *   the congressional districts and governor, marking those who appear only
 *   on the general ballot. It is read only for U.S. House and governor,
 *   where a Democratic or Republican candidate marked "General" (not
 *   "General*", the petition candidates) was unopposed: Steven Horsford,
 *   District 4. Every congressional district reaches into Clark County.
 *
 * Minor-party and nonpartisan candidates appear on the general ballot only.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "nv-2026-primary-election-summary-html",
    url: "https://web.archive.org/web/20261015153516id_/https://www.nvsos.gov/SOSelectionPages/results/2026StateWidePrimary/ElectionSummary.aspx",
    path: "data/source/rapid/state-primary/nv/2026-primary-election-summary.html",
    cycleYear: 2026,
    electionDate: "2026-06-09",
    note: "Official statewide primary results page, from the Internet Archive's capture of the official URL (the host refuses this network).",
  },
  {
    id: "nv-2026-primary-legislative-candidates-pdf",
    url: "https://www.leg.state.nv.us/Division/Research/Documents/CandidatesList_2026Primary.pdf",
    path: "data/source/rapid/state-primary/nv/2026-primary-legislative-candidates.pdf",
    cycleYear: 2026,
    electionDate: "2026-06-09",
    note: "Legislative candidates from the Secretary of State's certified list; names the unopposed legislative nominees.",
    pdfLayoutExtract: true,
  },
  {
    id: "nv-2026-primary-clark-contests-candidates-pdf",
    url: "https://www.clarkcountynv.gov/adobe/assets/urn:aaid:aem:fe5dbe41-e2b2-402e-a651-cbe5e6ea53bc/original/as/Contests-Candidates-All-26.pdf",
    path: "data/source/rapid/state-primary/nv/2026-clark-contests-candidates.pdf",
    cycleYear: 2026,
    electionDate: "2026-06-09",
    note: "Clark County Election Department candidate list; names the unopposed U.S. House and governor nominees.",
    pdfLayoutExtract: true,
  },
];

const RESULTS = "nv-2026-primary-election-summary-html";
const LEGISLATIVE_LIST = "nv-2026-primary-legislative-candidates-pdf";
const CLARK_LIST = "nv-2026-primary-clark-contests-candidates-pdf";

const fail = (code: string): never => { throw new Error(`NEVADA_PRIMARY_${code}`); };
const PARTIES: Readonly<Record<string, string>> = { Democratic: "Democratic", Republican: "Republican", Democrat: "Democratic", DEM: "Democratic", REP: "Republican" };
const decode = (value: string): string => value.replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

type Office = Pick<RawPrimaryContest, "office" | "district">;
const officeOf = (title: string): Office | null => {
  if (title === "Governor") return { office: "governor", district: null };
  const match = title.match(/^(U\.S\. Representative in Congress|State Senate|State Assembly), District\s+(\d+)$/);
  if (!match) return null;
  return { office: match[1] === "State Senate" ? "state_upper" : match[1] === "State Assembly" ? "state_lower" : "us_house", district: String(Number(match[2])) };
};
const keyOf = (office: Office, party: string): string => `${office.office}|${office.district ?? ""}|${party}`;

function parseResults(html: string): Map<string, RawPrimaryContest> {
  const contests = new Map<string, RawPrimaryContest>();
  for (const block of html.matchAll(/<strong>([^<]+) \(([A-Za-z ]+)\)<\/strong>([\s\S]*?)<\/table>/g)) {
    const office = officeOf(decode(block[1]!));
    if (!office) continue;
    const party = PARTIES[block[2]!] ?? fail(`PARTY:${block[1]}:${block[2]}`);
    const candidates = [...block[3]!.matchAll(/<tr>\s*<td>([^<]+)<\/td>\s*<td>[^<]*<\/td>\s*<td>([\d,]+)<\/td>/g)]
      .map((row) => ({ name: decode(row[1]!), votes: Number(row[2]!.replace(/,/g, "")) }))
      .filter((candidate) => candidate.name !== "NONE OF THESE CANDIDATES");
    if (candidates.length === 0) fail(`NO_CANDIDATES:${block[1]}:${party}`);
    const key = keyOf(office, party);
    if (contests.has(key)) fail(`DUPLICATE:${key}`);
    contests.set(key, { ...office, rawParty: party, candidates });
  }
  return contests;
}

/** The Research Division list: groups of lines separated by blank lines, one district number per group. */
function parseLegislativeList(text: string): { office: Office; party: string; name: string }[] {
  const entries: { office: Office; party: string; name: string }[] = [];
  let chamber: "state_upper" | "state_lower" | null = null;
  let group: { district: string | null; names: { name: string; party: string }[] } = { district: null, names: [] };
  const flush = () => {
    if (group.names.length > 0) {
      if (!chamber || group.district === null) fail(`LIST_GROUP_WITHOUT_DISTRICT:${group.names.map((entry) => entry.name).join("|")}`);
      for (const entry of group.names) entries.push({ office: { office: chamber!, district: group.district }, party: entry.party, name: entry.name });
    } else if (group.district !== null) fail(`LIST_DISTRICT_WITHOUT_NAMES:${group.district}`);
    group = { district: null, names: [] };
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") { flush(); continue; }
    if (/STATE SENATE CANDIDATES/.test(line)) { flush(); chamber = "state_upper"; continue; }
    if (/STATE ASSEMBLY CANDIDATES/.test(line)) { flush(); chamber = "state_lower"; continue; }
    const alone = line.match(/^\s*(\d+)\s*$/);
    const row = line.match(/^\s*(?:(\d+)\s+)?(\S.*?\S)\s{2,}(Democrat|Republican|Libertarian|Independent American|No Political Party)\s*$/);
    const district = alone?.[1] ?? row?.[1];
    if (district !== undefined) {
      if (group.district !== null) fail(`LIST_TWO_DISTRICTS:${group.district}:${district}`);
      group.district = String(Number(district));
    }
    if (row) group.names.push({ name: row[2]!.replace(/\*$/, "").trim(), party: row[3]! });
  }
  flush();
  return entries;
}

/** Clark County's list: a Democratic or Republican U.S. House or governor candidate marked "General" (not "General*") was unopposed. */
function parseClarkUnopposed(text: string): { office: Office; party: string; name: string }[] {
  const entries: { office: Office; party: string; name: string }[] = [];
  let office: Office | null = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^(Representative in Congress District (\d+)|Governor|[A-Z][A-Za-z ,.]+?)(?:\s{2,}|$)/);
    if (heading && !line.startsWith("(NOTE")) office = heading[2] ? { office: "us_house", district: heading[2] } : heading[1] === "Governor" ? { office: "governor", district: null } : null;
    if (/^(STATE PARTISAN OFFICES|FEDERAL PARTISAN OFFICES)/.test(line)) continue;
    const row = line.match(/(\S+(?: \S+)*)\s{2,}(\S+(?: \S+)*)\s{2,}(DEM|REP)\s+\d+\s+General\s*$/);
    if (!row || !office) continue;
    // The office note of a multi-county district shares the line with the surname: "... Mineral, and Horsford".
    const surname = row[1]!.startsWith("(NOTE") ? row[1]!.split(" ").at(-1)! : row[1]!.replace(/^(Representative in Congress District \d+|Governor)\s+/, "");
    entries.push({ office, party: PARTIES[row[3]!]!, name: `${row[2]!} ${surname}` });
  }
  return entries;
}

const unopposed = (entry: { office: Office; party: string; name: string }): RawPrimaryContest => ({ ...entry.office, rawParty: entry.party, candidates: [{ name: entry.name, votes: null, winner: true }] });

function parse(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  if (source.id === RESULTS) return [...parseResults(bytes.toString("utf8")).values()];
  const printed = parseResults(readSource(RESULTS).toString("utf8"));
  if (source.id === LEGISLATIVE_LIST) {
    const byParty = new Map<string, { office: Office; party: string; name: string }[]>();
    for (const entry of parseLegislativeList(bytes.toString("utf8"))) {
      const party = PARTIES[entry.party];
      if (!party) continue;
      const key = keyOf(entry.office, party);
      byParty.set(key, [...(byParty.get(key) ?? []), { ...entry, party }]);
    }
    const contests: RawPrimaryContest[] = [];
    for (const [key, entries] of byParty) {
      const contest = printed.get(key);
      if (contest) { if (contest.candidates.length !== entries.length) fail(`LIST_COUNT:${key}:${contest.candidates.length}:${entries.length}`); continue; }
      if (entries.length !== 1) fail(`UNPRINTED_CONTESTED:${key}`);
      contests.push(unopposed(entries[0]!));
    }
    for (const key of printed.keys()) if (/^state_/.test(key) && !byParty.has(key)) fail(`PRINTED_NOT_LISTED:${key}`);
    return contests;
  }
  if (source.id === CLARK_LIST) {
    return parseClarkUnopposed(bytes.toString("utf8")).map((entry) => {
      if (printed.has(keyOf(entry.office, entry.party))) fail(`UNOPPOSED_BUT_PRINTED:${keyOf(entry.office, entry.party)}`);
      return unopposed(entry);
    });
  }
  return fail(`SOURCE_UNKNOWN:${source.id}`);
}

export const NEVADA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NV",
  authority: "Nevada Secretary of State, official primary results; unopposed nominees from the Legislative Counsel Bureau's and Clark County's candidate lists",
  system: "partisan",
  sources: SOURCES,
  expectedContests: {
    "nv-2026-primary-election-summary-html": 39,
    "nv-2026-primary-legislative-candidates-pdf": 58,
    "nv-2026-primary-clark-contests-candidates-pdf": 1,
  },
  parse,
};
