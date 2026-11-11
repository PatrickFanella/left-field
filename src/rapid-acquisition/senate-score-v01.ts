import { readFileSync } from "node:fs";
import { join } from "node:path";

import { scoreSeat, type SeatRoute, type SeatScoreDriver } from "@/lib/seat-score";

import { readFecCandidateSummary } from "./fec-candidate-summary";
import { readPinnedPackage, readRetainedSource, readSourceLock, type SourceLock } from "./intake/source-lock";
import { readWorkbookSheet } from "./intake/workbook";
import { congressLegislatorsIdFor, readRefreshInputs, REFRESH_INPUTS } from "./refresh-inputs";
import { hash } from "./shared";
import { readStatewidePresidential2024Pinned, STATEWIDE_PRESIDENTIAL_2024 } from "./statewide-presidential-2024";
import { STATE_LEGISLATIVE_PRIMARY_CONTEXT, type StateLegislativePrimaryContext } from "./state-legislative-primary-context";
import { US_STATE_NAMES } from "./us-states";

/**
 * Senate score v0.1: the 100 sitting senators scored with the chamber-agnostic
 * two-route model.
 *
 * Inputs, all lock-verified: the Congress Legislators roster (identity, class,
 * party, term end), the FEC candidate summary snapshot named in the refresh
 * pointer (cash on hand), the statewide 2024 presidential result (baseline and
 * competitiveness), the "119th Senate" sheets of the two alignment trackers
 * (Democratic-caucus alignment gap), and the state contestation package.
 *
 * Primary feasibility is not measured for senators: no retained Senate primary
 * evidence exists, so the Democratic structural baseline is the blue baseline
 * alone and the row says so. Independents who caucus with Democrats take the
 * Democratic route and are labelled.
 */
export interface SenateScoreV01Row {
  readonly seatId: string;
  readonly seatLabel: string;
  readonly stateCode: string;
  readonly senateClass: 1 | 2 | 3;
  readonly bioguideId: string;
  readonly officialName: string;
  readonly birthYear: number | null;
  readonly incumbentParty: "Democratic" | "Republican" | "Independent";
  readonly caucus: "Democratic" | "Republican";
  readonly termStart: string;
  readonly termEnd: string;
  readonly nextElectionYear: number;
  readonly appointed: boolean;
  readonly firstSenateServiceDate: string;
  readonly cumulativeSenateServiceYears: number;
  readonly presidentialDemocraticMargin2024: number;
  readonly fecCandidateId: string | null;
  readonly cashOnHand: number | null;
  readonly receipts: number | null;
  readonly disbursements: number | null;
  readonly financeCoverageThrough: string | null;
  readonly leftScore: number | null;
  readonly palestineScore: number | null;
  readonly alignmentGap: number | null;
  readonly alignmentCoverage: number;
  readonly stateContestation: number | null;
  readonly stateContestationCycleYear: number | null;
  readonly route: SeatRoute;
  readonly score: number;
  readonly blueBaseline: number | null;
  readonly competitiveness: number | null;
  readonly structuralBaseline: number | null;
  readonly cashVulnerability: number | null;
  readonly availableWeight: number;
  readonly coverageMultiplier: number;
  readonly drivers: readonly SeatScoreDriver[];
  readonly formula: string;
  readonly rowSha256: string;
}

export interface SenateScoreV01Projection {
  readonly schema: "senate-score-v01-projection-v1";
  readonly version: 1;
  readonly methodology: Readonly<{ status: "active"; routes: "seat-score two-route model"; primaryFeasibility: "not_measured_for_senate"; independentCaucus: "sanders_and_king_take_the_democratic_route"; blueBaselineInput: "statewide_2024_presidential_margin_only"; winnerInference: false }>;
  readonly parents: readonly Readonly<{ id: string; packageSha256: string | null }>[];
  readonly sourceIds: readonly string[];
  readonly rows: readonly SenateScoreV01Row[];
  readonly summary: Readonly<{ seats: 100; democraticCaucus: number; republicanCaucus: number; upIn2026: number; cashValues: number; alignmentValues: number; stateContestationValues: number; democraticMaxScore: number; republicanMaxScore: number }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

export const SENATE_SCORE_V01 = {
  id: "senate-score-v01-projection-v1",
  path: "data/metadata/senate-score-v01-projection-v1.json",
  url: "urn:dsa-seats:senate-score-v01-projection:v1",
  staticParentIds: ["congressional-democrat-left-tracker-119th-house-20260804", "congressional-democrat-palestine-tracker-119th-house-20260730", REFRESH_INPUTS.id, STATEWIDE_PRESIDENTIAL_2024.id, STATE_LEGISLATIVE_PRIMARY_CONTEXT.id],
  parentIds: (root: string, lock: SourceLock): string[] => { const inputs = readRefreshInputs(root, lock); return [congressLegislatorsIdFor(inputs), ...SENATE_SCORE_V01.staticParentIds, inputs.fecCandidateSummaryId]; },
} as const;

type Legislator = { id?: { bioguide?: string; fec?: string[] }; name?: { official_full?: string; first?: string; last?: string; nickname?: string }; bio?: { birthday?: string }; terms?: Array<{ type?: string; state?: string; class?: number; party?: string; start?: string; end?: string; how?: string; "end-type"?: string }> };

const one = (value: number): number => Math.round(value * 10) / 10;
const fail = (code: string): never => { throw new Error(`SENATE_V01_${code}`); };
const nameKey = (first: string, last: string): string => `${first} ${last}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const days = (start: string, end: string): number => (Date.parse(end) - Date.parse(start)) / 86_400_000;

type AlignmentRow = { first: string; last: string; leftScore: number; palestineScore: number | null };

/** Sheet rows keyed by `${state name}|${last-name key}`; several senators may share a last name in one state. */
function alignmentRows(lock: SourceLock, root: string): Map<string, AlignmentRow[]> {
  const left = readWorkbookSheet(readRetainedSource(lock, "congressional-democrat-left-tracker-119th-house-20260804", root).bytes, "119th Senate");
  const palestine = readWorkbookSheet(readRetainedSource(lock, "congressional-democrat-palestine-tracker-119th-house-20260730", root).bytes, "119th Senate");
  if (left.cells.get("B1") !== "First Name" || left.cells.get("C1") !== "Last Name" || left.cells.get("D1") !== "State" || !/^Total\s+Left\s+Score$/.test((left.cells.get("H1") ?? "").replace(/\s+/g, " ").trim())) fail("LEFT_HEADER_INVALID");
  if (palestine.cells.get("C1") !== "First Name" || palestine.cells.get("D1") !== "Last Name" || palestine.cells.get("E1") !== "State" || !(palestine.cells.get("H1") ?? "").startsWith("Total Palestine Score")) fail("PALESTINE_HEADER_INVALID");
  const numeric = (value: string | undefined, cell: string): number => { const parsed = Number(value); if (value === undefined || value === "" || !Number.isFinite(parsed) || parsed < 0 || parsed > 1) fail(`SCORE_INVALID:${cell}`); return parsed; };
  const byName = new Map<string, AlignmentRow>();
  for (let row = 5; row <= left.maxRow; row++) {
    const first = (left.cells.get(`B${row}`) ?? "").trim(), last = (left.cells.get(`C${row}`) ?? "").trim(), state = (left.cells.get(`D${row}`) ?? "").trim();
    if (!first && !last) continue;
    const key = `${state}|${nameKey(first, last)}`;
    if (byName.has(key)) fail(`LEFT_DUPLICATE:${key}`);
    byName.set(key, { first, last, leftScore: numeric(left.cells.get(`H${row}`), `H${row}`), palestineScore: null });
  }
  for (let row = 5; row <= palestine.maxRow; row++) {
    const first = (palestine.cells.get(`C${row}`) ?? "").trim(), last = (palestine.cells.get(`D${row}`) ?? "").trim(), state = (palestine.cells.get(`E${row}`) ?? "").trim();
    if (!first && !last) continue;
    const key = `${state}|${nameKey(first, last)}`, existing = byName.get(key);
    if (!existing) fail(`PALESTINE_UNMATCHED:${key}`);
    const raw = palestine.cells.get(`H${row}`);
    byName.set(key, { ...existing!, palestineScore: raw === undefined || raw === "" || raw === "N/A" ? null : numeric(raw, `H${row}`) });
  }
  const byLast = new Map<string, AlignmentRow[]>();
  for (const [key, row] of byName) {
    const state = key.split("|")[0]!, lastKey = `${state}|${nameKey("", row.last)}`;
    byLast.set(lastKey, [...(byLast.get(lastKey) ?? []), row]);
  }
  return byLast;
}

/**
 * Identity gate for the tracker join: same state and same last name, and when
 * that is ambiguous, a first name that matches the roster's legal name or
 * recorded nickname. The tracker uses familiar names (Ed, Dick, Chuck).
 */
function matchAlignment(rows: Map<string, AlignmentRow[]>, state: string, person: Legislator): AlignmentRow | null {
  const candidates = rows.get(`${US_STATE_NAMES[state]}|${nameKey("", person.name?.last ?? "")}`) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  const firsts = new Set([person.name?.first, person.name?.nickname, person.name?.official_full?.split(" ")[0]].filter((value): value is string => !!value).map((value) => nameKey(value, "")));
  const exact = candidates.filter((row) => firsts.has(nameKey(row.first.split(" ")[0]!, "")));
  return exact.length === 1 ? exact[0]! : fail(`ALIGNMENT_AMBIGUOUS:${state}:${person.name?.last}`);
}

export function buildSenateScoreV01Projection(root = process.cwd(), lock: SourceLock = readSourceLock(root)): SenateScoreV01Projection {
  const inputs = readRefreshInputs(root, lock);
  const congress = JSON.parse(readRetainedSource(lock, congressLegislatorsIdFor(inputs), root).bytes.toString("utf8")) as Legislator[];
  const finance = readFecCandidateSummary(lock, inputs.fecCandidateSummaryId, root);
  const presidential = readStatewidePresidential2024Pinned(root, lock);
  const margins = new Map(presidential.rows.map((row) => [row.stateCode, row.democraticMarginPercentagePoints]));
  const context = readPinnedPackage<StateLegislativePrimaryContext>(lock, STATE_LEGISLATIVE_PRIMARY_CONTEXT.id, "dsa-seats:rapid-state-legislative-primary-context-package:v1", root).value;
  const contestation = new Map(context.stateContext.map((row) => [row.state, row]));
  const alignment = alignmentRows(lock, root);
  const cutoff = "2026-08-04";

  const rows: SenateScoreV01Row[] = [];
  for (const person of congress) {
    const term = person.terms?.at(-1);
    if (!term || term.type !== "sen") continue;
    const state = term.state ?? fail("STATE_MISSING"), senateClass = term.class as 1 | 2 | 3, bioguideId = person.id?.bioguide ?? fail("BIOGUIDE_MISSING");
    if (![1, 2, 3].includes(senateClass) || !term.start || !term.end) fail(`TERM_INVALID:${bioguideId}`);
    const party: "Democratic" | "Republican" | "Independent" = term.party === "Democrat" ? "Democratic" : term.party === "Republican" ? "Republican" : term.party === "Independent" ? "Independent" : fail(`PARTY_INVALID:${bioguideId}:${term.party}`);
    const caucus: "Democratic" | "Republican" = party === "Republican" ? "Republican" : "Democratic";
    const end = new Date(term.end!);
    const nextElectionYear = end.getUTCMonth() === 0 ? end.getUTCFullYear() - 1 : end.getUTCFullYear();
    const senateTerms = (person.terms ?? []).filter((item) => item.type === "sen" && item.start && item.end);
    const firstSenateServiceDate = senateTerms.map((item) => item.start!).sort()[0]!;
    const cumulativeSenateServiceYears = one(senateTerms.reduce((sum, item) => sum + Math.max(0, days(item.start!, item.end! < cutoff ? item.end! : cutoff)), 0) / 365.25);
    const margin = margins.get(state) ?? fail(`MARGIN_MISSING:${state}`);
    const candidates = (person.id?.fec ?? []).filter((id) => id.startsWith("S")).map((id) => finance.get(id)).filter((row): row is NonNullable<typeof row> => row !== undefined).sort((left, right) => (right.coverageEndDate ?? "").localeCompare(left.coverageEndDate ?? ""));
    const fec = candidates[0] ?? null;
    const align = matchAlignment(alignment, state, person);
    const alignmentGap = align === null ? null : one((align.palestineScore === null ? 100 * (1 - align.leftScore) : (100 * (1 - align.leftScore) + 100 * (1 - align.palestineScore)) / 2) * (0.6 + 0.4 * (align.palestineScore === null ? 0.5 : 1)));
    const stateRow = caucus === "Republican" ? contestation.get(state) ?? null : null;
    const scored = scoreSeat({ caucus, presidentialDemocraticMargin2024: margin, primaryFeasibility: null, alignmentGap, cashOnHand: fec?.cashOnHandClose ?? null, localContext: null, stateContestation: stateRow?.contestationScore ?? null });
    const unsigned = {
      seatId: `seat_senate_${state.toLowerCase()}_${senateClass}_current`,
      seatLabel: `${state}-S${senateClass}`,
      stateCode: state,
      senateClass,
      bioguideId,
      officialName: person.name?.official_full ?? `${person.name?.first} ${person.name?.last}`,
      birthYear: person.bio?.birthday ? Number(person.bio.birthday.slice(0, 4)) : null,
      incumbentParty: party,
      caucus,
      termStart: term.start!,
      termEnd: term.end!,
      nextElectionYear,
      appointed: term.how === "appointment",
      firstSenateServiceDate,
      cumulativeSenateServiceYears,
      presidentialDemocraticMargin2024: margin,
      fecCandidateId: fec?.candidateId ?? null,
      cashOnHand: fec?.cashOnHandClose ?? null,
      receipts: fec?.totalReceipts ?? null,
      disbursements: fec?.totalDisbursements ?? null,
      financeCoverageThrough: fec?.coverageEndDate ?? null,
      leftScore: align?.leftScore ?? null,
      palestineScore: align?.palestineScore ?? null,
      alignmentGap,
      alignmentCoverage: align === null ? 0 : align.palestineScore === null ? 0.5 : 1,
      stateContestation: stateRow?.contestationScore ?? null,
      stateContestationCycleYear: stateRow?.cycleYear ?? null,
      route: scored.route,
      score: scored.score,
      blueBaseline: scored.blueBaseline,
      competitiveness: scored.competitiveness,
      structuralBaseline: scored.structuralBaseline,
      cashVulnerability: scored.cashVulnerability,
      availableWeight: scored.availableWeight,
      coverageMultiplier: scored.coverageMultiplier,
      drivers: scored.drivers,
      formula: scored.formula,
    };
    rows.push({ ...unsigned, rowSha256: hash("dsa-seats:senate-score-v01-row:v1", unsigned) });
  }
  rows.sort((left, right) => left.seatId.localeCompare(right.seatId));
  if (rows.length !== 100 || new Set(rows.map((row) => row.seatId)).size !== 100) fail(`CLOSURE_INVALID:${rows.length}`);
  const democrats = rows.filter((row) => row.caucus === "Democratic"), republicans = rows.filter((row) => row.caucus === "Republican");
  const summary = {
    seats: 100 as const,
    democraticCaucus: democrats.length,
    republicanCaucus: republicans.length,
    upIn2026: rows.filter((row) => row.nextElectionYear === 2026).length,
    cashValues: rows.filter((row) => row.cashOnHand !== null).length,
    alignmentValues: rows.filter((row) => row.alignmentGap !== null).length,
    stateContestationValues: rows.filter((row) => row.stateContestation !== null).length,
    democraticMaxScore: Math.max(...democrats.map((row) => row.score)),
    republicanMaxScore: Math.max(...republicans.map((row) => row.score)),
  };
  const parents = [
    { id: STATEWIDE_PRESIDENTIAL_2024.id, packageSha256: presidential.packageSha256 },
    { id: STATE_LEGISLATIVE_PRIMARY_CONTEXT.id, packageSha256: context.packageSha256 },
    { id: inputs.fecCandidateSummaryId, packageSha256: null },
  ];
  const unsigned = {
    schema: "senate-score-v01-projection-v1" as const,
    version: 1 as const,
    methodology: { status: "active" as const, routes: "seat-score two-route model" as const, primaryFeasibility: "not_measured_for_senate" as const, independentCaucus: "sanders_and_king_take_the_democratic_route" as const, blueBaselineInput: "statewide_2024_presidential_margin_only" as const, winnerInference: false as const },
    parents,
    sourceIds: SENATE_SCORE_V01.parentIds(root, lock),
    rows,
    summary,
    rowSetSha256: hash("dsa-seats:senate-score-v01-row-set:v1", rows),
  };
  return { ...unsigned, packageSha256: hash("dsa-seats:senate-score-v01-package:v1", unsigned) };
}

export function readSenateScoreV01Projection(root = process.cwd(), lock: SourceLock = readSourceLock(root)): SenateScoreV01Projection {
  const { value } = readPinnedPackage<SenateScoreV01Projection>(lock, SENATE_SCORE_V01.id, "dsa-seats:senate-score-v01-package:v1", root);
  if (value.schema !== "senate-score-v01-projection-v1" || value.version !== 1 || value.methodology.status !== "active" || value.methodology.winnerInference !== false || value.summary.seats !== 100 || value.rows.length !== 100 || new Set(value.rows.map((row) => row.seatId)).size !== 100) fail("PROJECTION_INVALID");
  return value;
}

export function validateSenateScoreV01Projection(value: unknown, root = process.cwd()): SenateScoreV01Projection {
  const expected = buildSenateScoreV01Projection(root);
  if ((value as SenateScoreV01Projection).packageSha256 !== expected.packageSha256) fail("PROJECTION_MISMATCH");
  return value as SenateScoreV01Projection;
}

/** Reads the retained senate projection rows from disk without the lock (test convenience). */
export const readSenateScoreV01File = (root = process.cwd()): SenateScoreV01Projection => JSON.parse(readFileSync(join(root, SENATE_SCORE_V01.path), "utf8")) as SenateScoreV01Projection;
