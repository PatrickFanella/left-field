import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * New Jersey Division of Elections, official results of the June 2, 2026
 * primary: the "Official List" PDF per office (dated 07/27/2026), read from
 * the pinned `pdftotext -layout` extract. No legislative seat is on the 2026
 * ballot, so only U.S. House and U.S. Senate are read.
 *
 * Each candidate block is a line naming the candidate (address and party in
 * their columns), county tally lines, and a "Total" line; the district's
 * "Total" follows the last candidate. "(w)" after a name marks the winner,
 * "*" the incumbent; both are removed from the name. A block cut by a page
 * break repeats the candidate's name on the next page; a long name wraps onto
 * the next line after a hyphen. Each candidate's county tallies must sum to
 * its Total, and the candidate count must match the file's "Total
 * Candidates".
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "nj-2026-primary-us-house-pdf", url: "https://www.nj.gov/state/elections/assets/pdf/election-results/2026/2026-official-primary-results-us-house.pdf", path: "data/source/rapid/state-primary/nj/2026-official-primary-results-us-house.pdf", cycleYear: 2026, electionDate: "2026-06-02", note: "Official list of U.S. House primary results, both parties, 12 districts.", pdfLayoutExtract: true },
  { id: "nj-2026-primary-us-senate-pdf", url: "https://www.nj.gov/state/elections/assets/pdf/election-results/2026/2026-official-primary-results-us-senate.pdf", path: "data/source/rapid/state-primary/nj/2026-official-primary-results-us-senate.pdf", cycleYear: 2026, electionDate: "2026-06-02", note: "Official list of U.S. Senate primary results, both parties.", pdfLayoutExtract: true },
];

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];
const fail = (code: string): never => { throw new Error(`NEW_JERSEY_PRIMARY_${code}`); };
const integer = (value: string): number => Number(value.replace(/,/g, ""));

type Candidate = { district: string | null; party: string; name: string; winner: boolean; tallies: number; total: number | null };

function parse(bytes: Buffer, source: StateGeneralSource): RawPrimaryContest[] {
  const house = source.id === "nj-2026-primary-us-house-pdf";
  const lines = bytes.toString("utf8").split("\n");
  const candidates: Candidate[] = [];
  let columns: { address: number; party: number; tally: number } | null = null;
  let district: string | null = null, current: Candidate | null = null, expected: number | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.replace(/^\f/, "").replace(/\s+$/, "");
    if (/^Candidate Totals for Party/.test(line)) {
      for (const rest of lines.slice(index)) { const match = rest.match(/^Total Candidates\s+(\d+)$/); if (match) expected = Number(match[1]); }
      break;
    }
    const header = line.match(/^Name(\s+)Address\s+Party\s+County\s+Slogan\s+Tally$/);
    if (header) { columns = { address: line.indexOf("Address"), party: line.indexOf("Party"), tally: line.indexOf("Tally") }; continue; }
    const districtMatch = line.match(/^(\w+) Congressional District:/);
    if (districtMatch) { district = String(ORDINALS.indexOf(districtMatch[1]!) + 1); if (district === "0") fail(`DISTRICT:${line}`); continue; }
    const total = line.match(/^\s+Total\s+([\d,]+)$/);
    if (total) { if (current && current.total === null) current.total = integer(total[1]!); continue; }
    if (!columns || line === "" || /^\d{2}\/\d{2}\/\d{4}\s/.test(line) || /^\s/.test(line) && !/\s[\d,]+$/.test(line)) continue;
    if (/^\S/.test(line)) {
      // A long address can run into the Party column ("108 WATCHUNG AVENUE Apt-Unit Republican"); addresses are in capitals.
      const party = line.slice(columns.address).match(/(?:^|\s)([A-Z][a-z]+(?: [A-Z][a-z]+)*)$/)?.[1] ?? "", label = line.slice(0, columns.address).trim();
      if (party === "") {
        // A wrapped name: "VERLINA REYNOLDS-" then "JACKSON" on the next line.
        if (current && current.name.endsWith("-") && label !== "") { current.name += label; continue; }
        if (/^\(part\)|Counties$/.test(line)) continue;
        fail(`LINE:${index + 1}:${line}`);
      }
      if (!/^[A-Z][a-z]+( [A-Z][a-z]+)*$/.test(party)) fail(`PARTY:${index + 1}:${party}`);
      const winner = /\(w\)/.test(label);
      const name = label.replace(/\(w\)/, "").replace(/\*\s*$/, "").replace(/\s+/g, " ").trim();
      if (house && district === null) fail(`DISTRICT_MISSING:${index + 1}`);
      // A block cut by a page break repeats the name on the next page.
      if (current && current.total === null && current.name.replace(/-$/, "") === name && current.district === district) continue;
      if (current && current.total === null) fail(`TOTAL_MISSING:${current.name}`);
      current = { district: house ? district : null, party, name, winner, tallies: 0, total: null };
      candidates.push(current);
      continue;
    }
    // A county tally line: the count ends in the Tally column.
    const tally = line.match(/\s([\d,]+)$/);
    if (tally && current && line.length >= columns.tally) current.tallies += integer(tally[1]!);
  }
  if (expected === null || candidates.length !== expected) fail(`CANDIDATE_COUNT:${candidates.length}:${expected}`);
  const contests = new Map<string, RawPrimaryContest & { candidates: { name: string; votes: number; winner?: boolean }[] }>();
  for (const candidate of candidates) {
    if (candidate.total === null || candidate.total !== candidate.tallies) fail(`TALLY_MISMATCH:${candidate.name}:${candidate.tallies}:${candidate.total}`);
    const key = `${candidate.district}|${candidate.party}`;
    const contest = contests.get(key) ?? { office: house ? "us_house" as const : "us_senate" as const, district: candidate.district, rawParty: candidate.party, candidates: [] };
    contest.candidates.push({ name: candidate.name, votes: candidate.total!, ...(candidate.winner ? { winner: true } : {}) });
    contests.set(key, contest);
  }
  for (const [key, contest] of contests) if (contest.candidates.filter((candidate) => candidate.winner).length !== 1) fail(`WINNERS:${key}`);
  return [...contests.values()];
}

export const NEW_JERSEY_PRIMARY: StatePrimaryAdapter = {
  stateCode: "NJ",
  authority: "New Jersey Division of Elections, official primary results",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "nj-2026-primary-us-house-pdf": 23, "nj-2026-primary-us-senate-pdf": 2 },
  parse,
};
