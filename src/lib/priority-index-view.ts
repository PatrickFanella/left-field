import type { PublicPriorityBrief } from "./house-priority-index";

/** Rows per index page. The full list is never rendered in one response. */
export const PRIORITY_PAGE_SIZE = 50;
/** The default view lists seats scored on at least this many measured inputs. */
export const DEFAULT_MINIMUM_INPUTS = 2;

export type PriorityStanding = Readonly<{ rank: number; tiedWith: number }>;

/** Inputs that carry a value for this seat; omitted and non-applicable inputs are not counted. */
export const measuredInputs = (row: PublicPriorityBrief): number =>
  row.scoreDrivers.filter((driver) => driver.score !== null).length;

/**
 * Competition ranking over a list already sorted by score: seats with the same
 * displayed score share the rank of the first of them.
 */
export function priorityStandings(briefs: readonly PublicPriorityBrief[]): ReadonlyMap<string, PriorityStanding> {
  const standings = new Map<string, PriorityStanding>();
  for (let start = 0; start < briefs.length; ) {
    const score = briefs[start]!.provisionalTargetScore.toFixed(1);
    let end = start;
    while (end < briefs.length && briefs[end]!.provisionalTargetScore.toFixed(1) === score) end++;
    for (let index = start; index < end; index++) standings.set(briefs[index]!.seatCycleId, { rank: start + 1, tiedWith: end - start });
    start = end;
  }
  return standings;
}

/** "any" or a positive whole number; anything else falls back to the default. */
export function parseMinimumInputs(value: string): number {
  if (value === "any") return 1;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 9 ? parsed : DEFAULT_MINIMUM_INPUTS;
}

export function paginate<T>(rows: readonly T[], requestedPage: string, pageSize = PRIORITY_PAGE_SIZE): Readonly<{ page: number; pageCount: number; first: number; last: number; rows: readonly T[] }> {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const parsed = Number(requestedPage);
  const page = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, pageCount) : 1;
  const start = (page - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);
  return { page, pageCount, first: visible.length ? start + 1 : 0, last: start + visible.length, rows: visible };
}
