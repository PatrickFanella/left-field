import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type SouthCarolinaPrimaryResultsV2,
  validateSouthCarolinaPrimaryResultsV2,
} from "./house-primary-south-carolina-results-v2";

type PriorResult = SouthCarolinaPrimaryResultsV2["results"][number];
export type SouthCarolinaPrimaryResultV3 = PriorResult | Readonly<{
  resultId: "sc:primary:2026:06:democratic";
  cycleYear: 2026;
  electionDate: "2026-06-09";
  districtLabel: "SC-06";
  sourceLockIds: readonly ["sc-2026-primary-enr-election-settings", "sc-2026-primary-enr-summary"];
  sourceCandidateNames: readonly ["James E Jim Clyburn", "Frederick R Goodwin"];
  candidateVotes: readonly [75411, 8145];
  totalVotes: 83556;
  sourceWinnerStatus: "marked_by_source";
  sourceWinnerCandidateName: "James E Jim Clyburn";
  resultAuthorityStatus: "official_state_enr_current_result_retained";
  certificationStatus: "portal_current_results_no_final_upload_or_separate_certificate";
  winnerIdentity: null;
  identity: null;
  scoreEligible: false;
  resultSha256: string;
}>;

export interface SouthCarolinaPrimaryResultsV3 {
  readonly schema: "rapid-house-primary-south-carolina-results-v3";
  readonly version: 3;
  readonly parentPackageSha256: string;
  readonly results: readonly SouthCarolinaPrimaryResultV3[];
  readonly sourceAbsences: SouthCarolinaPrimaryResultsV2["sourceAbsences"];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ reportedContests: 2; sourceAbsentObservations: 1; candidateRows: 5; candidateVotes: 138991; sourceMarkedWinnerContests: 2; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { id:"sc-2026-election-results-index",url:"https://scvotes.gov/elections-statistics/election-results/",path:"data/source/rapid/house-primary/sc/2026/election-results-index.html",bytes:92673,sha256:"07a501b922471b08e3d8fc6efc77f8833c2560af683c02dde8370ca7f06de6fd",parents:[] },
  { id:"sc-2026-primary-enr-current-version",url:"https://www.enr-scvotes.org/SC/126294/current_ver.txt",path:"data/source/rapid/house-primary/sc/2026/current-version.txt",bytes:6,sha256:"915d43ab9af60fd2a8527e125f88e295dd9b3abeca79b412bca6886279ad6e7d",parents:["sc-2026-election-results-index"] },
  { id:"sc-2026-primary-enr-config",url:"https://www.enr-scvotes.org/SC/126294/375593/json/config.json",path:"data/source/rapid/house-primary/sc/2026/config.json",bytes:82,sha256:"78292ed41040455b998725bdda012ab0b0bd438c27d902795578de956bd7603d",parents:["sc-2026-primary-enr-current-version"] },
  { id:"sc-2026-primary-enr-election-settings",url:"https://www.enr-scvotes.org/SC/126294/375593/json/en/electionsettings.json",path:"data/source/rapid/house-primary/sc/2026/election-settings.json",bytes:38288,sha256:"93589dca72cffcad00a3a863c850180da8885e20d7d1ee9c44015f6a5e9ec81e",parents:["sc-2026-primary-enr-config"] },
  { id:"sc-2026-primary-enr-summary",url:"https://www.enr-scvotes.org/SC/126294/375593/json/en/summary.json",path:"data/source/rapid/house-primary/sc/2026/summary.json",bytes:51532,sha256:"f7e6c57ae8c7eccb002dc0da5fba30b7748b38aee7e36d424feee3d951ee038b",parents:["sc-2026-primary-enr-election-settings"] },
] as const;
const compare = (left:string,right:string)=>left<right?-1:left>right?1:0;
const canonical = (value:unknown):string=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(",")}]`:`{${Object.keys(value as object).sort(compare).map((key)=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
const hash=(domain:string,value:unknown)=>createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const exact=(left:unknown,right:unknown)=>canonical(left)===canonical(right);
type SummaryContest = { C:string; K:string; CH:string[]; P:string[]; PCT:number[]; V:number[]; T:number; W:number[]; TP:number; RO:number; IsRCV:boolean };

export function buildSouthCarolinaPrimaryResultsV3(root=process.cwd()):SouthCarolinaPrimaryResultsV3 {
  const parent=validateSouthCarolinaPrimaryResultsV2(JSON.parse(readFileSync(join(root,"data/metadata/rapid-house-primary-south-carolina-results-v2.json"),"utf8")),root);
  const lock=JSON.parse(readFileSync(join(root,"data/source-lock.json"),"utf8")) as {entries:readonly Record<string,unknown>[]};
  const bytes=new Map<string,Buffer>();
  for(const source of SOURCES){
    const data=readFileSync(join(root,source.path)); bytes.set(source.id,data);
    const expected={id:source.id,url:source.url,retainedPath:source.path,retainedStatus:"retained",byteSize:source.bytes,sha256:source.sha256,kind:"source",parentIds:[...source.parents]};
    const matches=lock.entries.filter((entry)=>entry.id===source.id);
    if(data.length!==source.bytes||sha(data)!==source.sha256||matches.length!==1||!exact(sourceLockContent(matches[0]),expected)) throw new Error(`SOUTH_CAROLINA_2026_SOURCE_BINDING_INVALID:${source.id}`);
  }
  const landing=bytes.get("sc-2026-election-results-index")!.toString("utf8");
  if(!landing.includes('href="https://www.enr-scvotes.org/SC/126294/">Statewide Primaries</a>')||!landing.includes("June 9, 2026")) throw new Error("SOUTH_CAROLINA_2026_INDEX_INVALID");
  if(bytes.get("sc-2026-primary-enr-current-version")!.toString("utf8")!=="375593") throw new Error("SOUTH_CAROLINA_2026_VERSION_INVALID");
  const config=JSON.parse(bytes.get("sc-2026-primary-enr-config")!.toString("utf8"));
  if(!exact(config,{languages:"en|English",lang:"en",isPublished:true,versionTemplate:345435})) throw new Error("SOUTH_CAROLINA_2026_CONFIG_INVALID");
  const settings=JSON.parse(bytes.get("sc-2026-primary-enr-election-settings")!.toString("utf8")) as {settings?:{electiondetails?:Record<string,unknown>}};
  const details=settings.settings?.electiondetails;
  if(!details||!exact({internalname:details.internalname,electiondate:details.electiondate,electionid:details.electionid,isstate:details.isstate,istestmode:details.istestmode,chkisfinalupload:details.chkisfinalupload,chkiscanvasupload:details.chkiscanvasupload,participatingcounties:Array.isArray(details.participatingcounties)?details.participatingcounties.length:null},{internalname:"2026 Statewide Primary",electiondate:"6/9/2026",electionid:"126294",isstate:true,istestmode:false,chkisfinalupload:false,chkiscanvasupload:false,participatingcounties:46})) throw new Error("SOUTH_CAROLINA_2026_SETTINGS_INVALID");
  const summary=JSON.parse(bytes.get("sc-2026-primary-enr-summary")!.toString("utf8")) as SummaryContest[];
  const house=summary.filter((contest)=>contest.C.includes("U.S.  House of Representatives"));
  if(summary.length!==75||house.length!==9||house.filter((contest)=>contest.C.endsWith("- DEM")).length!==5) throw new Error("SOUTH_CAROLINA_2026_EVENT_CLOSURE_INVALID");
  const contest=house.filter((item)=>item.K==="27012"&&item.C==="U.S.  House of Representatives, District  6 - DEM");
  if(contest.length!==1) throw new Error("SOUTH_CAROLINA_2026_TARGET_CONTEST_INVALID");
  const row=contest[0]!;
  if(!exact({CH:row.CH,P:row.P,V:row.V,T:row.T,W:row.W,TP:row.TP,RO:row.RO,IsRCV:row.IsRCV},{CH:["James E Jim Clyburn","Frederick R Goodwin"],P:["DEM","DEM"],V:[75411,8145],T:83556,W:[1,0],TP:14,RO:0,IsRCV:false})||row.V.reduce((sum,value)=>sum+value,0)!==row.T) throw new Error("SOUTH_CAROLINA_2026_TARGET_RESULT_INVALID");
  const unsignedResult={resultId:"sc:primary:2026:06:democratic" as const,cycleYear:2026 as const,electionDate:"2026-06-09" as const,districtLabel:"SC-06" as const,sourceLockIds:["sc-2026-primary-enr-election-settings","sc-2026-primary-enr-summary"] as const,sourceCandidateNames:["James E Jim Clyburn","Frederick R Goodwin"] as const,candidateVotes:[75411,8145] as const,totalVotes:83556 as const,sourceWinnerStatus:"marked_by_source" as const,sourceWinnerCandidateName:"James E Jim Clyburn" as const,resultAuthorityStatus:"official_state_enr_current_result_retained" as const,certificationStatus:"portal_current_results_no_final_upload_or_separate_certificate" as const,winnerIdentity:null,identity:null,scoreEligible:false as const};
  const results=[...parent.results,{...unsignedResult,resultSha256:hash("dsa-seats:rapid-house-primary-south-carolina-result:v3",unsignedResult)}];
  const resultSetSha256=hash("dsa-seats:rapid-house-primary-south-carolina-result-set:v3",{results,sourceAbsences:parent.sourceAbsences});
  const summaryValue={reportedContests:2 as const,sourceAbsentObservations:1 as const,candidateRows:5 as const,candidateVotes:138991 as const,sourceMarkedWinnerContests:2 as const,scoreEligibleRows:0 as const};
  const unsigned={schema:"rapid-house-primary-south-carolina-results-v3" as const,version:3 as const,parentPackageSha256:parent.packageSha256,results,sourceAbsences:parent.sourceAbsences,resultSetSha256,summary:summaryValue};
  return {...unsigned,packageSha256:hash("dsa-seats:rapid-house-primary-south-carolina-package:v3",unsigned)};
}

export function validateSouthCarolinaPrimaryResultsV3(value:unknown,root=process.cwd()):SouthCarolinaPrimaryResultsV3{
  const expected=buildSouthCarolinaPrimaryResultsV3(root);
  if(!exact(value,expected)) throw new Error("SOUTH_CAROLINA_RESULTS_V3_INVALID");
  return value as SouthCarolinaPrimaryResultsV3;
}
