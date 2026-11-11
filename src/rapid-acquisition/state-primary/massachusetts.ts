import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Massachusetts Secretary of the Commonwealth, certified election statistics
 * (electionstats.state.ma.us), the same site and page layout as the
 * general-election adapter: the election search page for one office, year
 * 2026 and stage "Primaries" lists every party primary with its full
 * candidate table, the source's winner mark (`is_winner` row class), "All
 * Others" for scattered write-ins, "Blanks" and "Total Votes Cast".
 *
 * The state primary was September 1, 2026, one Democratic and one Republican
 * primary per district; a primary in which nobody filed ("No Candidates", or
 * only "All Others") is skipped. A candidate nominated by write-in is printed with a
 * "(Write-In)" suffix, which is removed and the line kept as a named
 * candidate. The House and Senate pages also list the 2026 special primaries
 * for the 5th Essex House seat (March 3) and the 1st Middlesex Senate seat
 * (February 3); the search page prints no dates, so those two dates are taken
 * from each election's detail page and keyed by election id here. Senate
 * district names write "&" and "1st" where the roster writes "and" and
 * "First"; House districts keep "1st".
 */
const searchUrl = (office: number): string => `https://electionstats.state.ma.us/elections/search/year_from:2026/year_to:2026/office_id:${office}/stage:Primaries`;
const SOURCES: readonly (StateGeneralSource & { office: PrimaryOffice; label: string })[] = [
  { id: "ma-2026-primary-house-search-html", url: searchUrl(8), path: "data/source/rapid/state-primary/ma/2026-primary-house-search.html", cycleYear: 2026, electionDate: "2026-09-01", note: "State Representative primaries, both parties, 160 districts, and the 5th Essex special primary.", office: "state_lower", label: "State Representative" },
  { id: "ma-2026-primary-senate-search-html", url: searchUrl(9), path: "data/source/rapid/state-primary/ma/2026-primary-senate-search.html", cycleYear: 2026, electionDate: "2026-09-01", note: "State Senate primaries, both parties, 40 districts, and the 1st Middlesex special primary.", office: "state_upper", label: "State Senate" },
  { id: "ma-2026-primary-governor-search-html", url: searchUrl(3), path: "data/source/rapid/state-primary/ma/2026-primary-governor-search.html", cycleYear: 2026, electionDate: "2026-09-01", note: "Governor primaries, both parties.", office: "governor", label: "Governor" },
  { id: "ma-2026-primary-us-house-search-html", url: searchUrl(5), path: "data/source/rapid/state-primary/ma/2026-primary-us-house-search.html", cycleYear: 2026, electionDate: "2026-09-01", note: "U.S. House primaries, both parties, nine districts.", office: "us_house", label: "U.S. House" },
  { id: "ma-2026-primary-us-senate-search-html", url: searchUrl(6), path: "data/source/rapid/state-primary/ma/2026-primary-us-senate-search.html", cycleYear: 2026, electionDate: "2026-09-01", note: "U.S. Senate primaries, both parties.", office: "us_senate", label: "U.S. Senate" },
];

/** Special primary dates from each election's detail page (election_data date), by election id. */
const SPECIAL_DATES: Readonly<Record<string, string>> = { "171919": "2026-02-03", "171920": "2026-02-03", "171921": "2026-03-03", "171922": "2026-03-03" };
const ORDINAL_WORDS: Readonly<Record<number, string>> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth", 6: "Sixth", 7: "Seventh", 8: "Eighth", 9: "Ninth" };
const fail = (code: string): never => { throw new Error(`MASSACHUSETTS_PRIMARY_${code}`); };
const integer = (value: string): number => { const trimmed = value.replace(/,/g, "").trim(); return /^\d+$/.test(trimmed) ? Number(trimmed) : fail(`INTEGER_INVALID:${value}`); };
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const districtOf = (office: PrimaryOffice, raw: string): string | null => {
  if (office === "governor" || office === "us_senate") return raw === "Statewide" ? null : fail(`STATEWIDE:${raw}`);
  if (office === "us_house") return raw.match(/^(\d+)(?:st|nd|rd|th) Congressional$/)?.[1] ?? fail(`HOUSE_DISTRICT:${raw}`);
  const name = raw.replace(/\s*&\s*/g, " and ");
  return office === "state_upper" ? name.replace(/^(\d)(?:st|nd|rd|th)\b/, (_match, digit: string) => ORDINAL_WORDS[Number(digit)] ?? fail(`ORDINAL:${name}`)) : name;
};

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const spec = SOURCES.find((candidate) => candidate.id === source.id) ?? fail(`SOURCE_UNKNOWN:${source.id}`);
  const html = bytes.toString("utf8");
  const contests: RawPrimaryContest[] = [];
  for (const match of html.matchAll(/<tr id="election-id-(\d+)" class="election_item[^"]*">([\s\S]*?)<!--\/\/ END tr#election-id-\.\.\. \/\/-->/g)) {
    const id = match[1]!, body = match[2]!;
    const [year, office, district, stage] = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].slice(0, 4).map((cell) => text(cell[1]!));
    if (year !== "2026" || office !== spec.label) fail(`ROW_MISMATCH:${id}:${year}:${office}`);
    const stageMatch = stage!.match(/^(Special )?(Democratic|Republican) Primary$/) ?? fail(`STAGE:${id}:${stage}`);
    const special = stageMatch[1] !== undefined;
    if (special !== (id in SPECIAL_DATES)) fail(`SPECIAL_DATE_UNKNOWN:${id}`);
    if (/<div class="no_candidates">No Candidates<\/div>/.test(body)) continue;
    const table = body.match(/<table class="candidates"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? fail(`CANDIDATES_MISSING:${id}`);
    const candidates = [...table.matchAll(/<tr class="([^"]*)">([\s\S]*?)<\/tr>/g)].flatMap((row): { name: string; votes: number; winner?: boolean; writeIn?: boolean }[] => {
      const classes = row[1]!, cellsHtml = row[2]!;
      if (/n_blank_votes|n_total_votes|more_info/.test(classes)) return [];
      const votes = integer(text(cellsHtml.match(/<td class="number">([\s\S]*?)<\/td>/)?.[1] ?? ""));
      if (/n_all_other_votes/.test(classes)) return [{ name: "All Others", votes, writeIn: true }];
      const name = text(cellsHtml.match(/<div class="name">([\s\S]*?)<\/div>/)?.[1] ?? fail(`NAME_MISSING:${id}`)).replace(/\s*\(Write-In\)$/i, "");
      return [{ name, votes, ...(/\bis_winner\b/.test(classes) ? { winner: true } : {}) }];
    });
    if (!candidates.some((candidate) => !candidate.writeIn)) continue;
    contests.push({ office: spec.office, district: districtOf(spec.office, district!), rawParty: stageMatch[2]!, ...(special ? { special: true, electionDate: SPECIAL_DATES[id]! } : {}), candidates });
  }
  return contests;
}

export const MASSACHUSETTS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MA",
  authority: "Massachusetts Secretary of the Commonwealth, certified election statistics",
  system: "partisan",
  sources: SOURCES.map(({ id, url, path, cycleYear, electionDate, note }) => ({ id, url, path, cycleYear, electionDate, note })),
  expectedContests: { "ma-2026-primary-house-search-html": 206, "ma-2026-primary-senate-search-html": 52, "ma-2026-primary-governor-search-html": 2, "ma-2026-primary-us-house-search-html": 15, "ma-2026-primary-us-senate-search-html": 2 },
  parse,
};
