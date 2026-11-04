import { assign, cells, count } from "../state-general/layout-columns";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Montana Secretary of State, June 2, 2026 primary: the state canvass and the
 * legislative canvass the State Board of Canvassers adopted on June 29, 2026,
 * read from their pdftotext layout extracts. sosmt.gov refuses this project's
 * network (HTTP 403) and the Internet Archive holds no capture of either PDF,
 * so both were fetched from their official URLs through a fetch service outside
 * this network and placed at their paths by hand, byte for byte.
 *
 * The state canvass prints one table per office and party: the contest title
 * and the candidates' full names over county columns, ending in a "Total" row.
 * The legislative canvass prints one block per district ("HD 01", "SD 08"):
 * one row per candidate, the party, the county figures and a total, with only
 * the candidate's surname under it (long surnames wrap). Neither marks a
 * nominee, and neither prints write-ins.
 *
 * Full names come from the Secretary of State's results service: its 2026
 * primary candidate list (electionresults.mt.gov's GetCandidates call,
 * captured by the Internet Archive on July 7, 2026, after the canvass; the
 * service itself now serves the general election). Each canvass candidate is
 * matched to the one listed candidate of the same office, district and party
 * whose name ends in the printed surname, and each federal column to the one
 * listed name it contains; every listed candidate must be used exactly once,
 * so a misread fails the build instead of naming the wrong person.
 */
const DIR = "data/source/rapid/state-primary/mt";
const STATE = "mt-2026-primary-state-canvass-pdf", LEGISLATIVE = "mt-2026-primary-legislative-canvass-pdf", CANDIDATES = "mt-2026-primary-candidate-list-json";
const FETCHED = "sosmt.gov refuses this network and the Internet Archive has no capture; fetched from the official URL through a fetch service outside this network and placed by hand.";
const SOURCES: readonly StateGeneralSource[] = [
  { id: STATE, url: "https://sosmt.gov/wp-content/uploads/wpfd/preview_files/2026-Primary-State-Canvass(f0627306086b974f9ac2e416bb8125c9).pdf", path: `${DIR}/2026-primary-state-canvass.pdf`, cycleYear: 2026, electionDate: "2026-06-02", note: `State canvass of June 29, 2026: U.S. Senate and both House districts, every party. ${FETCHED}`, pdfLayoutExtract: true },
  { id: LEGISLATIVE, url: "https://sosmt.gov/wp-content/uploads/wpfd/preview_files/2026-Primary-Legislative-Canvass(076b2ed8bde20942539d7c25042d66ff).pdf", path: `${DIR}/2026-primary-legislative-canvass.pdf`, cycleYear: 2026, electionDate: "2026-06-02", note: `Legislative canvass: 100 House and 25 Senate districts, surnames only. ${FETCHED}`, pdfLayoutExtract: true },
  { id: CANDIDATES, url: "https://web.archive.org/web/20260707173752id_/https://esersws.mt.gov/ResultsAjax.svc/GetCandidates?ElectionType=Primary&ElectionID=0", path: `${DIR}/2026-primary-candidates-20260707.json`, cycleYear: 2026, electionDate: "2026-06-02", note: "The Secretary of State's 2026 primary candidate list (full names), read only to name the canvass candidates. Internet Archive capture of July 7, 2026; the official service now serves the general election. Placed by hand with curl." },
];

const fail = (code: string): never => { throw new Error(`MONTANA_PRIMARY_${code}`); };
const letters = (value: string): string => value.toUpperCase().replace(/[^A-Z]/g, "");
const PARTIES: Readonly<Record<string, string>> = { Democrat: "Democratic", Republican: "Republican", Libertarian: "Libertarian", Green: "Green" };
const SUFFIX = /\s+(JR|SR|II|III|IV)\.?$/;

type Listed = { name: string; party: string; used: boolean };

/**
 * The listed full name ends in the printed surname (wrapped lines joined), or, for a hyphenated printed surname
 * ("ZINN-BRITTAIN"), the listed family name is one of its parts ("STACY ZINN").
 */
const surnameMatches = (listedName: string, printed: string): boolean => {
  const name = listedName.replace(SUFFIX, "");
  if (letters(name).endsWith(letters(printed))) return true;
  const family = letters(name.split(" ").at(-1) ?? "");
  return printed.includes("-") && printed.split("-").some((part) => part !== "" && part === family);
};

/** The candidate list, grouped by office title and party ("STATE SENATOR DISTRICT 8|Democratic"). */
function listedCandidates(bytes: Buffer): Map<string, Listed[]> {
  const rows = (JSON.parse(bytes.toString("utf8")) as { d: { Party: string; desc: string; name: string }[] }).d;
  const groups = new Map<string, Listed[]>();
  for (const row of rows) {
    if (!/^(UNITED STATES SENATOR|UNITED STATES REPRESENTATIVE (1ST|2ND) CONGRESSIONAL|STATE (REPRESENTATIVE|SENATOR) DISTRICT \d+)$/.test(row.desc)) continue;
    const party = PARTIES[row.Party] ?? fail(`LIST_PARTY:${row.desc}:${row.Party}`);
    const key = `${row.desc}|${party}`;
    groups.set(key, [...(groups.get(key) ?? []), { name: row.name.replace(/\s+/g, " ").trim(), party, used: false }]);
  }
  return groups;
}

const take = (group: Listed[], test: (listed: Listed) => boolean, where: string): string => {
  const found = group.filter((listed) => !listed.used && test(listed));
  if (found.length !== 1) fail(`NAME_${found.length === 0 ? "UNMATCHED" : "AMBIGUOUS"}:${where}`);
  found[0]!.used = true;
  return found[0]!.name;
};

const PAGE_FURNITURE = /MONTANA SECRETARY OF STATE|PRIMARY ELECTION CANVASS|^\s*\d+ of \d+\s*$/;
const COUNTY_ROW = /^[A-Z][A-Z ]*?\s+\d/;

/** The state canvass: one table per office and party, full names over county columns, then a Total row. */
function parseState(text: string, listed: Map<string, Listed[]>): RawPrimaryContest[] {
  const lines = text.split("\n").filter((line) => !PAGE_FURNITURE.test(line));
  const contests: RawPrimaryContest[] = [];
  let header: string[] = [], inTable = false;
  for (const line of lines) {
    if (line.trim() === "") { if (!inTable) continue; inTable = false; header = []; continue; }
    if (!inTable && COUNTY_ROW.test(line)) inTable = true;
    if (!inTable) { header.push(line); continue; }
    if (!line.startsWith("Total")) continue;
    const title = header.join(" ").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const party = ["Democratic", "Republican", "Libertarian"].find((label) => title.includes(letters(label)));
    const office: Pick<RawPrimaryContest, "office" | "district"> | null = title.startsWith("UNITEDSTATESSENATOR") ? { office: "us_senate", district: null }
      : title.startsWith("UNITEDSTATESREPRESENTATIVE1STCONGRESSIONAL") ? { office: "us_house", district: "1" }
      : title.startsWith("UNITEDSTATESREPRESENTATIVE2NDCONGRESSIONAL") ? { office: "us_house", district: "2" } : null;
    if (title.startsWith("UNITEDSTATES") && (!office || !party)) fail(`STATE_TITLE:${title}`);
    if (office && party) {
      const totals = cells(line).slice(1);
      const votes = totals.map((cell) => count(cell.text) ?? fail(`STATE_TOTAL:${title}:${cell.text}`));
      const anchors = totals.map((cell) => cell.centre);
      const columns = anchors.map(() => "");
      for (const row of header) assign(anchors, cells(row)).forEach((part, index) => { columns[index] = `${columns[index]} ${part}`; });
      const desc = office.office === "us_senate" ? "UNITED STATES SENATOR" : `UNITED STATES REPRESENTATIVE ${office.district === "1" ? "1ST" : "2ND"} CONGRESSIONAL`;
      const group = listed.get(`${desc}|${party}`) ?? fail(`STATE_NOT_LISTED:${desc}:${party}`);
      if (group.length !== votes.length) fail(`STATE_COLUMNS:${desc}:${party}:${votes.length}:${group.length}`);
      const candidates = columns.map((column, index) => ({ name: take(group, (entry) => letters(column).includes(letters(entry.name)), `${desc}:${party}:${column.trim()}`), votes: votes[index]! }));
      contests.push({ ...office, rawParty: party, candidates });
    }
    inTable = false; header = [];
  }
  return contests;
}

/** The legislative canvass: per district, one party row (county figures, total) per candidate, the surname under it. */
function parseLegislative(text: string, listed: Map<string, Listed[]>): RawPrimaryContest[] {
  const lines = text.split("\n").filter((line) => !PAGE_FURNITURE.test(line));
  const contests: RawPrimaryContest[] = [];
  let block: { chamber: "HD" | "SD"; district: string; rows: { party: string; votes: number; surname: string }[] } | null = null;
  let row: { party: string; votes: number; surname: string } | null = null;
  const close = () => {
    if (!block) return;
    const desc = `STATE ${block.chamber === "HD" ? "REPRESENTATIVE" : "SENATOR"} DISTRICT ${block.district}`;
    for (const party of [...new Set(block.rows.map((entry) => entry.party))]) {
      const group = listed.get(`${desc}|${party}`) ?? fail(`LEG_NOT_LISTED:${desc}:${party}`);
      const rows = block.rows.filter((entry) => entry.party === party);
      if (rows.length !== group.length) fail(`LEG_COUNT:${desc}:${party}:${rows.length}:${group.length}`);
      const candidates = rows.map((entry) => {
        if (entry.surname === "") fail(`LEG_SURNAME_MISSING:${desc}:${party}`);
        return { name: take(group, (listedEntry) => surnameMatches(listedEntry.name, entry.surname), `${desc}:${party}:${entry.surname}`), votes: entry.votes };
      });
      contests.push({ office: block.chamber === "HD" ? "state_lower" : "state_upper", district: block.district, rawParty: party, candidates });
    }
  };
  for (const line of lines) {
    const head = line.match(/^\s+(HD|SD) (\d+)\s+Total\s*$/);
    if (head) { close(); block = { chamber: head[1] as "HD" | "SD", district: String(Number(head[2])), rows: [] }; row = null; continue; }
    if (!block) { if (line.trim() !== "") fail(`LEG_OUTSIDE_BLOCK:${line.trim()}`); continue; }
    const party = line.match(/^(Democratic|Republican|Libertarian|Green)\s+(\d[\d ]*)$/);
    if (party) {
      const figures = party[2]!.trim().split(/\s+/).map(Number), total = figures.at(-1)!;
      if (figures.slice(0, -1).reduce((sum, value) => sum + value, 0) !== total) fail(`LEG_SUM:${block.chamber}${block.district}:${line.trim()}`);
      row = { party: party[1]!, votes: total, surname: "" };
      block.rows.push(row);
      continue;
    }
    if (line.trim() === "") { row = null; continue; }
    // Lines before the first party row name the counties; lines after one carry its surname, wrapped.
    if (row) row.surname += line.trim().toUpperCase().replace(/[^A-Z-]/g, "");
  }
  close();
  return contests;
}

function parse(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  if (source.id === CANDIDATES) return [];
  const listed = listedCandidates(readSource(CANDIDATES));
  const text = bytes.toString("utf8");
  if (source.id === STATE) {
    if (!/2026 STATEWIDE PRIMARY ELECTION CANVASS/.test(text)) fail("STATE_TITLE_MISSING");
    return parseState(text, listed);
  }
  if (source.id === LEGISLATIVE) {
    if (!/2026 LEGISLATIVE PRIMARY ELECTION CANVASS/.test(text)) fail("LEG_TITLE_MISSING");
    return parseLegislative(text, listed);
  }
  return fail(`SOURCE_UNKNOWN:${source.id}`);
}

export const MONTANA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MT",
  authority: "Montana Secretary of State, state and legislative primary canvass",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [STATE]: 9, [LEGISLATIVE]: 236, [CANDIDATES]: 0 },
  parse,
};
