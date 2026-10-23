import { unzipSync } from "fflate";
import { parseCsv } from "../state-legislative-roster";
import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/** Every sheet of all eleven official workbooks is retained as a pinned CSV
 * zip. Named and multi-member districts retain county and seat count. */
export function parseNewHampshireCsv(text:string):RawGeneralContest[]{
 const rows=parseCsv(text),out:RawGeneralContest[]=[];
 const county=rows.map(r=>r[0]??"").join(" ").match(/State Representatives? - ([A-Z]+) County/i)?.[1];
 let race:{chamber:"upper"|"lower";district:string;seats:number;candidates:{name:string;rawParty:string;votes:number;writeIn:boolean}[]}|null=null;
 let columns:{column:number;name:string;rawParty:string;writeIn:boolean}[]=[],sums:number[]=[],totals:number[]|null=null;
 const integer=(s:string|undefined):number=>{if(s===undefined || s.trim()==="")return 0;const n=Number(s.replace(/,/g,""));if(!Number.isSafeInteger(n)||n<0)throw new Error(`NH_GENERAL_VOTES:${s}`);return n;};
 const flush=()=>{if(!columns.length)return;if(!race)throw new Error("NH_GENERAL_RACE_MISSING");if(totals && sums.some((n,i)=>n!==totals![i]))throw new Error(`NH_GENERAL_RECONCILIATION:${race.district}`);columns.forEach((c,i)=>{const votes=(totals??sums)[i]!;if(c.writeIn){const old=race!.candidates.find(x=>x.writeIn);if(old){old.votes+=votes;return;}}if(race!.candidates.some(x=>x.name===c.name))throw new Error(`NH_GENERAL_DUPLICATE:${race!.district}:${c.name}`);race!.candidates.push({...c,votes});});columns=[];sums=[];totals=null;};
 let recount=false;
 const finish=()=>{flush();if(race){const prior=out.findIndex(r=>r.chamber===race!.chamber&&r.district===race!.district);if(prior>=0){if(!recount)throw new Error("NH_GENERAL_DUPLICATE_DISTRICT");out[prior]=race;}else{if(recount)throw new Error("NH_GENERAL_RECOUNT_WITHOUT_ORIGINAL");out.push(race);}race=null;}};
 for(const row of rows){
  const label=row[0]?.trim()??"",house=label.match(/^District No\.?\s*(\d+)\s*\((\d+)\)/i),senate=label.match(/^State Senate District (\d+)/i);
  if(house||senate){finish();recount=/RECOUNT FIGURES/.test(label);if(house&&!county)throw new Error("NH_GENERAL_COUNTY");race={chamber:house?"lower":"upper",district:house?`${county![0]!.toUpperCase()}${county!.slice(1).toLowerCase()} ${house[1]}`:senate![1]!,seats:house?Number(house[2]):1,candidates:[]};}
  const candidateColumns=row.flatMap((s,column)=>{const m=s.trim().match(/^(.+),\s*([drlui])$/i);return m?[{column,name:m[1]!,rawParty:m[2]!.toUpperCase(),writeIn:false}]:/^Write-Ins?$/i.test(s.trim())?[{column,name:"Write-Ins",rawParty:"",writeIn:true}]:[];});
  if(candidateColumns.some(c=>!c.writeIn)){flush();columns=candidateColumns;sums=columns.map(()=>0);continue;}
  if(!columns.length || !label || /^(?:New Hampshire|State of New Hampshire|State Representatives|11\/05\/2024)/i.test(label))continue;
  const values=columns.map(c=>integer(row[c.column]));
  if(/^Totals?$/i.test(label)){if(totals)throw new Error("NH_GENERAL_TOTAL_DUPLICATE");totals=values;}else if(!totals)values.forEach((n,i)=>sums[i]!+=n);
 }
 finish();return out;
}
const workbooks:StateGeneralSource[]=[
  {
    "id": "nh-2024-house-belknap-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-belknap.xls",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-belknap.xls",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-carroll-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-carroll_0.xlsx",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-carroll_0.xlsx",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-cheshire-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-cheshire_0.xls",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-cheshire_0.xls",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-coos-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-coos_0.xls",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-coos_0.xls",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-grafton-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-grafton_2.xlsx",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-grafton_2.xlsx",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-hillsborough-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-hillsborough_7.xls",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-hillsborough_7.xls",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-merrimack-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-merrimack_2.xlsx",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-merrimack_2.xlsx",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-rockingham-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-rockingham_3.xlsx",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-rockingham_3.xlsx",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-strafford-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-strafford_3.xls",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-strafford_3.xls",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-house-sullivan-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-house-sullivan_0.xlsx",
    "path": "data/source/rapid/state-general/nh/2024-ge-house-sullivan_0.xlsx",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  },
  {
    "id": "nh-2024-senate-workbook",
    "url": "https://www.sos.nh.gov/sites/g/files/ehbemt561/files/inline-documents/sonh/2024-ge-state-senate-district-1-24_4.xls",
    "path": "data/source/rapid/state-general/nh/2024-ge-state-senate-district-1-24_4.xls",
    "cycleYear": 2024,
    "electionDate": "2024-11-05",
    "note": "Official result workbook downloaded from the Secretary of State results page."
  }
];
const extract:StateGeneralSource={id:"nh-2024-general-all-sheets-csv-zip",url:"urn:dsa-seats:nh-2024-general-all-sheets-libreoffice-csv",path:"data/source/rapid/state-general/nh/2024-general-all-sheets-csv.zip",cycleYear:2024,electionDate:"2024-11-05",note:"All sheets of the eleven retained official workbooks; LibreOffice CSV extracts pinned to their workbook parents."};
export const NEW_HAMPSHIRE_GENERAL:StateGeneralAdapter={stateCode:"NH",authority:"New Hampshire Secretary of State, official 2024 general legislative workbooks",sources:[...workbooks,extract],expectedContests:Object.fromEntries([...workbooks.map(s=>[s.id,0]),[extract.id,226]]),parse:(bytes,source)=>source.id===extract.id?Object.entries(unzipSync(bytes)).sort(([a],[b])=>a.localeCompare(b)).flatMap(([,b])=>parseNewHampshireCsv(Buffer.from(b).toString("utf8"))):[]};
