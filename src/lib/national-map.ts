import { readFecCandidateMaster, type FecCandidateMasterRow } from "@/rapid-acquisition/fec-candidate-master";
import { readFecCandidateSummary, type FecCandidateSummaryRow } from "@/rapid-acquisition/fec-candidate-summary";
import { readSourceLock } from "@/rapid-acquisition/intake/source-lock";
import { readRefreshInputs } from "@/rapid-acquisition/refresh-inputs";

import type { PriorityChamber, PublicPriorityBrief } from "./house-priority-index";
import { houseDistrictKey, seatDistrictKey } from "./map-district-key";
import { getDefaultPriorityRepository } from "./priority-index-store";

/**
 * Read model behind /map. Seats come from the released Priority Index; the
 * candidate lists for House and Senate races come from the FEC candidate
 * master pinned by the refresh inputs, joined to the candidate summary for
 * money raised and cash on hand. Only statutory candidates (FEC status "C")
 * for the summary cycle are listed. Governor and state-legislative races have
 * no federal filings, so their panels show the seat holder only.
 */
export type MapLayer = "house" | "senate" | "governor" | "state_senate" | "state_house";
export const MAP_LAYERS: readonly MapLayer[] = ["house", "senate", "governor", "state_senate", "state_house"];

export type MapCandidate = Readonly<{
  candidateId: string;
  name: string;
  party: string;
  incumbent: boolean;
  receipts: number | null;
  cashOnHand: number | null;
  coverageThrough: string | null;
}>;

export type MapSeat = Readonly<{
  seatCycleId: string;
  chamber: PriorityChamber;
  label: string;
  stateCode: string;
  /** Join key to the layer's polygons; the state code for Senate and governor seats. */
  key: string;
  incumbentName: string;
  incumbentParty: "Democratic" | "Republican";
  score: number;
  rank: number;
  route: PublicPriorityBrief["qualifyingRoute"];
  nextElectionYear: number;
  openSeatSignal: string | null;
}>;

/**
 * Fill data for every polygon in the national frame: one entry per House
 * district, and one per state for the other layers. Counts are of scored
 * seats, which for state legislatures is not the whole chamber.
 */
export type MapSummary = Readonly<{
  cycle: number;
  snapshotDate: string;
  fills: Readonly<Record<MapLayer, Readonly<Record<string, MapFill>>>>;
}>;
export type MapFill = Readonly<{ democratic: number; republican: number; up: number; topScore: number }>;

export type MapStateDetail = Readonly<{
  stateCode: string;
  cycle: number;
  seats: Readonly<Record<MapLayer, readonly MapSeat[]>>;
  /** FEC candidates keyed by House district key, plus "senate" for the state's Senate race. */
  candidates: Readonly<Record<string, readonly MapCandidate[]>>;
}>;

const LAYER_OF: Record<PriorityChamber, MapLayer> = { house: "house", senate: "senate", governor: "governor", state_senate: "state_senate", state_house: "state_house" };

export function seatKey(brief: PublicPriorityBrief): string {
  if (brief.chamber === "house") return houseDistrictKey(brief.stateCode, brief.districtCode);
  if (brief.chamber === "state_house" || brief.chamber === "state_senate") return seatDistrictKey(brief.stateCode, brief.districtCode);
  return brief.stateCode;
}

const toSeat = (brief: PublicPriorityBrief): MapSeat => ({
  seatCycleId: brief.seatCycleId, chamber: brief.chamber, label: brief.districtLabel, stateCode: brief.stateCode, key: seatKey(brief),
  incumbentName: brief.incumbentName, incumbentParty: brief.incumbentParty, score: brief.provisionalTargetScore, rank: brief.rank,
  route: brief.qualifyingRoute, nextElectionYear: brief.nextElectionYear, openSeatSignal: brief.openSeatSignal,
});

/** Statutory candidates for one cycle, most money raised first, then by name. */
export function mapCandidates(master: readonly FecCandidateMasterRow[], summary: ReadonlyMap<string, FecCandidateSummaryRow>, cycle: number): Map<string, MapCandidate[]> {
  const out = new Map<string, MapCandidate[]>();
  for (const row of master) {
    if (row.electionYear !== cycle || row.status !== "C" || (row.office !== "H" && row.office !== "S")) continue;
    const key = row.office === "S" ? `${row.officeState}:senate` : `${row.officeState}:${houseDistrictKey(row.officeState, row.officeDistrict)}`;
    const money = summary.get(row.candidateId);
    const list = out.get(key) ?? [];
    list.push({ candidateId: row.candidateId, name: displayName(row.candidateName), party: row.party, incumbent: row.incumbentChallengerStatus === "I", receipts: money?.totalReceipts ?? null, cashOnHand: money?.cashOnHandClose ?? null, coverageThrough: money?.coverageEndDate ?? null });
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => (b.receipts ?? -1) - (a.receipts ?? -1) || a.name.localeCompare(b.name));
  return out;
}

/** "OCASIO-CORTEZ, ALEXANDRIA MS." → "Alexandria Ocasio-Cortez". */
export function displayName(fecName: string): string {
  const [last = "", rest = ""] = fecName.split(",").map((part) => part.trim());
  const given = rest.split(/\s+/).filter((token) => token && !/^(MR|MRS|MS|DR|HON|REV)\.?$/i.test(token));
  const suffix = given.length > 1 && /^(JR|SR|II|III|IV)\.?$/i.test(given[given.length - 1]!) ? given.pop()! : "";
  const title = (value: string) => value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase()).replace(/\bMc(\p{L})/gu, (_, letter: string) => `Mc${letter.toUpperCase()}`);
  const tail = /^(JR|SR)\.?$/i.test(suffix) ? `${title(suffix.replace(/\.$/, ""))}.` : suffix.toUpperCase();
  return [title(given.join(" ")), title(last), tail].filter(Boolean).join(" ");
}

type Model = { cycle: number; snapshotDate: string; seats: MapSeat[]; candidates: Map<string, MapCandidate[]> };
let cached: Model | undefined;

function model(): Model {
  if (cached) return cached;
  const lock = readSourceLock();
  const inputs = readRefreshInputs(process.cwd(), lock);
  const cycle = inputs.fecCandidateSummaryCycle;
  const master = inputs.fecCandidateMasterId ? readFecCandidateMaster(lock, inputs.fecCandidateMasterId) : [];
  const summary = readFecCandidateSummary(lock, inputs.fecCandidateSummaryId);
  cached = { cycle, snapshotDate: inputs.snapshotDate, seats: getDefaultPriorityRepository().getBriefs().map(toSeat), candidates: mapCandidates(master, summary, cycle) };
  return cached;
}

const emptyLayers = <T>(make: () => T): Record<MapLayer, T> => Object.fromEntries(MAP_LAYERS.map((layer) => [layer, make()])) as Record<MapLayer, T>;

export function mapSummary(): MapSummary {
  const { cycle, snapshotDate, seats } = model();
  const out = emptyLayers<Record<string, MapFill>>(() => ({}));
  for (const seat of seats) {
    const layer = LAYER_OF[seat.chamber];
    // House districts are drawn nationally; every other layer is filled per state.
    const key = layer === "house" ? seat.key : seat.stateCode;
    const fill = out[layer][key] ?? { democratic: 0, republican: 0, up: 0, topScore: 0 };
    out[layer][key] = {
      democratic: fill.democratic + (seat.incumbentParty === "Democratic" ? 1 : 0),
      republican: fill.republican + (seat.incumbentParty === "Republican" ? 1 : 0),
      up: fill.up + (seat.nextElectionYear === cycle ? 1 : 0),
      topScore: Math.max(fill.topScore, seat.score),
    };
  }
  return { cycle, snapshotDate, fills: out };
}

export function mapStateDetail(stateCode: string): MapStateDetail | undefined {
  const { cycle, seats, candidates } = model();
  const inState = seats.filter((seat) => seat.stateCode === stateCode);
  if (!inState.length) return undefined;
  const byLayer = emptyLayers<MapSeat[]>(() => []);
  for (const seat of inState) byLayer[LAYER_OF[seat.chamber]].push(seat);
  const stateCandidates: Record<string, MapCandidate[]> = {};
  for (const [key, list] of candidates) if (key.startsWith(`${stateCode}:`)) stateCandidates[key.slice(3)] = list;
  return { stateCode, cycle, seats: byLayer, candidates: stateCandidates };
}
