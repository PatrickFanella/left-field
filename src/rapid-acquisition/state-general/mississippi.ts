import type { RawGeneralContest, StateGeneralAdapter } from "../state-legislative-general-results";

/** Official recapitulation prints each candidate across county-column pages,
 * with TOTAL on the last page. Repeated county rows establish the district;
 * only the TOTAL page supplies the statewide candidate count. */
export function parseMississippiGeneral(bytes: Buffer): RawGeneralContest[] {
  const races = new Map<string, {chamber:"upper"|"lower";district:string;candidates:{name:string;rawParty:string;votes:number}[]}>();
  const identities = new Map<string,string>(); let key: string | null = null; let pending = false;
  for(const pass of [0, 1]) for(const page of bytes.toString("utf8").split("\f")) {
    if(!pending)key=null; let headingOnPage=false;
    const totalPage = /\bTOTAL\b/.test(page);
    for(const line of page.split(/\r?\n/)) {
      const office = line.match(/^\s*(State Senate|State House Of Rep) (\d+)-District (\d+)\s*$/);
      if(office) {headingOnPage=true;pending=true;if(Number(office[2])!==Number(office[3]))throw new Error("MS_GENERAL_DISTRICT");key=`${office[1]}:${Number(office[3])}`;if(!races.has(key))races.set(key,{chamber:office[1]==="State Senate"?"upper":"lower",district:String(Number(office[3])),candidates:[]});continue;}
      // Other offices reset the legislative context even on shared pages.
      if(/^\s*(?:District Attorney|Supreme Court|Court Of Appeals|Governor|Lieutenant Governor|Secretary Of State|Attorney General|State Auditor|State Treasurer|Commissioner|Public Service|Transportation)/.test(line)){key=null;continue;}
      const candidate = line.match(/^(.+?)\s{2,}(Democrat|Republican|Independent|Libertarian|Reform)\s{2,}(.+)$/);
      if(!candidate)continue;
      const identity=`${candidate[1]!.trim()}|${candidate[2]}`;
      if(pass===0){if(key){pending=false;const old=identities.get(identity);if(old && !headingOnPage)continue;if(old && old!==key)throw new Error(`MS_GENERAL_IDENTITY:${identity}:${old}:${key}`);identities.set(identity,key);}continue;}
      const district=identities.get(identity);if(!totalPage || !district)continue;
      const fields=candidate[3]!.trim().split(/\s+/),last=fields.at(-1)!;
      if(!/^\d+$/.test(last))throw new Error(`MS_GENERAL_TOTAL:${identity}`);
      const race=races.get(district)!;if(race.candidates.some(c=>c.name===candidate[1]!.trim()))throw new Error(`MS_GENERAL_DUPLICATE:${identity}`);
      race.candidates.push({name:candidate[1]!.trim(),rawParty:candidate[2]!,votes:Number(last)});
    }
  }
  return [...races.values()].filter(r=>r.candidates.length);
}
export const MISSISSIPPI_GENERAL: StateGeneralAdapter = {stateCode:"MS",authority:"Mississippi Secretary of State, official 2023 statewide recapitulation",sources:[{id:"ms-2023-general-certified-recap-pdf",url:"https://www.sos.ms.gov/elections/electionresults/2023General/State%20Certified%20Results/2023%20Statewide%20Recapitulation%20Sheet.pdf",path:"data/source/rapid/state-general/ms/2023-general-certified-recap.pdf",cycleYear:2023,electionDate:"2023-11-07",note:"52 Senate and 122 House districts; official statewide candidate totals.",pdfLayoutExtract:true}],expectedContests:{"ms-2023-general-certified-recap-pdf":174},parse:parseMississippiGeneral};
