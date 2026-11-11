import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";

export const CALIFORNIA_HOUSE_TOP_TWO_RESULTS_V1 = "california-house-top-two-results-2022-2026-v1" as const;
export const CALIFORNIA_HOUSE_TOP_TWO_CONTEST_SET_SHA256 = "39c1fce31143fad62a01704ed6238b5493e460a6317075b6135b112e47524eb8";
export const CALIFORNIA_HOUSE_TOP_TWO_PACKAGE_SHA256 = "554eaaa45f2fe80decbcb078579470e72e76673b2356c17bb8a6283af4460e72";

type CycleYear = 2022 | 2024 | 2026;
type SourceEntry = Readonly<{ id: string; url: string; retainedPath: string; retainedStatus: "retained"; byteSize: number; sha256: string; kind: string; parentIds: readonly string[] }>;
export type CaliforniaTopTwoInput = Readonly<{ entry: SourceEntry; bytes: Buffer | Uint8Array | string }>;
export type CaliforniaTopTwoParentInput = Readonly<{ value: unknown; fileSha256: string }>;
type Candidate = Readonly<{ candidateOrder: number; sourceCandidateName: string; partyPreference: "AI" | "DEM" | "GRN" | "LIB" | "NPP" | "PF" | "REP"; isWriteIn: boolean; sourceIncumbentMarker: boolean; votes: number; suppliedPercentTenths: number }>;
type Contest = Readonly<{
  contestId: string; contestSha256: string; cycleYear: CycleYear; electionDate: "2022-06-07" | "2024-03-05" | "2026-06-02";
  stateCode: "CA"; districtCode: string; office: "U.S. House of Representatives"; eventKind: "regular"; stage: "primary";
  nominationSystem: "top_two_open_primary"; partyFieldMeaning: "candidate_qualified_party_preference";
  formulaApplicability: "confirmed_incompatible_with_party_primary_metrics";
  certificationStatus: "certified_statement_of_vote" | "certified_statement_of_vote_with_cd16_recertification";
  sourceLockIds: readonly string[]; candidates: readonly Candidate[]; contestTotalVotes: number;
  sourceWinnerStatus: "not_marked_or_derived"; advancementStatus: "not_derived";
  currentIdentityStatus: "not_reviewed"; geographyStatus: "not_reviewed"; selectionStatus: "excluded_formula_incompatible";
  scoreEligible: false; evaluatorValues: Readonly<{ priorPrimaryMargin: null; priorDemocraticPrimaryVotes: null; priorProgressivePrimaryShare: null }>;
}>;

const EXPECTED = Object.freeze({
  "ca-2022-house-primary-sov-xlsx": ["https://elections.cdn.sos.ca.gov/sov/2022-primary/sov/86-congress.xlsx", "data/source/elections/primary-results/california/2022/house-statement-of-vote.xlsx", 33283, "c4a5ed1cea81cc88884122c9d787109263bb42630d97466f7b51d3d4125813e0", "source", []],
  "ca-2022-house-primary-sov-pdf": ["https://elections.cdn.sos.ca.gov/sov/2022-primary/sov/86-congress.pdf", "data/source/elections/primary-results/california/2022/house-statement-of-vote.pdf", 195011, "0ac1770a5d0afa0f29e5e8525e28f401fe1795e070eac3179e76c62a8bbe4ea0", "source", []],
  "ca-2022-primary-secretary-certificate": ["https://elections.cdn.sos.ca.gov/sov/2022-primary/ssov/certificate.pdf", "data/source/elections/primary-results/california/2022/secretary-certificate.pdf", 210247, "af936a5825a1aa9fd6de6912b9ae88008acfa9dee4a95a312025eab7e3180679", "source", []],
  "ca-2024-house-primary-sov-xlsx": ["https://elections.cdn.sos.ca.gov/sov/2024-primary/sov/79-us-rep-congress.xlsx", "data/source/elections/primary-results/california/2024/house-statement-of-vote.xlsx", 32488, "bf08e726fda50cb1b7f1ec83b7d7e0000d82bf215bc0d953b26aa77a6dde1a86", "source", []],
  "ca-2024-house-primary-sov-pdf": ["https://elections.cdn.sos.ca.gov/sov/2024-primary/sov/79-us-rep-congress.pdf", "data/source/elections/primary-results/california/2024/house-statement-of-vote.pdf", 197272, "e66700815a0c87ab1faa1509178a58a333707a5328a7da807ee3f05034c0a6aa", "source", []],
  "ca-2024-primary-secretary-certificate": ["https://elections.cdn.sos.ca.gov/sov/2024-primary/sov/25-sov-certificate.pdf", "data/source/elections/primary-results/california/2024/secretary-certificate.pdf", 1003961, "1d9adbbebedb50980432e17077654af6e5ecdf264c47a6849d056eb8ffa7cb8f", "source", []],
  "ca-2024-cd16-primary-recertification": ["https://elections.cdn.sos.ca.gov/sov/2024-primary/sov/cd16-recertification.pdf", "data/source/elections/primary-results/california/2024/cd16-recertification.pdf", 1019737, "2e45b8d23631d2ee290d7969f5c6a8777ee7812cb975af68be549ee39345f145", "source", []],
  "ca-2026-house-primary-sov-xlsx": ["https://elections.cdn.sos.ca.gov/sov/2026-primary/sov/76-us-rep.xlsx", "data/source/elections/primary-results/california/2026/house-statement-of-vote.xlsx", 320003, "0f84023a857d8f1cba5da0565cf334d9c362a0bb96f2172cf8bc1771bc019770", "source", []],
  "ca-2026-house-primary-sov-pdf": ["https://elections.cdn.sos.ca.gov/sov/2026-primary/sov/76-us-rep.pdf", "data/source/elections/primary-results/california/2026/house-statement-of-vote.pdf", 223964, "4dca429c463c2cf32dc37342f8f5f3e87429cd1345109f208e0c437e7be7f4d5", "source", []],
  "ca-2026-primary-secretary-certificate": ["https://elections.cdn.sos.ca.gov/sov/2026-primary/sov/18-sov-certificate.pdf", "data/source/elections/primary-results/california/2026/secretary-certificate.pdf", 842458, "3ffb90f022e448d84ea77cfccc2baa54ad87669a0aaa0575c7a08df66c460d77", "source", []],
  "ca-top-two-primary-rules-snapshot-20260805": ["https://www.sos.ca.gov/elections/primary-elections-california", "data/source/elections/primary-results/california/authority/top-two-primary-rules-20260805.html", 64796, "4840655c057c2ec71aacbcf40798ba25126ae8b42d96b673e41a8748e8f2f917", "source_snapshot", []],
  "ca-house-top-two-candidate-totals-2022-2026-v1": ["urn:dsa-seats:ca-house-top-two-candidate-totals:v1:2022-2026", "data/source/elections/primary-results/california/normalized/house-candidate-totals.tsv", 43429, "94f110f4cef4ac2f7d8fd32e7765318372a81280fcf2995b7ca1563a1f59bebc", "derived_extract", ["ca-2022-house-primary-sov-xlsx", "ca-2024-house-primary-sov-xlsx", "ca-2026-house-primary-sov-xlsx"]],
} as const);
type ExpectedId = keyof typeof EXPECTED;
const IDS = Object.freeze(Object.keys(EXPECTED) as ExpectedId[]);
const DECISIONS = Object.freeze(["collect-official-state-primary-results-and-certification-v1", "decide-nonstandard-primary-disposition-treatment-v1"] as const);
const EXPECTED_CYCLES = Object.freeze({ 2022: { candidates: 272, votes: 6896731, writeIns: 8, incumbents: 0 }, 2024: { candidates: 245, votes: 7283233, writeIns: 4, incumbents: 45 }, 2026: { candidates: 297, votes: 8827913, writeIns: 8, incumbents: 0 } } as const);

export type CaliforniaHouseTopTwoResultsReceipt = Readonly<{
  schema: typeof CALIFORNIA_HOUSE_TOP_TWO_RESULTS_V1; version: 1; generatedAt: string; sourceCutoff: "2026-08-05";
  reviewerOnly: true; publicationEligible: false; review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null; resolution: null }>;
  parentProposal: Readonly<{ id: "house-democratic-primary-source-selection-proposal-20260804-v1"; fileSha256: string; packageSha256: string }>;
  decisionSupport: readonly Readonly<{ decisionId: typeof DECISIONS[number]; lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" }>[];
  inheritedDecisionResolutions: readonly Readonly<{ decisionId: typeof DECISIONS[number]; resolution: null }>[];
  nominationSystem: "top_two_open_primary"; partyFieldMeaning: "candidate_qualified_party_preference";
  formulaApplicability: "confirmed_incompatible_with_party_primary_metrics";
  cycles: readonly Readonly<{ cycleYear: CycleYear; electionDate: string; certificationStatus: string; certificateSignedOn: string; contests: 52; candidates: number; votes: number; writeIns: number; sourceIncumbentMarkers: number }>[];
  sources: readonly SourceEntry[]; contests: readonly Contest[];
  summary: Readonly<{ cycles: 3; contests: 156; candidates: 814; votes: 23007877; writeIns: 20; sourceIncumbentMarkers: 45; evaluatorNumericValues: 0; scoreEligibleContests: 0; contestSetSha256: string }>;
  limitations: readonly string[]; unresolvedGates: readonly string[]; packageSha256: string;
}>;

export class CaliforniaHouseTopTwoResultsReceiptError extends Error {
  constructor(readonly code: string) { super(`California House top-two receipt rejected: ${code}`); this.name = "CaliforniaHouseTopTwoResultsReceiptError"; }
}
const fail = (code: string): never => { throw new CaliforniaHouseTopTwoResultsReceiptError(code); };
const digest = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const rawHash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const bytes = (input: CaliforniaTopTwoInput): Buffer => typeof input.bytes === "string" ? Buffer.from(input.bytes, "utf8") : Buffer.from(input.bytes);
const bytewise = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const sourceOk = (entry: SourceEntry): boolean => {
  const expected = EXPECTED[entry.id as ExpectedId];
  return Boolean(expected && canonicalJson([entry.url, entry.retainedPath, entry.byteSize, entry.sha256, entry.kind, entry.parentIds]) === canonicalJson(expected) && entry.retainedStatus === "retained");
};
const checked = (input: CaliforniaTopTwoInput): Buffer => {
  const value = bytes(input);
  if (!sourceOk(input.entry) || value.length !== input.entry.byteSize || rawHash(value) !== input.entry.sha256) fail("SOURCE_BYTES_INVALID");
  return value;
};

function delimitedRows(text: string): string[][] {
  if (!text.length || text.includes("\u0000")) fail("TSV_TEXT_INVALID");
  const rows: string[][] = [], row: string[] = [];
  let field = "", quoted = false, atStart = true, justClosedQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { field += '"'; index += 1; } else { quoted = false; justClosedQuote = true; } }
      else field += char;
      continue;
    }
    if (justClosedQuote) {
      if (char === "\t") { row.push(field); field = ""; atStart = true; justClosedQuote = false; continue; }
      if (char === "\n") { row.push(field); rows.push([...row]); row.length = 0; field = ""; atStart = true; justClosedQuote = false; continue; }
      if (char === "\r" && text[index + 1] === "\n") continue;
      fail("TSV_INVALID_POST_QUOTE_CHARACTER");
    }
    if (atStart && char === '"') { quoted = true; atStart = false; continue; }
    if (char === "\t") { row.push(field); field = ""; atStart = true; continue; }
    if (char === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push([...row]); row.length = 0; field = ""; atStart = true; continue; }
    if (char === '"') fail("TSV_UNQUOTED_QUOTE");
    field += char; atStart = false;
  }
  if (quoted) fail("TSV_UNTERMINATED_QUOTE");
  if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push([...row]); }
  return rows;
}

function parseContests(input: CaliforniaTopTwoInput): Contest[] {
  const rows = delimitedRows(checked(input).toString("utf8"));
  const header = ["cycle_year", "election_date", "district_code", "candidate_order", "source_candidate_name", "party_preference", "is_write_in", "source_incumbent_marker", "votes", "supplied_percent_tenths"];
  if (canonicalJson(rows.shift()) !== canonicalJson(header)) fail("TSV_HEADER_INVALID");
  const grouped = new Map<string, Candidate[]>();
  for (const row of rows) {
    if (row.length !== header.length) fail("TSV_COLUMN_COUNT_INVALID");
    const [rawYear, electionDate, districtCode, rawOrder, sourceCandidateName, partyPreference, rawWriteIn, rawIncumbent, rawVotes, rawPercent] = row;
    const cycleYear = Number(rawYear) as CycleYear;
    if (![2022, 2024, 2026].includes(cycleYear) || electionDate !== ({ 2022: "2022-06-07", 2024: "2024-03-05", 2026: "2026-06-02" } as const)[cycleYear] || !/^(0[1-9]|[1-4][0-9]|5[0-2])$/.test(districtCode!) || !sourceCandidateName || !["AI", "DEM", "GRN", "LIB", "NPP", "PF", "REP"].includes(partyPreference!) || !/^[01]$/.test(rawWriteIn!) || !/^[01]$/.test(rawIncumbent!) || !/^\d+$/.test(rawOrder!) || !/^\d+$/.test(rawVotes!) || !/^\d+$/.test(rawPercent!)) fail("TSV_ROW_INVALID");
    const candidate: Candidate = { candidateOrder: Number(rawOrder), sourceCandidateName, partyPreference: partyPreference as Candidate["partyPreference"], isWriteIn: rawWriteIn === "1", sourceIncumbentMarker: rawIncumbent === "1", votes: Number(rawVotes), suppliedPercentTenths: Number(rawPercent) };
    if (!Number.isSafeInteger(candidate.candidateOrder) || candidate.candidateOrder < 1 || !Number.isSafeInteger(candidate.votes) || candidate.votes < 0 || !Number.isSafeInteger(candidate.suppliedPercentTenths) || candidate.suppliedPercentTenths < 0 || candidate.suppliedPercentTenths > 1000) fail("TSV_VALUE_INVALID");
    const key = `${cycleYear}:${districtCode}`;
    const current = grouped.get(key) ?? [];
    if (current.some((value) => value.candidateOrder === candidate.candidateOrder || value.sourceCandidateName === candidate.sourceCandidateName)) fail("TSV_DUPLICATE_CANDIDATE");
    current.push(candidate); grouped.set(key, current);
  }
  const contests = [...grouped].map(([key, candidates]) => {
    const [rawYear, districtCode] = key.split(":") as [string, string];
    const cycleYear = Number(rawYear) as CycleYear;
    candidates.sort((left, right) => left.candidateOrder - right.candidateOrder);
    if (candidates.some((candidate, index) => candidate.candidateOrder !== index + 1)) fail("CANDIDATE_ORDER_INVALID");
    const contestTotalVotes = candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
    if (contestTotalVotes < 1 || candidates.some((candidate) => Math.abs((candidate.votes / contestTotalVotes) * 1000 - candidate.suppliedPercentTenths) > 0.500001)) fail("PERCENTAGE_RECONCILIATION_INVALID");
    const sourceLockIds = [`ca-${cycleYear}-house-primary-sov-xlsx`, `ca-${cycleYear}-house-primary-sov-pdf`, `ca-${cycleYear}-primary-secretary-certificate`, "ca-house-top-two-candidate-totals-2022-2026-v1", "ca-top-two-primary-rules-snapshot-20260805"];
    const recertified = cycleYear === 2024 && districtCode === "16";
    if (recertified) sourceLockIds.push("ca-2024-cd16-primary-recertification");
    const unsigned = {
      contestId: `ca:${cycleYear}:regular:us-house:${districtCode}:top-two`, cycleYear,
      electionDate: ({ 2022: "2022-06-07", 2024: "2024-03-05", 2026: "2026-06-02" } as const)[cycleYear],
      stateCode: "CA" as const, districtCode, office: "U.S. House of Representatives" as const, eventKind: "regular" as const, stage: "primary" as const,
      nominationSystem: "top_two_open_primary" as const, partyFieldMeaning: "candidate_qualified_party_preference" as const,
      formulaApplicability: "confirmed_incompatible_with_party_primary_metrics" as const,
      certificationStatus: recertified ? "certified_statement_of_vote_with_cd16_recertification" as const : "certified_statement_of_vote" as const,
      sourceLockIds, candidates, contestTotalVotes, sourceWinnerStatus: "not_marked_or_derived" as const, advancementStatus: "not_derived" as const,
      currentIdentityStatus: "not_reviewed" as const, geographyStatus: "not_reviewed" as const, selectionStatus: "excluded_formula_incompatible" as const,
      scoreEligible: false as const, evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null },
    };
    return { ...unsigned, contestSha256: digest("dsa-seats:ca-house-top-two-contest:v1\0", unsigned) };
  }).sort((left, right) => bytewise(left.contestId, right.contestId));
  if (contests.length !== 156 || new Set(contests.map((contest) => contest.contestId)).size !== 156) fail("CONTEST_CLOSURE_INVALID");
  return contests;
}

export function buildCaliforniaHouseTopTwoResultsReceipt(inputs: readonly CaliforniaTopTwoInput[], parentInput: CaliforniaTopTwoParentInput, generatedAt = "2026-08-05T19:30:00.000Z"): CaliforniaHouseTopTwoResultsReceipt {
  const parent = validateHouseDemocraticPrimarySourceSelectionProposal(parentInput.value);
  if (parentInput.fileSha256 !== "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1" || parent.packageSha256 !== "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" || DECISIONS.some((id) => parent.decisions.find((decision) => decision.decisionId === id)?.resolution !== null) || !/^2026-08-05T\d{2}:\d{2}:\d{2}\.000Z$/.test(generatedAt)) fail("PARENT_INVALID");
  const byId = new Map(inputs.map((input) => [input.entry.id, input]));
  if (inputs.length !== IDS.length || byId.size !== IDS.length || IDS.some((id) => !byId.has(id)) || inputs.some((input) => !sourceOk(input.entry))) fail("SOURCE_CLOSURE_INVALID");
  inputs.forEach(checked);
  const required = (id: ExpectedId): CaliforniaTopTwoInput => byId.get(id) ?? fail("SOURCE_MISSING");
  if (!checked(required("ca-top-two-primary-rules-snapshot-20260805")).toString("utf8").includes("only the top two vote-getters in the primary election – regardless of party preference - move on to the general election")) fail("TOP_TWO_AUTHORITY_INVALID");
  const contests = parseContests(required("ca-house-top-two-candidate-totals-2022-2026-v1"));
  for (const cycleYear of [2022, 2024, 2026] as const) {
    const cycle = contests.filter((contest) => contest.cycleYear === cycleYear), expected = EXPECTED_CYCLES[cycleYear];
    if (cycle.length !== 52 || cycle.reduce((sum, contest) => sum + contest.candidates.length, 0) !== expected.candidates || cycle.reduce((sum, contest) => sum + contest.contestTotalVotes, 0) !== expected.votes || cycle.flatMap((contest) => contest.candidates).filter((candidate) => candidate.isWriteIn).length !== expected.writeIns || cycle.flatMap((contest) => contest.candidates).filter((candidate) => candidate.sourceIncumbentMarker).length !== expected.incumbents) fail(`CYCLE_${cycleYear}_CLOSURE_INVALID`);
  }
  const cd16 = contests.find((contest) => contest.cycleYear === 2024 && contest.districtCode === "16") ?? fail("CD16_MISSING");
  if (cd16.candidates.find((candidate) => candidate.sourceCandidateName === "Evan Low")?.votes !== 30261 || cd16.candidates.find((candidate) => candidate.sourceCandidateName === "Joe Simitian")?.votes !== 30256 || !cd16.sourceLockIds.includes("ca-2024-cd16-primary-recertification")) fail("CD16_RECERTIFICATION_INVALID");
  const contestSetSha256 = digest("dsa-seats:ca-house-top-two-contest-set:v1\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const cycles = ([2022, 2024, 2026] as const).map((cycleYear) => ({
    cycleYear, electionDate: ({ 2022: "2022-06-07", 2024: "2024-03-05", 2026: "2026-06-02" } as const)[cycleYear],
    certificationStatus: cycleYear === 2024 ? "certified_statement_of_vote_with_cd16_recertification" : "certified_statement_of_vote",
    certificateSignedOn: ({ 2022: "2022-10-11", 2024: "2024-04-12; cd16 recertified 2024-05-10", 2026: "2026-07-10" } as const)[cycleYear],
    contests: 52 as const, candidates: EXPECTED_CYCLES[cycleYear].candidates, votes: EXPECTED_CYCLES[cycleYear].votes, writeIns: EXPECTED_CYCLES[cycleYear].writeIns, sourceIncumbentMarkers: EXPECTED_CYCLES[cycleYear].incumbents,
  }));
  const unsigned = {
    schema: CALIFORNIA_HOUSE_TOP_TWO_RESULTS_V1, version: 1 as const, generatedAt, sourceCutoff: "2026-08-05" as const, reviewerOnly: true as const, publicationEligible: false as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    parentProposal: { id: "house-democratic-primary-source-selection-proposal-20260804-v1" as const, fileSha256: "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1", packageSha256: "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" },
    decisionSupport: DECISIONS.map((decisionId) => ({ decisionId, lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" as const })), inheritedDecisionResolutions: DECISIONS.map((decisionId) => ({ decisionId, resolution: null })),
    nominationSystem: "top_two_open_primary" as const, partyFieldMeaning: "candidate_qualified_party_preference" as const, formulaApplicability: "confirmed_incompatible_with_party_primary_metrics" as const,
    cycles, sources: (inputs.map((input) => input.entry).sort((left, right) => bytewise(left.id, right.id))).map(sourceLockContent), contests,
    summary: { cycles: 3 as const, contests: 156 as const, candidates: 814 as const, votes: 23007877 as const, writeIns: 20 as const, sourceIncumbentMarkers: 45 as const, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const, contestSetSha256 },
    limitations: ["California U.S. House primaries are voter-nominated top-two contests, not Democratic Party nomination contests.", "Candidate party preference is retained as source data but is not party nomination, endorsement, or current identity evidence.", "No top-two advancement is derived from vote rank in this receipt; every contest remains incompatible with party-primary evaluator metrics.", "The 2024 district 16 values use the official recertified recount totals and retain the separate recertification instrument.", "Current identity, historical geography compatibility, candidate ideology, and evaluator applicability remain unreviewed."],
    unresolvedGates: ["Independent reviewer approval is required before factual promotion.", "A separately reviewed top-two-aware scoring contract is required before any evaluator use.", "Identity and district-geography mappings remain unresolved."],
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:ca-house-top-two-package:v1\0", unsigned) };
}

export function assertCaliforniaHouseTopTwoSemanticInvariants(value: CaliforniaHouseTopTwoResultsReceipt): void {
  if (value.schema !== CALIFORNIA_HOUSE_TOP_TWO_RESULTS_V1 || value.sourceCutoff !== "2026-08-05" || !value.reviewerOnly || value.publicationEligible || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null || value.nominationSystem !== "top_two_open_primary" || value.partyFieldMeaning !== "candidate_qualified_party_preference" || value.formulaApplicability !== "confirmed_incompatible_with_party_primary_metrics") fail("LIFECYCLE_INVALID");
  if (value.contests.length !== 156 || value.contests.some((contest) => contest.scoreEligible || contest.selectionStatus !== "excluded_formula_incompatible" || contest.sourceWinnerStatus !== "not_marked_or_derived" || contest.advancementStatus !== "not_derived" || Object.values(contest.evaluatorValues).some((entry) => entry !== null) || contest.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== contest.contestTotalVotes)) fail("CONTEST_INVALID");
  if (value.summary.cycles !== 3 || value.summary.contests !== 156 || value.summary.candidates !== 814 || value.summary.votes !== 23007877 || value.summary.writeIns !== 20 || value.summary.sourceIncumbentMarkers !== 45 || value.summary.evaluatorNumericValues !== 0 || value.summary.scoreEligibleContests !== 0) fail("SUMMARY_INVALID");
  const contestSetSha256 = digest("dsa-seats:ca-house-top-two-contest-set:v1\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  if (contestSetSha256 !== value.summary.contestSetSha256 || value.summary.contestSetSha256 !== CALIFORNIA_HOUSE_TOP_TWO_CONTEST_SET_SHA256) fail("CONTEST_SET_INVALID");
  const { packageSha256, ...unsigned } = value;
  if (packageSha256 !== digest("dsa-seats:ca-house-top-two-package:v1\0", unsigned) || packageSha256 !== CALIFORNIA_HOUSE_TOP_TWO_PACKAGE_SHA256) fail("PACKAGE_INVALID");
}

export function validateCaliforniaHouseTopTwoResultsReceipt(value: CaliforniaHouseTopTwoResultsReceipt): CaliforniaHouseTopTwoResultsReceipt {
  assertCaliforniaHouseTopTwoSemanticInvariants(value);
  return value;
}
