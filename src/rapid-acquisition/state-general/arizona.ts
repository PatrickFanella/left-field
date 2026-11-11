import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/**
 * Arizona Secretary of State, 2024 general election official canvass, signed
 * by the Secretary of State, Governor, Attorney General and Chief Justice on
 * November 25, 2024. The Secretary of State's sites refuse this project's
 * network (HTTP 403 from a bot filter), so the PDF is retained from the
 * Internet Archive's capture of the official URL
 * (apps.azsos.gov/election/2024/ge/canvass/20241105_GeneralCanvass_Signed.pdf),
 * byte for byte as archived.
 *
 * The PDF is a scan with no text layer. The build reads a reviewed
 * transcription of pages 7 to 14 (one row per candidate: page, chamber,
 * district, party code, name as printed, write-in flag, statewide total).
 * It was made with tesseract at 300 dpi and checked three ways: each
 * candidate's county figures sum to the total where a district spans several
 * counties; every total was compared with the county precinct returns
 * compiled by OpenElections (openelections-data-az, 2024/General); and the
 * remaining figures were read off the scan. Maricopa totals run a few votes
 * above OpenElections, which predates final adjudication; the canvass
 * controls. OpenElections lacks La Paz for Senate 30, misspells several
 * names, does not itemize certified write-ins, and folds Tom Simes (House 2)
 * into its total; those rows were confirmed from the scan and the county
 * sums. OCR misread one total (Senate 28 write-in, 1,152 for 1,112), fixed
 * from the scan.
 *
 * All 30 Senate and 30 House districts are elected every two years; each
 * House district elects two members together (vote for two). The canvass
 * lists certified write-in candidates by name and no aggregate write-in line.
 */
const SOURCES: readonly StateGeneralSource[] = [
  {
    id: "az-2024-general-canvass-signed-pdf",
    url: "https://web.archive.org/web/20251231153438id_/https://apps.azsos.gov/election/2024/ge/canvass/20241105_GeneralCanvass_Signed.pdf",
    path: "data/source/rapid/state-general/az/2024-general-canvass-signed.pdf",
    cycleYear: 2024,
    electionDate: "2024-11-05",
    note: "30 Senate and 30 House contests (two seats each), read from a reviewed transcription of the scanned canvass.",
    transcription: true,
  },
];

const fail = (code: string): never => { throw new Error(`ARIZONA_GENERAL_${code}`); };
const HEADER = "page\tchamber\tdistrict\tparty\tcandidate\twrite_in\tvotes";
const PARTY = /^(?:DEM|REP|GRN|LBT|IND)$/;

function parse(bytes: Buffer): RawGeneralContest[] {
  const lines = bytes.toString("utf8").split("\n").filter((line) => line !== "");
  if (lines[0] !== HEADER) fail("HEADER");
  const contests = new Map<string, { chamber: "upper" | "lower"; district: string; candidates: RawGeneralContest["candidates"][number][] }>();
  for (const line of lines.slice(1)) {
    const [page, chamber, district, party, name, writeIn, votes, extra] = line.split("\t");
    if (extra !== undefined || !/^(?:[7-9]|1[0-4])$/.test(page ?? "")) fail(`ROW:${line}`);
    if (chamber !== "upper" && chamber !== "lower") fail(`CHAMBER:${line}`);
    if (!/^(?:[1-9]|[12]\d|30)$/.test(district ?? "") || !PARTY.test(party ?? "") || !name || !/^(?:yes|no)$/.test(writeIn ?? "") || !/^\d+$/.test(votes ?? "")) fail(`ROW:${line}`);
    const key = `${chamber}|${district}`;
    const contest = contests.get(key) ?? { chamber: chamber as "upper" | "lower", district: district!, candidates: [] };
    contest.candidates.push({ name: name!, rawParty: party!, votes: Number(votes), writeIn: writeIn === "yes" });
    contests.set(key, contest);
  }
  return [...contests.values()].map((contest) => ({ ...contest, seats: contest.chamber === "lower" ? 2 : 1 }));
}

export const ARIZONA_GENERAL: StateGeneralAdapter = {
  stateCode: "AZ",
  authority: "Arizona Secretary of State, official canvass of the general election",
  sources: SOURCES,
  expectedContests: { "az-2024-general-canvass-signed-pdf": 60 },
  parse,
};
