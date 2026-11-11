/** Retain every sheet of the declared NH or LA workbooks as a deterministic
 * CSV zip. Source bytes must already be retained (NH uses normal browser
 * downloads). LibreOffice runs only here, never during builds or tests.
 * Usage: npx tsx scripts/rapid/retain-state-workbook-sheets.ts NH|LA
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { zipSync } from "fflate";
import { STATE_GENERAL_ADAPTERS } from "../../src/rapid-acquisition/state-general";
import { derivedArtifactEntry, findSourceLockEntry, readSourceLock, readRetainedSource, upsertSourceLockEntry, writeSourceLock } from "../../src/rapid-acquisition/intake/source-lock";
const state=process.argv[2]?.toUpperCase();
if(state!=="NH" && state!=="LA")throw new Error("usage: retain-state-workbook-sheets.ts NH|LA");
const adapter=STATE_GENERAL_ADAPTERS.find(a=>a.stateCode===state)!;
const workbooks=adapter.sources.filter(s=>/\.xlsx?$/.test(s.path));
const extract=adapter.sources.find(s=>s.id.endsWith("all-sheets-csv-zip"))!;
let lock=readSourceLock();
for(const source of workbooks){const bytes=readFileSync(source.path);const existing=findSourceLockEntry(lock,source.id);if(existing)readRetainedSource(lock,source.id);else lock=upsertSourceLockEntry(lock,derivedArtifactEntry({id:source.id,url:source.url,retainedPath:source.path,bytes,kind:"official_state_returns",parentIds:[]}));}
const workspace=mkdtempSync(join(tmpdir(),"left-field-sheets-"));
try{
 const output=join(workspace,"out");mkdirSync(output);
 execFileSync("libreoffice",[`-env:UserInstallation=file://${join(workspace,"profile")}`,"--headless","--convert-to","csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1","--outdir",output,...workbooks.map(s=>s.path)],{stdio:"ignore"});
 const members=readdirSync(output).filter(n=>n.endsWith(".csv")).sort();
 if(!members.length)throw new Error("STATE_WORKBOOK_SHEETS_EMPTY");
 // Each declared workbook must contribute at least one sheet.
 for(const workbook of workbooks){const prefix=basename(workbook.path).replace(/\.xlsx?$/,"");if(!members.some(n=>n.startsWith(prefix+"-")||n===prefix+".csv"))throw new Error(`STATE_WORKBOOK_SHEETS_MISSING:${workbook.id}`);}
 const bytes=Buffer.from(zipSync(Object.fromEntries(members.map(n=>[n,readFileSync(join(output,n))])),{level:6,mtime:new Date(Date.UTC(2020,0,1))}));
 writeFileSync(extract.path,bytes);
 lock=upsertSourceLockEntry(lock,derivedArtifactEntry({id:extract.id,url:extract.url,retainedPath:extract.path,bytes,kind:"derived_extract",parentIds:workbooks.map(s=>s.id)}));writeSourceLock(lock);
 console.log(`${state}: ${workbooks.length} workbooks, ${members.length} sheets, ${bytes.length} extract bytes`);
}finally{rmSync(workspace,{recursive:true,force:true});}
