import { readPinnedPackage, readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { byteCompare, hash } from "./shared";
import { districtKey, type RosterParty, type StateChamber } from "./state-legislative-roster";
import { STATE_GENERAL_ADAPTERS } from "./state-general";

/**
 * Official general-election returns for state-legislative districts, one
 * state at a time, normalized to a single contract.
 *
 * Every state's election authority publishes its own returns; this layer
 * reads the retained official file for each covered state through a small
 * adapter and records, per contest: the chamber, the district, the cycle,
 * every named candidate with party and votes, and the Democratic margin over
 * the Republican share of all votes cast. That own-race margin is the
 * district baseline the scorer uses for state-legislative seats, since no
 * open nationwide presidential-by-legislative-district file exists.
 *
 * Nothing is inferred: a district with no retained contest is absent, not
 * imputed, and the score layer says so per seat.
 */
export interface StateGeneralCandidate {
  readonly name: string;
  readonly rawParty: string;
  readonly party: RosterParty;
  readonly votes: number;
  readonly writeIn: boolean;
}

export interface StateGeneralContest {
  readonly contestId: string;
  readonly stateCode: string;
  readonly chamber: StateChamber;
  readonly district: string;
  readonly districtKey: string;
  /** Separately elected position within a district (Washington "Pos. 1"); null where a district has one contest. */
  readonly position: string | null;
  readonly cycleYear: number;
  readonly electionDate: string;
  readonly electionKind: "general" | "special_general";
  /** Seats filled by this contest; margins for multi-member contests use party vote totals. */
  readonly seats: number;
  readonly candidates: readonly StateGeneralCandidate[];
  readonly totalVotes: number;
  readonly democraticVotes: number;
  readonly republicanVotes: number;
  /** (Democratic − Republican) ÷ all votes cast × 100; null when no votes were recorded or no major-party candidate ran. */
  readonly democraticMarginPercentagePoints: number | null;
  readonly contested: boolean;
  readonly sourceId: string;
  /** Present only for unofficial (election-night or pre-canvass) returns; absent means the certified canvass. */
  readonly resultStatus?: "unofficial";
  readonly contestSha256: string;
}

export interface StateGeneralStateSummary {
  readonly stateCode: string;
  readonly sourceIds: readonly string[];
  readonly cycles: readonly number[];
  readonly contests: number;
  readonly lowerContests: number;
  readonly upperContests: number;
  readonly uncontested: number;
  readonly candidateVotes: number;
  /** Sources still carrying unofficial returns; absent when every source is certified. */
  readonly unofficialSourceIds?: readonly string[];
}

export interface StateLegislativeGeneralResults {
  readonly schema: "state-legislative-general-results-v1";
  readonly version: 1;
  readonly methodology: Readonly<{
    source: "official_state_election_authority_returns_per_state";
    margin: "democratic_minus_republican_votes_over_all_votes_cast_percentage_points";
    multiMember: "party_vote_totals_across_all_candidates_in_the_contest";
    uncontested: "named_candidates_do_not_exceed_seats";
    winnerInference: false;
  }>;
  readonly sourceIds: readonly string[];
  readonly states: readonly StateGeneralStateSummary[];
  readonly contests: readonly StateGeneralContest[];
  readonly summary: Readonly<{ states: number; contests: number; uncontested: number; candidateVotes: number; multiMemberContests: number }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

/** A contest as an adapter reports it, before normalization. */
export interface RawGeneralContest {
  readonly chamber: StateChamber;
  readonly district: string;
  readonly position?: string;
  readonly electionDate?: string;
  readonly electionKind?: "general" | "special_general";
  readonly seats?: number;
  readonly candidates: readonly Readonly<{ name: string; rawParty: string; party?: RosterParty; votes: number; writeIn?: boolean }>[];
}

export interface StateGeneralSource {
  readonly id: string;
  readonly url: string;
  readonly path: string;
  readonly cycleYear: number;
  readonly electionDate: string;
  /** Human note for the review ledger, e.g. which chamber the file covers. */
  readonly note: string;
  /**
   * "unofficial" for returns retained before the state certifies its canvass. Absent means certified; every
   * source before 2026 is a certified canvass. Replace an unofficial source with the certified file, under a new
   * id, once the state certifies.
   */
  readonly resultStatus?: "certified" | "unofficial";
  /** Request body when the publisher serves the file only in response to a POST; the retained bytes are that response. */
  readonly postBody?: string;
  /** Content type of postBody; form encoding when absent. */
  readonly postContentType?: string;
  /** User agent to send when the publisher's bot filter refuses the project's own. */
  readonly userAgent?: string;
  /**
   * For PDF sources: parse the pinned `pdftotext -layout` extract instead of the PDF, so no build needs
   * pdftotext. The extract is retained beside the PDF with id `${id}-pdftotext-layout`.
   */
  readonly pdfLayoutExtract?: boolean;
  /**
   * For scanned PDFs with no text layer: parse a reviewed transcription retained beside the PDF instead, with id
   * `${id}-transcription`, pinned with the PDF as its parent. The transcription is made by hand or by OCR and
   * checked figure by figure; the adapter documents how.
   */
  readonly transcription?: boolean;
}

export interface StateGeneralAdapter {
  readonly stateCode: string;
  readonly authority: string;
  readonly sources: readonly StateGeneralSource[];
  /** Expected contest count per source, checked after parsing so a silently truncated file fails closed. */
  readonly expectedContests: Readonly<Record<string, number>>;
  readonly parse: (bytes: Buffer, source: StateGeneralSource) => readonly RawGeneralContest[];
}

export const STATE_LEGISLATIVE_GENERAL_RESULTS = {
  id: "state-legislative-general-results-v1",
  path: "data/metadata/state-legislative-general-results-v1.json",
  url: "urn:dsa-seats:state-legislative-general-results:v1",
  parentIds: (): string[] => STATE_GENERAL_ADAPTERS.flatMap((adapter) => adapter.sources.flatMap((source) => source.pdfLayoutExtract ? [source.id, pdfLayoutExtractId(source.id)] : source.transcription ? [source.id, transcriptionId(source.id)] : [source.id])),
} as const;

const fail = (code: string): never => { throw new Error(`STATE_LEG_GENERAL_${code}`); };
export const pdfLayoutExtractId = (sourceId: string): string => `${sourceId}-pdftotext-layout`;
export const pdfLayoutExtractPath = (pdfPath: string): string => `${pdfPath.replace(/\.pdf$/i, "")}-layout.txt`;
export const transcriptionId = (sourceId: string): string => `${sourceId}-transcription`;
export const transcriptionPath = (pdfPath: string): string => `${pdfPath.replace(/\.pdf$/i, "")}-transcription.tsv`;
/** The retained file an adapter parses: the source itself, its pdftotext extract, or its reviewed transcription. */
export const parsedSourceId = (source: StateGeneralSource): string => source.pdfLayoutExtract ? pdfLayoutExtractId(source.id) : source.transcription ? transcriptionId(source.id) : source.id;
const one = (value: number): number => Math.round(value * 10) / 10;

/** Party from a source label: national parties and their state affiliates, everything else Independent or Other. */
export const generalPartyOf = (raw: string): RosterParty => {
  const key = raw.trim().toLowerCase();
  if (key === "" ) return "Independent";
  if (/^(d|dem|democrat|democratic)\b/.test(key) || key === "dfl" || key.startsWith("democratic")) return "Democratic";
  if (/^(r|rep|gop|republican)\b/.test(key)) return "Republican";
  if (/^(i|ind|independent|npa|no party|nonpartisan|unaffiliated|non-partisan)\b/.test(key)) return "Independent";
  return "Other";
};

function normalize(raw: RawGeneralContest, source: StateGeneralSource, stateCode: string): StateGeneralContest {
  const candidates = raw.candidates.map((candidate) => {
    if (!Number.isSafeInteger(candidate.votes) || candidate.votes < 0) fail(`VOTES_INVALID:${stateCode}:${raw.chamber}:${raw.district}:${candidate.name}`);
    return { name: candidate.name.trim(), rawParty: candidate.rawParty, party: candidate.party ?? generalPartyOf(candidate.rawParty), votes: candidate.votes, writeIn: candidate.writeIn ?? false };
  }).sort((left, right) => right.votes - left.votes || byteCompare(left.name, right.name));
  const named = candidates.filter((candidate) => !candidate.writeIn);
  if (named.length === 0) fail(`NO_NAMED_CANDIDATE:${stateCode}:${raw.chamber}:${raw.district}`);
  const totalVotes = candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
  const democraticVotes = candidates.filter((candidate) => candidate.party === "Democratic").reduce((sum, candidate) => sum + candidate.votes, 0);
  const republicanVotes = candidates.filter((candidate) => candidate.party === "Republican").reduce((sum, candidate) => sum + candidate.votes, 0);
  const parties = new Set(named.map((candidate) => candidate.party));
  // Contested means more named candidates than seats, whatever their parties: a top-two race between two
  // Democrats is contested even though its Democratic margin is 100.
  const contested = named.length > (raw.seats ?? 1);
  // A contest with no Democratic or Republican candidate carries no partisan signal: its margin is null, not a tie.
  const margin = !parties.has("Democratic") && !parties.has("Republican") ? null
    : totalVotes === 0
      ? (contested ? null : democraticVotes >= republicanVotes && parties.has("Democratic") ? 100 : parties.has("Republican") ? -100 : null)
      : one(((democraticVotes - republicanVotes) / totalVotes) * 100);
  const district = raw.district.trim();
  const unsigned = {
    contestId: `${stateCode.toLowerCase()}:state-leg-general:${source.cycleYear}:${raw.chamber}:${districtKey(district).replace(/ /g, "-")}${raw.position ? `:pos-${raw.position}` : ""}`,
    stateCode, chamber: raw.chamber, district, districtKey: districtKey(district), position: raw.position ?? null, cycleYear: source.cycleYear,
    electionDate: raw.electionDate ?? source.electionDate, electionKind: raw.electionKind ?? "general", seats: raw.seats ?? 1,
    candidates, totalVotes, democraticVotes, republicanVotes, democraticMarginPercentagePoints: margin, contested, sourceId: source.id,
    ...(source.resultStatus === "unofficial" ? { resultStatus: "unofficial" as const } : {}),
  };
  return { ...unsigned, contestSha256: hash("dsa-seats:state-legislative-general-contest:v1", unsigned) };
}

export function buildStateLegislativeGeneralResults(root = process.cwd(), lock: SourceLock = readSourceLock(root), adapters: readonly StateGeneralAdapter[] = STATE_GENERAL_ADAPTERS): StateLegislativeGeneralResults {
  const contests: StateGeneralContest[] = [];
  const states: StateGeneralStateSummary[] = [];
  for (const adapter of [...adapters].sort((left, right) => byteCompare(left.stateCode, right.stateCode))) {
    const stateContests: StateGeneralContest[] = [];
    for (const source of adapter.sources) {
      readRetainedSource(lock, source.id, root);
      const { bytes } = readRetainedSource(lock, parsedSourceId(source), root);
      const parsed = adapter.parse(bytes, source).map((raw) => normalize(raw, source, adapter.stateCode));
      const expected = adapter.expectedContests[source.id];
      if (expected === undefined) fail(`EXPECTED_COUNT_MISSING:${source.id}`);
      if (parsed.length !== expected) fail(`CONTEST_COUNT:${source.id}:${parsed.length}:expected:${expected}`);
      stateContests.push(...parsed);
    }
    const keys = stateContests.map((contest) => `${contest.cycleYear}|${contest.electionDate}|${contest.chamber}|${contest.districtKey}|${contest.position ?? ""}`);
    if (new Set(keys).size !== keys.length) fail(`DUPLICATE_CONTEST:${adapter.stateCode}`);
    states.push({
      stateCode: adapter.stateCode, sourceIds: adapter.sources.map((source) => source.id), cycles: [...new Set(stateContests.map((contest) => contest.cycleYear))].sort(),
      contests: stateContests.length, lowerContests: stateContests.filter((contest) => contest.chamber === "lower").length, upperContests: stateContests.filter((contest) => contest.chamber !== "lower").length,
      uncontested: stateContests.filter((contest) => !contest.contested).length, candidateVotes: stateContests.reduce((sum, contest) => sum + contest.totalVotes, 0),
      ...(adapter.sources.some((source) => source.resultStatus === "unofficial") ? { unofficialSourceIds: adapter.sources.filter((source) => source.resultStatus === "unofficial").map((source) => source.id) } : {}),
    });
    contests.push(...stateContests);
  }
  contests.sort((left, right) => byteCompare(left.contestId, right.contestId) || byteCompare(left.electionDate, right.electionDate));
  const summary = { states: states.length, contests: contests.length, uncontested: contests.filter((contest) => !contest.contested).length, candidateVotes: contests.reduce((sum, contest) => sum + contest.totalVotes, 0), multiMemberContests: contests.filter((contest) => contest.seats > 1).length };
  const unsigned = {
    schema: "state-legislative-general-results-v1" as const, version: 1 as const,
    methodology: { source: "official_state_election_authority_returns_per_state" as const, margin: "democratic_minus_republican_votes_over_all_votes_cast_percentage_points" as const, multiMember: "party_vote_totals_across_all_candidates_in_the_contest" as const, uncontested: "named_candidates_do_not_exceed_seats" as const, winnerInference: false as const },
    sourceIds: adapters.flatMap((adapter) => adapter.sources.map((source) => source.id)), states, contests, summary,
    rowSetSha256: hash("dsa-seats:state-legislative-general-contest-set:v1", contests),
  };
  return { ...unsigned, packageSha256: hash("dsa-seats:state-legislative-general-package:v1", unsigned) };
}

export function readStateLegislativeGeneralResults(root = process.cwd(), lock: SourceLock = readSourceLock(root)): StateLegislativeGeneralResults {
  const { value } = readPinnedPackage<StateLegislativeGeneralResults>(lock, STATE_LEGISLATIVE_GENERAL_RESULTS.id, "dsa-seats:state-legislative-general-package:v1", root);
  if (value.schema !== "state-legislative-general-results-v1" || value.version !== 1 || value.methodology.winnerInference !== false || value.contests.length !== value.summary.contests) fail("PINNED_INVALID");
  return value;
}
