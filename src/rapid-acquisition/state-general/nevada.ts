import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";
import type { RosterParty } from "../state-legislative-roster";

/**
 * Nevada Secretary of State, statewide general election results pages
 * (ElectionSummary.aspx), with party from the Legislative Counsel Bureau's
 * candidate lists. The Secretary of State's site refuses this project's
 * network (Incapsula), so both results pages are retained from Internet
 * Archive captures made after the canvass. The 2024 page is headed "2024
 * Official"; the 2022 page kept its election-night heading ("2022
 * Unofficial") but carries the canvassed figures: its governor and U.S.
 * Senate totals equal the certified ones (Lombardo 497,377, Sisolak 481,991;
 * Cortez Masto 498,316, Laxalt 490,388).
 *
 * Each contest is a table under "State Senate, District 1" or "State
 * Assembly, District  1" (two spaces before a single digit), one row per
 * candidate as "SURNAME, GIVEN": name, percent, total, then county columns.
 * The pages give no party. The Research Division's lists of legislative
 * candidates on the general ballot, compiled from the Secretary of State's
 * certified candidate lists, give it; a result matches the list entry in
 * its chamber whose name, letters only and without suffixes or nicknames,
 * ends with the result's surname, narrowed by the first letters of the given
 * name when surnames repeat. Every list entry must be used once. Reed
 * Mitchell (2022 Assembly 26) is on the ballot but not on the August 2022
 * list; Ballotpedia lists him as a Libertarian, and either way he is neither
 * Democratic nor Republican, so the district's margin does not depend on it.
 *
 * All 42 Assembly districts are elected every two years (2022 superseded by
 * 2024). Senators serve four years: 11 districts were elected in 2022 and
 * the other 10 in 2024.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "nv-2024-general-election-summary-html",
    url: "https://web.archive.org/web/20250415181049id_/https://www.nvsos.gov/SOSelectionPages/results/2024StateWideGeneral/ElectionSummary.aspx",
    path: "data/source/rapid/state-general/nv/2024-general-election-summary.html",
    cycleYear: 2024,
    electionDate: "2024-11-05",
    note: "42 Assembly and 10 Senate contests; party from the 2024 candidate list.",
  },
  {
    id: "nv-2022-general-election-summary-html",
    url: "https://web.archive.org/web/20240103160530id_/https://www.nvsos.gov/SOSelectionPages/results/2022StateWideGeneral/ElectionSummary.aspx",
    path: "data/source/rapid/state-general/nv/2022-general-election-summary.html",
    cycleYear: 2022,
    electionDate: "2022-11-08",
    note: "42 Assembly (superseded by 2024) and 11 Senate contests; party from the 2022 candidate list.",
  },
  {
    id: "nv-2024-general-legislative-candidates-pdf",
    url: "https://www.leg.state.nv.us/Division/Research/Documents/CandidatesList_2024General.pdf",
    path: "data/source/rapid/state-general/nv/2024-general-legislative-candidates.pdf",
    cycleYear: 2024,
    electionDate: "2024-11-05",
    note: "Party for the 2024 results; reports no contests.",
    pdfLayoutExtract: true,
  },
  {
    // The Research Division publishes each cycle's list at this same address; the retained bytes are the August 2022 list.
    id: "nv-2022-general-legislative-candidates-pdf",
    url: "https://www.leg.state.nv.us/Division/Research/Documents/CandidatesList_GeneralElection.pdf",
    path: "data/source/rapid/state-general/nv/2022-general-legislative-candidates.pdf",
    cycleYear: 2022,
    electionDate: "2022-11-08",
    note: "Party for the 2022 results; reports no contests.",
    pdfLayoutExtract: true,
  },
];

const CANDIDATE_LISTS: Readonly<Record<string, string>> = {
  "nv-2024-general-election-summary-html": "nv-2024-general-legislative-candidates-pdf",
  "nv-2022-general-election-summary-html": "nv-2022-general-legislative-candidates-pdf",
};
/** Candidates on the ballot but not on the Research Division's list, by chamber, district and result name. */
const PARTY_OVERRIDES: Readonly<Record<string, string>> = { "2022|lower|26|MITCHELL, REED": "Libertarian" };

const fail = (code: string): never => { throw new Error(`NEVADA_GENERAL_${code}`); };
const PARTY = /^(Democrat|Republican|Libertarian|Independent American|No Political Party)$/;
const SUFFIX = new Set(["JR", "SR", "II", "III", "IV"]);
const fold = (value: string): string => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
const letters = (value: string): string => value.replace(/[^A-Z]/g, "");
/** A list name ("Philip (P. K.) O'Neill*", "Max Carter, II*") as letters, without nickname or suffix. */
const listKey = (name: string): string => letters(fold(name).replace(/"[^"]*"|\([^)]*\)/g, " ").replace(/[,*]/g, " ").split(/\s+/).filter((token) => !SUFFIX.has(token.replace(/\./g, ""))).join(""));
const partyOf = (label: string): { rawParty: string; party?: RosterParty } => label === "No Political Party" ? { rawParty: label, party: "Independent" } : { rawParty: label };

interface ListEntry { readonly name: string; readonly key: string; readonly party: string; used: boolean }

function parseCandidateList(text: string): Record<"upper" | "lower", ListEntry[]> {
  const entries: Record<"upper" | "lower", ListEntry[]> = { upper: [], lower: [] };
  let chamber: "upper" | "lower" | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/SENATE CANDIDATES/.test(line)) { chamber = "upper"; continue; }
    if (/ASSEMBLY CANDIDATES/.test(line)) { chamber = "lower"; continue; }
    const match = line.match(/^\s*(?:\d+\s+)?(\S.*?\S)\s{2,}(\S.*?)\s*$/);
    if (!chamber || !match || !PARTY.test(match[2]!)) continue;
    entries[chamber].push({ name: match[1]!, key: listKey(match[1]!), party: match[2]!, used: false });
  }
  return entries;
}

function parse(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawGeneralContest[] {
  const listId = CANDIDATE_LISTS[source.id];
  if (listId === undefined) return [];
  const list = parseCandidateList(readSource(listId).toString("utf8"));
  const html = bytes.toString("utf8");
  const contests: RawGeneralContest[] = [];
  for (const block of html.matchAll(/<strong>State (Senate|Assembly), District\s+(\d+)<\/strong>([\s\S]*?)<\/table>/g)) {
    const chamber = block[1] === "Senate" ? "upper" as const : "lower" as const, district = String(Number(block[2]));
    const candidates = [...block[3]!.matchAll(/<tr>\s*<td>([^<]+)<\/td>\s*<td>[^<]*<\/td>\s*<td>([\d,]+)<\/td>/g)].map((row) => {
      const name = row[1]!.replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
      const votes = Number(row[2]!.replace(/,/g, ""));
      const override = PARTY_OVERRIDES[`${source.cycleYear}|${chamber}|${district}|${name}`];
      if (override) return { name, votes, ...partyOf(override) };
      const [surname = "", given = ""] = fold(name).split(",").map((part) => part.trim());
      const surnameKey = letters(surname.split(/\s+/).filter((token) => !SUFFIX.has(token.replace(/\./g, ""))).join(""));
      const givenKey = letters(fold(name).split(",").at(-1)!.replace(/"[^"]*"/g, "")).slice(0, 3);
      let hits = list[chamber].filter((entry) => !entry.used && entry.key.endsWith(surnameKey));
      if (hits.length > 1) hits = hits.filter((entry) => entry.key.startsWith(givenKey));
      if (surnameKey === "" || given === "" || hits.length !== 1) fail(`PARTY_UNMATCHED:${source.id}:${chamber}:${district}:${name}:${hits.length}`);
      hits[0]!.used = true;
      return { name, votes, ...partyOf(hits[0]!.party) };
    });
    if (candidates.length === 0) fail(`NO_CANDIDATES:${source.id}:${chamber}:${district}`);
    contests.push({ chamber, district, candidates });
  }
  const unused = [...list.upper, ...list.lower].filter((entry) => !entry.used);
  if (unused.length > 0) fail(`LIST_UNUSED:${source.id}:${unused.map((entry) => entry.name).join("|")}`);
  return contests;
}

export const NEVADA_GENERAL: StateGeneralAdapter = {
  stateCode: "NV",
  authority: "Nevada Secretary of State, statewide general election results; party from the Legislative Counsel Bureau's candidate lists",
  sources: SOURCES,
  expectedContests: {
    "nv-2024-general-election-summary-html": 52,
    "nv-2022-general-election-summary-html": 53,
    "nv-2024-general-legislative-candidates-pdf": 0,
    "nv-2022-general-legislative-candidates-pdf": 0,
  },
  parse,
};
