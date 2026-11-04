import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Ohio Secretary of State, official canvass of the May 5, 2026 primary and
 * special election: one summary-level workbook per party. The Secretary of
 * State's hosts refuse this project's network. Only the Democratic workbook
 * is retained so far, from an earlier retention of the same URL. The
 * Republican and Libertarian workbooks (same directory, "---republican.xlsx"
 * and "---libertarian.xlsx") have no usable Internet Archive capture (the
 * archive holds only 404 captures of a double-encoded URL); add them as
 * sources once retained. Until then Republican holders read "no contest".
 * Sheets "Statewide Offices", "U.S. Congress" and
 * "General Assembly" share the layout of the general-election canvass: row 1
 * names the contest over each candidate column, row 2 the candidate as
 * "Name (D)" (write-ins "Name (WI)* (D)"), row 3 the statewide total. The U.S.
 * Senate contest is the special primary for the term ending January 3, 2029.
 * Nothing marks a nominee. Unopposed candidates are printed.
 */
const DIR = "https://publicfiles.ohiosos.gov/election-results/past-elections/2026/Primary%2BSpecial%20Election%20-%20May%205%2C%202026/group1";
const SOURCES: readonly StateGeneralSource[] = [
  { id: "oh-2026-primary-democratic-summary-xlsx", url: `${DIR}/summary-level-official-results-2026-primary---democratic.xlsx`, path: "data/source/rapid/state-primary/oh/2026-primary-democratic-summary.xlsx", cycleYear: 2026, electionDate: "2026-05-05", note: "Democratic official canvass. Bytes identical (sha256 d29da758…) to the pinned oh-2026-may-primary-democratic-summary, retained from this URL in August 2026; copied, not re-fetched." },
];

const fail = (code: string): never => { throw new Error(`OHIO_PRIMARY_${code}`); };
const SHEETS = ["Statewide Offices", "U.S. Congress", "General Assembly"];
const CANDIDATE = /^(.+?)\s*(\(WI\)\*)?\s*\(([A-Z]+)\)$/;

const officeOf = (title: string): Pick<RawPrimaryContest, "office" | "district" | "special"> | null => {
  if (title === "Governor and Lieutenant Governor") return { office: "governor", district: null };
  if (title === "U.S. Senator Unexpired Term Ending 01/03/2029") return { office: "us_senate", district: null, special: true };
  const match = title.match(/^(Representative to Congress|State Senator|State Representative) - District (\d+)$/);
  if (!match) return /^(U\.S\. Senator|Representative to Congress|State Senator|State Representative)/.test(title) ? fail(`TITLE:${title}`) : null;
  return { office: match[1] === "Representative to Congress" ? "us_house" : match[1] === "State Senator" ? "state_upper" : "state_lower", district: String(Number(match[2])) };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  const contests = new Map<string, RawPrimaryContest & { candidates: RawPrimaryContest["candidates"][number][] }>();
  for (const name of SHEETS) {
    const sheet = readWorkbookSheet(bytes, name);
    if (!/Primary\/Special Election Official Canvass/.test(sheet.at(1, 1)) || sheet.at(1, 2) !== "County Name" || sheet.at(1, 3) !== "Total") fail(`LAYOUT:${name}`);
    for (let column = 7; column <= sheet.maxColumn; column++) {
      const title = sheet.at(column, 1).replace(/\s+/g, " ").trim();
      const base = officeOf(title);
      if (!base) continue;
      const label = sheet.at(column, 2).replace(/\s+/g, " ").trim(), votes = sheet.at(column, 3);
      const candidate = label.match(CANDIDATE) ?? fail(`CANDIDATE:${title}:${label}`);
      if (!/^\d+$/.test(votes)) fail(`VOTES:${title}:${label}`);
      const key = `${title}|${candidate[3]}`;
      const contest = contests.get(key) ?? { ...base, rawParty: candidate[3]!, candidates: [] };
      contest.candidates.push({ name: candidate[1]!, votes: Number(votes), ...(candidate[2] ? { writeIn: true } : {}) });
      contests.set(key, contest);
    }
  }
  // A party whose only candidate was a write-in printed no name on the ballot; the contract needs a named candidate.
  return [...contests.values()].filter((contest) => contest.candidates.some((candidate) => !candidate.writeIn));
}

export const OHIO_PRIMARY: StatePrimaryAdapter = {
  stateCode: "OH",
  authority: "Ohio Secretary of State, official canvass",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "oh-2026-primary-democratic-summary-xlsx": 123 },
  parse: (bytes) => parse(bytes),
};
