import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { byteCompare, hash, sha, exact } from "./shared";

import {
  type SouthCarolinaPrimaryResult,
  validateSouthCarolinaPrimaryResults,
} from "./house-primary-south-carolina-results";

export interface SouthCarolinaEventInventoryRow {
  readonly contestId: string;
  readonly primaryParty: "Democratic" | "Republican";
  readonly district: string;
  readonly candidateNames: readonly string[];
}

export interface SouthCarolinaSourceAbsence {
  readonly observationId: "sc:primary:2024:06:democratic";
  readonly cycleYear: 2024;
  readonly electionDate: "2024-06-11";
  readonly districtLabel: "SC-06";
  readonly status: "source_absent_no_disposition_inference";
  readonly sourceLockIds: readonly ["sc-2024-house-primary-event-search"];
  readonly eventInventoryContestCount: 9;
  readonly sourceContestId: null;
  readonly candidateCount: null;
  readonly votes: null;
  readonly sourceWinnerStatus: null;
  readonly resultAuthorityStatus: null;
  readonly winner: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly rowSha256: string;
}

export interface SouthCarolinaPrimaryResultsV2 {
  readonly schema: "rapid-house-primary-south-carolina-results-v2";
  readonly version: 2;
  readonly parentPackageSha256: string;
  readonly results: readonly SouthCarolinaPrimaryResult[];
  readonly sourceAbsences: readonly SouthCarolinaSourceAbsence[];
  readonly eventInventory: readonly SouthCarolinaEventInventoryRow[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{
    reportedContests: 1;
    sourceAbsentObservations: 1;
    eventInventoryContests: 9;
    democraticEventContests: 4;
    republicanEventContests: 5;
    candidateRows: 3;
    candidateVotes: 55_435;
    sourceMarkedWinnerContests: 1;
    scoreEligibleRows: 0;
  }>;
  readonly packageSha256: string;
}

const SOURCE = {
  id: "sc-2024-house-primary-event-search",
  url: "https://sc.elstats.civera.com/api/download_search.csv?search=%7B%22global%22%3A%7B%22events%22%3A%5B52%5D%7D%2C%22ballotQuestions%22%3A%7B%22text%22%3A%22%22%2C%22types%22%3A%5B%5D%2C%22number%22%3A%22%22%2C%22divisions%22%3A%5B%5D%7D%2C%22contests%22%3A%7B%22candidates%22%3A%5B%5D%2C%22offices%22%3A%5B%7B%22id%22%3A3%7D%5D%2C%22divisions%22%3A%5B%5D%7D%2C%22voterStats%22%3Afalse%2C%22stages%22%3A%5B%5D%2C%22specialElectionsOnly%22%3Afalse%7D",
  path: "data/source/rapid/house-primary/sc/2024/house-primary-event-search.csv",
  bytes: 19_607_419,
  sha256: "fd0a043f0f1fadeecf8a669ca45c3db25ff974704b878caf7ef74da4974bb10d",
} as const;

const HEADER = ["contest_id","election_id","election_date","election_type","primary_party","question_text","question_type","office_id","office_name","office_modifier","district_id","district_type","district_name","candidate_id","candidate_name","retention_candidate_id","retention_candidate_name","division_id","division_type","division_name","vote_channel","is_winner","number_seats","candidate_party_id","candidate_party_name","votes"] as const;
const EXPECTED_INVENTORY: readonly SouthCarolinaEventInventoryRow[] = [
  { contestId:"6898",primaryParty:"Democratic",district:"01",candidateNames:["Mac Deford","Michael B Moore"] },
  { contestId:"6899",primaryParty:"Republican",district:"01",candidateNames:["Bill Young","Catherine Templeton","Nancy Mace"] },
  { contestId:"6900",primaryParty:"Democratic",district:"02",candidateNames:["Daniel J Shrief","David Robinson II"] },
  { contestId:"6901",primaryParty:"Republican",district:"02",candidateNames:["Hamp Redmond","Joe Wilson"] },
  { contestId:"6902",primaryParty:"Democratic",district:"03",candidateNames:["Bryon L Best","Frances Guldner"] },
  { contestId:"6903",primaryParty:"Republican",district:"03",candidateNames:["Elspeth Snow Murday","Franky Franco","Kevin Bishop","Mark Burns","Phil Healy","Sheri Biggs","Stewart O. Jones"] },
  { contestId:"6904",primaryParty:"Republican",district:"04",candidateNames:["Adam Morgan","William Timmons"] },
  { contestId:"6905",primaryParty:"Republican",district:"06",candidateNames:["Duke Buckner","Justin Scott"] },
  { contestId:"6906",primaryParty:"Democratic",district:"07",candidateNames:["Daryl W Scott","Mal Hyman"] },
] as const;


function eachCsvRow(input: string, visit: (row: readonly string[], rowNumber: number) => void) {
  let row: string[] = [], field = "", quote = false, rowNumber = 0;
  const emit = () => { row.push(field.replace(/\r$/, "")); field = ""; rowNumber++; visit(row, rowNumber); row = []; };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quote) { if (char === '"' && input[index + 1] === '"') { field += '"'; index++; } else if (char === '"') quote = false; else field += char; }
    else if (char === '"') quote = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") emit();
    else field += char;
  }
  if (quote) throw new Error("SOUTH_CAROLINA_2024_CSV_UNTERMINATED_QUOTE");
  if (field || row.length) emit();
}

function parseInventory(bytes: Buffer): readonly SouthCarolinaEventInventoryRow[] {
  const contests = new Map<string, { party: "Democratic" | "Republican"; district: string; names: Set<string> }>();
  let dataRows = 0;
  eachCsvRow(bytes.toString("utf8"), (row, rowNumber) => {
    if (rowNumber === 1) { if (!exact(row, HEADER)) throw new Error("SOUTH_CAROLINA_2024_HEADER_INVALID"); return; }
    dataRows++;
    if (row.length !== HEADER.length || row[1] !== "52" || row[2] !== "2024-06-11T00:00:00Z" || row[3] !== "Primary" || row[7] !== "3" || row[8] !== "U.S. House" || row[11] !== "Congressional District" || !/^[1-7]$/.test(row[12] ?? "")) throw new Error(`SOUTH_CAROLINA_2024_ROW_INVALID:${rowNumber}`);
    const contestId = row[0]!, party = row[4];
    if (party !== "Democratic" && party !== "Republican") throw new Error(`SOUTH_CAROLINA_2024_PARTY_INVALID:${rowNumber}`);
    const district = row[12]!.padStart(2, "0"), current = contests.get(contestId);
    if (current && (current.party !== party || current.district !== district)) throw new Error(`SOUTH_CAROLINA_2024_CONTEST_CONFLICT:${contestId}`);
    const value = current ?? { party, district, names: new Set<string>() };
    if (row[24]) value.names.add(row[14]!);
    contests.set(contestId, value);
  });
  if (dataRows !== 112_050) throw new Error("SOUTH_CAROLINA_2024_ROW_COUNT_INVALID");
  const inventory = [...contests].map(([contestId, value]) => ({ contestId, primaryParty:value.party, district:value.district, candidateNames:[...value.names].sort(byteCompare) })).sort((left,right)=>byteCompare(left.contestId,right.contestId));
  if (!exact(inventory, EXPECTED_INVENTORY) || inventory.some((row) => row.primaryParty === "Democratic" && row.district === "06")) throw new Error("SOUTH_CAROLINA_2024_EVENT_INVENTORY_INVALID");
  return inventory;
}

export function buildSouthCarolinaPrimaryResultsV2(root = process.cwd()): SouthCarolinaPrimaryResultsV2 {
  const parent = validateSouthCarolinaPrimaryResults(JSON.parse(readFileSync(join(root, "data/metadata/rapid-house-primary-south-carolina-results-v1.json"), "utf8")), root);
  const bytes = readFileSync(join(root, SOURCE.path));
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const expectedLock = { id:SOURCE.id,url:SOURCE.url,retainedPath:SOURCE.path,retainedStatus:"retained",byteSize:SOURCE.bytes,sha256:SOURCE.sha256,kind:"source",parentIds:[] };
  if (bytes.length !== SOURCE.bytes || sha(bytes) !== SOURCE.sha256 || lock.entries.filter((entry) => entry.id === SOURCE.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === SOURCE.id)), expectedLock)) throw new Error("SOUTH_CAROLINA_2024_SOURCE_BINDING_INVALID");
  const eventInventory = parseInventory(bytes);
  const absenceUnsigned = { observationId:"sc:primary:2024:06:democratic" as const,cycleYear:2024 as const,electionDate:"2024-06-11" as const,districtLabel:"SC-06" as const,status:"source_absent_no_disposition_inference" as const,sourceLockIds:[SOURCE.id] as const,eventInventoryContestCount:9 as const,sourceContestId:null,candidateCount:null,votes:null,sourceWinnerStatus:null,resultAuthorityStatus:null,winner:null,identity:null,scoreEligible:false as const };
  const sourceAbsences = [{ ...absenceUnsigned, rowSha256:hash("dsa-seats:rapid-house-primary-south-carolina-source-absence:v2",absenceUnsigned) }];
  const results = parent.results;
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-south-carolina-result-set:v2", { results,sourceAbsences,eventInventory });
  const summary = { reportedContests:1 as const,sourceAbsentObservations:1 as const,eventInventoryContests:9 as const,democraticEventContests:4 as const,republicanEventContests:5 as const,candidateRows:3 as const,candidateVotes:55_435 as const,sourceMarkedWinnerContests:1 as const,scoreEligibleRows:0 as const };
  const unsigned = { schema:"rapid-house-primary-south-carolina-results-v2" as const,version:2 as const,parentPackageSha256:parent.packageSha256,results,sourceAbsences,eventInventory,resultSetSha256,summary };
  return { ...unsigned,packageSha256:hash("dsa-seats:rapid-house-primary-south-carolina-package:v2",unsigned) };
}

export function validateSouthCarolinaPrimaryResultsV2(value: unknown, root = process.cwd()): SouthCarolinaPrimaryResultsV2 {
  const expected = buildSouthCarolinaPrimaryResultsV2(root);
  if (!exact(value, expected)) throw new Error("SOUTH_CAROLINA_RESULTS_V2_INVALID");
  return value as SouthCarolinaPrimaryResultsV2;
}
