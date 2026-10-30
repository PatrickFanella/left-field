import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCES = [
  {
    year: 2022 as const,
    date: "2022-06-07" as const,
    id: "nm-2022-primary-county-results-csv",
    authorityId: "nm-2022-election-results-archive",
    url: "https://electionresults.sos.nm.gov/resultsCSV.aspx?text=All&type=CTY&map=CTY&eid=2827",
    path: "data/source/rapid/county-office/nm/2022/county-results.csv",
    bytes: 41053,
    sha256: "b624b7021f74775fd1d098c2d4d0285695cd6bb77f51b5d309f2b07c07650f28",
    sourceContests: 206,
    sourceRows: 350,
    sourceVotes: 644874,
    retainedContests: 201,
    retainedRows: 325,
    retainedVotes: 625250,
    quarantinedContests: 5,
    quarantinedRows: 25,
    quarantinedVotes: 19624,
    certification:
      "official_results_archive_retained_no_separate_signed_certificate" as const,
  },
  {
    year: 2024 as const,
    date: "2024-06-04" as const,
    id: "nm-2024-primary-county-results-csv",
    authorityId: "nm-2024-primary-certification-announcement",
    url: "https://electionresults.sos.nm.gov/resultsCSV.aspx?text=All&type=CTY&map=CTY&eid=2878",
    path: "data/source/rapid/county-office/nm/2024/county-results.csv",
    bytes: 34476,
    sha256: "84627dda5e6e37d02906eb39228cc63bbf1a1e1aefa183fb6ca290516d8b4063",
    sourceContests: 173,
    sourceRows: 254,
    sourceVotes: 474778,
    retainedContests: 170,
    retainedRows: 239,
    retainedVotes: 463197,
    quarantinedContests: 3,
    quarantinedRows: 15,
    quarantinedVotes: 11581,
    certification:
      "state_canvass_certification_announcement_retained_exact_certificate_bytes_not_retained" as const,
  },
  {
    year: 2026 as const,
    date: "2026-06-02" as const,
    id: "nm-2026-primary-county-results-csv",
    authorityId: "nm-2026-primary-certification-announcement",
    url: "https://electionresults.sos.nm.gov/resultsCSV.aspx?text=All&type=CTY&map=CTY",
    path: "data/source/rapid/county-office/nm/2026/county-results.csv",
    bytes: 48450,
    sha256: "fd48137016daea1fe245fcdb4e90d8ca61ba414029b3b5467cb2159e28b7bd4b",
    sourceContests: 210,
    sourceRows: 362,
    sourceVotes: 878901,
    retainedContests: 210,
    retainedRows: 362,
    retainedVotes: 878901,
    quarantinedContests: 0,
    quarantinedRows: 0,
    quarantinedVotes: 0,
    certification:
      "state_canvass_certification_announcement_retained_exact_certificate_bytes_not_retained" as const,
  },
] as const;
const COUNTY_SOURCE = {
  id: "rapid-county-demographics-projection-v1",
  path: "data/metadata/rapid-county-demographics-projection-v1.json",
  bytes: 2441846,
  sha256: "ebbeb1127151a78985e97a7971d580edd637f746b63b6845353c63407989c8fc",
  packageSha256:
    "f3285added7c4fcc1ef713c1a279bec90f918e12204ef184fb085895395cfceb",
} as const;
type OfficeFamily =
  | "county_assessor"
  | "county_clerk"
  | "county_commissioner"
  | "county_sheriff"
  | "county_treasurer"
  | "probate_judge";
type RawParty = "DEM" | "REP" | "LIB";
type Candidate = Readonly<{
  sourceCandidateId: string;
  sourceName: string;
  votes: number;
  voteComponents: Readonly<{
    absentee: number;
    electionDay: number;
    early: number;
  }> | null;
}>;
export interface NewMexicoCountyOfficeContest {
  readonly contestId: string;
  readonly cycleYear: 2022 | 2024 | 2026;
  readonly electionDate: "2022-06-07" | "2024-06-04" | "2026-06-02";
  readonly countyFips: string;
  readonly countyName: string;
  readonly officeFamily: OfficeFamily;
  readonly sourceRaceId: string;
  readonly rawOfficeTitle: string;
  readonly rawArea: string;
  readonly seats: number;
  readonly rawParty: RawParty;
  readonly candidates: readonly Candidate[];
  readonly totalVotes: number;
  readonly precinctReportingStatus: "all_source_precincts_reporting";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "secretary_official_county_results_export_retained";
  readonly certificationStatus: (typeof SOURCES)[number]["certification"];
  readonly currentHolderIdentity: null;
  readonly formulaEligible: false;
  readonly formulaIneligibleReasons: readonly [
    "local_office_formula_not_defined",
    "current_holder_identity_not_collected",
  ];
  readonly sourceLockIds: readonly string[];
  readonly contestSha256: string;
}
export interface NewMexicoCountyOfficeQuarantine {
  readonly cycleYear: 2022 | 2024 | 2026;
  readonly countyFips: string;
  readonly countyName: string;
  readonly sourceRaceId: string;
  readonly rawOfficeTitle: string;
  readonly rawArea: string;
  readonly rawParty: RawParty;
  readonly sourceObservationRows: number;
  readonly duplicatedSourceCandidateIds: readonly string[];
  readonly sourceVoteObservationSum: number;
  readonly reason: "duplicate_candidate_ids_with_conflicting_source_projection_semantics";
  readonly sourceLockIds: readonly string[];
}
type CycleSummary = Readonly<{
  cycleYear: 2022 | 2024 | 2026;
  sourceContests: number;
  sourceObservationRows: number;
  sourceVoteObservationSum: number;
  retainedContests: number;
  retainedCandidateRows: number;
  retainedCandidateVotes: number;
  quarantinedContests: number;
  quarantinedObservationRows: number;
  quarantinedVoteObservationSum: number;
}>;
export interface NewMexicoCountyOfficeResults {
  readonly schema: "rapid-new-mexico-county-office-primary-results-v1";
  readonly version: 1;
  readonly authority: "official_new_mexico_secretary_county_results_exports";
  readonly contests: readonly NewMexicoCountyOfficeContest[];
  readonly quarantines: readonly NewMexicoCountyOfficeQuarantine[];
  readonly cycles: readonly CycleSummary[];
  readonly summary: Readonly<{
    officeFamilies: 6;
    officeContests: 581;
    democraticContests: 271;
    republicanContests: 302;
    libertarianContests: 8;
    candidateRows: 926;
    candidateVotes: 1967348;
    quarantinedContests: 8;
    quarantinedObservationRows: 40;
    quarantinedVoteObservationSum: 31205;
    formulaEligibleContests: 0;
  }>;
  readonly contestSetSha256: string;
  readonly packageSha256: string;
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0),
  canonical = (v: unknown): string =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? `[${v.map(canonical).join(",")}]`
        : `{${Object.keys(v as object)
            .sort(cmp)
            .map(
              (k) =>
                `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
            )
            .join(",")}}`,
  hash = (d: string, v: unknown) =>
    createHash("sha256")
      .update(`${d}\0${canonical(v)}`)
      .digest("hex"),
  sha = (v: Buffer) => createHash("sha256").update(v).digest("hex"),
  fail = (code: string): never => {
    throw new Error(`NEW_MEXICO_COUNTY_OFFICE_${code}`);
  };
const integer = (v: string) =>
  /^\d+$/.test(v) && Number.isSafeInteger(Number(v))
    ? Number(v)
    : fail("INTEGER_INVALID");
const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/ COUNTY$/, "")
    .replace(/[^A-Z0-9]/g, "");
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quote = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quote = false;
      else field += c;
    } else if (c === '"') quote = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quote) fail("CSV_QUOTE_INVALID");
  return rows;
}
function family(title: string): OfficeFamily {
  if (title.startsWith("County Assessor")) return "county_assessor";
  if (title.startsWith("County Clerk")) return "county_clerk";
  if (title.startsWith("County Commissioner")) return "county_commissioner";
  if (title.startsWith("County Sheriff")) return "county_sheriff";
  if (title.startsWith("County Treasurer")) return "county_treasurer";
  if (title.startsWith("Probate Judge")) return "probate_judge";
  return fail("OFFICE_FAMILY_INVALID");
}
type Group = {
  countyFips: string;
  countyName: string;
  officeFamily: OfficeFamily;
  raceId: string;
  title: string;
  area: string;
  seats: number;
  party: RawParty;
  precincts: string;
  candidates: Candidate[];
};
function parseSource(
  bytes: Buffer,
  source: (typeof SOURCES)[number],
  counties: ReadonlyMap<string, { fips: string; name: string }>,
): {
  contests: NewMexicoCountyOfficeContest[];
  quarantines: NewMexicoCountyOfficeQuarantine[];
} {
  const rows = parseCsv(bytes.toString("utf8")),
    header = [
      "RaceID",
      "RaceName",
      "PartyCode",
      "AreaNum",
      "CandidateID",
      "CandidateName",
      "VoteFor",
      "CandidateVotes",
      "CandidatePercentage",
      "PrecinctsReporting",
      "CandidateAbsenteeVotes",
      "CandidateElectionDayVotes",
      "CandidateEarlyVotes",
    ];
  if (canonical(rows[0]) !== canonical(header))
    fail(`HEADER_INVALID:${source.year}`);
  const groups = new Map<string, Group>();
  for (const raw of rows.slice(1)) {
    if (!raw[0]) continue;
    if (raw.length === header.length + 1 && raw.at(-1) === "") raw.pop();
    if (raw.length !== header.length) fail(`ROW_WIDTH_INVALID:${source.year}`);
    const row = Object.fromEntries(header.map((key, i) => [key, raw[i]!])),
      tokens = row.RaceName.split(" - "),
      matches = tokens.map(norm).filter((token) => counties.has(token));
    if (!matches.length) fail(`COUNTY_INVALID:${source.year}:${row.RaceName}`);
    const county = counties.get(matches.at(-1)!)!,
      party = row.PartyCode as RawParty;
    if (!["DEM", "REP", "LIB"].includes(party))
      fail(`PARTY_INVALID:${source.year}`);
    const reporting = row.PrecinctsReporting.match(/^(\d+)\/(\d+)$/);
    if (!reporting || reporting[1] !== reporting[2])
      fail(`REPORTING_INVALID:${source.year}`);
    const votes = integer(row.CandidateVotes),
      componentRaw = [
        row.CandidateAbsenteeVotes,
        row.CandidateElectionDayVotes,
        row.CandidateEarlyVotes,
      ],
      voteComponents = componentRaw.every((v) => v === "")
        ? null
        : (() => {
            if (!componentRaw.every((v) => /^\d+$/.test(v)))
              return fail(`COMPONENT_INVALID:${source.year}`);
            const [absentee, electionDay, early] = componentRaw.map(integer);
            if (absentee! + electionDay! + early! !== votes)
              fail(`COMPONENT_SUM_INVALID:${source.year}`);
            return {
              absentee: absentee!,
              electionDay: electionDay!,
              early: early!,
            };
          })();
    if (!row.CandidateName || !/^\d+$/.test(row.CandidateID))
      fail(`CANDIDATE_INVALID:${source.year}`);
    const key = `${row.RaceID}:${party}:${row.AreaNum}`,
      existing = groups.get(key),
      next = existing ?? {
        countyFips: county.fips,
        countyName: county.name,
        officeFamily: family(row.RaceName),
        raceId: row.RaceID,
        title: row.RaceName,
        area: row.AreaNum,
        seats: integer(row.VoteFor),
        party,
        precincts: row.PrecinctsReporting,
        candidates: [],
      };
    if (
      next.countyFips !== county.fips ||
      next.title !== row.RaceName ||
      next.area !== row.AreaNum ||
      next.party !== party ||
      next.precincts !== row.PrecinctsReporting
    )
      fail(`CONTEST_IDENTITY_INVALID:${source.year}`);
    next.candidates.push({
      sourceCandidateId: row.CandidateID,
      sourceName: row.CandidateName,
      votes,
      voteComponents,
    });
    groups.set(key, next);
  }
  const quarantines: NewMexicoCountyOfficeQuarantine[] = [],
    retained = [...groups.values()].filter((group) => {
      const counts = new Map<string, number>();
      for (const row of group.candidates)
        counts.set(
          row.sourceCandidateId,
          (counts.get(row.sourceCandidateId) ?? 0) + 1,
        );
      const duplicates = [...counts]
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
        .sort((a, b) => Number(a) - Number(b));
      if (!duplicates.length) return true;
      quarantines.push({
        cycleYear: source.year,
        countyFips: group.countyFips,
        countyName: group.countyName,
        sourceRaceId: group.raceId,
        rawOfficeTitle: group.title,
        rawArea: group.area,
        rawParty: group.party,
        sourceObservationRows: group.candidates.length,
        duplicatedSourceCandidateIds: duplicates,
        sourceVoteObservationSum: group.candidates.reduce(
          (sum, row) => sum + row.votes,
          0,
        ),
        reason:
          "duplicate_candidate_ids_with_conflicting_source_projection_semantics",
        sourceLockIds: [source.id, source.authorityId, COUNTY_SOURCE.id],
      });
      return false;
    });
  quarantines.sort(
    (a, b) =>
      cmp(a.countyFips, b.countyFips) ||
      cmp(a.sourceRaceId, b.sourceRaceId) ||
      cmp(a.rawParty, b.rawParty),
  );
  const contests = retained
    .map((group) => {
      const candidates = group.candidates.sort(
          (a, b) => Number(a.sourceCandidateId) - Number(b.sourceCandidateId),
        ),
        unsigned = {
          contestId: `nm:county-primary:${source.year}:${group.countyFips}:${group.raceId}:${group.party}:${group.area || "countywide"}`,
          cycleYear: source.year,
          electionDate: source.date,
          countyFips: group.countyFips,
          countyName: group.countyName,
          officeFamily: group.officeFamily,
          sourceRaceId: group.raceId,
          rawOfficeTitle: group.title,
          rawArea: group.area,
          seats: group.seats,
          rawParty: group.party,
          candidates,
          totalVotes: candidates.reduce((sum, row) => sum + row.votes, 0),
          precinctReportingStatus: "all_source_precincts_reporting" as const,
          sourceWinnerStatus: "not_marked_by_source" as const,
          resultAuthorityStatus:
            "secretary_official_county_results_export_retained" as const,
          certificationStatus: source.certification,
          currentHolderIdentity: null,
          formulaEligible: false as const,
          formulaIneligibleReasons: [
            "local_office_formula_not_defined",
            "current_holder_identity_not_collected",
          ] as const,
          sourceLockIds: [source.id, source.authorityId, COUNTY_SOURCE.id],
        };
      return {
        ...unsigned,
        contestSha256: hash(
          "dsa-seats:rapid-new-mexico-county-office-contest:v1",
          unsigned,
        ),
      };
    })
    .sort(
      (a, b) =>
        cmp(a.countyFips, b.countyFips) ||
        cmp(a.officeFamily, b.officeFamily) ||
        cmp(a.sourceRaceId, b.sourceRaceId) ||
        cmp(a.rawParty, b.rawParty),
    );
  const rawRows =
      contests.reduce((s, r) => s + r.candidates.length, 0) +
      quarantines.reduce((s, r) => s + r.sourceObservationRows, 0),
    rawVotes =
      contests.reduce((s, r) => s + r.totalVotes, 0) +
      quarantines.reduce((s, r) => s + r.sourceVoteObservationSum, 0);
  if (
    groups.size !== source.sourceContests ||
    rawRows !== source.sourceRows ||
    rawVotes !== source.sourceVotes ||
    contests.length !== source.retainedContests ||
    contests.reduce((s, r) => s + r.candidates.length, 0) !==
      source.retainedRows ||
    contests.reduce((s, r) => s + r.totalVotes, 0) !== source.retainedVotes ||
    quarantines.length !== source.quarantinedContests ||
    quarantines.reduce((s, r) => s + r.sourceObservationRows, 0) !==
      source.quarantinedRows ||
    quarantines.reduce((s, r) => s + r.sourceVoteObservationSum, 0) !==
      source.quarantinedVotes
  )
    fail(`CYCLE_CLOSURE_INVALID:${source.year}`);
  return { contests, quarantines };
}
export function buildNewMexicoCountyOfficeResults(
  root = process.cwd(),
): NewMexicoCountyOfficeResults {
  const lock = JSON.parse(
      readFileSync(join(root, "data/source-lock.json"), "utf8"),
    ) as { entries: readonly Record<string, unknown>[] },
    countyBytes = readFileSync(join(root, COUNTY_SOURCE.path)),
    countyData = JSON.parse(countyBytes.toString("utf8")) as {
      packageSha256?: unknown;
      rows?: readonly {
        stateCode?: unknown;
        countyFips?: unknown;
        countyName?: unknown;
      }[];
    };
  if (
    countyBytes.length !== COUNTY_SOURCE.bytes ||
    sha(countyBytes) !== COUNTY_SOURCE.sha256 ||
    countyData.packageSha256 !== COUNTY_SOURCE.packageSha256 ||
    !Array.isArray(countyData.rows)
  )
    fail("COUNTY_SOURCE_INVALID");
  const countyRows = countyData.rows as readonly {
      stateCode?: unknown;
      countyFips?: unknown;
      countyName?: unknown;
    }[],
    counties = new Map<string, { fips: string; name: string }>();
  for (const row of countyRows)
    if (row.stateCode === "NM") {
      if (
        typeof row.countyFips !== "string" ||
        typeof row.countyName !== "string"
      )
        fail("COUNTY_ROW_INVALID");
      const fips = row.countyFips as string,
        name = row.countyName as string;
      counties.set(norm(name), { fips, name });
    }
  if (counties.size !== 33) fail("COUNTY_CLOSURE_INVALID");
  const contests: NewMexicoCountyOfficeContest[] = [],
    quarantines: NewMexicoCountyOfficeQuarantine[] = [],
    cycles: CycleSummary[] = [];
  for (const source of SOURCES) {
    const bytes = readFileSync(join(root, source.path)),
      expected = {
        id: source.id,
        url: source.url,
        retainedPath: source.path,
        retainedStatus: "retained",
        byteSize: source.bytes,
        sha256: source.sha256,
        kind: "source",
        parentIds: [source.authorityId],
      },
      matches = lock.entries.filter((row) => row.id === source.id);
    if (
      bytes.length !== source.bytes ||
      sha(bytes) !== source.sha256 ||
      matches.length !== 1 ||
      canonical(sourceLockContent(matches[0])) !== canonical(expected)
    )
      fail(`SOURCE_INVALID:${source.year}`);
    const parsed = parseSource(bytes, source, counties);
    contests.push(...parsed.contests);
    quarantines.push(...parsed.quarantines);
    cycles.push({
      cycleYear: source.year,
      sourceContests: source.sourceContests,
      sourceObservationRows: source.sourceRows,
      sourceVoteObservationSum: source.sourceVotes,
      retainedContests: source.retainedContests,
      retainedCandidateRows: source.retainedRows,
      retainedCandidateVotes: source.retainedVotes,
      quarantinedContests: source.quarantinedContests,
      quarantinedObservationRows: source.quarantinedRows,
      quarantinedVoteObservationSum: source.quarantinedVotes,
    });
  }
  contests.sort(
    (a, b) =>
      a.cycleYear - b.cycleYear ||
      cmp(a.countyFips, b.countyFips) ||
      cmp(a.officeFamily, b.officeFamily) ||
      cmp(a.sourceRaceId, b.sourceRaceId) ||
      cmp(a.rawParty, b.rawParty),
  );
  quarantines.sort(
    (a, b) =>
      a.cycleYear - b.cycleYear ||
      cmp(a.countyFips, b.countyFips) ||
      cmp(a.sourceRaceId, b.sourceRaceId) ||
      cmp(a.rawParty, b.rawParty),
  );
  const summary = {
      officeFamilies: 6 as const,
      officeContests: 581 as const,
      democraticContests: 271 as const,
      republicanContests: 302 as const,
      libertarianContests: 8 as const,
      candidateRows: 926 as const,
      candidateVotes: 1967348 as const,
      quarantinedContests: 8 as const,
      quarantinedObservationRows: 40 as const,
      quarantinedVoteObservationSum: 31205 as const,
      formulaEligibleContests: 0 as const,
    },
    actual = {
      officeFamilies: new Set(contests.map((r) => r.officeFamily)).size,
      officeContests: contests.length,
      democraticContests: contests.filter((r) => r.rawParty === "DEM").length,
      republicanContests: contests.filter((r) => r.rawParty === "REP").length,
      libertarianContests: contests.filter((r) => r.rawParty === "LIB").length,
      candidateRows: contests.reduce((s, r) => s + r.candidates.length, 0),
      candidateVotes: contests.reduce((s, r) => s + r.totalVotes, 0),
      quarantinedContests: quarantines.length,
      quarantinedObservationRows: quarantines.reduce(
        (s, r) => s + r.sourceObservationRows,
        0,
      ),
      quarantinedVoteObservationSum: quarantines.reduce(
        (s, r) => s + r.sourceVoteObservationSum,
        0,
      ),
      formulaEligibleContests: 0,
    };
  if (canonical(actual) !== canonical(summary)) fail("SUMMARY_INVALID");
  const contestSetSha256 = hash(
      "dsa-seats:rapid-new-mexico-county-office-contest-set:v1",
      contests,
    ),
    unsigned = {
      schema: "rapid-new-mexico-county-office-primary-results-v1" as const,
      version: 1 as const,
      authority:
        "official_new_mexico_secretary_county_results_exports" as const,
      contests,
      quarantines,
      cycles,
      summary,
      contestSetSha256,
    };
  return {
    ...unsigned,
    packageSha256: hash(
      "dsa-seats:rapid-new-mexico-county-office-package:v1",
      unsigned,
    ),
  };
}
export function validateNewMexicoCountyOfficeResults(
  value: unknown,
  root = process.cwd(),
): NewMexicoCountyOfficeResults {
  const expected = buildNewMexicoCountyOfficeResults(root);
  if (canonical(value) !== canonical(expected))
    throw new Error("NEW_MEXICO_COUNTY_OFFICE_RESULTS_INVALID");
  return value as NewMexicoCountyOfficeResults;
}
