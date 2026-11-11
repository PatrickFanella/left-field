import { readRetainedSource, readSourceLock, type SourceLock } from "@/rapid-acquisition/intake/source-lock";

/**
 * The published release descriptor. `rapid:publish` writes and pins it; the
 * store and pages read it, so a version bump changes data, not code.
 */
export interface PriorityIndexRelease {
  readonly schema: "priority-index-release-v1";
  readonly version: 1;
  readonly modelVersion: string;
  readonly publishedAt: string;
  readonly sourceCutoff: string;
  readonly chambers: Readonly<Record<"house" | "senate", Readonly<{ artifactId: string; modelVersion: string; sourceCutoff: string; financeAsOf?: string }>> & { governor?: Readonly<{ artifactId: string; modelVersion: string; sourceCutoff: string; financeAsOf?: string }>; stateLegislative?: Readonly<{ artifactId: string; modelVersion: string; sourceCutoff: string; coveredStates: readonly string[]; /** Covered states whose baseline still rests on unofficial returns; absent when none does. */ unofficialStates?: readonly string[] }> }>;
  readonly refreshInputsId: string;
}

export const PRIORITY_INDEX_RELEASE = { id: "priority-index-release-v1", path: "data/metadata/priority-index-release.json" } as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (code: string): never => { throw new Error(`PRIORITY_INDEX_RELEASE_${code}`); };

export function validatePriorityIndexRelease(value: unknown): PriorityIndexRelease {
  const release = value as Partial<PriorityIndexRelease> | null;
  if (!release || release.schema !== "priority-index-release-v1" || release.version !== 1) fail("SCHEMA_INVALID");
  if (!/^v\d+\.\d+$/.test(release!.modelVersion ?? "") || !DATE.test(release!.publishedAt ?? "") || !DATE.test(release!.sourceCutoff ?? "")) fail("VERSION_INVALID");
  for (const chamber of ["house", "senate", "governor"] as const) {
    const entry = release!.chambers?.[chamber];
    if (chamber === "governor" && entry === undefined) continue;
    if (!entry || typeof entry.artifactId !== "string" || !/^v\d+\.\d+$/.test(entry.modelVersion) || !DATE.test(entry.sourceCutoff) || (entry.financeAsOf !== undefined && !DATE.test(entry.financeAsOf))) fail(`CHAMBER_INVALID:${chamber}`);
  }
  const stateLegislative = release!.chambers?.stateLegislative;
  const stateCodes = (value: unknown): boolean => Array.isArray(value) && value.every((code) => typeof code === "string" && /^[A-Z]{2}$/.test(code));
  if (stateLegislative !== undefined && (typeof stateLegislative.artifactId !== "string" || !/^v\d+\.\d+$/.test(stateLegislative.modelVersion) || !DATE.test(stateLegislative.sourceCutoff) || !stateCodes(stateLegislative.coveredStates) || (stateLegislative.unofficialStates !== undefined && !stateCodes(stateLegislative.unofficialStates)))) fail("CHAMBER_INVALID:stateLegislative");
  if (typeof release!.refreshInputsId !== "string") fail("REFRESH_POINTER_INVALID");
  return release as PriorityIndexRelease;
}

export function readPriorityIndexRelease(root = process.cwd(), lock: SourceLock = readSourceLock(root)): PriorityIndexRelease {
  const { bytes } = readRetainedSource(lock, PRIORITY_INDEX_RELEASE.id, root);
  return validatePriorityIndexRelease(JSON.parse(bytes.toString("utf8")));
}

export const serializePriorityIndexRelease = (value: PriorityIndexRelease): string => `${JSON.stringify(value, null, 2)}\n`;
