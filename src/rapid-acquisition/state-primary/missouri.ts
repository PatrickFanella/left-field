import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Missouri Secretary of State, official returns of the August 4, 2026
 * primary as announced by the Board of State Canvassers on August 25 (PDF,
 * statewide totals per candidate), read from its pinned `pdftotext -layout`
 * extract. Each race line ("U.S. REPRESENTATIVE - DISTRICT 1", "State
 * Senator - District 2", "State Representative - District 4", followed by
 * "(n of n Precincts Reported)") is followed by one block per party: a line
 * per candidate with name, party, votes and percent, then a "Party Total"
 * line, checked against the candidate sum. Unopposed candidates are printed.
 * The PDF marks no nominee.
 *
 * Missouri held no U.S. Senate or governor election in 2026. Congressional
 * districts are the map redrawn for 2026; the district numbers are read as
 * printed. All 163 House districts and the 17 even-numbered Senate districts
 * were on the ballot.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "mo-2026-primary-official-returns-pdf", url: "https://www.sos.mo.gov/CMSImages/ElectionResultsStatistics/2026PrimaryElection.pdf", path: "data/source/rapid/state-primary/mo/2026-primary-official-returns.pdf", cycleYear: 2026, electionDate: "2026-08-04", note: "Official returns announced by the Board of State Canvassers on 2026-08-25: 8 U.S. House, 17 Senate and 163 House districts, every party.", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`MISSOURI_PRIMARY_${code}`); };
const integer = (value: string): number => { const digits = value.replace(/,/g, ""); return /^\d+$/.test(digits) ? Number(digits) : fail(`INTEGER_INVALID:${value}`); };

const officeOf = (raw: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  const match = raw.match(/^(U\.S\. REPRESENTATIVE|State Senator|State Representative) - District (\d+)$/i);
  if (!match) return null;
  const label = match[1]!.toLowerCase();
  return { office: label === "u.s. representative" ? "us_house" : label === "state senator" ? "state_upper" : "state_lower", district: match[2]! };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  type Party = { rawParty: string; candidates: { name: string; votes: number }[]; total: number | null };
  type Race = { base: Pick<RawPrimaryContest, "office" | "district">; parties: Party[]; total: number | null };
  const races: Race[] = [];
  let race: Race | null = null, party: Party | null = null;
  for (const raw of bytes.toString("utf8").split(/\r?\n/)) {
    const line = raw.replace(/\f/g, "");
    if (line.trim() === "") continue;
    const heading = line.match(/^\s*(\S.*?)\s+\(\d+ of \d+ Precincts Reported\)\s*$/);
    if (heading) {
      const office = officeOf(heading[1]!.trim());
      race = office ? { base: office, parties: [], total: null } : null;
      party = null;
      if (race) races.push(race);
      continue;
    }
    if (!race) continue;
    const partyTotal = line.match(/^\s+Party Total\s+([\d,]+)\s*$/);
    if (partyTotal) { (party ?? fail(`PARTY_TOTAL_ORPHAN:${race.base.office}:${race.base.district}`)).total = integer(partyTotal[1]!); party = null; continue; }
    const total = line.match(/^\s+Total Votes\s+([\d,]+)\s*$/);
    if (total) { race.total = integer(total[1]!); race = null; continue; }
    const candidate = line.match(/^\s*(\S.*?)\s{2,}(\S.*?)\s{2,}([\d,]+)\s+[\d.]+%\s*$/);
    if (candidate) {
      const rawParty = candidate[2]!.trim();
      if (!party || party.rawParty !== rawParty) {
        if (party) fail(`PARTY_TOTAL_MISSING:${race.base.office}:${race.base.district}:${party.rawParty}`);
        if (race.parties.some((entry) => entry.rawParty === rawParty)) fail(`PARTY_REPEATED:${race.base.office}:${race.base.district}:${rawParty}`);
        party = { rawParty, candidates: [], total: null };
        race.parties.push(party);
      }
      party.candidates.push({ name: candidate[1]!.trim(), votes: integer(candidate[3]!) });
      continue;
    }
    // Page headers repeat between and inside races; anything else inside a race is a layout the parser does not know.
    if (!/^\s*(Election Results|Official Election Returns|State of Missouri - Primary Election|As announced by the Board|Office\/Candidate Name)/.test(line)) fail(`LINE_UNKNOWN:${line.trim()}`);
  }
  const contests: RawPrimaryContest[] = [];
  for (const { base, parties, total } of races) {
    const where = `${base.office}:${base.district}`;
    if (parties.length === 0) fail(`NO_CANDIDATES:${where}`);
    for (const entry of parties) {
      if (entry.total !== entry.candidates.reduce((sum, candidate) => sum + candidate.votes, 0)) fail(`PARTY_TOTAL_MISMATCH:${where}:${entry.rawParty}`);
      contests.push({ ...base, rawParty: entry.rawParty, candidates: entry.candidates });
    }
    if (total !== parties.reduce((sum, entry) => sum + entry.total!, 0)) fail(`TOTAL_MISMATCH:${where}`);
  }
  return contests;
}

export const MISSOURI_PRIMARY: StatePrimaryAdapter = {
  stateCode: "MO",
  authority: "Missouri Secretary of State, official primary election returns",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "mo-2026-primary-official-returns-pdf": 362 },
  parse: (bytes) => parse(bytes),
};
