import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Kansas Secretary of State, 2026 primary election official vote totals
 * (PDF), certified by the State Board of Canvassers on September 1, read from
 * its pinned `pdftotext -layout` extract. Same layout as the general
 * election totals: a race line at the margin ("United States House of
 * Representatives 2", "Kansas House of Representatives 12") followed by one
 * indented line per candidate, "R-Jeff Klemp   15,732   50.05%", where the
 * prefix is the party (D, R). Page headers repeat between races. Unopposed
 * candidates are printed; the file marks no nominee. One line names a
 * write-in candidate ("Amy Arteaga (Write-in)", the only Democrat in House
 * 122); it is a write-in, and that party contest, with no ballot candidate,
 * is left out.
 * Governor lines name the ticket ("Ty Masterson / Jeffrey Klemp"); the
 * contest keeps the candidate for governor, before " / ".
 *
 * All 125 House districts were on the ballot. The Senate was last elected in
 * 2024 for four years, so its two 2026 contests (Districts 24 and 25) are for
 * unexpired terms and are reported as special.
 *
 * sos.ks.gov refuses this project's egress (HTTP 403), so the file is the
 * Internet Archive capture of the official PDF taken on October 24, 2026.
 */
const SOURCES: readonly StateGeneralSource[] = [
  { id: "ks-2026-primary-official-vote-totals-pdf", url: "https://web.archive.org/web/20261024201924id_/https://sos.ks.gov/elections/26elec/2026-Primary-Election-Official-Vote-Totals.pdf", path: "data/source/rapid/state-primary/ks/2026-primary-official-vote-totals.pdf", cycleYear: 2026, electionDate: "2026-08-04", note: "Official vote totals certified 2026-09-01; Internet Archive capture (2026-10-24) of the sos.ks.gov PDF, which refuses this egress with HTTP 403. U.S. Senate, U.S. House, governor, 125 House and two unexpired-term Senate contests.", pdfLayoutExtract: true },
];

const fail = (code: string): never => { throw new Error(`KANSAS_PRIMARY_${code}`); };
const integer = (value: string): number => { const digits = value.replace(/,/g, ""); return /^\d+$/.test(digits) ? Number(digits) : fail(`INTEGER_INVALID:${value}`); };
const PARTIES: Readonly<Record<string, string>> = { D: "Democratic", R: "Republican" };

const raceOf = (raw: string): Pick<RawPrimaryContest, "office" | "district" | "special"> | null => {
  if (raw === "United States Senate") return { office: "us_senate", district: null };
  if (raw === "Governor / Lt. Governor") return { office: "governor", district: null };
  const match = raw.match(/^(United States House of Representatives|Kansas House of Representatives|Kansas Senate) (\d+)$/);
  if (!match) return null;
  if (match[1] === "Kansas Senate") return { office: "state_upper", district: match[2]!, special: true };
  return { office: match[1] === "Kansas House of Representatives" ? "state_lower" : "us_house", district: match[2]! };
};

function parse(bytes: Buffer): RawPrimaryContest[] {
  type Race = { base: Pick<RawPrimaryContest, "office" | "district" | "special">; parties: Map<string, { name: string; votes: number }[]> };
  const races: Race[] = [];
  let current: Race | null = null;
  for (const line of bytes.toString("utf8").replace(/\f/g, "\n").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) {
      const label = line.trim();
      if (/^(Race\s+Candidate|Kansas Secretary of State)/.test(label)) continue;
      const base = raceOf(label);
      current = base ? { base, parties: new Map() } : null;
      if (current) races.push(current);
      continue;
    }
    if (!current) continue;
    if (/^\s+(Kansas Secretary of State|\d{4} Primary Election|Official Vote Totals)/.test(line)) continue;
    const candidate = line.match(/^\s+([A-Z]{1,3})-(.+?)\s{2,}([\d,]+)\s+[\d.]+%\s*$/) ?? fail(`LINE_UNKNOWN:${line.trim()}`);
    const rawParty = PARTIES[candidate[1]!] ?? fail(`PARTY_UNKNOWN:${line.trim()}`);
    const label = candidate[2]!.trim(), writeIn = / \(Write-in\)$/i.test(label);
    const name = current.base.office === "governor" ? (label.split(" / ")[0] ?? "").trim() : label.replace(/ \(Write-in\)$/i, "");
    current.parties.set(rawParty, [...(current.parties.get(rawParty) ?? []), { name, votes: integer(candidate[3]!), ...(writeIn ? { writeIn } : {}) }]);
  }
  for (const race of races) if (race.parties.size === 0) fail(`NO_CANDIDATES:${race.base.office}:${race.base.district}`);
  // A party whose only line is a write-in (House 122, Democratic) printed no ballot candidate and is left out.
  return races.flatMap(({ base, parties }) => [...parties].filter(([, candidates]) => candidates.some((candidate) => !("writeIn" in candidate))).map(([rawParty, candidates]) => ({ ...base, rawParty, candidates })));
}

export const KANSAS_PRIMARY: StatePrimaryAdapter = {
  stateCode: "KS",
  authority: "Kansas Secretary of State, primary election official vote totals",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { "ks-2026-primary-official-vote-totals-pdf": 224 },
  parse: (bytes) => parse(bytes),
};
