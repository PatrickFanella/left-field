import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/**
 * Minnesota Secretary of State, election results files
 * (electionresultsfiles.sos.mn.gov), Latin-1 text with one semicolon-delimited
 * row per candidate per office: state; county; precinct; office id; office
 * name ("State Representative District 1A", "State Senator District 45");
 * district; candidate order; name; suffix; incumbent; party abbreviation
 * (DFL, R, WI for the write-in line, minor parties); precincts reporting;
 * precincts; votes; percent; total votes for the office. The files carry the
 * canvassed totals reported in the State Canvassing Report.
 *
 * All 134 House districts were on the 2024 ballot. The Senate serves
 * four-year terms and was last elected in full in 2022; District 45 also
 * held a special general election on November 5, 2024, which is the only
 * contest in that year's Senate file. Later specials (2025 and 2026) are
 * published as separate election files and are not read here.
 */
const SOURCES: readonly (StateGeneralSource & { chamber: "upper" | "lower"; electionKind: "general" | "special_general" })[] = [
  { id: "mn-2024-general-state-house-txt", url: "https://electionresultsfiles.sos.mn.gov/20241105/LegislativeByDistrict.txt", path: "data/source/rapid/state-general/mn/2024-general-legislative-by-district.txt", cycleYear: 2024, electionDate: "2024-11-05", note: "134 State Representative contests.", chamber: "lower", electionKind: "general" },
  { id: "mn-2024-special-general-state-senate-txt", url: "https://electionresultsfiles.sos.mn.gov/20241105/stsenate.txt", path: "data/source/rapid/state-general/mn/2024-general-state-senate.txt", cycleYear: 2024, electionDate: "2024-11-05", note: "One State Senator special general contest (District 45).", chamber: "upper", electionKind: "special_general" },
  { id: "mn-2022-general-state-senate-txt", url: "https://electionresultsfiles.sos.mn.gov/20221108/stsenate.txt", path: "data/source/rapid/state-general/mn/2022-general-state-senate.txt", cycleYear: 2022, electionDate: "2022-11-08", note: "67 State Senator contests.", chamber: "upper", electionKind: "general" },
];

const fail = (code: string): never => { throw new Error(`MINNESOTA_GENERAL_${code}`); };
const integer = (value: string): number => /^\d+$/.test(value.trim()) ? Number(value.trim()) : fail(`INTEGER_INVALID:${value}`);

function parse(bytes: Buffer, source: StateGeneralSource): RawGeneralContest[] {
  const spec = SOURCES.find((candidate) => candidate.id === source.id) ?? fail(`SOURCE_UNKNOWN:${source.id}`);
  type Entry = { district: string; total: number; candidates: { name: string; rawParty: string; votes: number; writeIn: boolean }[] };
  const contests = new Map<string, Entry>();
  for (const line of bytes.toString("latin1").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const fields = line.split(";");
    if (fields.length !== 16 || fields[0] !== "MN") fail(`ROW_SHAPE:${line}`);
    const [, , , officeId, office, districtField, , name, suffix, , party, , , votes, , total] = fields as [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];
    const match = office.match(/^State (Representative|Senator) District (\d+[AB]?)$/) ?? fail(`OFFICE_UNKNOWN:${office}`);
    if ((match[1] === "Senator" ? "upper" : "lower") !== spec.chamber) fail(`CHAMBER_MISMATCH:${source.id}:${office}`);
    const district = match[2]!.replace(/^0+/, "");
    if (districtField.replace(/^0+/, "") !== district) fail(`DISTRICT_MISMATCH:${office}:${districtField}`);
    const entry = contests.get(officeId) ?? { district, total: integer(total), candidates: [] };
    if (entry.district !== district || entry.total !== integer(total)) fail(`CONTEST_INCONSISTENT:${officeId}`);
    const writeIn = party === "WI";
    if (writeIn !== (name === "WRITE-IN")) fail(`WRITE_IN_INCONSISTENT:${office}:${name}`);
    entry.candidates.push({ name: writeIn ? "Write-in" : [name, suffix].filter((part) => part.trim() !== "").join(" "), rawParty: writeIn ? "" : party, votes: integer(votes), writeIn });
    contests.set(officeId, entry);
  }
  return [...contests.values()].map((entry) => {
    if (entry.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== entry.total) fail(`TOTAL_MISMATCH:${spec.chamber}:${entry.district}`);
    return { chamber: spec.chamber, district: entry.district, electionKind: spec.electionKind, candidates: entry.candidates };
  });
}

export const MINNESOTA_GENERAL: StateGeneralAdapter = {
  stateCode: "MN",
  authority: "Minnesota Secretary of State, election results files",
  sources: SOURCES.map(({ id, url, path, cycleYear, electionDate, note }) => ({ id, url, path, cycleYear, electionDate, note })),
  expectedContests: { "mn-2024-general-state-house-txt": 134, "mn-2024-special-general-state-senate-txt": 1, "mn-2022-general-state-senate-txt": 67 },
  parse,
};
