import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { hash, sha } from "../shared";
import { sourceLockMatches } from "./source-lock-content";

/**
 * Read, verify, and upsert `data/source-lock.json` entries.
 *
 * The lock remains the single pin for retained bytes. Intake specs refer to
 * lock ids and do not need to repeat byte sizes and digests; the builder reads
 * the pin from here and fails when the retained file disagrees.
 */
export interface SourceLockEntry {
  readonly id: string;
  readonly url: string;
  readonly retainedPath: string | null;
  readonly retainedStatus: "retained" | "nonretained";
  readonly byteSize: number;
  readonly sha256: string;
  readonly kind: string;
  readonly parentIds: readonly string[];
  /** Optional only for legacy in-memory builders; serialized locks require it. */
  readonly license?: string;
  readonly licenseEvidence?: SourceLicenseEvidence;
}
export interface SourceLicenseEvidence {
  readonly url: string;
  readonly scope: "dataset" | "software" | "derived_artifact";
  readonly reviewedAt: string;
  readonly notes: string;
  readonly retainedSourceId?: string;
}
export interface SourceLock {
  readonly version: 1;
  readonly entries: readonly SourceLockEntry[];
}

const fail = (code: string): never => {
  throw new Error(`SOURCE_LOCK_${code}`);
};

export const SOURCE_LOCK_PATH = "data/source-lock.json";

export function readSourceLock(root = process.cwd()): SourceLock {
  const parsed = JSON.parse(
    readFileSync(join(root, SOURCE_LOCK_PATH), "utf8"),
  ) as Partial<SourceLock>;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) fail("INVALID");
  return parsed as SourceLock;
}

export function findSourceLockEntry(
  lock: SourceLock,
  id: string,
): SourceLockEntry | undefined {
  const matches = lock.entries.filter((entry) => entry.id === id);
  if (matches.length > 1) fail(`DUPLICATE_ID:${id}`);
  return matches[0];
}

/** Reads a retained file and checks it against its lock entry. */
export function readRetainedSource(
  lock: SourceLock,
  id: string,
  root = process.cwd(),
): { entry: SourceLockEntry; bytes: Buffer } {
  const entry = findSourceLockEntry(lock, id) ?? fail(`ENTRY_MISSING:${id}`);
  if (entry.retainedStatus !== "retained" || !entry.retainedPath)
    fail(`NOT_RETAINED:${id}`);
  const bytes = readFileSync(join(root, entry.retainedPath!));
  if (bytes.length !== entry.byteSize || sha(bytes) !== entry.sha256)
    fail(`BYTES_MISMATCH:${id}`);
  return { entry, bytes };
}

/**
 * Reads a retained derived package and checks its `packageSha256` against
 * `hash(domain, unsigned)`. This is a lock-and-digest read, not a rebuild;
 * use the artifact's `validate` function when a full reproduction is required.
 */
export function readPinnedPackage<T extends { packageSha256: string }>(
  lock: SourceLock,
  id: string,
  domain: string,
  root = process.cwd(),
): { entry: SourceLockEntry; value: T } {
  const { entry, bytes } = readRetainedSource(lock, id, root);
  if (entry.kind !== "derived_artifact") fail(`NOT_DERIVED:${id}`);
  const value = JSON.parse(bytes.toString("utf8")) as T;
  if (typeof value !== "object" || value === null) fail(`PACKAGE_INVALID:${id}`);
  const { packageSha256, ...unsigned } = value;
  if (typeof packageSha256 !== "string" || hash(domain, unsigned) !== packageSha256)
    fail(`PACKAGE_DIGEST_MISMATCH:${id}`);
  return { entry, value };
}

/** Returns a new lock with `entry` replacing any same-id entry, else appended. */
export function upsertSourceLockEntry(
  lock: SourceLock,
  entry: SourceLockEntry,
): SourceLock {
  const pathConflict = lock.entries.find(
    (existing) =>
      existing.id !== entry.id &&
      entry.retainedPath !== null &&
      existing.retainedPath === entry.retainedPath,
  );
  if (pathConflict) fail(`PATH_CONFLICT:${entry.retainedPath}`);
  const index = lock.entries.findIndex((existing) => existing.id === entry.id);
  const existing = index === -1 ? undefined : lock.entries[index];
  // Carry a review forward only while the source identity and content stay pinned.
  const sameSource = sourceLockMatches(existing, entry);
  const reviewedEntry = entry.license !== undefined ? entry : {
    ...entry,
    license: sameSource ? existing?.license ?? "unknown" : "unknown",
    ...(sameSource && existing?.licenseEvidence ? { licenseEvidence: existing.licenseEvidence } : {}),
  };
  const entries =
    index === -1
      ? [...lock.entries, reviewedEntry]
      : lock.entries.map((existing, position) =>
          position === index ? reviewedEntry : existing,
        );
  return { version: 1, entries };
}

/** Matches the committed layout: one compact entry per line, four-space indent. */
export function serializeSourceLock(lock: SourceLock): string {
  const lines = lock.entries.map((entry) => `    ${JSON.stringify({ ...entry, license: entry.license ?? "unknown" })}`);
  return `{\n  "version": 1,\n  "entries": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

export function writeSourceLock(lock: SourceLock, root = process.cwd()): void {
  writeFileSync(join(root, SOURCE_LOCK_PATH), serializeSourceLock(lock));
}

/** Lock entry describing a derived artifact file that was just written. */
export function derivedArtifactEntry(
  input: Readonly<{
    id: string;
    url: string;
    retainedPath: string;
    bytes: Buffer;
    kind: string;
    parentIds: readonly string[];
  }>,
): SourceLockEntry {
  return {
    id: input.id,
    url: input.url,
    retainedPath: input.retainedPath,
    retainedStatus: "retained",
    byteSize: input.bytes.length,
    sha256: sha(input.bytes),
    kind: input.kind,
    parentIds: [...new Set(input.parentIds)],
  };
}
