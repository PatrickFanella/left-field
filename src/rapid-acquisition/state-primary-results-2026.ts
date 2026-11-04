import { findSourceLockEntry, readPinnedPackage, readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { byteCompare, hash } from "./shared";
import { evidencePartyOf, type CountStatus, type EvidenceParty } from "./seat-outcome-evidence";
import { STATE_PRIMARY_ADAPTERS } from "./state-primary";
import { districtKey } from "./state-legislative-roster";
import { parsedSourceId, pdfLayoutExtractId, transcriptionId, type StateGeneralSource } from "./state-legislative-general-results";

/**
 * Official 2026 primary returns, one state at a time, for every office the
 * seat outcome ledger follows: U.S. House, U.S. Senate, governor and both
 * legislative chambers, every party.
 *
 * Each state's election authority publishes its own returns; a small adapter
 * per state reads the retained official file and reports raw contests. This
 * layer normalizes them to one contract and records, per contest: the office,
 * district, party (none on a top-two or top-four ballot), round, every named
 * candidate with votes, and the names the source itself marks as nominees.
 *
 * Nothing is inferred. A state that does not print unopposed primaries is
 * covered for those seats only by a companion source that names its nominees
 * (a certified candidate list), reported as an unopposed contest with the
 * nominee marked. A district with no retained contest is absent.
 */
export type PrimaryOffice = "us_house" | "us_senate" | "governor" | "state_lower" | "state_upper" | "state_unicameral";
/** partisan: each party nominates its own; top_two / top_four: one ballot for every party, the leading two or four advance. */
export type PrimarySystem = "partisan" | "top_two" | "top_four";
export type PrimaryStage = "primary" | "runoff";

export const PRIMARY_OFFICES: readonly PrimaryOffice[] = ["us_house", "us_senate", "governor", "state_lower", "state_upper", "state_unicameral"];
const ADVANCING: Readonly<Record<Exclude<PrimarySystem, "partisan">, number>> = { top_two: 2, top_four: 4 };

/** A contest as an adapter reports it, before normalization. */
export interface RawPrimaryContest {
  readonly office: PrimaryOffice;
  /** House: "1" or "AL"; state legislature: the district as the roster names it; Senate and governor: null. */
  readonly district: string | null;
  /** Separately elected position within a district (Washington "Pos. 1"). */
  readonly position?: string;
  /** The party label as printed; null on a top-two or top-four ballot. */
  readonly rawParty: string | null;
  readonly stage?: PrimaryStage;
  /** A special primary for a seat filled out of cycle, e.g. a Senate vacancy. */
  readonly special?: boolean;
  readonly electionDate?: string;
  readonly seats?: number;
  /** Overrides the adapter's system for this contest, e.g. Nebraska's nonpartisan legislature in a partisan state. */
  readonly system?: PrimarySystem;
  /**
   * `votes` is null only for nominees named by a candidate list without a count (an unopposed primary not
   * printed); then every line is such a nominee, marked `winner`, no more than `seats`. `writeIn` marks an
   * unnamed write-in or "all others" line; a candidate written in by name is an ordinary line.
   */
  readonly candidates: readonly Readonly<{ name: string; votes: number | null; winner?: boolean; writeIn?: boolean }>[];
}

export interface StatePrimaryAdapter {
  readonly stateCode: string;
  readonly authority: string;
  readonly system: PrimarySystem;
  readonly sources: readonly StateGeneralSource[];
  /** Expected contest count per source, checked after parsing so a silently truncated file fails closed. */
  readonly expectedContests: Readonly<Record<string, number>>;
  readonly parse: (bytes: Buffer, source: StateGeneralSource, readSource: (sourceId: string) => Buffer) => readonly RawPrimaryContest[];
}

export interface StatePrimaryCandidate {
  readonly name: string;
  readonly votes: number;
  readonly writeIn: boolean;
}

export interface StatePrimaryContest {
  readonly contestId: string;
  readonly stateCode: string;
  readonly office: PrimaryOffice;
  /** House: "01".."53" or "AL"; state legislature: `districtKey`; statewide: null. */
  readonly district: string | null;
  readonly position: string | null;
  readonly system: PrimarySystem;
  readonly rawParty: string | null;
  /** Democratic or Republican; null on an all-party ballot and for any other party. */
  readonly party: EvidenceParty | null;
  readonly stage: PrimaryStage;
  readonly special: boolean;
  readonly electionDate: string;
  readonly seats: number;
  /** Places that win: the seats in a partisan primary, two or four on an all-party ballot. */
  readonly advance: number;
  readonly candidates: readonly StatePrimaryCandidate[];
  readonly totalVotes: number;
  /** Names the source marks as nominees or as advancing; null when it marks none. */
  readonly sourceMarkedWinners: readonly string[] | null;
  /** True for a nominee named without a count: the state printed no contest because nobody opposed them. */
  readonly unopposedWithoutCount: boolean;
  readonly countStatus: CountStatus;
  readonly sourceId: string;
  readonly contestSha256: string;
}

export interface StatePrimaryStateSummary {
  readonly stateCode: string;
  readonly system: PrimarySystem;
  readonly sourceIds: readonly string[];
  readonly contests: number;
  readonly byOffice: Readonly<Partial<Record<PrimaryOffice, number>>>;
  readonly unofficialSourceIds?: readonly string[];
  readonly supersessions?: readonly Readonly<{ sourceId: string; supersedes: string }>[];
}

export interface StatePrimaryResults2026 {
  readonly schema: "state-primary-results-2026-v1";
  readonly version: 1;
  readonly methodology: Readonly<{ source: "official_state_election_authority_returns_per_state"; winnerInference: false; unopposed: "nominee_named_by_official_candidate_list_when_the_state_prints_no_contest" }>;
  readonly sourceIds: readonly string[];
  readonly states: readonly StatePrimaryStateSummary[];
  readonly contests: readonly StatePrimaryContest[];
  readonly summary: Readonly<{ states: number; contests: number; byOffice: Readonly<Record<PrimaryOffice, number>> }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

export const STATE_PRIMARY_RESULTS_2026 = {
  id: "state-primary-results-2026-v1",
  path: "data/metadata/state-primary-results-2026-v1.json",
  url: "urn:dsa-seats:state-primary-results-2026:v1",
  parentIds: (): string[] => STATE_PRIMARY_ADAPTERS.flatMap((adapter) => adapter.sources.flatMap((source) => source.pdfLayoutExtract ? [source.id, pdfLayoutExtractId(source.id)] : source.transcription ? [source.id, transcriptionId(source.id)] : [source.id])),
} as const;

const PACKAGE_DOMAIN = "dsa-seats:state-primary-results-2026-package:v1";
const fail = (code: string): never => { throw new Error(`STATE_PRIMARY_${code}`); };

/** "1", "01", "AL" or "at-large" to the ledger's House district label part: "01" or "AL". */
export const houseDistrictOf = (raw: string): string => {
  const value = raw.trim().toUpperCase();
  if (/^(AL|AT[- ]LARGE|0+)$/.test(value)) return "AL";
  return /^\d+$/.test(value) ? String(Number(value)).padStart(2, "0") : fail(`HOUSE_DISTRICT_INVALID:${raw}`);
};

const normalizedDistrict = (raw: RawPrimaryContest, stateCode: string): string | null => {
  if (raw.office === "us_senate" || raw.office === "governor") return raw.district === null ? null : fail(`STATEWIDE_DISTRICT:${stateCode}:${raw.office}`);
  const district = raw.district ?? fail(`DISTRICT_MISSING:${stateCode}:${raw.office}`);
  return raw.office === "us_house" ? houseDistrictOf(district) : districtKey(district);
};

export function normalizePrimaryContest(raw: RawPrimaryContest, source: StateGeneralSource, adapter: Pick<StatePrimaryAdapter, "stateCode" | "system">): StatePrimaryContest {
  const stateCode = adapter.stateCode, system = raw.system ?? adapter.system;
  const district = normalizedDistrict(raw, stateCode);
  const where = `${stateCode}:${raw.office}:${district ?? "statewide"}:${raw.rawParty ?? "all"}`;
  if (system === "partisan" && (raw.rawParty === null || raw.rawParty.trim() === "")) fail(`PARTY_MISSING:${where}`);
  if (system !== "partisan" && raw.rawParty !== null) fail(`PARTY_ON_ALL_PARTY_BALLOT:${where}`);
  // Nominees named without a count: every line uncounted and marked, no more of them than seats.
  const uncounted = raw.candidates.filter((candidate) => candidate.votes === null);
  if (uncounted.length > 0 && (uncounted.length !== raw.candidates.length || raw.candidates.some((candidate) => candidate.winner !== true) || raw.candidates.length > (raw.seats ?? 1))) fail(`UNCOUNTED_NOT_UNOPPOSED_NOMINEES:${where}`);
  const candidates = raw.candidates.map((candidate) => {
    const votes = candidate.votes ?? 0;
    if (!Number.isSafeInteger(votes) || votes < 0) fail(`VOTES_INVALID:${where}:${candidate.name}`);
    return { name: candidate.name.replace(/\s+/g, " ").trim(), votes, writeIn: candidate.writeIn ?? false };
  }).sort((left, right) => right.votes - left.votes || byteCompare(left.name, right.name));
  // A primary with only an unnamed write-in line is kept: it shows the party fielded no filed candidate.
  if (candidates.length === 0) fail(`NO_CANDIDATE_LINE:${where}`);
  const marked = raw.candidates.filter((candidate) => candidate.winner === true).map((candidate) => candidate.name.replace(/\s+/g, " ").trim());
  const stage = raw.stage ?? "primary", special = raw.special ?? false, seats = raw.seats ?? 1;
  const partySlug = raw.rawParty === null ? "all" : raw.rawParty.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const unsigned = {
    contestId: `${stateCode.toLowerCase()}:primary:2026:${raw.office}:${district === null ? "statewide" : district.replace(/ /g, "-")}${raw.position ? `:pos-${raw.position}` : ""}:${partySlug}:${stage}${special ? ":special" : ""}`,
    stateCode, office: raw.office, district, position: raw.position ?? null, system, rawParty: raw.rawParty, party: raw.rawParty === null ? null : evidencePartyOf(raw.rawParty),
    stage, special, electionDate: raw.electionDate ?? source.electionDate, seats, advance: system === "partisan" ? seats : ADVANCING[system],
    candidates, totalVotes: candidates.reduce((sum, candidate) => sum + candidate.votes, 0), sourceMarkedWinners: marked.length > 0 ? marked : null,
    unopposedWithoutCount: uncounted.length > 0, countStatus: source.resultStatus === "unofficial" ? "unofficial" as const : "certified" as const, sourceId: source.id,
  };
  return { ...unsigned, contestSha256: hash("dsa-seats:state-primary-contest-2026:v1", unsigned) };
}

/** Read and normalize one adapter's contests; `readBytes` returns a source's parsed bytes (from the lock, or from disk while an adapter is written). */
export function parseStatePrimaryAdapter(adapter: StatePrimaryAdapter, readBytes: (source: StateGeneralSource) => Buffer): StatePrimaryContest[] {
  const contests: StatePrimaryContest[] = [];
  for (const source of adapter.sources) {
    const readSource = (sourceId: string): Buffer => readBytes(adapter.sources.find((candidate) => candidate.id === sourceId) ?? fail(`COMPANION_UNKNOWN:${adapter.stateCode}:${sourceId}`));
    const parsed = adapter.parse(readBytes(source), source, readSource).map((raw) => normalizePrimaryContest(raw, source, adapter));
    const expected = adapter.expectedContests[source.id];
    if (expected === undefined) fail(`EXPECTED_COUNT_MISSING:${source.id}`);
    if (parsed.length !== expected) fail(`CONTEST_COUNT:${source.id}:${parsed.length}:expected:${expected}`);
    contests.push(...parsed);
  }
  const ids = contests.map((contest) => contest.contestId);
  if (new Set(ids).size !== ids.length) fail(`DUPLICATE_CONTEST:${adapter.stateCode}:${ids.find((id, index) => ids.indexOf(id) !== index)}`);
  return contests;
}

const countByOffice = (contests: readonly StatePrimaryContest[]): Record<PrimaryOffice, number> => Object.fromEntries(PRIMARY_OFFICES.map((office) => [office, contests.filter((contest) => contest.office === office).length])) as Record<PrimaryOffice, number>;

export function buildStatePrimaryResults2026(root = process.cwd(), lock: SourceLock = readSourceLock(root), registered: readonly StatePrimaryAdapter[] = STATE_PRIMARY_ADAPTERS): StatePrimaryResults2026 {
  // A state whose adapter declares no source yet is not covered, not covered with zero contests.
  const adapters = registered.filter((adapter) => adapter.sources.length > 0);
  const contests: StatePrimaryContest[] = [];
  const states: StatePrimaryStateSummary[] = [];
  const codes = adapters.map((adapter) => adapter.stateCode);
  if (new Set(codes).size !== codes.length) fail("DUPLICATE_ADAPTER");
  for (const adapter of [...adapters].sort((left, right) => byteCompare(left.stateCode, right.stateCode))) {
    const declared = new Set(adapter.sources.map((source) => source.id));
    const supersessions = adapter.sources.flatMap((source) => {
      if (source.supersedes === undefined) return [];
      if (declared.has(source.supersedes)) fail(`SUPERSEDED_STILL_DECLARED:${adapter.stateCode}:${source.supersedes}`);
      if (!findSourceLockEntry(lock, source.supersedes)) fail(`SUPERSEDED_NOT_RETAINED:${adapter.stateCode}:${source.supersedes}`);
      return [{ sourceId: source.id, supersedes: source.supersedes }];
    });
    const stateContests = parseStatePrimaryAdapter(adapter, (source) => { readRetainedSource(lock, source.id, root); return readRetainedSource(lock, parsedSourceId(source), root).bytes; });
    const byOffice = Object.fromEntries(Object.entries(countByOffice(stateContests)).filter(([, count]) => count > 0));
    const unofficial = adapter.sources.filter((source) => source.resultStatus === "unofficial").map((source) => source.id);
    states.push({ stateCode: adapter.stateCode, system: adapter.system, sourceIds: adapter.sources.map((source) => source.id), contests: stateContests.length, byOffice, ...(unofficial.length > 0 ? { unofficialSourceIds: unofficial } : {}), ...(supersessions.length > 0 ? { supersessions } : {}) });
    contests.push(...stateContests);
  }
  contests.sort((left, right) => byteCompare(left.contestId, right.contestId));
  const unsigned = {
    schema: "state-primary-results-2026-v1" as const, version: 1 as const,
    methodology: { source: "official_state_election_authority_returns_per_state" as const, winnerInference: false as const, unopposed: "nominee_named_by_official_candidate_list_when_the_state_prints_no_contest" as const },
    sourceIds: adapters.flatMap((adapter) => adapter.sources.map((source) => source.id)), states, contests,
    summary: { states: states.length, contests: contests.length, byOffice: countByOffice(contests) },
    rowSetSha256: hash("dsa-seats:state-primary-contest-set-2026:v1", contests),
  };
  return { ...unsigned, packageSha256: hash(PACKAGE_DOMAIN, unsigned) };
}

export function readStatePrimaryResults2026(root = process.cwd(), lock: SourceLock = readSourceLock(root)): StatePrimaryResults2026 {
  const { value } = readPinnedPackage<StatePrimaryResults2026>(lock, STATE_PRIMARY_RESULTS_2026.id, PACKAGE_DOMAIN, root);
  if (value.schema !== "state-primary-results-2026-v1" || value.version !== 1 || value.methodology.winnerInference !== false || value.contests.length !== value.summary.contests) fail("PINNED_INVALID");
  return value;
}
