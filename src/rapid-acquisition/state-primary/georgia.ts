import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Georgia Secretary of State, official "Total Votes" workbooks for the May 19,
 * 2026 general primary and the June 16 general primary runoff
 * (results.sos.ga.gov; both elections report isOfficialResults). The layout is
 * the 2024 general workbook's: one row per candidate per contest plus a
 * "Total Votes" row, and the office name carries the party ("State Senate -
 * District 7 - Dem"), sometimes with a Spanish translation before it ("State
 * Senate - District 7/ Senador Estatal del Distrito 7 - Dem"). "(I)" after a
 * name marks the incumbent and is removed. Unopposed candidates are printed.
 * The workbooks mark no winners. The nonpartisan special election for State
 * Senate 7, printed alongside both, is not a primary and is skipped.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ga-2026-primary-total-votes-workbook", url: "https://results.sos.ga.gov/cdn/results/09378a07-e6cf-4f66-be7c-ca4aa534f99a/Total%20Votes%20Results_f994c55e-4e3f-43f8-86ea-8ac4e9b45807.xlsx", path: "data/source/rapid/state-primary/ga/2026-primary-total-votes.xlsx", cycleYear: 2026, electionDate: "2026-05-19", note: "Official results (isOfficialResults) of the May 19 general primary, every contest and party." },
  { id: "ga-2026-primary-runoff-total-votes-workbook", url: "https://results.sos.ga.gov/cdn/results/09378a07-e6cf-4f66-be7c-ca4aa534f99a/Total%20Votes%20Results_2ddd63b0-c21e-4701-98b3-a31782b91b8c.xlsx", path: "data/source/rapid/state-primary/ga/2026-primary-runoff-total-votes.xlsx", cycleYear: 2026, electionDate: "2026-06-16", note: "Official results (isOfficialResults) of the June 16 general primary runoff." },
];

const fail = (code: string): never => { throw new Error(`GEORGIA_PRIMARY_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value) ? Number(value) : fail(`INTEGER_INVALID:${value}`);
const PARTY: Readonly<Record<string, string>> = { Dem: "Democratic", Rep: "Republican" };

const officeOf = (raw: string): (Pick<RawPrimaryContest, "office" | "district"> & { party: string }) | null => {
  const statewide = raw.match(/^(US Senate|Governor) - (Dem|Rep)$/);
  if (statewide) return { office: statewide[1] === "Governor" ? "governor" : "us_senate", district: null, party: PARTY[statewide[2]!]! };
  const district = raw.match(/^(US House of Representatives|State House of Representatives|State Senate) - District (\d+)(?:\/ [^-]+)? - (Dem|Rep)$/);
  if (!district) return null;
  const office = district[1] === "US House of Representatives" ? "us_house" : district[1] === "State Senate" ? "state_upper" : "state_lower";
  return { office, district: district[2]!, party: PARTY[district[3]!]! };
};

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const sheet = readWorkbookSheet(bytes, "Total Votes");
  const headers = ["Office Name", "Contest ID", "Ballot Name", "Choice ID", "Party", "Total"];
  headers.forEach((header, index) => { if (sheet.at(index + 1, 1) !== header) fail(`HEADER_INVALID:${header}`); });
  const groups = new Map<string, { office: string; rows: string[][] }>();
  for (let row = 2; row <= sheet.maxRow; row++) {
    const fields = headers.map((_header, index) => sheet.at(index + 1, row));
    if (!officeOf(fields[0]!)) continue;
    const key = `${fields[0]}\0${fields[1]}`;
    const group = groups.get(key) ?? { office: fields[0]!, rows: [] };
    group.rows.push(fields);
    groups.set(key, group);
  }
  const stage = source.id.includes("-runoff-") ? "runoff" as const : "primary" as const;
  return [...groups.values()].map((group) => {
    const { party, ...office } = officeOf(group.office)!;
    const totals = group.rows.filter((row) => row[2] === "Total Votes");
    if (totals.length !== 1) fail(`TOTAL_ROW_INVALID:${group.office}`);
    const candidates = group.rows.filter((row) => row[2] !== "Total Votes").map((row) => ({ name: row[2]!.replace(/\s*\(I\)$/, "").trim(), votes: integer(row[5]!) }));
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== integer(totals[0]![5]!)) fail(`TOTAL_MISMATCH:${group.office}`);
    return { ...office, rawParty: party, stage, candidates };
  });
}

export const GEORGIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "GA",
  authority: "Georgia Secretary of State, official 2026 general primary and runoff results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ga-2026-primary-total-votes-workbook": 423, "ga-2026-primary-runoff-total-votes-workbook": 18 },
  parse: (bytes, source) => parse(bytes, source),
};
