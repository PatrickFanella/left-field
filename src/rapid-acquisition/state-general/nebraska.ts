import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";
import { assign, cells, count } from "./layout-columns";

/** Nonpartisan official canvasses. Party remains source-defined nonpartisan;
 * these returns establish coverage but cannot supply a D-minus-R baseline. */
export function parseNebraskaGeneral(bytes: Buffer): RawGeneralContest[] {
 const lines=bytes.toString("utf8").split(/\r?\n/),out:RawGeneralContest[]=[];
 for(let i=0;i<lines.length;i++){
  const headings=[...lines[i]!.matchAll(/Legislative District (\d+)/g)];if(!headings.length)continue;
  const block=lines.slice(i+1,i+9);
  const split=headings.length===2 ? Math.min(...block.flatMap(l=>[...l.matchAll(/County/g)].map(m=>m.index!).filter(n=>n>50))) : Infinity;
  if(headings.length===2 && !Number.isFinite(split))throw new Error("NE_GENERAL_TABLE_BOUNDARY");
  headings.forEach((h,d)=>{
   const table=block.map(l=>l.slice(d===0?0:split,d===0?split:undefined));
   const end=table.findIndex(l=>/\bTotal\b/.test(l));if(end<0)throw new Error("NE_GENERAL_TOTAL_MISSING");
   const totals=cells(table[end]!).filter(c=>count(c.text)!==null),anchors=totals.map(c=>c.centre),names=anchors.map(()=>[] as string[]);
   for(const row of table.slice(0,end)){const text=assign(anchors,cells(row).filter(c=>c.text!=="County" && !c.text.includes("Petition")));text.forEach((t,c)=>{if(t)names[c]!.push(t);});}
   const candidates=totals.map((t,c)=>{const name=names[c]!.join(" ").replace(/✔/g,"").trim();if(!name)throw new Error("NE_GENERAL_NAME");return{name,rawParty:"Nonpartisan",votes:count(t.text)!,writeIn:/Write-In/i.test(name)};});
   out.push({chamber:"unicameral",district:h[1]!,candidates});
  });
 }

 return out;
}
const sources:StateGeneralSource[]=[2024,2022].map(year=>({id:`ne-${year}-general-canvass-pdf`,url:`https://sos.nebraska.gov/sites/default/files/doc/elections/${year}/${year}%20General%20Canvass%20Book.pdf`,path:`data/source/rapid/state-general/ne/${year}-general-canvass.pdf`,cycleYear:year,electionDate:`${year}-11-${year===2024?"05":"08"}`,note:"Official nonpartisan legislative returns, no party affiliation inferred.",pdfLayoutExtract:true}));
export const NEBRASKA_GENERAL:StateGeneralAdapter={stateCode:"NE",authority:"Nebraska Board of State Canvassers, official general canvass books",sources,expectedContests:{"ne-2024-general-canvass-pdf":25,"ne-2022-general-canvass-pdf":25},parse:parseNebraskaGeneral};
