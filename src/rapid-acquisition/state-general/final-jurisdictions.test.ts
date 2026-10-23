import { describe, expect, it } from "vitest";
import { parseCsv } from "../state-legislative-roster";
import { readFileSync } from "node:fs";
import { ALABAMA_GENERAL } from "./alabama";
import { MISSISSIPPI_GENERAL } from "./mississippi";
import { NEBRASKA_GENERAL } from "./nebraska";
import { NEW_HAMPSHIRE_GENERAL, parseNewHampshireCsv } from "./new-hampshire";
import { OKLAHOMA_GENERAL, parseOklahomaGeneral } from "./oklahoma";
import { LOUISIANA_GENERAL } from "./louisiana";
import { DISTRICT_OF_COLUMBIA_GENERAL } from "./district-of-columbia";
import { buildStateLegislativeGeneralResults } from "../state-legislative-general-results";
import { readSourceLock } from "../intake/source-lock";

const adapters = [ALABAMA_GENERAL, MISSISSIPPI_GENERAL, NEBRASKA_GENERAL, NEW_HAMPSHIRE_GENERAL, OKLAHOMA_GENERAL, LOUISIANA_GENERAL, DISTRICT_OF_COLUMBIA_GENERAL];
describe("remaining state and DC general-result sources", () => {
  it("closes each declared source and preserves nonpartisan and omitted-race boundaries", () => {
    const results = buildStateLegislativeGeneralResults(process.cwd(), readSourceLock(), adapters);
    expect(results.states.map(s => [s.stateCode, s.contests])).toEqual([["AL",140],["DC",11],["LA",20],["MS",174],["NE",50],["NH",226],["OK",82]]);
    const race = (state:string, chamber:string, district:string, year:number) => results.contests.find(c=>c.stateCode===state && c.chamber===chamber && c.district===district && c.cycleYear===year)!;
    expect(race("AL","upper","2",2022).candidates.map(c=>[c.name,c.votes])).toEqual([["Tom Butler",25951],["Kim Caudle Lewis",20749],["Write-In",43]]);
    expect(race("AL","lower","85",2022).totalVotes).toBe(12335);
    // These candidates start a new page before their district heading repeats.
    expect(race("MS","upper","3",2023).candidates[0]).toMatchObject({name:"Kathy Leath Chism",votes:13786});
    expect(race("MS","upper","17",2023).candidates[0]?.name).toBe("Chuck Younger");
    expect(new Set(results.contests.filter(c=>c.stateCode==="NE").map(c=>c.district)).size).toBe(49);
    expect(results.contests.filter(c=>c.stateCode==="NE").every(c=>c.democraticMarginPercentagePoints===null && c.candidates.every(p=>p.rawParty==="Nonpartisan"))).toBe(true);
    const recount=race("NH","lower","Strafford 4",2024);
    expect(recount.seats).toBe(3);
    expect(recount.candidates.find(c=>c.name==="Heath Howard")?.votes).toBe(4200);
    expect(race("NH","upper","24",2024)).toBeDefined();
    expect(results.contests.filter(c=>c.stateCode==="DC" && c.district==="At-Large").map(c=>[c.position,c.seats]).sort()).toEqual([["2022",2],["2024",2]]);
    expect(results.contests.filter(c=>c.stateCode==="LA").every(c=>c.electionDate==="2023-11-18")).toBe(true);
    expect(race("OK","upper","46",2024).electionKind).toBe("special_general");
  });

  it("rejects changed Oklahoma vote-channel sums", () => {
    const bytes=readFileSync(OKLAHOMA_GENERAL.sources[0]!.path);
    const text=bytes.toString("utf8");
    const rows=parseCsv(text);const row=rows.find(r=>r[3]?.startsWith("FOR STATE REPRESENTATIVE"))!;
    row[10]=String(Number(row[10])+1);
    const tampered=rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(",")).join("\n");
    expect(()=>parseOklahomaGeneral(Buffer.from(tampered))).toThrow("OK_GENERAL_VOTE_RECONCILIATION");
  });

  it("reconciles NH town totals and permits only an explicit recount replacement", () => {
    const source='State Representatives - BELKNAP County\nDistrict No. 1 (1),"Ann Able, d","Bob Baker, r"\nTown,12,10\nTotals,12,10\n';
    expect(parseNewHampshireCsv(source)[0]?.candidates.map(c=>c.votes)).toEqual([12,10]);
    expect(()=>parseNewHampshireCsv(source.replace('Totals,12,10','Totals,13,10'))).toThrow("NH_GENERAL_RECONCILIATION");
    expect(()=>parseNewHampshireCsv(source+source)).toThrow("NH_GENERAL_DUPLICATE_DISTRICT");
  });
});
