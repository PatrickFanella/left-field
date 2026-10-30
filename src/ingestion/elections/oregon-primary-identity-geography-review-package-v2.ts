import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";

import { canonicalJson } from "../fec/aipac-proposed-packages";
import { validateOregonPrimaryGeographyCandidateV2, type OregonPrimaryGeographyCandidateV2, type OregonPrimaryGeographyV2Input } from "./oregon-primary-geography-compatibility-candidate-v2";
import { validateOregonPrimaryJointPackage, type OregonPrimaryJointPackage } from "./oregon-primary-identity-geography-review-package";

export const OREGON_PRIMARY_JOINT_V2 = "oregon-primary-identity-geography-review-package-v2" as const;
type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
export type OregonPrimaryJointV2Input = OregonPrimaryGeographyV2Input & Readonly<{ jointV1Json: string; geographyV2Json: string }>;

const JOINT_V1_SHA = "4ee08bfac8a801084a3525d418b9e4d51b83ae1b3ac164ec9cef575d389a38b7";
const GEOGRAPHY_V2_SHA = "bde02ed6eee2bfd85b61a892bb7686ff703ea2bebcc32ce652317b76bbe9994b";
const PARENTS = ["oregon-primary-identity-geography-review-package-v1", "oregon-primary-geography-compatibility-candidate-v2"] as const;
const REQUIRED_ENTRIES: LockEntry[] = [
  { id: PARENTS[0], url: "urn:dsa-seats:oregon-primary-identity-geography-review-package:v1:2026-08-05", retainedPath: "data/metadata/oregon-primary-identity-geography-review-package-v1.json", retainedStatus: "retained", byteSize: 24911, sha256: JOINT_V1_SHA, kind: "review_candidate", parentIds: ["house-democratic-primary-source-selection-proposal-20260804-v1", "oregon-current-incumbent-primary-linkage-candidate-v1", "oregon-primary-geography-compatibility-candidate-v1"] },
  { id: PARENTS[1], url: "urn:dsa-seats:oregon-primary-geography-compatibility-candidate:v2:2026-08-06", retainedPath: "data/metadata/oregon-primary-geography-compatibility-candidate-v2.json", retainedStatus: "retained", byteSize: 28888, sha256: GEOGRAPHY_V2_SHA, kind: "review_candidate", parentIds: ["oregon-primary-geography-compatibility-candidate-v1", "oregon-2026-congressional-plan-authority-receipt-v1"] },
];
const OUTPUT_ENTRY: LockEntry = { id: OREGON_PRIMARY_JOINT_V2, url: "urn:dsa-seats:oregon-primary-identity-geography-review-package:v2:2026-08-06", retainedPath: "data/metadata/oregon-primary-identity-geography-review-package-v2.json", retainedStatus: "retained", byteSize: 40601, sha256: "13c7d6c0519cf1d4658a045fa37957b08fc0c288add544bcf686b86b7c446c51", kind: "review_proposal", parentIds: [...PARENTS] };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const order = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const fail = (reason: string): never => { throw new Error(`OREGON_PRIMARY_JOINT_V2_INVALID:${reason}`); };
const exactEntry = (entries: LockEntry[], expected: LockEntry) => {
  const matches = entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
};

function assemble(input: OregonPrimaryJointV2Input) {
  if (input.sourceLock.version !== 1 || sha(input.jointV1Json) !== JOINT_V1_SHA || sha(input.geographyV2Json) !== GEOGRAPHY_V2_SHA) fail("input_bytes");
  const jointV1 = validateOregonPrimaryJointPackage(JSON.parse(input.jointV1Json) as OregonPrimaryJointPackage);
  const geography = validateOregonPrimaryGeographyCandidateV2(JSON.parse(input.geographyV2Json) as OregonPrimaryGeographyCandidateV2, input);
  if (
    jointV1.packageSha256 !== "4ec88e16e56a6c48b4224b030ea3fd59f507dbd2832ddf4609fbfaff3bf44085"
    || jointV1.reviewRecordSetSha256 !== "8a60f3044c903a45fa59fe91934a4916d8be062d81ea7edd5bbfc888c1d4c6a2"
    || geography.packageSha256 !== "b8f27af5d9436426d520e94eca574ea39aa72fd256d7b72f8f879f88087d301f"
    || geography.rowSetSha256 !== "bfa5a42eca7a4454739b721bfe963fddff66ea117dce35588b1953c6e06a5c70"
  ) fail("parent_identity");
  for (const entry of REQUIRED_ENTRIES) exactEntry(input.sourceLock.entries, entry);
  exactEntry(input.sourceLock.entries, OUTPUT_ENTRY);

  const geographyByContest = new Map(geography.rows.map((row) => [row.contestId, row]));
  const records = jointV1.records.map((parent) => {
    const geographyRow = geographyByContest.get(parent.contestId) ?? fail("missing_geography_row");
    if (
      geographyRow.contestSha256 !== parent.contestSha256
      || geographyRow.seatCycleId !== parent.seatCycleId
      || geographyRow.districtCode !== parent.districtCode
      || geographyRow.cycleYear !== parent.cycleYear
      || geographyRow.targetCd119Geoid !== parent.geography.targetCd119Geoid
      || parent.evaluatorUse !== "excluded_pending_independent_identity_and_geography_review"
      || geographyRow.evaluatorUse !== "excluded_pending_authorized_identity_historical_geography_and_review"
    ) fail("geography_join");
    const identityCandidate = parent.identity.sourceCandidateName !== null;
    const geographyCandidate = geographyRow.compatibilityCandidate;
    const reviewDisposition = identityCandidate && geographyCandidate
      ? "identity_and_geography_candidates_pending_independent_review" as const
      : "geography_candidate_identity_unresolved" as const;
    if (!geographyCandidate || (!identityCandidate && parent.identity.relationshipDisposition !== "not_linked_no_unique_candidate")) fail("review_disposition");
    const { reviewRecordSha256: parentReviewRecordSha256, geography: parentGeography, ...preserved } = parent;
    const unsigned = {
      ...preserved,
      parentReviewRecordSha256,
      geography: {
        parentGeographyRowSha256: geographyRow.rowSha256,
        parentV1GeographyFields: parentGeography,
        targetCd119Geoid: geographyRow.targetCd119Geoid,
        historicalCongressSession: geographyRow.historicalCongressSession,
        historicalGeoid: geographyRow.historicalGeoid,
        compatibilityDisposition: geographyRow.compatibilityDisposition,
        evidenceClass: geographyRow.evidenceClass,
        confidence: geographyRow.confidence,
        candidate: geographyCandidate,
        approved: false as const,
        planContinuityEvidence: geographyRow.planContinuityEvidence,
      },
      reviewDisposition,
      jointApproved: false as const,
      evaluatorUse: parent.evaluatorUse,
      scoreEligible: false as const,
      rationaleCodes: [
        identityCandidate ? "identity_candidate_pending_review" : "identity_unresolved_predecessor_cycle",
        "geography_candidate_pending_review",
        "parent_candidates_not_approved_by_join",
        "identity_projection_preserved_from_joint_v1",
        "geography_projection_composed_from_geography_v2",
      ],
    };
    return { ...unsigned, reviewRecordSha256: digest("dsa-seats:or-primary-joint-review-row:v2\0", unsigned) };
  }).sort((left, right) => order(left.reviewRecordId, right.reviewRecordId));
  const current = records.filter((record) => record.cycleYear === 2026);
  const summary = {
    reviewRecords: 15 as const,
    identityAndGeographyCandidates: records.filter((record) => record.reviewDisposition === "identity_and_geography_candidates_pending_independent_review").length,
    geographyCandidateIdentityUnresolved: records.filter((record) => record.reviewDisposition === "geography_candidate_identity_unresolved").length,
    identityCandidates: records.filter((record) => record.identity.sourceCandidateName !== null).length,
    geographyCandidates: records.filter((record) => record.geography.candidate).length,
    jointApprovedRecords: 0 as const,
    scoreEligibleRecords: 0 as const,
  };
  if (
    records.length !== 15 || geographyByContest.size !== 18 || new Set(records.map((record) => record.contestId)).size !== 15
    || current.length !== 5 || current.some((record) => record.geography.historicalCongressSession !== "120" || record.geography.historicalGeoid !== null || record.geography.planContinuityEvidence === null || record.geography.planContinuityEvidence.sourcePlanToCd119ExactBlockConcordanceAssessed)
    || records.some((record) => record.identity.identityApproved || record.geography.approved || record.jointApproved || record.scoreEligible)
    || canonicalJson(summary) !== canonicalJson({ reviewRecords: 15, identityAndGeographyCandidates: 13, geographyCandidateIdentityUnresolved: 2, identityCandidates: 13, geographyCandidates: 15, jointApprovedRecords: 0, scoreEligibleRecords: 0 })
  ) fail("record_closure");
  const unsigned = {
    schema: OREGON_PRIMARY_JOINT_V2,
    version: 2 as const,
    generatedAt: "2026-08-07T00:30:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    defaultUse: jointV1.defaultUse,
    review: jointV1.review,
    parents: {
      jointV1: { sourceLockId: PARENTS[0], fileSha256: JOINT_V1_SHA, packageSha256: jointV1.packageSha256, reviewRecordSetSha256: jointV1.reviewRecordSetSha256, superseded: false as const },
      geographyV2: { sourceLockId: PARENTS[1], fileSha256: GEOGRAPHY_V2_SHA, packageSha256: geography.packageSha256, rowSetSha256: geography.rowSetSha256 },
    },
    methodology: {
      compositionOnly: true as const,
      identityAndRecordCoordinatesPreserved: true as const,
      geographyProjectionSource: PARENTS[1],
      sourcePlanToCd119ExactBlockConcordanceAssessed: false as const,
      rawGeometryEqualityAssessed: false as const,
      automaticDecisionClosure: false as const,
      evaluatorNumericValues: 0 as const,
    },
    summary,
    records,
    reviewRecordSetSha256: digest("dsa-seats:or-primary-joint-review-row-set:v2\0", records),
    decisionSupport: {
      ...jointV1.decisionSupport as object,
      resolutions: { identity: null, geography: null },
      lifecycle: "review_queue_composes_v2_geography_without_an_independent_decision",
    },
  };
  return { ...unsigned, packageSha256: digest("dsa-seats:or-primary-joint-review-package:v2\0", unsigned) };
}

export type OregonPrimaryJointPackageV2 = ReturnType<typeof assemble>;
export function buildOregonPrimaryJointPackageV2(input: OregonPrimaryJointV2Input) { return assemble(input); }
export function validateOregonPrimaryJointPackageV2(value: OregonPrimaryJointPackageV2, input: OregonPrimaryJointV2Input) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
