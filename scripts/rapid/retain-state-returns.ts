/**
 * Retain the official state-legislative general-election returns every
 * registered state adapter declares, and pin them in the source lock.
 *
 *   npm run rapid:state-returns                 retain every declared source that is not yet on disk
 *   npm run rapid:state-returns -- --state GA   only one state
 *   npm run rapid:state-returns -- --check      verify retained bytes against the lock; download nothing
 *   npm run rapid:state-returns -- --probe      re-fetch every declared URL and report which files the
 *                                               publisher has changed since they were pinned; write nothing
 *
 * Downloads are HTTPS only and written under data/source/rapid/state-general/.
 * A file already on disk, or already pinned, is verified and never overwritten;
 * a publisher that re-issues a file under the same URL therefore fails closed
 * and the adapter must declare a new source id. The probe prints a Markdown
 * report on stdout and progress on stderr; it exits 0 whatever it finds, so
 * the weekly refresh can attach the report without blocking on a publisher
 * that refuses the runner's egress.
 */
import { STATE_GENERAL_ADAPTERS } from "@/rapid-acquisition/state-general";

import { formatProbeReport, probeStateReturns, retainStateReturns } from "./state-returns";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const checkOnly = args.includes("--check");
const probe = args.includes("--probe");
const only = option("state")?.toUpperCase();
const out = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const adapters = STATE_GENERAL_ADAPTERS.filter((adapter) => !only || adapter.stateCode === only);
  if (adapters.length === 0) throw new Error(`STATE_RETURNS_NO_ADAPTER:${only ?? "any"}`);
  if (probe) {
    out(formatProbeReport(await probeStateReturns(adapters, { log: (line) => process.stderr.write(`${line}\n`) })));
    return;
  }
  await retainStateReturns(adapters, { checkOnly }, { log: out });
  out(`${adapters.length} state(s), ${adapters.reduce((sum, adapter) => sum + adapter.sources.length, 0)} source(s) retained. Next: npm run rapid:intake -- derive state-legislative-general-results-v1`);
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
