import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type NevadaPrimaryObservation = Readonly<{
  observationId: `nv:primary:${2022 | 2024}:${"01" | "03" | "04"}:democratic`;
  cycleYear: 2022 | 2024;
  electionDate: "2022-06-14" | "2024-06-11";
  districtLabel: "NV-01" | "NV-03" | "NV-04";
  sourceLockId: "nv-2022-official-statewide-primary-results-archived" | "nv-2024-official-statewide-primary-results-archived";
  sourceContestTitle: string | null;
  observationStatus: "reported_contest" | "source_absent_complete_official_statewide_results_page";
  sourceCandidateNames: readonly string[] | null;
  candidateVotes: readonly number[] | null;
  totalVotes: number | null;
  resultAuthorityStatus: "archived_official_statewide_primary_results_page";
  certificationStatus: "page_marked_official_no_separate_certification_instrument_retained";
  sourceWinnerStatus: "not_marked_by_source" | "not_applicable_no_reported_contest";
  winnerIdentity: null;
  identity: null;
  scoreEligible: false;
  observationSha256: string;
}>;

export interface NevadaPrimaryResults {
  readonly schema: "rapid-house-primary-nevada-results-v1";
  readonly version: 1;
  readonly observations: readonly NevadaPrimaryObservation[];
  readonly observationSetSha256: string;
  readonly summary: Readonly<{ targetObservations: 6; reportedContests: 4; sourceAbsent: 2; candidateRows: 8; candidateVotes: 159263; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { cycleYear: 2022 as const, date: "2022-06-14" as const, id: "nv-2022-official-statewide-primary-results-archived" as const, url: "https://web.archive.org/web/20221012153409id_/https://www.nvsos.gov/SOSelectionPages/results/2022StateWidePrimary/ElectionSummary.aspx", path: "data/source/rapid/house-primary/nv/2022/official-statewide-primary-results.html", bytes: 151_291, sha256: "27ed1dbcb552cb0ff0d3ee279ecdbc23d4ad4a87b8771f06bdcbbadfee56067b" },
  { cycleYear: 2024 as const, date: "2024-06-11" as const, id: "nv-2024-official-statewide-primary-results-archived" as const, url: "https://web.archive.org/web/20241110200634id_/https://www.nvsos.gov/SOSelectionPages/results/2024StateWidePrimary/ElectionSummary.aspx", path: "data/source/rapid/house-primary/nv/2024/official-statewide-primary-results.html", bytes: 93_196, sha256: "86ef6aac14bfa8778a0aca703b6803e19f739604fde9ec716effff8fafc43678" },
] as const;
const EXPECTED = [
  { cycleYear: 2022 as const, district: "01" as const, names: ["TITUS, DINA", "VILELA, AMY"] as const, votes: [33_565, 8_482] as const },
  { cycleYear: 2022 as const, district: "03" as const, names: ["HYNES, RANDELL \"RANDY\"", "LEE, SUSIE"] as const, votes: [4_265, 37_069] as const },
  { cycleYear: 2022 as const, district: "04" as const, names: null, votes: null },
  { cycleYear: 2024 as const, district: "01" as const, names: null, votes: null },
  { cycleYear: 2024 as const, district: "03" as const, names: ["BRITTAIN, ROCKATHENA", "LEE, SUSIE"] as const, votes: [3_036, 33_901] as const },
  { cycleYear: 2024 as const, district: "04" as const, names: ["HORSFORD, STEVEN", "SHULTZ, LEVY"] as const, votes: [34_861, 4_084] as const },
] as const;

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const exact = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const clean = (value: string) => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").trim();

function democraticHouseContests(html: string): ReadonlyMap<string, Readonly<{ names: readonly string[]; votes: readonly number[] }>> {
  const contests = new Map<string, Readonly<{ names: readonly string[]; votes: readonly number[] }>>();
  const pattern = /<strong>U\.S\. Representative in Congress, District (\d+) \(Democratic\)<\/strong>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g;
  for (const match of html.matchAll(pattern)) {
    const district = match[1]!.padStart(2, "0");
    const names: string[] = [], votes: number[] = [];
    for (const row of match[2]!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => clean(cell[1]!));
      if (cells.length < 3 || !/^\d{1,3}(?:,\d{3})*$/.test(cells[2]!)) throw new Error("NEVADA_PRIMARY_CONTEST_ROW_INVALID");
      names.push(cells[0]!); votes.push(Number(cells[2]!.replace(/,/g, "")));
    }
    if (names.length === 0 || contests.has(district)) throw new Error("NEVADA_PRIMARY_CONTEST_DUPLICATE_OR_EMPTY");
    contests.set(district, { names, votes });
  }
  return contests;
}

export function buildNevadaPrimaryResults(root = process.cwd()): NevadaPrimaryResults {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const parsed = new Map<number, ReadonlyMap<string, Readonly<{ names: readonly string[]; votes: readonly number[] }>>>();
  for (const source of SOURCES) {
    const bytes = readFileSync(join(root, source.path)), expectedLock = { id: source.id, url: source.url, retainedPath: source.path, retainedStatus: "retained", byteSize: source.bytes, sha256: source.sha256, kind: "archived_official_source", parentIds: [] };
    if (bytes.length !== source.bytes || sha(bytes) !== source.sha256 || lock.entries.filter((entry) => entry.id === source.id).length !== 1 || !exact(sourceLockContent(lock.entries.find((entry) => entry.id === source.id)), expectedLock)) throw new Error(`NEVADA_PRIMARY_SOURCE_BINDING_INVALID:${source.cycleYear}`);
    const html = bytes.toString("utf8");
    if (!html.includes(`${source.cycleYear} Official Statewide Primary Election Results`) || !html.includes(`${source.date.slice(5).replace("06-14", "June 14").replace("06-11", "June 11")}, ${source.cycleYear}`)) throw new Error(`NEVADA_PRIMARY_DOCUMENT_IDENTITY_INVALID:${source.cycleYear}`);
    const contests = democraticHouseContests(html), expectedDistricts = source.cycleYear === 2022 ? ["01", "02", "03"] : ["03", "04"];
    if (!exact([...contests.keys()], expectedDistricts)) throw new Error(`NEVADA_PRIMARY_DEMOCRATIC_HOUSE_CLOSURE_INVALID:${source.cycleYear}`);
    parsed.set(source.cycleYear, contests);
  }
  const observations = EXPECTED.map((expected) => {
    const source = SOURCES.find((item) => item.cycleYear === expected.cycleYear)!, contest = parsed.get(expected.cycleYear)!.get(expected.district), reported = expected.names !== null;
    if (reported ? !contest || !exact(contest.names, expected.names) || !exact(contest.votes, expected.votes) : contest !== undefined) throw new Error(`NEVADA_PRIMARY_TARGET_OBSERVATION_INVALID:${expected.cycleYear}:${expected.district}`);
    const totalVotes = expected.votes?.reduce((sum, value) => sum + value, 0) ?? null;
    const unsigned = { observationId: `nv:primary:${expected.cycleYear}:${expected.district}:democratic` as const, cycleYear: expected.cycleYear, electionDate: source.date, districtLabel: `NV-${expected.district}` as const, sourceLockId: source.id, sourceContestTitle: reported ? `U.S. Representative in Congress, District ${Number(expected.district)} (Democratic)` : null, observationStatus: reported ? "reported_contest" as const : "source_absent_complete_official_statewide_results_page" as const, sourceCandidateNames: expected.names, candidateVotes: expected.votes, totalVotes, resultAuthorityStatus: "archived_official_statewide_primary_results_page" as const, certificationStatus: "page_marked_official_no_separate_certification_instrument_retained" as const, sourceWinnerStatus: reported ? "not_marked_by_source" as const : "not_applicable_no_reported_contest" as const, winnerIdentity: null, identity: null, scoreEligible: false as const };
    return { ...unsigned, observationSha256: hash("dsa-seats:rapid-house-primary-nevada-observation:v1", unsigned) } as NevadaPrimaryObservation;
  });
  const summary = { targetObservations: 6 as const, reportedContests: 4 as const, sourceAbsent: 2 as const, candidateRows: 8 as const, candidateVotes: 159263 as const, scoreEligibleRows: 0 as const };
  if (observations.reduce((sum, row) => sum + (row.totalVotes ?? 0), 0) !== summary.candidateVotes || observations.some((row) => row.identity !== null || row.winnerIdentity !== null || row.scoreEligible)) throw new Error("NEVADA_PRIMARY_RESULTS_CLOSURE_INVALID");
  const observationSetSha256 = hash("dsa-seats:rapid-house-primary-nevada-observation-set:v1", observations), unsigned = { schema: "rapid-house-primary-nevada-results-v1" as const, version: 1 as const, observations, observationSetSha256, summary };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-nevada-package:v1", unsigned) };
}

export function validateNevadaPrimaryResults(value: unknown, root = process.cwd()): NevadaPrimaryResults {
  const expected = buildNevadaPrimaryResults(root);
  if (!exact(value, expected)) throw new Error("NEVADA_PRIMARY_RESULTS_INVALID");
  return value as NevadaPrimaryResults;
}
