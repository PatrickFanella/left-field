import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { hash, sha, exact } from "./shared";

export interface NewHampshirePrimaryCandidate {
  readonly sourceCandidateName: string;
  readonly rawParty: "d";
  readonly votes: number;
}
export interface NewHampshirePrimaryResult {
  readonly resultId: string;
  readonly cycleYear: 2024;
  readonly electionDate: "2024-09-10";
  readonly districtLabel: "NH-01" | "NH-02";
  readonly sourceLockId: string;
  readonly archivedOfficialSourceUrl: string;
  readonly candidates: readonly NewHampshirePrimaryCandidate[];
  readonly candidateCount: 2;
  readonly totalCandidateVotes: number;
  readonly reportingUnitRows: number;
  readonly resultAuthorityStatus: "archived_copy_of_official_secretary_workbook_retained_live_host_403_not_claimed_certified";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly winner: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}
export interface NewHampshirePrimaryResults {
  readonly schema: "rapid-house-primary-new-hampshire-results-v1";
  readonly version: 1;
  readonly results: readonly NewHampshirePrimaryResult[];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ observations: 2; candidateRows: 4; candidateVotes: 125_012; sourceMarkedWinnerContests: 0; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { id:"nh-2024-democratic-cd1-primary-workbook-archived",archiveUrl:"https://web.archive.org/web/20260218161927id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-sp-congressional-district-1-democratic_4.xlsx",officialUrl:"https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-sp-congressional-district-1-democratic_4.xlsx",path:"data/source/rapid/house-primary/nh/2024/congressional-district-1-democratic.xlsx",bytes:28_223,sha256:"79713159348e24389f2e115f0cc77bc3acd016b6ea2a90e1366e6a8166a55593",district:"01" as const,sheet:"Con1 Dem",title:"Congressional District 1  -  Democratic",rows:109,totalRow:113,headers:["Chris Pappas, d","Kevin Rondeau, d","Max Abramson, r","Chris Bright, r","Joseph Kelley Levasseur, r","Andy Martin, r","Walter J. McFarlane III, r","Hollis Noveletsky, r","Russell Prescott, r","Write-Ins","Overvotes","Undervotes"],votes:[54_927,2_783] as const },
  { id:"nh-2024-democratic-cd2-primary-workbook-archived",archiveUrl:"https://web.archive.org/web/20260218161927id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-sp-congressional-district-2-democratic_4.xlsx",officialUrl:"https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-sp-congressional-district-2-democratic_4.xlsx",path:"data/source/rapid/house-primary/nh/2024/congressional-district-2-democratic.xlsx",bytes:37_838,sha256:"1f6dfb3b1d759f89845f5947add0b4cd8867ad2da442e2f501046f796809ec92",district:"02" as const,sheet:"Con2 Dem",title:"Congressional District 2 - Democratic",rows:211,totalRow:215,headers:["Maggie Goodlander,  d","Colin Van Ostern, d","Tom Alciere, r","Gerard Beloin, r","Michael A Callis, r","Randall Clark, r","Casey Crane, r","Robert D'Arcy, r","Bill Hamlen, r","William Harvey, r","Vikram Mansharamani, r","Jay Mercer, r","Jason Riddle, r","Lily Tang Williams, r","Paul M. Wagner, r","Write-Ins","Overvotes","Undervotes"],votes:[42_960,24_342] as const },
] as const;

const decode=(value:string)=>value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
const textNodes=(value:string)=>[...value.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match=>decode(match[1]!)).join("");
const integer=(value:string,code:string)=>{const parsed=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(parsed))throw new Error(code);return parsed;};

function parseWorkbook(bytes:Buffer,source:(typeof SOURCES)[number]):NewHampshirePrimaryResult {
  let files:Record<string,Uint8Array>;try{files=unzipSync(new Uint8Array(bytes));}catch{throw new Error("NEW_HAMPSHIRE_XLSX_INVALID");}
  const read=(path:string)=>{const value=files[path];if(!value)throw new Error(`NEW_HAMPSHIRE_XLSX_MEMBER_MISSING:${path}`);return Buffer.from(value).toString("utf8");};
  const workbook=read("xl/workbook.xml"),relationships=read("xl/_rels/workbook.xml.rels"),shared=[...read("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match=>textNodes(match[1]!));
  const sheet=[...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)];if(sheet.length!==1||decode(sheet[0]![1]!.match(/\bname="([^"]+)"/)?.[1]??"")!==source.sheet)throw new Error("NEW_HAMPSHIRE_SHEET_INVALID");
  const id=sheet[0]![1]!.match(/\br:id="([^"]+)"/)?.[1],relation=[...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map(match=>match[1]!).find(value=>value.match(/\bId="([^"]+)"/)?.[1]===id),target=relation?.match(/\bTarget="([^"]+)"/)?.[1];if(!target)throw new Error("NEW_HAMPSHIRE_SHEET_RELATION_INVALID");
  const xml=read(target.startsWith("/")?target.slice(1):`xl/${target.replace(/^\.\//,"")}`),cells=new Map<string,{value:string;formula:boolean}>();
  for(const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const attributes=match[1]!,body=match[2]??"",reference=attributes.match(/\br="([^"]+)"/)?.[1],type=attributes.match(/\bt="([^"]+)"/)?.[1],raw=body.match(/<v>([\s\S]*?)<\/v>/)?.[1];if(!reference)throw new Error("NEW_HAMPSHIRE_CELL_REFERENCE_MISSING");const value=type==="s"?shared[integer(raw??"","NEW_HAMPSHIRE_SHARED_INDEX_INVALID")]:raw===undefined?"":decode(raw);if(value===undefined)throw new Error("NEW_HAMPSHIRE_SHARED_VALUE_MISSING");cells.set(reference,{value,formula:/<f(?:\s[^>]*)?>/.test(body)});}
  if(cells.get("A1")?.value!=="State of New Hampshire - 2024 Primary Election"||cells.get("A2")?.value!==source.title||cells.get("A3")?.value!=="45545")throw new Error(`NEW_HAMPSHIRE_WORKBOOK_IDENTITY_INVALID:${JSON.stringify([cells.get("A1")?.value,cells.get("A2")?.value,cells.get("A3")?.value])}`);
  const column=(index:number)=>String.fromCharCode(65+index);const headers=source.headers.map((_,index)=>cells.get(`${column(index+1)}3`)?.value??"");if(!exact(headers,source.headers))throw new Error("NEW_HAMPSHIRE_HEADERS_INVALID");
  const totals:number[]=[];for(let candidate=0;candidate<2;candidate++){const col=column(candidate+1);let sum=0;for(let row=4;row<source.totalRow;row++){const cell=cells.get(`${col}${row}`);if(cell?.formula)throw new Error("NEW_HAMPSHIRE_DETAIL_FORMULA_INVALID");sum+=cell?.value?integer(cell.value,"NEW_HAMPSHIRE_DETAIL_VOTE_INVALID"):0;}const total=cells.get(`${col}${source.totalRow}`);if(!total?.formula||integer(total.value,"NEW_HAMPSHIRE_TOTAL_INVALID")!==sum)throw new Error("NEW_HAMPSHIRE_TOTAL_RECONCILIATION_INVALID");totals.push(sum);}
  if(!exact(totals,source.votes)||cells.get(`A${source.totalRow}`)?.value!=="Totals")throw new Error("NEW_HAMPSHIRE_CONTEST_CLOSURE_INVALID");
  const candidates=source.headers.slice(0,2).map((header,index)=>({sourceCandidateName:header.replace(/,\s+d$/,"").trim(),rawParty:"d" as const,votes:totals[index]!}));
  const unsigned={resultId:`nh:primary:2024:${source.district}:democratic`,cycleYear:2024 as const,electionDate:"2024-09-10" as const,districtLabel:`NH-${source.district}` as "NH-01"|"NH-02",sourceLockId:source.id,archivedOfficialSourceUrl:source.officialUrl,candidates,candidateCount:2 as const,totalCandidateVotes:totals[0]!+totals[1]!,reportingUnitRows:source.rows,resultAuthorityStatus:"archived_copy_of_official_secretary_workbook_retained_live_host_403_not_claimed_certified" as const,sourceWinnerStatus:"not_marked_by_source" as const,winner:null,identity:null,scoreEligible:false as const};
  return{...unsigned,resultSha256:hash("dsa-seats:rapid-house-primary-new-hampshire-result:v1",unsigned)};
}

export function buildNewHampshirePrimaryResults(root=process.cwd()):NewHampshirePrimaryResults{
  const lock=JSON.parse(readFileSync(join(root,"data/source-lock.json"),"utf8"))as{entries:readonly Record<string,unknown>[]};
  const results=SOURCES.map(source=>{const bytes=readFileSync(join(root,source.path)),expected={id:source.id,url:source.archiveUrl,retainedPath:source.path,retainedStatus:"retained",byteSize:source.bytes,sha256:source.sha256,kind:"archived_official_source",parentIds:["nh-2024-primary-results"]};if(bytes.length!==source.bytes||sha(bytes)!==source.sha256||lock.entries.filter(entry=>entry.id===source.id).length!==1||!exact(sourceLockContent(lock.entries.find(entry=>entry.id===source.id)),expected))throw new Error(`NEW_HAMPSHIRE_SOURCE_BINDING_INVALID:${source.district}`);return parseWorkbook(bytes,source);});
  const summary={observations:2 as const,candidateRows:4 as const,candidateVotes:125_012 as const,sourceMarkedWinnerContests:0 as const,scoreEligibleRows:0 as const};
  if(results.reduce((sum,row)=>sum+row.totalCandidateVotes,0)!==summary.candidateVotes||results.some(row=>row.scoreEligible||row.winner!==null||row.identity!==null||row.sourceWinnerStatus!=="not_marked_by_source"))throw new Error("NEW_HAMPSHIRE_RESULTS_CLOSURE_INVALID");
  const resultSetSha256=hash("dsa-seats:rapid-house-primary-new-hampshire-result-set:v1",results),unsigned={schema:"rapid-house-primary-new-hampshire-results-v1" as const,version:1 as const,results,resultSetSha256,summary};return{...unsigned,packageSha256:hash("dsa-seats:rapid-house-primary-new-hampshire-package:v1",unsigned)};
}
export function validateNewHampshirePrimaryResults(value:unknown,root=process.cwd()):NewHampshirePrimaryResults{const expected=buildNewHampshirePrimaryResults(root);if(!exact(value,expected))throw new Error("NEW_HAMPSHIRE_RESULTS_INVALID");return value as NewHampshirePrimaryResults;}
