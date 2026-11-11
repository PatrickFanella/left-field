import { readWorkbookSheet } from "../intake/workbook";
import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/**
 * Ohio Secretary of State, general election official canvass, statewide
 * races summary workbooks ("General Assembly" sheet). The Secretary of
 * State's hosts return 403 to this project's network, so both workbooks are
 * retained from the Internet Archive's captures of their official URLs,
 * linked from the 2022 and 2024 official results pages, byte for byte.
 *
 * Row 1 names the contest over each candidate column ("State Senator -
 * District 02"), row 2 the candidate as "Name (D)", and row 3 the statewide
 * total. Write-ins read "Name (WI)*"; a candidate with no designation is an
 * independent. All 99 House districts are elected every two years (2022
 * superseded by 2024). The Senate's odd districts were elected in 2022 and
 * its even districts in 2024, when District 33 also held an election for
 * the unexpired term ending in 2026, read as a special general that takes
 * over from 2022.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "oh-2024-general-statewide-race-summary-xlsx",
    url: "https://web.archive.org/web/20251216225505id_/https://www.ohiosos.gov/globalassets/elections/2024/gen/official/statewide-race-summary.xlsx",
    path: "data/source/rapid/state-general/oh/2024-general-statewide-race-summary.xlsx",
    cycleYear: 2024,
    electionDate: "2024-11-05",
    note: "99 House and 17 Senate contests (the even districts and the District 33 unexpired term).",
  },
  {
    id: "oh-2022-general-statewide-races-summary-xlsx",
    url: "https://web.archive.org/web/20241007174602id_/https://www.ohiosos.gov/globalassets/elections/2022/gen/statewide-races-summary.xlsx",
    path: "data/source/rapid/state-general/oh/2022-general-statewide-races-summary.xlsx",
    cycleYear: 2022,
    electionDate: "2022-11-08",
    note: "99 House (superseded by 2024) and 17 Senate contests (the odd districts).",
  },
];

const fail = (code: string): never => { throw new Error(`OHIO_GENERAL_${code}`); };
const TITLE = /^State (Senator|Representative) - District (\d+)(?:\s+Unexpired Term Ending \d{2}\/\d{2}\/\d{4})?$/;
const CANDIDATE = /^(.+?)\s*\((D|R|L|G|WI)\)\*?$/;

function parse(bytes: Buffer): RawGeneralContest[] {
  const sheet = readWorkbookSheet(bytes, "General Assembly");
  if (!/General Election Official Canvass/.test(sheet.at(1, 1)) || sheet.at(1, 2) !== "County Name" || sheet.at(1, 3) !== "Total") fail("LAYOUT");
  const contests = new Map<string, RawGeneralContest & { candidates: RawGeneralContest["candidates"][number][] }>();
  for (let column = 7; column <= sheet.maxColumn; column++) {
    const title = sheet.at(column, 1).replace(/\s+/g, " ").trim();
    const match = title.match(TITLE) ?? fail(`TITLE:${title}`);
    const label = sheet.at(column, 2).replace(/\s+/g, " ").trim();
    if (label === "") fail(`CANDIDATE_MISSING:${column}`);
    const candidate = label.match(CANDIDATE);
    const votes = sheet.at(column, 3);
    if (!/^\d+$/.test(votes)) fail(`VOTES:${title}:${label}`);
    const contest = contests.get(title) ?? {
      chamber: match[1] === "Senator" ? "upper" as const : "lower" as const, district: String(Number(match[2])), candidates: [],
      ...(/Unexpired Term/.test(title) ? { electionKind: "special_general" as const } : {}),
    };
    contest.candidates.push(candidate
      ? { name: candidate[1]!, rawParty: candidate[2] === "WI" ? "" : candidate[2]!, votes: Number(votes), writeIn: candidate[2] === "WI" }
      : { name: label, rawParty: "", votes: Number(votes) });
    contests.set(title, contest);
  }
  return [...contests.values()];
}

export const OHIO_GENERAL: StateGeneralAdapter = {
  stateCode: "OH",
  authority: "Ohio Secretary of State, general election official canvass",
  sources: SOURCES,
  expectedContests: { "oh-2024-general-statewide-race-summary-xlsx": 116, "oh-2022-general-statewide-races-summary-xlsx": 116 },
  parse: (bytes) => parse(bytes),
};
