import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";
import { assignWords, cells, count } from "../state-general/layout-columns";

/**
 * Kentucky State Board of Elections, official 2026 primary results as
 * certified (PDF; the build reads its pinned `pdftotext -layout` extract).
 * Each race block reads the district ("1st Congressional District", "6th
 * Senatorial District", "2nd Representative District"; the U.S. Senate block
 * has no district), the party ("Republican Party"), the candidates' names in
 * columns over one or more rows (given names, then the surname in capitals),
 * county rows, and a "Total Votes" row with one total per candidate in
 * column order. Long races continue over pages that repeat the name rows; only
 * the first are read. Each name is the words placed under its column, top to
 * bottom. pdftotext sometimes splits a capitalised surname ("FA RIS"); a
 * one- or two-letter capital fragment is joined to the next.
 *
 * Kentucky holds no primary for a party with a single candidate, and the
 * certification prints only contested races. Unopposed nominees come from the
 * Secretary of State's candidate filings for the 2026 general election (one
 * page per office): a Democratic or Republican filer whose party had no
 * printed primary in the district was nominated unopposed. Each page ends with
 * a "Withdrawn / Deceased / Disqualified" section, which is not read.
 */
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const CERTIFICATION = "ky-2026-primary-certification-pdf";
const filings = (id: string, office: number, file: string, label: string): StateGeneralSource =>
  ({ id, url: `https://web.sos.ky.gov/CandidateFilings/Default.aspx?id=${office}`, path: `data/source/rapid/state-primary/ky/${file}`, cycleYear: 2026, electionDate: "2026-05-19", note: `Secretary of State candidate filings for the 2026 general election, ${label}: names the nominees of primaries not held because unopposed.`, userAgent: BROWSER });
const HOUSE_FILINGS = "ky-2026-primary-us-house-candidate-filings-html", SENATE_FILINGS = "ky-2026-primary-state-senate-candidate-filings-html", STATE_HOUSE_FILINGS = "ky-2026-primary-state-house-candidate-filings-html";
const SOURCES: readonly StateGeneralSource[] = [
  { id: CERTIFICATION, url: "https://elect.ky.gov/Documents/2026%20Primary%20Certification%20of%20Vote%20Totals%20Final.pdf", path: "data/source/rapid/state-primary/ky/2026-primary-certification.pdf", cycleYear: 2026, electionDate: "2026-05-19", note: "State Board of Elections certification of the May 19 primary vote totals; contested races only.", userAgent: BROWSER, pdfLayoutExtract: true },
  filings(HOUSE_FILINGS, 4, "2026-general-us-house-candidate-filings.html", "U.S. House"),
  filings(SENATE_FILINGS, 11, "2026-general-state-senate-candidate-filings.html", "State Senate"),
  filings(STATE_HOUSE_FILINGS, 12, "2026-general-state-house-candidate-filings.html", "State House"),
];

const fail = (code: string): never => { throw new Error(`KENTUCKY_PRIMARY_${code}`); };
const PARTY: Readonly<Record<string, string>> = { "Republican Party": "Republican", "Democratic Party": "Democratic" };
type Office = Pick<RawPrimaryContest, "office" | "district">;
const keyOf = (office: Office, party: string): string => `${office.office}|${office.district ?? ""}|${party}`;
const OFFICE_BY_KIND: Readonly<Record<string, RawPrimaryContest["office"]>> = { Congressional: "us_house", Senatorial: "state_upper", Representative: "state_lower" };

/**
 * Three races print more names than their columns hold on one line, and pdftotext's layout places some words under
 * the wrong column. Their names, in column order, are read from the same PDF's rotated name text (`pdftotext
 * -raw`, given names then surname per candidate) and checked against the column count; votes still come from the
 * layout's Total Votes row.
 */
const NAMES: Readonly<Record<string, readonly string[]>> = {
  "us_senate||Republican": ["Andy BARR", "Daniel CAMERON", "Michael James FARIS", "George WASHINGTON", 'Valerie "Dr Val" FREDRICK', "Anissa CATLETT", "James D. DUNCAN", "Jonathan M. HOLLIDAY", "A. Nick SHELLEY", "Other Donald WENZEL", "Jimmy I. LEON"],
  "us_senate||Democratic": ["Charles BOOKER", "Amy McGRATH", "Pamela STEVENSON", "Dale Lewis ROMANS", "Logan FORSYTHE", "Vincent Anthony THOMPSON", "Joshua BLANTON SR."],
  "us_house|6|Democratic": ["Zach DEMBO", "Cherlynn STEVENSON", "Erin PETREY", "David KLOIBER", "Corey EDWARDS", "Harvey CARROLL JR.", "Jimmy Clifton AUSBROOKS"],
};

/** Joins kerning fragments of a capitalised surname ("FA RIS" to "FARIS"). */
const joinFragments = (words: readonly string[]): string => words.reduce<string[]>((out, word) => {
  const last = out.at(-1);
  if (last !== undefined && /^[A-Z]{1,2}$/.test(last) && /^[A-Z]/.test(word) && word === word.toUpperCase()) out[out.length - 1] = last + word;
  else out.push(word);
  return out;
}, []).join(" ");

function parseCertification(bytes: Buffer): RawPrimaryContest[] {
  const lines = bytes.toString("utf8").replace(/\f/g, "\n").split(/\r?\n/);
  const contests: RawPrimaryContest[] = [];
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index]!.trim();
    const district = heading.match(/^(\d+)(?:st|nd|rd|th) (Congressional|Senatorial|Representative) District$/);
    if (!district && heading !== "United States Senator") continue;
    const party = PARTY[lines[index + 1]?.trim() ?? ""];
    if (!party) continue;
    const office: Office = district ? { office: OFFICE_BY_KIND[district[2]!]!, district: district[1]! } : { office: "us_senate", district: null };
    let cursor = index + 2;
    const nameRows: string[] = [];
    while (cursor < lines.length && !cells(lines[cursor]!).some((cell) => count(cell.text) !== null)) nameRows.push(lines[cursor++]!);
    let totals: ReturnType<typeof cells> | null = null;
    for (; cursor < lines.length; cursor++) {
      if (/^\s*Total Votes\b/.test(lines[cursor]!)) { totals = cells(lines[cursor]!).slice(1); break; }
      if (/^\s*(Republican|Democratic) Party\s*$/.test(lines[cursor]!)) break;
    }
    if (!totals || totals.length === 0) return fail(`TOTALS_MISSING:${heading}:${party}`);
    const votes = totals.map((cell) => count(cell.text) ?? fail(`TOTAL_CELL:${heading}:${cell.text}`));
    const anchors = totals.map((cell) => cell.centre);
    const words = anchors.map(() => [] as string[]);
    for (const row of nameRows) assignWords(anchors, row).forEach((text, column) => { if (text !== "") words[column]!.push(...text.split(" ")); });
    const override = NAMES[keyOf(office, party)];
    if (override && override.length !== votes.length) fail(`NAME_OVERRIDE_COUNT:${keyOf(office, party)}:${votes.length}`);
    const candidates = votes.map((total, column) => {
      const name = override ? override[column]! : joinFragments(words[column]!);
      return name === "" ? fail(`NAME_MISSING:${heading}:${party}:${column}`) : { name, votes: total };
    });
    contests.push({ ...office, rawParty: party, candidates });
    index = cursor;
  }
  return contests;
}

const text = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function parseFilings(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const html = bytes.toString("utf8");
  const withdrawn = html.indexOf("Withdrawn / Deceased / Disqualified");
  const active = withdrawn >= 0 ? html.slice(0, withdrawn) : fail(`WITHDRAWN_SECTION_MISSING:${source.id}`);
  const held = new Set(parseCertification(readSource(CERTIFICATION)).map((contest) => keyOf(contest, contest.rawParty!)));
  const nominees = new Map<string, Office & { party: string; names: string[] }>();
  for (const row of active.matchAll(/<tr class="boldleft"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const columns = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]!));
    if (columns.length !== 6) fail(`ROW_CELLS:${source.id}:${columns.length}`);
    const [name, , officeName, districtName, partyName] = columns as [string, string, string, string, string];
    const kind = officeName === "US Representative" ? "us_house" : officeName === "State Senator" ? "state_upper" : officeName === "State Representative" ? "state_lower" : fail(`OFFICE:${officeName}`);
    const district = districtName.match(/^(\d+)(?:st|nd|rd|th)$/)?.[1] ?? fail(`DISTRICT:${districtName}`);
    const party = PARTY[partyName];
    if (!party) continue;
    const office: Office = { office: kind, district };
    const key = keyOf(office, party);
    if (held.has(key)) continue;
    const entry = nominees.get(key) ?? { ...office, party, names: [] };
    entry.names.push(name);
    nominees.set(key, entry);
  }
  return [...nominees.values()].map((entry) => {
    if (entry.names.length !== 1) fail(`UNOPPOSED_NOT_ONE:${entry.office}:${entry.district}:${entry.party}:${entry.names.join("/")}`);
    return { office: entry.office, district: entry.district, rawParty: entry.party, candidates: [{ name: entry.names[0]!, votes: null, winner: true }] };
  });
}

export const KENTUCKY_PRIMARY: StatePrimaryAdapter = {
  stateCode: "KY",
  authority: "Kentucky State Board of Elections, 2026 primary certification, and Secretary of State candidate filings",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [CERTIFICATION]: 50, [HOUSE_FILINGS]: 3, [SENATE_FILINGS]: 20, [STATE_HOUSE_FILINGS]: 117 },
  parse: (bytes, source, readSource) => source.id === CERTIFICATION ? parseCertification(bytes) : parseFilings(bytes, source, readSource),
};
