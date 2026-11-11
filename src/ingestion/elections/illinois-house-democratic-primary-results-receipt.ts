import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";

export const ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_RECEIPT_V1 = "illinois-house-democratic-primary-results-receipt-v1" as const;
export const HOUSE_DEMOCRATIC_PRIMARY_SOURCE_SELECTION_PACKAGE_SHA256 = "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" as const;
export const ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_CONTEST_SET_SHA256 = "eaff782dec77a454d943125c2256d6b6f10121522510a4ec5a43c9e1058e52af" as const;
export const ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_PACKAGE_SHA256 = "4c0f7bc0505b9e02d03585d8acd0fe47d6599b194f6efcdbcd6e40896d6a663f" as const;
const HEADER = ["JurisdictionID", "JurisContainerID", "JurisName", "EISCandidateID", "CandidateName", "EISContestID", "ContestName", "PrecinctName", "Registration", "EISPartyID", "PartyName", "VoteCount"] as const;
const ADMINISTRATIVE: ReadonlyMap<string, "blankBallots" | "underVotes" | "overVotes"> = new Map([["Blank Ballots", "blankBallots"], ["Under Votes", "underVotes"], ["Over Votes", "overVotes"]]);
const CYCLES = [2022, 2024] as const;
const RESULT_SOURCE_IDS = CYCLES.flatMap((cycle) => Array.from({ length: 17 }, (_, index) => `il-${cycle}-house-primary-district-${String(index + 1).padStart(2, "0")}`));
const UNRESOLVED_GATES = ["retain_final_state_canvass_or_certification", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification"] as const;

type Cycle = typeof CYCLES[number];
type Bytes = Buffer | Uint8Array | string;
export type IllinoisSourceLockEntry = Readonly<{ id: string; url: string; retainedPath: string; retainedStatus: "retained"; byteSize: number; sha256: string; kind: "source"; parentIds: readonly string[] }>;
export type IllinoisResultInput = Readonly<{ entry: IllinoisSourceLockEntry; bytes: Bytes }>;
export type IllinoisCandidate = Readonly<{ candidateAuthorityId: string; candidateName: string; votes: number; isWriteIn: boolean }>;
export type IllinoisContest = Readonly<{
  contestId: string; contestSha256: string; cycleYear: Cycle; stateCode: "IL"; districtCode: string; sourceLockId: string; sourceFileSha256: string;
  authorityContestId: string; authorityContestName: string; office: "U.S. Representative"; eventKind: "regular"; stage: "primary"; nominationSystem: "partisan_primary"; party: "Democratic";
  contestDisposition: "candidate_rows_retained" | "no_democratic_candidate_rows";
  officialResultStatus: "retained_candidate_unverified_certification"; certificationStatus: "not_retained"; incumbentIdentityStatus: "not_reviewed"; historicalGeographyStatus: "not_reviewed";
  candidates: readonly IllinoisCandidate[]; candidateVotes: number; administrativeVotes: Readonly<{ blankBallots: number; underVotes: number; overVotes: number }>;
  democraticBallotsAccounted: number; precincts: number; democraticSourceRows: number; scoreEligible: false;
  evaluatorValues: Readonly<{ priorPrimaryMargin: null; priorDemocraticPrimaryVotes: null; priorProgressivePrimaryShare: null }>;
}>;
export type IllinoisHouseDemocraticPrimaryResultsReceipt = Readonly<{
  schema: typeof ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_RECEIPT_V1; version: 1; generatedAt: "2026-08-05T13:00:00.000Z"; sourceCutoff: "2026-08-05";
  reviewerOnly: true; publicationEligible: false; review: Readonly<{ status: "proposed"; reviewer: null; reviewedAt: null }>;
  methodologyParent: Readonly<{ sourceLockId: "house-democratic-primary-source-selection-proposal-20260804-v1"; packageSha256: typeof HOUSE_DEMOCRATIC_PRIMARY_SOURCE_SELECTION_PACKAGE_SHA256; disposition: "new_versioned_state_result_candidate" }>;
  originalPublisher: "Illinois State Board of Elections"; status: "official_result_candidate"; certificationStatus: "not_retained";
  sourceListings: readonly IllinoisSourceLockEntry[]; sources: readonly IllinoisSourceLockEntry[]; contests: readonly IllinoisContest[];
  unresolvedGates: readonly ["retain_final_state_canvass_or_certification", "review_incumbent_candidate_identity", "review_historical_district_compatibility", "review_progressive_candidate_classification"];
  summary: Readonly<{ cycles: 2; districtsPerCycle: 17; contests: 34; contestsWithCandidateRows: 32; noDemocraticCandidateRowContests: 2; listingSources: 2; resultSources: 34; democraticSourceRows: number; candidates: number; candidateVotes: number; administrativeVotes: number; contestSetSha256: string; certificationReceipts: 0; incumbentIdentityMappings: 0; geographyApprovals: 0; evaluatorNumericValues: 0; scoreEligibleContests: 0 }>;
  packageSha256: string;
}>;

export class IllinoisHouseDemocraticPrimaryResultsReceiptError extends Error {
  constructor(readonly code: string) { super(`Illinois House Democratic primary receipt rejected: ${code}`); this.name = "IllinoisHouseDemocraticPrimaryResultsReceiptError"; }
}
const fail = (code: string): never => { throw new IllinoisHouseDemocraticPrimaryResultsReceiptError(code); };
const hash = (domain: string, value: unknown): string => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fileHash = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");
const bytewise = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const asBytes = (value: Bytes): Buffer => typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);

/** Strict RFC-4180 parser used because candidate names can contain escaped quotes. */
function csvRows(text: string): string[][] {
  if (!text.length || text.includes("\u0000")) fail("CSV_TEXT_INVALID");
  const rows: string[][] = [], row: string[] = []; let field = "", quoted = false, atStart = true, justClosed = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) { if (char === '"') { if (text[index + 1] === '"') { field += '"'; index += 1; } else { quoted = false; justClosed = true; } } else field += char; continue; }
    if (justClosed) { if (char === ",") { row.push(field); field = ""; atStart = true; justClosed = false; continue; } if (char === "\n") { row.push(field); rows.push([...row]); row.length = 0; field = ""; atStart = true; justClosed = false; continue; } if (char === "\r" && text[index + 1] === "\n") continue; fail("CSV_INVALID_POST_QUOTE_CHARACTER"); }
    if (atStart && char === '"') { quoted = true; atStart = false; continue; }
    if (char === ",") { row.push(field); field = ""; atStart = true; continue; }
    if (char === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push([...row]); row.length = 0; field = ""; atStart = true; continue; }
    if (char === '"') fail("CSV_UNQUOTED_QUOTE"); field += char; atStart = false;
  }
  if (quoted) fail("CSV_UNTERMINATED_QUOTE");
  if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push([...row]); }
  return rows;
}

function sourceCoordinates(entry: IllinoisSourceLockEntry): { cycle: Cycle; district: number } {
  const match = /^il-(2022|2024)-house-primary-district-(0[1-9]|1[0-7])$/.exec(entry.id);
  if (!match) return fail("SOURCE_ID_INVALID");
  const cycle = Number(match[1]) as Cycle, district = Number(match[2]);
  const path = `data/source/elections/primary-results/illinois/${cycle}/il-${String(district).padStart(2, "0")}.csv`;
  if (entry.retainedPath !== path || entry.parentIds.length !== 1 || entry.parentIds[0] !== `il-${cycle}-house-primary-listing`) fail("SOURCE_LOCK_COORDINATES_INVALID");
  return { cycle, district };
}

function parseContest(input: IllinoisResultInput): IllinoisContest {
  const { cycle, district } = sourceCoordinates(input.entry), bytes = asBytes(input.bytes);
  if (input.entry.retainedStatus !== "retained" || input.entry.kind !== "source" || bytes.byteLength !== input.entry.byteSize || fileHash(bytes) !== input.entry.sha256) fail("SOURCE_FILE_RECEIPT_MISMATCH");
  const rows = csvRows(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!rows.length || canonicalJson(rows[0]) !== canonicalJson(HEADER)) fail("CSV_HEADER_INVALID");
  const authorityContestId = String(240 + district * 10), authorityContestName = `${district}${district === 1 ? "ST" : district === 2 ? "ND" : district === 3 ? "RD" : "TH"} CONGRESS`;
  const candidateById = new Map<string, { candidateName: string; votes: number }>();
  const administrativeVotes = { blankBallots: 0, underVotes: 0, overVotes: 0 }; const precincts = new Set<string>();
  const reportingChannels = new Map<string, { summary: number; precinct: number }>(), rowKeys = new Set<string>(); let democraticSourceRows = 0;
  for (const [rowIndex, row] of rows.slice(1).entries()) {
    if (row.length !== HEADER.length) fail("CSV_COLUMN_COUNT_INVALID");
    const [jurisdictionId, containerId, jurisdictionName, candidateId, candidateName, contestId, contestName, precinctName, registration, partyId, partyName, rawVotes] = row;
    if (!/^\d+$/.test(jurisdictionId!) || !/^\d+$/.test(containerId!) || !jurisdictionName || !/^\d+$/.test(candidateId!) || !candidateName || contestId !== authorityContestId || contestName !== authorityContestName || !/^\d+$/.test(registration!) || !/^(11|12)$/.test(partyId!) || !/^\d+$/.test(rawVotes!)) fail(`CSV_ROW_INVALID:${input.entry.id}:${rowIndex + 2}`);
    const normalizedParty = partyName!.trim().toLowerCase();
    if ((partyId === "11" && normalizedParty && !normalizedParty.startsWith("democrat")) || (partyId === "12" && normalizedParty && !normalizedParty.startsWith("republican"))) fail("CSV_PARTY_LABEL_INVALID");
    const votes = Number(rawVotes); if (!Number.isSafeInteger(votes) || votes < 0) fail("CSV_VOTE_INVALID");
    const rowKey = canonicalJson(row.slice(0, 11)); if (rowKeys.has(rowKey)) fail(`CSV_DUPLICATE_BALLOT_OPTION_ROW:${input.entry.id}:${rowIndex + 2}`); rowKeys.add(rowKey);
    if (partyId !== "11") continue;
    democraticSourceRows += 1; precincts.add(`${jurisdictionId}:${containerId}:${precinctName || "__JURISDICTION_TOTAL__"}`);
    const channelKey = `${jurisdictionId}:${containerId}:${candidateId}:${candidateName}`, channels = reportingChannels.get(channelKey) ?? { summary: 0, precinct: 0 };
    channels[precinctName ? "precinct" : "summary"] += votes; reportingChannels.set(channelKey, channels);
    if (candidateId === "0") { const key = ADMINISTRATIVE.get(candidateName!); if (key === undefined) return fail("CSV_ADMINISTRATIVE_CATEGORY_INVALID"); administrativeVotes[key] += votes; continue; }
    if (ADMINISTRATIVE.has(candidateName!)) fail("CSV_CANDIDATE_CATEGORY_COLLISION");
    const canonicalCandidateName = /^write-?in$/i.test(candidateName!) ? "WRITE-IN" : candidateName!;
    const current = candidateById.get(candidateId!); if (current && current.candidateName !== canonicalCandidateName) fail(`CSV_CANDIDATE_IDENTITY_CONFLICT:${input.entry.id}:${candidateId}:${current.candidateName}:${canonicalCandidateName}`);
    candidateById.set(candidateId!, { candidateName: canonicalCandidateName, votes: (current?.votes ?? 0) + votes });
  }
  if ([...reportingChannels.values()].some(({ summary, precinct }) => summary > 0 && precinct > 0)) fail("CSV_REPORTING_CHANNEL_OVERLAP");
  if (!democraticSourceRows || !precincts.size) fail(`DEMOCRATIC_BALLOT_ROWS_EMPTY:${input.entry.id}`);
  const candidates = [...candidateById].map(([candidateAuthorityId, row]) => ({ candidateAuthorityId, candidateName: row.candidateName, votes: row.votes, isWriteIn: /^write-?in$/i.test(row.candidateName) })).sort((left, right) => bytewise(left.candidateAuthorityId, right.candidateAuthorityId));
  const candidateVotes = candidates.reduce((sum, row) => sum + row.votes, 0), administrativeTotal = Object.values(administrativeVotes).reduce((sum, votes) => sum + votes, 0);
  const unsigned = {
    contestId: `il:${cycle}:us-house:${String(district).padStart(2, "0")}:democratic`, cycleYear: cycle, stateCode: "IL" as const, districtCode: String(district).padStart(2, "0"), sourceLockId: input.entry.id, sourceFileSha256: input.entry.sha256,
    authorityContestId, authorityContestName, office: "U.S. Representative" as const, eventKind: "regular" as const, stage: "primary" as const, nominationSystem: "partisan_primary" as const, party: "Democratic" as const, contestDisposition: candidates.length ? "candidate_rows_retained" as const : "no_democratic_candidate_rows" as const,
    officialResultStatus: "retained_candidate_unverified_certification" as const, certificationStatus: "not_retained" as const, incumbentIdentityStatus: "not_reviewed" as const, historicalGeographyStatus: "not_reviewed" as const,
    candidates, candidateVotes, administrativeVotes, democraticBallotsAccounted: candidateVotes + administrativeTotal, precincts: precincts.size, democraticSourceRows, scoreEligible: false as const,
    evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null },
  };
  return { ...unsigned, contestSha256: hash("dsa-seats:il-house-democratic-primary-contest:v1\0", unsigned) };
}

function validateListings(listings: readonly IllinoisSourceLockEntry[]): readonly IllinoisSourceLockEntry[] {
  const sorted = [...listings].sort((left, right) => bytewise(left.id, right.id));
  if (sorted.length !== 2 || sorted.some((entry, index) => entry.id !== `il-${CYCLES[index]}-house-primary-listing` || entry.retainedStatus !== "retained" || entry.kind !== "source" || entry.parentIds.length !== 0 || !entry.retainedPath.endsWith(`/${CYCLES[index]}/official-house-listing.html`))) fail("LISTING_SOURCE_CLOSURE_INVALID");
  return sorted;
}

export function buildIllinoisHouseDemocraticPrimaryResultsReceipt(input: Readonly<{ listings: readonly IllinoisSourceLockEntry[]; results: readonly IllinoisResultInput[] }>): IllinoisHouseDemocraticPrimaryResultsReceipt {
  const sourceListings = (validateListings(input.listings)).map(sourceLockContent), contests = input.results.map(parseContest).sort((left, right) => bytewise(left.contestId, right.contestId));
  const sources = (input.results.map(({ entry }) => entry).sort((left, right) => bytewise(left.id, right.id))).map(sourceLockContent);
  if (contests.length !== 34 || sources.length !== 34 || canonicalJson(sources.map(({ id }) => id)) !== canonicalJson(RESULT_SOURCE_IDS) || new Set(contests.map(({ contestId }) => contestId)).size !== 34) fail("RESULT_SOURCE_CLOSURE_INVALID");
  const contestSetSha256 = hash("dsa-seats:il-house-democratic-primary-contest-set:v1\0", contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const administrativeVotes = contests.reduce((sum, contest) => sum + Object.values(contest.administrativeVotes).reduce((subtotal, votes) => subtotal + votes, 0), 0);
  const unsigned = {
    schema: ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_RECEIPT_V1, version: 1 as const, generatedAt: "2026-08-05T13:00:00.000Z" as const, sourceCutoff: "2026-08-05" as const, reviewerOnly: true as const, publicationEligible: false as const, review: { status: "proposed" as const, reviewer: null, reviewedAt: null },
    methodologyParent: { sourceLockId: "house-democratic-primary-source-selection-proposal-20260804-v1" as const, packageSha256: HOUSE_DEMOCRATIC_PRIMARY_SOURCE_SELECTION_PACKAGE_SHA256, disposition: "new_versioned_state_result_candidate" as const },
    originalPublisher: "Illinois State Board of Elections" as const, status: "official_result_candidate" as const, certificationStatus: "not_retained" as const, sourceListings, sources, contests,
    unresolvedGates: UNRESOLVED_GATES,
    summary: { cycles: 2 as const, districtsPerCycle: 17 as const, contests: 34 as const, contestsWithCandidateRows: 32 as const, noDemocraticCandidateRowContests: 2 as const, listingSources: 2 as const, resultSources: 34 as const, democraticSourceRows: contests.reduce((sum, row) => sum + row.democraticSourceRows, 0), candidates: contests.reduce((sum, row) => sum + row.candidates.length, 0), candidateVotes: contests.reduce((sum, row) => sum + row.candidateVotes, 0), administrativeVotes, contestSetSha256, certificationReceipts: 0 as const, incumbentIdentityMappings: 0 as const, geographyApprovals: 0 as const, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const },
  };
  return { ...unsigned, packageSha256: hash("dsa-seats:il-house-democratic-primary-package:v1\0", unsigned) };
}

export function validateIllinoisHouseDemocraticPrimaryResultsReceipt(value: IllinoisHouseDemocraticPrimaryResultsReceipt): IllinoisHouseDemocraticPrimaryResultsReceipt {
  const { packageSha256, ...unsigned } = value;
  const contestSetSha256 = hash("dsa-seats:il-house-democratic-primary-contest-set:v1\0", value.contests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const expectedContestIds = RESULT_SOURCE_IDS.map((id) => id.replace(/^il-(\d{4})-house-primary-district-(\d{2})$/, "il:$1:us-house:$2:democratic"));
  const candidates = value.contests.reduce((sum, contest) => sum + contest.candidates.length, 0), candidateVotes = value.contests.reduce((sum, contest) => sum + contest.candidateVotes, 0);
  const administrativeVotes = value.contests.reduce((sum, contest) => sum + Object.values(contest.administrativeVotes).reduce((subtotal, votes) => subtotal + votes, 0), 0);
  const noCandidateIds = value.contests.filter(({ contestDisposition }) => contestDisposition === "no_democratic_candidate_rows").map(({ contestId }) => contestId);
  if (packageSha256 !== ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_PACKAGE_SHA256 || packageSha256 !== hash("dsa-seats:il-house-democratic-primary-package:v1\0", unsigned) || value.schema !== ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_RESULTS_RECEIPT_V1 || value.version !== 1 || !value.reviewerOnly || value.publicationEligible || value.status !== "official_result_candidate" || value.certificationStatus !== "not_retained" || value.methodologyParent.packageSha256 !== HOUSE_DEMOCRATIC_PRIMARY_SOURCE_SELECTION_PACKAGE_SHA256 || canonicalJson(value.unresolvedGates) !== canonicalJson(UNRESOLVED_GATES) || canonicalJson(value.sources.map(({ id }) => id)) !== canonicalJson(RESULT_SOURCE_IDS) || canonicalJson(value.contests.map(({ contestId }) => contestId)) !== canonicalJson(expectedContestIds) || canonicalJson(noCandidateIds) !== canonicalJson(["il:2022:us-house:16:democratic", "il:2024:us-house:16:democratic"]) || value.summary.contests !== 34 || value.summary.contestsWithCandidateRows !== 32 || value.summary.noDemocraticCandidateRowContests !== 2 || value.summary.resultSources !== 34 || value.summary.listingSources !== 2 || value.summary.democraticSourceRows !== value.contests.reduce((sum, contest) => sum + contest.democraticSourceRows, 0) || value.summary.candidates !== candidates || value.summary.candidateVotes !== candidateVotes || value.summary.administrativeVotes !== administrativeVotes || value.summary.contestSetSha256 !== ILLINOIS_HOUSE_DEMOCRATIC_PRIMARY_CONTEST_SET_SHA256 || value.summary.contestSetSha256 !== contestSetSha256 || value.summary.certificationReceipts !== 0 || value.summary.incumbentIdentityMappings !== 0 || value.summary.geographyApprovals !== 0 || value.summary.evaluatorNumericValues !== 0 || value.summary.scoreEligibleContests !== 0) fail("PACKAGE_INVARIANT_INVALID");
  validateListings(value.sourceListings);
  const sourceById = new Map(value.sources.map((source) => [source.id, source]));
  if (value.contests.some((contest) => { const { contestSha256, ...row } = contest; const source = sourceById.get(contest.sourceLockId); const admin = Object.values(contest.administrativeVotes); return contestSha256 !== hash("dsa-seats:il-house-democratic-primary-contest:v1\0", row) || !source || source.sha256 !== contest.sourceFileSha256 || contest.certificationStatus !== "not_retained" || contest.incumbentIdentityStatus !== "not_reviewed" || contest.historicalGeographyStatus !== "not_reviewed" || contest.officialResultStatus !== "retained_candidate_unverified_certification" || contest.scoreEligible || Object.values(contest.evaluatorValues).some((entry) => entry !== null) || contest.candidateVotes !== contest.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) || contest.candidates.some((candidate) => !candidate.candidateAuthorityId || !candidate.candidateName || !Number.isSafeInteger(candidate.votes) || candidate.votes < 0) || new Set(contest.candidates.map(({ candidateAuthorityId }) => candidateAuthorityId)).size !== contest.candidates.length || admin.some((votes) => !Number.isSafeInteger(votes) || votes < 0) || contest.democraticBallotsAccounted !== contest.candidateVotes + admin.reduce((sum, votes) => sum + votes, 0) || (contest.contestDisposition === "candidate_rows_retained") !== (contest.candidates.length > 0); })) fail("CONTEST_INVARIANT_INVALID");
  return value;
}
