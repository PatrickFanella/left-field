/**
 * Retain the official 2026 primary returns every registered primary adapter
 * declares, and pin them in the source lock.
 *
 *   npm run rapid:state-primaries                          retain and pin every declared source not yet on disk
 *   npm run rapid:state-primaries -- --state GA            only one state
 *   npm run rapid:state-primaries -- --state GA --download-only
 *                                                          fetch missing files, leave the lock alone (while writing an adapter)
 *   npm run rapid:state-primaries -- --check               verify retained bytes against the lock; download nothing
 *   npm run rapid:state-primaries -- --probe               re-fetch every declared URL and report changes; write nothing
 *
 * Retention is the same as for general-election returns (scripts/rapid/state-returns.ts): HTTPS only, a file
 * already on disk or pinned is verified and never overwritten.
 */
import { STATE_PRIMARY_ADAPTERS } from "@/rapid-acquisition/state-primary";

import { formatProbeReport, probeStateReturns, retainStateReturns } from "./state-returns";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const only = option("state")?.toUpperCase();
const out = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const adapters = STATE_PRIMARY_ADAPTERS.filter((adapter) => !only || adapter.stateCode === only);
  if (adapters.length === 0) throw new Error(`STATE_PRIMARIES_NO_ADAPTER:${only ?? "any"}`);
  if (args.includes("--probe")) {
    out(formatProbeReport(await probeStateReturns(adapters, { log: (line) => process.stderr.write(`${line}\n`) })));
    return;
  }
  const downloadOnly = args.includes("--download-only");
  await retainStateReturns(adapters, { checkOnly: args.includes("--check"), downloadOnly }, { log: out });
  out(`${adapters.length} state(s), ${adapters.reduce((sum, adapter) => sum + adapter.sources.length, 0)} source(s) ${downloadOnly ? "on disk (not pinned)" : "retained"}. Next: ${downloadOnly ? "npm run rapid:check-state-primary -- --state XX" : "npm run rapid:intake -- derive state-primary-results-2026-v1"}`);
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
