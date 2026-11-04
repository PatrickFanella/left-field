import { readHouseScoreV09ActiveProjection } from "@/rapid-acquisition/house-score-v09-active";
import { INCUMBENT_EVIDENCE_V2, type HousePrimaryIncumbentEvidenceV2 } from "@/rapid-acquisition/house-primary-incumbent-evidence-v2";
import { readPinnedPackage, readRetainedSource, readSourceLock } from "@/rapid-acquisition/intake/source-lock";
import { readSenateScoreV01Projection } from "@/rapid-acquisition/senate-score-v01";
import { STATE_LEGISLATIVE_PRIMARY_CONTEXT, type StateLegislativePrimaryContext } from "@/rapid-acquisition/state-legislative-primary-context";
import { readStateLegislativeGeneralResults, stateReturnsStatus } from "@/rapid-acquisition/state-legislative-general-results";
import { readStateLegislativeRoster } from "@/rapid-acquisition/state-legislative-roster";
import { readStateLegislativeScoreV01Projection, STATE_LEGISLATIVE_SCORE_V01 } from "@/rapid-acquisition/state-legislative-score-v01";

/**
 * Status of the active v0.9 expansion layers, read through the source lock.
 *
 * Every artifact is a lock-pinned, digest-checked retained file. Nothing here
 * rebuilds a projection; the page shows what the retained receipts say, and
 * returns null when any receipt is missing or disagrees with its pin.
 */
export type RapidExpansionDistrict = Readonly<{
  districtLabel: string;
  previousScore: number;
  activeScore: number;
  movement: number;
}>;

export type RapidExpansionStatus = Readonly<{
  score: Readonly<{
    version: "v0.9";
    previousVersion: "v0.8";
    seats: number;
    democraticSeats: number;
    republicanSeats: number;
    directPrimaryActiveSeats: number;
    newlyResolvedPrimarySeats: number;
    unresolvedPrimaryRows: number;
    reviewedAliasLinks: number;
    republicanSeatsWithStateContestation: number;
    republicanSeatsWithLocalContext: number;
    localContextActiveSeats: number;
    changedSeats: number;
    unchangedSeats: number;
    republicanMaxScore: number;
    maxAbsoluteMovement: number;
    activeDistricts: readonly (RapidExpansionDistrict & Readonly<{ localContext: number; localContextAvailableWeight: number }>)[];
    newlyResolvedDistricts: readonly (RapidExpansionDistrict & Readonly<{ incumbentPrimaryVoteShare: number | null }>)[];
  }>;
  stateContestation: Readonly<{
    catalogs: number;
    rows: number;
    formulaEligibleRows: number;
    statesWithContext: number;
    democraticContests: number;
    contestedDemocraticContests: number;
    states: readonly Readonly<{
      state: string;
      cycleYear: number;
      sourceArtifactId: string;
      democraticContests: number;
      contestedDemocraticContests: number;
      contestedShare: number;
      contestationScore: number;
    }>[];
  }>;
  localOffice: readonly Readonly<{
    id: string;
    label: string;
    scope: string;
    contests: number;
    summary: Readonly<Record<string, number>>;
  }>[];
  senate: Readonly<{
    version: "v0.1";
    seats: number;
    democraticCaucus: number;
    republicanCaucus: number;
    upIn2026: number;
    cashValues: number;
    alignmentValues: number;
    stateContestationValues: number;
    financeSnapshotId: string;
    financeCoverageThrough: string | null;
    topDemocratic: readonly Readonly<{ seatLabel: string; officialName: string; score: number; nextElectionYear: number }>[];
    topRepublican: readonly Readonly<{ seatLabel: string; officialName: string; score: number; nextElectionYear: number }>[];
  }>;
  stateLegislative: Readonly<{
    snapshotDate: string;
    jurisdictions: number;
    legislators: number;
    chambers: number;
    democraticHolders: number;
    republicanHolders: number;
    independentHolders: number;
    multiMemberDistricts: number;
    catalogStates: number;
    primaryMatched: number;
    holdersNotInLatestPrimary: number;
    presidentialBaseline: string;
    /** Present once the state-legislative score projection is pinned; null while no state is ranked. */
    scored: Readonly<{
      version: "v0.1";
      coveredStates: readonly string[];
      /** Covered states whose retained returns are still unofficial; empty once every source is a certified canvass. */
      unofficialStates: readonly string[];
      generalContests: number;
      seats: number;
      democraticSeats: number;
      republicanSeats: number;
      uncontestedBaselines: number;
      primaryFeasibilityValues: number;
      stateNotCovered: number;
    }> | null;
  }>;
}>;

/** Catalog-only local-office pilots. The Indiana pilot predates the intake registry, so labels live here. */
const LOCAL_OFFICE_CATALOGS = [
  { id: "rapid-indiana-local-office-primary-results-v1", label: "Indiana local offices", scope: "Indiana 2022 and 2024 county and local-office primary contests", contestKey: "partyContests", summaryKeys: ["officeCategories", "officeRows", "partyContests", "candidateRows", "sourceMarkedWinnerCandidates", "formulaEligibleContests"] },
  { id: "rapid-north-carolina-local-office-primary-results-v1", label: "North Carolina local offices", scope: "North Carolina 2022, 2024, and 2026 county, school-board, sheriff, court-clerk, register-of-deeds, and municipal primary contests", contestKey: "officeContests", summaryKeys: ["officeFamilies", "officeContests", "democraticContests", "republicanContests", "nonpartisanContests", "candidateRows", "candidateVotes", "formulaEligibleContests"] },
  { id: "rapid-new-mexico-county-office-primary-results-v1", label: "New Mexico county offices", scope: "New Mexico 2022, 2024, and 2026 assessor, clerk, commissioner, sheriff, treasurer, and probate-judge primary contests", contestKey: "officeContests", summaryKeys: ["officeFamilies", "officeContests", "democraticContests", "republicanContests", "libertarianContests", "candidateRows", "candidateVotes", "quarantinedContests", "formulaEligibleContests"] },
] as const;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export async function loadRapidExpansionStatus(root = process.cwd()): Promise<RapidExpansionStatus | null> {
  try {
    const lock = readSourceLock(root);
    const projection = readHouseScoreV09ActiveProjection(root, lock);
    const evidence = readPinnedPackage<HousePrimaryIncumbentEvidenceV2>(lock, INCUMBENT_EVIDENCE_V2.id, "dsa-seats:rapid-house-primary-incumbent-evidence-package:v2", root).value;
    const context = readPinnedPackage<StateLegislativePrimaryContext>(lock, STATE_LEGISLATIVE_PRIMARY_CONTEXT.id, "dsa-seats:rapid-state-legislative-primary-context-package:v1", root).value;
    if (evidence.schema !== "rapid-house-primary-2024-incumbent-evidence-v2" || context.schema !== "rapid-state-legislative-primary-context-v1" || context.methodology.winnerInference !== false) return null;

    const rows = projection.rows;
    const directPrimary = rows.filter((row) => row.directPrimaryEvidence);
    const activeDistricts = rows
      .filter((row) => row.localContext !== null)
      .map((row) => ({ districtLabel: row.districtLabel, previousScore: row.previousScore, activeScore: row.activeScore, movement: row.movementFromV08, localContext: row.localContext as number, localContextAvailableWeight: row.localContextAvailableWeight }))
      .sort((left, right) => left.districtLabel.localeCompare(right.districtLabel));
    const newlyResolvedDistricts = rows
      .filter((row) => row.newlyResolvedPrimaryEvidence)
      .map((row) => ({ districtLabel: row.districtLabel, previousScore: row.previousScore, activeScore: row.activeScore, movement: row.movementFromV08, incumbentPrimaryVoteShare: row.incumbentPrimaryVoteShare }));
    if (
      directPrimary.length !== evidence.summary.formulaEligibleRows ||
      newlyResolvedDistricts.length !== projection.summary.newlyResolvedPrimarySeats ||
      newlyResolvedDistricts.length !== evidence.summary.reviewedAliasLinks ||
      !activeDistricts.every((row) => /^[A-Z]{2}-AL$/.test(row.districtLabel) && [row.previousScore, row.activeScore, row.movement, row.localContext, row.localContextAvailableWeight].every(finite)) ||
      rows.filter((row) => row.incumbentParty === "Republican" && row.republicanRoute?.stateContestation !== null && row.republicanRoute !== null).length !== projection.summary.republicanSeatsWithStateContestation
    )
      return null;

    const states = [...context.stateContext].sort((left, right) => left.state.localeCompare(right.state));
    if (states.length !== context.summary.statesWithContext || states.some((row) => ![row.democraticContests, row.contestedDemocraticContests, row.contestedShare, row.contestationScore].every(finite))) return null;

    const localOffice = LOCAL_OFFICE_CATALOGS.map(({ id, label, scope, contestKey, summaryKeys }) => {
      const { bytes } = readRetainedSource(lock, id, root);
      const catalog = JSON.parse(bytes.toString("utf8")) as { schema?: unknown; summary?: Record<string, unknown> };
      if (catalog.schema !== id || !catalog.summary || catalog.summary.formulaEligibleContests !== 0) throw new Error(`RAPID_EXPANSION_CATALOG_INVALID:${id}`);
      const summary = Object.fromEntries(summaryKeys.map((key) => [key, catalog.summary![key]]));
      if (!Object.values(summary).every((value) => Number.isSafeInteger(value))) throw new Error(`RAPID_EXPANSION_CATALOG_SUMMARY_INVALID:${id}`);
      return { id, label, scope, contests: summary[contestKey] as number, summary: summary as Record<string, number> };
    });

    const senate = readSenateScoreV01Projection(root, lock);
    const roster = readStateLegislativeRoster(root, lock);
    const stateScore = lock.entries.some((entry) => entry.id === STATE_LEGISLATIVE_SCORE_V01.id) ? readStateLegislativeScoreV01Projection(root, lock) : null;
    const general = stateScore && readStateLegislativeGeneralResults(root, lock);
    const top = (caucus: "Democratic" | "Republican") => senate.rows.filter((row) => row.caucus === caucus).sort((left, right) => right.score - left.score || left.seatId.localeCompare(right.seatId)).slice(0, 5).map((row) => ({ seatLabel: row.seatLabel, officialName: row.officialName, score: row.score, nextElectionYear: row.nextElectionYear }));
    const coverageDates = senate.rows.map((row) => row.financeCoverageThrough).filter((value): value is string => value !== null).sort();

    return {
      senate: {
        version: "v0.1",
        seats: senate.summary.seats,
        democraticCaucus: senate.summary.democraticCaucus,
        republicanCaucus: senate.summary.republicanCaucus,
        upIn2026: senate.summary.upIn2026,
        cashValues: senate.summary.cashValues,
        alignmentValues: senate.summary.alignmentValues,
        stateContestationValues: senate.summary.stateContestationValues,
        financeSnapshotId: senate.parents.find((parent) => parent.id.startsWith("fec-candidate-summary-"))?.id ?? "",
        financeCoverageThrough: coverageDates.at(-1) ?? null,
        topDemocratic: top("Democratic"),
        topRepublican: top("Republican"),
      },
      stateLegislative: {
        snapshotDate: roster.snapshotDate,
        jurisdictions: roster.summary.jurisdictions,
        legislators: roster.summary.legislators,
        chambers: roster.summary.chambers,
        democraticHolders: roster.summary.democraticHolders,
        republicanHolders: roster.summary.republicanHolders,
        independentHolders: roster.summary.independentHolders,
        multiMemberDistricts: roster.summary.multiMemberDistricts,
        catalogStates: roster.summary.catalogStates,
        primaryMatched: roster.summary.primaryMatched,
        holdersNotInLatestPrimary: roster.summary.holdersNotInLatestPrimary,
        presidentialBaseline: roster.methodology.presidentialBaseline,
        scored: stateScore && general ? {
          version: "v0.1",
          coveredStates: stateScore.coveredStates,
          unofficialStates: stateReturnsStatus(general).unofficialStates,
          generalContests: general.summary.contests,
          seats: stateScore.summary.scored,
          democraticSeats: stateScore.summary.democraticScored,
          republicanSeats: stateScore.summary.republicanScored,
          uncontestedBaselines: stateScore.summary.uncontestedBaselines,
          primaryFeasibilityValues: stateScore.summary.primaryFeasibilityValues,
          stateNotCovered: stateScore.summary.stateNotCovered,
        } : null,
      },
      score: {
        version: "v0.9",
        previousVersion: "v0.8",
        seats: projection.summary.seats,
        democraticSeats: projection.summary.seats - projection.summary.republicanSeats,
        republicanSeats: projection.summary.republicanSeats,
        directPrimaryActiveSeats: directPrimary.length,
        newlyResolvedPrimarySeats: projection.summary.newlyResolvedPrimarySeats,
        unresolvedPrimaryRows: evidence.summary.unresolvedIdentityRows,
        reviewedAliasLinks: evidence.summary.reviewedAliasLinks,
        republicanSeatsWithStateContestation: projection.summary.republicanSeatsWithStateContestation,
        republicanSeatsWithLocalContext: projection.summary.republicanSeatsWithLocalContext,
        localContextActiveSeats: activeDistricts.length,
        changedSeats: projection.summary.changedSeats,
        unchangedSeats: projection.summary.unchangedSeats,
        republicanMaxScore: projection.summary.republicanMaxScore,
        maxAbsoluteMovement: projection.summary.maxAbsoluteMovement,
        activeDistricts,
        newlyResolvedDistricts,
      },
      stateContestation: {
        catalogs: context.summary.catalogs,
        rows: context.summary.rows,
        formulaEligibleRows: context.summary.formulaEligibleRows,
        statesWithContext: context.summary.statesWithContext,
        democraticContests: context.summary.democraticContests,
        contestedDemocraticContests: context.summary.contestedDemocraticContests,
        states,
      },
      localOffice,
    };
  } catch {
    return null;
  }
}
