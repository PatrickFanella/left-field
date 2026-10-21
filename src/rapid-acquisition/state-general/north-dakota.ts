import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/**
 * North Dakota Secretary of State, election results site
 * (results.sos.nd.gov), statewide legislative results page: every
 * legislative contest on one HTML page. Each contest opens with
 * `<h1>State Senator District 2</h1><h2>Vote For 1</h2>`, then one block per
 * candidate (name, party label, votes) and a "Total Votes" row; the page's
 * export buttons need a browser session, so the page itself is retained.
 * Parties read "Republican", "Democratic-NPL" and "independent nomination".
 * Write-ins appear as one aggregate "write-in" line; individual write-in
 * names load only on demand and are not retained.
 *
 * Each district elects a Senator and two Representatives together for
 * four-year terms, half the districts each cycle, except District 4, which
 * elects single-member subdistricts 4A and 4B. The 2024 file is the current
 * election on the site (no election id); 2022 is addressed by its id.
 * Redistricting put even-numbered districts on the 2022 ballot for
 * "Unexpired 2-Year Term" contests, superseded by 2024, and the 2023 court
 * remedial map merged 9A and 9B into a two-member District 9 and put
 * Districts 9 and 15 on the 2024 ballot the same way; the 2022 contests for
 * the old 9A and 9B have no current district. District 23's 2024 House
 * contest filled one of its two seats for an unexpired term; it is a
 * separate "unexpired" position so it does not replace the 2022 contest that
 * elected the other Representative.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "nd-2024-general-legislative-results-html",
    url: "https://results.sos.nd.gov/ResultsSW.aspx?text=Race&type=LG&map=DIST",
    path: "data/source/rapid/state-general/nd/2024-general-legislative-results.html",
    cycleYear: 2024,
    electionDate: "2024-11-05",
    note: "27 House and 25 Senate contests: even-numbered districts plus the remedial-map Districts 9 and 15 and one District 23 House seat.",
  },
  {
    id: "nd-2022-general-legislative-results-html",
    url: "https://results.sos.nd.gov/ResultsSW.aspx?text=Race&type=LG&map=DIST&eid=vxUYQ0lrpP4.",
    path: "data/source/rapid/state-general/nd/2022-general-legislative-results.html",
    cycleYear: 2022,
    electionDate: "2022-11-08",
    note: "35 House and 32 Senate contests: odd-numbered districts plus unexpired two-year terms in even-numbered districts (superseded by 2024).",
  },
];

const fail = (code: string): never => { throw new Error(`NORTH_DAKOTA_GENERAL_${code}`); };
const votesOf = (value: string): number => /^\d{1,3}(,\d{3})*$/.test(value.trim()) ? Number(value.trim().replace(/,/g, "")) : fail(`INTEGER_INVALID:${value}`);
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

/** "2" → "2"; "04a" → "4A", the roster's subdistrict label. */
const districtOf = (value: string): string => { const match = value.match(/^0*(\d+)([ab]?)$/i) ?? fail(`DISTRICT_INVALID:${value}`); return `${Number(match[1])}${match[2]!.toUpperCase()}`; };

function parse(bytes: Buffer): RawGeneralContest[] {
  const html = bytes.toString("utf8");
  const contests: RawGeneralContest[] = [];
  const blocks = html.split("<h1>").slice(1);
  for (const block of blocks) {
    const header = block.match(/^([^<]*)<\/h1>\s*<h2>Vote For (\d+)<\/h2>/);
    if (!header) continue;
    const title = header[1]!.replace(/\s+/g, " ").trim();
    const match = title.match(/^State (Senator|Representative)( Unexpired 2-Year Term)? District (\w+)$/);
    if (!match) fail(`CONTEST_UNRECOGNIZED:${title}`);
    const chamber = match![1] === "Senator" ? "upper" as const : "lower" as const, unexpired = match![2] !== undefined, district = districtOf(match![3]!), seats = Number(header[2]);
    const body = block.slice(0, block.indexOf("display-results-box-total") + 200);
    const candidates: { name: string; rawParty: string; votes: number; writeIn: boolean }[] = [];
    for (const row of body.matchAll(/<div class="col display-results-box-d"[^>]*>\s*<h2>([\s\S]*?)<\/h2>[\s\S]*?<div class="display-results-box-e">\s*<div class="[^"]*"[^>]*>([^<]*)<\/div>[\s\S]*?<h2 class="display-results-box-g"[^>]*>([^<]*)<\/h2>/g)) {
      const name = text(row[1]!), writeIn = /^write-in( write-in)?$/i.test(name);
      candidates.push({ name: writeIn ? "Write-in" : name, rawParty: writeIn ? "" : row[2]!.trim(), votes: votesOf(row[3]!), writeIn });
    }
    const total = block.match(/display-results-box-total">([^<]*)</) ?? fail(`TOTAL_MISSING:${title}`);
    if (candidates.length === 0) fail(`NO_CANDIDATES:${title}`);
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== votesOf(total[1]!)) fail(`TOTAL_MISMATCH:${title}`);
    // A single-seat unexpired House contest in a two-member district fills one seat; the other seat keeps its earlier contest.
    const partial = chamber === "lower" && unexpired && seats === 1 && /^\d+$/.test(district);
    contests.push({ chamber, district, seats, ...(partial ? { position: "unexpired" } : {}), candidates });
  }
  return contests;
}

export const NORTH_DAKOTA_GENERAL: StateGeneralAdapter = {
  stateCode: "ND",
  authority: "North Dakota Secretary of State, official election results",
  sources: SOURCES,
  expectedContests: { "nd-2024-general-legislative-results-html": 52, "nd-2022-general-legislative-results-html": 67 },
  parse: (bytes) => parse(bytes),
};
