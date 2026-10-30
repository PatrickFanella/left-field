import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";

import { readSourceLock } from "./intake/source-lock";
import { readWorkbookCsvZipExtract, workbookExtractId } from "./intake/workbook-extract";
import { byteCompare, hash, sha, exact } from "./shared";

export interface AlabamaStateLegislativeCandidate {
  readonly sourceName: string;
  readonly votes: number;
}

export interface AlabamaStateLegislativeContest {
  readonly contestId: string;
  readonly cycleYear: 2022;
  readonly electionDate: "2022-05-24";
  readonly chamber: "upper" | "lower";
  readonly district: string;
  readonly rawOfficeTitle: string;
  readonly rawParty: "DEM" | "REP";
  readonly candidates: readonly AlabamaStateLegislativeCandidate[];
  readonly totalVotes: number;
  readonly countyWorkbookRows: number;
  readonly populatedVoteCells: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "official_secretary_precinct_workbooks_retained";
  readonly certificationStatus: "separate_certification_instrument_not_retained";
  readonly winnerIdentity: null;
  readonly identity: null;
  readonly sourceLockIds: readonly ["al-2022-primary-precinct-results"];
  readonly formulaEligible: false;
  readonly contestSha256: string;
}

export interface AlabamaStateLegislativeResults {
  readonly schema: "rapid-alabama-state-legislative-primary-results-v1";
  readonly version: 1;
  readonly sourceScope: "reported_candidate_bearing_state_legislative_primary_contests_only";
  readonly contests: readonly AlabamaStateLegislativeContest[];
  readonly contestSetSha256: string;
  readonly summary: Readonly<{
    sourceCountyWorkbooks: 67;
    reportedPartyContests: 60;
    upperChamberContests: 14;
    lowerChamberContests: 46;
    democraticContests: 17;
    republicanContests: 43;
    candidateRows: 148;
    candidateVotes: 564383;
    countyWorkbookCandidateRows: 310;
    populatedVoteCells: 5516;
    inferredNoContestRows: 0;
    formulaEligibleContests: 0;
  }>;
  readonly packageSha256: string;
}

const SOURCE = {
  id: "al-2022-primary-precinct-results",
  path: "data/source/rapid/house-primary/al/2022/primary-precinct-results.zip",
  url: "https://www.sos.alabama.gov/sites/default/files/election-data/2022-06/2022%20Primary%20Precinct%20Results.zip",
  bytes: 956619,
  sha256: "d927aa38b0be4f855833648aeb873a537db8a222172bb630044b026622a23999",
} as const;

function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) { if (character === '"' && input[index + 1] === '"') { field += '"'; index++; } else if (character === '"') quoted = false; else field += character; }
    else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("ALABAMA_STATE_LEGISLATIVE_CSV_UNTERMINATED_QUOTE");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseArchive(bytes: Buffer, csvs: readonly (readonly [string, string])[]): AlabamaStateLegislativeContest[] {
  {
    const members = Object.entries(unzipSync(bytes)).filter(([name]) => name.toLowerCase().endsWith(".xls"));
    if (members.length !== 67 || csvs.length !== 67) throw new Error("ALABAMA_STATE_LEGISLATIVE_WORKBOOK_COUNT_INVALID");
    // The CSVs are the pinned LibreOffice extracts of the retained zip's workbooks (see intake/workbook-extract.ts); no conversion runs here.
    const groups = new Map<string, { chamber: "upper" | "lower"; district: string; rawOfficeTitle: string; rawParty: "DEM" | "REP"; candidates: Map<string, number>; countyWorkbookRows: number; populatedVoteCells: number }>();
    for (const [filename, text] of csvs) {
      const rows = parseCsv(text);
      if (!exact(rows[0]?.slice(0, 3), ["Contest Title", "Party", "Candidate"])) throw new Error(`ALABAMA_STATE_LEGISLATIVE_HEADER_INVALID:${filename}`);
      for (const row of rows.slice(1)) {
        const title = row[0]?.trim() ?? "", match = title.match(/^STATE (SENATOR|REPRESENTATIVE), DISTRICT (\d+)$/);
        if (!match) continue;
        const rawParty = row[1]?.trim();
        if (rawParty !== "DEM" && rawParty !== "REP") throw new Error(`ALABAMA_STATE_LEGISLATIVE_PARTY_INVALID:${filename}`);
        const sourceName = row[2]?.trim();
        if (!sourceName) throw new Error(`ALABAMA_STATE_LEGISLATIVE_CANDIDATE_INVALID:${filename}`);
        if (sourceName === "Over Votes" || sourceName === "Under Votes") continue;
        const chamber = match[1] === "SENATOR" ? "upper" as const : "lower" as const;
        const district = String(Number(match[2])).padStart(chamber === "upper" ? 2 : 3, "0"), key = `${chamber}:${district}:${rawParty}`;
        const group = groups.get(key) ?? { chamber, district, rawOfficeTitle: title, rawParty, candidates: new Map<string, number>(), countyWorkbookRows: 0, populatedVoteCells: 0 };
        let votes = 0;
        for (const value of row.slice(3)) {
          const text = value.trim();
          if (text && !/^\d+$/.test(text)) throw new Error(`ALABAMA_STATE_LEGISLATIVE_VOTE_INVALID:${filename}`);
          if (text) { votes += Number(text); group.populatedVoteCells++; }
        }
        group.candidates.set(sourceName, (group.candidates.get(sourceName) ?? 0) + votes);
        group.countyWorkbookRows++;
        groups.set(key, group);
      }
    }
    const contests = [...groups.values()].map((group) => {
      const candidates = [...group.candidates].sort(([left], [right]) => byteCompare(left, right)).map(([sourceName, votes]) => ({ sourceName, votes }));
      if (candidates.length < 2 || candidates.some((candidate) => !candidate.sourceName || !Number.isSafeInteger(candidate.votes) || candidate.votes < 0)) throw new Error("ALABAMA_STATE_LEGISLATIVE_CONTEST_INVALID");
      const unsigned = { contestId: `al:state-leg-primary:2022:${group.chamber}:${group.district}:${group.rawParty}`, cycleYear: 2022 as const, electionDate: "2022-05-24" as const, chamber: group.chamber, district: group.district, rawOfficeTitle: group.rawOfficeTitle, rawParty: group.rawParty, candidates, totalVotes: candidates.reduce((sum, candidate) => sum + candidate.votes, 0), countyWorkbookRows: group.countyWorkbookRows, populatedVoteCells: group.populatedVoteCells, sourceWinnerStatus: "not_marked_by_source" as const, resultAuthorityStatus: "official_secretary_precinct_workbooks_retained" as const, certificationStatus: "separate_certification_instrument_not_retained" as const, winnerIdentity: null, identity: null, sourceLockIds: [SOURCE.id] as const, formulaEligible: false as const };
      return { ...unsigned, contestSha256: hash("dsa-seats:rapid-alabama-state-legislative-contest:v1", unsigned) };
    });
    contests.sort((left, right) => byteCompare(left.chamber, right.chamber) || byteCompare(left.district, right.district) || byteCompare(left.rawParty, right.rawParty));
    return contests;
  }
}

export function buildAlabamaStateLegislativeResults(root = process.cwd()): AlabamaStateLegislativeResults {
  const bytes = readFileSync(join(root, SOURCE.path));
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const expectedLock = { id: SOURCE.id, url: SOURCE.url, retainedPath: SOURCE.path, retainedStatus: "retained", byteSize: SOURCE.bytes, sha256: SOURCE.sha256, kind: "source", parentIds: [] };
  if (bytes.length !== SOURCE.bytes || sha(bytes) !== SOURCE.sha256 || lock.entries.filter((entry) => entry.id === SOURCE.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === SOURCE.id)), expectedLock)) throw new Error("ALABAMA_STATE_LEGISLATIVE_SOURCE_INVALID");
  const contests = parseArchive(bytes, readWorkbookCsvZipExtract(readSourceLock(root), workbookExtractId(SOURCE.id), SOURCE.id, root));
  const summary = { sourceCountyWorkbooks: 67 as const, reportedPartyContests: 60 as const, upperChamberContests: 14 as const, lowerChamberContests: 46 as const, democraticContests: 17 as const, republicanContests: 43 as const, candidateRows: 148 as const, candidateVotes: 564383 as const, countyWorkbookCandidateRows: 310 as const, populatedVoteCells: 5516 as const, inferredNoContestRows: 0 as const, formulaEligibleContests: 0 as const };
  const actual = { sourceCountyWorkbooks: 67, reportedPartyContests: contests.length, upperChamberContests: contests.filter((row) => row.chamber === "upper").length, lowerChamberContests: contests.filter((row) => row.chamber === "lower").length, democraticContests: contests.filter((row) => row.rawParty === "DEM").length, republicanContests: contests.filter((row) => row.rawParty === "REP").length, candidateRows: contests.reduce((sum, row) => sum + row.candidates.length, 0), candidateVotes: contests.reduce((sum, row) => sum + row.totalVotes, 0), countyWorkbookCandidateRows: contests.reduce((sum, row) => sum + row.countyWorkbookRows, 0), populatedVoteCells: contests.reduce((sum, row) => sum + row.populatedVoteCells, 0), inferredNoContestRows: 0, formulaEligibleContests: contests.filter((row) => row.formulaEligible).length };
  if (!exact(actual, summary) || contests.some((row) => row.sourceWinnerStatus !== "not_marked_by_source" || row.winnerIdentity !== null || row.identity !== null)) throw new Error("ALABAMA_STATE_LEGISLATIVE_SUMMARY_INVALID");
  const contestSetSha256 = hash("dsa-seats:rapid-alabama-state-legislative-contest-set:v1", contests), unsigned = { schema: "rapid-alabama-state-legislative-primary-results-v1" as const, version: 1 as const, sourceScope: "reported_candidate_bearing_state_legislative_primary_contests_only" as const, contests, contestSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-alabama-state-legislative-package:v1", unsigned) };
}

export function validateAlabamaStateLegislativeResults(value: unknown, root = process.cwd()): AlabamaStateLegislativeResults {
  const expected = buildAlabamaStateLegislativeResults(root);
  if (!exact(value, expected)) throw new Error("ALABAMA_STATE_LEGISLATIVE_RESULTS_INVALID");
  return value as AlabamaStateLegislativeResults;
}
