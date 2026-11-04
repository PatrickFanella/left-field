import { buildHousePrimaryIncumbentEvidenceV2, INCUMBENT_EVIDENCE_V2 } from "@/rapid-acquisition/house-primary-incumbent-evidence-v2";
import { buildHouseScoreV09ActiveProjection, HOUSE_SCORE_V09 } from "@/rapid-acquisition/house-score-v09-active";
import { buildGovernorScoreV01Projection, GOVERNOR_SCORE_V01 } from "@/rapid-acquisition/governor-score-v01";
import { buildHouseIncumbentCandidacy, HOUSE_INCUMBENT_CANDIDACY } from "@/rapid-acquisition/house-incumbent-candidacy";
import { buildHouseScoreV10ActiveProjection, HOUSE_SCORE_V10 } from "@/rapid-acquisition/house-score-v10-active";
import { buildHouseScoreV11ActiveProjection, HOUSE_SCORE_V11 } from "@/rapid-acquisition/house-score-v11-active";
import type { SourceLock } from "@/rapid-acquisition/intake/source-lock";
import { buildSeatOutcomeLedger, SEAT_OUTCOME_LEDGER } from "@/rapid-acquisition/seat-outcome-ledger";
import { buildSenateScoreV01Projection, SENATE_SCORE_V01 } from "@/rapid-acquisition/senate-score-v01";
import { buildStateLegislativePrimaryContext, STATE_LEGISLATIVE_PRIMARY_CONTEXT } from "@/rapid-acquisition/state-legislative-primary-context";
import { buildStateLegislativeGeneralResults, STATE_LEGISLATIVE_GENERAL_RESULTS } from "@/rapid-acquisition/state-legislative-general-results";
import { buildStateLegislativeRoster, STATE_LEGISLATIVE_ROSTER } from "@/rapid-acquisition/state-legislative-roster";
import { buildStateLegislativeScoreV01Projection, STATE_LEGISLATIVE_SCORE_V01 } from "@/rapid-acquisition/state-legislative-score-v01";
import { buildStatePrimaryResults2026, STATE_PRIMARY_RESULTS_2026 } from "@/rapid-acquisition/state-primary-results-2026";
import { buildStatewidePresidential2024, STATEWIDE_PRESIDENTIAL_2024 } from "@/rapid-acquisition/statewide-presidential-2024";

/**
 * Derived artifacts that `rapid:intake derive <id>` can build and pin.
 * Each entry names its builder, output path, lock kind, and parents, so no
 * per-artifact generator script or hand-edited lock entry is needed.
 */
export type DerivedArtifact = Readonly<{
  id: string;
  path: string;
  url: string;
  kind: string;
  /** Static parents, or a function when a parent is a dated snapshot named by the refresh pointer. */
  parentIds: readonly string[] | ((root: string, lock: SourceLock) => readonly string[]);
  build: (root: string, lock: SourceLock) => unknown;
  describe: (value: unknown) => string[];
}>;

const summaryLine = (value: unknown): string[] => {
  const record = value as { summary?: unknown; packageSha256?: unknown; rowSetSha256?: unknown };
  return [
    `summary ${JSON.stringify(record.summary)}`,
    ...(typeof record.rowSetSha256 === "string" ? [`row set ${record.rowSetSha256}`] : []),
    `package ${String(record.packageSha256)}`,
  ];
};

export const DERIVED_ARTIFACTS: readonly DerivedArtifact[] = [
  {
    ...STATE_LEGISLATIVE_PRIMARY_CONTEXT,
    kind: "derived_artifact",
    parentIds: [
      "rapid-indiana-state-legislative-primary-results-v1", "rapid-tennessee-state-legislative-primary-results-v1", "rapid-georgia-state-legislative-primary-results-v1",
      "rapid-north-carolina-state-legislative-primary-results-v1", "rapid-alabama-state-legislative-primary-results-v1", "rapid-delaware-state-legislative-primary-results-v1",
      "rapid-hawaii-state-legislative-primary-results-v1", "rapid-missouri-state-legislative-primary-results-v1", "rapid-kentucky-state-legislative-primary-results-v1",
      "rapid-ohio-state-legislative-democratic-primary-results-v1", "rapid-north-carolina-local-office-primary-results-v1", "rapid-new-mexico-county-office-primary-results-v1",
    ],
    build: (root, lock) => buildStateLegislativePrimaryContext(root, lock),
    describe: summaryLine,
  },
  {
    ...INCUMBENT_EVIDENCE_V2,
    kind: "derived_artifact",
    build: (root, lock) => buildHousePrimaryIncumbentEvidenceV2(root, lock),
    describe: summaryLine,
  },
  {
    ...HOUSE_SCORE_V09,
    kind: "derived_artifact",
    build: (root, lock) => buildHouseScoreV09ActiveProjection(root, lock),
    describe: summaryLine,
  },
  {
    ...STATEWIDE_PRESIDENTIAL_2024,
    kind: "derived_artifact",
    build: (root, lock) => buildStatewidePresidential2024(root, lock),
    describe: summaryLine,
  },
  {
    id: SENATE_SCORE_V01.id,
    path: SENATE_SCORE_V01.path,
    url: SENATE_SCORE_V01.url,
    kind: "derived_artifact",
    parentIds: SENATE_SCORE_V01.parentIds,
    build: (root, lock) => buildSenateScoreV01Projection(root, lock),
    describe: summaryLine,
  },
  {
    id: HOUSE_SCORE_V10.id,
    path: HOUSE_SCORE_V10.path,
    url: HOUSE_SCORE_V10.url,
    kind: "derived_artifact",
    parentIds: HOUSE_SCORE_V10.parentIds,
    build: (root, lock) => buildHouseScoreV10ActiveProjection(root, lock),
    describe: summaryLine,
  },
  {
    id: HOUSE_INCUMBENT_CANDIDACY.id,
    path: HOUSE_INCUMBENT_CANDIDACY.path,
    url: HOUSE_INCUMBENT_CANDIDACY.url,
    kind: "derived_artifact",
    parentIds: HOUSE_INCUMBENT_CANDIDACY.parentIds,
    build: (root, lock) => buildHouseIncumbentCandidacy(root, lock),
    describe: summaryLine,
  },
  {
    ...HOUSE_SCORE_V11,
    kind: "derived_artifact",
    build: (root, lock) => buildHouseScoreV11ActiveProjection(root, lock),
    describe: summaryLine,
  },
  {
    id: GOVERNOR_SCORE_V01.id,
    path: GOVERNOR_SCORE_V01.path,
    url: GOVERNOR_SCORE_V01.url,
    kind: "derived_artifact",
    parentIds: GOVERNOR_SCORE_V01.parentIds,
    build: (root, lock) => buildGovernorScoreV01Projection(root, lock),
    describe: summaryLine,
  },
  {
    id: STATE_LEGISLATIVE_ROSTER.id,
    path: STATE_LEGISLATIVE_ROSTER.path,
    url: STATE_LEGISLATIVE_ROSTER.url,
    kind: "derived_artifact",
    parentIds: STATE_LEGISLATIVE_ROSTER.parentIds,
    build: (root, lock) => buildStateLegislativeRoster(root, lock),
    describe: summaryLine,
  },
  {
    id: STATE_LEGISLATIVE_GENERAL_RESULTS.id,
    path: STATE_LEGISLATIVE_GENERAL_RESULTS.path,
    url: STATE_LEGISLATIVE_GENERAL_RESULTS.url,
    kind: "derived_artifact",
    parentIds: STATE_LEGISLATIVE_GENERAL_RESULTS.parentIds,
    build: (root, lock) => buildStateLegislativeGeneralResults(root, lock),
    describe: summaryLine,
  },
  {
    id: STATE_LEGISLATIVE_SCORE_V01.id,
    path: STATE_LEGISLATIVE_SCORE_V01.path,
    url: STATE_LEGISLATIVE_SCORE_V01.url,
    kind: "derived_artifact",
    parentIds: STATE_LEGISLATIVE_SCORE_V01.parentIds,
    build: (root, lock) => buildStateLegislativeScoreV01Projection(root, lock),
    describe: summaryLine,
  },
  {
    id: STATE_PRIMARY_RESULTS_2026.id,
    path: STATE_PRIMARY_RESULTS_2026.path,
    url: STATE_PRIMARY_RESULTS_2026.url,
    kind: "derived_artifact",
    parentIds: STATE_PRIMARY_RESULTS_2026.parentIds,
    build: (root, lock) => buildStatePrimaryResults2026(root, lock),
    describe: summaryLine,
  },
  {
    // Last: it joins the frozen pre-election snapshot to the rosters, candidacy and primary artifacts rebuilt above.
    ...SEAT_OUTCOME_LEDGER,
    kind: "derived_artifact",
    build: (root, lock) => buildSeatOutcomeLedger(root, lock),
    describe: summaryLine,
  },
];

export const derivedParentIds = (artifact: DerivedArtifact, root: string, lock: SourceLock): readonly string[] =>
  typeof artifact.parentIds === "function" ? artifact.parentIds(root, lock) : artifact.parentIds;
