import { readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";

/**
 * Pointers to the dated inputs the refreshable layers read.
 *
 * `rapid:refresh` retains new dated snapshots, pins them, and rewrites this
 * file; builders read the pointer instead of a hard-coded lock id, so a refresh
 * never edits source code. The file itself is pinned as an editorial ledger.
 */
export interface RefreshInputs {
  readonly schema: "refresh-inputs-v1";
  readonly version: 1;
  readonly snapshotDate: string;
  readonly fecCandidateSummaryId: string;
  readonly fecCandidateSummaryCycle: number;
  /** FEC candidate master (cnYY.zip) snapshot; optional for pointers written before v1.2. */
  readonly fecCandidateMasterId?: string;
  readonly stateLegislativeRosterIds: readonly string[];
  /** Open States executive (governor and statewide officer) YAML files; optional for pointers written before v1.3. */
  readonly stateExecutiveIds?: readonly string[];
  /** unitedstates/congress-legislators legislators-current.json snapshot; optional for pointers written before v1.16. */
  readonly congressLegislatorsId?: string;
}

/** The Congress roster the Senate layer read before the refresh retained one. */
export const CONGRESS_LEGISLATORS_BASELINE_ID = "congress-legislators-current-20260804";

export const congressLegislatorsIdFor = (inputs: RefreshInputs): string => inputs.congressLegislatorsId ?? CONGRESS_LEGISLATORS_BASELINE_ID;

export const REFRESH_INPUTS = { id: "refresh-inputs-v1", path: "data/metadata/refresh-inputs.json" } as const;

const fail = (code: string): never => { throw new Error(`REFRESH_INPUTS_${code}`); };

export function validateRefreshInputs(value: unknown): RefreshInputs {
  const input = value as Partial<RefreshInputs> | null;
  if (!input || input.schema !== "refresh-inputs-v1" || input.version !== 1 || typeof input.snapshotDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.snapshotDate)) fail("SCHEMA_INVALID");
  if (typeof input!.fecCandidateSummaryId !== "string" || !Number.isSafeInteger(input!.fecCandidateSummaryCycle)) fail("FEC_POINTER_INVALID");
  if (!Array.isArray(input!.stateLegislativeRosterIds) || input!.stateLegislativeRosterIds.some((id) => typeof id !== "string")) fail("ROSTER_POINTER_INVALID");
  if (input!.fecCandidateMasterId !== undefined && typeof input!.fecCandidateMasterId !== "string") fail("FEC_MASTER_POINTER_INVALID");
  if (input!.stateExecutiveIds !== undefined && (!Array.isArray(input!.stateExecutiveIds) || input!.stateExecutiveIds.some((id) => typeof id !== "string"))) fail("EXECUTIVE_POINTER_INVALID");
  if (input!.congressLegislatorsId !== undefined && typeof input!.congressLegislatorsId !== "string") fail("CONGRESS_POINTER_INVALID");
  return input as RefreshInputs;
}

export function readRefreshInputs(root = process.cwd(), lock: SourceLock = readSourceLock(root)): RefreshInputs {
  const { bytes } = readRetainedSource(lock, REFRESH_INPUTS.id, root);
  return validateRefreshInputs(JSON.parse(bytes.toString("utf8")));
}

export const serializeRefreshInputs = (value: RefreshInputs): string => `${JSON.stringify(value, null, 2)}\n`;
