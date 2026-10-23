import type { RawGeneralContest, StateGeneralAdapter } from "../state-legislative-general-results";

/** Certified November 28 canvass. Candidate columns end in Write-In. Read the printed statewide totals;
 * continuation pages contain only county figures and are not additional races. */
export function parseAlabamaGeneral(bytes: Buffer): RawGeneralContest[] {
  const races = new Map<string, { chamber: "upper" | "lower"; district: string; candidates: { name: string; rawParty: string; votes: number; writeIn: boolean }[] }>();
  for (const page of bytes.toString("utf8").split("\f")) {
    if (!/^Alabama (Senate|House of Representatives) - General Election Results/.test(page.trimStart())) continue;
    const lines = page.split(/\r?\n/);
    const headings = [...page.matchAll(/State (Senator|Representative), District (\d+)/g)];
    const row = lines.findIndex((line) => /^Total\s+\d/.test(line));
    if (row < 0 || !lines[row - 1]?.includes("(")) continue;
    if (!headings.length) throw new Error("AL_GENERAL_PAGE_SHAPE");
    const nameLine = lines[row - 1]!.replace(/Write-In/g, "Write-In (W)");
    const names = [...nameLine.matchAll(/([^()]+?)\s*\(([DRLIW])\)/g)].map((m) => ({ name: m[2] === "W" ? "Write-In" : m[1]!.trim(), rawParty: m[2] === "W" ? "" : m[2]!, writeIn: m[2] === "W" }));
    const numbers = [...lines[row]!.matchAll(/\d[\d,]*/g)];
    if (numbers.length && numbers.length !== names.length) throw new Error(`AL_GENERAL_COLUMN_COUNT:${nameLine}:${numbers.length}/${names.length}`);
    const groups: typeof names[] = []; let group: typeof names = [];
    for (const name of names) { group.push(name); if (name.writeIn) { groups.push(group); group = []; } }
    if (group.length || groups.length !== headings.length) throw new Error(`AL_GENERAL_DISTRICT_COLUMNS:${headings.map(h=>h[0])}:${nameLine}`);
    let offset = 0;
    for (let h = 0; h < headings.length; h++) {
      const heading = headings[h]!, key = `${heading[1]}:${heading[2]}`;
      const candidates = groups[h]!.map((candidate, index) => ({...candidate, votes: numbers.length ? Number(numbers[offset + index]![0].replace(/,/g, "")) : 0}));
      const old = races.get(key);
      if (old && JSON.stringify(old.candidates.map(c => ({name:c.name,rawParty:c.rawParty,writeIn:c.writeIn}))) !== JSON.stringify(groups[h])) throw new Error(`AL_GENERAL_HEADER_DRIFT:${key}`);
      if (!old && !numbers.length) throw new Error(`AL_GENERAL_TOTAL_MISSING:${key}`);
      const race = old ?? { chamber: heading[1] === "Senator" ? "upper" as const : "lower" as const, district: heading[2]!, candidates };
      if (old && numbers.length) throw new Error(`AL_GENERAL_DUPLICATE_TOTAL:${key}`);
      races.set(key, race); offset += candidates.length;
    }
  }
  return [...races.values()];
}

export const ALABAMA_GENERAL: StateGeneralAdapter = {
  stateCode: "AL", authority: "Alabama Secretary of State, certified 2022 general canvass, November 28, 2022",
  sources: [{ id: "al-2022-general-certified-canvass-pdf", url: "https://www.sos.alabama.gov/sites/default/files/election-data/2022-11/Final%20Canvass%20of%20Results%20%28canvassed%20by%20state%20canvassing%20board%2011-28-2022%29.pdf", path: "data/source/rapid/state-general/al/2022-general-certified-canvass.pdf", cycleYear: 2022, electionDate: "2022-11-08", note: "All 105 House and 35 Senate districts; certified statewide totals.", pdfLayoutExtract: true }],
  expectedContests: { "al-2022-general-certified-canvass-pdf": 140 }, parse: parseAlabamaGeneral,
};
