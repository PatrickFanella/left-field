import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateHouseDemocraticPrimarySourceSelectionProposal } from "./house-democratic-primary-source-selection-proposal";

export const OREGON_PRIMARY_RESULTS_V1 = "oregon-house-democratic-primary-results-2022-2026-v1" as const;
export const OREGON_PRIMARY_CONTEST_SET_SHA256 = "4d9eedd708ebe4687d3aeeb0821448e2bf9939031e4a24317aa0c019c76e9ca1";
export const OREGON_PRIMARY_PACKAGE_SHA256 = "e27397dec36c7804ca220bd19647d5c18112f8a0b02f505b4ff443660bd1c25f";

type SourceEntry = Readonly<{ id:string; url:string; retainedPath:string; retainedStatus:"retained"; byteSize:number; sha256:string; kind:string; parentIds:readonly string[] }>;
export type OregonPrimaryInput = Readonly<{ entry:SourceEntry; bytes:Buffer|Uint8Array|string }>;
export type OregonParentInput = Readonly<{ value:unknown; fileSha256:string }>;
type Candidate = Readonly<{ sourceCandidateId:null; sourceCandidateName:string; votes:number; sourceNomineeMarker:"*"|null }>;
type Contest = Readonly<{ contestId:string; contestSha256:string; cycleYear:2022|2024|2026; electionDate:"2022-05-17"|"2024-05-21"|"2026-05-19"; stateCode:"OR"; districtCode:string; party:"Democratic"; office:"U.S. House of Representatives"; sourceLockIds:readonly string[]; sourceContestTitle:string; resultAuthorityStatus:"official_statewide_abstract_retained"; reportingCompleteness:"all_source_county_rows_reconciled_to_statewide_total"; candidates:readonly Candidate[]; aggregateMiscVotes:number; sourceTotalVotes:number; voteReconciliation:"named_candidate_plus_misc_sum_equals_source_party_total"; sourceNomineeStatus:"marked_by_source"; nomineeSourceCandidateName:string; currentIdentityStatus:"not_reviewed"; geographyStatus:"not_reviewed"; selectionStatus:"unselected"; scoreEligible:false; evaluatorValues:Readonly<{priorPrimaryMargin:null;priorDemocraticPrimaryVotes:null;priorProgressivePrimaryShare:null}> }>;
export type OregonPrimaryReceipt = Readonly<{ schema:typeof OREGON_PRIMARY_RESULTS_V1; version:1; generatedAt:string; sourceCutoff:"2026-08-05"; reviewerOnly:true; publicationEligible:false; review:Readonly<{status:"proposed";reviewer:null;reviewedAt:null;resolution:null}>; parentProposal:Readonly<{id:"house-democratic-primary-source-selection-proposal-20260804-v1";fileSha256:"85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1";packageSha256:"a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb"}>; decisionSupport:readonly Readonly<{decisionId:string;lifecycle:"evidence_for_bound_existing_decision_not_an_independent_decision"}>[]; inheritedDecisionResolutions:readonly Readonly<{decisionId:string;resolution:null}>[]; cycles:readonly unknown[]; sources:readonly SourceEntry[]; contests:readonly Contest[]; summary:Readonly<{districtCycleRows:18;reportedContests:18;contests2022:6;contests2024:6;contests2026:6;namedCandidates:number;namedCandidateVotes:number;aggregateMiscVotes:number;totalVotes:number;sourceMarkedNominees:18;evaluatorNumericValues:0;scoreEligibleContests:0;contestSetSha256:string}>; limitations:readonly string[]; unresolvedGates:readonly string[]; packageSha256:string }>;

const EXPECTED = {
  "or-2022-primary-official-abstract-pdf": ["https://records.sos.state.or.us/ORSOSCMSearch/Search/RecordViewer.aspx?uri=13735452","data/source/elections/primary-results/oregon/2022/official-primary-abstract.pdf",894875,"dd885013df98d584488091ffdf69d359a3a7fe494f037276fcda60f03e15beca","source",[]],
  "or-2022-primary-official-abstract-text": ["urn:dsa-seats:or-2022-primary-official-abstract-pdf:pdftotext-layout-26.07.0","data/source/elections/primary-results/oregon/2022/official-primary-abstract.txt",100865,"f54548a8d62c374dd7324c8de6b5146d6a72e5e65c6a43d12dd5b28b9b509b14","derived_extract",["or-2022-primary-official-abstract-pdf"]],
  "or-2024-primary-official-abstract-pdf": ["https://records.sos.state.or.us/ORSOSCMSearch/Search/RecordViewer.aspx?uri=13735456","data/source/elections/primary-results/oregon/2024/official-primary-abstract.pdf",1124897,"a3d68250380c4b49fbd8a7a98548822c0c0ad870cd61b90aa98b737f259c876d","source",[]],
  "or-2024-primary-official-abstract-text": ["urn:dsa-seats:or-2024-primary-official-abstract-pdf:pdftotext-layout-26.07.0","data/source/elections/primary-results/oregon/2024/official-primary-abstract.txt",105541,"eb745e0d5c1e854c73a7a8b7007b8dc0ca14eb2458bf82490cb40a6102d375ba","derived_extract",["or-2024-primary-official-abstract-pdf"]],
  "or-2026-primary-official-abstract-pdf": ["https://records.sos.state.or.us/ORSOSCMSearch/Search/RecordViewer.aspx?uri=16180585","data/source/elections/primary-results/oregon/2026/official-primary-abstract.pdf",1370223,"19e936d34a664062ef0cbb89b273d87ddf3f9b3e5b994c091bf4919428d2ae3e","source",[]],
  "or-2026-primary-official-abstract-text": ["urn:dsa-seats:or-2026-primary-official-abstract-pdf:pdftotext-layout-26.07.0","data/source/elections/primary-results/oregon/2026/official-primary-abstract.txt",95691,"96222841056651bbe4e3cc638f995e5b9fc67518c9eba23c469a3552e4b9050a","derived_extract",["or-2026-primary-official-abstract-pdf"]],
} as const;
type ExpectedId = keyof typeof EXPECTED;
type CycleYear = 2022|2024|2026;
type ContestSpec = Readonly<{ names:readonly string[]; nominee:number; headerTokens:readonly string[] }>;
const SPECS:Readonly<Record<CycleYear,readonly ContestSpec[]>> = {
  2022:[
    {names:["Christian Robertson","Scott Phillips","Suzanne Bonamici"],nominee:2,headerTokens:["Robertson","Phillips","*Bonamici","Christian","Scott","Suzanne"]},
    {names:["Adam Prine","Joe Yetter"],nominee:1,headerTokens:["Prine","*Yetter","Adam","Joe"]},
    {names:["Jonathan E Polhemus","Earl Blumenauer"],nominee:1,headerTokens:["Polhemus","*Blumenauer","Jonathan E","Earl"]},
    {names:["Sami Al-Abdrabbuh","G Tommy Smith","John S Selker","Steve William Laible","Val Hoyle","Jake Matthews","Doyle E Canning","Andrew Kalloch"],nominee:4,headerTokens:["Al-Abdrabbuh","Smith","Selker","Laible","*Hoyle","Matthews","Canning","Kalloch"]},
    {names:["Kurt Schrader","Jamie McLeod-Skinner"],nominee:1,headerTokens:["Schrader","*McLeod-Skinner","Kurt","Jamie"]},
    {names:["Cody Reynolds","Teresa Alonso Leon","Andrea Salinas","Loretta Smith","Kathleen Harder","Matt West","Greg Goodwin","Carrick Flynn","Ricky Barajas"],nominee:2,headerTokens:["Reynolds","Alonso Leon","*Salinas","Smith","Harder","West","Goodwin","Flynn","Barajas"]},
  ],
  2024:[
    {names:["Suzanne Bonamici","Jamil O Ahmad","Courtney E Casgraux (Moore)"],nominee:0,headerTokens:["*Bonamici","Ahmad","Casgraux","Suzanne","Jamil O","Courtney E"]},
    {names:["Steve William Laible","Dan Ruby"],nominee:1,headerTokens:["Laible","*Ruby","Steve William","Dan"]},
    {names:["Maxine E Dexter","Ricardo Barajas","Nolan Bylenga","Rachel Lydia Rand","Michael Jonas","Susheela Jayapal","Eddy Morales"],nominee:0,headerTokens:["*Dexter","Barajas","Bylenga","Rand","Jonas","Jayapal","Morales"]},
    {names:["Val Hoyle"],nominee:0,headerTokens:["*Hoyle","Val"]},
    {names:["Janelle S Bynum","Jamie McLeod-Skinner"],nominee:0,headerTokens:["*Bynum","McLeod-Skinner","Janelle S","Jamie"]},
    {names:["Cody Reynolds","Andrea Salinas"],nominee:1,headerTokens:["Reynolds","*Salinas","Cody","Andrea"]},
  ],
  2026:[
    {names:["Jamil O Ahmad","Suzanne Bonamici"],nominee:1,headerTokens:["Ahmad","*Bonamici","Jamil O","Suzanne"]},
    {names:["Chris Beck","Mary Doyle","Rebecca Mueller","Patty Snow","Dawn Rasmussen","Peter Quince"],nominee:0,headerTokens:["*Beck","Doyle","Mueller","Snow Rasmussen","Quince","Patty","Dawn","Peter"]},
    {names:["Andrew Castilleja","Maxine E Dexter","Jessica Salas"],nominee:1,headerTokens:["Castilleja","*Dexter","Salas","Andrew","Maxine E","Jessica"]},
    {names:["Daniel B Bahlen","Melissa Bird","Val Hoyle"],nominee:2,headerTokens:["Bahlen","Bird","*Hoyle","Daniel B","Melissa","Val"]},
    {names:["Janelle S Bynum","Zeva Rosenbaum"],nominee:0,headerTokens:["*Bynum","Rosenbaum","Janelle S","Zeva"]},
    {names:["Andrea Salinas"],nominee:0,headerTokens:["*Salinas","Andrea"]},
  ],
};
const DATES={2022:"2022-05-17",2024:"2024-05-21",2026:"2026-05-19"} as const;
const EXPECTED_IDS=Object.keys(EXPECTED) as ExpectedId[];
const DECISION_IDS=["collect-official-state-primary-results-and-certification-v1","decide-nonstandard-primary-disposition-treatment-v1"] as const;
const sha=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");
const digest=(domain:string,value:unknown)=>createHash("sha256").update(domain,"ascii").update(canonicalJson(value),"utf8").digest("hex");
const fail=(code:string):never=>{throw new Error(`Oregon primary results rejected: ${code}`)};
const bytes=(value:Buffer|Uint8Array|string)=>typeof value==="string"?Buffer.from(value):Buffer.from(value);
const checked=(input:OregonPrimaryInput):Buffer=>{const value=bytes(input.bytes);if(input.entry.retainedStatus!=="retained"||value.length!==input.entry.byteSize||sha(value)!==input.entry.sha256)fail("SOURCE_BYTES_INVALID");return value};
const expectedSource=(entry:SourceEntry):boolean=>{const spec=EXPECTED[entry.id as ExpectedId];return spec!==undefined&&entry.url===spec[0]&&entry.retainedPath===spec[1]&&entry.byteSize===spec[2]&&entry.sha256===spec[3]&&entry.kind===spec[4]&&canonicalJson(entry.parentIds)===canonicalJson(spec[5])};

function parseContest(text:string,year:CycleYear,district:number,spec:ContestSpec):Omit<Contest,"contestSha256">{
  const pattern=new RegExp(`US Representative\\s+${district}(?:st|nd|rd|th) District\\s+Democrat([\\s\\S]*?)\\n\\s*Republican`);
  const match=text.match(pattern);
  const sourceBlock=match?.[1]??fail(`RESULT_${year}_${district}_BLOCK_INVALID`);
  if(!spec.headerTokens.every(token=>sourceBlock.includes(token)))fail(`RESULT_${year}_${district}_HEADER_INVALID`);
  const lines=sourceBlock.split(/\r?\n/),totalLines=lines.filter(line=>/^\s*Total\s+[\d,]/.test(line));
  if(totalLines.length!==1)fail(`RESULT_${year}_${district}_TOTAL_ROW_INVALID`);
  const values=(totalLines[0].match(/\d[\d,]*/g)??[]).map(value=>Number(value.replace(/,/g,"")));
  if(values.length!==spec.names.length+1||values.some(value=>!Number.isSafeInteger(value)||value<0))fail(`RESULT_${year}_${district}_TOTAL_VALUES_INVALID`);
  const totalIndex=lines.indexOf(totalLines[0]),countyLines=lines.slice(0,totalIndex).filter(line=>/\d/.test(line));
  if(countyLines.length===0)fail(`RESULT_${year}_${district}_COUNTY_ROWS_MISSING`);
  const countyValues=countyLines.map(line=>(line.match(/\d[\d,]*/g)??[]).map(value=>Number(value.replace(/,/g,""))));
  if(countyValues.some(row=>row.length!==values.length||row.some(value=>!Number.isSafeInteger(value)||value<0)))fail(`RESULT_${year}_${district}_COUNTY_ROW_INVALID`);
  const countySums=values.map((_,column)=>countyValues.reduce((sum,row)=>sum+row[column]!,0));
  if(countySums.some((sum,column)=>sum!==values[column]))fail(`RESULT_${year}_${district}_COUNTY_RECONCILIATION_INVALID`);
  const candidates=spec.names.map((sourceCandidateName,index)=>({sourceCandidateId:null,sourceCandidateName,votes:values[index]!,sourceNomineeMarker:index===spec.nominee?"*" as const:null}));
  const aggregateMiscVotes=values.at(-1)!,sourceTotalVotes=values.reduce((sum,value)=>sum+value,0),districtCode=String(district).padStart(2,"0");
  return {contestId:`or:${year}:regular:us-house:${districtCode}:democratic`,cycleYear:year,electionDate:DATES[year],stateCode:"OR",districtCode,party:"Democratic",office:"U.S. House of Representatives",sourceLockIds:[`or-${year}-primary-official-abstract-pdf`,`or-${year}-primary-official-abstract-text`],sourceContestTitle:`US Representative ${district}${district===1?"st":district===2?"nd":district===3?"rd":"th"} District - Democrat`,resultAuthorityStatus:"official_statewide_abstract_retained",reportingCompleteness:"all_source_county_rows_reconciled_to_statewide_total",candidates,aggregateMiscVotes,sourceTotalVotes,voteReconciliation:"named_candidate_plus_misc_sum_equals_source_party_total",sourceNomineeStatus:"marked_by_source",nomineeSourceCandidateName:spec.names[spec.nominee]!,currentIdentityStatus:"not_reviewed",geographyStatus:"not_reviewed",selectionStatus:"unselected",scoreEligible:false,evaluatorValues:{priorPrimaryMargin:null,priorDemocraticPrimaryVotes:null,priorProgressivePrimaryShare:null}};
}

export function parseOregonContestForValidation(text:string,year:CycleYear,district:number):Omit<Contest,"contestSha256">{
  const spec=SPECS[year][district-1];
  if(!spec)fail("CONTEST_SPEC_INVALID");
  return parseContest(text,year,district,spec);
}

export function buildOregonPrimaryReceipt(inputs:readonly OregonPrimaryInput[],parentInput:OregonParentInput,generatedAt="2026-08-05T23:45:00.000Z"):OregonPrimaryReceipt{
  const parent=validateHouseDemocraticPrimarySourceSelectionProposal(parentInput.value);
  if(parentInput.fileSha256!=="85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1"||parent.packageSha256!=="a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb"||DECISION_IDS.some(id=>parent.decisions.find(decision=>decision.decisionId===id)?.resolution!==null))fail("PARENT_INVALID");
  if(!/^2026-08-05T\d{2}:\d{2}:\d{2}\.000Z$/.test(generatedAt))fail("GENERATED_AT_INVALID");
  const byId=new Map(inputs.map(input=>[input.entry.id,input]));
  if(inputs.length!==EXPECTED_IDS.length||byId.size!==EXPECTED_IDS.length||EXPECTED_IDS.some(id=>!byId.has(id))||inputs.some(input=>!expectedSource(input.entry)))fail("SOURCE_CLOSURE_INVALID");
  for(const input of inputs)checked(input);
  const contests:Contest[]=[];
  for(const year of [2022,2024,2026] as const){
    const input=byId.get(`or-${year}-primary-official-abstract-text`)??fail("TEXT_SOURCE_MISSING"),text=checked(input).toString("utf8");
    if(!text.includes(`${DATES[year].slice(5,7)==="05"?"May":""} ${Number(DATES[year].slice(8))}, ${year}, Primary Election Abstract of Votes`)||!text.includes("* Nominee"))fail(`RESULT_${year}_AUTHORITY_INVALID`);
    SPECS[year].forEach((spec,index)=>{const base=parseOregonContestForValidation(text,year,index+1);contests.push({...base,contestSha256:digest("dsa-seats:or-house-democratic-primary-result:v1\0",base)})});
  }
  contests.sort((a,b)=>a.cycleYear-b.cycleYear||a.districtCode.localeCompare(b.districtCode));
  if(contests.length!==18||new Set(contests.map(contest=>contest.contestId)).size!==18)fail("CONTEST_SET_INVALID");
  const contestSetSha256=digest("dsa-seats:or-house-democratic-primary-result-set:v1\0",contests.map(({contestId,contestSha256})=>({contestId,contestSha256}))),namedCandidateVotes=contests.flatMap(contest=>contest.candidates).reduce((sum,candidate)=>sum+candidate.votes,0),aggregateMiscVotes=contests.reduce((sum,contest)=>sum+contest.aggregateMiscVotes,0);
  const unsigned={schema:OREGON_PRIMARY_RESULTS_V1,version:1 as const,generatedAt,sourceCutoff:"2026-08-05" as const,reviewerOnly:true as const,publicationEligible:false as const,review:{status:"proposed" as const,reviewer:null,reviewedAt:null,resolution:null},parentProposal:{id:"house-democratic-primary-source-selection-proposal-20260804-v1" as const,fileSha256:"85246e9adfd181e6f24606b6eaa29250c45c9e8e42a6dd5af5cb162de17f45b1" as const,packageSha256:"a090e0be03dc2b0fa5edd0c1132a8261eed0f98ceb4df090154d0b150d8721fb" as const},decisionSupport:DECISION_IDS.map(decisionId=>({decisionId,lifecycle:"evidence_for_bound_existing_decision_not_an_independent_decision" as const})),inheritedDecisionResolutions:DECISION_IDS.map(decisionId=>({decisionId,resolution:null})),cycles:[{cycleYear:2022,electionDate:DATES[2022],status:"official_statewide_abstract_retained",resultRowsRetained:6},{cycleYear:2024,electionDate:DATES[2024],status:"official_statewide_abstract_retained",resultRowsRetained:6},{cycleYear:2026,electionDate:DATES[2026],status:"official_statewide_abstract_retained",resultRowsRetained:6}],sources:(inputs.map(input=>input.entry).sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)))).map(sourceLockContent),contests,summary:{districtCycleRows:18 as const,reportedContests:18 as const,contests2022:6 as const,contests2024:6 as const,contests2026:6 as const,namedCandidates:contests.flatMap(contest=>contest.candidates).length,namedCandidateVotes,aggregateMiscVotes,totalVotes:namedCandidateVotes+aggregateMiscVotes,sourceMarkedNominees:18 as const,evaluatorNumericValues:0 as const,scoreEligibleContests:0 as const,contestSetSha256},limitations:["Candidate display names are reconstructed from the official abstract's fixed-width multi-line headers; every reconstruction is bound to the exact source block, header tokens, candidate order, and parsed Total row.","The source's Misc. column is preserved as an aggregate channel and is not converted into a named candidate, write-in identity, or zero.","A source nominee marker is a direct primary-result fact; it does not establish current-incumbent identity, historical-geography compatibility, progressive classification, selection, or evaluator applicability."],unresolvedGates:["Independent reviewer approval is required before factual promotion.","Current identity and historical-to-current district geography must be resolved before evaluator use.","Progressive-candidate classification and evaluator applicability remain separately reviewable decisions."]};
  return {...unsigned,packageSha256:digest("dsa-seats:or-house-democratic-primary-result-package:v1\0",unsigned)};
}

export function assertOregonPrimarySemanticInvariants(value:OregonPrimaryReceipt):void{
  if(value.schema!==OREGON_PRIMARY_RESULTS_V1||value.version!==1||value.sourceCutoff!=="2026-08-05"||!value.reviewerOnly||value.publicationEligible||value.review.status!=="proposed"||value.review.reviewer!==null||value.review.reviewedAt!==null||value.review.resolution!==null)fail("LIFECYCLE_INVALID");
  if(value.contests.length!==18||value.contests.some(contest=>contest.scoreEligible||contest.sourceNomineeStatus!=="marked_by_source"||contest.candidates.filter(candidate=>candidate.sourceNomineeMarker==="*").length!==1||contest.nomineeSourceCandidateName!==contest.candidates.find(candidate=>candidate.sourceNomineeMarker==="*")?.sourceCandidateName||Object.values(contest.evaluatorValues).some(item=>item!==null)))fail("CONTEST_INVARIANT_INVALID");
  if(value.contests.some(contest=>contest.candidates.reduce((sum,candidate)=>sum+candidate.votes,contest.aggregateMiscVotes)!==contest.sourceTotalVotes))fail("ARITHMETIC_INVALID");
  const expected={districtCycleRows:18,reportedContests:18,contests2022:6,contests2024:6,contests2026:6,sourceMarkedNominees:18,evaluatorNumericValues:0,scoreEligibleContests:0};
  if(Object.entries(expected).some(([key,item])=>value.summary[key as keyof typeof value.summary]!==item))fail("SUMMARY_INVALID");
}

export function validateOregonPrimaryReceipt(value:OregonPrimaryReceipt):OregonPrimaryReceipt{
  assertOregonPrimarySemanticInvariants(value);
  const {packageSha256,...unsigned}=value,contestSet=digest("dsa-seats:or-house-democratic-primary-result-set:v1\0",value.contests.map(({contestId,contestSha256})=>({contestId,contestSha256})));
  if(packageSha256!==OREGON_PRIMARY_PACKAGE_SHA256||packageSha256!==digest("dsa-seats:or-house-democratic-primary-result-package:v1\0",unsigned)||contestSet!==OREGON_PRIMARY_CONTEST_SET_SHA256||value.summary.contestSetSha256!==contestSet)fail("PACKAGE_INVALID");
  return value;
}
