import { byteCompare, exact, hash } from "../shared";
import {
  readRetainedSource,
  readSourceLock,
  type SourceLock,
} from "./source-lock";

/**
 * Generic state and local election-result intake.
 *
 * A state contributes an `IntakeSpec`: the retained source ids, one parse
 * function that turns source bytes into normalised contests, and optional
 * closure expectations. Everything else (source-lock verification, invariant
 * checks, per-cycle and package summaries, hashing, validation) is shared.
 *
 * Contests never carry winner, holder identity, or formula eligibility. Those
 * fields are fixed here so a spec cannot escalate them by accident.
 */

export type CandidacyKind =
  | "named_candidate"
  | "named_write_in"
  | "unnamed_write_in"
  | "uncommitted";

export type OfficeLevel =
  | "state_legislative"
  | "county"
  | "municipal"
  | "school_board"
  | "judicial"
  | "other_local";

export interface IntakeCandidate {
  readonly sourceName: string;
  /** Candidate party in mixed-party general contests; never inferred from names. */
  readonly rawParty?: string;
  readonly candidacyKind: CandidacyKind;
  readonly votes: number;
  /** Source-native key when the export supplies one; otherwise omitted. */
  readonly sourceCandidateKey?: string;
}

/** What a spec's `parse` returns for one contest. */
export interface ParsedContest {
  /** Source vote-for rule, including multi-seat contests. */
  readonly seats?: number;
  /** Reporting counties contributing to a cross-county contest. */
  readonly reportingJurisdictions?: readonly string[];
  readonly officeLevel: OfficeLevel;
  /** Normalised office slug, e.g. `state_house`, `county_sheriff`. */
  readonly office: string;
  /** Zero-padded district or null for at-large offices. */
  readonly districtCode: string | null;
  /** County, municipality, or other jurisdiction label when relevant. */
  readonly jurisdiction: string | null;
  readonly rawOfficeTitle: string;
  readonly rawParty: string;
  readonly candidates: readonly IntakeCandidate[];
  /** Optional description of the reconciliation the parser performed. */
  readonly reconciliation?: string;
  /** Optional per-contest source caveats, kept verbatim in the artifact. */
  readonly notes?: readonly string[];
}

export interface IntakeContest extends ParsedContest {
  readonly contestId: string;
  readonly cycleYear: number;
  readonly electionDate: string;
  readonly totalVotes: number;
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly currentHolderIdentity: null;
  readonly formulaEligible: false;
  readonly sourceLockIds: readonly string[];
  readonly contestSha256: string;
}

export interface IntakeSource {
  /** Source-lock id of the retained bytes. */
  readonly lockId: string;
  readonly cycleYear: number;
  readonly electionDate: string;
  /** Extra lock ids (indexes, manifests) that justify this source. */
  readonly authorityLockIds?: readonly string[];
  /**
   * Optional closure counts. Set them after the first build so a source
   * re-fetch that silently changes the file fails loudly.
   */
  readonly expect?: Readonly<{
    contests?: number;
    candidateRows?: number;
    candidateVotes?: number;
  }>;
  /**
   * Optional download descriptor for `rapid:intake retain`. `outputPath` is
   * relative to `data/source/rapid/`.
   */
  readonly download?: Readonly<{
    url: string;
    outputPath: string;
    kind?: string;
    allowedFinalUrl?: string;
    /**
     * For PDF sources: also retain a `pdftotext` extract under `extract.lockId`
     * (path = outputPath + "-layout.txt" or "-words.tsv"), pinned as a
     * derived_extract whose parent is this source. Specs parse the extract.
     */
    extract?: Readonly<{ mode: "layout" | "tsv"; lockId: string }>;
  }>;
}

export interface IntakeSpec {
  /** Artifact id, also the metadata filename stem. */
  readonly id: string;
  readonly version: number;
  /** USPS state code. */
  readonly state: string;
  readonly label: string;
  readonly scope: string;
  readonly authority: string;
  readonly limitations: readonly string[];
  readonly sources: readonly IntakeSource[];
  readonly parse: (
    bytes: Buffer,
    source: IntakeSource,
    tools: Readonly<{ fail: (code: string) => never }>,
  ) => readonly ParsedContest[];
  readonly expect?: Readonly<{
    contests?: number;
    candidateRows?: number;
    candidateVotes?: number;
  }>;
}

export interface IntakeCycleSummary {
  readonly cycleYear: number;
  readonly electionDate: string;
  readonly sourceLockIds: readonly string[];
  readonly contests: number;
  readonly candidateRows: number;
  readonly candidateVotes: number;
}

export interface IntakeSummary {
  readonly cycles: number;
  readonly contests: number;
  readonly candidateRows: number;
  readonly candidateVotes: number;
  readonly contestedContests: number;
  readonly writeInCandidates: number;
  readonly contestsByOffice: Readonly<Record<string, number>>;
  readonly contestsByParty: Readonly<Record<string, number>>;
  readonly formulaEligibleContests: 0;
}

export interface IntakePackage {
  readonly schema: "rapid-local-context-intake-v1";
  readonly artifactId: string;
  readonly version: number;
  readonly state: string;
  readonly label: string;
  readonly scope: string;
  readonly authority: string;
  readonly limitations: readonly string[];
  readonly releaseRelationship: "separate_rapid_acquisition_excluded_from_released_score";
  readonly cycles: readonly IntakeCycleSummary[];
  readonly contests: readonly IntakeContest[];
  readonly summary: IntakeSummary;
  readonly contestSetSha256: string;
  readonly packageSha256: string;
}

export const INTAKE_SUMMARY_KEYS = [
  "contests",
  "candidateRows",
  "candidateVotes",
  "contestedContests",
  "formulaEligibleContests",
] as const;

export const intakeArtifactPath = (spec: Pick<IntakeSpec, "id">): string =>
  `data/metadata/${spec.id}.json`;

export const intakeArtifactUrl = (spec: Pick<IntakeSpec, "id" | "version">) =>
  `urn:dsa-seats:${spec.id.replace(/-v\d+$/, "")}:v${spec.version}`;

const failFor =
  (spec: IntakeSpec) =>
  (code: string): never => {
    throw new Error(`INTAKE_${spec.state}_${code}`);
  };

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const checkExpectation = (
  fail: (code: string) => never,
  scope: string,
  expected: IntakeSource["expect"],
  actual: Readonly<{
    contests: number;
    candidateRows: number;
    candidateVotes: number;
  }>,
): void => {
  if (!expected) return;
  for (const key of ["contests", "candidateRows", "candidateVotes"] as const)
    if (expected[key] !== undefined && expected[key] !== actual[key])
      fail(`CLOSURE_INVALID:${scope}:${key}:${actual[key]}!=${expected[key]}`);
};

function signContest(
  spec: IntakeSpec,
  source: IntakeSource,
  parsed: ParsedContest,
  fail: (code: string) => never,
): IntakeContest {
  if (!parsed.candidates.length) fail("CANDIDATES_EMPTY");
  if (!parsed.rawOfficeTitle || !parsed.rawParty || !parsed.office)
    fail("CONTEST_LABELS_INVALID");
  if (parsed.seats !== undefined && (!Number.isSafeInteger(parsed.seats) || parsed.seats < 1))
    fail("SEATS_INVALID");
  for (const candidate of parsed.candidates) {
    if (!candidate.sourceName.trim()) fail("CANDIDATE_NAME_INVALID");
    if (!Number.isSafeInteger(candidate.votes) || candidate.votes < 0)
      fail("CANDIDATE_VOTES_INVALID");
  }
  const totalVotes = parsed.candidates.reduce(
    (sum, candidate) => sum + candidate.votes,
    0,
  );
  const scopeKey = [
    parsed.office,
    parsed.districtCode ?? "at-large",
    parsed.jurisdiction ? slug(parsed.jurisdiction) : null,
  ]
    .filter((part) => part !== null)
    .join(":");
  const unsigned = {
    contestId: `${spec.state.toLowerCase()}:${slug(spec.label)}:${source.cycleYear}:${scopeKey}:${slug(parsed.rawParty)}`,
    cycleYear: source.cycleYear,
    electionDate: source.electionDate,
    officeLevel: parsed.officeLevel,
    office: parsed.office,
    districtCode: parsed.districtCode,
    jurisdiction: parsed.jurisdiction,
    rawOfficeTitle: parsed.rawOfficeTitle,
    rawParty: parsed.rawParty,
    ...(parsed.seats !== undefined ? { seats: parsed.seats } : {}),
    ...(parsed.reportingJurisdictions ? { reportingJurisdictions: parsed.reportingJurisdictions } : {}),
    candidates: parsed.candidates,
    totalVotes,
    ...(parsed.reconciliation ? { reconciliation: parsed.reconciliation } : {}),
    ...(parsed.notes?.length ? { notes: parsed.notes } : {}),
    sourceWinnerStatus: "not_marked_by_source" as const,
    currentHolderIdentity: null,
    formulaEligible: false as const,
    sourceLockIds: [source.lockId, ...(source.authorityLockIds ?? [])],
  };
  return {
    ...unsigned,
    contestSha256: hash("dsa-seats:rapid-local-context-intake-contest:v1", unsigned),
  };
}

const orderContests = (left: IntakeContest, right: IntakeContest): number =>
  left.cycleYear - right.cycleYear ||
  byteCompare(left.office, right.office) ||
  byteCompare(left.districtCode ?? "", right.districtCode ?? "") ||
  byteCompare(left.jurisdiction ?? "", right.jurisdiction ?? "") ||
  byteCompare(left.rawParty, right.rawParty);

const countBy = (
  contests: readonly IntakeContest[],
  key: (contest: IntakeContest) => string,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const contest of contests) counts[key(contest)] = (counts[key(contest)] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => byteCompare(left, right)),
  );
};

export function buildIntakePackage(
  spec: IntakeSpec,
  root = process.cwd(),
  lock: SourceLock = readSourceLock(root),
): IntakePackage {
  const fail = failFor(spec);
  if (!/^rapid-[a-z0-9-]+-v\d+$/.test(spec.id)) fail("ARTIFACT_ID_INVALID");
  if (!/^[A-Z]{2}$/.test(spec.state)) fail("STATE_INVALID");
  if (!spec.sources.length) fail("SOURCES_EMPTY");
  const contests: IntakeContest[] = [];
  const cycles = new Map<string, IntakeCycleSummary>();
  for (const source of spec.sources) {
    const { bytes } = readRetainedSource(lock, source.lockId, root);
    for (const authorityId of source.authorityLockIds ?? [])
      readRetainedSource(lock, authorityId, root);
    const parsed = spec
      .parse(bytes, source, { fail })
      .map((contest) => signContest(spec, source, contest, fail));
    const totals = {
      contests: parsed.length,
      candidateRows: parsed.reduce((sum, row) => sum + row.candidates.length, 0),
      candidateVotes: parsed.reduce((sum, row) => sum + row.totalVotes, 0),
    };
    checkExpectation(fail, source.lockId, source.expect, totals);
    contests.push(...parsed);
    const cycleKey = `${source.cycleYear}:${source.electionDate}`;
    const prior = cycles.get(cycleKey);
    cycles.set(cycleKey, {
      cycleYear: source.cycleYear,
      electionDate: source.electionDate,
      sourceLockIds: [...(prior?.sourceLockIds ?? []), source.lockId],
      contests: (prior?.contests ?? 0) + totals.contests,
      candidateRows: (prior?.candidateRows ?? 0) + totals.candidateRows,
      candidateVotes: (prior?.candidateVotes ?? 0) + totals.candidateVotes,
    });
  }
  contests.sort(orderContests);
  const seen = new Set<string>();
  for (const contest of contests) {
    if (seen.has(contest.contestId))
      fail(`CONTEST_ID_DUPLICATE:${contest.contestId}`);
    seen.add(contest.contestId);
  }
  const summary: IntakeSummary = {
    cycles: cycles.size,
    contests: contests.length,
    candidateRows: contests.reduce((sum, row) => sum + row.candidates.length, 0),
    candidateVotes: contests.reduce((sum, row) => sum + row.totalVotes, 0),
    contestedContests: contests.filter((row) => row.candidates.length > 1).length,
    writeInCandidates: contests
      .flatMap((row) => row.candidates)
      .filter((row) => row.candidacyKind.endsWith("_write_in")).length,
    contestsByOffice: countBy(contests, (row) => row.office),
    contestsByParty: countBy(contests, (row) => row.rawParty),
    formulaEligibleContests: 0,
  };
  checkExpectation(fail, "package", spec.expect, summary);
  const contestSetSha256 = hash(
    "dsa-seats:rapid-local-context-intake-contest-set:v1",
    contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })),
  );
  const unsigned = {
    schema: "rapid-local-context-intake-v1" as const,
    artifactId: spec.id,
    version: spec.version,
    state: spec.state,
    label: spec.label,
    scope: spec.scope,
    authority: spec.authority,
    limitations: spec.limitations,
    releaseRelationship:
      "separate_rapid_acquisition_excluded_from_released_score" as const,
    cycles: [...cycles.values()].sort(
      (left, right) =>
        left.cycleYear - right.cycleYear ||
        byteCompare(left.electionDate, right.electionDate),
    ),
    contests,
    summary,
    contestSetSha256,
  };
  return {
    ...unsigned,
    packageSha256: hash("dsa-seats:rapid-local-context-intake-package:v1", unsigned),
  };
}

/** Full rebuild-and-compare validation, as the legacy per-state modules do. */
export function validateIntakePackage(
  spec: IntakeSpec,
  value: unknown,
  root = process.cwd(),
): IntakePackage {
  const expected = buildIntakePackage(spec, root);
  if (!exact(value, expected)) throw new Error(`INTAKE_${spec.state}_PACKAGE_INVALID`);
  return value as IntakePackage;
}

/** Source-lock ids an artifact depends on, for its own lock entry. */
export const intakeParentIds = (spec: IntakeSpec): string[] => [
  ...new Set(
    spec.sources.flatMap((source) => [
      source.lockId,
      ...(source.authorityLockIds ?? []),
    ]),
  ),
];

export const serializeIntakePackage = (value: IntakePackage): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
