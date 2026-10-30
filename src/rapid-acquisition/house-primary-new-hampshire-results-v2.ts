import { sourceLockContent } from "./intake/source-lock-content";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { type NewHampshirePrimaryResult, validateNewHampshirePrimaryResults } from "./house-primary-new-hampshire-results";
import { hash, sha, exact } from "./shared";

export interface NewHampshirePrimaryResult2022 {
  readonly resultId: `nh:primary:2022:${"01" | "02"}:democratic`;
  readonly cycleYear: 2022;
  readonly electionDate: "2022-09-13";
  readonly districtLabel: "NH-01" | "NH-02";
  readonly sourceLockId: string;
  readonly archivedOfficialSourceUrl: string;
  readonly candidates: readonly Readonly<{ sourceCandidateName: string; rawParty: "d"; votes: number }>[];
  readonly candidateCount: 1;
  readonly totalCandidateVotes: number;
  readonly reportingUnitRows: number;
  readonly resultAuthorityStatus: "archived_copy_of_official_secretary_workbook_retained_live_host_403_not_claimed_certified";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly winner: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}

export interface NewHampshirePrimaryResultsV2 {
  readonly schema: "rapid-house-primary-new-hampshire-results-v2";
  readonly version: 2;
  readonly parentPackageSha256: string;
  readonly results: readonly [NewHampshirePrimaryResult2022, NewHampshirePrimaryResult2022, NewHampshirePrimaryResult, NewHampshirePrimaryResult];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{ observations: 4; candidateRows: 6; candidateVotes: 215_632; sourceMarkedWinnerContests: 0; scoreEligibleRows: 0 }>;
  readonly packageSha256: string;
}

const SOURCES = [
  { id:"nh-2022-democratic-cd1-primary-workbook-archived",archiveUrl:"https://web.archive.org/web/20250613143126id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2022-sp-congressional-district-1-democratic.xlsx",officialUrl:"https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2022-sp-congressional-district-1-democratic.xlsx",path:"data/source/rapid/house-primary/nh/2022/congressional-district-1-democratic.xlsx",bytes:18_779,sha256:"251da7809640050d0b5140b39ba2ec0f6e32aeea1bed4f90db89789f270eba25",district:"01" as const,sheet:"Con1 Dem",title:"Congressional District 1  -  Democratic",rows:109,totalRow:113,headers:["Chris Pappas, d","Tom Alciere, r","Tim Baxter, r","Gail Huff Brown, r","Mark Kilbane, r","Karoline Leavitt, r","Mary Maxwell, r","Matt Mowers, r","Russell Prescott, r","Kevin Rondeau, r","Gilead R. Towne, r","Scatter"],votes:[41_990] as const },
  { id:"nh-2022-democratic-cd2-primary-workbook-archived",archiveUrl:"https://web.archive.org/web/20250613143132id_/https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2022-sp-congressional-district-2-democratic_1.xlsx",officialUrl:"https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2022-sp-congressional-district-2-democratic_1.xlsx",path:"data/source/rapid/house-primary/nh/2022/congressional-district-2-democratic.xlsx",bytes:22_696,sha256:"856b0e14aacb6455772cb7e4cb24af33dd2bb5c1357a37e8a04b16e60811da1f",district:"02" as const,sheet:"Con2 Dem",title:"Congressional District 2 - Democratic",rows:211,totalRow:215,headers:["Ann McLane Kuster, d","Scott Black, r","Robert Burns, r","Michael Callis, r","George Hansel, r","Jay Mercer, r","Dean A Poirier, r","Lily Tang Williams, r","Scatter"],votes:[48_630] as const },
] as const;

const decode=(value:string)=>value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
const textNodes=(value:string)=>[...value.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match=>decode(match[1]!)).join("");
const integer=(value:string,code:string)=>{const parsed=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(parsed))throw new Error(code);return parsed;};

function parseWorkbook(bytes:Buffer,source:(typeof SOURCES)[number]):NewHampshirePrimaryResult2022 {
  let files:Record<string,Uint8Array>;try{files=unzipSync(new Uint8Array(bytes));}catch{throw new Error("NEW_HAMPSHIRE_2022_XLSX_INVALID");}
  const read=(path:string)=>{const value=files[path];if(!value)throw new Error(`NEW_HAMPSHIRE_2022_XLSX_MEMBER_MISSING:${path}`);return Buffer.from(value).toString("utf8");};
  const workbook=read("xl/workbook.xml"),relationships=read("xl/_rels/workbook.xml.rels"),shared=[...read("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match=>textNodes(match[1]!));
  const sheets=[...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)];if(sheets.length!==1||decode(sheets[0]![1]!.match(/\bname="([^"]+)"/)?.[1]??"")!==source.sheet)throw new Error("NEW_HAMPSHIRE_2022_SHEET_INVALID");
  const id=sheets[0]![1]!.match(/\br:id="([^"]+)"/)?.[1],relation=[...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map(match=>match[1]!).find(value=>value.match(/\bId="([^"]+)"/)?.[1]===id),target=relation?.match(/\bTarget="([^"]+)"/)?.[1];if(!target)throw new Error("NEW_HAMPSHIRE_2022_SHEET_RELATION_INVALID");
  const xml=read(target.startsWith("/")?target.slice(1):`xl/${target.replace(/^\.\//,"")}`),cells=new Map<string,{value:string;formula:boolean}>();
  for(const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const attributes=match[1]!,body=match[2]??"",reference=attributes.match(/\br="([^"]+)"/)?.[1],type=attributes.match(/\bt="([^"]+)"/)?.[1],raw=body.match(/<v>([\s\S]*?)<\/v>/)?.[1];if(!reference)throw new Error("NEW_HAMPSHIRE_2022_CELL_REFERENCE_MISSING");const value=type==="s"?shared[integer(raw??"","NEW_HAMPSHIRE_2022_SHARED_INDEX_INVALID")]:raw===undefined?"":decode(raw);if(value===undefined)throw new Error("NEW_HAMPSHIRE_2022_SHARED_VALUE_MISSING");cells.set(reference,{value,formula:/<f(?:\s[^>]*)?>/.test(body)});}
  if(cells.get("A1")?.value!=="State of New Hampshire - Primary Election"||cells.get("A2")?.value!==source.title||cells.get("A3")?.value!=="44817")throw new Error("NEW_HAMPSHIRE_2022_WORKBOOK_IDENTITY_INVALID");
  const column=(index:number)=>String.fromCharCode(65+index),headers=source.headers.map((_,index)=>cells.get(`${column(index+1)}3`)?.value??"");if(!exact(headers,source.headers))throw new Error("NEW_HAMPSHIRE_2022_HEADERS_INVALID");
  let sum=0;for(let row=4;row<source.totalRow;row++){const cell=cells.get(`B${row}`);if(cell?.formula)throw new Error("NEW_HAMPSHIRE_2022_DETAIL_FORMULA_INVALID");sum+=cell?.value?integer(cell.value,"NEW_HAMPSHIRE_2022_DETAIL_VOTE_INVALID"):0;}const total=cells.get(`B${source.totalRow}`);if(!total?.formula||integer(total.value,"NEW_HAMPSHIRE_2022_TOTAL_INVALID")!==sum||sum!==source.votes[0]||cells.get(`A${source.totalRow}`)?.value!=="Totals")throw new Error("NEW_HAMPSHIRE_2022_CONTEST_CLOSURE_INVALID");
  const candidates=[{sourceCandidateName:source.headers[0].replace(/,\s+d$/,"").trim(),rawParty:"d" as const,votes:sum}],unsigned={resultId:`nh:primary:2022:${source.district}:democratic` as const,cycleYear:2022 as const,electionDate:"2022-09-13" as const,districtLabel:`NH-${source.district}` as "NH-01"|"NH-02",sourceLockId:source.id,archivedOfficialSourceUrl:source.officialUrl,candidates,candidateCount:1 as const,totalCandidateVotes:sum,reportingUnitRows:source.rows,resultAuthorityStatus:"archived_copy_of_official_secretary_workbook_retained_live_host_403_not_claimed_certified" as const,sourceWinnerStatus:"not_marked_by_source" as const,winner:null,identity:null,scoreEligible:false as const};
  return{...unsigned,resultSha256:hash("dsa-seats:rapid-house-primary-new-hampshire-result:v2",unsigned)};
}

export function buildNewHampshirePrimaryResultsV2(root=process.cwd()):NewHampshirePrimaryResultsV2 {
  const parent=validateNewHampshirePrimaryResults(JSON.parse(readFileSync(join(root,"data/metadata/rapid-house-primary-new-hampshire-results-v1.json"),"utf8")),root),lock=JSON.parse(readFileSync(join(root,"data/source-lock.json"),"utf8"))as{entries:readonly Record<string,unknown>[]};
  const added=SOURCES.map(source=>{const bytes=readFileSync(join(root,source.path)),expected={id:source.id,url:source.archiveUrl,retainedPath:source.path,retainedStatus:"retained",byteSize:source.bytes,sha256:source.sha256,kind:"archived_official_source",parentIds:[]};if(bytes.length!==source.bytes||sha(bytes)!==source.sha256||lock.entries.filter(entry=>entry.id===source.id).length!==1||!exact(sourceLockContent(lock.entries.find(entry=>entry.id===source.id)),expected))throw new Error(`NEW_HAMPSHIRE_2022_SOURCE_BINDING_INVALID:${source.district}`);return parseWorkbook(bytes,source);}) as [NewHampshirePrimaryResult2022,NewHampshirePrimaryResult2022];
  const results=[added[0],added[1],parent.results[0]!,parent.results[1]!] as const,summary={observations:4 as const,candidateRows:6 as const,candidateVotes:215_632 as const,sourceMarkedWinnerContests:0 as const,scoreEligibleRows:0 as const};
  if(results.reduce((sum,row)=>sum+row.totalCandidateVotes,0)!==summary.candidateVotes||results.some(row=>row.scoreEligible||row.winner!==null||row.identity!==null||row.sourceWinnerStatus!=="not_marked_by_source"))throw new Error("NEW_HAMPSHIRE_RESULTS_V2_CLOSURE_INVALID");
  const resultSetSha256=hash("dsa-seats:rapid-house-primary-new-hampshire-result-set:v2",results),unsigned={schema:"rapid-house-primary-new-hampshire-results-v2" as const,version:2 as const,parentPackageSha256:parent.packageSha256,results,resultSetSha256,summary};return{...unsigned,packageSha256:hash("dsa-seats:rapid-house-primary-new-hampshire-package:v2",unsigned)};
}
export function validateNewHampshirePrimaryResultsV2(value:unknown,root=process.cwd()):NewHampshirePrimaryResultsV2{const expected=buildNewHampshirePrimaryResultsV2(root);if(!exact(value,expected))throw new Error("NEW_HAMPSHIRE_RESULTS_V2_INVALID");return value as NewHampshirePrimaryResultsV2;}
