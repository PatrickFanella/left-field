import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Mississippi Secretary of State, official recapitulation of the March 10, 2026 federal primary, one PDF per
 * party. No state office or legislative seat was on the 2026 ballot; the file covers U.S. Senate and the four
 * House districts. Unopposed candidates are printed.
 *
 * Each candidate row runs across county-column pages; only the last page of a sweep has a TOTAL column, and its
 * last figure is the statewide total. A candidate row that overflows into a later sweep with no office heading
 * (the Democratic file prints Jeffrey Hulum III, 4th District, on pages 9-17) belongs to the last office heading
 * seen, so the office carries across pages. No contest went to the April 7 runoff: the Secretary of State lists
 * no 2026 runoff results.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ms-2026-primary-republican-recap-pdf", url: "https://www.sos.ms.gov/content/documents/elections/2026/republican%20primary%202026.pdf", path: "data/source/rapid/state-primary/ms/2026-primary-republican-recap.pdf", cycleYear: 2026, electionDate: "2026-03-10", note: "Official Republican recapitulation: U.S. Senate and House.", pdfLayoutExtract: true },
  { id: "ms-2026-primary-democratic-recap-pdf", url: "https://www.sos.ms.gov/content/documents/elections/2026/Recap%20report%20Democratic%20Primary%202026.pdf", path: "data/source/rapid/state-primary/ms/2026-primary-democratic-recap.pdf", cycleYear: 2026, electionDate: "2026-03-10", note: "Official Democratic recapitulation: U.S. Senate and House.", pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`MISSISSIPPI_PRIMARY_${code}`); };

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const party = source.id.includes("republican") ? "Republican" : "Democrat";
  const contests = new Map<string, { base: Pick<RawPrimaryContest, "office" | "district">; totals: Map<string, number> }>();
  let office: string | null = null;
  for (const page of bytes.toString("utf8").split("\f")) {
    const totalPage = /\bTOTAL\s*$/m.test(page);
    for (const line of page.split(/\r?\n/)) {
      if (/^\s*United States-Senate\s*$/.test(line)) { office = "senate"; continue; }
      const house = line.match(/^\s*US House Of Rep (\d+)-\d+(?:st|nd|rd|th) Congressional\s*$/);
      if (house) { office = String(Number(house[1])); continue; }
      const row = line.match(/^(\S.*?)\s{2,}(Republican|Democrat)\s{2,}(.+)$/);
      if (!row) continue;
      if (row[2] !== party) fail(`PARTY:${source.id}:${row[1]}`);
      if (office === null) fail(`ROW_BEFORE_OFFICE:${source.id}:${row[1]}`);
      const key = office!;
      const entry = contests.get(key) ?? { base: key === "senate" ? { office: "us_senate" as const, district: null } : { office: "us_house" as const, district: key }, totals: new Map<string, number>() };
      contests.set(key, entry);
      const name = row[1]!.trim();
      if (!totalPage) { if (!entry.totals.has(name)) entry.totals.set(name, -1); continue; }
      const last = row[3]!.trim().split(/\s+/).at(-1)!;
      if (!/^\d+$/.test(last)) fail(`TOTAL:${source.id}:${name}`);
      if ((entry.totals.get(name) ?? -1) >= 0) fail(`DUPLICATE_TOTAL:${source.id}:${name}`);
      entry.totals.set(name, Number(last));
    }
  }
  return [...contests.values()].map(({ base, totals }) => ({
    ...base, rawParty: party,
    candidates: [...totals].map(([name, votes]) => (votes < 0 ? fail(`TOTAL_MISSING:${source.id}:${name}`) : { name, votes })),
  }));
}

export const MISSISSIPPI_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MS",
  authority: "Mississippi Secretary of State, official recapitulation of the 2026 federal primary",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ms-2026-primary-republican-recap-pdf": 5, "ms-2026-primary-democratic-recap-pdf": 5 },
  parse: (bytes, source) => parse(bytes, source),
};
