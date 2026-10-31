import { readRetainedSource, findSourceLockEntry, type SourceLock } from "./intake/source-lock";
import { sha } from "./shared";

export const IDAHO_HOUSE_AUTHORITY_IDS = ["idaho-house-position-labels-20261030", "idaho-legislative-position-statute-20261030"] as const;
const MEMBERSHIP_ID = "idaho-house-membership-20261030";

export function extractIdahoHousePositionLabels(bytes: Buffer, lock: SourceLock) {
  const source = findSourceLockEntry(lock, MEMBERSHIP_ID);
  if (!source || source.byteSize !== bytes.length || source.sha256 !== sha(bytes)) throw new Error("IDAHO_HOUSE_MEMBERSHIP_BYTES_INVALID");
  const text = bytes.toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const labels = new Set([...text.matchAll(/District\s+(\d+)\s+House Seat\s+([AB])\b/g)].map((match) => `${Number(match[1])}:${match[2]}`));
  const positions = Array.from({ length: 35 }, (_, i) => ["A", "B"].map((position) => ({ district: i + 1, position }))).flat();
  if (labels.size !== 70 || positions.some(({ district, position }) => !labels.has(`${district}:${position}`))) throw new Error("IDAHO_HOUSE_POSITION_COVERAGE_INVALID");
  return { schema: "idaho-house-district-position-labels-v1", sourceId: MEMBERSHIP_ID, sourceSha256: source.sha256, positions };
}

/** Read only privacy-filtered position labels; never retain member addresses. */
export function verifyIdahoHouseSeatAuthority(root: string, lock: SourceLock): void {
  const labels = readRetainedSource(lock, IDAHO_HOUSE_AUTHORITY_IDS[0], root);
  const statute = readRetainedSource(lock, IDAHO_HOUSE_AUTHORITY_IDS[1], root);
  const membership = findSourceLockEntry(lock, MEMBERSHIP_ID);
  const value = JSON.parse(labels.bytes.toString("utf8")) as { schema?: string; sourceId?: string; sourceSha256?: string; positions?: unknown };
  const expected = Array.from({ length: 35 }, (_, i) => ["A", "B"].map((position) => ({ district: i + 1, position }))).flat();
  const fail = (): never => { throw new Error("IDAHO_HOUSE_SEAT_AUTHORITY_INVALID"); };
  if (!membership || membership.url !== "https://legislature.idaho.gov/house/membership/" || membership.retainedStatus !== "nonretained" || membership.retainedPath !== null || Object.keys(value).sort().join(",") !== "positions,schema,sourceId,sourceSha256" || value.schema !== "idaho-house-district-position-labels-v1" || value.sourceId !== MEMBERSHIP_ID || value.sourceSha256 !== membership.sha256 || JSON.stringify(labels.entry.parentIds) !== JSON.stringify([MEMBERSHIP_ID]) || JSON.stringify(value.positions) !== JSON.stringify(expected)) fail();
  if (statute.entry.url !== "https://legislature.idaho.gov/statutesrules/idstat/Title34/T34CH6/SECT34-614A/" || statute.entry.parentIds.length) fail();
  const text = statute.bytes.toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!["34-614A.", "Position A", "Position B", "positions in each district shall be separately and distinctly placed"].every((part) => text.includes(part))) fail();
}
