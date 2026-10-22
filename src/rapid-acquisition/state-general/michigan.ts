import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/**
 * Michigan Secretary of State, 2022 general election official results page
 * (2022GEN_CENR.html, "Official Updated: 12/22/2022", recounts completed).
 * mielections.us refuses this project's network (Cloudflare), so the page
 * is retained from an Internet Archive capture of January 2024, byte for
 * byte.
 *
 * Each office opens with a header row ("1st District State Senator 4 Year
 * Term (1) Position Files In WAYNE County") and lists one row per candidate:
 * party abbreviation (DEM, REP, LIB, UST, WCP, GRN; W-I for a write-in),
 * name, votes. Only the Senate is read. All 38 Senate districts were elected
 * in 2022 to terms ending in 2026. The House was re-elected in 2024, and
 * those results are not retained: Michigan publishes them through
 * mvic.sos.state.mi.us, which refuses this network and which the Internet
 * Archive captured only as a challenge page. The 2022 House contests are
 * not read, so no representative is scored on a superseded election.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "mi-2022-general-cenr-html",
    url: "https://web.archive.org/web/20240111203233id_/https://mielections.us/election/results/2022GEN_CENR.html",
    path: "data/source/rapid/state-general/mi/2022-general-cenr.html",
    cycleYear: 2022,
    electionDate: "2022-11-08",
    note: "38 Senate contests; the House contests on the page are not read.",
  },
];

const fail = (code: string): never => { throw new Error(`MICHIGAN_GENERAL_${code}`); };
const HEADER = /<TD class="offhdr" COLSPAN=6><div class="anchor" id="\d+"><\/div>([^<]*)<\/TD>/g;
const SENATE = /^(\d+)(?:st|nd|rd|th) District State Senator 4 Year Term \(1\) Position(?: Files In [A-Z. ]+ County)?$/;
const ROW = /<TR class="trow[^"]*"><TD><div class="abbr">(?:<nobr>)?([^<]*)(?:<\/nobr>)?<\/div>[\s\S]*?<\/TD><TD>([^<]+)<\/TD><TD class="votes">([\d,]+)<\/TD>/g;

function parse(bytes: Buffer): RawGeneralContest[] {
  const html = bytes.toString("latin1");
  if (!/2022 Michigan Official General Election Results/.test(html)) fail("NOT_OFFICIAL");
  const headers = [...html.matchAll(HEADER)];
  const contests: RawGeneralContest[] = [];
  headers.forEach((header, index) => {
    const title = header[1]!.replace(/\s+/g, " ").trim();
    if (!/State Senator/.test(title)) return;
    const match = title.match(SENATE) ?? fail(`TITLE:${title}`);
    const body = html.slice(header.index! + header[0].length, headers[index + 1]?.index ?? html.length);
    const candidates = [...body.matchAll(ROW)].map((row) => {
      const party = row[1]!.trim(), writeIn = party === "W-I";
      if (!writeIn && !/^(?:DEM|REP|LIB|UST|WCP|GRN|NLP)$/.test(party)) fail(`PARTY:${title}:${party}`);
      return { name: row[2]!.trim(), rawParty: writeIn ? "" : party, votes: Number(row[3]!.replace(/,/g, "")), writeIn };
    });
    if (candidates.length === 0) fail(`NO_CANDIDATES:${title}`);
    contests.push({ chamber: "upper", district: match[1]!, candidates });
  });
  return contests;
}

export const MICHIGAN_GENERAL: StateGeneralAdapter = {
  stateCode: "MI",
  authority: "Michigan Secretary of State, 2022 general election official results",
  sources: SOURCES,
  expectedContests: { "mi-2022-general-cenr-html": 38 },
  parse: (bytes) => parse(bytes),
};
