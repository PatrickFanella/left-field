import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { byteCompare, hash, sha, exact } from "./shared";

export interface IndianaCountyOfficeContest {
  readonly contestId: string;
  readonly cycleYear: 2024;
  readonly electionDate: "2024-05-07";
  readonly officeFamily: "county_commissioner";
  readonly sourceOfficeId: string;
  readonly rawOfficeTitle: string;
  readonly countyFips: string | null;
  readonly countyJoinStatus: "exact_source_title_to_census_county_name" | "unmapped_irregular_source_title";
  readonly rawParty: "D" | "R";
  readonly candidates: readonly Readonly<{ sourceName: string; votes: number; sourceWinnerMarked: boolean }>[];
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "marked_by_source";
  readonly currentHolderIdentityStatus: "not_collected";
  readonly formulaEligibility: "catalog_only";
  readonly formulaIneligibleReasons: readonly ["county_office_formula_not_defined", "current_holder_identity_not_collected"];
  readonly sourceLockIds: readonly ["in-2024-primary-settings", "in-2024-primary-office-category-index", "in-2024-primary-county-commissioner-results"];
  readonly contestSha256: string;
}

export interface IndianaCountyOfficeResults {
  readonly schema: "rapid-indiana-county-commissioner-primary-results-v1";
  readonly version: 1;
  readonly authority: "official_indiana_archived_primary_json";
  readonly contests: readonly IndianaCountyOfficeContest[];
  readonly summary: Readonly<{ officeRows: 179; partyContests: 226; candidateRows: 376; candidateVotes: 996853; sourceMarkedWinnerCandidates: 226; exactCountyOfficeRows: 163; unmappedOfficeRows: 16; exactCountyPartyContests: 206; formulaEligibleContests: 0 }>;
  readonly contestSetSha256: string;
  readonly packageSha256: string;
}

const SOURCES = [
  ["in-2024-primary-settings", "https://enr.indianavoters.in.gov/archive/2024Primary/data/settings.json", "data/source/rapid/house-primary/in/2024/settings.json", 3028, "430de937a82b87f5320a5047d37877f44612f824e3fc3696d650bbcfc61692cb", []],
  ["in-2024-primary-office-category-index", "https://enr.indianavoters.in.gov/archive/2024Primary/data/statewideElectionsC_B.json", "data/source/rapid/county-office/in/2024/office-category-index.json", 17718, "4050f57f74bd148bd09ad6721107db073f13872ec28c43a98811ac3d5bf03304", ["in-2024-primary-settings"]],
  ["in-2024-primary-county-commissioner-results", "https://enr.indianavoters.in.gov/archive/2024Primary/data/OffCatC_1024_B.json", "data/source/rapid/county-office/in/2024/county-commissioner-results.json", 388315, "6819c7264521b1b0a2b40dce35bf4c2743602e1337f3b855d205843f94cb0b6f", ["in-2024-primary-settings", "in-2024-primary-office-category-index"]],
] as const;
const DEMOGRAPHICS = ["rapid-county-demographics-projection-v1", "data/metadata/rapid-county-demographics-projection-v1.json", 2441846, "ebbeb1127151a78985e97a7971d580edd637f746b63b6845353c63407989c8fc"] as const;

type RawCandidate = { NAME_ON_BALLOT?: unknown; isWinner?: unknown; PARTY?: unknown; TOTAL?: unknown };
type RawRace = { OFFICEID?: unknown; OFFICE_TITLE?: unknown; NumofSeats?: unknown; Candidates?: { Candidate?: RawCandidate | RawCandidate[] } };

export function buildIndianaCountyOfficeResults(root = process.cwd()): IndianaCountyOfficeResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const sourceBytes = new Map<string, Buffer>();
  for (const [id, url, path, size, digest, parents] of SOURCES) {
    const bytes = readFileSync(join(root, path));
    const expected = { id, url, retainedPath: path, retainedStatus: "retained", byteSize: size, sha256: digest, kind: "source", parentIds: parents };
    const matches = lock.entries.filter((entry) => entry.id === id);
    if (bytes.length !== size || sha(bytes) !== digest || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) throw new Error(`INDIANA_COUNTY_OFFICE_SOURCE_INVALID:${id}`);
    sourceBytes.set(id, bytes);
  }
  const demographicsBytes = readFileSync(join(root, DEMOGRAPHICS[1]));
  if (demographicsBytes.length !== DEMOGRAPHICS[2] || sha(demographicsBytes) !== DEMOGRAPHICS[3]) throw new Error("INDIANA_COUNTY_OFFICE_DEMOGRAPHICS_INVALID");
  const demographics = JSON.parse(demographicsBytes.toString("utf8")) as { rows: readonly { stateCode: string; countyName: string; countyFips: string }[] };
  const countyNames = new Map(demographics.rows.filter((row) => row.stateCode === "IN").map((row) => [row.countyName.replace(/ County$/, ""), row.countyFips]));
  if (countyNames.size !== 92) throw new Error("INDIANA_COUNTY_OFFICE_COUNTY_UNIVERSE_INVALID");
  const settings = JSON.parse(sourceBytes.get(SOURCES[0][0])!.toString("utf8")) as { Root?: { ElectionType?: unknown; Certified?: unknown; CurrentElection?: unknown } };
  if (settings.Root?.ElectionType !== "P" || settings.Root.Certified !== "T" || settings.Root.CurrentElection !== "05/07/2024") throw new Error("INDIANA_COUNTY_OFFICE_SETTINGS_INVALID");
  const index = JSON.parse(sourceBytes.get(SOURCES[1][0])!.toString("utf8")) as { Root?: { List?: readonly { Heading?: unknown; Items?: { Item?: RawCandidate | RawCandidate[] } }[] } };
  const local = index.Root?.List?.find((section) => section.Heading === "Local")?.Items?.Item;
  const categories = Array.isArray(local) ? local : local ? [local] : [];
  const commissioner = categories.filter((item) => (item as Record<string, unknown>).OFFICECATEGORYID === "1024" && (item as Record<string, unknown>).OFFICE_CATEGORY_NAME === "County Commissioner");
  if (commissioner.length !== 1) throw new Error("INDIANA_COUNTY_OFFICE_CATEGORY_INVALID");
  const parsed = JSON.parse(sourceBytes.get(SOURCES[2][0])!.toString("utf8")) as { Root?: { StatewideSummary?: { Race?: RawRace | RawRace[] } } };
  const raw = parsed.Root?.StatewideSummary?.Race;
  const races = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (races.length !== 179) throw new Error("INDIANA_COUNTY_OFFICE_RACE_CLOSURE_INVALID");
  const contests: IndianaCountyOfficeContest[] = [];
  let exactCountyOfficeRows = 0;
  let exactCountyPartyContests = 0;
  const officeIds = new Set<string>();
  for (const race of races) {
    if (typeof race.OFFICEID !== "string" || typeof race.OFFICE_TITLE !== "string" || race.NumofSeats !== "1" || officeIds.has(race.OFFICEID)) throw new Error("INDIANA_COUNTY_OFFICE_RACE_INVALID");
    officeIds.add(race.OFFICEID);
    const countyName = race.OFFICE_TITLE.match(/^(.+?) County Commissioner(?:\b|,)/)?.[1];
    const countyFips = countyName ? countyNames.get(countyName) ?? null : null;
    if (countyFips) exactCountyOfficeRows++;
    const candidateValue = race.Candidates?.Candidate;
    const candidates = Array.isArray(candidateValue) ? candidateValue : candidateValue ? [candidateValue] : [];
    for (const rawParty of ["D", "R"] as const) {
      const partyRows = candidates.filter((candidate) => candidate.PARTY === rawParty);
      if (!partyRows.length) continue;
      if (countyFips) exactCountyPartyContests++;
      const normalized = partyRows.map((candidate) => {
        if (typeof candidate.NAME_ON_BALLOT !== "string" || !candidate.NAME_ON_BALLOT || !Number.isSafeInteger(candidate.TOTAL) || (candidate.TOTAL as number) < 0 || !["T", "F"].includes(candidate.isWinner as string)) throw new Error("INDIANA_COUNTY_OFFICE_CANDIDATE_INVALID");
        return { sourceName: candidate.NAME_ON_BALLOT, votes: candidate.TOTAL as number, sourceWinnerMarked: candidate.isWinner === "T" };
      });
      if (normalized.filter((candidate) => candidate.sourceWinnerMarked).length !== 1) throw new Error("INDIANA_COUNTY_OFFICE_WINNER_INVALID");
      const unsigned = { contestId: `in:county-commissioner-primary:2024:${race.OFFICEID}:${rawParty}`, cycleYear: 2024 as const, electionDate: "2024-05-07" as const, officeFamily: "county_commissioner" as const, sourceOfficeId: race.OFFICEID, rawOfficeTitle: race.OFFICE_TITLE, countyFips, countyJoinStatus: countyFips ? "exact_source_title_to_census_county_name" as const : "unmapped_irregular_source_title" as const, rawParty, candidates: normalized, totalVotes: normalized.reduce((sum, candidate) => sum + candidate.votes, 0), sourceWinnerStatus: "marked_by_source" as const, currentHolderIdentityStatus: "not_collected" as const, formulaEligibility: "catalog_only" as const, formulaIneligibleReasons: ["county_office_formula_not_defined", "current_holder_identity_not_collected"] as const, sourceLockIds: ["in-2024-primary-settings", "in-2024-primary-office-category-index", "in-2024-primary-county-commissioner-results"] as const };
      contests.push({ ...unsigned, contestSha256: hash("dsa-seats:rapid-indiana-county-office-contest:v1", unsigned) });
    }
  }
  contests.sort((left, right) => byteCompare(left.sourceOfficeId, right.sourceOfficeId) || byteCompare(left.rawParty, right.rawParty));
  const summary = { officeRows: 179 as const, partyContests: 226 as const, candidateRows: 376 as const, candidateVotes: 996853 as const, sourceMarkedWinnerCandidates: 226 as const, exactCountyOfficeRows: 163 as const, unmappedOfficeRows: 16 as const, exactCountyPartyContests: 206 as const, formulaEligibleContests: 0 as const };
  if (contests.length !== summary.partyContests || contests.reduce((sum, row) => sum + row.candidates.length, 0) !== summary.candidateRows || contests.reduce((sum, row) => sum + row.totalVotes, 0) !== summary.candidateVotes || contests.reduce((sum, row) => sum + row.candidates.filter((candidate) => candidate.sourceWinnerMarked).length, 0) !== summary.sourceMarkedWinnerCandidates || exactCountyOfficeRows !== summary.exactCountyOfficeRows || exactCountyPartyContests !== summary.exactCountyPartyContests || contests.some((row) => row.formulaEligibility !== "catalog_only")) throw new Error("INDIANA_COUNTY_OFFICE_SUMMARY_INVALID");
  const contestSetSha256 = hash("dsa-seats:rapid-indiana-county-office-contest-set:v1", contests);
  const unsigned = { schema: "rapid-indiana-county-commissioner-primary-results-v1" as const, version: 1 as const, authority: "official_indiana_archived_primary_json" as const, contests, summary, contestSetSha256 };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-indiana-county-office-package:v1", unsigned) };
}

export function validateIndianaCountyOfficeResults(value: unknown, root = process.cwd()): IndianaCountyOfficeResults {
  const expected = buildIndianaCountyOfficeResults(root);
  if (!exact(value, expected)) throw new Error("INDIANA_COUNTY_OFFICE_RESULTS_INVALID");
  return value as IndianaCountyOfficeResults;
}
