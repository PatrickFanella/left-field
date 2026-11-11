import { unzipSync } from "fflate";
import { parseCsv } from "../state-legislative-roster";
import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/** November general runoff only. October all-party primaries and unopposed
 * elections are not substituted for general returns. All workbook sheets
 * are read; Multi-Parish(Precinct) is the duplicate detailed view. */
export function parseLouisianaGeneralCsv(text:string):RawGeneralContest[]{
 const rows=parseCsv(text),out:RawGeneralContest[]=[];
 for(let i=0;i<rows.length;i++){
  const m=rows[i]![0]?.match(/^State (Senator|Representative) --\s*(\d+)(?:st|nd|rd|th) (?:Senatorial|Representative) District$/);if(!m)continue;
  const names=rows[i+1]!,totals=rows[i+2]!;if(totals[0]!=="Total Votes")throw new Error("LA_GENERAL_TOTAL_MISSING");
  const candidates=names.flatMap((label,c)=>{if(c===0||!label.trim())return[];const party=label.match(/^(.*) \(([A-Z]+)\)$/);const n=totals[c];if(!party||!n||!/^\d+$/.test(n))throw new Error("LA_GENERAL_CANDIDATE");let sum=0;for(let j=i+3;j<rows.length&&rows[j]![0]?.trim();j++){const value=rows[j]![c]?.trim()??"";if(value&&!/^\d+$/.test(value))throw new Error("LA_GENERAL_PARISH_VOTES");sum+=Number(value);}if(sum!==Number(n))throw new Error(`LA_GENERAL_RECONCILIATION:${m[2]}`);return[{name:party[1]!,rawParty:party[2]!,votes:Number(n)}];});
  out.push({chamber:m[1]==="Senator"?"upper":"lower",district:m[2]!,candidates});
 }
 return out;
}
export const LOUISIANA_WORKBOOK:StateGeneralSource={id:"la-2023-general-runoff-workbook",url:"https://s3-us-west-2.amazonaws.com/mediaresults.sos.la.gov/HumanReadableElectionResults/20231118/Election+Results+(11-18-2023).xlsx",path:"data/source/rapid/state-general/la/2023-general-runoff.xlsx",cycleYear:2023,electionDate:"2023-11-18",note:"Official November general runoff workbook, all sheets. October majority elections and unopposed seats remain outside this baseline."};
const extract:StateGeneralSource={...LOUISIANA_WORKBOOK,id:"la-2023-general-runoff-all-sheets-csv-zip",url:"urn:dsa-seats:la-2023-general-runoff-all-sheets-libreoffice-csv",path:"data/source/rapid/state-general/la/2023-general-runoff-all-sheets-csv.zip"};
export const LOUISIANA_GENERAL:StateGeneralAdapter={stateCode:"LA",authority:"Louisiana Secretary of State, November 18 2023 general runoff results",sources:[LOUISIANA_WORKBOOK,extract],expectedContests:{[LOUISIANA_WORKBOOK.id]:0,[extract.id]:20},parse:(bytes,source)=>{if(source.id!==extract.id)return[];const races=new Map<string,RawGeneralContest>();for(const[name,data]of Object.entries(unzipSync(bytes))){if(name.includes("Multi-Parish(Precinct)"))continue;for(const race of parseLouisianaGeneralCsv(Buffer.from(data).toString("utf8"))){const key=`${race.chamber}|${race.district}`;if(races.has(key))throw new Error(`LA_GENERAL_DUPLICATE:${key}`);races.set(key,race);}}return[...races.values()];}};
