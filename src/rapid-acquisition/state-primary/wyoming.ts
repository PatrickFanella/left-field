import { unzipSync } from "fflate";

import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Wyoming Secretary of State, official results of the August 18, 2026
 * primary: the "Results Summaries - OFFICIAL" workbook in the results zip,
 * the same layout as the general election summaries. Each contest is a block
 * of columns: row 3 names the office ("House District 1", "United States
 * Senator", with ", Continued" where a block wraps), row 4 the party, row 5
 * the candidate or an accounting column ("Write-Ins", "Overvotes",
 * "Undervotes"), then county rows and a "Total" row. Unopposed candidates are
 * printed; a party whose only column is "Write-Ins" fielded no candidate and
 * is skipped (write-in nominees are certified separately and not read here).
 * Votes for a candidate who withdrew after ballots were printed sit under
 * "* Withdrawn Candidate" and are left out. The State Canvassing Board
 * certified these results (minutes on the same page).
 *
 * All 62 House districts are elected every two years and the odd-numbered
 * Senate districts in 2026 (sheet "Statewide Senate Odd", which also holds a
 * Senate District 6 primary). The "Statewide Senate Even" sheet repeats the
 * 2024 primary and is not read.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "wy-2026-primary-results-zip",
    url: "https://sos.wyo.gov/Elections/Docs/2026/Results/Primary/2026_Wyoming_Primary_Results.zip",
    path: "data/source/rapid/state-primary/wy/2026-primary-results.zip",
    cycleYear: 2026,
    electionDate: "2026-08-18",
    note: "Official summaries workbook: U.S. Senate, U.S. House, governor, every House district and the 2026 Senate districts.",
  },
];

const WORKBOOK = "2026 Primary Results Summaries - OFFICIAL.xlsx";
const SHEETS = ["Statewide Candidates", "Statewide Senate Odd", "Statewide House"] as const;
const ACCOUNTING = new Set(["Overvotes", "Undervotes", "* Withdrawn Candidate"]);
const fail = (code: string): never => { throw new Error(`WYOMING_PRIMARY_${code}`); };
const integer = (value: string): number => { const trimmed = value.trim(); return trimmed === "" || trimmed === "-" ? 0 : /^\d+$/.test(trimmed) ? Number(trimmed) : fail(`INTEGER_INVALID:${value}`); };

const officeOf = (heading: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (heading === "United States Senator") return { office: "us_senate", district: null };
  if (heading === "United States Representative") return { office: "us_house", district: "AL" };
  if (heading === "Governor") return { office: "governor", district: null };
  const match = heading.match(/^(House|Senate) District (\d+)$/);
  return match ? { office: match[1] === "House" ? "state_lower" : "state_upper", district: match[2]! } : null;
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(bytes)); } catch { return fail("ZIP_INVALID"); }
  const workbook = Buffer.from(files[WORKBOOK] ?? fail(`WORKBOOK_MISSING:${WORKBOOK}`));
  const contests = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: number; writeIn?: boolean }[] }>();
  for (const sheetName of SHEETS) {
    const sheet = readWorkbookSheet(workbook, sheetName);
    if (!/August 18, 2026/.test(sheet.at(2, 1))) fail(`SHEET_ELECTION:${sheetName}`);
    let totalRow = 0;
    for (let row = 6; row <= sheet.maxRow; row++) if (sheet.at(1, row) === "Total") { totalRow = row; break; }
    if (totalRow === 0) fail(`TOTAL_ROW_MISSING:${sheetName}`);
    for (let column = 2; column <= sheet.maxColumn; column++) {
      const heading = sheet.at(column, 3).replace(/\s+/g, " ").replace(/, Continued$/, "").trim();
      const office = officeOf(heading);
      const label = sheet.at(column, 5).replace(/\s+/g, " ").trim(), party = sheet.at(column, 4).trim();
      if (!office || label === "" || ACCOUNTING.has(label)) continue;
      if (party === "") fail(`PARTY_MISSING:${sheetName}:${heading}:${label}`);
      const key = `${heading}|${party}`;
      const entry = contests.get(key) ?? { ...office, rawParty: party, candidates: [] };
      const writeIn = label === "Write-Ins";
      entry.candidates.push({ name: label, votes: integer(sheet.at(column, totalRow)), ...(writeIn ? { writeIn: true } : {}) });
      contests.set(key, entry);
    }
  }
  return [...contests.values()].filter((contest) => contest.candidates.some((candidate) => candidate.writeIn !== true));
}

export const WYOMING_PRIMARY: StatePrimaryAdapter = {
  stateCode: "WY",
  authority: "Wyoming Secretary of State, official primary results summaries",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "wy-2026-primary-results-zip": 108 },
  parse: (bytes) => parse(bytes),
};
