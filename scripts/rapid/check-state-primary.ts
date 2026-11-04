/**
 * Check one state's primary adapter against the files on disk, before they are pinned.
 *
 *   npm run rapid:check-state-primary -- --state CO [--list 40]
 *
 * Parses every declared source from its path (no lock needed), prints the contest count per source and office
 * (paste the per-source counts into `expectedContests`), then resolves every 2026 seat in the state against
 * those contests alone and prints how each holder's primary reads. Seats with no primary evidence are listed so
 * the adapter's gaps are visible: a missing office, an unprinted unopposed primary, a district the parser
 * misnamed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readSourceLock } from "@/rapid-acquisition/intake/source-lock";
import { readPreElectionSnapshot2026 } from "@/rapid-acquisition/pre-election-snapshot-2026";
import { buildPrimaryEvidenceIndex, primaryEvidenceForSeat, statePrimaryEntries } from "@/rapid-acquisition/seat-outcome-evidence";
import { holderNames } from "@/rapid-acquisition/seat-outcome-ledger";
import { resolveOutcome } from "@/rapid-acquisition/seat-outcome-resolver";
import { STATE_PRIMARY_ADAPTERS } from "@/rapid-acquisition/state-primary";
import { parsedSourceId } from "@/rapid-acquisition/state-legislative-general-results";
import { pdfLayoutExtractPath, transcriptionPath } from "@/rapid-acquisition/state-legislative-general-results";
import { normalizePrimaryContest, PRIMARY_OFFICES, type StatePrimaryContest } from "@/rapid-acquisition/state-primary-results-2026";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const state = option("state")?.toUpperCase() ?? (() => { throw new Error("CHECK_STATE_PRIMARY_STATE_REQUIRED"); })();
const listLimit = Number(option("list") ?? "40");
const root = process.cwd();
const out = (line: string) => process.stdout.write(`${line}\n`);

const adapter = STATE_PRIMARY_ADAPTERS.find((candidate) => candidate.stateCode === state) ?? (() => { throw new Error(`CHECK_STATE_PRIMARY_NO_ADAPTER:${state}`); })();
const pathOf = (source: (typeof adapter.sources)[number]): string => parsedSourceId(source) === source.id ? source.path : source.pdfLayoutExtract ? pdfLayoutExtractPath(source.path) : transcriptionPath(source.path);
const read = (source: (typeof adapter.sources)[number]): Buffer => readFileSync(join(root, pathOf(source)));

const contests: StatePrimaryContest[] = [];
for (const source of adapter.sources) {
  const readSource = (id: string): Buffer => read(adapter.sources.find((candidate) => candidate.id === id) ?? (() => { throw new Error(`CHECK_STATE_PRIMARY_COMPANION:${id}`); })());
  const parsed = adapter.parse(read(source), source, readSource).map((raw) => normalizePrimaryContest(raw, source, adapter));
  const byOffice = PRIMARY_OFFICES.map((office) => `${office} ${parsed.filter((contest) => contest.office === office).length}`).join(", ");
  out(`${source.id}: ${parsed.length} contests (expected ${adapter.expectedContests[source.id] ?? "unset"}) - ${byOffice}`);
  contests.push(...parsed);
}
const ids = contests.map((contest) => contest.contestId);
const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
if (duplicate) out(`DUPLICATE contest id ${duplicate}`);

const lock = readSourceLock(root);
const snapshot = readPreElectionSnapshot2026(root, lock);
const names = holderNames(root, lock, snapshot);
const index = buildPrimaryEvidenceIndex(statePrimaryEntries({ contests }));
const seats = snapshot.rows.filter((row) => row.stateCode === state && row.nextElectionYear === 2026);
const tally = new Map<string, number>();
const gaps: string[] = [];
for (const row of seats) {
  const holder = names.get(row.seatId)!;
  const primaries = primaryEvidenceForSeat(index, row, holder);
  const resolution = resolveOutcome({ row, holder, candidacy: null, primaries, generals: [], successor: null });
  const status = resolution.candidacy === "not_on_primary_ballot" ? "not_on_ballot" : resolution.primary.status;
  const key = `${row.chamber} ${status}`;
  tally.set(key, (tally.get(key) ?? 0) + 1);
  if (primaries.length === 0 || status === "unknown") gaps.push(`${row.seatLabel} ${row.holderName} (${row.holderParty}): ${primaries.length === 0 ? "no contest" : `${primaries.length} contest(s), holder unmatched or ambiguous`}`);
  if (status === "lost") out(`LOST ${row.seatLabel} ${row.holderName} (${row.holderParty}) in ${resolution.primary.contestId}`);
}
out(`\n${seats.length} seats up in 2026:`);
for (const [key, count] of [...tally].sort()) out(`  ${key}: ${count}`);
out(`\n${gaps.length} without a settled reading${gaps.length > listLimit ? ` (first ${listLimit})` : ""}:`);
for (const line of gaps.slice(0, listLimit)) out(`  ${line}`);
