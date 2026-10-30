import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
export type MinnesotaDflPrimaryCandidate = Readonly<{
  sourceCandidateId: string;
  sourceCandidateOrder: string;
  sourceCandidateName: string;
  votes: number;
  sourcePercentage: number;
}>;

export type MinnesotaDflPrimaryContest = Readonly<{
  cycleYear: 2022 | 2024;
  districtCode: string;
  sourceOfficeId: string;
  sourceOfficeName: string;
  sourcePartyCode: "DFL";
  precinctsReported: number;
  precinctsTotal: number;
  candidates: readonly MinnesotaDflPrimaryCandidate[];
  sourceTotalVotes: number;
  sourceWinnerStatus: "not_marked_by_source";
}>;

export type MinnesotaDflPrimaryParseResult = Readonly<{
  contests: readonly MinnesotaDflPrimaryContest[];
  summary: Readonly<{ contests: number; candidates: number; votes: number }>;
}>;

const fail = (code: string): never => { throw new Error(`Minnesota primary results rejected: ${code}`); };
const integer = (value: string): number => {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return fail("INTEGER_INVALID");
  const parsed = Number(value); if (!Number.isSafeInteger(parsed)) return fail("INTEGER_INVALID"); return parsed;
};
const lines = (value: string): string[][] => value.split(/\r?\n/).filter(Boolean).map((line) => line.split(";"));
const bytewise = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const EXPECTED = {
  2022: { districts: ["01", "04", "05", "07", "08"], candidates: 15, votes: 309004 },
  2024: { districts: ["01", "02", "04", "05", "06", "07", "08"], candidates: 13, votes: 284195 },
} as const;

export function parseMinnesotaHouseDflPrimaryResults(input: Readonly<{ cycleYear: 2022 | 2024; resultText: string; candidateText: string }>): MinnesotaDflPrimaryParseResult {
  const candidateRows = lines(input.candidateText);
  if (!candidateRows.length || candidateRows.some((row) => row.length !== 7)) return fail("CANDIDATE_ROWS_INVALID");
  const candidatesById = new Map<string, string[]>();
  for (const row of candidateRows.filter((candidateRow) => /^01(?:0[4-9]|10|11)$/.test(candidateRow[2] ?? ""))) {
    const district = Number(row[2]!.slice(2)) - 3;
    if (row[3] !== `U.S. Representative District ${district}`) return fail("HOUSE_CANDIDATE_SEMANTICS_INVALID");
    if (candidatesById.has(row[0]!)) return fail("CANDIDATE_ID_DUPLICATE");
    candidatesById.set(row[0]!, row);
  }
  const resultRows = lines(input.resultText);
  if (!resultRows.length || resultRows.some((row) => row.length !== 16)) return fail("RESULT_ROWS_INVALID");
  const dflRows = resultRows.filter((row) => row[10] === "DFL");
  const grouped = new Map<string, string[][]>();
  for (const row of dflRows) {
    if (row[0] !== "MN" || row[1] !== "" || row[2] !== "" || !/^01(?:0[4-9]|10|11)$/.test(row[3]!) || row[4] !== `U.S. Representative District ${row[5]}` || !/^[1-8]$/.test(row[5]!) || !/^04\d{2}$/.test(row[6]!)) return fail("HOUSE_ROW_SEMANTICS_INVALID");
    const candidateId = `${row[3]}${row[6]}`, candidate = candidatesById.get(candidateId);
    if (!candidate || candidate[1] !== row[7] || candidate[2] !== row[3] || candidate[3] !== row[4] || candidate[5] !== "04" || candidate[6] !== "DFL") return fail("CANDIDATE_CROSSCHECK_INVALID");
    const key = row[5]!.padStart(2, "0"), values = grouped.get(key) ?? []; values.push(row); grouped.set(key, values);
  }
  const contests: MinnesotaDflPrimaryContest[] = [...grouped.entries()].map(([districtCode, rows]) => {
    rows.sort((left, right) => bytewise(left[6]!, right[6]!));
    const precinctsReported = integer(rows[0]![11]!), precinctsTotal = integer(rows[0]![12]!), sourceTotalVotes = integer(rows[0]![15]!);
    if (precinctsReported <= 0 || precinctsReported !== precinctsTotal || rows.some((row) => integer(row[11]!) !== precinctsReported || integer(row[12]!) !== precinctsTotal || integer(row[15]!) !== sourceTotalVotes)) return fail("CONTEST_CLOSURE_INVALID");
    const candidates = rows.map((row) => {
      const sourcePercentage = Number(row[14]); if (!/^\d{1,3}\.\d{2}$/.test(row[14]!) || !Number.isFinite(sourcePercentage) || sourcePercentage < 0 || sourcePercentage > 100) return fail("PERCENTAGE_INVALID");
      return { sourceCandidateId: `${row[3]}${row[6]}`, sourceCandidateOrder: row[6]!, sourceCandidateName: row[7]!, votes: integer(row[13]!), sourcePercentage };
    });
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== sourceTotalVotes) return fail("VOTE_RECONCILIATION_INVALID");
    return { cycleYear: input.cycleYear, districtCode, sourceOfficeId: rows[0]![3]!, sourceOfficeName: rows[0]![4]!, sourcePartyCode: "DFL" as const, precinctsReported, precinctsTotal, candidates, sourceTotalVotes, sourceWinnerStatus: "not_marked_by_source" as const };
  }).sort((left, right) => bytewise(left.districtCode, right.districtCode));
  const expected = EXPECTED[input.cycleYear], candidateCount = contests.reduce((sum, contest) => sum + contest.candidates.length, 0), votes = contests.reduce((sum, contest) => sum + contest.sourceTotalVotes, 0);
  if (JSON.stringify(contests.map((contest) => contest.districtCode)) !== JSON.stringify(expected.districts) || candidateCount !== expected.candidates || votes !== expected.votes) return fail("SOURCE_CORPUS_CLOSURE_INVALID");
  return { contests, summary: { contests: contests.length, candidates: candidateCount, votes } };
}

export const MINNESOTA_PRIMARY_RESULTS_V1 = "minnesota-house-democratic-primary-results-receipt-v1" as const;
export const MINNESOTA_PRIMARY_SOURCE_CONTEST_SET_SHA256 = "7c1b8fbf54488fa9d90a6598b9fa322e097ceea40e6d4fc6ec28b41d7be86ec5" as const;
export const MINNESOTA_PRIMARY_TARGET_OBSERVATION_SET_SHA256 = "8c373fa281d18f7bc686c168fc2b3c10cf75039cc7da54138d3f0b68fa92404d" as const;
export const MINNESOTA_PRIMARY_PACKAGE_SHA256 = "336094811277f867f5370b53f7b8568733a73a3d2c45b7fa4e5faa3071866e84" as const;
type Entry = Readonly<{ id: string; url: string; retainedPath: string; retainedStatus: "retained"; byteSize: number; sha256: string; kind: string; parentIds: readonly string[] }>;
export type MinnesotaPrimaryInput = Readonly<{ entry: Entry; bytes: Buffer | Uint8Array | string }>;
export type MinnesotaPrimaryParentInput = Readonly<{ value: unknown; fileSha256: string }>;

const PARENT_FILE_SHA256 = "85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1";
const PARENT_PACKAGE_SHA256 = "a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb";
const DECISION_IDS = ["collect-official-state-primary-results-and-certification-v1", "decide-nonstandard-primary-disposition-treatment-v1"] as const;
const TARGET_DISTRICTS = ["02", "03", "04", "05"] as const;
const bytes = (value: Buffer | Uint8Array | string) => typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");

const SOURCE_TOPOLOGY = {
  "mn-2022-primary-results-landing": ["https://www.sos.mn.gov/elections-voting/election-results/2022/2022-primary-election-results/", "data/source/elections/primary-results/minnesota/2022/primary-results-landing.html", "official_primary_results_landing", []],
  "mn-2022-primary-media-files-index": ["https://electionresults.sos.mn.gov/Select/MediaFiles/Index?ersElectionId=148", "data/source/elections/primary-results/minnesota/2022/media-files-index.html", "official_result_file_index", []],
  "mn-2022-primary-ushouse-results": ["https://electionresultsfiles.sos.mn.gov/20220809/ushouse.txt", "data/source/elections/primary-results/minnesota/2022/ushouse.txt", "official_election_night_result_file", ["mn-2022-primary-media-files-index"]],
  "mn-2022-primary-candidate-table": ["https://electionresultsfiles.sos.mn.gov/20220809/cand.txt", "data/source/elections/primary-results/minnesota/2022/candidates.txt", "official_election_supporting_table", ["mn-2022-primary-media-files-index"]],
  "mn-2022-state-primary-canvass-document-record": ["https://officialdocuments.sos.mn.gov/Document/Details/139544", "data/source/elections/primary-results/minnesota/2022/state-canvass-document-record.html", "official_canvass_document_metadata", []],
  "mn-2024-primary-results-landing": ["https://www.sos.mn.gov/elections-voting/election-results/2024/2024-primary-election-results/", "data/source/elections/primary-results/minnesota/2024/primary-results-landing.html", "official_primary_results_landing", []],
  "mn-2024-primary-ushouse-results": ["https://electionresultsfiles.sos.mn.gov/20240813/ushouse.txt", "data/source/elections/primary-results/minnesota/2024/ushouse.txt", "official_election_night_result_file", []],
  "mn-2024-primary-candidate-table": ["https://electionresultsfiles.sos.mn.gov/20240813/cand.txt", "data/source/elections/primary-results/minnesota/2024/candidates.txt", "official_election_supporting_table", []],
  "mn-2024-primary-media-file-layout": ["https://electionresults.sos.mn.gov/Results/MediaFileLayout/Index?erselectionId=169", "data/source/elections/primary-results/minnesota/2024/media-file-layout.html", "official_result_file_layout", []],
  "mn-2024-state-primary-canvass-document-record": ["https://officialdocuments.sos.mn.gov/Document/Details/150165", "data/source/elections/primary-results/minnesota/2024/state-canvass-document-record.html", "official_canvass_document_metadata", []],
  "mn-primary-date-and-omission-statute-204d03-20260806": ["https://www.revisor.mn.gov/statutes/cite/204D.03", "data/source/elections/primary-results/minnesota/authority/statute-204d03.html", "official_statutory_authority", []],
} as const;
const SOURCE_FINGERPRINTS = {
  "mn-2022-primary-results-landing": [48249, "f3716b13db01774eb41381b1360328e8172b76a75ca750af5908463643ef14e5"],
  "mn-2022-primary-media-files-index": [43665, "e9cd60975a5faee9637494482c7d1fd11f8cb0ff85376cc45186d5bce0630a83"],
  "mn-2022-primary-ushouse-results": [2726, "cdb828e50c2b6ef6a9c2b19a828970dab7b181571d77e39b40ca629cae74ac9a"],
  "mn-2022-primary-candidate-table": [31840, "e3f73c12d1eee3a56633d0999861f00fb7525ce7b50bd19b467aadac7f416477"],
  "mn-2022-state-primary-canvass-document-record": [34669, "d8fa8a9efc539bd76ba5a54fc53bda005c3b46b46bfe0601c5e4911eb0914483"],
  "mn-2024-primary-results-landing": [45890, "750b071f8045fbe17abddb1c0cff9cc3805453ff3448886a3c62ba9cdbfbe87e"],
  "mn-2024-primary-ushouse-results": [2530, "4deba4991ea309c037dd7306116d5c587ffea82172bc8f9d82f7e1a51c365769"],
  "mn-2024-primary-candidate-table": [15720, "92b27af5693ee63f73bfacbf9840b5ecfd8b3c3848f56dd88ce1fc90f3864992"],
  "mn-2024-primary-media-file-layout": [6428, "9643903869d1f1e684117c2d85906bf2ba649113c23c0a983d26e92ae9dc3ff3"],
  "mn-2024-state-primary-canvass-document-record": [34482, "96fb7c18a340c0eaccde3af20efbda923fa04019cc9c772f82302778c7962613"],
  "mn-primary-date-and-omission-statute-204d03-20260806": [64332, "884f7e79e27a1ec451527ee7a298cc8802406fa9d0d9ca7437623dd2bb1e165d"],
} as const;
const EXPECTED_SOURCE_IDS = Object.keys(SOURCE_TOPOLOGY).sort(bytewise);
const topologyValid = (entry: Entry): boolean => {
  const expected = SOURCE_TOPOLOGY[entry.id as keyof typeof SOURCE_TOPOLOGY];
  const fingerprint = SOURCE_FINGERPRINTS[entry.id as keyof typeof SOURCE_FINGERPRINTS];
  return expected !== undefined && fingerprint !== undefined && entry.retainedStatus === "retained" && entry.url === expected[0] && entry.retainedPath === expected[1] && entry.kind === expected[2] && canonicalJson(entry.parentIds) === canonicalJson(expected[3]) && entry.byteSize === fingerprint[0] && entry.sha256 === fingerprint[1];
};
const checked = (input: MinnesotaPrimaryInput): Buffer => {
  const value = bytes(input.bytes);
  if (input.entry.retainedStatus !== "retained" || value.length !== input.entry.byteSize || sha(value) !== input.entry.sha256) fail("SOURCE_BYTES_INVALID");
  return value;
};

export function buildMinnesotaPrimaryReceipt(inputs: readonly MinnesotaPrimaryInput[], parentInput: MinnesotaPrimaryParentInput, generatedAt = "2026-08-06T18:00:00.000Z") {
  const parent = validateHouseDemocraticPrimarySourceSelectionProposal(parentInput.value);
  if (parentInput.fileSha256 !== PARENT_FILE_SHA256 || parent.packageSha256 !== PARENT_PACKAGE_SHA256) fail("PARENT_INVALID");
  if (DECISION_IDS.some((id) => parent.decisions.find((decision) => decision.decisionId === id)?.resolution !== null)) fail("PARENT_DECISION_DRIFT");
  if (!/^2026-08-06T\d{2}:\d{2}:\d{2}\.000Z$/.test(generatedAt)) fail("GENERATED_AT_INVALID");
  const byId = new Map(inputs.map((input) => [input.entry.id, input]));
  if (inputs.length !== EXPECTED_SOURCE_IDS.length || byId.size !== EXPECTED_SOURCE_IDS.length || canonicalJson([...byId.keys()].sort(bytewise)) !== canonicalJson(EXPECTED_SOURCE_IDS) || inputs.some((input) => !topologyValid(input.entry))) fail("SOURCE_CLOSURE_INVALID");
  const required = (id: string): MinnesotaPrimaryInput => byId.get(id) ?? fail("SOURCE_MISSING");
  for (const input of inputs) checked(input);

  const landing2022 = checked(required("mn-2022-primary-results-landing")).toString("utf8");
  const mediaIndex2022 = checked(required("mn-2022-primary-media-files-index")).toString("utf8");
  const landing2024 = checked(required("mn-2024-primary-results-landing")).toString("utf8");
  const layout2024 = checked(required("mn-2024-primary-media-file-layout")).toString("utf8");
  const canvass2022 = checked(required("mn-2022-state-primary-canvass-document-record")).toString("utf8");
  const canvass2024 = checked(required("mn-2024-state-primary-canvass-document-record")).toString("utf8");
  const statute = checked(required("mn-primary-date-and-omission-statute-204d03-20260806")).toString("utf8");
  if (!landing2022.includes("2022 Primary Election Results") || !mediaIndex2022.includes("Unofficial Results  Tuesday, August 9, 2022") || !mediaIndex2022.includes('href="/148"') || !mediaIndex2022.includes("https://electionresultsfiles.sos.mn.gov/20220809/ushouse.txt") || !mediaIndex2022.includes("https://electionresultsfiles.sos.mn.gov/20220809/cand.txt") || !landing2024.includes("2024 Primary Election Results") || !layout2024.includes("2024 State Primary Election Results") || !layout2024.includes("Election results may change after being reported initially on election night.")) fail("PORTAL_AUTHORITY_INVALID");
  if (!canvass2022.includes("Document Number:&nbsp;</span>224057") || !canvass2022.includes("Tuesday, August 9, 2022") || !canvass2022.includes("Date on Document:&nbsp;</span>Aug 16 2022") || !canvass2024.includes("Document Number:&nbsp;</span>20242807") || !canvass2024.includes("State Primary - Declarations for State and Federal Partisan Offices and Judicial Offices") || !canvass2024.includes("Date on Document:&nbsp;</span>Aug 20 2024")) fail("CANVASS_RECORD_INVALID");
  if (!statute.includes("second Tuesday in August in each even-numbered year") || !statute.includes("candidate who filed must be declared the nominee upon the close of filing") || !statute.includes("office must be omitted from the state primary ballot")) fail("STATUTORY_AUTHORITY_INVALID");

  const parsed = ([2022, 2024] as const).map((cycleYear) => parseMinnesotaHouseDflPrimaryResults({
    cycleYear,
    resultText: checked(required(`mn-${cycleYear}-primary-ushouse-results`)).toString("utf8"),
    candidateText: checked(required(`mn-${cycleYear}-primary-candidate-table`)).toString("utf8"),
  }));
  const sourceContests = parsed.flatMap((result) => result.contests.map((contest) => {
    const contestId = `mn:${contest.cycleYear}:regular:us-house:${contest.districtCode}:dfl`;
    const unsigned = { ...contest, contestId, resultStatus: "official_portal_reported_result_not_claimed_as_certified_result_bytes" as const, selectionStatus: "unselected" as const, scoreEligible: false as const };
    return { ...unsigned, contestSha256: digest("dsa-seats:mn-house-democratic-primary-source-contest:v1\0", unsigned) };
  })).sort((left, right) => bytewise(left.contestId, right.contestId));
  const sourceByCycleDistrict = new Map(sourceContests.map((contest) => [`${contest.cycleYear}:${contest.districtCode}`, contest]));
  const targetObservations = ([2022, 2024] as const).flatMap((cycleYear) => TARGET_DISTRICTS.map((districtCode) => {
    const contest = sourceByCycleDistrict.get(`${cycleYear}:${districtCode}`);
    const unsigned = {
      seatCycleId: `mn:${cycleYear}:us-house:${districtCode}:democratic`, cycleYear, districtCode,
      sourceStatus: contest ? "portal_reported_contest" as const : "source_absent_no_disposition_inference" as const,
      sourceContestId: contest?.contestId ?? null, sourceContestSha256: contest?.contestSha256 ?? null,
      sourceAbsenceMeaning: contest ? null : "not_zero_not_no_primary_not_uncontested_not_nominated" as const,
      currentIdentityStatus: "not_reviewed" as const, geographyStatus: "not_reviewed" as const,
      dispositionStatus: "not_reviewed" as const, selectionStatus: "unselected" as const, scoreEligible: false as const,
      evaluatorValues: { priorPrimaryMargin: null, priorDemocraticPrimaryVotes: null, priorProgressivePrimaryShare: null },
    };
    return { ...unsigned, rowSha256: digest("dsa-seats:mn-house-democratic-primary-target-observation:v1\0", unsigned) };
  }));
  const sourceContestSetSha256 = digest("dsa-seats:mn-house-democratic-primary-source-contest-set:v1\0", sourceContests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const targetObservationSetSha256 = digest("dsa-seats:mn-house-democratic-primary-target-observation-set:v1\0", targetObservations.map(({ seatCycleId, rowSha256 }) => ({ seatCycleId, rowSha256 })));
  const sources = (inputs.map((input) => input.entry).sort((left, right) => bytewise(left.id, right.id))).map(sourceLockContent);
  const summary = {
    historicalCycles: 2 as const, scheduledFutureCycles: 1 as const,
    sourceContests: sourceContests.length, sourceCandidates: parsed.reduce((sum, result) => sum + result.summary.candidates, 0), sourceVotes: parsed.reduce((sum, result) => sum + result.summary.votes, 0),
    targetSeatCycleObservations: targetObservations.length, targetReportedContests: targetObservations.filter((row) => row.sourceStatus === "portal_reported_contest").length,
    targetSourceAbsentObservations: targetObservations.filter((row) => row.sourceStatus === "source_absent_no_disposition_inference").length,
    contests2026: 0 as const, sourceContestSetSha256, targetObservationSetSha256, evaluatorNumericValues: 0 as const, scoreEligibleContests: 0 as const,
  };
  const unsigned = {
    schema: MINNESOTA_PRIMARY_RESULTS_V1, version: 1 as const, generatedAt, sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const, publicationEligible: false as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    parentProposal: { id: "house-democratic-primary-source-selection-proposal-20260804-v1" as const, fileSha256: PARENT_FILE_SHA256, packageSha256: PARENT_PACKAGE_SHA256 },
    decisionSupport: DECISION_IDS.map((decisionId) => ({ decisionId, lifecycle: "evidence_for_bound_existing_decision_not_an_independent_decision" as const })),
    inheritedDecisionResolutions: DECISION_IDS.map((decisionId) => ({ decisionId, resolution: null })),
    authority: { publisher: "Minnesota Secretary of State" as const, resultSystem: "Election Night Reporting flat files" as const, rawPartyCode: "DFL" as const, resultPayloadFinality: "portal_reported_not_claimed_certified" as const, sourceWinnerStatus: "not_marked_by_source" as const, exactCanvassReportBytesRetained: false as const },
    cycles: [
      { cycleYear: 2022 as const, electionDate: "2022-08-09" as const, sourceElectionId: 148 as const, status: "retained_portal_reported_results" as const },
      { cycleYear: 2024 as const, electionDate: "2024-08-13" as const, sourceElectionId: 169 as const, status: "retained_portal_reported_results" as const },
      { cycleYear: 2026 as const, scheduledElectionDate: "2026-08-11" as const, sourceElectionId: null, status: "scheduled_not_held_at_source_cutoff" as const, resultRows: 0 as const },
    ],
    certificationRecords: [
      { cycleYear: 2022 as const, sourceLockId: "mn-2022-state-primary-canvass-document-record" as const, documentNumber: "224057" as const, documentDate: "2022-08-16" as const, scope: "state_primary_and_state_canvassing_report_from_certified_county_abstracts" as const, exactReportBytesRetained: false as const, candidateByCandidateCertificationClaimed: false as const },
      { cycleYear: 2024 as const, sourceLockId: "mn-2024-state-primary-canvass-document-record" as const, documentNumber: "20242807" as const, documentDate: "2024-08-20" as const, scope: "state_primary_declarations_for_state_federal_partisan_and_judicial_offices" as const, exactReportBytesRetained: false as const, candidateByCandidateCertificationClaimed: false as const },
    ],
    sources, sourceContests, targetObservations, summary,
    limitations: [
      "The retained result flat files are portal-reported rows; the retained official-document pages identify event-level canvass instruments but do not expose the exact report bytes for candidate-by-candidate reconciliation.",
      "A district absent from the DFL U.S. House result file is unresolved: Minnesota law permits some single-filer offices to be omitted, but absence alone does not prove one filer, no filer, no primary, an uncontested disposition, nomination, or zero votes.",
      "The raw Minnesota party label DFL is preserved and is not silently rewritten to DEM.",
      "The August 11, 2026 primary date is derived from the retained statutory second-Tuesday-in-August rule; the event had not occurred at the source cutoff and contributes zero result rows.",
    ],
    unresolvedGates: ["review_incumbent_candidate_identity", "review_historical_district_compatibility", "decide_nonstandard_primary_disposition_treatment", "review_progressive_candidate_classification", "complete_human_data_review_and_publication_approval"],
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:mn-house-democratic-primary-result-package:v1\0", unsigned) };
}

export type MinnesotaPrimaryReceipt = ReturnType<typeof buildMinnesotaPrimaryReceipt>;

export function assertMinnesotaPrimarySemanticInvariants(value: MinnesotaPrimaryReceipt): void {
  const expectedCycles = [
    { cycleYear: 2022, electionDate: "2022-08-09", sourceElectionId: 148, status: "retained_portal_reported_results" },
    { cycleYear: 2024, electionDate: "2024-08-13", sourceElectionId: 169, status: "retained_portal_reported_results" },
    { cycleYear: 2026, scheduledElectionDate: "2026-08-11", sourceElectionId: null, status: "scheduled_not_held_at_source_cutoff", resultRows: 0 },
  ];
  const contestHashesValid = value.sourceContests.every((contest) => { const { contestSha256, ...unsigned } = contest; return contestSha256 === digest("dsa-seats:mn-house-democratic-primary-source-contest:v1\0", unsigned); });
  const rowHashesValid = value.targetObservations.every((row) => { const { rowSha256, ...unsigned } = row; return rowSha256 === digest("dsa-seats:mn-house-democratic-primary-target-observation:v1\0", unsigned); });
  const targetStatuses = value.targetObservations.map((row) => [row.cycleYear, row.districtCode, row.sourceStatus]);
  const expectedStatuses = [[2022,"02","source_absent_no_disposition_inference"],[2022,"03","source_absent_no_disposition_inference"],[2022,"04","portal_reported_contest"],[2022,"05","portal_reported_contest"],[2024,"02","portal_reported_contest"],[2024,"03","source_absent_no_disposition_inference"],[2024,"04","portal_reported_contest"],[2024,"05","portal_reported_contest"]];
  const sourceSet = digest("dsa-seats:mn-house-democratic-primary-source-contest-set:v1\0", value.sourceContests.map(({ contestId, contestSha256 }) => ({ contestId, contestSha256 })));
  const targetSet = digest("dsa-seats:mn-house-democratic-primary-target-observation-set:v1\0", value.targetObservations.map(({ seatCycleId, rowSha256 }) => ({ seatCycleId, rowSha256 })));
  if (value.schema !== MINNESOTA_PRIMARY_RESULTS_V1 || value.version !== 1 || value.sourceCutoff !== "2026-08-06" || value.reviewerOnly !== true || value.publicationEligible !== false || value.review.status !== "proposed" || value.review.reviewer !== null || value.review.reviewedAt !== null || value.review.resolution !== null || value.parentProposal.fileSha256 !== PARENT_FILE_SHA256 || value.parentProposal.packageSha256 !== PARENT_PACKAGE_SHA256 || canonicalJson(value.decisionSupport.map((item) => item.decisionId)) !== canonicalJson(DECISION_IDS) || value.inheritedDecisionResolutions.some((item) => item.resolution !== null) || canonicalJson(value.sources.map((entry) => entry.id).sort(bytewise)) !== canonicalJson(EXPECTED_SOURCE_IDS) || value.sources.some((entry) => !topologyValid(entry)) || canonicalJson(value.cycles) !== canonicalJson(expectedCycles) || value.authority.rawPartyCode !== "DFL" || value.authority.resultPayloadFinality !== "portal_reported_not_claimed_certified" || value.authority.exactCanvassReportBytesRetained !== false || value.certificationRecords.some((record) => record.exactReportBytesRetained || record.candidateByCandidateCertificationClaimed) || value.sourceContests.length !== 12 || !contestHashesValid || value.sourceContests.some((contest) => contest.resultStatus !== "official_portal_reported_result_not_claimed_as_certified_result_bytes" || contest.sourceWinnerStatus !== "not_marked_by_source" || contest.selectionStatus !== "unselected" || contest.scoreEligible) || value.targetObservations.length !== 8 || !rowHashesValid || canonicalJson(targetStatuses) !== canonicalJson(expectedStatuses) || value.targetObservations.some((row) => row.currentIdentityStatus !== "not_reviewed" || row.geographyStatus !== "not_reviewed" || row.dispositionStatus !== "not_reviewed" || row.selectionStatus !== "unselected" || row.scoreEligible || Object.values(row.evaluatorValues).some((item) => item !== null)) || value.summary.sourceContests !== 12 || value.summary.sourceCandidates !== 28 || value.summary.sourceVotes !== 593199 || value.summary.targetSeatCycleObservations !== 8 || value.summary.targetReportedContests !== 5 || value.summary.targetSourceAbsentObservations !== 3 || value.summary.contests2026 !== 0 || value.summary.evaluatorNumericValues !== 0 || value.summary.scoreEligibleContests !== 0 || sourceSet !== MINNESOTA_PRIMARY_SOURCE_CONTEST_SET_SHA256 || targetSet !== MINNESOTA_PRIMARY_TARGET_OBSERVATION_SET_SHA256 || value.summary.sourceContestSetSha256 !== sourceSet || value.summary.targetObservationSetSha256 !== targetSet) fail("SEMANTIC_INVARIANT_INVALID");
}

export function validateMinnesotaPrimaryReceipt(value: MinnesotaPrimaryReceipt): MinnesotaPrimaryReceipt {
  assertMinnesotaPrimarySemanticInvariants(value);
  const { packageSha256, ...unsigned } = value;
  if (packageSha256 !== MINNESOTA_PRIMARY_PACKAGE_SHA256 || packageSha256 !== digest("dsa-seats:mn-house-democratic-primary-result-package:v1\0", unsigned)) fail("PACKAGE_INVALID");
  return value;
}
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";
