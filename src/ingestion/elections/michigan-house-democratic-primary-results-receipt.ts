import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";

export const MICHIGAN_PRIMARY_RESULTS_V1 = "michigan-house-democratic-primary-results-2022-2026-v1" as const;
export const MICHIGAN_PRIMARY_CONTEST_SET_SHA256 = "7ea71a3fa253949ad111d8eea53d9c4986cc5a5ead2d42222243b27e98240f25";
export const MICHIGAN_PRIMARY_PACKAGE_SHA256 = "6572ccc3e4a9e40e36efaa33e02347330687fd8886b62887b9d095723b1492c3";

type SourceEntry = Readonly<{ id:string; url:string; retainedPath:string; retainedStatus:"retained"; byteSize:number; sha256:string; kind:string; parentIds:readonly string[] }>;
export type MichiganPrimaryInput = Readonly<{ entry:SourceEntry; bytes:Buffer|Uint8Array|string }>;
export type MichiganParentInput = Readonly<{ value:unknown; fileSha256:string }>;
type Candidate = Readonly<{ sourceCandidateId:null; sourceCandidateName:string; sourceBallotParty:"DEMOCRATIC"|"DEMOCRATIC WRITE-IN"; sourceVotePercent:string; votes:number; sourceWinnerMarker:null }>;
type Contest = Readonly<{ contestId:string; contestSha256:string; cycleYear:2022|2024; electionDate:"2022-08-02"|"2024-08-06"; stateCode:"MI"; districtCode:string; party:"Democratic"; office:"U.S. House of Representatives"; sourceLockIds:readonly string[]; sourceContestTitle:string; resultAuthorityStatus:"official_result_retained"; certificationStatus:"state_board_event_certification_retained"; reportingCompleteness:"83_of_83_counties_official"; candidates:readonly Candidate[]; aggregateWriteInVotes:number; sourceTotalVotes:number; voteReconciliation:"named_candidate_plus_aggregate_write_in_sum_equals_source_party_total"; sourceWinnerStatus:"not_marked_by_source"; winnerSourceCandidateName:null; disposition:"reported_contest"; currentIdentityStatus:"not_reviewed"; geographyStatus:"not_reviewed"; selectionStatus:"unselected"; scoreEligible:false; evaluatorValues:Readonly<{priorPrimaryMargin:null;priorDemocraticPrimaryVotes:null;priorProgressivePrimaryShare:null}> }>;
export type MichiganPrimaryReceipt = Readonly<{ schema:typeof MICHIGAN_PRIMARY_RESULTS_V1; version:1; generatedAt:string; sourceCutoff:"2026-08-05"; reviewerOnly:true; publicationEligible:false; review:Readonly<{status:"proposed";reviewer:null;reviewedAt:null;resolution:null}>; parentProposal:Readonly<{id:"house-democratic-primary-source-selection-proposal-20260804-v1";fileSha256:"85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1";packageSha256:"a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb"}>; decisionSupport:readonly Readonly<{decisionId:string;lifecycle:"evidence_for_bound_existing_decision_not_an_independent_decision"}>[]; inheritedDecisionResolutions:readonly Readonly<{decisionId:string;resolution:null}>[]; cycles:readonly unknown[]; sources:readonly SourceEntry[]; contests:readonly Contest[]; summary:Readonly<{districtCycleRows:number;reportedContests:number;contests2022:number;contests2024:number;contests2026:0;namedCandidates:number;namedCandidateVotes:number;aggregateWriteInVotes:number;totalVotes:number;officialContests:number;unofficialResultRowsRetained:0;evaluatorNumericValues:0;scoreEligibleContests:0;contestSetSha256:string}>; limitations:readonly string[]; unresolvedGates:readonly string[]; packageSha256:string }>;

const EXPECTED = {
  "mi-2022-house-democratic-primary-results-browser": ["https://mvic.sos.state.mi.us/votehistory/Index?electionDate=8-2-2022&type=C","data/source/elections/primary-results/michigan/2022/official-results-browser.json",7798,"3616cfc7cf96a7c56badf36f53a080ca43549a72e58d5c3c21d7532eabfeb813","browser_rendered_source",[]],
  "mi-2022-primary-board-certification-html": ["https://www.michigan.gov/sos/resources/news/2022/08/19/board-of-state-canvassers-certifies-primary-elections","data/source/elections/primary-results/michigan/2022/board-certification-20220819.html",363123,"7e70d9c9a00b4422639a29297ad604aef24027ddf4febeef94e932c5e295ba7b","source_snapshot",[]],
  "mi-2024-house-democratic-primary-results-browser": ["https://mvic.sos.state.mi.us/votehistory/Index?electionDate=8-6-2024&type=C","data/source/elections/primary-results/michigan/2024/official-results-browser.json",6861,"e9a469840c98f9a583e4ad599c9fa5ba52b0a4ea0b32aada1857ce204d6d49ee","browser_rendered_source",[]],
  "mi-2024-primary-board-signed-minutes-pdf": ["https://www.michigan.gov/sos/-/media/Project/Websites/sos/BSC-Meeting-Minutes/2024/August-26-2024-Signed-BSC-Minutes.pdf?hash=075A98A50AB2C24A4B4EE050E4E98620&rev=f1420286bcdb474ea11a44b1036cac58","data/source/elections/primary-results/michigan/2024/board-signed-minutes-20240826.pdf",78686,"bafbce4fa43b6d6dd9e4070dbd37e16c3a62ed22293c05441bb5d885c1d8aaa1","source",[]],
  "mi-2024-primary-board-signed-minutes-text": ["urn:dsa-seats:mi-2024-primary-board-signed-minutes-pdf:pdftotext-layout","data/source/elections/primary-results/michigan/2024/board-signed-minutes-20240826.txt",4984,"58595e6c8652e5d81f0123082de99cd356e8e6432ac3f3da435b2405f954b3f0","derived_extract",["mi-2024-primary-board-signed-minutes-pdf"]],
  "mi-2026-primary-unofficial-boundary-browser-20260805": ["https://mvic.sos.state.mi.us/votehistory/Index?electionDate=8-4-2026&type=C","data/source/elections/primary-results/michigan/2026/unofficial-boundary-browser-20260805.json",651,"a570693f064ff1d6f422d77f9731ebd3c746ac2aad08972d939febb54dc4da5c","browser_rendered_source",[]],
  "mi-2026-election-dates-pdf": ["https://www.michigan.gov/sos/-/media/Project/Websites/sos/Election-Administrators/Election-Dates.pdf?hash=F0FBD11679BF8C04E25673B229C7D7AF&rev=7ace12d9ec324db0988852b06d996d79","data/source/elections/primary-results/michigan/authority/2026-election-dates.pdf",2378428,"865ddeb9d94fd700ebb3a0b7f0ed180e0a23a3d1cc40e5a72dfc585ac3062f74","source",[]],
  "mi-2026-election-dates-text": ["urn:dsa-seats:mi-2026-election-dates-pdf:pdftotext-layout","data/source/elections/primary-results/michigan/authority/2026-election-dates.txt",63723,"d53be9da0af24e1e7e59e3dd9745331378f5a87f4b8f1c72d2d6a1b4a00b4f7e","derived_extract",["mi-2026-election-dates-pdf"]],
  "mi-primary-results-catalog-snapshot-20260805": ["https://www.michigan.gov/sos/elections/election-results-and-data","data/source/elections/primary-results/michigan/authority/results-catalog-20260805.html",421271,"0930816d6ca5105737b7f188160570ea436b4555ee868af4783fdfa1f125aa00","source_snapshot",[]],
  "mi-canvass-certification-authority-snapshot-20260805": ["https://www.michigan.gov/sos/elections/security","data/source/elections/primary-results/michigan/authority/canvass-certification-authority-20260805.html",440181,"d5cfba8c05a6dcb6f5631cabb5bebfbd67a7ae791b7d23115cc8e37a2fa9389f","source_snapshot",[]],
} as const;
type ExpectedId = keyof typeof EXPECTED;
const EXPECTED_IDS = Object.keys(EXPECTED) as ExpectedId[];
const DECISION_IDS = ["collect-official-state-primary-results-and-certification-v1","decide-nonstandard-primary-disposition-treatment-v1"] as const;
const sha=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");
const digest=(domain:string,value:unknown)=>createHash("sha256").update(domain,"ascii").update(canonicalJson(value),"utf8").digest("hex");
const bytes=(value:Buffer|Uint8Array|string)=>typeof value==="string"?Buffer.from(value):Buffer.from(value);
const fail=(code:string):never=>{throw new Error(`Michigan primary results rejected: ${code}`)};
const record=(value:unknown):Record<string,unknown>=>{if(value===null||typeof value!=="object"||Array.isArray(value))fail("OBJECT_INVALID");return value as Record<string,unknown>};
const list=(value:unknown):unknown[]=>{if(!Array.isArray(value))return fail("ARRAY_INVALID");return value as unknown[]};
const checked=(input:MichiganPrimaryInput):Buffer=>{const value=bytes(input.bytes);if(input.entry.retainedStatus!=="retained"||value.length!==input.entry.byteSize||sha(value)!==input.entry.sha256)fail("SOURCE_BYTES_INVALID");return value};
const parsed=(input:MichiganPrimaryInput):Record<string,unknown>=>{try{return record(JSON.parse(checked(input).toString("utf8")))}catch{return fail("JSON_INVALID")}};
const expectedSource=(entry:SourceEntry):boolean=>{const spec=EXPECTED[entry.id as ExpectedId];return spec!==undefined&&entry.url===spec[0]&&entry.retainedPath===spec[1]&&entry.byteSize===spec[2]&&entry.sha256===spec[3]&&entry.kind===spec[4]&&canonicalJson(entry.parentIds)===canonicalJson(spec[5])};

export function buildMichiganPrimaryReceipt(inputs:readonly MichiganPrimaryInput[],parentInput:MichiganParentInput,generatedAt="2026-08-05T18:30:00.000Z"):MichiganPrimaryReceipt {
  const parent=validateHouseDemocraticPrimarySourceSelectionProposal(parentInput.value);
  if(parentInput.fileSha256!=="85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1"||parent.packageSha256!=="a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb"||DECISION_IDS.some(id=>parent.decisions.find(decision=>decision.decisionId===id)?.resolution!==null))fail("PARENT_INVALID");
  if(!/^2026-08-05T\d{2}:\d{2}:\d{2}\.000Z$/.test(generatedAt))fail("GENERATED_AT_INVALID");
  const byId=new Map(inputs.map(input=>[input.entry.id,input]));
  if(inputs.length!==EXPECTED_IDS.length||byId.size!==EXPECTED_IDS.length||EXPECTED_IDS.some(id=>!byId.has(id))||inputs.some(input=>!expectedSource(input.entry)))fail("SOURCE_CLOSURE_INVALID");
  const required=(id:ExpectedId):MichiganPrimaryInput=>byId.get(id)??fail("SOURCE_MISSING");
  for(const input of inputs)checked(input);
  const catalog=checked(required("mi-primary-results-catalog-snapshot-20260805")).toString("utf8");
  if(!["8-2-2022","8-6-2024","8-4-2026"].every(value=>catalog.includes(`electionDate=${value}`)))fail("CATALOG_SCOPE_INVALID");
  const certification2022=checked(required("mi-2022-primary-board-certification-html")).toString("utf8");
  if(!certification2022.includes("unanimously voted to certify the August primary elections")||!certification2022.includes("state&rsquo;s 83 counties"))fail("CERTIFICATION_2022_INVALID");
  const certification2024=checked(required("mi-2024-primary-board-signed-minutes-text")).toString("utf8");
  if(!certification2024.includes("Canvass and certification of the August 6, 2024 primary election")||!certification2024.includes("true statement of the votes"))fail("CERTIFICATION_2024_INVALID");
  const authority=checked(required("mi-canvass-certification-authority-snapshot-20260805")).toString("utf8");
  if(!authority.includes("correct any errors before certifying the election and making results official"))fail("CERTIFICATION_AUTHORITY_INVALID");
  const calendar=checked(required("mi-2026-election-dates-text")).toString("utf8");
  if(!calendar.includes("Tuesday, Aug. 18, 2026")||!calendar.includes("Monday, Aug. 24, 2026"))fail("BOUNDARY_2026_AUTHORITY_INVALID");
  const boundary=parsed(required("mi-2026-primary-unofficial-boundary-browser-20260805"));
  if(boundary.status!=="UNOFFICIAL"||boundary.countiesReported!==82||boundary.countiesTotal!==83||boundary.observedHouseContestCount!==12||boundary.observedCandidateRows!==26||boundary.retainedResultRows!==0||boundary.retentionReason!=="unofficial_results_not_retained_pending_county_and_state_canvass")fail("BOUNDARY_2026_INVALID");

  const contests:Contest[]=[];
  for(const [year,id,date,updated] of [[2022,"mi-2022-house-democratic-primary-results-browser","2022-08-02","1/1/2024 12:00:00 AM"],[2024,"mi-2024-house-democratic-primary-results-browser","2024-08-06","8/26/2024 3:28:01 PM"]] as const){
    const source=parsed(required(id));
    if(source.captureKind!=="browser_rendered_official_results"||source.status!=="OFFICIAL"||source.countiesReported!==83||source.countiesTotal!==83||source.updatedAt!==updated||source.electionDate!==(year===2022?"8/2/2022":"8/6/2024"))fail(`RESULT_${year}_SCOPE_INVALID`);
    const rows=list(source.contests);
    if(rows.length!==13)fail(`RESULT_${year}_CLOSURE_INVALID`);
    for(const raw of rows){
      const row=record(raw),district=row.district;
      if(!Number.isSafeInteger(district)||Number(district)<1||Number(district)>13||typeof row.title!=="string"||row.party!=="Democratic"||!Number.isSafeInteger(row.partyTotalVotes))fail(`RESULT_${year}_CONTEST_INVALID`);
      const allCandidates=list(row.candidates).map(record),aggregateRows=allCandidates.filter(candidate=>candidate.name==="WRITE-IN"),namedRows=allCandidates.filter(candidate=>candidate.name!=="WRITE-IN");
      if(aggregateRows.some(candidate=>candidate.party!=="DEMOCRATIC")||aggregateRows.length>(year===2024?1:0))fail(`RESULT_${year}_WRITE_IN_INVALID`);
      const candidates=namedRows.map(candidate=>{if(typeof candidate.name!=="string"||(candidate.party!=="DEMOCRATIC"&&candidate.party!=="DEMOCRATIC WRITE-IN")||typeof candidate.percent!=="string"||!Number.isSafeInteger(candidate.votes)||Number(candidate.votes)<0)fail(`RESULT_${year}_CANDIDATE_INVALID`);return{sourceCandidateId:null,sourceCandidateName:candidate.name,sourceBallotParty:candidate.party,sourceVotePercent:candidate.percent,votes:Number(candidate.votes),sourceWinnerMarker:null} as Candidate});
      const aggregateWriteInVotes=aggregateRows.reduce((sum,candidate)=>sum+Number(candidate.votes),0),sourceTotalVotes=Number(row.partyTotalVotes);
      if(candidates.length===0||new Set(candidates.map(candidate=>candidate.sourceCandidateName)).size!==candidates.length||candidates.reduce((sum,candidate)=>sum+candidate.votes,aggregateWriteInVotes)!==sourceTotalVotes)fail(`RESULT_${year}_RECONCILIATION_INVALID`);
      const districtCode=String(district).padStart(2,"0"),sourceLockIds=year===2022?[id,"mi-2022-primary-board-certification-html","mi-primary-results-catalog-snapshot-20260805","mi-canvass-certification-authority-snapshot-20260805"]:[id,"mi-2024-primary-board-signed-minutes-pdf","mi-2024-primary-board-signed-minutes-text","mi-primary-results-catalog-snapshot-20260805","mi-canvass-certification-authority-snapshot-20260805"];
      const base={contestId:`mi:${year}:regular:us-house:${districtCode}:democratic`,cycleYear:year,electionDate:date,stateCode:"MI" as const,districtCode,party:"Democratic" as const,office:"U.S. House of Representatives" as const,sourceLockIds,sourceContestTitle:row.title as string,resultAuthorityStatus:"official_result_retained" as const,certificationStatus:"state_board_event_certification_retained" as const,reportingCompleteness:"83_of_83_counties_official" as const,candidates,aggregateWriteInVotes,sourceTotalVotes,voteReconciliation:"named_candidate_plus_aggregate_write_in_sum_equals_source_party_total" as const,sourceWinnerStatus:"not_marked_by_source" as const,winnerSourceCandidateName:null,disposition:"reported_contest" as const,currentIdentityStatus:"not_reviewed" as const,geographyStatus:"not_reviewed" as const,selectionStatus:"unselected" as const,scoreEligible:false as const,evaluatorValues:{priorPrimaryMargin:null,priorDemocraticPrimaryVotes:null,priorProgressivePrimaryShare:null}};
      contests.push({...base,contestSha256:digest("dsa-seats:mi-house-democratic-primary-result:v1\0",base)});
    }
  }
  contests.sort((a,b)=>a.cycleYear-b.cycleYear||a.districtCode.localeCompare(b.districtCode));
  if(new Set(contests.map(contest=>contest.contestId)).size!==26)fail("CONTEST_SET_INVALID");
  const contestSetSha256=digest("dsa-seats:mi-house-democratic-primary-result-set:v1\0",contests.map(({contestId,contestSha256})=>({contestId,contestSha256})));
  const namedCandidateVotes=contests.flatMap(contest=>contest.candidates).reduce((sum,candidate)=>sum+candidate.votes,0),aggregateWriteInVotes=contests.reduce((sum,contest)=>sum+contest.aggregateWriteInVotes,0);
  const unsigned={schema:MICHIGAN_PRIMARY_RESULTS_V1,version:1 as const,generatedAt,sourceCutoff:"2026-08-05" as const,reviewerOnly:true as const,publicationEligible:false as const,review:{status:"proposed" as const,reviewer:null,reviewedAt:null,resolution:null},parentProposal:{id:"house-democratic-primary-source-selection-proposal-20260804-v1" as const,fileSha256:"85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1" as const,packageSha256:"a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" as const},decisionSupport:DECISION_IDS.map(decisionId=>({decisionId,lifecycle:"evidence_for_bound_existing_decision_not_an_independent_decision" as const})),inheritedDecisionResolutions:DECISION_IDS.map(decisionId=>({decisionId,resolution:null})),cycles:[{cycleYear:2022,status:"official_results_and_event_certification_retained",resultRowsRetained:13,candidateRowsRetained:31,countiesReported:83,countiesTotal:83},{cycleYear:2024,status:"official_results_and_event_certification_retained",resultRowsRetained:13,candidateRowsRetained:23,aggregateWriteInChannels:2,countiesReported:83,countiesTotal:83},{cycleYear:2026,status:"unofficial_results_not_retained_pending_county_and_state_canvass",resultRowsRetained:0,candidateRowsRetained:0,observedHouseContestCount:12,observedCandidateRows:26,countiesReported:82,countiesTotal:83,countyCanvassDeadline:"2026-08-18",stateCanvassDeadline:"2026-08-24"}],sources:(inputs.map(input=>input.entry).sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)))).map(sourceLockContent),contests,summary:{districtCycleRows:26,reportedContests:26,contests2022:13,contests2024:13,contests2026:0 as const,namedCandidates:contests.flatMap(contest=>contest.candidates).length,namedCandidateVotes,aggregateWriteInVotes,totalVotes:namedCandidateVotes+aggregateWriteInVotes,officialContests:26,unofficialResultRowsRetained:0 as const,evaluatorNumericValues:0 as const,scoreEligibleContests:0 as const,contestSetSha256},limitations:["The MVIC download route rejected unattended retrieval, so result evidence is a deterministic structured projection of the complete browser-rendered official statewide result page rather than the raw downloadable file.","Official result pages do not mark winners in the retained projection; no winner is inferred from vote rank.","Current candidate identity, district-geography comparability, ideology, incumbency, and evaluator applicability remain unreviewed.","The August 5, 2026 observation was unofficial at 82 of 83 counties; its 26 observed candidate rows are boundary evidence only and are not retained as results."],unresolvedGates:["Independent reviewer approval is required before factual promotion.","Current identity and historical-to-current district geography must be resolved before evaluator use.","A separately versioned 2026 package may be acquired only after county and state canvassing and certification."]};
  return {...unsigned,packageSha256:digest("dsa-seats:mi-house-democratic-primary-result-package:v1\0",unsigned)};
}

export function assertMichiganPrimarySemanticInvariants(value:MichiganPrimaryReceipt):void {
  if(value.schema!==MICHIGAN_PRIMARY_RESULTS_V1||value.version!==1||value.sourceCutoff!=="2026-08-05"||!value.reviewerOnly||value.publicationEligible||value.review.status!=="proposed"||value.review.reviewer!==null||value.review.reviewedAt!==null||value.review.resolution!==null)fail("LIFECYCLE_INVALID");
  if(value.contests.length!==26||value.contests.some(contest=>contest.scoreEligible||contest.sourceWinnerStatus!=="not_marked_by_source"||contest.winnerSourceCandidateName!==null||Object.values(contest.evaluatorValues).some(item=>item!==null)))fail("CONTEST_INVARIANT_INVALID");
  if(value.contests.some(contest=>contest.candidates.reduce((sum,candidate)=>sum+candidate.votes,contest.aggregateWriteInVotes)!==contest.sourceTotalVotes))fail("ARITHMETIC_INVALID");
  const cycle2026=record(value.cycles.find((cycle)=>record(cycle).cycleYear===2026));
  if(cycle2026.status!=="unofficial_results_not_retained_pending_county_and_state_canvass"||cycle2026.resultRowsRetained!==0||cycle2026.candidateRowsRetained!==0||cycle2026.countiesReported!==82||cycle2026.countiesTotal!==83)fail("BOUNDARY_2026_ESCALATED");
  const expected={districtCycleRows:26,reportedContests:26,contests2022:13,contests2024:13,contests2026:0,namedCandidates:54,namedCandidateVotes:1769732,aggregateWriteInVotes:572,totalVotes:1770304,officialContests:26,unofficialResultRowsRetained:0,evaluatorNumericValues:0,scoreEligibleContests:0};
  if(Object.entries(expected).some(([key,item])=>value.summary[key as keyof typeof value.summary]!==item))fail("SUMMARY_INVALID");
}

export function validateMichiganPrimaryReceipt(value:MichiganPrimaryReceipt):MichiganPrimaryReceipt {
  assertMichiganPrimarySemanticInvariants(value);
  const {packageSha256,...unsigned}=value;
  const contestSet=digest("dsa-seats:mi-house-democratic-primary-result-set:v1\0",value.contests.map(({contestId,contestSha256})=>({contestId,contestSha256})));
  if(packageSha256!==MICHIGAN_PRIMARY_PACKAGE_SHA256||packageSha256!==digest("dsa-seats:mi-house-democratic-primary-result-package:v1\0",unsigned)||contestSet!==MICHIGAN_PRIMARY_CONTEST_SET_SHA256||value.summary.contestSetSha256!==contestSet)fail("PACKAGE_INVALID");
  return value;
}
