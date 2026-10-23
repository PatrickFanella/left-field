import { readStateLegislativeScoreV01Projection, type StateLegislativeScoreV01Row } from "@/rapid-acquisition/state-legislative-score-v01";

import { formatPartisanMargin, type PriorityDriver, type PublicPriorityBrief } from "./house-priority-index";

/**
 * State-legislative briefs for the public index, read from the lock-verified
 * state-legislative projection. Only scored rows become briefs; unscored
 * seats stay in the roster views with their reason. `chamber` is
 * "state_house" or "state_senate" (Nebraska's unicameral counts as a senate).
 */
const chamberOf = (row: StateLegislativeScoreV01Row): "state_house" | "state_senate" => row.chamber === "lower" ? "state_house" : "state_senate";
const chamberLabel = (row: StateLegislativeScoreV01Row): string => row.stateCode === "DC" ? "Council" : row.chamber === "lower" ? "state House" : row.chamber === "unicameral" ? "Legislature" : "state Senate";

function baselineSentence(row: StateLegislativeScoreV01Row): string {
  const margin = formatPartisanMargin(row.ownRaceDemocraticMargin ?? 0);
  const contest = row.baselineContested ? `the ${row.baselineCycleYear} general election for this seat` : `the ${row.baselineCycleYear} general election, which was uncontested`;
  const multi = (row.baselineSeats ?? 1) > 1 ? ` The district elects ${row.baselineSeats} members, so party totals across all candidates are used.` : "";
  return `The official state returns record ${margin} in ${contest}.${multi}`;
}

function drivers(row: StateLegislativeScoreV01Row): PriorityDriver[] {
  const baseline = baselineSentence(row);
  if (row.route === "democratic_incumbent_primary") {
    const feasibility = row.primaryFeasibility === null
      ? row.primaryEvidenceStatus === "no_catalog_for_state" ? "No Democratic primary catalog is retained for this state, so the structural baseline is the own-race margin alone." : row.primaryEvidenceStatus === "no_contest_retained" ? "The retained primary catalog has no contest for this seat; the structural baseline is the own-race margin alone." : "The holder could not be matched to a named candidate in the latest retained Democratic primary, so the structural baseline is the own-race margin alone."
      : `In the latest retained Democratic primary the holder took ${(100 - row.primaryFeasibility).toFixed(1)}% of named-candidate votes; feasibility is 100 minus that share.`;
    return [
      { key: "blue_baseline", label: "Blue baseline", score: row.blueBaseline, coverage: 1, inferred: false, explanation: `${baseline} The baseline is 0 at a 5-point Democratic margin and 100 at 30 points.` },
      { key: "primary_feasibility", label: "Primary feasibility", score: row.primaryFeasibility, coverage: row.primaryFeasibility === null ? 0 : 1, inferred: false, explanation: feasibility },
      { key: "incumbent_alignment_gap", label: "Incumbent alignment gap", score: null, coverage: 0, inferred: false, explanation: "The retained alignment trackers cover Congress only, so the weight is omitted." },
      { key: "cash_vulnerability", label: "Cash vulnerability", score: null, coverage: 0, inferred: false, explanation: "State campaign-finance filings are not retained, so the weight is omitted." },
    ];
  }
  return [
    { key: "general_election_competitiveness", label: "General-election competitiveness", score: row.competitiveness, coverage: 1, inferred: false, explanation: `${baseline} A tied district begins at 100 and each Republican margin point subtracts four points.` },
    { key: "cash_vulnerability", label: "Cash vulnerability", score: null, coverage: 0, inferred: false, explanation: "State campaign-finance filings are not retained, so the weight is omitted." },
    { key: "local_context", label: "Local context", score: null, coverage: 0, inferred: false, explanation: "County-level local context is joined to House districts only, so the weight is omitted." },
    { key: "state_primary_contestation", label: "State Democratic primary contestation", score: row.stateContestation, coverage: row.stateContestation === null ? 0 : 1, inferred: false, explanation: row.stateContestation === null ? "No retained state-legislative Democratic primary catalog records uncontested contests for this state, so the weight is omitted." : "Share of the state's latest retained state-legislative Democratic primaries that drew more than one named candidate, scaled so 40% contested equals 100." },
  ];
}

export function stateLegislativePriorityBrief(row: StateLegislativeScoreV01Row): PublicPriorityBrief {
  if (row.status !== "scored" || row.route === null || row.score === null || row.caucus === null || row.nextElectionYear === null) throw new Error(`STATE_LEG_BRIEF_UNSCORED:${row.seatId}`);
  const margin = formatPartisanMargin(row.ownRaceDemocraticMargin ?? 0);
  const democratic = row.route === "democratic_incumbent_primary";
  const pct = Math.round((row.availableWeight ?? 0) * 100);
  const uncontested = row.baselineContested === false ? " That race was uncontested, so the margin is the maximum." : "";
  const mismatch = row.partyMismatch ? ` The Open States roster lists ${row.holderName} as ${row.incumbentParty}, but the ${row.baselineCycleYear} returns show this holder on the ${row.holderBaselineParty} line: either a party switch since that election or a roster error.` : "";
  return {
    rank: 0,
    seatCycleId: row.seatId,
    chamber: chamberOf(row),
    nextElectionYear: row.nextElectionYear,
    openSeatSignal: null,
    districtLabel: row.seatLabel,
    stateCode: row.stateCode,
    districtCode: `${row.chamber === "lower" ? "H" : "S"}${row.district}`,
    incumbentName: row.holderName,
    officialHouseName: row.holderName,
    bioguideId: row.openStatesId,
    birthYear: 0,
    incumbentParty: row.caucus,
    provisionalTargetScore: row.score,
    baselineTargetScore: row.structuralBaseline ?? row.competitiveness ?? row.score,
    formula: row.formula ?? "",
    qualifyingRoute: row.route,
    scoreDrivers: drivers(row),
    presidentialDemocraticMargin2024: row.ownRaceDemocraticMargin ?? 0,
    incumbentCashOnHand: null,
    incumbentReceipts: null,
    incumbentDisbursements: null,
    financeCoverageThrough: null,
    firstHouseServiceDate: row.baselineElectionDate ?? "",
    cumulativeHouseServiceYears: row.termYears,
    districtChangeCount: 0,
    serviceHistory: [{ stateCode: row.stateCode, district: row.district, start: row.baselineElectionDate ?? "", end: String(row.nextElectionYear), currentAtCutoff: true }],
    scoreSummary: democratic
      ? `${row.seatLabel} scores ${row.score.toFixed(1)} on the Democratic incumbent route with ${pct}% of the component weight available: the own-race ${margin} baseline${row.primaryFeasibility === null ? " alone" : " and retained primary evidence"}. No state finance or alignment evidence is retained.`
      : `${row.seatLabel} enters through the Republican-held flip route at ${row.score.toFixed(1)} with ${pct}% of the component weight available: own-race competitiveness${row.stateContestation === null ? "" : " and state-level Democratic primary contestation"}.`,
    personSummary: `${row.holderName} holds ${row.stateCode} ${chamberLabel(row)} district ${row.district} as a ${row.incumbentParty}. The Open States roster is the identity source; the seat is next regularly contested in ${row.nextElectionYear} on a ${row.termYears}-year term.${mismatch}`,
    districtSummary: `${baselineSentence(row)}${uncontested} The margin here is the seat's own race, not a presidential overlay; state campaign-finance filings are not retained.`,
    limitations: "Own-race margin and, where retained, primary evidence and state contestation only. Term lengths are chamber defaults and special elections are not modelled. This is a comparative research index, not a forecast or endorsement.",
  };
}

let cache: PublicPriorityBrief[] | undefined;
export function stateLegislativePriorityBriefs(): readonly PublicPriorityBrief[] {
  if (!cache) cache = readStateLegislativeScoreV01Projection().rows.filter((row) => row.status === "scored").map(stateLegislativePriorityBrief);
  return cache;
}
