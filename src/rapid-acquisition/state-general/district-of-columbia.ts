import { parseCsv } from "../state-legislative-roster";
import type { RawGeneralContest, StateGeneralAdapter, StateGeneralSource } from "../state-legislative-general-results";

/** Certified precinct CSV, summed once per candidate. The at-large groups
 * elected in different cycles stay separate two-seat positions. */
export function parseDcGeneral(bytes:Buffer,source:StateGeneralSource):RawGeneralContest[]{
 const rows=parseCsv(bytes.toString("utf8")),header=rows.shift()!,col=(n:string)=>{const i=header.indexOf(n);if(i<0)throw new Error(`DC_GENERAL_COLUMN:${n}`);return i;};
 const office=col("ContestName"),name=col("Candidate"),party=col("Party"),votes=col("Votes"),precinct=col("PrecinctNumber"),seen=new Set<string>();
 const races=new Map<string,{district:string;candidates:Map<string,{name:string;rawParty:string;votes:number;writeIn:boolean}>}>();
 for(const row of rows){const label=row[office]!,m=label.match(/^(WARD (?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT)|AT-LARGE|CHAIRMAN) (?:MEMBER |)OF THE COUNCIL OF THE DISTRICT OF COLUMBIA$/);if(!m)continue;
  const words=["ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT"],district=m[1]!.startsWith("WARD ")?`Ward ${words.indexOf(m[1]!.slice(5))+1}`:m[1]==="AT-LARGE"?"At-Large":"Chairman";
  const candidate=row[name]!,key=`${label}|${row[precinct]}|${candidate}`;if(seen.has(key))throw new Error("DC_GENERAL_DUPLICATE_PRECINCT");seen.add(key);
  const n=Number(row[votes]);if(!Number.isSafeInteger(n)||n<0)throw new Error("DC_GENERAL_VOTES");
  const race=races.get(district)??{district,candidates:new Map()},old=race.candidates.get(candidate)??{name:candidate.replace(/^(?:DEM|REP|IND|LIB|STG) /,""),rawParty:row[party]!,votes:0,writeIn:/write.?in/i.test(candidate)};
  if(old.rawParty!==row[party])throw new Error("DC_GENERAL_PARTY_DRIFT");old.votes+=n;race.candidates.set(candidate,old);races.set(district,race);
 }
 return [...races.values()].map(r=>({chamber:"unicameral",district:r.district,seats:r.district==="At-Large"?2:1,...(r.district==="At-Large"?{position:String(source.cycleYear)}:{}),candidates:[...r.candidates.values()]}));
}
const sources:StateGeneralSource[]=[2024,2022].map(year=>({id:`dc-${year}-general-certified-results-csv`,url:`https://electionresults.dcboe.org/Downloads/Reports/November_${year===2024?"5":"8"}_${year}_General_Election_Certified_Results.csv`,path:`data/source/rapid/state-general/dc/${year}-general-certified-results.csv`,cycleYear:year,electionDate:`${year}-11-${year===2024?"05":"08"}`,note:"Certified council results, precinct candidate votes; four wards and two at-large seats each cycle, plus the 2022 chairman."}));
export const DISTRICT_OF_COLUMBIA_GENERAL:StateGeneralAdapter={stateCode:"DC",authority:"District of Columbia Board of Elections, certified general results",sources,expectedContests:{"dc-2024-general-certified-results-csv":5,"dc-2022-general-certified-results-csv":6},parse:parseDcGeneral};
