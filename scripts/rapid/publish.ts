/**
 * Publish a new Priority Index release from the current retained inputs.
 *
 *   npm run rapid:publish -- --version v1.1 [--date 2026-10-01]
 *   npm run rapid:publish -- --bump [--date 2026-10-01]        next minor version after the pinned descriptor
 *
 * Steps, in order: re-derive every registered derived artifact whose parents
 * changed (all of them, in registry order, to keep the chain closed); write and
 * pin the release descriptor; write a review note skeleton with the digests;
 * run the source-lock verifier. Nothing here edits source code, and the House
 * layer is only re-derived, never re-modelled.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { derivedArtifactEntry, readSourceLock, upsertSourceLockEntry, writeSourceLock } from "@/rapid-acquisition/intake/source-lock";
import { readRefreshInputs } from "@/rapid-acquisition/refresh-inputs";
import { sha } from "@/rapid-acquisition/shared";
import { GOVERNOR_SCORE_V01 } from "@/rapid-acquisition/governor-score-v01";
import { HOUSE_SCORE_V11 } from "@/rapid-acquisition/house-score-v11-active";
import { SENATE_SCORE_V01 } from "@/rapid-acquisition/senate-score-v01";
import { readStateLegislativeGeneralResults, stateReturnsStatus } from "@/rapid-acquisition/state-legislative-general-results";
import { buildStateLegislativeScoreV01Projection, STATE_LEGISLATIVE_SCORE_V01 } from "@/rapid-acquisition/state-legislative-score-v01";
import { PRIORITY_INDEX_RELEASE, readPriorityIndexRelease, serializePriorityIndexRelease, type PriorityIndexRelease } from "@/lib/priority-index-release";

import { DERIVED_ARTIFACTS, derivedParentIds } from "./derived-artifacts";
import { formatResultStatusNote } from "./state-returns";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const requestedVersion = option("version");
if (!requestedVersion && !args.includes("--bump")) throw new Error("usage: rapid:publish (--version vX.Y | --bump) [--date YYYY-MM-DD]");
if (requestedVersion && !/^v\d+\.\d+$/.test(requestedVersion)) throw new Error(`PUBLISH_VERSION_INVALID:${requestedVersion}`);
const bumpMinor = (current: string): string => { const match = current.match(/^v(\d+)\.(\d+)$/); if (!match) throw new Error(`PUBLISH_VERSION_INVALID:${current}`); return `v${match[1]}.${Number(match[2]) + 1}`; };
const date = option("date") ?? new Date().toISOString().slice(0, 10);
const out = (line: string) => process.stdout.write(`${line}\n`);

function main(): void {
  const root = process.cwd();
  const previous = readPriorityIndexRelease(root);
  const version = requestedVersion ?? bumpMinor(previous.modelVersion);
  const digests: string[] = [];
  for (const artifact of DERIVED_ARTIFACTS) {
    const lock = readSourceLock(root);
    const value = artifact.build(root, lock);
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    mkdirSync(dirname(artifact.path), { recursive: true });
    const before = (() => { try { return sha(readFileSync(artifact.path)); } catch { return null; } })();
    writeFileSync(artifact.path, bytes);
    writeSourceLock(upsertSourceLockEntry(lock, derivedArtifactEntry({ id: artifact.id, url: artifact.url, retainedPath: artifact.path, bytes, kind: artifact.kind, parentIds: [...derivedParentIds(artifact, root, lock)] })));
    const record = value as { packageSha256?: string };
    digests.push(`- \`${artifact.id}\`: ${bytes.length.toLocaleString("en-US")} bytes; SHA-256 \`${sha(bytes)}\`; package \`${record.packageSha256}\`${before === sha(bytes) ? " (unchanged)" : ""}`);
    out(`${artifact.id}: ${before === sha(bytes) ? "unchanged" : "rebuilt"}`);
  }
  const inputs = readRefreshInputs(root);
  // Read back the general-results artifact the loop just pinned: which states are still on unofficial returns, and what replaced what.
  const returns = stateReturnsStatus(readStateLegislativeGeneralResults(root));
  const release: PriorityIndexRelease = {
    ...previous,
    modelVersion: version,
    publishedAt: date,
    chambers: {
      house: { ...previous.chambers.house, artifactId: HOUSE_SCORE_V11.id, modelVersion: "v0.11", financeAsOf: inputs.snapshotDate },
      senate: { artifactId: SENATE_SCORE_V01.id, modelVersion: previous.chambers.senate.modelVersion, sourceCutoff: inputs.snapshotDate, financeAsOf: inputs.snapshotDate },
      governor: { artifactId: GOVERNOR_SCORE_V01.id, modelVersion: previous.chambers.governor?.modelVersion ?? "v0.1", sourceCutoff: inputs.snapshotDate },
      stateLegislative: { artifactId: STATE_LEGISLATIVE_SCORE_V01.id, modelVersion: previous.chambers.stateLegislative?.modelVersion ?? "v0.1", sourceCutoff: inputs.snapshotDate, coveredStates: buildStateLegislativeScoreV01Projection(root).coveredStates, ...(returns.unofficialStates.length > 0 ? { unofficialStates: returns.unofficialStates } : {}) },
    },
  };
  const bytes = Buffer.from(serializePriorityIndexRelease(release));
  writeFileSync(PRIORITY_INDEX_RELEASE.path, bytes);
  writeSourceLock(upsertSourceLockEntry(readSourceLock(root), derivedArtifactEntry({ id: PRIORITY_INDEX_RELEASE.id, url: "urn:dsa-seats:priority-index-release:v1", retainedPath: PRIORITY_INDEX_RELEASE.path, bytes, kind: "editorial_ledger", parentIds: [] })));
  const note = `docs/reviews/priority-index-release-${version}-${date}.md`;
  writeFileSync(note, [
    `# Priority Index ${version} — ${date}`,
    "",
    "## Outcome",
    "",
    `Automated release. House layer ${release.chambers.house.modelVersion} (source cutoff ${release.chambers.house.sourceCutoff}); Senate layer ${release.chambers.senate.modelVersion} (FEC and roster snapshot ${inputs.snapshotDate}, \`${inputs.fecCandidateSummaryId}\`). Fill in what changed and why before merging.`,
    "",
    "## Immutable outputs",
    "",
    ...digests,
    "",
    ...formatResultStatusNote(returns),
    "",
    "## Reproduction",
    "",
    "```sh",
    `npm run rapid:refresh -- --date ${inputs.snapshotDate} --skip-download`,
    `npm run rapid:publish -- --version ${version} --date ${date}`,
    "npm run data:verify",
    "npm run test:fast",
    "```",
    "",
  ].join("\n"));
  execFileSync("node", ["scripts/verify-source-lock.mjs"], { stdio: "inherit" });
  out(`published ${version} (${date}); review note ${note}`);
}

main();
