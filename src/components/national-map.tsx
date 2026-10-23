"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { MapCandidate, MapFill, MapLayer, MapSeat, MapStateDetail, MapSummary } from "@/lib/national-map";

type Geometry = { width: number; height: number; states: { stateCode: string; name: string; path: string; bbox: [number, number, number, number] }[]; house: { stateCode: string; districtCode: string; path: string }[] };
type LegislativeGeometry = { stateCode: string; upper: { name: string; key: string; path: string }[]; lower: { name: string; key: string; path: string }[] };
type Mode = "party" | "score";
type Load<T> = { state: "loading" } | { state: "loaded"; value: T } | { state: "unavailable" };

export const LAYER_LABELS: Record<MapLayer, string> = { house: "U.S. House", senate: "U.S. Senate", governor: "Governor", state_senate: "State senate / DC Council", state_house: "State house" };
const FEC_PARTIES: Record<string, string> = { DEM: "Democratic", REP: "Republican", LIB: "Libertarian", GRE: "Green", IND: "Independent", NPA: "No party", NNE: "No party", UN: "Unaffiliated", CON: "Constitution", DFL: "Democratic-Farmer-Labor", WFP: "Working Families", OTH: "Other" };
const ROUTES: Record<MapSeat["route"], string> = { deep_blue: "Deep blue", aipac_supported_blue: "AIPAC-supported blue", democratic_incumbent_primary: "Democratic incumbent", republican_fringe_general: "Republican-held flip" };
const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: value >= 1e6 ? "compact" : "standard", maximumFractionDigits: value >= 1e6 ? 1 : 0 }).format(value);

const mix = (a: string, b: string, t: number) => {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  return `#${[1, 3, 5].map((at) => Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, "0")).join("")}`;
};
const NO_DATA = "#d9d6cc";
/** Party: share of scored seats held by Democrats, red through purple to blue. Score: highest priority score, light to dark. */
export function fillColor(fill: MapFill | undefined, mode: Mode, upOnly: boolean): string {
  if (!fill || fill.democratic + fill.republican === 0) return NO_DATA;
  if (upOnly && fill.up === 0) return "#ebe8df";
  if (mode === "score") return mix("#f1e7cc", "#7a2414", fill.topScore / 100);
  const share = fill.democratic / (fill.democratic + fill.republican);
  return share >= 0.5 ? mix("#8d7aa6", "#2f5f9e", (share - 0.5) * 2) : mix("#b8483a", "#8d7aa6", share * 2);
}
const seatFill = (seats: readonly MapSeat[], cycle: number): MapFill | undefined => seats.length ? {
  democratic: seats.filter((seat) => seat.incumbentParty === "Democratic").length,
  republican: seats.filter((seat) => seat.incumbentParty === "Republican").length,
  up: seats.filter((seat) => seat.nextElectionYear === cycle).length,
  topScore: Math.max(...seats.map((seat) => seat.score)),
} : undefined;

/** Bounding box of an SVG path written as absolute M/L coordinate pairs. */
export function pathBox(path: string): [number, number, number, number] {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let index = 0; index + 1 < numbers.length; index += 2) { const x = numbers[index]!, y = numbers[index + 1]!; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

function useJson<T>(url: string | null): Load<T> | null {
  const [result, setResult] = useState<{ url: string; load: Load<T> } | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<T>; })
      .then((value) => setResult({ url, load: { state: "loaded", value } }))
      .catch((error: unknown) => { if ((error as { name?: string }).name !== "AbortError") setResult({ url, load: { state: "unavailable" } }); });
    return () => controller.abort();
  }, [url]);
  if (!url) return null;
  return result?.url === url ? result.load : { state: "loading" };
}

export function NationalMap({ summary }: { summary: MapSummary }) {
  const [layer, setLayer] = useState<MapLayer>("house");
  const [mode, setMode] = useState<Mode>("party");
  const [upOnly, setUpOnly] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const geometry = useJson<Geometry>("/map-data/national-v1.json");
  const detail = useJson<MapStateDetail>(focus ? `/api/map/${focus}` : null);
  const legislative = layer === "state_senate" || layer === "state_house";
  const legislativeGeometry = useJson<LegislativeGeometry>(focus && legislative && summary.fills[layer][focus] ? `/map-data/state-legislative/${focus.toLowerCase()}-v1.json` : null);
  const geo = geometry?.state === "loaded" ? geometry.value : null;
  const stateDetail = detail?.state === "loaded" ? detail.value : null;
  const focusState = geo?.states.find((state) => state.stateCode === focus) ?? null;

  const legislativeFeatures = useMemo(() => legislativeGeometry?.state === "loaded" ? legislativeGeometry.value[layer === "state_senate" ? "upper" : "lower"] : [], [legislativeGeometry, layer]);
  const selectedPath = !geo || !selected ? null : layer === "house" ? geo.house.find((district) => `${district.stateCode}-${district.districtCode}` === selected)?.path ?? null : legislativeFeatures.find((district) => district.key === selected)?.path ?? null;

  const viewBox = useMemo(() => {
    if (!geo) return "0 0 975 610";
    if (!focusState) return `0 0 ${geo.width} ${geo.height}`;
    const [x0, y0, x1, y1] = focusState.bbox;
    // A district much smaller than its state (a city district) gets its own closer frame.
    const box = selectedPath ? pathBox(selectedPath) : null;
    if (box && Math.max(box[2] - box[0], box[3] - box[1]) < Math.max(x1 - x0, y1 - y0) * 0.15) {
      const size = Math.max(box[2] - box[0], box[3] - box[1]) * 4, cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
      return `${(cx - size / 2).toFixed(2)} ${(cy - size / 2).toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)}`;
    }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
    return `${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + 2 * pad).toFixed(1)} ${(y1 - y0 + 2 * pad).toFixed(1)}`;
  }, [geo, focusState, selectedPath]);

  const openState = (stateCode: string | null, key: string | null = null) => { setFocus(stateCode); setSelected(key); };
  const chooseLayer = (next: MapLayer) => { setLayer(next); setSelected(null); };
  const legislativeSeats = (key: string) => (stateDetail?.seats[layer] ?? []).filter((seat) => seat.key === key);

  return <div className="national-map">
    <div className="map-controls" role="group" aria-label="Map view">
      <fieldset><legend>Office</legend>{(Object.keys(LAYER_LABELS) as MapLayer[]).map((value) => <button key={value} type="button" aria-pressed={layer === value} onClick={() => chooseLayer(value)}>{LAYER_LABELS[value]}</button>)}</fieldset>
      <fieldset><legend>Color by</legend><button type="button" aria-pressed={mode === "party"} onClick={() => setMode("party")}>Party held</button><button type="button" aria-pressed={mode === "score"} onClick={() => setMode("score")}>Priority score</button></fieldset>
      <label className="map-toggle"><input type="checkbox" checked={upOnly} onChange={(event) => setUpOnly(event.target.checked)} />Only seats up in {summary.cycle}</label>
      <label className="map-jump">State<select value={focus ?? ""} onChange={(event) => openState(event.target.value || null)}><option value="">All states</option>{geo?.states.map((state) => <option key={state.stateCode} value={state.stateCode}>{state.name}</option>)}</select></label>
    </div>
    <div className="map-body">
      <figure className="map-canvas">
        {!geo ? <div className="map-fallback">{geometry?.state === "unavailable" ? "Map boundaries are temporarily unavailable." : "Loading map…"}</div> :
          <svg viewBox={viewBox} role="img" aria-label={`${LAYER_LABELS[layer]} map${focusState ? ` of ${focusState.name}` : " of the United States"}, colored by ${mode === "party" ? "party holding the seat" : "priority score"}`}>
            <g className="map-states">{geo.states.map((state) => {
              const dim = !!focus && state.stateCode !== focus;
              const fill = layer === "house" ? NO_DATA : focus === state.stateCode && legislative ? "#f4f0e6" : fillColor(summary.fills[layer][state.stateCode], mode, upOnly);
              return <path key={state.stateCode} d={state.path} fill={fill} className={dim ? "dim" : selected === state.stateCode ? "selected" : undefined} onClick={() => openState(state.stateCode, legislative || layer === "house" ? null : state.stateCode)}><title>{state.name}</title></path>;
            })}</g>
            {layer === "house" && <g className="map-districts">{geo.house.map((district) => {
              const key = `${district.stateCode}-${district.districtCode}`;
              const dim = !!focus && district.stateCode !== focus;
              return <path key={key} d={district.path} fill={fillColor(summary.fills.house[key], mode, upOnly)} className={dim ? "dim" : selected === key ? "selected" : undefined} onClick={() => openState(district.stateCode, key)}><title>{district.districtCode === "00" ? `${district.stateCode} at-large` : `${district.stateCode}-${Number(district.districtCode)}`}</title></path>;
            })}</g>}
            {legislative && focus && <g className="map-districts">{legislativeFeatures.map((district) => {
              const fill = stateDetail ? fillColor(seatFill(legislativeSeats(district.key), summary.cycle), mode, upOnly) : NO_DATA;
              return <path key={district.key} d={district.path} fill={fill} className={selected === district.key ? "selected" : undefined} onClick={() => setSelected(district.key)}><title>{`${focus} ${layer === "state_senate" ? "Senate" : "House"} ${district.name}`}</title></path>;
            })}</g>}
            {layer === "house" && <g className="map-outlines">{geo.states.map((state) => <path key={state.stateCode} d={state.path} />)}</g>}
            {(selectedPath ?? (selected && focusState && (layer === "senate" || layer === "governor") ? focusState.path : null)) && <path className="map-highlight" d={selectedPath ?? focusState!.path} />}
          </svg>}
        <Legend mode={mode} layer={layer} />
      </figure>
      <aside className="map-panel" aria-live="polite">
        {!focus ? <Intro layer={layer} summary={summary} /> :
          <StatePanel layer={layer} stateName={focusState?.name ?? focus} detail={detail} selected={selected} onSelect={setSelected} onClose={() => openState(null)} legislativeAvailable={!!summary.fills[layer][focus]} legislativeGeometry={legislativeGeometry} cycle={summary.cycle} />}
      </aside>
    </div>
  </div>;
}

function Legend({ mode, layer }: { mode: Mode; layer: MapLayer }) {
  const stops = mode === "party" ? [["#b8483a", "Republican"], ["#8d7aa6", "Split"], ["#2f5f9e", "Democratic"]] : [["#f1e7cc", "0"], [mix("#f1e7cc", "#7a2414", 0.5), "50"], ["#7a2414", "100"]];
  return <figcaption className="map-legend"><span>{mode === "score" ? "Highest priority score" : layer === "house" ? "Party holding the seat" : "Party holding the scored seats"}</span>{stops.map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}<span><i style={{ background: NO_DATA }} />Not in the index</span></figcaption>;
}

function Intro({ layer, summary }: { layer: MapLayer; summary: MapSummary }) {
  const fills = Object.values(summary.fills[layer]);
  const seats = fills.reduce((total, fill) => total + fill.democratic + fill.republican, 0);
  return <div>
    <p className="eyebrow">{LAYER_LABELS[layer]}</p>
    <h2>{layer === "house" ? "Pick a district" : "Pick a state"}</h2>
    <p>{seats.toLocaleString("en-US")} scored seats{layer === "state_senate" || layer === "state_house" ? ` in ${fills.length} states` : ""}. Click the map or choose a state to see who holds each seat, its priority score{layer === "house" || layer === "senate" ? ", and the candidates registered with the FEC" : ""}.</p>
    {(layer === "state_senate" || layer === "state_house") && <p className="muted">State legislatures are covered in {fills.length} states. Gray states are not in the index yet.</p>}
  </div>;
}

function StatePanel({ layer, stateName, detail, selected, onSelect, onClose, legislativeAvailable, legislativeGeometry, cycle }: { layer: MapLayer; stateName: string; detail: Load<MapStateDetail> | null; selected: string | null; onSelect: (key: string) => void; onClose: () => void; legislativeAvailable: boolean; legislativeGeometry: Load<LegislativeGeometry> | null; cycle: number }) {
  const header = <div className="map-panel-head"><p className="eyebrow">{LAYER_LABELS[layer]}</p><h2>{stateName}</h2><button type="button" className="map-back" onClick={onClose}>All states</button></div>;
  if (!detail || detail.state === "loading") return <div>{header}<p className="muted">Loading seats…</p></div>;
  if (detail.state === "unavailable") return <div>{header}<p>This state has no seats in the index.</p></div>;
  const value = detail.value, seats = value.seats[layer];
  if ((layer === "state_senate" || layer === "state_house") && !legislativeAvailable) return <div>{header}<p>This state&rsquo;s legislature is not in the index yet.</p></div>;
  if (layer === "senate" || layer === "governor") return <div>{header}{seats.map((seat) => <SeatCard key={seat.seatCycleId} seat={seat} cycle={cycle} />)}
    {layer === "senate" ? <Candidates candidates={value.candidates.senate} race={`${stateName} Senate race`} cycle={cycle} none={seats.some((seat) => seat.nextElectionYear === cycle) ? undefined : `Neither Senate seat is up in ${cycle}.`} /> : <p className="map-note">Governor candidates do not file with the FEC, so this panel lists the current officeholder only.</p>}</div>;
  const keys = [...new Set(seats.map((seat) => seat.key))].sort((a, b) => a.localeCompare(b, "en-US", { numeric: true }));
  const chosen = selected ? seats.filter((seat) => seat.key === selected) : [];
  const legislativeName = (key: string) => legislativeGeometry?.state === "loaded" ? legislativeGeometry.value[layer === "state_senate" ? "upper" : "lower"].find((district) => district.key === key)?.name : undefined;
  return <div>
    {header}
    {selected && <div className="map-selection">
      {chosen.length ? chosen.map((seat) => <SeatCard key={seat.seatCycleId} seat={seat} cycle={cycle} />) : <p><strong>{layer === "house" ? districtName(selected) : `District ${legislativeName(selected) ?? selected}`}</strong>: no scored seat. The seat may be vacant or outside the index.</p>}
      {layer === "house" ? <Candidates candidates={value.candidates[selected]} race={`${districtName(selected)} race`} cycle={cycle} /> : <p className="map-note">State-legislative candidates do not file with the FEC; this panel lists the current holder.</p>}
    </div>}
    <details className="map-district-list" open={!selected}>
      <summary>{keys.length} {layer === "house" ? "districts" : "districts with scored seats"}</summary>
      <ul>{keys.map((key) => { const held = seats.filter((seat) => seat.key === key); return <li key={key}><button type="button" aria-pressed={selected === key} onClick={() => onSelect(key)}><b>{layer === "house" ? districtName(key) : legislativeName(key) ?? held[0]!.label}</b><span>{held.map((seat) => `${seat.incumbentName} (${seat.incumbentParty[0]})`).join(", ")}</span></button></li>; })}</ul>
    </details>
  </div>;
}

const districtName = (key: string) => key.endsWith("-00") ? `${key.slice(0, 2)} at-large` : `${key.slice(0, 2)}-${Number(key.slice(3))}`;

function SeatCard({ seat, cycle }: { seat: MapSeat; cycle: number }) {
  return <article className="map-seat">
    <div><Link prefetch={false} className="priority-seat" href={`/priorities/${encodeURIComponent(seat.seatCycleId)}`}>{seat.label}</Link><strong className="map-score" title="Provisional priority score">{seat.score.toFixed(1)}</strong></div>
    <h3>{seat.incumbentName} <span className={`party-chip party-${seat.incumbentParty[0]}`}>{seat.incumbentParty}</span></h3>
    <p>{ROUTES[seat.route]} · rank {seat.rank.toLocaleString("en-US")} · {seat.nextElectionYear === cycle ? `up in ${cycle}` : `next election ${seat.nextElectionYear}`}{seat.openSeatSignal ? " · incumbent has filed for the Senate" : ""}</p>
    <Link prefetch={false} href={`/priorities/${encodeURIComponent(seat.seatCycleId)}`}>Read the seat brief</Link>
  </article>;
}

function Candidates({ candidates, race, cycle, none }: { candidates: readonly MapCandidate[] | undefined; race: string; cycle: number; none?: string }) {
  if (none) return <p className="map-note">{none}</p>;
  return <section className="map-candidates" aria-label={`${cycle} candidates`}>
    <h3>{cycle} candidates registered with the FEC</h3>
    {!candidates?.length ? <p className="muted">No statutory candidates are on file for the {race}.</p> : <table>
      <thead><tr><th scope="col">Candidate</th><th scope="col">Raised</th><th scope="col">Cash on hand</th></tr></thead>
      <tbody>{candidates.map((candidate) => <tr key={candidate.candidateId}><td><strong>{candidate.name}</strong><small>{FEC_PARTIES[candidate.party] ?? candidate.party}{candidate.incumbent ? " · incumbent" : ""}</small></td><td>{money(candidate.receipts)}</td><td>{money(candidate.cashOnHand)}</td></tr>)}</tbody>
    </table>}
    <p className="map-note">From the FEC candidate master and summary files. The list includes everyone who registered for the cycle, including candidates who lost a primary or withdrew; it is not the general-election ballot.</p>
  </section>;
}
