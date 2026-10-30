import { exact } from "../shared";

/**
 * The original eight fields bind content and lineage. Rights annotations are
 * reviewed independently; adding them must not change frozen artifact hashes.
 * Keep every other key, including unexpected keys, so binding checks stay strict.
 */
export function sourceLockContent<T>(value: T): T extends object ? Omit<T, "license" | "licenseEvidence"> : T;
export function sourceLockContent(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const content = { ...value } as Record<string, unknown>;
  delete content.license;
  delete content.licenseEvidence;
  return content;
}

export const sourceLockMatches = (actual: unknown, expected: unknown): boolean =>
  exact(sourceLockContent(actual), sourceLockContent(expected));
