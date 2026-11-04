/**
 * Freeze the pre-election 2026 Priority Index once.
 *
 *   npm run rapid:freeze-pre-election
 *
 * Builds priority-index-pre-election-2026-v1 from the pinned v1.17 projections,
 * writes it and pins it with those projections as parents. Refuses to run
 * when the lock already carries the id: the snapshot is the fixed point the
 * outcome ledger compares against, and a second freeze would move it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { derivedArtifactEntry, findSourceLockEntry, readSourceLock, upsertSourceLockEntry, writeSourceLock } from "@/rapid-acquisition/intake/source-lock";
import { buildPreElectionSnapshot2026, PRE_ELECTION_SNAPSHOT_2026 } from "@/rapid-acquisition/pre-election-snapshot-2026";
import { sha } from "@/rapid-acquisition/shared";

const root = process.cwd();
const lock = readSourceLock(root);
if (findSourceLockEntry(lock, PRE_ELECTION_SNAPSHOT_2026.id)) throw new Error(`PRE_ELECTION_ALREADY_FROZEN:${PRE_ELECTION_SNAPSHOT_2026.id}`);
const value = buildPreElectionSnapshot2026(root, lock);
const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
mkdirSync(dirname(PRE_ELECTION_SNAPSHOT_2026.path), { recursive: true });
writeFileSync(PRE_ELECTION_SNAPSHOT_2026.path, bytes);
writeSourceLock(upsertSourceLockEntry(lock, derivedArtifactEntry({ id: PRE_ELECTION_SNAPSHOT_2026.id, url: PRE_ELECTION_SNAPSHOT_2026.url, retainedPath: PRE_ELECTION_SNAPSHOT_2026.path, bytes, kind: "derived_artifact", parentIds: [...PRE_ELECTION_SNAPSHOT_2026.parentIds] })), root);
process.stdout.write(`${PRE_ELECTION_SNAPSHOT_2026.id}: ${value.summary.seats} seats (${value.summary.scored} scored) from ${value.modelVersion} published ${value.publishedAt}; ${bytes.length} bytes; sha256 ${sha(bytes)}; package ${value.packageSha256}\n`);
