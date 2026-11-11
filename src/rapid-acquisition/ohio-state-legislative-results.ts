import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";

const SOURCES = [
  {
    year: 2024 as const,
    date: "2024-03-19" as const,
    id: "oh-2024-march-primary-democratic-summary",
    url: "https://publicfiles.ohiosos.gov/election-results/past-elections/2024/Primary%20Election%3A%20March%2019%2C%202024/group1/summary-level-official-results-primary-2024---democratic.xlsx",
    path: "data/source/elections/primary-results/ohio/2024/march-19-democratic-summary.xlsx",
    bytes: 156_100,
    sha256: "94b4ec212bc03bd90d8fe9f0acedac591affbe91a71aa02d63c73e703660ed64",
    title: "March 19, 2024 Presidential Primary Election Official Canvass",
    contests: 108,
    candidates: 137,
    votes: 621_192,
    parentIds: ["oh-election-results-files-index-20260806"],
  },
  {
    year: 2026 as const,
    date: "2026-05-05" as const,
    id: "oh-2026-may-primary-democratic-summary",
    url: "https://publicfiles.ohiosos.gov/election-results/past-elections/2026/Primary%2BSpecial%20Election%20-%20May%205%2C%202026/group1/summary-level-official-results-2026-primary---democratic.xlsx",
    path: "data/source/elections/primary-results/ohio/2026/may-05-democratic-summary.xlsx",
    bytes: 261_632,
    sha256: "d29da75827f0375a92e26a934e37e742a6cb46c1c5638912246312b0a0293118",
    title: "May 5, 2026 Primary/Special Election Official Canvass",
    contests: 113,
    candidates: 145,
    votes: 1_011_657,
    parentIds: ["oh-election-results-files-index-20260806"],
  },
] as const;

type Chamber = "state_house" | "state_senate";
type Candidate = Readonly<{
  sourceName: string;
  candidacyKind: "named_candidate" | "named_write_in";
  votes: number;
}>;

export interface OhioStateLegislativeContest {
  readonly contestId: string;
  readonly cycleYear: 2024 | 2026;
  readonly electionDate: "2024-03-19" | "2026-05-05";
  readonly chamber: Chamber;
  readonly districtCode: string;
  readonly rawOfficeTitle: string;
  readonly rawParty: "DEM";
  readonly candidates: readonly Candidate[];
  readonly totalVotes: number;
  readonly sourceCountyRows: 88;
  readonly voteReconciliation: "candidate_totals_equal_sum_of_88_county_rows";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly resultAuthorityStatus: "secretary_official_canvass_workbook";
  readonly certificationStatus: "official_canvass_workbook_separate_certificate_not_retained";
  readonly currentHolderIdentity: null;
  readonly formulaEligible: false;
  readonly formulaIneligibleReasons: readonly [
    "state_legislative_formula_not_defined",
    "current_holder_identity_not_collected",
    "republican_primary_source_not_retained",
  ];
  readonly sourceLockIds: readonly string[];
  readonly contestSha256: string;
}

type CycleSummary = Readonly<{
  cycleYear: 2024 | 2026;
  electionDate: "2024-03-19" | "2026-05-05";
  reportedPartyContests: number;
  candidateRows: number;
  candidateVotes: number;
  sourceCountyRows: 88;
}>;

export interface OhioStateLegislativeResults {
  readonly schema: "rapid-ohio-state-legislative-democratic-primary-results-v1";
  readonly version: 1;
  readonly authority: "official_ohio_secretary_democratic_canvass_workbooks";
  readonly limitations: readonly [
    "republican_summary_workbooks_not_retained",
    "ohio_2022_state_legislative_primary_workbooks_not_retained",
    "source_plurality_does_not_create_winner_or_nomination_inference",
  ];
  readonly cycles: readonly CycleSummary[];
  readonly contests: readonly OhioStateLegislativeContest[];
  readonly summary: Readonly<{
    cycles: 2;
    reportedPartyContests: 221;
    stateSenateContests: 31;
    stateHouseContests: 190;
    candidateRows: 282;
    candidateVotes: 1_632_849;
    contestedContests: 42;
    namedWriteInCandidates: 17;
    republicanCyclesRetained: 0;
    formulaEligibleContests: 0;
  }>;
  readonly contestSetSha256: string;
  readonly packageSha256: string;
}

const cmp = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : `{${Object.keys(value as object)
          .sort(cmp)
          .map(
            (key) =>
              `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
          )
          .join(",")}}`;
const hash = (domain: string, value: unknown) =>
  createHash("sha256")
    .update(`${domain}\0${canonical(value)}`)
    .digest("hex");
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const fail = (code: string): never => {
  throw new Error(`OHIO_STATE_LEGISLATIVE_${code}`);
};
const decode = (value: string): string =>
  value
    .split("&lt;")
    .join("<")
    .split("&gt;")
    .join(">")
    .split("&quot;")
    .join('"')
    .split("&apos;")
    .join("'")
    .split("&amp;")
    .join("&")
    .replace(/&#(\d+);/g, (_match: string, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match: string, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
const textNodes = (xml: string): string =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decode(match[1]!))
    .join("");
const columnNumber = (reference: string): number => {
  const letters = reference.match(/^[A-Z]+/)?.[0];
  if (!letters) return fail("CELL_REFERENCE_INVALID");
  return [...letters].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
};
const cellReference = (column: number, row: number): string => {
  let name = "",
    current = column;
  while (current > 0) {
    current--;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return `${name}${row}`;
};
const integer = (value: string | undefined): number => {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value))
    return fail("INTEGER_INVALID");
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fail("INTEGER_INVALID");
};
const part = (files: Record<string, Uint8Array>, name: string): string => {
  const value = files[name] ?? files[`/${name}`];
  return value
    ? Buffer.from(value).toString("utf8")
    : fail(`WORKBOOK_PART_MISSING:${name}`);
};

function cellsFromWorkbook(bytes: Buffer): Map<string, string> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(bytes));
  } catch {
    return fail("XLSX_INVALID");
  }
  const workbook = part(files, "xl/workbook.xml"),
    relationships = part(files, "xl/_rels/workbook.xml.rels");
  const master = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)]
    .map((match) => match[1]!)
    .find((attributes) => /\bname="Master"/.test(attributes));
  const relationshipId = master?.match(/(?:\br:id|\bid)="([^"]+)"/)?.[1];
  const relationship = relationshipId
    ? [...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)]
        .map((match) => match[1]!)
        .find((attributes) => attributes.includes(`Id="${relationshipId}"`))
    : undefined;
  const target = relationship?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) return fail("MASTER_SHEET_MISSING");
  const sharedXml = files["xl/sharedStrings.xml"]
    ? part(files, "xl/sharedStrings.xml")
    : "";
  const shared = [
    ...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g),
  ].map((match) => textNodes(match[1]!));
  const sheetPath = target.startsWith("/")
    ? target.slice(1)
    : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = part(files, sheetPath),
    cells = new Map<string, string>();
  for (const match of sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1]!,
      body = match[2] ?? "",
      reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
    if (!reference) return fail("CELL_REFERENCE_INVALID");
    const type = attributes.match(/\bt="([^"]+)"/)?.[1],
      raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
    cells.set(
      reference,
      type === "s"
        ? (shared[integer(raw)] ?? fail("SHARED_STRING_INVALID"))
        : type === "inlineStr"
          ? textNodes(body)
          : raw === undefined
            ? ""
            : decode(raw),
    );
  }
  for (const merge of sheet.matchAll(
    /<mergeCell\b[^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"[^>]*\/?\s*>/g,
  )) {
    const value = cells.get(`${merge[1]}${merge[2]}`) ?? "";
    for (let row = Number(merge[2]); row <= Number(merge[4]); row++)
      for (
        let column = columnNumber(merge[1]!);
        column <= columnNumber(merge[3]!);
        column++
      )
        cells.set(cellReference(column, row), value);
  }
  return cells;
}

function parseSource(
  bytes: Buffer,
  source: (typeof SOURCES)[number],
): OhioStateLegislativeContest[] {
  const cells = cellsFromWorkbook(bytes);
  if (!(cells.get("A1") ?? "").startsWith(source.title))
    fail(`ELECTION_IDENTITY_INVALID:${source.year}`);
  const totalReference = [...cells.entries()].find(
    ([reference, value]) =>
      /^A\d+$/.test(reference) && value.trim() === "Total",
  )?.[0];
  const percentageReference = [...cells.entries()].find(
    ([reference, value]) =>
      /^A\d+$/.test(reference) && value.trim() === "Percentage",
  )?.[0];
  const totalRow = totalReference ? Number(totalReference.slice(1)) : 0,
    percentageRow = percentageReference
      ? Number(percentageReference.slice(1))
      : 0;
  if (!totalRow || percentageRow <= totalRow) fail("TOTAL_ROWS_INVALID");
  const maximumColumn = Math.max(...[...cells.keys()].map(columnNumber));
  const maximumRow = Math.max(
    ...[...cells.keys()].map((reference) =>
      Number(reference.match(/\d+$/)?.[0] ?? 0),
    ),
  );
  const grouped = new Map<
    string,
    {
      chamber: Chamber;
      districtCode: string;
      title: string;
      columns: number[];
      candidates: Omit<Candidate, "votes">[];
    }
  >();
  for (let column = 1; column <= maximumColumn; column++) {
    const title = (cells.get(cellReference(column, 1)) ?? "").trim(),
      match = title.match(
        /^State (Senator|Representative) - District (\d{1,3})$/,
      );
    if (!match) continue;
    const rawCandidate = (cells.get(cellReference(column, 2)) ?? "").trim();
    if (!rawCandidate.endsWith(" (D)")) fail("PARTY_LABEL_INVALID");
    let sourceName = rawCandidate.slice(0, -4).trim(),
      candidacyKind: Candidate["candidacyKind"] = "named_candidate";
    if (/\s+\(WI\)\*?$/.test(sourceName)) {
      sourceName = sourceName.replace(/\s+\(WI\)\*?$/, "").trim();
      candidacyKind = "named_write_in";
    }
    if (!sourceName) fail("CANDIDATE_NAME_INVALID");
    const chamber: Chamber =
        match[1] === "Senator" ? "state_senate" : "state_house",
      districtCode = match[2]!.padStart(3, "0"),
      key = `${chamber}:${districtCode}`;
    const group = grouped.get(key) ?? {
      chamber,
      districtCode,
      title,
      columns: [],
      candidates: [],
    };
    group.columns.push(column);
    group.candidates.push({ sourceName, candidacyKind });
    grouped.set(key, group);
  }
  const contests = [...grouped.values()]
    .map((group) => {
      const candidates = group.candidates.map((candidate, index) => ({
        ...candidate,
        votes: integer(
          cells.get(cellReference(group.columns[index]!, totalRow)),
        ),
      }));
      const countyRows: number[][] = [];
      for (let row = percentageRow + 1; row <= maximumRow; row++) {
        const county = (cells.get(cellReference(1, row)) ?? "").trim();
        if (!county) continue;
        countyRows.push(
          group.columns.map((column) => {
            const raw = cells.get(cellReference(column, row));
            return raw === undefined || raw === "" ? 0 : integer(raw);
          }),
        );
      }
      if (countyRows.length !== 88) fail("COUNTY_CLOSURE_INVALID");
      for (let index = 0; index < candidates.length; index++)
        if (
          candidates[index]!.votes !==
          countyRows.reduce((sum, row) => sum + row[index]!, 0)
        )
          fail("VOTE_RECONCILIATION_INVALID");
      const unsigned = {
        contestId: `oh:state-leg-primary:${source.year}:${group.chamber}:${group.districtCode}:democratic`,
        cycleYear: source.year,
        electionDate: source.date,
        chamber: group.chamber,
        districtCode: group.districtCode,
        rawOfficeTitle: group.title,
        rawParty: "DEM" as const,
        candidates,
        totalVotes: candidates.reduce(
          (sum, candidate) => sum + candidate.votes,
          0,
        ),
        sourceCountyRows: 88 as const,
        voteReconciliation:
          "candidate_totals_equal_sum_of_88_county_rows" as const,
        sourceWinnerStatus: "not_marked_by_source" as const,
        resultAuthorityStatus: "secretary_official_canvass_workbook" as const,
        certificationStatus:
          "official_canvass_workbook_separate_certificate_not_retained" as const,
        currentHolderIdentity: null,
        formulaEligible: false as const,
        formulaIneligibleReasons: [
          "state_legislative_formula_not_defined",
          "current_holder_identity_not_collected",
          "republican_primary_source_not_retained",
        ] as const,
        sourceLockIds: [source.id, "oh-election-results-files-index-20260806"],
      };
      return {
        ...unsigned,
        contestSha256: hash(
          "dsa-seats:rapid-ohio-state-legislative-contest:v1",
          unsigned,
        ),
      };
    })
    .sort(
      (left, right) =>
        cmp(left.chamber, right.chamber) ||
        cmp(left.districtCode, right.districtCode),
    );
  if (
    contests.length !== source.contests ||
    contests.reduce((sum, row) => sum + row.candidates.length, 0) !==
      source.candidates ||
    contests.reduce((sum, row) => sum + row.totalVotes, 0) !== source.votes
  )
    fail(`SOURCE_CLOSURE_INVALID:${source.year}`);
  return contests;
}

export function buildOhioStateLegislativeResults(
  root = process.cwd(),
): OhioStateLegislativeResults {
  const lock = JSON.parse(
    readFileSync(join(root, "data/source-lock.json"), "utf8"),
  ) as { entries?: readonly Record<string, unknown>[] };
  if (!Array.isArray(lock.entries)) fail("SOURCE_LOCK_INVALID");
  const entries = lock.entries ?? fail("SOURCE_LOCK_INVALID");
  const contests: OhioStateLegislativeContest[] = [],
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
        kind: "official_statewide_canvass_result",
        parentIds: source.parentIds,
      };
    const matches = entries.filter((entry) => entry.id === source.id);
    if (
      bytes.length !== source.bytes ||
      sha(bytes) !== source.sha256 ||
      matches.length !== 1 ||
      canonical(sourceLockContent(matches[0])) !== canonical(expected)
    )
      fail(`SOURCE_INVALID:${source.year}`);
    const parsed = parseSource(bytes, source);
    contests.push(...parsed);
    cycles.push({
      cycleYear: source.year,
      electionDate: source.date,
      reportedPartyContests: parsed.length,
      candidateRows: parsed.reduce(
        (sum, row) => sum + row.candidates.length,
        0,
      ),
      candidateVotes: parsed.reduce((sum, row) => sum + row.totalVotes, 0),
      sourceCountyRows: 88,
    });
  }
  contests.sort(
    (left, right) =>
      left.cycleYear - right.cycleYear ||
      cmp(left.chamber, right.chamber) ||
      cmp(left.districtCode, right.districtCode),
  );
  const summary = {
    cycles: 2 as const,
    reportedPartyContests: 221 as const,
    stateSenateContests: 31 as const,
    stateHouseContests: 190 as const,
    candidateRows: 282 as const,
    candidateVotes: 1_632_849 as const,
    contestedContests: 42 as const,
    namedWriteInCandidates: 17 as const,
    republicanCyclesRetained: 0 as const,
    formulaEligibleContests: 0 as const,
  };
  const actual = {
    cycles: cycles.length,
    reportedPartyContests: contests.length,
    stateSenateContests: contests.filter(
      (row) => row.chamber === "state_senate",
    ).length,
    stateHouseContests: contests.filter((row) => row.chamber === "state_house")
      .length,
    candidateRows: contests.reduce(
      (sum, row) => sum + row.candidates.length,
      0,
    ),
    candidateVotes: contests.reduce((sum, row) => sum + row.totalVotes, 0),
    contestedContests: contests.filter((row) => row.candidates.length > 1)
      .length,
    namedWriteInCandidates: contests
      .flatMap((row) => row.candidates)
      .filter((row) => row.candidacyKind === "named_write_in").length,
    republicanCyclesRetained: 0,
    formulaEligibleContests: 0,
  };
  if (canonical(actual) !== canonical(summary)) fail("SUMMARY_INVALID");
  const limitations = [
    "republican_summary_workbooks_not_retained",
    "ohio_2022_state_legislative_primary_workbooks_not_retained",
    "source_plurality_does_not_create_winner_or_nomination_inference",
  ] as const;
  const contestSetSha256 = hash(
    "dsa-seats:rapid-ohio-state-legislative-contest-set:v1",
    contests.map(({ contestId, contestSha256 }) => ({
      contestId,
      contestSha256,
    })),
  );
  const unsigned = {
    schema:
      "rapid-ohio-state-legislative-democratic-primary-results-v1" as const,
    version: 1 as const,
    authority: "official_ohio_secretary_democratic_canvass_workbooks" as const,
    limitations,
    cycles,
    contests,
    summary,
    contestSetSha256,
  };
  return {
    ...unsigned,
    packageSha256: hash(
      "dsa-seats:rapid-ohio-state-legislative-package:v1",
      unsigned,
    ),
  };
}

export function validateOhioStateLegislativeResults(
  value: unknown,
  root = process.cwd(),
): OhioStateLegislativeResults {
  const expected = buildOhioStateLegislativeResults(root);
  if (canonical(value) !== canonical(expected))
    throw new Error("OHIO_STATE_LEGISLATIVE_RESULTS_INVALID");
  return value as OhioStateLegislativeResults;
}
