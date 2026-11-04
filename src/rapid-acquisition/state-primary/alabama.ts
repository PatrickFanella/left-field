import { readWorkbookSheet, type WorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Alabama, 2026 party primaries. Alabama's parties canvass their own primaries and file the results with the
 * Secretary of State, who publishes them:
 *
 * - May 19 primary: the Republican results workbook ("Summary" sheet, one block per office) and the Democratic
 *   results workbook ("Candidates" sheet, one row per candidate with county columns and a TOTAL), both certified
 *   by the parties June 2.
 * - June 16 runoff: the Democratic runoff workbook (certified July 1). The Republican runoff was certified only as
 *   a list of winners with no vote counts, so Republican runoffs (U.S. Senate, State House 17, 37 and 95) have no
 *   runoff contest here and read from the May contest.
 * - August 11 special primary for congressional districts 1, 2, 6 and 7, called after the districts were redrawn:
 *   the Republican districtwide totals workbook. It re-nominates those districts for 2026, superseding the May
 *   contests there; contests are marked special so both are kept. Its Democratic counterpart was certified only as
 *   county canvass sheets and a list of winners; districts 1, 2 and 7 had a single Democratic filer and are covered
 *   by the nominee lists below, district 6 is not covered. The August 11 special primary for State Senate 25 and
 *   26 has no published returns.
 *
 * Neither party prints a primary with one candidate. Unopposed nominations come from each party's certified list
 * of nominees filed with the Secretary of State (Republican, June 24; Democratic, July 1), both scanned PDFs read
 * through reviewed transcriptions: a nominee whose office has no primary contest for that party is reported as an
 * unopposed nomination. Nominees the Democratic list marks "subject to August 11 Primary" are skipped.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "al-2026-primary-republican-results-xlsx", url: "https://www.sos.alabama.gov/sites/default/files/05-29-2026/GOP%20Results.xlsx", path: "data/source/rapid/state-primary/al/2026-primary-republican-results.xlsx", cycleYear: 2026, electionDate: "2026-05-19", note: "Republican primary vote totals, certified by the party June 2, 2026." },
  { id: "al-2026-primary-democratic-results-xlsx", url: "https://www.sos.alabama.gov/sites/default/files/election-2026/2026%20Democratic%20Primary%20Election%20Results.xlsx", path: "data/source/rapid/state-primary/al/2026-primary-democratic-results.xlsx", cycleYear: 2026, electionDate: "2026-05-19", note: "Democratic primary vote totals, certified by the party June 2, 2026." },
  { id: "al-2026-primary-runoff-democratic-results-xlsx", url: "https://www.sos.alabama.gov/sites/default/files/election-2026/2026%20Democratic%20Primary%20Runoff%20Election%20Results.xlsx", path: "data/source/rapid/state-primary/al/2026-primary-runoff-democratic-results.xlsx", cycleYear: 2026, electionDate: "2026-06-16", note: "Democratic primary runoff vote totals, certified by the party July 1, 2026." },
  { id: "al-2026-special-primary-republican-congressional-results-xlsx", url: "https://www.sos.alabama.gov/sites/default/files/election-data/2026-09/Republication%20Results%20From%20The%20Special%20Congressional%20Election.xlsx", path: "data/source/rapid/state-primary/al/2026-special-primary-republican-congressional-results.xlsx", cycleYear: 2026, electionDate: "2026-08-11", note: "Republican special primary, congressional districts 1, 2, 6 and 7, districtwide totals." },
  { id: "al-2026-primary-republican-nominee-certification-pdf", url: "https://www.sos.alabama.gov/sites/default/files/election-2026/CertificationofResults-RepublicanParty-PrimaryRunoff.pdf", path: "data/source/rapid/state-primary/al/2026-primary-republican-nominee-certification.pdf", cycleYear: 2026, electionDate: "2026-05-19", note: "Republican Party certification of its 2026 primary and runoff winners, June 24, 2026; scanned, read through a reviewed transcription of the federal, governor and legislative rows; used for unopposed nominations only.", transcription: true },
  { id: "al-2026-primary-democratic-nominee-certification-pdf", url: "https://www.sos.alabama.gov/sites/default/files/election-2026/CertificationofDemocraticPartyCandidates-2026General.pdf", path: "data/source/rapid/state-primary/al/2026-primary-democratic-nominee-certification.pdf", cycleYear: 2026, electionDate: "2026-05-19", note: "Democratic Party certification of its 2026 nominees, July 1, 2026; scanned, read through a reviewed transcription of the federal, governor and legislative rows; used for unopposed nominations only.", transcription: true },
];

const fail = (code: string): never => { throw new Error(`ALABAMA_PRIMARY_${code}`); };
type Office = Pick<RawPrimaryContest, "office" | "district">;
type Contest = Office & { rawParty: string; candidates: { name: string; votes: number }[] };
/** Whole vote counts; the runoff workbook stores them as floats ("235.0"). */
const integer = (value: string, where: string): number => /^\d+(?:\.0)?$/.test(value) ? Number(value) : fail(`VOTES:${where}:${value}`);
const key = (contest: Office & { rawParty: string | null }): string => `${contest.office}|${contest.district ?? ""}|${contest.rawParty}`;

/** Republican "Summary" office headings, spelled as printed ("Govenor", "State Senator, District No.32"). */
const republicanOffice = (raw: string): Office | null => {
  const text = raw.replace(/\s+/g, " ").trim();
  if (/^Gove?rnor$|^Govenor$/i.test(text)) return { office: "governor", district: null };
  if (text === "Senator") return { office: "us_senate", district: null };
  const house = text.match(/^U\.?S\.? Representative, (\d+)(?:st|nd|rd|th) Congressional District$/i);
  if (house) return { office: "us_house", district: house[1]! };
  const legislature = text.match(/^State (Representative|Senator),? District (?:No\.? ?)?(\d+)$/i);
  if (legislature) return { office: /Senator/i.test(legislature[1]!) ? "state_upper" : "state_lower", district: String(Number(legislature[2])) };
  return null;
};

function republicanSummary(sheet: WorkbookSheet): Contest[] {
  const contests: Contest[] = [];
  let current: Contest | null = null, seen = new Set<string>();
  for (let row = 1; row <= sheet.maxRow; row++) {
    const label = sheet.at(1, row), votes = sheet.at(2, row);
    if (votes === "Votes") { current = null; const office = republicanOffice(label); if (office) { current = { ...office, rawParty: "Republican", candidates: [] }; contests.push(current); seen = new Set(); } continue; }
    if (!current || label === "") continue;
    if (label === "Total") {
      if (current.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== integer(votes, `${key(current)}:total`)) fail(`TOTAL:${key(current)}`);
      current = null; continue;
    }
    if (seen.has(label)) fail(`DUPLICATE:${key(current)}:${label}`);
    seen.add(label);
    current.candidates.push({ name: label, votes: integer(votes, `${key(current)}:${label}`) });
  }
  if (current) fail(`UNTERMINATED:${key(current)}`);
  return contests;
}

/** Democratic "Candidates" sheet: Office, District/Jurisdiction, Place, Ballot Name, one column per county, TOTAL. */
function democraticCandidates(sheet: WorkbookSheet): Contest[] {
  const header = Array.from({ length: sheet.maxColumn }, (_value, index) => sheet.at(index + 1, 1));
  if (header.slice(0, 4).join("|") !== "Office|District/Jurisdiction|Place|Ballot Name") fail("DEMOCRATIC_HEADER");
  const total = header.indexOf("TOTAL") + 1;
  if (total <= 4) fail("DEMOCRATIC_TOTAL_COLUMN");
  const contests = new Map<string, Contest>();
  for (let row = 2; row <= sheet.maxRow; row++) {
    const officeText = sheet.at(1, row), district = sheet.at(2, row).replace(/\.0$/, "");
    const office: PrimaryOffice | null = officeText === "United States Senator" ? "us_senate" : officeText === "Governor" ? "governor" : officeText === "United States Representative" ? "us_house"
      : officeText === "State Senator" ? "state_upper" : officeText === "State Representative" ? "state_lower" : null;
    if (!office) continue;
    if (sheet.at(3, row) !== "") fail(`PLACE:${row}`);
    const base: Office = office === "us_senate" || office === "governor" ? { office, district: null } : { office, district: /^\d+$/.test(district) ? String(Number(district)) : fail(`DISTRICT:${row}`) };
    const name = sheet.at(4, row), votes = integer(sheet.at(total, row), `${officeText}:${name}`);
    let counties = 0;
    for (let column = 5; column < total; column++) counties += sheet.at(column, row) === "" ? 0 : integer(sheet.at(column, row), `${officeText}:${name}:${column}`);
    if (counties !== votes) fail(`COUNTY_RECONCILIATION:${officeText}:${name}`);
    const contest = contests.get(key({ ...base, rawParty: "Democratic" })) ?? { ...base, rawParty: "Democratic", candidates: [] };
    if (contest.candidates.some((candidate) => candidate.name === name)) fail(`DUPLICATE:${name}`);
    contest.candidates.push({ name, votes });
    contests.set(key(contest), contest);
  }
  return [...contests.values()];
}

/** Republican special primary "Summary": a block per district laid out side by side, each ending in "Total Votes". */
function specialCongressional(sheet: WorkbookSheet): Contest[] {
  const contests: Contest[] = [];
  for (let row = 1; row <= sheet.maxRow; row++) for (let column = 1; column <= sheet.maxColumn; column++) {
    const heading = sheet.at(column, row).match(/^U\.S\. Congress — Congressional District (\d+)$/);
    if (!heading || sheet.at(column, row + 2) !== "Candidate") continue;
    if (column > 1 && sheet.at(column - 1, row) === sheet.at(column, row)) continue;
    const contest: Contest = { office: "us_house", district: heading[1]!, rawParty: "Republican", candidates: [] };
    let line = row + 3;
    for (; line <= sheet.maxRow && sheet.at(column, line) !== "Total Votes"; line++) contest.candidates.push({ name: sheet.at(column, line), votes: integer(sheet.at(column + 1, line), `special:${heading[1]}`) });
    if (contest.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== integer(sheet.at(column + 1, line), `special:${heading[1]}:total`)) fail(`SPECIAL_TOTAL:${heading[1]}`);
    contests.push(contest);
  }
  return contests;
}

/** Reviewed transcription: page, office, district, name, note. */
function nominees(bytes: Buffer): { office: Office; name: string; note: string }[] {
  const [header, ...rows] = bytes.toString("utf8").split("\n").filter((line) => line !== "");
  if (header !== "page\toffice\tdistrict\tname\tnote") fail("TRANSCRIPTION_HEADER");
  return rows.map((line) => {
    const [, office, district, name, note] = line.split("\t");
    if (!["us_senate", "governor", "us_house", "state_upper", "state_lower"].includes(office!) || !name) fail(`TRANSCRIPTION_ROW:${line}`);
    const statewide = office === "us_senate" || office === "governor";
    if (statewide !== (district === "")) fail(`TRANSCRIPTION_DISTRICT:${line}`);
    return { office: { office: office as PrimaryOffice, district: statewide ? null : district! }, name: name!, note: note ?? "" };
  });
}

function parse(bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  switch (source.id) {
    case "al-2026-primary-republican-results-xlsx": return republicanSummary(readWorkbookSheet(bytes, "Summary"));
    case "al-2026-primary-democratic-results-xlsx": return democraticCandidates(readWorkbookSheet(bytes, "Candidates"));
    case "al-2026-primary-runoff-democratic-results-xlsx": return democraticCandidates(readWorkbookSheet(bytes, "Candidates")).map((contest) => ({ ...contest, stage: "runoff" as const }));
    case "al-2026-special-primary-republican-congressional-results-xlsx": return specialCongressional(readWorkbookSheet(bytes, "Summary")).map((contest) => ({ ...contest, special: true }));
    case "al-2026-primary-republican-nominee-certification-pdf":
    case "al-2026-primary-democratic-nominee-certification-pdf": {
      const republican = source.id.includes("republican"), party = republican ? "Republican" : "Democratic";
      const printed = new Set((republican ? republicanSummary(readWorkbookSheet(readSource("al-2026-primary-republican-results-xlsx"), "Summary"))
        : democraticCandidates(readWorkbookSheet(readSource("al-2026-primary-democratic-results-xlsx"), "Candidates"))).map(key));
      const listed = new Set<string>();
      return nominees(bytes).flatMap(({ office, name, note }): RawPrimaryContest[] => {
        const contestKey = key({ ...office, rawParty: party });
        if (listed.has(contestKey)) fail(`NOMINEE_TWICE:${contestKey}`);
        listed.add(contestKey);
        if (note !== "" || printed.has(contestKey)) return [];
        return [{ ...office, rawParty: party, candidates: [{ name, votes: null, winner: true }] }];
      });
    }
    default: return fail(`SOURCE:${source.id}`);
  }
}

export const ALABAMA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "AL",
  authority: "Alabama Secretary of State, party-certified 2026 primary results and nominee certifications",
  system: "partisan",
  sources: SOURCES,
  expectedContests: {
    "al-2026-primary-republican-results-xlsx": 33, "al-2026-primary-democratic-results-xlsx": 22, "al-2026-primary-runoff-democratic-results-xlsx": 5,
    "al-2026-special-primary-republican-congressional-results-xlsx": 4, "al-2026-primary-republican-nominee-certification-pdf": 86, "al-2026-primary-democratic-nominee-certification-pdf": 59,
  },
  parse,
};
