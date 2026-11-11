import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Illinois State Board of Elections, official canvass of the March 17, 2026
 * general primary (certified April 16, 2026), as the board publishes it under
 * Downloadable Vote Totals: one PDF book, read through its pinned
 * `pdftotext -layout` extract. For 2026 the board offers no text or workbook
 * file. Each contest opens with the office ("REPRESENTATIVE IN CONGRESS"), the
 * district spelled out ("NINETY-FOURTH REPRESENTATIVE DISTRICT"), then one
 * summary line per candidate with party, statewide total and percent of the
 * party vote; the board prefixes nominees with "(Won)" and suffixes write-in
 * candidates with "W-I". County tables follow and are not read. Unopposed
 * candidates are printed.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "il-2026-primary-official-canvass-pdf",
    url: "https://elections.il.gov/NewDocDisplay.aspx?khDtbt6dhc8zLboSZnz8zqVh5SQVox7uAOAe2nieWDAlNyd4%2btjArHsz9xVXIJ4p6Y57u3FvWw0%2bgnNWdT3uKyV44EJPSNKJqSNPoTMrt%2fmA2Vga9kq1ZX6%2f0lBROK1DmIXy%2fEucNyYjTbaS2ofZiBEhPRKGewj1Num6RpmfLs2HEipxm5fC%2bYiF3eZOQP9BQFqrW%2fNjZkexCnt5QztCrPJ7eQhQBsc8",
    path: "data/source/rapid/state-primary/il/2026GPOfficialVote.pdf",
    cycleYear: 2026,
    electionDate: "2026-03-17",
    note: "Official canvass book, 2026GPOfficialVote.pdf: U.S. Senate, governor, 17 House, 39 State Senate and 118 State House districts, every party.",
    pdfLayoutExtract: true,
  },
];

const fail = (code: string): never => { throw new Error(`ILLINOIS_PRIMARY_${code}`); };

const UNITS = ["", "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH", "ELEVENTH", "TWELFTH", "THIRTEENTH", "FOURTEENTH", "FIFTEENTH", "SIXTEENTH", "SEVENTEENTH", "EIGHTEENTH", "NINETEENTH"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
const TENTHS = ["", "", "TWENTIETH", "THIRTIETH", "FORTIETH", "FIFTIETH", "SIXTIETH", "SEVENTIETH", "EIGHTIETH", "NINETIETH"];

/** "NINETY-FOURTH" to 94, "ONE HUNDRED AND EIGHTEENTH" to 118, "ONE HUNDREDTH" to 100. */
export const ordinalNumber = (words: string): number => {
  if (words === "ONE HUNDREDTH") return 100;
  const hundred = words.startsWith("ONE HUNDRED AND ") ? 100 : 0;
  const rest = hundred ? words.slice("ONE HUNDRED AND ".length) : words;
  const unit = UNITS.indexOf(rest);
  if (unit > 0) return hundred + unit;
  const tenth = TENTHS.indexOf(rest);
  if (tenth > 1) return hundred + tenth * 10;
  const [tens, ones] = rest.split("-");
  const t = TENS.indexOf(tens ?? ""), u = UNITS.indexOf(ones ?? "");
  return t > 1 && u > 0 && u < 10 ? hundred + t * 10 + u : fail(`ORDINAL:${words}`);
};

const TITLES: Readonly<Record<string, RawPrimaryContest["office"]>> = {
  "UNITED STATES SENATOR": "us_senate",
  "GOVERNOR AND LIEUTENANT GOVERNOR": "governor",
  "REPRESENTATIVE IN CONGRESS": "us_house",
  "STATE SENATOR": "state_upper",
  "REPRESENTATIVE IN THE GENERAL ASSEMBLY": "state_lower",
};
const DISTRICT_WORD: Readonly<Partial<Record<RawPrimaryContest["office"], string>>> = { us_house: "CONGRESSIONAL", state_upper: "LEGISLATIVE", state_lower: "REPRESENTATIVE" };
const CANDIDATE = /^\s*(\(Won\)\s+)?(\S.*?)\s{2,}([A-Z]{2,4})\s+([\d,]+)\s+(?:<\s*\.01|[\d.]+)%(\s+W-I)?\s*$/;

function parse(bytes: Buffer): RawPrimaryContest[] {
  const contests = new Map<string, { office: RawPrimaryContest["office"]; district: string | null; party: string; candidates: { name: string; votes: number; winner?: true; writeIn?: true }[] }>();
  let title: string | null = null, office: RawPrimaryContest["office"] | null = null, district: string | null = null;
  let previous: { name: string } | null = null;
  for (const line of bytes.toString("utf8").split(/\r?\n/)) {
    const text = line.trim(), after = previous;
    previous = null;
    // A long name wraps onto the next line, under the name column, with nothing else on it.
    if (after && /^[A-Z][A-Z .,'"-]*$/.test(text) && !/\s{2}/.test(text) && TITLES[text] === undefined) { after.name = `${after.name} ${text}`; continue; }
    // The district line sometimes loses its last word ("FIFTY-NINTH LEGISLATIVE").
    const districtLine = text.match(/^([A-Z-]+(?: HUNDRED(?:TH| AND [A-Z-]+))?) (CONGRESSIONAL|LEGISLATIVE|REPRESENTATIVE)(?: DISTRICT)?$/);
    if (districtLine && office && DISTRICT_WORD[office] !== undefined) {
      if (DISTRICT_WORD[office] !== districtLine[2]) fail(`DISTRICT_KIND:${title}:${text}`);
      district = String(ordinalNumber(districtLine[1]!));
      continue;
    }
    if (/^[A-Z][A-Z ()./,-]+$/.test(text) && !/\s{2}/.test(text) && text !== "COUNTY") {
      title = text; office = TITLES[text] ?? null; district = null;
      continue;
    }
    const candidate = line.match(CANDIDATE);
    if (!candidate || !office) continue;
    if (office === "us_senate" || office === "governor" ? district !== null : district === null) fail(`DISTRICT:${title}:${text}`);
    const party = candidate[3]!, key = `${office}|${district ?? ""}|${party}`;
    const entry = contests.get(key) ?? { office, district, party, candidates: [] };
    const name = candidate[2]!.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();
    if (entry.candidates.some((existing) => existing.name === name)) fail(`DUPLICATE:${key}:${name}`);
    const row = { name, votes: Number(candidate[4]!.replace(/,/g, "")), ...(candidate[1] ? { winner: true as const } : {}), ...(candidate[5] ? { writeIn: true as const } : {}) };
    entry.candidates.push(row);
    contests.set(key, entry);
    previous = row;
  }
  // A party whose only candidates were write-ins printed no name on the ballot; the contract needs a named candidate.
  return [...contests.values()].filter(({ candidates }) => candidates.some((candidate) => !candidate.writeIn))
    .map(({ office: kind, district: where, party, candidates }) => ({ office: kind, district: where, rawParty: party, candidates }));
}

export const ILLINOIS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "IL",
  authority: "Illinois State Board of Elections, official canvass",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "il-2026-primary-official-canvass-pdf": 272 },
  parse: (bytes) => parse(bytes),
};
