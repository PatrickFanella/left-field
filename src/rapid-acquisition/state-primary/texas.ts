import type { StateGeneralSource } from "../state-legislative-general-results";
import type { PrimaryOffice, RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Texas Secretary of State, Official Canvass Reports of the March 3, 2026
 * party primaries and the May 26 primary runoffs, one report per party and
 * round (Civix election ids 53814 Democratic, 53813 Republican, 58314 and
 * 58315 their runoffs). Each office prints a header line with the statewide
 * registration and turnout, one line per candidate (name, party code, canvass
 * votes and percent) and a "Total" line. Unopposed candidates are printed at
 * 100 %. The report marks no winner; a Texas primary nominates by majority
 * and sends the top two to the runoff otherwise. Republican names carry " (I)"
 * for incumbents, which is removed.
 *
 * The Civix API answers the report URL with JSON whose "upload" field is the
 * PDF in base64. Each retained PDF is that field decoded and placed by hand;
 * the Democratic bytes equal the canvass PDFs pinned earlier as
 * tx-2026-democratic-primary-official-canvass-pdf and its runoff. The API
 * offers these reports only as PDF (its report list names no Excel file), and
 * the ENR election feed is not the certified canvass.
 */
const HAND_PLACED = "The API answers with JSON whose \"upload\" field is the PDF in base64; the decoded PDF was placed at its path by hand.";
const report = (id: number): string => `https://goelect.txelections.civixapps.com/api-ivis-system/api/s3/enr/electionReports/${id}/OfficialCanvassReport/pdf`;
const SOURCES: readonly StateGeneralSource[] = [
  { id: "tx-2026-primary-democratic-official-canvass-pdf", url: report(53814), path: "data/source/rapid/state-primary/tx/2026-primary-democratic-official-canvass.pdf", cycleYear: 2026, electionDate: "2026-03-03", note: `Democratic primary official canvass, every office. ${HAND_PLACED}`, pdfLayoutExtract: true },
  { id: "tx-2026-primary-republican-official-canvass-pdf", url: report(53813), path: "data/source/rapid/state-primary/tx/2026-primary-republican-official-canvass.pdf", cycleYear: 2026, electionDate: "2026-03-03", note: `Republican primary official canvass, every office. ${HAND_PLACED}`, pdfLayoutExtract: true },
  { id: "tx-2026-primary-runoff-democratic-official-canvass-pdf", url: report(58314), path: "data/source/rapid/state-primary/tx/2026-primary-runoff-democratic-official-canvass.pdf", cycleYear: 2026, electionDate: "2026-05-26", note: `Democratic primary runoff official canvass. ${HAND_PLACED}`, pdfLayoutExtract: true },
  { id: "tx-2026-primary-runoff-republican-official-canvass-pdf", url: report(58315), path: "data/source/rapid/state-primary/tx/2026-primary-runoff-republican-official-canvass.pdf", cycleYear: 2026, electionDate: "2026-05-26", note: `Republican primary runoff official canvass. ${HAND_PLACED}`, pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`TEXAS_PRIMARY_${code}`); };

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (raw === "U. S. SENATOR") return { office: "us_senate", district: null };
  if (raw === "GOVERNOR") return { office: "governor", district: null };
  const match = raw.match(/^(U\. S\. REPRESENTATIVE DISTRICT|STATE SENATOR, DISTRICT|STATE REPRESENTATIVE DISTRICT) (\d+)$/);
  if (!match) return null;
  const office: PrimaryOffice = match[1]!.startsWith("U. S.") ? "us_house" : match[1]!.startsWith("STATE SENATOR") ? "state_upper" : "state_lower";
  return { office, district: match[2]! };
};

const HEADER = /^(\S.*?)\s{2,}[\d,]+\s+[\d.]+ %$/;
const CANDIDATE = /^(\S.*?)\s{2,}(DEM|REP)\s+([\d,]+)\s+[\d.]+ %$/;
const TOTAL = /^\s+Total\s+([\d,]+)$/;
const count = (raw: string): number => Number(raw.replace(/,/g, ""));

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const lines = bytes.toString("utf8").split(/\r?\n/).map((line) => line.trimEnd());
  const party = /DEMOCRATIC PRIMARY/.test(lines.slice(0, 8).join(" ")) ? "DEM" : /REPUBLICAN PRIMARY/.test(lines.slice(0, 8).join(" ")) ? "REP" : fail(`PARTY_TITLE:${source.id}`);
  const runoff = source.id.includes("-runoff-");
  if (runoff !== /PRIMARY RUNOFF ELECTION/.test(lines.slice(0, 8).join(" "))) fail(`ROUND_TITLE:${source.id}`);
  const contests: RawPrimaryContest[] = [];
  // The report runs header, candidates, Total for every office; a page break can fall between the last candidate and Total.
  let current: { base: Pick<RawPrimaryContest, "office" | "district">; candidates: { name: string; votes: number }[] } | null = null, open = false;
  for (const [index, line] of lines.entries()) {
    const candidate = line.match(CANDIDATE);
    if (candidate) {
      if (!open) fail(`CANDIDATE_OUTSIDE_OFFICE:${source.id}:${index + 1}`);
      if (candidate[2] !== party) fail(`PARTY:${source.id}:${index + 1}`);
      current?.candidates.push({ name: candidate[1]!.replace(/\s*\(I\)$/, "").trim(), votes: count(candidate[3]!) });
      continue;
    }
    const total = line.match(TOTAL);
    if (total) {
      if (!open) fail(`TOTAL_OUTSIDE_OFFICE:${source.id}:${index + 1}`);
      if (current) {
        if (current.candidates.reduce((sum, row) => sum + row.votes, 0) !== count(total[1]!)) fail(`TOTAL_MISMATCH:${source.id}:${current.base.office}:${current.base.district}`);
        if (current.candidates.length === 0) fail(`NO_CANDIDATES:${source.id}:${current.base.office}:${current.base.district}`);
        contests.push({ ...current.base, rawParty: party, ...(runoff ? { stage: "runoff" as const } : {}), candidates: current.candidates });
      }
      current = null; open = false;
      continue;
    }
    const header = line.match(HEADER);
    // Party propositions print YES and NO lines with no party code; they belong to the open proposition.
    if (header && open && /^(YES|NO)$/.test(header[1]!)) continue;
    if (header && !/^OFFICE NAME/.test(line)) {
      if (open) fail(`HEADER_BEFORE_TOTAL:${source.id}:${index + 1}`);
      const office = officeOf(header[1]!);
      current = office ? { base: office, candidates: [] } : null; open = true;
    }
  }
  if (open) fail(`UNCLOSED_OFFICE:${source.id}`);
  return contests;
}

export const TEXAS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "TX",
  authority: "Texas Secretary of State, official canvass reports of the party primaries and runoffs",
  system: "partisan",
  sources: SOURCES,
  expectedContests: {
    "tx-2026-primary-democratic-official-canvass-pdf": 206,
    "tx-2026-primary-republican-official-canvass-pdf": 187,
    "tx-2026-primary-runoff-democratic-official-canvass-pdf": 16,
    "tx-2026-primary-runoff-republican-official-canvass-pdf": 14,
  },
  parse: (bytes, source) => parse(bytes, source),
};
