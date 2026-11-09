import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { canonicalManifest } from "@/data/canonical-manifest";
import { loadCanonicalBoundaries as loadCanonicalBoundaryBundle } from "@/data/boundary-loader";
import { adversarialRepositoryManifest, coherentBoundaryBundle, coherentManifest } from "@/test/fixtures/prototype-manifest";
import type { PrototypeManifest } from "@/domain/contracts";
import { computeCanonicalDataChecksum } from "@/domain/validate-manifest";
import { compileBoundaryBundle, loadPrototypeManifest, seedPrototypeManifest } from "./manifest";
import { fecV2CombinedStageSha256, promoteCandidateRelease, rollbackPublishedRelease, rollForwardRetiredRelease } from "./releases";
import {
  baselineCandidateRelease,
  assertPersistedTask6MemberInvariant,
  verifyPersistedTask6MemberCandidate,
  enrichCandidateMembersFromBaseline,
  computeReleaseDigest,
  contentTableRegistry,
  contentDomains,
  recheckNationwideValidationGate,
  validateNationwideCandidateRelease,
  validateNationwideCandidateReleaseWithClient,
  expectedContentChecksum,
} from "./catalog-release";
import { failExpiredRun, heartbeat, markFailed, markLoaded, markValidated, recordQuarantineBatch, recordStageBatch, startIngestRun } from "./ingestion";
import { nationwideSkeleton } from "@/test/fixtures/nationwide-skeleton";
import { PostgresSeatResearchRepository } from "@/repositories/postgres";
import { InMemorySeatResearchRepository } from "@/repositories/in-memory";
import { assertSeatRepositoryContract } from "@/test/repository-contract";
import { PostgresAddressResolver, PostgresSeatLocator } from "@/address/postgres-resolver";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { runSource } from "@/ingestion/core/run-source";
import type { RawObject, SourceAdapter } from "@/ingestion/core/types";
import { canonicalCoverageScopeKey, loadNationwideManifest, loadNationwideManifestForFinalization, seedNationwideCandidateManifest, type BoundaryBundle } from "./manifest";
import { LocalRawObjectStore, type RawObjectStore } from "@/ingestion/core/raw-object-store";
import { createIdentityAdapter } from "@/ingestion/identity/adapter";
import type { HouseSeat } from "@/ingestion/identity/house";
import { parseSenateRoster, parseSenateServiceStartsArtifact, type SenateSeat } from "@/ingestion/identity/senate";
import { createTigerAdapter } from "@/ingestion/tiger/adapter";
import type { NationalTigerArtifactManifest } from "@/ingestion/tiger/national";
import { TIGER_2025_JURISDICTIONS } from "@/ingestion/tiger/national";
import { finalizeNationwideCandidate, locateNationwideCandidatePoint } from "@/ingestion/catalog/finalize-nationwide";
import { ACS_ADAPTER_VERSION, createAcsAdapter } from "@/ingestion/acs/adapter";
import { ACS_INDICATOR_DICTIONARY } from "@/ingestion/acs/indicator-dictionary";
import { assertPersistedTask7AcsInvariant, finalizeCandidateAcs, verifyPersistedTask7AcsCandidate } from "@/ingestion/acs/finalize-acs";
import { finalizeCandidateFec, verifyPersistedTask8FecCandidate } from "@/ingestion/fec/finalize-fec";
import { encodeFecSanitizedEnvelope, fecEnvelopeSha256, fecPageRequestSha256 } from "@/ingestion/fec/envelope";
import { fecEnvelopeFixture } from "@/ingestion/fec/fec-test-fixture";
import { createElectionDecisionAdapter, ELECTION_DECISION_SOURCE, ELECTION_DECISION_UPSTREAM_RELEASE, electionDecisionSourceUrl } from "@/ingestion/elections/adapter";
import { ELECTION_DECISION_ADAPTER_VERSION, electionDecisionEnvelopeSha256, encodeElectionDecisionEnvelope } from "@/ingestion/elections/decision-envelope";
import { finalizeCandidateElectionDecisions, verifyPersistedTask9ElectionCandidate } from "@/ingestion/elections/finalize-elections";
import { finalizeCandidateMaps, verifyPersistedCandidateMaps } from "@/ingestion/tiger/finalize-maps";
import { simplifyNationalTigerDistrictLayer } from "@/ingestion/tiger/simplify";
import { LocalMapArtifactStore, type MapArtifactStore } from "@/maps/map-artifact-store";
import { CorrectionMaintenanceRepository, CorrectionRepository, CorrectionReviewerRepository } from "@/corrections/repository";
import { correctionParityVectors, correctionSubmissionSchema, parseCorrectionSubmission } from "@/domain/corrections";
import { AddressAdmissionMaintenanceRepository, AddressAdmissionRepository } from "@/address/admission";
import { CallerAbortError } from "@/address/census-geocoder";
import { runSyntheticReleaseDrill } from "@/operations/release-drill";
import { inspectReleaseHealth } from "@/operations/release-health";
import { addElectionEvidence, addFinanceEvidence, cloneLaunchRelease, fixtureResolver, fixtureStores, fixtureVerifier, seedLaunchR1 } from "@/test/fixtures/launch-lifecycle";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testDatabaseName = testDatabaseUrl ? new URL(testDatabaseUrl).pathname.slice(1) : "";
if (testDatabaseUrl && !/(?:_test|_test_[a-z0-9_]+)$/i.test(testDatabaseName)) throw new Error("TEST_DATABASE_URL must name a disposable *_test database");
const integration = testDatabaseUrl ? describe : describe.skip;
const strictRun = (id: string, releaseId: string, sourceId: string, extractedCount: number, snapshotId = "snap_1", rawObjectSha256 = "a".repeat(64), upstreamRelease = "contract") => ({ id, releaseId, sourceId, snapshotId, adapterVersion: "contract", upstreamRelease, rawStoreKind: "local" as const, rawStoreLocator: "/tmp/contract", rawObjectKey: "contract/fixture.json", rawObjectSha256, rawObjectByteSize: 0, leaseToken: randomUUID(), leaseDurationMs: 60_000, extractedCount });

function candidate(id: string, base: PrototypeManifest = coherentManifest()): PrototypeManifest {
  const manifest = structuredClone(base) as PrototypeManifest;
  const replaceRelease = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(replaceRelease);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (record.releaseId === "rel_1") record.releaseId = id;
      Object.values(record).forEach(replaceRelease);
    }
  };
  replaceRelease(manifest);
  manifest.release = { ...manifest.release, id: id as never, status: "candidate", publishedAt: null, previousReleaseId: null };
  manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest);
  return manifest;
}

function boundariesFor(manifest: PrototypeManifest) { return coherentBoundaryBundle(manifest); }

function persistedNationwideSkeleton() {
  const manifest = structuredClone(nationwideSkeleton());
  // Keep the synthetic release structurally nationwide while exercising the
  // repository's vacant-seat path.  The selection is derived from its own
  // house universe rather than from production seat ids.
  const houseOfficeIds = new Set(manifest.offices.filter((office) => office.chamber === "house").slice(0, 4).map((office) => office.id));
  const vacantTerms = new Set(manifest.seatCycles.filter((cycle) => houseOfficeIds.has(cycle.officeId)).map((cycle) => cycle.officeTermId));
  manifest.seatCycles = manifest.seatCycles.map((cycle) => vacantTerms.has(cycle.officeTermId) ? { ...cycle, occupancy: { ...cycle.occupancy, status: "vacant" } } : cycle);
  manifest.memberships = manifest.memberships.filter((membership) => !vacantTerms.has(membership.officeTermId));
  const memberCoverage = manifest.coverageRecords.find((record) => record.domain === "member" && record.scope.kind === "release");
  if (!memberCoverage) throw new Error("Synthetic nationwide fixture is missing release member coverage");
  memberCoverage.expectedCount = manifest.memberships.length;
  memberCoverage.observedCount = manifest.memberships.length;
  const stateIndex = new Map([...new Set(manifest.geographyVersions.map(geography => geography.stateCode))].map((state, index) => [state, index]));
  const districtIndex = new Map<string, number>();
  const featureCollection = {
    type: "FeatureCollection",
    features: manifest.geographyVersions.map((geography) => {
      const x = -170 + stateIndex.get(geography.stateCode)! * 5;
      const district = geography.kind === "house_district" ? (districtIndex.get(geography.stateCode) ?? 0) : 0;
      districtIndex.set(geography.stateCode, district + (geography.kind === "house_district" ? 1 : 0));
      const left = geography.kind === "house_district" ? x + district * .1 : x;
      const right = geography.kind === "house_district" ? left + .09 : x + 4;
      return ({
      type: "Feature",
      properties: { sourceGeoid: geography.sourceGeoid, stateCode: geography.stateCode, districtCode: geography.kind === "house_district" ? geography.districtCode : null },
      geometry: { type: "MultiPolygon", coordinates: [[[[left, 0], [right, 0], [right, 4], [left, 4], [left, 0]]]] },
    }); }),
  };
  const bytes = JSON.stringify(featureCollection);
  manifest.geometryArtifacts[0]!.checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  manifest.biographicalFacts.find((fact) => fact.fact === "birth_date")!.value = { kind: "value", value: "1970-01-02" };
  manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest);
  return { manifest, bundle: [{ artifactId: manifest.geometryArtifacts[0]!.id, objectKey: manifest.geometryArtifacts[0]!.objectKey, bytes }] satisfies BoundaryBundle };
}

async function waitForPromotionToBlock(pool: Pool, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const waiting = await pool.query<{ waiting: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) AS waiting");
    if (waiting.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Promotion did not block on the candidate content lock");
}

async function waitForWriterToBlockOnAdvisoryLock(pool: Pool, writerPid: number, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const waiting = await pool.query<{ waiting: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=$1 AND NOT granted) AS waiting", [writerPid]);
    if (waiting.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Candidate content writer did not block on its release advisory lock");
}

integration("PostgreSQL integration", () => {
  type IdentityRow = { key: string; entity: string; name?: string };
  const task3Adapter = (raw: RawObject<null>, rows: readonly IdentityRow[], options: { quarantines?: boolean; issue?: boolean; stageError?: boolean; loadError?: boolean } = {}): SourceAdapter<null, IdentityRow> => ({
    sourceName: "task3", adapterVersion: "task3-v1",
    async *extract() { yield raw; },
    async *parse() { for (const row of rows) yield options.quarantines ? { kind: "quarantine" as const, sourceNaturalKey: row.key, payloadChecksum: "b".repeat(64), errorCode: "opaque parser detail" } : { kind: "row" as const, row }; },
    naturalKey: row => row.key,
    async stage(client: PoolClient, runId, staged) { if (options.stageError) throw new Error("stage failure"); for (const row of staged) await client.query("INSERT INTO stg_identity(run_id,release_id,source_natural_key,snapshot_id,entity_id,source_entity_id,display_name) VALUES($1,$2,$3,$4,$5,$6,$7)", [runId, task3ReleaseId, row.key, raw.snapshot.id, row.entity, row.entity, row.name ?? "Fixture"]); },
    async validateStaged() { return options.issue ? [{ code: "fixture_invalid", message: "fixture invalid" }] : []; },
    async loadFromStage(client, runId, releaseId) { await client.query("INSERT INTO people(id,release_id,display_name) SELECT 'task3_' || entity_id,$2,display_name FROM stg_identity WHERE run_id=$1", [runId, releaseId]); if (options.loadError) throw new Error("load failure"); },
  });
  const task3ReleaseId = "rel_task3_ingestion";
  const task3Raw = (snapshotId = "snap_task3", checksum = "a".repeat(64), count = 1): RawObject<null> => ({ value: null, expectedRecordCount: count, receipt: { storeKind: "local", storeLocator: "/tmp/task3", objectKey: "task3/fixture.json", sha256: checksum, byteSize: 0 }, snapshot: { id: snapshotId as never, sourceUrl: "https://example.test/task3", checksumSha256: checksum, upstreamRelease: "task3-release", publishedAt: null, license: "public", usageStatus: "approved" } });
  const seedTask3 = async (pool: Pool): Promise<string> => { const manifest = candidate(task3ReleaseId); await seedPrototypeManifest(pool, manifest, boundariesFor(manifest)); return manifest.sources[0]!.id; };
  beforeEach(async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try { await pool.query("TRUNCATE data_releases CASCADE"); } finally { await pool.end(); }
  });

  afterEach(async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try { await pool.query("TRUNCATE data_releases CASCADE"); } finally { await pool.end(); }
  });

  it("launch publication lifecycle", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const preflightName = `dsa_launch_preflight_${suffix}`; const verifierName = `dsa_launch_verifier_${suffix}`; const password = randomUUID(); const verifierPassword = randomUUID();
    const preflightUrl = new URL(testDatabaseUrl!); preflightUrl.username = preflightName; preflightUrl.password = password;
    const verifierUrl = new URL(testDatabaseUrl!); verifierUrl.username = verifierName; verifierUrl.password = verifierPassword;
    let restrictedPreflight: Pool | undefined; let restrictedVerifier: Pool | undefined;
    const r1 = `rel_launch_r1_${suffix}`; const r2 = `rel_launch_r2_${suffix}`; const r3 = `rel_launch_r3_${suffix}`;
    const published = async () => (await pool.query<{ id: string }>("SELECT id FROM data_releases WHERE status='published'")).rows[0]?.id;
    try {
      expect((await pool.query<{ table_name: string; column_name: string; is_nullable: string }>("SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND (table_name,column_name) IN (('election_authority_artifacts','receipt_id'),('election_geometry_attestations','receipt_id')) ORDER BY table_name")).rows).toEqual([
        { table_name: "election_authority_artifacts", column_name: "receipt_id", is_nullable: "NO" },
        { table_name: "election_geometry_attestations", column_name: "receipt_id", is_nullable: "YES" },
      ]);
      await seedLaunchR1(pool, r1);
      await promoteCandidateRelease(pool, r1);
      await pool.query(`CREATE ROLE "${preflightName}" LOGIN INHERIT PASSWORD '${password}'`);
      await pool.query(`GRANT dsa_seats_release_preflight TO "${preflightName}"`);
      await pool.query(`CREATE ROLE "${verifierName}" LOGIN INHERIT PASSWORD '${verifierPassword}'`);
      await pool.query(`GRANT dsa_seats_launch_verifier TO "${verifierName}"`);
      restrictedPreflight = new Pool({ connectionString: preflightUrl.toString() });
      restrictedVerifier = new Pool({ connectionString: verifierUrl.toString() });
      await cloneLaunchRelease(pool, r1, r2);
      const finance = await addFinanceEvidence(pool, r2);
      await expect(promoteCandidateRelease(pool, r2)).rejects.toThrow(/exact finance proof/i);
      expect(await published()).toBe(r1);
      await expect(restrictedPreflight.query("SELECT public.issue_release_preflight($1,'promote',$2,$3,$3,NULL,300)", [randomUUID(), r2, r1])).rejects.toThrow(/verifier attestation/i);
      await expect(restrictedPreflight.query("SELECT public.issue_launch_verifier_attestation($1,'promote',$2,$3,$3,'finance',$4,300)", [randomUUID(), r2, r1, "a".repeat(64)])).rejects.toMatchObject({ code: "42501" });
      await expect(restrictedVerifier.query("SELECT public.issue_release_preflight($1,'promote',$2,$3,$3,NULL,300)", [randomUUID(), r2, r1])).rejects.toMatchObject({ code: "42501" });
      const financePools = { launchVerifierPool: restrictedVerifier, preflightPool: restrictedPreflight, operatorPool: pool, launchEvidence: { kind: "finance" as const, proof: finance, resolver: fixtureResolver, verifier: fixtureVerifier, stores: fixtureStores } };
      const manualAttestation = randomUUID(); const financeCanonical = (await pool.query<{ canonical_sha256: string }>("SELECT canonical_sha256 FROM finance_publication_proofs WHERE release_id=$1 AND id=$2", [r2, finance.proofId])).rows[0]!.canonical_sha256;
      await restrictedVerifier.query("SELECT public.issue_launch_verifier_attestation($1,'promote',$2,$3,$3,'finance',$4,300)", [manualAttestation, r2, r1, financeCanonical]);
      await expect(pool.query("UPDATE finance_coverage_closures SET status=status WHERE release_id=$1 AND seat_cycle_id=(SELECT min(seat_cycle_id) FROM finance_coverage_closures WHERE release_id=$1)", [r2])).rejects.toMatchObject({ code: "55000" });
      expect(Object.values((await pool.query<Record<string, string>>("SELECT run_ids_fingerprint,map_receipts_fingerprint,manifest_fingerprint,gate_fingerprint,digest_fingerprint,operational_evidence_fingerprint FROM release_launch_verifier_attestations WHERE id=$1", [manualAttestation])).rows[0]!).every(value => /^[a-f0-9]{64}$/.test(value))).toBe(true);
      await pool.query("UPDATE release_launch_verifier_attestations SET consumed_at=clock_timestamp() WHERE id=$1", [manualAttestation]);
      const financeDigest = (await pool.query<{ sha256: string }>("SELECT sha256 FROM release_content_digests WHERE release_id=$1 AND domain='finance'", [r2])).rows[0]!.sha256;
      await pool.query("UPDATE release_content_digests SET sha256=$2 WHERE release_id=$1 AND domain='finance'", [r2, "f".repeat(64)]);
      await expect(promoteCandidateRelease(pool, r2, 3, undefined, undefined, financePools)).rejects.toBeDefined();
      expect(await published()).toBe(r1);
      await pool.query("UPDATE release_content_digests SET sha256=$2 WHERE release_id=$1 AND domain='finance'", [r2, financeDigest]);
      await promoteCandidateRelease(pool, r2, 3, undefined, undefined, financePools);
      expect(await published()).toBe(r2);
      const issued = (await pool.query<{ operational_evidence_fingerprint: string; launch_attestation_id: string | null }>("SELECT operational_evidence_fingerprint,launch_attestation_id FROM release_preflight_proofs WHERE target_release_id=$1 ORDER BY issued_at DESC LIMIT 1", [r2])).rows[0];
      expect(issued?.operational_evidence_fingerprint).not.toBe("0".repeat(64));
      expect(issued?.launch_attestation_id).not.toBeNull();
      expect((await pool.query<{ consumed_at: Date | null }>("SELECT consumed_at FROM release_launch_verifier_attestations WHERE id=$1", [issued!.launch_attestation_id])).rows[0]?.consumed_at).not.toBeNull();
      const repeated = `rel_launch_repeated_finance_${suffix}`; await cloneLaunchRelease(pool, r2, repeated);
      await pool.query("INSERT INTO reviewer_signatures(release_id,review_id,subject_type,subject_sha256,reviewer_id,signed_at,signature,key_id) VALUES($1,'repeated-publication','publication',$2,'approver',clock_timestamp(),'fixture-publication','release-key')", [repeated, "a".repeat(64)]);
      await pool.query("INSERT INTO finance_publication_proofs(release_id,id,canonical_sha256,signed_review_id,created_at) VALUES($1,'repeated-proof',$2,'repeated-publication',clock_timestamp())", [repeated, "a".repeat(64)]);
      await validateNationwideCandidateRelease(pool, repeated);
      await expect(promoteCandidateRelease(pool, repeated, 3, undefined, undefined, { ...financePools, launchEvidence: { ...financePools.launchEvidence, proof: { ...finance, releaseId: repeated, proofId: "repeated-proof" } } })).rejects.toThrow(/proofless R1/i);
      expect(await published()).toBe(r2);
      await rollbackPublishedRelease(pool);
      await rollForwardRetiredRelease(pool, r2, 3, undefined, undefined, financePools);

      await cloneLaunchRelease(pool, r2, r3);
      const election = await addElectionEvidence(pool, r3);
      await expect(promoteCandidateRelease(pool, r3)).rejects.toThrow(/exact election proof/i);
      expect(await published()).toBe(r2);
      const electionPools = { launchVerifierPool: restrictedVerifier, preflightPool: restrictedPreflight, operatorPool: pool, launchEvidence: { kind: "election" as const, proof: election, resolver: fixtureResolver, verifier: fixtureVerifier, stores: fixtureStores } };
      const inherited = (await pool.query<{ seat_cycle_id: string; kind: string; status: string }>("SELECT seat_cycle_id,kind,status FROM finance_coverage_closures WHERE release_id=$1 AND kind<>'summary' ORDER BY seat_cycle_id COLLATE \"C\",kind COLLATE \"C\" LIMIT 1", [r3])).rows[0]!;
      await pool.query("UPDATE finance_coverage_closures SET status=CASE status WHEN 'complete' THEN 'not_collected' ELSE 'complete' END WHERE release_id=$1 AND seat_cycle_id=$2 AND kind=$3", [r3, inherited.seat_cycle_id, inherited.kind]);
      await expect(promoteCandidateRelease(pool, r3, 3, undefined, undefined, electionPools)).rejects.toBeDefined();
      expect(await published()).toBe(r2);
      await pool.query("UPDATE finance_coverage_closures SET status=$4 WHERE release_id=$1 AND seat_cycle_id=$2 AND kind=$3", [r3, inherited.seat_cycle_id, inherited.kind, inherited.status]);
      await validateNationwideCandidateRelease(pool, r3);
      await promoteCandidateRelease(pool, r3, 3, undefined, undefined, electionPools);
      expect(await published()).toBe(r3);
      await rollbackPublishedRelease(pool);
      await rollForwardRetiredRelease(pool, r3, 3, undefined, undefined, electionPools);

      await expect(pool.query("UPDATE finance_publication_proofs SET created_at=created_at WHERE release_id=$1", [r2])).rejects.toMatchObject({ code: "55000" });
      await expect(pool.query("DELETE FROM reviewer_signatures WHERE release_id=$1", [r3])).rejects.toMatchObject({ code: "55000" });
    } finally { await restrictedPreflight?.end(); await restrictedVerifier?.end(); await pool.query(`DROP ROLE IF EXISTS "${preflightName}"`).catch(() => undefined); await pool.query(`DROP ROLE IF EXISTS "${verifierName}"`).catch(() => undefined); await pool.end(); }
  }, 180_000);

  it("publishes only the exact same-cutoff factual member successor before finance", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const preflightName = `dsa_factual_preflight_${suffix}`;
    const verifierName = `dsa_factual_verifier_${suffix}`;
    const finalizerName = `dsa_factual_finalizer_${suffix}`;
    const password = randomUUID();
    const preflightUrl = new URL(testDatabaseUrl!);
    preflightUrl.username = preflightName;
    preflightUrl.password = password;
    const verifierUrl = new URL(testDatabaseUrl!);
    verifierUrl.username = verifierName;
    verifierUrl.password = password;
    const finalizerUrl = new URL(testDatabaseUrl!);
    finalizerUrl.username = finalizerName;
    finalizerUrl.password = password;
    let preflight: Pool | undefined;
    let verifier: Pool | undefined;
    let finalizer: Pool | undefined;
    const r1 = `rel_launch_factual_r1_${suffix}`;
    const member = `rel_launch_member_${suffix}`;
    const unchanged = `rel_launch_unchanged_${suffix}`;
    try {
      await seedLaunchR1(pool, r1, { memberFacts: false });
      await promoteCandidateRelease(pool, r1);
      await pool.query(`CREATE ROLE "${preflightName}" LOGIN INHERIT PASSWORD '${password}'`);
      await pool.query(`GRANT dsa_seats_release_preflight TO "${preflightName}"`);
      await pool.query(`CREATE ROLE "${verifierName}" LOGIN INHERIT PASSWORD '${password}'`);
      await pool.query(`GRANT dsa_seats_launch_verifier TO "${verifierName}"`);
      await pool.query(`CREATE ROLE "${finalizerName}" LOGIN INHERIT PASSWORD '${password}'`);
      await pool.query(`GRANT dsa_seats_nationwide_finalizer TO "${finalizerName}"`);
      preflight = new Pool({ connectionString: preflightUrl.toString() });
      verifier = new Pool({ connectionString: verifierUrl.toString() });
      finalizer = new Pool({ connectionString: finalizerUrl.toString() });
      const factualPools = { launchVerifierPool: verifier, preflightPool: preflight, operatorPool: pool };
      await finalizer.query(
        "INSERT INTO data_releases(id,label,status,source_cutoff,created_at,previous_release_id) SELECT $1,'Factual member successor','candidate',source_cutoff,clock_timestamp(),id FROM data_releases WHERE id=$2",
        [member, r1],
      );
      await enrichCandidateMembersFromBaseline(finalizer, r1, member);
      await expect(finalizer.query("SELECT public.lifecycle_promote_candidate('x','y','z','z',NULL)")).rejects.toMatchObject({ code: "42501" });
      await expect(promoteCandidateRelease(pool, member, 3, undefined, undefined, factualPools)).resolves.toBeUndefined();
      expect((await pool.query<{ id: string }>("SELECT id FROM data_releases WHERE status='published'")).rows[0]?.id).toBe(member);
      await expect(rollbackPublishedRelease(pool, 3, { preflightPool: preflight, operatorPool: pool })).resolves.toEqual({ publishedReleaseId: r1, retiredReleaseId: member });
      await expect(rollForwardRetiredRelease(pool, member, 3, undefined, undefined, factualPools)).resolves.toEqual({ publishedReleaseId: member, retiredReleaseId: r1 });

      await cloneLaunchRelease(pool, member, unchanged);
      await validateNationwideCandidateRelease(pool, unchanged);
      await expect(promoteCandidateRelease(pool, unchanged, 3, undefined, undefined, factualPools)).rejects.toThrow(/invalid or missing launch publication stage/);
      expect((await pool.query<{ id: string }>("SELECT id FROM data_releases WHERE status='published'")).rows[0]?.id).toBe(member);
    } finally {
      await preflight?.end();
      await verifier?.end();
      await finalizer?.end();
      await pool.query(`DROP ROLE IF EXISTS "${preflightName}"`).catch(() => undefined);
      await pool.query(`DROP ROLE IF EXISTS "${verifierName}"`).catch(() => undefined);
      await pool.query(`DROP ROLE IF EXISTS "${finalizerName}"`).catch(() => undefined);
      await pool.end();
    }
  }, 120_000);

  it("uses split Task10 LOGIN principals for lifecycle capabilities and RLS", async () => {
    const ownerPool = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const principals = {
      web: { name: `dsa_task10_web_${suffix}`, role: "dsa_seats_web" },
      ingest: { name: `dsa_task10_ingest_${suffix}`, role: "dsa_seats_ingest" },
      preflight: { name: `dsa_task10_preflight_${suffix}`, role: "dsa_seats_release_preflight" },
      operator: { name: `dsa_task10_operator_${suffix}`, role: "dsa_seats_release_operator" },
    } as const;
    const password = randomUUID();
    const pools: Pool[] = [];
    const loginUrl = (name: string): string => {
      const url = new URL(testDatabaseUrl!);
      url.username = name;
      url.password = password;
      return url.toString();
    };
    try {
      const capability = await ownerPool.query<{ permitted: boolean }>("SELECT rolsuper OR rolcreaterole AS permitted FROM pg_roles WHERE rolname=current_user");
      expect(capability.rows[0]?.permitted).toBe(true);
      for (const principal of Object.values(principals)) {
        await ownerPool.query(`CREATE ROLE "${principal.name}" LOGIN INHERIT PASSWORD '${password}'`);
        await ownerPool.query(`GRANT ${principal.role} TO "${principal.name}"`);
        const memberships = await ownerPool.query<{ role: string }>("SELECT granted.rolname AS role FROM pg_auth_members membership JOIN pg_roles member ON member.oid=membership.member JOIN pg_roles granted ON granted.oid=membership.roleid WHERE member.rolname=$1 ORDER BY granted.rolname", [principal.name]);
        expect(memberships.rows.map((row) => row.role)).toEqual([principal.role]);
      }
      const webPool = new Pool({ connectionString: loginUrl(principals.web.name) });
      const ingestPool = new Pool({ connectionString: loginUrl(principals.ingest.name) });
      const preflightPool = new Pool({ connectionString: loginUrl(principals.preflight.name) });
      const operatorPool = new Pool({ connectionString: loginUrl(principals.operator.name) });
      pools.push(webPool, ingestPool, preflightPool, operatorPool);

      const v1 = candidate(`rel_task10_v1_${suffix}`);
      await seedPrototypeManifest(ownerPool, v1, boundariesFor(v1));
      await promoteCandidateRelease(ownerPool, v1.release.id, 3, undefined, undefined, { preflightPool, operatorPool });

      const v2 = candidate(`rel_task10_v2_${suffix}`);
      v2.release = { ...v2.release, previousReleaseId: v1.release.id };
      v2.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(v2);
      await seedPrototypeManifest(ownerPool, v2, boundariesFor(v2));

      expect((await webPool.query<{ id: string }>("SELECT id FROM data_releases ORDER BY id")).rows.map((row) => row.id)).toEqual([v1.release.id]);
      await expect(webPool.query("SELECT * FROM map_artifact_receipts")).rejects.toMatchObject({ code: "42501" });
      await expect(webPool.query("SELECT * FROM finance_launch_receipts")).rejects.toMatchObject({ code: "42501" });
      await expect(preflightPool.query("SELECT * FROM finance_launch_receipts")).resolves.toMatchObject({ rows: [] });
      await expect(ingestPool.query("UPDATE sources SET name=name WHERE release_id=$1", [v2.release.id])).resolves.toMatchObject({ rowCount: 1 });
      await expect(ingestPool.query("SELECT public.lifecycle_rollback('x','y')")).rejects.toMatchObject({ code: "42501" });
      expect((await operatorPool.query<{ permitted: boolean }>("SELECT has_function_privilege(current_user,'public.lifecycle_promote_candidate(text,text,text,text,text[])','EXECUTE') AS permitted")).rows[0]?.permitted).toBe(true);
      await expect(operatorPool.query("UPDATE data_releases SET label=label WHERE id=$1", [v1.release.id])).rejects.toMatchObject({ code: "42501" });

      await promoteCandidateRelease(ownerPool, v2.release.id, 3, undefined, undefined, { preflightPool, operatorPool });
      expect((await webPool.query<{ id: string }>("SELECT id FROM data_releases ORDER BY id")).rows.map((row) => row.id)).toEqual([v1.release.id, v2.release.id]);
      const proof = await ownerPool.query<{ id: string; consumed_at: Date | null }>("SELECT id,consumed_at FROM release_preflight_proofs WHERE target_release_id=$1 AND operation='promote' ORDER BY issued_at DESC LIMIT 1", [v2.release.id]);
      expect(proof.rows[0]?.consumed_at).not.toBeNull();

      await expect(rollbackPublishedRelease(ownerPool, 3, { preflightPool, operatorPool })).resolves.toEqual({ publishedReleaseId: v1.release.id, retiredReleaseId: v2.release.id });
      expect((await ownerPool.query<{ count: number }>("SELECT count(*)::int AS count FROM release_preflight_proofs WHERE consumed_at IS NULL")).rows[0]?.count).toBe(0);
      await expect(operatorPool.query("SELECT public.lifecycle_promote_candidate($1,$2,$3,$3,NULL)", [proof.rows[0]!.id, v2.release.id, v1.release.id])).rejects.toBeDefined();
      expect((await webPool.query<{ id: string }>("SELECT id FROM data_releases WHERE status='published'")).rows.map((row) => row.id)).toEqual([v1.release.id]);
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
      for (const principal of Object.values(principals)) await ownerPool.query(`DROP ROLE IF EXISTS "${principal.name}"`).catch(() => undefined);
      await ownerPool.end();
    }
  });

  it("rejects a candidate writer unblocked after a committed Task10 preflight proof", async () => {
    const ownerPool = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const principals = {
      ingest: { name: `dsa_task10_race_ingest_${suffix}`, role: "dsa_seats_ingest" },
      preflight: { name: `dsa_task10_race_preflight_${suffix}`, role: "dsa_seats_release_preflight" },
    } as const;
    const password = randomUUID();
    const loginUrl = (name: string): string => {
      const url = new URL(testDatabaseUrl!);
      url.username = name;
      url.password = password;
      return url.toString();
    };
    const pools: Pool[] = [];
    let writer: PoolClient | undefined;
    let preflight: PoolClient | undefined;
    try {
      const capability = await ownerPool.query<{ permitted: boolean }>("SELECT rolsuper OR rolcreaterole AS permitted FROM pg_roles WHERE rolname=current_user");
      expect(capability.rows[0]?.permitted).toBe(true);
      for (const principal of Object.values(principals)) {
        await ownerPool.query(`CREATE ROLE "${principal.name}" LOGIN INHERIT PASSWORD '${password}'`);
        await ownerPool.query(`GRANT ${principal.role} TO "${principal.name}"`);
      }
      const ingestPool = new Pool({ connectionString: loginUrl(principals.ingest.name) });
      const preflightPool = new Pool({ connectionString: loginUrl(principals.preflight.name) });
      pools.push(ingestPool, preflightPool);

      const manifest = candidate(`rel_task10_race_${suffix}`);
      await seedPrototypeManifest(ownerPool, manifest, boundariesFor(manifest));
      const originalName = manifest.sources[0]!.name;

      preflight = await preflightPool.connect();
      await preflight.query("BEGIN");
      await preflight.query("SELECT pg_advisory_xact_lock(hashtext('dsa_seats_release:' || $1))", [manifest.release.id]);

      writer = await ingestPool.connect();
      const writerPid = (await writer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      await writer.query("BEGIN");
      const mutation = writer.query("UPDATE sources SET name='race mutation' WHERE release_id=$1", [manifest.release.id]);
      // It may reject before COMMIT resolves on the other connection; assert it below.
      void mutation.catch(() => undefined);
      await waitForWriterToBlockOnAdvisoryLock(ownerPool, writerPid);

      await preflight.query("SELECT public.issue_release_preflight($1,'promote',$2,NULL,NULL,NULL,300)", [randomUUID(), manifest.release.id]);
      await preflight.query("COMMIT");
      await expect(mutation).rejects.toMatchObject({ code: "55000", message: expect.stringMatching(/candidate content is frozen by live publication verification/i) });
      await writer.query("ROLLBACK");
      expect((await ownerPool.query<{ name: string }>("SELECT name FROM sources WHERE release_id=$1", [manifest.release.id])).rows[0]?.name).toBe(originalName);
      expect((await ownerPool.query<{ count: number }>("SELECT count(*)::int AS count FROM release_preflight_proofs WHERE target_release_id=$1 AND consumed_at IS NULL", [manifest.release.id])).rows[0]?.count).toBe(1);
    } finally {
      await writer?.query("ROLLBACK").catch(() => undefined);
      writer?.release();
      await preflight?.query("ROLLBACK").catch(() => undefined);
      preflight?.release();
      await Promise.all(pools.map((pool) => pool.end()));
      for (const principal of Object.values(principals)) await ownerPool.query(`DROP ROLE IF EXISTS "${principal.name}"`).catch(() => undefined);
      await ownerPool.end();
    }
  });

  it("runs the guarded synthetic release drill with six disposable LOGIN principals", async () => {
    const bootstrap = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, ""); const password = randomUUID();
    const principals = { owner: "dsa_drill_owner_", ingest: "dsa_drill_ingest_", finalizer: "dsa_drill_finalizer_", preflight: "dsa_drill_preflight_", operator: "dsa_drill_operator_", web: "dsa_drill_web_" } as const;
    const names = Object.fromEntries(Object.entries(principals).map(([key, prefix]) => [key, `${prefix}${suffix}`])) as Record<keyof typeof principals, string>;
    const memberships = { owner: "dsa_seats_migration_owner", ingest: "dsa_seats_ingest", finalizer: "dsa_seats_nationwide_finalizer", preflight: "dsa_seats_release_preflight", operator: "dsa_seats_release_operator", web: "dsa_seats_web" } as const;
    const url = (name: string) => { const value = new URL(testDatabaseUrl!); value.username = name; value.password = password; return value.toString(); };
    try {
      for (const key of Object.keys(names) as (keyof typeof names)[]) { await bootstrap.query(`CREATE ROLE "${names[key]}" LOGIN INHERIT PASSWORD '${password}'`); await bootstrap.query(`GRANT ${memberships[key]} TO "${names[key]}"`); }
      const result = await runSyntheticReleaseDrill({ owner: url(names.owner), ingest: url(names.ingest), finalizer: url(names.finalizer), preflight: url(names.preflight), operator: url(names.operator), web: url(names.web) }, 120_000);
      expect(result).toMatchObject({ evidenceClass: "local-synthetic", evidenceVersion: 2, verified: true, completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), publishedReleaseId: expect.stringMatching(/^rel_drill_r3_/), publicSmokes: 3, operationalSignals: 21, checks: { roleAttestations: true, stalePromotionRejected: true, writerFreezeRejected: true, expiredProofRejected: true, domainInvalidations: ["member", "acs", "finance", "elections", "maps"], immutableFingerprintPreserved: true, rollbackPreserved: true, rollForwardPreserved: true, rollbackPublicSmoke: true, rollForwardPublicSmoke: true, operationalSignalsObserved: true, digestRows: 21, ingestHistoryRows: 1 } });
       const preflightPool = new Pool({ connectionString: url(names.preflight) });
       try {
         const report = await inspectReleaseHealth(preflightPool, result.publishedReleaseId, { rollbackDrill: result });
         expect(report.repositoryStatus).toBe("pass");
         expect(report.productionReadinessStatus).not.toBe("pass");
         expect(report.status).not.toBe("pass");
         expect(report.databaseClass).toBe("test");
         for (const name of ["preflight_access", "validation_gate", "repository_smokes", "rollback_drill"] as const) expect(report.checks.find((check) => check.name === name)?.status, `${name} (drill duration ${result.durationMs}ms)`).toBe("pass");
         expect(report.checks.find((check) => check.name === "production_telemetry")).toMatchObject({ status: "not_run", evidence: { status: "not_observed" } });
         expect(JSON.stringify(report)).not.toMatch(/password|session_user|membership|rolname|locator|raw_object/i);
       } finally { await preflightPool.end(); }
    } finally { await bootstrap.query("TRUNCATE data_releases CASCADE"); for (const name of Object.values(names)) await bootstrap.query(`DROP ROLE IF EXISTS "${name}"`).catch(() => undefined); await bootstrap.end(); }
  }, 420_000);

  it("enforces the structural FEC V2 publication capability boundary without claiming TS verifier completeness", async () => {
    const owner = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const password = randomUUID();
    const roles = {
      acquisition: "dsa_seats_fec_v2_acquisition",
      publisher: "dsa_seats_fec_v2_publisher",
      verifier: "dsa_seats_launch_verifier",
      preflight: "dsa_seats_release_preflight",
      operator: "dsa_seats_release_operator",
    } as const;
    const names = Object.fromEntries(Object.keys(roles).map(key => [key, `dsa_f2b_${key}_${suffix}`])) as Record<keyof typeof roles | "dual", string>;
    names.dual = `dsa_f2b_dual_${suffix}`;
    const loginUrl = (name: string) => { const url = new URL(testDatabaseUrl!); url.username = name; url.password = password; return url.toString(); };
    const pools: Pool[] = [];
    const r1 = `rel_f2b_r1_${suffix}`, r2 = `rel_f2b_r2_${suffix}`;
    const sourceLock = "a".repeat(64), payloadHash = "b".repeat(64), fingerprint = "c".repeat(64), provisionalPlan = "d".repeat(64);
    try {
      await seedLaunchR1(owner, r1);
      await promoteCandidateRelease(owner, r1);
      await cloneLaunchRelease(owner, r1, r2);
      // This test intentionally builds only the SQL-admissible publication
      // shape. It does not assert that this minimal graph passes the exclusive
      // TypeScript V2 verifier, which owns completeness before these APIs.
      await owner.query("DELETE FROM map_artifacts WHERE release_id=$1", [r2]);
      for (const [key, role] of Object.entries(roles)) {
        await owner.query(`CREATE ROLE "${names[key as keyof typeof roles]}" LOGIN INHERIT PASSWORD '${password}'`);
        await owner.query(`GRANT ${role} TO "${names[key as keyof typeof roles]}"`);
      }
      await owner.query(`CREATE ROLE "${names.dual}" LOGIN INHERIT PASSWORD '${password}'`);
      await owner.query(`GRANT dsa_seats_fec_v2_publisher,dsa_seats_launch_verifier TO "${names.dual}"`);
      // The public lifecycle entrypoint normally consumes this internally; grant
      // this disposable operator the lower-level capability to exercise its
      // exclusive-consumer guard directly.
      await owner.query(`GRANT EXECUTE ON FUNCTION public.consume_release_preflight(text,text,text,text,text,text[]) TO "${names.operator}"`);
      const loginPools = Object.fromEntries(Object.keys(names).map(key => [key, new Pool({ connectionString: loginUrl(names[key as keyof typeof names]) })])) as Record<keyof typeof names, Pool>;
      pools.push(...Object.values(loginPools));

      const seats = (await owner.query<{ id: string }>("SELECT seat_cycle_id AS id FROM release_profile_seats WHERE release_id=$1 ORDER BY seat_cycle_id COLLATE \"C\"", [r2])).rows;
      expect(seats).toHaveLength(541);
      await owner.query("INSERT INTO fec_v2_plans(release_id,plan_sha256,origin_release_id,receipt_cutoff,campaign_cycle,source_lock_sha256,target_universe_sha256,canonical_sha256) VALUES($1,$2,$1,'2026-07-18',2026,$3,$3,$3)", [r2, provisionalPlan, sourceLock]);
      await owner.query("INSERT INTO fec_v2_plan_targets(release_id,plan_sha256,seat_cycle_id,kind,disposition,evidence_sha256) SELECT $1,$2,seat_cycle_id,'candidate_resolution_required',NULL,NULL FROM release_profile_seats WHERE release_id=$1", [r2, provisionalPlan]);
      const targetHash = (await owner.query<{ sha256: string }>("SELECT encode(digest(convert_to(public.fec_v2_target_universe_bytes($1,$2),'UTF8'),'sha256'),'hex') AS sha256", [r2, provisionalPlan])).rows[0]!.sha256;
      await owner.query("UPDATE fec_v2_plans SET target_universe_sha256=$3 WHERE release_id=$1 AND plan_sha256=$2", [r2, provisionalPlan, targetHash]);
      const planHash = (await owner.query<{ sha256: string }>("SELECT encode(digest(convert_to(public.fec_v2_plan_bytes($1,$2),'UTF8'),'sha256'),'hex') AS sha256", [r2, provisionalPlan])).rows[0]!.sha256;
      await owner.query("DELETE FROM fec_v2_plan_targets WHERE release_id=$1 AND plan_sha256=$2", [r2, provisionalPlan]);
      await owner.query("UPDATE fec_v2_plans SET plan_sha256=$3,canonical_sha256=$3 WHERE release_id=$1 AND plan_sha256=$2", [r2, provisionalPlan, planHash]);
      await owner.query("INSERT INTO fec_v2_plan_targets(release_id,plan_sha256,seat_cycle_id,kind,disposition,evidence_sha256) SELECT $1,$2,seat_cycle_id,'candidate_resolution_required',NULL,NULL FROM release_profile_seats WHERE release_id=$1", [r2, planHash]);
      await owner.query("SELECT public.seal_fec_v2_plan($1,$2)", [r2, planHash]);
      await owner.query("INSERT INTO finance_proof_routes(release_id,route,plan_sha256) VALUES($1,'fec_v2_exact_election',$2)", [r2, planHash]);
      const signedAt = (await owner.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0]!.at;
      await expect(loginPools.dual.query("SELECT public.import_fec_v2_publication_signature('dual',$1,$2,$3,'publisher','key',$4,$5,'signature')", [r2, planHash, payloadHash, fingerprint, signedAt])).rejects.toMatchObject({ code: "42501" });
      await loginPools.publisher.query("SELECT public.import_fec_v2_publication_signature('publication',$1,$2,$3,'publisher','key',$4,$5,'signature')", [r2, planHash, payloadHash, fingerprint, signedAt]);
      const proofAt = (await owner.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0]!.at;
      await loginPools.publisher.query("SELECT public.import_fec_v2_publication_proof('proof',$1,'publication',$2,$3)", [r2, payloadHash, proofAt]);
      const finalized = (await loadNationwideManifestForFinalization(owner, r2)).manifest;
      finalized.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(finalized);
      const geometry = (await owner.query<{ geometry_checksum_sha256: string }>("SELECT geometry_checksum_sha256 FROM release_manifests WHERE release_id=$1", [r2])).rows[0]!.geometry_checksum_sha256;
      await owner.query("UPDATE release_manifests SET canonical_data_checksum_sha256=$2,content_checksum_sha256=$3,validated_at=NULL WHERE release_id=$1", [r2, finalized.canonicalDataChecksumSha256, expectedContentChecksum({ schema_version: 2, canonical_data_checksum_sha256: finalized.canonicalDataChecksumSha256, geometry_checksum_sha256: geometry, content_checksum_sha256: "" })]);
      await validateNationwideCandidateRelease(owner, r2);

      const combinedHash = fecV2CombinedStageSha256(r2, "finance", payloadHash, null, null);
      await expect(loginPools.dual.query("SELECT public.issue_launch_verifier_attestation($1,'promote',$2,$3,$3,'fec_v2_finance',$4,300)", [randomUUID(), r2, r1, combinedHash])).rejects.toMatchObject({ code: "42501" });
      await expect(loginPools.verifier.query("SELECT public.issue_launch_verifier_attestation($1,'promote',$2,$3,$3,'fec_v2_finance',$4,300)", [randomUUID(), r2, r1, "e".repeat(64)])).rejects.toBeDefined();
      await expect(loginPools.verifier.query("SELECT public.issue_launch_verifier_attestation($1,'promote',$2,$3,$3,'fec_v2_election',$4,300)", [randomUUID(), r2, r1, combinedHash])).rejects.toBeDefined();
      const attestationId = randomUUID();
      await loginPools.verifier.query("SELECT public.issue_launch_verifier_attestation($1,'promote',$2,$3,$3,'fec_v2_finance',$4,300)", [attestationId, r2, r1, combinedHash]);
      await expect(owner.query("UPDATE fec_v2_plan_targets SET disposition='vacant' WHERE release_id=$1 AND plan_sha256=$2 AND seat_cycle_id=$3", [r2, planHash, seats[0]!.id])).rejects.toMatchObject({ code: "55000" });

      const preflightId = randomUUID();
      await loginPools.preflight.query("SELECT public.issue_release_preflight($1,'promote',$2,$3,$3,NULL,300)", [preflightId, r2, r1]);
      await expect(owner.query("UPDATE fec_v2_publication_proofs SET created_at=created_at WHERE release_id=$1", [r2])).rejects.toMatchObject({ code: "55000" });
      await loginPools.operator.query("SELECT public.consume_release_preflight($1,'promote',$2,$3,$3,NULL)", [preflightId, r2, r1]);
      expect((await owner.query<{ attestation: Date | null; preflight: Date | null }>("SELECT a.consumed_at AS attestation,p.consumed_at AS preflight FROM release_launch_verifier_attestations a JOIN release_preflight_proofs p ON p.launch_attestation_id=a.id WHERE a.id=$1 AND p.id=$2", [attestationId, preflightId])).rows[0]).toMatchObject({ attestation: expect.any(Date), preflight: expect.any(Date) });
    } finally {
      await Promise.all(pools.map(pool => pool.end()));
      for (const name of Object.values(names)) await owner.query(`DROP ROLE IF EXISTS "${name}"`).catch(() => undefined);
      await owner.query("TRUNCATE data_releases CASCADE").catch(() => undefined);
      await owner.end();
    }
  }, 180_000);

  it("enforces the Phase 2A FEC-v2 seals, finalization, signer, route, and acquisition boundaries", async () => {
    const owner = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const password = randomUUID();
    const roles = {
      acquisition: "dsa_seats_fec_v2_acquisition",
      reviewer: "dsa_seats_fec_v2_data_reviewer",
      publisher: "dsa_seats_fec_v2_publisher",
      preflight: "dsa_seats_release_preflight",
    } as const;
    const names = Object.fromEntries(Object.keys(roles).map(key => [key, `dsa_f2_${key}_${suffix}`])) as Record<keyof typeof roles, string>;
    const loginUrl = (name: string) => { const url = new URL(testDatabaseUrl!); url.username = name; url.password = password; return url.toString(); };
    const hash = "a".repeat(64);
    const releaseId = `rel_f2_${suffix}`;
    const plan0 = "b".repeat(64);
    const publicLoginName = `dsa_f2_public_${suffix}`;
    let acquisition: Pool | undefined; let reviewer: Pool | undefined; let publisher: Pool | undefined; let preflight: Pool | undefined; let publicLogin: Pool | undefined;
    try {
      const { manifest: fixture, bundle } = persistedNationwideSkeleton();
      const fixtureReleaseId = fixture.release.id;
      const rebindRelease = (value: unknown, targetReleaseId: string): void => {
        if (Array.isArray(value)) value.forEach(item => rebindRelease(item, targetReleaseId));
        else if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          if (record.releaseId === fixtureReleaseId) record.releaseId = targetReleaseId;
          Object.values(record).forEach(value => rebindRelease(value, targetReleaseId));
        }
      };
      const predecessorId = `rel_f2_r1_${suffix}`;
      const predecessor = structuredClone(fixture);
      rebindRelease(predecessor, predecessorId);
      predecessor.release = { ...predecessor.release, id: predecessorId as never, status: "candidate", publishedAt: null, previousReleaseId: null };
      predecessor.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(predecessor);
      await seedNationwideCandidateManifest(owner, predecessor, bundle);
      await validateNationwideCandidateRelease(owner, predecessorId);
      await owner.query("DELETE FROM map_artifacts WHERE release_id=$1", [predecessorId]);
      await owner.query("UPDATE contests SET election_date='2019-01-01' WHERE release_id=$1", [predecessorId]);
      await owner.query("DELETE FROM election_results WHERE release_id=$1", [predecessorId]);
      await owner.query("DELETE FROM election_decisions WHERE release_id=$1", [predecessorId]);
      await owner.query("DELETE FROM election_launch_receipts WHERE release_id=$1", [predecessorId]);
      await owner.query("UPDATE finance_aggregates SET cash_on_hand=NULL,receipts=NULL,disbursements=NULL WHERE release_id=$1", [predecessorId]);
      await owner.query("UPDATE seat_finance_summaries SET filing_id=NULL WHERE release_id=$1", [predecessorId]);
      await owner.query("DELETE FROM fec_filing_lineage WHERE release_id=$1", [predecessorId]);
      await owner.query("DELETE FROM finance_aggregate_inputs WHERE release_id=$1", [predecessorId]);
      await owner.query("DELETE FROM fec_filing_summaries WHERE release_id=$1", [predecessorId]);
      await owner.query("UPDATE funding_category_aggregates SET amount=NULL WHERE release_id=$1", [predecessorId]);
      await owner.query("UPDATE funding_organization_aggregates SET amount=NULL WHERE release_id=$1", [predecessorId]);
      await owner.query("UPDATE outside_spending_aggregates SET support_amount=NULL,oppose_amount=NULL WHERE release_id=$1", [predecessorId]);
      await owner.query("ALTER TABLE data_releases DISABLE TRIGGER USER");
      try { await owner.query("UPDATE data_releases SET status='published',published_at=clock_timestamp() WHERE id=$1", [predecessorId]); }
      finally { await owner.query("ALTER TABLE data_releases ENABLE TRIGGER USER"); }
      rebindRelease(fixture, releaseId);
      fixture.release = { ...fixture.release, id: releaseId as never, status: "candidate", publishedAt: null, previousReleaseId: predecessorId as never };
      fixture.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(fixture);
      await seedNationwideCandidateManifest(owner, fixture, bundle);
      await validateNationwideCandidateRelease(owner, releaseId);
      await owner.query("DELETE FROM map_artifacts WHERE release_id=$1", [releaseId]);
      await owner.query("UPDATE contests SET election_date='2019-01-01' WHERE release_id=$1", [releaseId]);
      await owner.query("DELETE FROM election_results WHERE release_id=$1", [releaseId]);
      await owner.query("DELETE FROM election_decisions WHERE release_id=$1", [releaseId]);
      await owner.query("DELETE FROM election_launch_receipts WHERE release_id=$1", [releaseId]);
      await owner.query("ALTER TABLE data_releases DISABLE TRIGGER USER");
      try { await owner.query("UPDATE data_releases SET source_cutoff='2026-07-18T00:00:00Z' WHERE id=$1", [releaseId]); }
      finally { await owner.query("ALTER TABLE data_releases ENABLE TRIGGER USER"); }
      for (const [key, role] of Object.entries(roles)) { await owner.query(`CREATE ROLE "${names[key as keyof typeof roles]}" LOGIN INHERIT PASSWORD '${password}'`); await owner.query(`GRANT ${role} TO "${names[key as keyof typeof roles]}"`); }
      await owner.query(`CREATE ROLE "${publicLoginName}" LOGIN PASSWORD '${password}'`);
      // Fixture setup is migration-owner work; acquisition receives only the
      // guarded run APIs below.
      await owner.query("SET ROLE dsa_seats_migration_owner");
      acquisition = new Pool({ connectionString: loginUrl(names.acquisition) }); reviewer = new Pool({ connectionString: loginUrl(names.reviewer) }); publisher = new Pool({ connectionString: loginUrl(names.publisher) }); preflight = new Pool({ connectionString: loginUrl(names.preflight) });
      expect((await acquisition.query<{ can_update: boolean }>("SELECT has_table_privilege(current_user,'public.fec_v2_runs','UPDATE') AS can_update")).rows[0]?.can_update).toBe(false);

      publicLogin = new Pool({ connectionString: loginUrl(publicLoginName) });
      const seats = (await owner.query<{ id: string }>("SELECT seat_cycle_id AS id FROM release_profile_seats WHERE release_id=$1 ORDER BY seat_cycle_id", [releaseId])).rows;
      expect(seats).toHaveLength(541);
      const source = { id: `src_fec_v2_${suffix}` };
      await owner.query("INSERT INTO sources(release_id,id,name,authority,homepage_url) VALUES($1,$2,'fec','official','https://api.open.fec.gov')", [releaseId, source.id]);
      await owner.query("INSERT INTO fec_v2_plans(release_id,plan_sha256,origin_release_id,receipt_cutoff,campaign_cycle,source_lock_sha256,target_universe_sha256,canonical_sha256) VALUES($1,$2,$1,'2026-07-18',2026,$3,$3,$3)", [releaseId, plan0, hash]);
      await owner.query("INSERT INTO fec_v2_plan_targets(release_id,plan_sha256,seat_cycle_id,kind,disposition,evidence_sha256) SELECT $1,$2,seat_cycle_id,CASE WHEN seat_cycle_id=$3 THEN 'terminal' ELSE 'candidate_resolution_required' END,CASE WHEN seat_cycle_id=$3 THEN 'vacant' ELSE NULL END,CASE WHEN seat_cycle_id=$3 THEN $4 ELSE NULL END FROM release_profile_seats WHERE release_id=$1", [releaseId, plan0, seats[1]!.id, hash]);
      const universe = (await owner.query<{ digest: string }>("SELECT encode(digest(convert_to(public.fec_v2_target_universe_bytes($1,$2),'UTF8'),'sha256'),'hex') digest", [releaseId, plan0])).rows[0]!.digest;
      await owner.query("UPDATE fec_v2_plans SET target_universe_sha256=$3 WHERE release_id=$1 AND plan_sha256=$2", [releaseId, plan0, universe]);
      const canonical = (await owner.query<{ digest: string }>("SELECT encode(digest(convert_to(public.fec_v2_plan_bytes($1,$2),'UTF8'),'sha256'),'hex') digest", [releaseId, plan0])).rows[0]!;
      await expect(publicLogin.query("SELECT public.fec_v2_target_universe_bytes($1,$2)", [releaseId, plan0])).rejects.toMatchObject({ code: "42501" });
      await expect(publicLogin.query("SELECT public.fec_v2_plan_bytes($1,$2)", [releaseId, plan0])).rejects.toMatchObject({ code: "42501" });
      await owner.query("DELETE FROM fec_v2_plan_targets WHERE release_id=$1 AND plan_sha256=$2", [releaseId, plan0]);
      await owner.query("UPDATE fec_v2_plans SET plan_sha256=$3,canonical_sha256=$3 WHERE release_id=$1 AND plan_sha256=$2", [releaseId, plan0, canonical.digest]);
      await owner.query("INSERT INTO fec_v2_plan_targets(release_id,plan_sha256,seat_cycle_id,kind,disposition,evidence_sha256) SELECT $1,$2,seat_cycle_id,CASE WHEN seat_cycle_id=$3 THEN 'terminal' ELSE 'candidate_resolution_required' END,CASE WHEN seat_cycle_id=$3 THEN 'vacant' ELSE NULL END,CASE WHEN seat_cycle_id=$3 THEN $4 ELSE NULL END FROM release_profile_seats WHERE release_id=$1", [releaseId, canonical.digest, seats[1]!.id, hash]);
      await owner.query("SELECT public.seal_fec_v2_plan($1,$2)", [releaseId, canonical.digest]);
      const token = "e".repeat(64), wrongToken = "f".repeat(64), run = `run_${suffix}`;
      await expect(owner.query("INSERT INTO fec_v2_runs(run_id,release_id,plan_sha256,receipt_cutoff,started_at,status,owner_token_sha256,heartbeat_at,lease_expires_at,run_deadline_at) VALUES($3,$1,$2,'2026-07-18',clock_timestamp(),'running','a',clock_timestamp(),clock_timestamp()+interval '5 minutes',clock_timestamp()+interval '6 hours')", [releaseId, canonical.digest, `direct_running_${suffix}`])).rejects.toMatchObject({ code: "42501" });
      await expect(owner.query("INSERT INTO fec_v2_runs(run_id,release_id,plan_sha256,receipt_cutoff,started_at,status,completed_at,run_deadline_at) VALUES($3,$1,$2,'2026-07-18',clock_timestamp(),'failed',clock_timestamp(),clock_timestamp()+interval '6 hours')", [releaseId, canonical.digest, `direct_terminal_${suffix}`])).rejects.toMatchObject({ code: "42501" });
      const maxRun = `a${"._:-".repeat(127)}bcd`;
      await acquisition.query("SELECT * FROM public.claim_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, maxRun, token]);
      await acquisition.query("SELECT public.abort_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, maxRun, token]);
      await expect(acquisition.query("SELECT * FROM public.claim_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, "a".repeat(513), token])).rejects.toMatchObject({ code: "22023" });
      await acquisition.query("SELECT * FROM public.claim_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, run, token]);
      await expect(owner.query("UPDATE fec_v2_runs SET status='failed',completed_at=clock_timestamp(),owner_token_sha256=NULL,heartbeat_at=NULL,lease_expires_at=NULL WHERE release_id=$1 AND plan_sha256=$2 AND run_id=$3", [releaseId, canonical.digest, run])).rejects.toMatchObject({ code: "42501" });
      await expect(acquisition.query("SELECT * FROM public.heartbeat_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, run, wrongToken])).rejects.toMatchObject({ code: "42501" });
      await acquisition.query("SELECT * FROM public.heartbeat_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, run, token]);
      const ledger = "a".repeat(64), identity = "b".repeat(64);
      await acquisition.query("SELECT public.stage_fec_v2_artifact($1,$2,$3,$4,$5,'filing_ledger',1,clock_timestamp())", [releaseId, canonical.digest, run, token, ledger]);
      await acquisition.query("SELECT public.stage_fec_v2_ledger_header($1,$2,$3,$4,$5,'filing_ledger',1,0,NULL)", [releaseId, canonical.digest, run, token, ledger]);
      await acquisition.query("SELECT public.stage_fec_v2_ledger_entry($1,$2,$3,$4,$5,1,$6,'F3','F3','Q1',NULL,'2026-07-18',NULL,NULL,NULL,NULL,NULL,'electronic','available')", [releaseId, canonical.digest, run, token, ledger, identity]);
      await expect(acquisition.query("SELECT public.stage_fec_v2_acquisition_outcome($1,$2,$3,$4,$5,1,$6,'accepted')", [releaseId, canonical.digest, run, wrongToken, "a".repeat(64), "b".repeat(64)])).rejects.toMatchObject({ code: "42501" });
      await acquisition.query("SELECT public.stage_fec_v2_acquisition_outcome($1,$2,$3,$4,$5,1,$6,'source_unavailable')", [releaseId, canonical.digest, run, token, ledger, identity]);
      await expect(acquisition.query("INSERT INTO stg_fec_v2_acquisition_outcomes VALUES($1,$2,$3,$4,2,$5,'accepted')", [releaseId, canonical.digest, run, "c".repeat(64), "d".repeat(64)])).rejects.toMatchObject({ code: "42501" });
      await expect(acquisition.query("SELECT public.fec_v2_owner_token_sha256($1)", [token])).rejects.toMatchObject({ code: "42501" });
      await acquisition.query("SELECT public.abort_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, run, token]);
      const expired = `expired_${suffix}`, reaped = `reaped_${suffix}`;
      await acquisition.query("SELECT * FROM public.claim_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, expired, token]);
      await acquisition.query("SELECT * FROM public.heartbeat_fec_v2_run($1,$2,$3,$4)", [releaseId, canonical.digest, expired, token]);
      await expect(acquisition.query("SELECT public.reap_expired_fec_v2_run($1,$2,$3,$4,$5)", [releaseId, canonical.digest, expired, reaped, token])).rejects.toMatchObject({ code: "55000" });
      // Synthetic expiry only: the owner disables the boundary briefly because
      // production deadlines and leases are deliberately immutable.
      await owner.query("ALTER TABLE fec_v2_runs DISABLE TRIGGER USER");
      try { await owner.query("UPDATE fec_v2_runs SET run_deadline_at=expired.at,lease_expires_at=expired.at FROM (SELECT clock_timestamp() AS at) expired WHERE release_id=$1 AND plan_sha256=$2 AND run_id=$3", [releaseId, canonical.digest, expired]); }
      finally { await owner.query("ALTER TABLE fec_v2_runs ENABLE TRIGGER USER"); }
      await acquisition.query("SELECT public.reap_expired_fec_v2_run($1,$2,$3,$4,$5)", [releaseId, canonical.digest, expired, reaped, token]);
      await acquisition.query("SELECT public.reap_expired_fec_v2_run($1,$2,$3,$4,$5)", [releaseId, canonical.digest, expired, reaped, token]);
      await expect(acquisition.query("SELECT public.reap_expired_fec_v2_run($1,$2,$3,$4,$5)", [releaseId, canonical.digest, expired, reaped, wrongToken])).rejects.toMatchObject({ code: "55000" });
      await expect(acquisition.query("SELECT public.reap_expired_fec_v2_run($1,$2,$3,$4,$5)", [releaseId, canonical.digest, expired, `other_${suffix}`, token])).rejects.toMatchObject({ code: "55000" });
      await owner.query(`GRANT dsa_seats_fec_v2_data_reviewer TO "${names.acquisition}"`);
      await expect(acquisition.query("SELECT public.read_fec_v2_run_status($1,$2,$3)", [releaseId, canonical.digest, `reaped_${suffix}`])).rejects.toMatchObject({ code: "42501" });
      await owner.query(`REVOKE dsa_seats_fec_v2_data_reviewer FROM "${names.acquisition}"`);
      await expect(owner.query("UPDATE data_releases SET status='published',published_at=clock_timestamp() WHERE id=$1", [releaseId])).rejects.toThrow(/V2 route requires exactly one matching V2 publication proof/);
      await expect(owner.query("UPDATE fec_v2_plans SET campaign_cycle=2025 WHERE release_id=$1 AND plan_sha256=$2", [releaseId, canonical.digest])).rejects.toMatchObject({ code: "55000" });
      await expect(owner.query("UPDATE fec_v2_plan_targets SET kind='terminal' WHERE release_id=$1 AND plan_sha256=$2 AND seat_cycle_id=$3", [releaseId, canonical.digest, seats[0]!.id])).rejects.toMatchObject({ code: "55000" });

      const snapshot = `snap_f2_${suffix}`; const artifact = "c".repeat(64);
      await owner.query("SELECT public.create_fec_v2_source_snapshot($1,$2,$3,$4,'2026-07-18T00:00:00Z',$5)", [releaseId, snapshot, source.id, "https://www.fec.gov/data/f2", hash]);
      expect((await owner.query<{ usage_status: string }>("SELECT usage_status FROM source_snapshots WHERE release_id=$1 AND id=$2", [releaseId, snapshot])).rows[0]?.usage_status).toBe("restricted");
      await owner.query("UPDATE source_snapshots SET usage_status='approved' WHERE release_id=$1 AND id=$2", [releaseId, snapshot]);
      await owner.query("INSERT INTO fec_v2_snapshot_metadata(release_id,snapshot_id,plan_sha256,origin_release_id,receipt_set_digest_sha256) VALUES($1,$2,$3,$1,$4)", [releaseId, snapshot, canonical.digest, hash]);
      await expect(acquisition.query("SELECT public.seal_fec_v2_snapshot($1,$2,$3)", [releaseId, canonical.digest, snapshot])).rejects.toMatchObject({ code: "42501" });
      await owner.query("INSERT INTO fec_v2_artifacts(release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,created_at) VALUES($1,$2,$3,'enumeration_page',1,clock_timestamp())", [releaseId, canonical.digest, artifact]);
      await owner.query("INSERT INTO fec_v2_artifact_receipts(receipt_id,release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,upstream_entity_sha256,object_key,version_id,etag,byte_size,retrieved_at,snapshot_id) VALUES('receipt',$1,$2,$3,'enumeration_page',1,$4,$5,'v1','e1',1,'2026-07-18T00:00:00Z',$6)", [releaseId, canonical.digest, artifact, hash, `f2/${artifact}.json`, snapshot]);
      const digest = (await owner.query<{ digest: string }>("SELECT encode(digest(convert_to('{\"schemaVersion\":2,\"acquisitionPlanSha256\":'||to_json($1::text)::text||',\"snapshotId\":'||to_json($2::text)::text||',\"receipts\":[{\"receiptId\":\"receipt\",\"artifactKind\":\"enumeration_page\",\"artifactSha256\":'||to_json($3::text)::text||',\"upstreamEntitySha256\":'||to_json($4::text)::text||',\"objectKey\":'||to_json($5::text)::text||',\"versionId\":\"v1\",\"etag\":\"e1\",\"byteSize\":\"1\",\"retrievedAt\":\"2026-07-18T00:00:00.000Z\"}]}\n','UTF8'),'sha256'),'hex') digest", [canonical.digest, snapshot, artifact, hash, `f2/${artifact}.json`])).rows[0]!.digest;
      await owner.query("UPDATE fec_v2_snapshot_metadata SET receipt_set_digest_sha256=$3 WHERE release_id=$1 AND snapshot_id=$2", [releaseId, snapshot, digest]);
      await expect(acquisition.query("UPDATE fec_v2_snapshot_metadata SET sealed_at=clock_timestamp() WHERE release_id=$1 AND snapshot_id=$2", [releaseId, snapshot])).rejects.toMatchObject({ code: "42501" });
      await expect(acquisition.query("SELECT public.seal_fec_v2_snapshot($1,$2,$3)", [releaseId, canonical.digest, snapshot])).rejects.toMatchObject({ code: "42501" });
      await owner.query("UPDATE source_snapshots SET checksum_sha256=$3 WHERE release_id=$1 AND id=$2", [releaseId, snapshot, digest]);
      await owner.query("SELECT public.seal_fec_v2_snapshot($1,$2,$3)", [releaseId, canonical.digest, snapshot]);
      await expect(owner.query("UPDATE fec_v2_artifact_receipts SET etag='e2' WHERE release_id=$1 AND receipt_id='receipt'", [releaseId])).rejects.toMatchObject({ code: "55000" });
      await expect(owner.query("UPDATE source_snapshots SET checksum_sha256=$3 WHERE release_id=$1 AND id=$2", [releaseId, snapshot, hash])).rejects.toMatchObject({ code: "55000" });
      await expect(owner.query("UPDATE source_snapshots SET parser_version='changed' WHERE release_id=$1 AND id=$2", [releaseId, snapshot])).rejects.toMatchObject({ code: "55000" });

      const secondSnapshot = `snap_f2_second_${suffix}`; const secondArtifact = "d".repeat(64);
      await expect(acquisition.query("SELECT public.create_fec_v2_source_snapshot($1,$2,$3,$4,'2026-07-18T00:00:00Z',$5)", [releaseId, secondSnapshot, source.id, "https://www.fec.gov/data/f2-second", hash])).rejects.toMatchObject({ code: "42501" });
      await owner.query("SELECT public.create_fec_v2_source_snapshot($1,$2,$3,$4,'2026-07-18T00:00:00Z',$5)", [releaseId, secondSnapshot, source.id, "https://www.fec.gov/data/f2-second", hash]);
      await owner.query("INSERT INTO fec_v2_snapshot_metadata(release_id,snapshot_id,plan_sha256,origin_release_id,receipt_set_digest_sha256) VALUES($1,$2,$3,$1,$4)", [releaseId, secondSnapshot, canonical.digest, hash]);
      await expect(acquisition.query("INSERT INTO fec_v2_artifacts(release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,created_at) VALUES($1,$2,$3,'enumeration_page',1,clock_timestamp())", [releaseId, canonical.digest, secondArtifact])).rejects.toMatchObject({ code: "42501" });
      await owner.query("INSERT INTO fec_v2_artifacts(release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,created_at) VALUES($1,$2,$3,'enumeration_page',1,clock_timestamp())", [releaseId, canonical.digest, secondArtifact]);
      await owner.query("INSERT INTO fec_v2_artifact_receipts(receipt_id,release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,upstream_entity_sha256,object_key,version_id,etag,byte_size,retrieved_at,snapshot_id) VALUES('second-receipt',$1,$2,$3,'enumeration_page',1,$4,$5,'v1','e1',1,'2026-07-18T00:00:00Z',$6)", [releaseId, canonical.digest, secondArtifact, hash, `f2/${secondArtifact}.json`, secondSnapshot]);
      await owner.query("INSERT INTO fec_v2_candidate_mappings(id,release_id,plan_sha256,seat_cycle_id,target_kind,outcome,evidence_sha256) VALUES('unresolved',$1,$2,$3,'candidate_resolution_required','unresolved',$4)", [releaseId, canonical.digest, seats[0]!.id, hash]);
      await owner.query("INSERT INTO fec_v2_finance_closures(id,release_id,plan_sha256,seat_cycle_id,target_kind,subject_kind,subject_identity,status,subject_sha256) VALUES('terminal',$1,$2,$3,'terminal','terminal','terminal','finalized',$4)", [releaseId, canonical.digest, seats[1]!.id, hash]);
      await owner.query("INSERT INTO fec_v2_seat_coverage(release_id,plan_sha256,seat_cycle_id,closure_id,subject_identity,outcome,support_cents,oppose_cents) VALUES($1,$2,$3,'terminal','terminal','complete_zero',0,0)", [releaseId, canonical.digest, seats[1]!.id]);
      await owner.query("UPDATE fec_v2_finance_closures SET finalized_at=clock_timestamp() WHERE release_id=$1 AND plan_sha256=$2 AND id='terminal'", [releaseId, canonical.digest]);
      await expect(owner.query("UPDATE fec_v2_seat_coverage SET outcome='source_unavailable',support_cents=NULL,oppose_cents=NULL WHERE release_id=$1 AND plan_sha256=$2 AND seat_cycle_id=$3", [releaseId, canonical.digest, seats[1]!.id])).rejects.toMatchObject({ code: "55000" });
      await expect(owner.query("UPDATE fec_v2_seat_coverage SET release_id='rel_move_escape' WHERE release_id=$1 AND plan_sha256=$2 AND seat_cycle_id=$3", [releaseId, canonical.digest, seats[1]!.id])).rejects.toMatchObject({ code: "55000" });
      await expect(owner.query("INSERT INTO fec_v2_candidate_mappings(id,release_id,plan_sha256,seat_cycle_id,target_kind,outcome,evidence_sha256) VALUES('unrelated',$1,$2,$3,'candidate_resolution_required','unresolved',$4)", [releaseId, canonical.digest, seats[2]!.id, hash])).resolves.toBeDefined();
      await expect(publisher.query("SELECT public.finalize_fec_v2_exact_election_aggregate($1,$2,$3,'unresolved','missing-election','missing-closure',0,0)", [releaseId, canonical.digest, seats[0]!.id])).rejects.toThrow(/coherent complete finalized closure/i);
      await expect(acquisition.query("INSERT INTO fec_v2_data_review_signatures(review_id,release_id,plan_sha256,origin_release_id,subject_type,subject_sha256,reviewer_id,key_id,public_key_fingerprint,signed_at,signature) VALUES('x',$1,$2,$1,'fec_mapping',$3,'x','k',$3,clock_timestamp(),'s')", [releaseId, canonical.digest, hash])).rejects.toMatchObject({ code: "42501" });
      await reviewer.query("SELECT public.import_fec_v2_data_signature('data',$1,$2,$1,'fec_mapping',$3,'same','k',$3,clock_timestamp(),'s')", [releaseId, canonical.digest, hash]);
      await expect(acquisition.query("INSERT INTO fec_v2_exact_election_aggregates(release_id,plan_sha256,seat_cycle_id,candidate_mapping_id,election_mapping_id,closure_id,support_cents,oppose_cents,methodology,coverage_through) VALUES($1,$2,$3,'x','x','x',0,0,'fec-receipt-cutoff-v2','2026-07-18')", [releaseId, canonical.digest, seats[0]!.id])).rejects.toMatchObject({ code: "42501" });
      await owner.query("INSERT INTO finance_proof_routes(release_id,route,plan_sha256) VALUES($1,'fec_v2_exact_election',$2)", [releaseId, canonical.digest]);
      const destinationHash = "d".repeat(64);
      const fingerprintBeforePublication = (await owner.query<{ fingerprint: string }>("SELECT public.operational_evidence_fingerprint($1,NULL) AS fingerprint", [releaseId])).rows[0]!.fingerprint;
      const reviewSignedAt = (await owner.query<{ signed_at: Date }>("SELECT signed_at FROM fec_v2_data_review_signatures WHERE release_id=$1 AND review_id='data'", [releaseId])).rows[0]!.signed_at;
      const signatureAt = (await owner.query<{ signed_at: Date }>("SELECT clock_timestamp() AS signed_at")).rows[0]!.signed_at;
      await expect(publisher.query("INSERT INTO fec_v2_publication_signatures(release_id,id,plan_sha256,canonical_sha256,reviewer_id,key_id,public_key_fingerprint,signed_at,signature) VALUES($1,'direct',$2,$3,'publisher','k2',$4,$5,'s')", [releaseId, canonical.digest, destinationHash, "e".repeat(64), signatureAt])).rejects.toMatchObject({ code: "42501" });
      await expect(publisher.query("SELECT public.import_fec_v2_publication_signature('same-reviewer',$1,$2,$3,'same','k2',$4,$5,'s')", [releaseId, canonical.digest, destinationHash, "e".repeat(64), signatureAt])).rejects.toThrow(/already bound/);
      await expect(publisher.query("SELECT public.import_fec_v2_publication_signature('same-fingerprint',$1,$2,$3,'publisher','k2',$4,$5,'s')", [releaseId, canonical.digest, destinationHash, hash, signatureAt])).rejects.toThrow(/already bound/);
      await expect(publisher.query("SELECT public.import_fec_v2_publication_signature('invalid-timing',$1,$2,$3,'publisher','k2',$4,$5,'s')", [releaseId, canonical.digest, destinationHash, "e".repeat(64), reviewSignedAt])).rejects.toThrow(/must follow plan, finalizations, and reviews/);
      await publisher.query("SELECT public.import_fec_v2_publication_signature('pub',$1,$2,$3,'publisher','k2',$4,$5,'s')", [releaseId, canonical.digest, destinationHash, "e".repeat(64), signatureAt]);
      const storedSignature = (await owner.query<{ signed_at: Date }>("SELECT signed_at FROM fec_v2_publication_signatures WHERE release_id=$1 AND id='pub'", [releaseId])).rows[0]!.signed_at;
      expect((await owner.query<{ ordered: boolean; not_future: boolean }>("SELECT s.signed_at>p.sealed_at AND s.signed_at>f.finalized_at AND s.signed_at>d.signed_at AS ordered,s.signed_at<=clock_timestamp() AS not_future FROM fec_v2_publication_signatures s JOIN fec_v2_plans p ON (p.release_id,p.plan_sha256)=(s.release_id,s.plan_sha256) JOIN fec_v2_finance_closures f ON (f.release_id,f.plan_sha256)=(s.release_id,s.plan_sha256) JOIN fec_v2_data_review_signatures d ON (d.release_id,d.plan_sha256)=(s.release_id,s.plan_sha256) WHERE s.release_id=$1 AND s.id='pub'", [releaseId])).rows[0]).toEqual({ ordered: true, not_future: true });
      await expect(publisher.query("SELECT public.import_fec_v2_publication_signature('pub',$1,$2,$3,'publisher','k2',$4,$5,'s')", [releaseId, canonical.digest, destinationHash, "e".repeat(64), signatureAt])).rejects.toThrow(/already bound/);
      await expect(publisher.query("SELECT public.import_fec_v2_publication_signature('extra',$1,$2,$3,'another','k3',$4,$5,'s')", [releaseId, canonical.digest, destinationHash, "f".repeat(64), signatureAt])).rejects.toThrow(/already bound/);
      await expect(owner.query("UPDATE fec_v2_publication_signatures SET signature='changed' WHERE release_id=$1 AND id='pub'", [releaseId])).rejects.toMatchObject({ code: "55000" });
      const proofAt = (await owner.query<{ created_at: Date }>("SELECT clock_timestamp() AS created_at")).rows[0]!.created_at;
      await expect(publisher.query("INSERT INTO fec_v2_publication_proofs(release_id,id,signature_id,canonical_sha256,created_at) VALUES($1,'direct-proof','pub',$2,$3)", [releaseId, destinationHash, proofAt])).rejects.toMatchObject({ code: "42501" });
      await expect(publisher.query("SELECT public.import_fec_v2_publication_proof('equal-proof',$1,'pub',$2,$3)", [releaseId, destinationHash, storedSignature])).rejects.toThrow(/must uniquely follow its signature/);
      await publisher.query("SELECT public.import_fec_v2_publication_proof('proof',$1,'pub',$2,$3)", [releaseId, destinationHash, proofAt]);
      await expect(publisher.query("SELECT public.import_fec_v2_publication_proof('extra-proof',$1,'pub',$2,$3)", [releaseId, destinationHash, proofAt])).rejects.toThrow(/must uniquely follow its signature/);
      await expect(owner.query("DELETE FROM fec_v2_publication_proofs WHERE release_id=$1 AND id='proof'", [releaseId])).rejects.toMatchObject({ code: "55000" });
      expect((await owner.query<{ count: number }>("SELECT count(*)::int AS count FROM fec_v2_publication_signatures WHERE release_id=$1", [releaseId])).rows[0]!.count).toBe(1);
      expect((await owner.query<{ count: number }>("SELECT count(*)::int AS count FROM fec_v2_publication_proofs WHERE release_id=$1", [releaseId])).rows[0]!.count).toBe(1);
      expect((await owner.query<{ fingerprint: string }>("SELECT public.operational_evidence_fingerprint($1,NULL) AS fingerprint", [releaseId])).rows[0]!.fingerprint).not.toBe(fingerprintBeforePublication);
      await expect(preflight.query("SELECT public.assert_fec_v2_publication_route($1)", [releaseId])).resolves.toBeDefined();
    } finally { await Promise.all([acquisition, reviewer, publisher, preflight, publicLogin].filter((pool): pool is Pool => !!pool).map(pool => pool.end())); await owner.query("RESET ROLE").catch(() => undefined); await owner.query(`DROP ROLE IF EXISTS "${publicLoginName}"`).catch(() => undefined); for (const name of Object.values(names)) await owner.query(`DROP ROLE IF EXISTS "${name}"`).catch(() => undefined); await owner.end(); }
  }, 180_000);

  it("clones a sealed coherent V2 source through baselineCandidateRelease", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const sourceId = `rel_f2_clone_source_${suffix}`, candidateId = `rel_f2_clone_candidate_${suffix}`;
    const hash = "a".repeat(64), artifact = "c".repeat(64), ledger = "d".repeat(64), snapshot = `snap_f2_clone_${suffix}`;
    const finalizedAt = "2026-07-18T04:05:06.000Z";
    const password = randomUUID();
    const migrationLoginName = `dsa_f2_clone_owner_${suffix}`, publisherLoginName = `dsa_f2_clone_publisher_${suffix}`, acquisitionLoginName = `dsa_f2_clone_acquisition_${suffix}`;
    const loginUrl = (name: string) => { const url = new URL(testDatabaseUrl!); url.username = name; url.password = password; return url.toString(); };
    let migrationPool: Pool | undefined; let publisherPool: Pool | undefined; let acquisitionPool: Pool | undefined;
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      const oldId = manifest.release.id;
      const rebind = (value: unknown): void => { if (Array.isArray(value)) value.forEach(rebind); else if (value && typeof value === "object") { const record = value as Record<string, unknown>; if (record.releaseId === oldId) record.releaseId = sourceId; Object.values(record).forEach(rebind); } };
      rebind(manifest);
      manifest.release = { ...manifest.release, id: sourceId as never, status: "candidate", publishedAt: null, previousReleaseId: null };
      manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest);
      await seedNationwideCandidateManifest(pool, manifest, bundle);
      await validateNationwideCandidateRelease(pool, sourceId);
      await pool.query("ALTER TABLE data_releases DISABLE TRIGGER USER");
      try { await pool.query("UPDATE data_releases SET source_cutoff='2026-07-18T00:00:00Z' WHERE id=$1", [sourceId]); }
      finally { await pool.query("ALTER TABLE data_releases ENABLE TRIGGER USER"); }
      const source = `src_f2_clone_${suffix}`;
      await pool.query("INSERT INTO sources(release_id,id,name,authority,homepage_url) VALUES($1,$2,'fec','official','https://api.open.fec.gov')", [sourceId, source]);
      await pool.query("INSERT INTO fec_v2_plans(release_id,plan_sha256,origin_release_id,receipt_cutoff,campaign_cycle,source_lock_sha256,target_universe_sha256,canonical_sha256) VALUES($1,$2,$1,'2026-07-18',2026,$3,$3,$3)", [sourceId, "b".repeat(64), hash]);
      const terminalSeat = (await pool.query<{ seat_cycle_id: string }>("SELECT seat_cycle_id FROM release_profile_seats WHERE release_id=$1 ORDER BY seat_cycle_id LIMIT 1", [sourceId])).rows[0]!.seat_cycle_id;
      await pool.query("INSERT INTO fec_v2_plan_targets(release_id,plan_sha256,seat_cycle_id,kind,disposition,evidence_sha256) SELECT $1,$2,seat_cycle_id,CASE WHEN seat_cycle_id=$3 THEN 'terminal' ELSE 'candidate_resolution_required' END,CASE WHEN seat_cycle_id=$3 THEN 'vacant' ELSE NULL END,CASE WHEN seat_cycle_id=$3 THEN $4 ELSE NULL END FROM release_profile_seats WHERE release_id=$1", [sourceId, "b".repeat(64), terminalSeat, hash]);
      const universe = (await pool.query<{ digest: string }>("SELECT encode(digest(convert_to(public.fec_v2_target_universe_bytes($1,$2),'UTF8'),'sha256'),'hex') digest", [sourceId, "b".repeat(64)])).rows[0]!.digest;
      await pool.query("UPDATE fec_v2_plans SET target_universe_sha256=$3 WHERE release_id=$1 AND plan_sha256=$2", [sourceId, "b".repeat(64), universe]);
      const plan = (await pool.query<{ digest: string }>("SELECT encode(digest(convert_to(public.fec_v2_plan_bytes($1,$2),'UTF8'),'sha256'),'hex') digest", [sourceId, "b".repeat(64)])).rows[0]!.digest;
      await pool.query("DELETE FROM fec_v2_plan_targets WHERE release_id=$1", [sourceId]);
      await pool.query("UPDATE fec_v2_plans SET plan_sha256=$2,canonical_sha256=$2 WHERE release_id=$1", [sourceId, plan]);
      await pool.query("INSERT INTO fec_v2_plan_targets(release_id,plan_sha256,seat_cycle_id,kind,disposition,evidence_sha256) SELECT $1,$2,seat_cycle_id,CASE WHEN seat_cycle_id=$3 THEN 'terminal' ELSE 'candidate_resolution_required' END,CASE WHEN seat_cycle_id=$3 THEN 'vacant' ELSE NULL END,CASE WHEN seat_cycle_id=$3 THEN $4 ELSE NULL END FROM release_profile_seats WHERE release_id=$1", [sourceId, plan, terminalSeat, hash]);
      await pool.query("SELECT public.seal_fec_v2_plan($1,$2)", [sourceId, plan]);
      await pool.query("INSERT INTO finance_proof_routes(release_id,route,plan_sha256) VALUES($1,'fec_v2_exact_election',$2)", [sourceId, plan]);
      await pool.query("INSERT INTO source_snapshots(release_id,id,source_id,source_url,retrieved_at,checksum_sha256,parser_version,license,usage_status) VALUES($1,$2,$3,'https://www.fec.gov/data/clone','2026-07-18T00:00:00Z',$4,'fec-receipt-cutoff-v2','public','approved')", [sourceId, snapshot, source, hash]);
      await pool.query("INSERT INTO fec_v2_snapshot_metadata(release_id,snapshot_id,plan_sha256,origin_release_id,receipt_set_digest_sha256) VALUES($1,$2,$3,$1,$4)", [sourceId, snapshot, plan, hash]);
      await pool.query("INSERT INTO fec_v2_artifacts(release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,created_at) VALUES($1,$2,$3,'enumeration_page',1,'2026-07-18T00:00:00Z')", [sourceId, plan, artifact]);
      await pool.query("INSERT INTO fec_v2_artifact_receipts(receipt_id,release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,upstream_entity_sha256,object_key,version_id,etag,byte_size,retrieved_at,snapshot_id) VALUES('receipt',$1,$2,$3,'enumeration_page',1,$4,$5,'v1','e1',1,'2026-07-18T00:00:00Z',$6)", [sourceId, plan, artifact, hash, `clone/${artifact}`, snapshot]);
      await pool.query("INSERT INTO fec_v2_artifacts(release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,created_at) VALUES($1,$2,$3,'filing_ledger',1,'2026-07-18T00:00:00Z')", [sourceId, plan, ledger]);
      await pool.query("INSERT INTO fec_v2_artifact_receipts(receipt_id,release_id,plan_sha256,artifact_sha256,artifact_kind,canonical_byte_size,upstream_entity_sha256,object_key,version_id,etag,byte_size,retrieved_at,snapshot_id) VALUES('ledger-receipt',$1,$2,$3,'filing_ledger',1,NULL,$4,'v1','e1',1,'2026-07-18T00:00:00Z',$5)", [sourceId, plan, ledger, `clone/${ledger}`, snapshot]);
      await pool.query("INSERT INTO fec_v2_filing_ledgers(release_id,plan_sha256,artifact_sha256,artifact_kind,stable,finalized_at) VALUES($1,$2,$3,'filing_ledger',1,$4)", [sourceId, plan, ledger, finalizedAt]);
      await pool.query("INSERT INTO fec_v2_enumeration_pages(release_id,plan_sha256,artifact_sha256,artifact_kind,pass,form_type,receipt_date,requested_file_number,page_number,terminal) VALUES($1,$2,$3,'enumeration_page',1,'F3','2026-07-15',NULL,1,1)", [sourceId, plan, artifact]);
      await pool.query("INSERT INTO fec_v2_filing_ledger_entries(release_id,plan_sha256,ledger_sha256,file_number,entry_identity_sha256,canonical_form_type,base_form_type,report_type,report_date,receipt_date,coverage_start,coverage_end,amendment_indicator,filer_id,committee_id,electronic_status,raw_source_availability) VALUES($1,$2,$3,123,$4,'F3','F3','Q2','2026-06-30','2026-07-15','2026-04-01','2026-06-30','N','C00000001','C00000001','electronic','available')", [sourceId, plan, ledger, "e".repeat(64)]);
      await pool.query("INSERT INTO fec_v2_page_lineage(release_id,plan_sha256,ledger_sha256,file_number,page_sha256,pass,occurrence_index) VALUES($1,$2,$3,123,$4,1,1)", [sourceId, plan, ledger, artifact]);
      await pool.query(`CREATE ROLE "${acquisitionLoginName}" LOGIN INHERIT PASSWORD '${password}'`);
      await pool.query(`GRANT dsa_seats_fec_v2_acquisition TO "${acquisitionLoginName}"`);
      acquisitionPool = new Pool({ connectionString: loginUrl(acquisitionLoginName) });
      expect((await acquisitionPool.query<{ memberships: string[] }>("SELECT coalesce(array_agg(g.rolname::text ORDER BY g.rolname::text) FILTER(WHERE g.rolname IS NOT NULL),ARRAY[]::text[]) memberships FROM pg_roles u LEFT JOIN pg_auth_members x ON x.member=u.oid LEFT JOIN pg_roles g ON g.oid=x.roleid WHERE u.rolname=session_user GROUP BY u.rolname")).rows[0]?.memberships).toEqual(["dsa_seats_fec_v2_acquisition"]);
      await acquisitionPool.query("SELECT * FROM public.claim_fec_v2_run($1,$2,'active-run',$3)", [sourceId, plan, "f".repeat(64)]);
      const receiptDigest = (await pool.query<{ digest: string }>("SELECT encode(digest(convert_to(public.fec_v2_snapshot_receipt_bytes($1,$2,$3),'UTF8'),'sha256'),'hex') digest", [sourceId, plan, snapshot])).rows[0]!.digest;
      await pool.query("UPDATE fec_v2_snapshot_metadata SET receipt_set_digest_sha256=$3 WHERE release_id=$1 AND snapshot_id=$2", [sourceId, snapshot, receiptDigest]);
      await pool.query("UPDATE source_snapshots SET checksum_sha256=$3 WHERE release_id=$1 AND id=$2", [sourceId, snapshot, receiptDigest]);
      await pool.query("SELECT public.seal_fec_v2_snapshot($1,$2,$3)", [sourceId, plan, snapshot]);
      // Run history is operational and excluded from cloning. Keep this source
      // run active rather than bypassing the finalizer-only terminal boundary.
      const aggregateSeat = (await pool.query<{ id: string; geography_version_id: string }>("SELECT s.id,s.geography_version_id FROM seat_cycles s WHERE s.release_id=$1 AND s.id<>$2 ORDER BY s.id COLLATE \"C\" LIMIT 1", [sourceId, terminalSeat])).rows[0]!;
      // The FEC snapshot was added after the skeleton was seeded.  Build its
      // public aggregate parents in the in-memory manifest first, so the
      // eventual checksum covers their relational and provenance edges.
      await pool.query("ALTER TABLE data_releases DISABLE TRIGGER USER");
      try { await pool.query("UPDATE data_releases SET source_cutoff=$2 WHERE id=$1", [sourceId, manifest.release.sourceCutoff]); }
      finally { await pool.query("ALTER TABLE data_releases ENABLE TRIGGER USER"); }
      const coherent = (await loadNationwideManifestForFinalization(pool, sourceId)).manifest;
      const cloneProvenance = [{ snapshotId: snapshot, role: "original_publisher" }] as never;
      coherent.contests.push({ id: "contest_clone", releaseId: sourceId, provenance: cloneProvenance, seatCycleId: aggregateSeat.id, kind: "house_general", round: "general", electionDate: "2026-11-03", geographyVersionId: aggregateSeat.geography_version_id, certificationStatus: "official_unfinalized", reportingCompletenessPercent: 0, denominatorVotes: { kind: "missing", reason: "not_collected" }, reportingUnit: "district", allocationMethod: "none", allocationCoveragePercent: { kind: "missing", reason: "not_applicable" }, lineage: { inputs: cloneProvenance, asOf: "2026-07-18", methodology: "clone-fixture", status: "reported" } } as never);
      coherent.candidacies.push({ id: "candidacy_clone", releaseId: sourceId, provenance: cloneProvenance, contestId: "contest_clone", personId: null, party: "other", status: "filed" } as never);
      coherent.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(coherent);
      await pool.query("INSERT INTO contests(release_id,id,seat_cycle_id,kind,round,election_date,geography_version_id,certification_status,reporting_completeness_percent,denominator_votes,denominator_missing_reason,reporting_unit,allocation_method,allocation_coverage_percent,allocation_coverage_missing_reason,lineage_as_of,lineage_methodology,lineage_status) VALUES($1,'contest_clone',$2,'house_general','general','2026-11-03',$3,'official_unfinalized',0,NULL,'not_collected','district','none',NULL,'not_applicable','2026-07-18','clone-fixture','reported')", [sourceId, aggregateSeat.id, aggregateSeat.geography_version_id]);
      await pool.query("INSERT INTO candidacies(release_id,id,contest_id,person_id,party,status) VALUES($1,'candidacy_clone','contest_clone',NULL,'other','filed')", [sourceId]);
      await pool.query("INSERT INTO contest_lineage(release_id,contest_id,snapshot_id,role) VALUES($1,'contest_clone',$2,'original_publisher')", [sourceId, snapshot]);
      await pool.query("INSERT INTO provenance(release_id,entity_type,entity_id,snapshot_id,role) VALUES($1,'contests','contest_clone',$2,'original_publisher'),($1,'candidacies','candidacy_clone',$2,'original_publisher')", [sourceId, snapshot]);
      await pool.query("INSERT INTO fec_v2_candidate_mappings(id,release_id,plan_sha256,seat_cycle_id,target_kind,outcome,fec_candidate_id,candidacy_id,candidacy_contest_id,evidence_sha256) VALUES('candidate_mapping_clone',$1,$2,$3,'candidate_resolution_required','mapped','H00000000','candidacy_clone','contest_clone',$4)", [sourceId, plan, aggregateSeat.id, hash]);
      await pool.query("INSERT INTO fec_v2_election_mappings(id,release_id,plan_sha256,seat_cycle_id,outcome,candidate_mapping_id,contest_id,election_code,election_date,evidence_sha256) VALUES('election_mapping_clone',$1,$2,$3,'mapped','candidate_mapping_clone','contest_clone','G2026','2026-11-03',$4)", [sourceId, plan, aggregateSeat.id, hash]);
      await pool.query("INSERT INTO fec_v2_finance_closures(id,release_id,plan_sha256,seat_cycle_id,target_kind,subject_kind,subject_identity,candidate_mapping_id,status,subject_sha256) VALUES('closure_clone',$1,$2,$3,'candidate_resolution_required','candidate','candidate_mapping_clone','candidate_mapping_clone','finalized',$4)", [sourceId, plan, aggregateSeat.id, hash]);
      await pool.query("INSERT INTO fec_v2_seat_coverage(release_id,plan_sha256,seat_cycle_id,closure_id,subject_identity,outcome,support_cents,oppose_cents) VALUES($1,$2,$3,'closure_clone','candidate_mapping_clone','complete_nonzero',123,45)", [sourceId, plan, aggregateSeat.id]);
      await pool.query("UPDATE fec_v2_finance_closures SET finalized_at=$3 WHERE release_id=$1 AND plan_sha256=$2 AND id='closure_clone'", [sourceId, plan, finalizedAt]);
      await pool.query(`CREATE ROLE \"${publisherLoginName}\" LOGIN INHERIT PASSWORD '${password}'`);
      await pool.query(`GRANT dsa_seats_fec_v2_publisher TO \"${publisherLoginName}\"`);
      publisherPool = new Pool({ connectionString: loginUrl(publisherLoginName) });
      await publisherPool.query("SELECT public.finalize_fec_v2_exact_election_aggregate($1,$2,$3,'candidate_mapping_clone','election_mapping_clone','closure_clone',123,45)", [sourceId, plan, aggregateSeat.id]);
      await pool.query("INSERT INTO fec_v2_finance_closures(id,release_id,plan_sha256,seat_cycle_id,target_kind,subject_kind,subject_identity,status,subject_sha256) VALUES('terminal',$1,$2,$3,'terminal','terminal','terminal','finalized',$4)", [sourceId, plan, terminalSeat, hash]);
      await pool.query("INSERT INTO fec_v2_seat_coverage(release_id,plan_sha256,seat_cycle_id,closure_id,subject_identity,outcome,support_cents,oppose_cents) VALUES($1,$2,$3,'terminal','terminal','complete_zero',0,0)", [sourceId, plan, terminalSeat]);
      await pool.query("UPDATE fec_v2_finance_closures SET finalized_at=$3 WHERE release_id=$1 AND plan_sha256=$2 AND id='terminal'", [sourceId, plan, finalizedAt]);
      await pool.query("INSERT INTO fec_v2_data_review_signatures(review_id,release_id,plan_sha256,origin_release_id,subject_type,subject_sha256,reviewer_id,key_id,public_key_fingerprint,signed_at,signature) VALUES('source-data',$1,$2,$1,'fec_mapping',$3,'fixture-reviewer','fixture-key',$3,'2026-07-18T00:00:00Z','fixture-signature')", [sourceId, plan, hash]);
      await pool.query("INSERT INTO fec_v2_publication_signatures(release_id,id,plan_sha256,canonical_sha256,reviewer_id,key_id,public_key_fingerprint,signed_at,signature) VALUES($1,'source-pub',$2,$2,'fixture-publisher','fixture-key',$3,'2026-07-18T00:00:00Z','fixture-signature')", [sourceId, plan, hash]);
      await pool.query("INSERT INTO fec_v2_publication_proofs(release_id,id,signature_id,canonical_sha256,created_at) VALUES($1,'source-proof','source-pub',$2,'2026-07-18T00:00:00Z')", [sourceId, plan]);
      const finalized = (await loadNationwideManifestForFinalization(pool, sourceId)).manifest;
      finalized.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(finalized);
      await pool.query("UPDATE release_manifests SET canonical_data_checksum_sha256=$2,content_checksum_sha256=$3,validated_at=NULL WHERE release_id=$1", [sourceId, finalized.canonicalDataChecksumSha256, expectedContentChecksum({ schema_version: 2, canonical_data_checksum_sha256: finalized.canonicalDataChecksumSha256, geometry_checksum_sha256: (await pool.query<{ geometry_checksum_sha256: string }>("SELECT geometry_checksum_sha256 FROM release_manifests WHERE release_id=$1", [sourceId])).rows[0]!.geometry_checksum_sha256, content_checksum_sha256: "" })]);
      await validateNationwideCandidateRelease(pool, sourceId);
      await pool.query("ALTER TABLE data_releases DISABLE TRIGGER USER");
      try { await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'sealed clone','candidate',$2,clock_timestamp(),NULL,$3)", [candidateId, manifest.release.sourceCutoff, sourceId]); }
      finally { await pool.query("ALTER TABLE data_releases ENABLE TRIGGER USER"); }
      await pool.query(`CREATE ROLE \"${migrationLoginName}\" LOGIN INHERIT PASSWORD '${password}'`);
      await pool.query(`GRANT dsa_seats_migration_owner TO \"${migrationLoginName}\"`);
      migrationPool = new Pool({ connectionString: loginUrl(migrationLoginName) });
      expect((await migrationPool.query("SELECT pg_has_role(session_user,'dsa_seats_migration_owner','member') migration_owner,pg_has_role(session_user,'dsa_seats_fec_v2_publisher','member') publisher")).rows[0]).toEqual({ migration_owner: true, publisher: false });
      await baselineCandidateRelease(migrationPool, sourceId, candidateId);
      expect((await pool.query("SELECT 1 FROM nationwide_validation_gates WHERE release_id=$1", [candidateId])).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM release_content_digests WHERE release_id=$1", [candidateId])).rowCount).toBe(0);
      await expect(recheckNationwideValidationGate(pool, candidateId)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, candidateId);
      await expect(recheckNationwideValidationGate(pool, candidateId)).resolves.toBeUndefined();
      const digestRows = await Promise.all([sourceId, candidateId].map(async (releaseId) => (await pool.query("SELECT domain,row_count,sha256 FROM release_content_digests WHERE release_id=$1 ORDER BY domain", [releaseId])).rows));
      expect(digestRows[0]).toHaveLength(7);
      expect(digestRows[1]).toEqual(digestRows[0]);
      expect((await pool.query("SELECT release_id,origin_release_id FROM fec_v2_plans WHERE release_id=ANY($1) ORDER BY release_id COLLATE \"C\"", [[sourceId, candidateId]])).rows).toEqual([{ release_id: candidateId, origin_release_id: sourceId }, { release_id: sourceId, origin_release_id: sourceId }]);
      expect((await pool.query("SELECT route,plan_sha256 FROM finance_proof_routes WHERE release_id=$1", [candidateId])).rows).toEqual([{ route: "fec_v2_exact_election", plan_sha256: plan }]);
      for (const [table, column, value] of [["fec_v2_plans", "plan_sha256", plan], ["fec_v2_snapshot_metadata", "snapshot_id", snapshot]] as const) { const timestamps = (await pool.query<{ source: Date; candidate: Date }>(`SELECT (SELECT sealed_at FROM ${table} WHERE release_id=$1 AND ${column}=$3) source,(SELECT sealed_at FROM ${table} WHERE release_id=$2 AND ${column}=$3) candidate`, [sourceId, candidateId, value])).rows[0]!; expect(timestamps.candidate.toISOString()).toBe(timestamps.source.toISOString()); }
      expect((await pool.query("SELECT finalized_at FROM fec_v2_filing_ledgers WHERE release_id=$1 AND artifact_sha256=$2", [candidateId, ledger])).rows[0]?.finalized_at.toISOString()).toBe(finalizedAt);
      const ledgerColumns = "ledger_sha256,file_number,entry_identity_sha256,canonical_form_type,base_form_type,report_type,report_date,receipt_date,coverage_start,coverage_end,amendment_indicator,filer_id,committee_id,electronic_status,raw_source_availability";
      expect((await pool.query(`SELECT ${ledgerColumns} FROM fec_v2_filing_ledger_entries WHERE release_id=$1 ORDER BY file_number`, [candidateId])).rows).toEqual((await pool.query(`SELECT ${ledgerColumns} FROM fec_v2_filing_ledger_entries WHERE release_id=$1 ORDER BY file_number`, [sourceId])).rows);
      expect((await pool.query("SELECT finalized_at FROM fec_v2_finance_closures WHERE release_id=$1 AND id='terminal'", [candidateId])).rows[0]?.finalized_at.toISOString()).toBe(finalizedAt);
      const aggregateColumns = "plan_sha256,seat_cycle_id,candidate_mapping_id,election_mapping_id,closure_id,support_cents,oppose_cents,methodology,coverage_through";
      expect((await pool.query(`SELECT ${aggregateColumns} FROM fec_v2_exact_election_aggregates WHERE release_id=$1`, [candidateId])).rows).toEqual((await pool.query(`SELECT ${aggregateColumns} FROM fec_v2_exact_election_aggregates WHERE release_id=$1`, [sourceId])).rows);
      const aggregateInsert = "INSERT INTO fec_v2_exact_election_aggregates(release_id,plan_sha256,seat_cycle_id,candidate_mapping_id,election_mapping_id,closure_id,support_cents,oppose_cents,methodology,coverage_through) SELECT $1,plan_sha256,seat_cycle_id,candidate_mapping_id,election_mapping_id,closure_id,$2,oppose_cents,methodology,coverage_through FROM fec_v2_exact_election_aggregates WHERE release_id=$3";
      await expect(migrationPool.query(aggregateInsert, [candidateId, 124, sourceId])).rejects.toMatchObject({ code: "55000" });
      await expect(migrationPool.query("INSERT INTO fec_v2_exact_election_aggregates(release_id,plan_sha256,seat_cycle_id,candidate_mapping_id,election_mapping_id,closure_id,support_cents,oppose_cents,methodology,coverage_through) VALUES($1,$2,'novel-seat','novel-candidate','novel-election','novel-closure',0,0,'fec-receipt-cutoff-v2','2026-07-18')", [candidateId, plan])).rejects.toMatchObject({ code: "55000" });
      await pool.query("ALTER TABLE data_releases DISABLE TRIGGER USER");
      try {
        const nonPredecessorId = `rel_f2_non_predecessor_${suffix}`;
        await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) SELECT $1,'non-predecessor','candidate',source_cutoff,clock_timestamp(),NULL,NULL FROM data_releases WHERE id=$2", [nonPredecessorId, candidateId]);
        await pool.query("UPDATE data_releases SET previous_release_id=$2 WHERE id=$1", [candidateId, nonPredecessorId]);
        await expect(migrationPool.query(aggregateInsert, [candidateId, 124, sourceId])).rejects.toMatchObject({ code: "55000" });
        await pool.query("UPDATE data_releases SET status='retired',published_at=clock_timestamp() WHERE id=$1", [candidateId]);
        await expect(migrationPool.query(aggregateInsert, [candidateId, 124, sourceId])).rejects.toMatchObject({ code: "55000" });
        await pool.query("UPDATE data_releases SET status='candidate',published_at=NULL,previous_release_id=$2 WHERE id=$1", [candidateId, sourceId]);
      } finally { await pool.query("ALTER TABLE data_releases ENABLE TRIGGER USER"); }
      for (const domain of Object.keys(contentDomains) as Array<keyof typeof contentDomains>) expect(await computeReleaseDigest(pool, candidateId, domain)).toEqual(await computeReleaseDigest(pool, sourceId, domain));
      expect((await pool.query("SELECT count(*)::int count FROM fec_v2_publication_signatures WHERE release_id=$1", [candidateId])).rows[0]).toEqual({ count: 0 });
      for (const table of ["fec_v2_runs", "fec_v2_run_snapshots", "fec_v2_run_failures", "fec_v2_publication_proofs"]) expect((await pool.query(`SELECT count(*)::int count FROM ${table} WHERE release_id=$1`, [candidateId])).rows[0]).toEqual({ count: 0 });
      const descendantPlan = `${suffix}${suffix}`.slice(0, 64);
      const descendantOrigin = (await pool.query<{ origin: string }>("SELECT public.expected_fec_v2_origin($1::text,$2::text) origin", [candidateId, descendantPlan])).rows[0]!.origin;
      expect(descendantOrigin).toBe(candidateId);
      await pool.query("INSERT INTO fec_v2_plans(release_id,plan_sha256,origin_release_id,receipt_cutoff,campaign_cycle,source_lock_sha256,target_universe_sha256,canonical_sha256) VALUES($1,$2,$3,'2026-07-18',2026,$4,$4,$2)", [candidateId, descendantPlan, descendantOrigin, hash]);
      expect((await pool.query<{ origin: string }>("SELECT public.expected_fec_v2_origin($1::text,$2::text) origin", [candidateId, plan])).rows[0]?.origin).toBe(sourceId);
      await pool.query("DELETE FROM fec_v2_plans WHERE release_id=$1 AND plan_sha256=$2", [candidateId, descendantPlan]);
      await pool.query("UPDATE fec_v2_data_review_signatures SET signature='mutated-fixture-signature' WHERE release_id=$1 AND review_id='source-data'", [candidateId]);
      expect((await pool.query("SELECT 1 FROM release_content_digests WHERE release_id=$1 AND domain='finance'", [candidateId])).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM nationwide_validation_gates WHERE release_id=$1", [candidateId])).rowCount).toBe(0);
      await validateNationwideCandidateRelease(pool, candidateId);
      const retiredId = `rel_f2_clone_retired_${suffix}`;
      await pool.query("ALTER TABLE data_releases DISABLE TRIGGER USER");
      try { await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'retired clone fixture','retired',$2,clock_timestamp(),clock_timestamp(),NULL)", [retiredId, manifest.release.sourceCutoff]); }
      finally { await pool.query("ALTER TABLE data_releases ENABLE TRIGGER USER"); }
      await expect(pool.query("INSERT INTO fec_v2_plans(release_id,plan_sha256,origin_release_id,receipt_cutoff,campaign_cycle,source_lock_sha256,target_universe_sha256,canonical_sha256) VALUES($1,$2,$1,'2026-07-18',2026,$3,$3,$2)", [retiredId, "e".repeat(64), hash])).rejects.toMatchObject({ code: "23514", message: expect.stringMatching(/nationwide content is mutable only while candidate/i) });
    } finally { await publisherPool?.end(); await migrationPool?.end(); await acquisitionPool?.end(); await pool.query(`DROP ROLE IF EXISTS \"${publisherLoginName}\"`).catch(() => undefined); await pool.query(`DROP ROLE IF EXISTS \"${migrationLoginName}\"`).catch(() => undefined); await pool.query(`DROP ROLE IF EXISTS \"${acquisitionLoginName}\"`).catch(() => undefined); await pool.end(); }
  }, 180_000);

  it("round-trips the canonical candidate with artifact and geometry identity", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      await pool.query("SELECT PostGIS_Version()");
      const bundle = await loadCanonicalBoundaryBundle(canonicalManifest);
      const expectedBoundaries = compileBoundaryBundle(canonicalManifest, bundle);

      await seedPrototypeManifest(pool, canonicalManifest, bundle);
      const loaded = await loadPrototypeManifest(pool, canonicalManifest.release.id);

      expect(computeCanonicalDataChecksum(loaded)).toBe(canonicalManifest.canonicalDataChecksumSha256);
      expect(loaded.profileSeatCycleIds).toEqual(canonicalManifest.profileSeatCycleIds);
      expect(loaded.geometryArtifacts).toEqual(canonicalManifest.geometryArtifacts);

      for (const [geographyId, boundary] of expectedBoundaries) {
        const result = await pool.query<{ expected: Buffer; actual: Buffer }>(
          "SELECT ST_AsEWKB(ST_Normalize(ST_SetSRID(ST_GeomFromGeoJSON($2),4326))) AS expected, ST_AsEWKB(ST_Normalize(boundary)) AS actual FROM geography_versions WHERE release_id=$1 AND id=$3",
          [canonicalManifest.release.id, JSON.stringify(boundary), geographyId],
        );
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]!.actual.equals(result.rows[0]!.expected)).toBe(true);
      }
    } finally {
      await pool.end();
    }
  });

  it("matches the in-memory repository contract for the promoted canonical release", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const bundle = await loadCanonicalBoundaryBundle(canonicalManifest);
      await seedPrototypeManifest(pool, canonicalManifest, bundle);
      await promoteCandidateRelease(pool, canonicalManifest.release.id);
      const postgres = new PostgresSeatResearchRepository(pool);
      const publishedManifest = await loadPrototypeManifest(pool, canonicalManifest.release.id);
      const publishedMemory = new InMemorySeatResearchRepository(publishedManifest);
      const canonicalMemory = new InMemorySeatResearchRepository(canonicalManifest);
      await assertSeatRepositoryContract(postgres, publishedManifest);
      await assertSeatRepositoryContract(publishedMemory, publishedManifest);
      expect(await postgres.listSeats(canonicalManifest.release.id, { sort: "state", direction: "asc" })).toEqual(await canonicalMemory.listSeats(canonicalManifest.release.id, { sort: "state", direction: "asc" }));
      expect(await postgres.getSeatProfile(canonicalManifest.release.id, canonicalManifest.profileSeatCycleIds[0]!)).toEqual(await publishedMemory.getSeatProfile(canonicalManifest.release.id, canonicalManifest.profileSeatCycleIds[0]!));
      expect(await postgres.listSources(canonicalManifest.release.id)).toEqual(await publishedMemory.listSources(canonicalManifest.release.id));
      expect(await postgres.getActiveRelease()).toEqual(await publishedMemory.getActiveRelease());
      expect(await postgres.getRelease(canonicalManifest.release.id)).toEqual(await publishedMemory.getRelease(canonicalManifest.release.id));
    } finally { await pool.end(); }
  });

  it("resolves the promoted pinned address geometry without retaining a residential address", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const bundle = await loadCanonicalBoundaryBundle(canonicalManifest);
      await seedPrototypeManifest(pool, canonicalManifest, bundle); await promoteCandidateRelease(pool, canonicalManifest.release.id);
      const point = async (geographyId: string) => (await pool.query<{ longitude: number; latitude: number }>("SELECT ST_X(ST_PointOnSurface(boundary)) longitude, ST_Y(ST_PointOnSurface(boundary)) latitude FROM geography_versions WHERE release_id=$1 AND id=$2", [canonicalManifest.release.id, geographyId])).rows[0]!;
      const ak = await point("geo_house_ak_al"); const al = await point("geo_state_al");
      let census = { longitude: ak.longitude, latitude: ak.latitude, stateGeoid: "02", congressionalDistrictGeoid: "0200" };
      const geocoder = { geocode: vi.fn(async () => ({ benchmark: { id: "4", name: "Public_AR_Current" }, vintage: { id: "4", name: "Current_Current" }, candidates: [census] })) };
      const resolver = new PostgresAddressResolver({ releaseId: canonicalManifest.release.id, productVintage: "2025" }, geocoder, new PostgresSeatLocator(pool));
      const result = await resolver.resolve({ address: "Fictional Plaza 7" });
      expect(result).toMatchObject({ status: "matched", houseSeat: { officeTermId: "term_house_ak_al_2025", seatCycleId: "seat_house_ak_al_2024_regular", geographyVersionId: "geo_house_ak_al" }, senateSeats: [{ senateClass: 2, officeTermId: "term_senate_ak_2", seatCycleId: "seat_senate_ak_2_current" }, { senateClass: 3, officeTermId: "term_senate_ak_3", seatCycleId: "seat_senate_ak_3_current" }] });
      const wrong = new PostgresAddressResolver({ releaseId: canonicalManifest.release.id, productVintage: "wrong" }, geocoder, new PostgresSeatLocator(pool));
      await expect(wrong.resolve({ address: "Fictional Plaza 7" })).resolves.toMatchObject({ status: "resolver_failure" }); expect(geocoder.geocode).toHaveBeenCalledTimes(1);
      census = { longitude: al.longitude, latitude: al.latitude, stateGeoid: "01", congressionalDistrictGeoid: "0101" };
      await expect(resolver.resolve({ address: "Fictional Plaza 7" })).resolves.toMatchObject({ status: "unsupported_prototype_coverage" });
      census = { longitude: ak.longitude, latitude: ak.latitude, stateGeoid: "01", congressionalDistrictGeoid: "0102" };
      await expect(resolver.resolve({ address: "Fictional Plaza 7" })).resolves.toMatchObject({ status: "vintage_mismatch" });
    } finally { await pool.end(); }
  });

  it("uses the exact selected profile cycles for every canonical geography", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const bundle = await loadCanonicalBoundaryBundle(canonicalManifest);
      await seedPrototypeManifest(pool, canonicalManifest, bundle); await promoteCandidateRelease(pool, canonicalManifest.release.id);
      const locator = new PostgresSeatLocator(pool);
      for (const seatCycleId of canonicalManifest.profileSeatCycleIds) {
        const cycle = canonicalManifest.seatCycles.find((value) => value.id === seatCycleId)!;
        const geography = canonicalManifest.geographyVersions.find((value) => value.id === cycle.geographyVersionId)!;
        const state = canonicalManifest.geographyVersions.find((value) => value.kind === "state" && value.stateCode === geography.stateCode)!;
        const point = (await pool.query<{ longitude: number; latitude: number }>("SELECT ST_X(ST_PointOnSurface(boundary)) longitude, ST_Y(ST_PointOnSurface(boundary)) latitude FROM geography_versions WHERE release_id=$1 AND id=$2", [canonicalManifest.release.id, geography.id])).rows[0]!;
        const result = await locator.locate(canonicalManifest.release.id, "2025", state.sourceGeoid!, geography.sourceGeoid!, point.longitude, point.latitude);
        const senate = canonicalManifest.seatCycles.filter((value) => { const term = canonicalManifest.officeTerms.find((item) => item.id === value.officeTermId)!; const office = canonicalManifest.offices.find((item) => item.id === term.officeId)!; return office.chamber === "senate" && office.stateCode === geography.stateCode; }).sort((a, b) => { const ao = canonicalManifest.offices.find((o) => o.id === canonicalManifest.officeTerms.find((t) => t.id === a.officeTermId)!.officeId)!; const bo = canonicalManifest.offices.find((o) => o.id === canonicalManifest.officeTerms.find((t) => t.id === b.officeTermId)!.officeId)!; return ao.senateClass! - bo.senateClass!; });
        expect(result).toMatchObject({ kind: "matched", houseSeat: { seatCycleId, officeTermId: cycle.officeTermId, geographyVersionId: geography.id }, senateSeats: senate.map((value) => ({ seatCycleId: value.id, officeTermId: value.officeTermId })) });
      }
    } finally { await pool.end(); }
  });

  it("uses UTC for seat-term cutoff comparisons", async () => {
    const source = await readFile(resolve(process.cwd(), "src/address/postgres-resolver.ts"), "utf8");
    expect(source).toContain("(r.source_cutoff AT TIME ZONE 'UTC')::date");
    expect(source).not.toContain("r.source_cutoff::date");
  });

  it("matches the strengthened contract for a promoted adversarial release", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      await pool.query("SELECT PostGIS_Version()");
      const manifest = candidate(`rel_adversarial_${Date.now()}_${Math.random().toString(36).slice(2)}`, adversarialRepositoryManifest());
      await seedPrototypeManifest(pool, manifest, boundariesFor(manifest)); await promoteCandidateRelease(pool, manifest.release.id);
      const loaded = await loadPrototypeManifest(pool, manifest.release.id); const postgres = new PostgresSeatResearchRepository(pool); const memory = new InMemorySeatResearchRepository(loaded);
      await assertSeatRepositoryContract(postgres, loaded); await assertSeatRepositoryContract(memory, loaded);
      expect(await postgres.listSeats(loaded.release.id, { sort: "cash_on_hand", direction: "asc" })).toEqual(await memory.listSeats(loaded.release.id, { sort: "cash_on_hand", direction: "asc" }));
       const firstPage = await postgres.listSeatPage(loaded.release.id, { limit: 2, sort: "cash_on_hand", direction: "asc" });
       expect(firstPage.nextCursor).not.toBeNull();
       expect(firstPage.items.filter((seat) => seat.cashOnHand.kind === "value" || seat.cashOnHand.kind === "aggregate")).toHaveLength(2);
       const secondPage = await postgres.listSeatPage(loaded.release.id, { limit: 2, sort: "cash_on_hand", direction: "asc", cursor: firstPage.nextCursor! });
       const pageIds = [...firstPage.items, ...secondPage.items].map((seat) => seat.id);
       expect(new Set(pageIds).size).toBe(pageIds.length);
       const cashSeatIds = [...firstPage.items, ...secondPage.items]
         .filter((seat) => seat.cashOnHand.kind === "value" || seat.cashOnHand.kind === "aggregate")
         .map((seat) => seat.id);
       const expectedCashSeatIds = (await memory.listSeats(loaded.release.id, { sort: "cash_on_hand", direction: "asc" }))
         .filter((seat) => seat.cashOnHand.kind === "value" || seat.cashOnHand.kind === "aggregate")
         .map((seat) => seat.id);
       expect(cashSeatIds).toEqual(expectedCashSeatIds);
    } finally { await pool.end(); }
  });

  it("keeps published metadata immutable and rejects checksum, provenance, and promotion races", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const first = candidate(`rel_integration_first_${suffix}`);
    const second = candidate(`rel_integration_second_${suffix}`);
    const tampered = candidate(`rel_integration_tampered_${suffix}`);
    const orphaned = candidate(`rel_integration_orphaned_${suffix}`);
    const racing = candidate(`rel_integration_racing_${suffix}`);
    const guarded = candidate(`rel_integration_guarded_${suffix}`);
    try {
      await pool.query("SELECT PostGIS_Version()");
      await seedPrototypeManifest(pool, first, boundariesFor(first));
      const loaded = await loadPrototypeManifest(pool, first.release.id);
      expect(computeCanonicalDataChecksum(loaded)).toBe(computeCanonicalDataChecksum(first));
      expect(loaded.profileSeatCycleIds).toEqual(first.profileSeatCycleIds);
      await promoteCandidateRelease(pool, first.release.id);
      expect(computeCanonicalDataChecksum(await loadPrototypeManifest(pool, first.release.id))).toBe(first.canonicalDataChecksumSha256);
      second.release = { ...second.release, previousReleaseId: first.release.id };
      second.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(second);
      await seedPrototypeManifest(pool, second, boundariesFor(second));
      const checksums = await pool.query<{ release_id: string; content_checksum_sha256: string }>("SELECT release_id,content_checksum_sha256 FROM release_manifests WHERE release_id = ANY($1)", [[first.release.id, second.release.id]]);
      expect(new Set(checksums.rows.map((row) => row.content_checksum_sha256)).size).toBe(2);
      await promoteCandidateRelease(pool, second.release.id);
      for (const { name } of contentTableRegistry) {
        const guard = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=$1::regclass AND NOT t.tgisinternal AND p.proname IN ('guard_candidate_release_content','guard_nationwide_content')", [name]);
        expect(guard.rows[0]!.count).toBeGreaterThan(0);
      }
      expect(computeCanonicalDataChecksum(await loadPrototypeManifest(pool, first.release.id))).toBe(first.canonicalDataChecksumSha256);
      expect(computeCanonicalDataChecksum(await loadPrototypeManifest(pool, second.release.id))).toBe(second.canonicalDataChecksumSha256);
      await expect(rollbackPublishedRelease(pool)).resolves.toEqual({ publishedReleaseId: first.release.id, retiredReleaseId: second.release.id });
      expect((await pool.query("SELECT count(*)::int AS count FROM data_releases WHERE status='published'")).rows[0]?.count).toBe(1);
      expect(computeCanonicalDataChecksum(await loadPrototypeManifest(pool, first.release.id))).toBe(first.canonicalDataChecksumSha256);
      expect(computeCanonicalDataChecksum(await loadPrototypeManifest(pool, second.release.id))).toBe(second.canonicalDataChecksumSha256);
      await expect(pool.query("UPDATE release_manifests SET validated_at=now() WHERE release_id=$1", [first.release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE geography_versions SET label='mutated' WHERE release_id=$1", [first.release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE data_releases SET status='candidate', published_at=NULL WHERE id=$1", [first.release.id])).rejects.toMatchObject({ code: "42501" });
      await expect(pool.query("UPDATE data_releases SET label='rewritten' WHERE id=$1", [first.release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE data_releases SET source_cutoff=source_cutoff + interval '1 day' WHERE id=$1", [first.release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE data_releases SET created_at=created_at + interval '1 day' WHERE id=$1", [first.release.id])).rejects.toMatchObject({ code: "23514" });

      await expect(pool.query("UPDATE data_releases SET published_at=published_at + interval '1 day' WHERE id=$1", [first.release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE data_releases SET previous_release_id=NULL WHERE id=$1", [second.release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE data_releases SET status='published', previous_release_id=NULL WHERE id=$1", [second.release.id])).rejects.toMatchObject({ code: "42501" });

      await seedPrototypeManifest(pool, guarded, boundariesFor(guarded));
      // A candidate destination must not let a published row evade its source lock.
      await pool.query("DELETE FROM provenance WHERE release_id=$1 AND entity_type='people' AND entity_id='person_1'", [guarded.release.id]);
      await expect(pool.query("UPDATE provenance SET release_id=$2 WHERE release_id=$1 AND entity_type='people' AND entity_id='person_1'", [first.release.id, guarded.release.id])).rejects.toMatchObject({ code: "23514" });
      await pool.query("DELETE FROM contest_lineage WHERE release_id=$1 AND contest_id='contest_president_1'", [guarded.release.id]);
      await expect(pool.query("UPDATE contest_lineage SET release_id=$2 WHERE release_id=$1 AND contest_id='contest_president_1'", [first.release.id, guarded.release.id])).rejects.toMatchObject({ code: "23514" });
      expect(computeCanonicalDataChecksum(await loadPrototypeManifest(pool, first.release.id))).toBe(first.canonicalDataChecksumSha256);

      // Finance-summary lineage explains a missing summary, never a selected filing.
      await pool.query("INSERT INTO committees (release_id,id,source_committee_id,name,committee_type) VALUES ($1,'committee_finance','committee_finance','Finance committee','authorized')", [guarded.release.id]);
      await pool.query("INSERT INTO fec_filing_summaries (release_id,id,seat_cycle_id,committee_id,source_filing_id,report_type,reporting_period_start,reporting_period_end,filed_at,amendment_number,amendment_status,amends_filing_id,cash_on_hand,cash_on_hand_missing_reason,total_receipts,total_receipts_missing_reason,total_disbursements,total_disbursements_missing_reason,lineage_as_of,lineage_methodology,lineage_status) VALUES ($1,'filing_finance','seat_house_1','committee_finance','filing_finance','quarterly','2024-01-01','2024-03-31','2024-04-01T00:00:00Z',0,'new',NULL,1,NULL,1,NULL,1,NULL,'2024-04-01','reported','reported')", [guarded.release.id]);
      await expect(pool.query("UPDATE seat_finance_summaries SET filing_id='filing_finance', missing_reason=NULL, as_of=NULL WHERE release_id=$1 AND seat_cycle_id='seat_house_1'", [guarded.release.id])).rejects.toMatchObject({ code: "23514" });
      await pool.query("DELETE FROM seat_finance_summary_lineage WHERE release_id=$1 AND seat_cycle_id='seat_house_1'", [guarded.release.id]);
      await pool.query("UPDATE seat_finance_summaries SET filing_id='filing_finance', missing_reason=NULL, as_of=NULL WHERE release_id=$1 AND seat_cycle_id='seat_house_1'", [guarded.release.id]);
      await expect(pool.query("INSERT INTO seat_finance_summary_lineage (release_id,seat_cycle_id,snapshot_id,role) VALUES ($1,'seat_house_1','snap_1','derived_input')", [guarded.release.id])).rejects.toMatchObject({ code: "23514" });

      await seedPrototypeManifest(pool, tampered, boundariesFor(tampered));
      await pool.query("UPDATE geography_versions SET boundary=ST_Translate(boundary, 1, 0) WHERE release_id=$1", [tampered.release.id]);
      await expect(loadPrototypeManifest(pool, tampered.release.id)).rejects.toThrow("geometry boundary checksum mismatch");
      await expect(promoteCandidateRelease(pool, tampered.release.id)).rejects.toThrow("geometry boundary checksum mismatch");
      expect((await pool.query("SELECT status FROM data_releases WHERE id=$1", [tampered.release.id])).rows[0]?.status).toBe("candidate");

      await seedPrototypeManifest(pool, orphaned, boundariesFor(orphaned));
      await expect(pool.query("INSERT INTO provenance (release_id,entity_type,entity_id,snapshot_id,role) VALUES ($1,'unsupported','x','snap_1','original_publisher')", [orphaned.release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO provenance (release_id,entity_type,entity_id,snapshot_id,role) VALUES ($1,'people','missing','snap_1','original_publisher')", [orphaned.release.id])).rejects.toMatchObject({ code: "23503" });
      await pool.query("DELETE FROM election_result_lineage WHERE release_id=$1 AND result_option_id='option_1'", [orphaned.release.id]);
      await pool.query("DELETE FROM election_results WHERE release_id=$1 AND result_option_id='option_1'", [orphaned.release.id]);
      await pool.query("DELETE FROM result_options WHERE release_id=$1 AND id='option_1'", [orphaned.release.id]);
      await pool.query("DELETE FROM candidacies WHERE release_id=$1 AND id='candidacy_1'", [orphaned.release.id]);
      await pool.query("DELETE FROM people WHERE release_id=$1 AND id='person_1'", [orphaned.release.id]);
      await expect(loadPrototypeManifest(pool, orphaned.release.id)).rejects.toThrow();
      await expect(promoteCandidateRelease(pool, orphaned.release.id)).rejects.toThrow();

      await seedPrototypeManifest(pool, racing, boundariesFor(racing));
      const writer = await pool.connect();
      try {
        await writer.query("BEGIN");
        await writer.query("UPDATE sources SET name='race mutation' WHERE release_id=$1", [racing.release.id]);
        const promotion = promoteCandidateRelease(pool, racing.release.id);
        await waitForPromotionToBlock(pool);
        await writer.query("COMMIT");
        await expect(promotion).rejects.toThrow(/canonical data checksum does not match manifest content/i);
      } finally {
        await writer.query("ROLLBACK").catch(() => undefined);
        writer.release();
      }
      expect((await pool.query("SELECT status FROM data_releases WHERE id=$1", [racing.release.id])).rows[0]?.status).toBe("candidate");
    } finally {
      await pool.end();
    }
  });

  it("persists supported manifest and ACS units while rejecting unsupported versions and units", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const releaseId = "rel_contract_units";
    try {
      const manifest = candidate(releaseId);
      await seedPrototypeManifest(pool, manifest, boundariesFor(manifest));
      expect((await pool.query("SELECT 'license_unavailable'::missing_reason AS reason")).rows[0]?.reason).toBe("license_unavailable");
      await pool.query("INSERT INTO acs_variables(release_id,id,variable,label,unit,survey_period,universe,definition_kind,census_variable,published_moe_method) VALUES($1,'acs_source_contract','source_contract','Source','count','contract','all','source','B01001','published')", [releaseId]);
      await pool.query("INSERT INTO acs_variables(release_id,id,variable,label,unit,survey_period,universe,definition_kind,derivation_formula_version,moe_propagation_method) VALUES($1,'acs_ratio_contract','ratio_contract','Ratio','percent','contract','all','derived_ratio','v1','delta_method')", [releaseId]);
      await expect(pool.query("INSERT INTO acs_variables(release_id,id,variable,label,unit,survey_period,universe,definition_kind,derivation_formula_version,moe_propagation_method) VALUES($1,'acs_invalid_contract','invalid_contract','Invalid','percent','contract','all','derived','v1','delta_method')", [releaseId])).rejects.toMatchObject({ code: "23514" });
      expect((await pool.query("SELECT schema_version FROM release_manifests WHERE release_id=$1", [releaseId])).rows[0]?.schema_version).toBe(1);
      await pool.query("INSERT INTO release_manifests(release_id,schema_version,canonical_data_checksum_sha256,geometry_checksum_sha256,content_checksum_sha256) VALUES($1,2,$2,$2,$2) ON CONFLICT (release_id) DO UPDATE SET schema_version=2", [releaseId, "a".repeat(64)]);
      expect((await pool.query("SELECT schema_version FROM release_manifests WHERE release_id=$1", [releaseId])).rows[0]?.schema_version).toBe(2);
      await expect(pool.query("UPDATE release_manifests SET schema_version=3 WHERE release_id=$1", [releaseId])).rejects.toMatchObject({ code: "23514" });

      const geographyId = manifest.geographyVersions[0]!.id;
      const values = [releaseId, geographyId, "contract_years", "Contract years", "years"];
      await pool.query("INSERT INTO acs_observations(release_id,geography_version_id,variable,label,estimate,estimate_missing_reason,margin_of_error,margin_of_error_missing_reason,unit,survey_period,universe,lineage_as_of,lineage_methodology,lineage_status) VALUES($1,$2,$3,$4,42,NULL,1,NULL,$5,'contract','all','2024-01-01','contract','reported')", values);
      expect((await pool.query<{ unit: string }>("SELECT unit FROM acs_observations WHERE release_id=$1 AND variable='contract_years'", [releaseId])).rows[0]?.unit).toBe("years");
      await expect(pool.query("UPDATE acs_observations SET unit='furlongs' WHERE release_id=$1 AND variable='contract_years'", [releaseId])).rejects.toMatchObject({ code: "23514" });
    } finally { await pool.end(); }
  });

  it("has exact final 0002 snapshot catalog signatures after migration", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    // 0006 intentionally replaces signed-money/FEC staging checks; their final
    // signatures are asserted by the 0006 schema tests rather than this 0002 lock.
    const task2Tables = ["acs_variable_dependencies", "acs_variable_inputs", "acs_variables", "biographical_fact_provenance", "biographical_facts", "committee_assignment_provenance", "committee_assignments", "coverage_input_snapshots", "coverage_missing_reasons", "coverage_records", "election_decision_inputs", "election_decisions", "finance_aggregate_inputs", "funding_category_input_snapshots", "funding_organization_input_snapshots", "ingest_runs", "jurisdictions", "map_artifact_inputs", "map_artifacts", "nationwide_validation_gates", "outside_spending_input_snapshots", "quarantined_records", "release_content_digests", "snapshot_derivation_inputs", "snapshot_derivations", "stg_identity", "stg_tiger", "stg_acs", "stg_elections", "seat_cycles", "people", "contests", "result_options", "election_results"];
    try {
      const snapshot = JSON.parse(await readFile(resolve(process.cwd(), "drizzle/meta/0002_snapshot.json"), "utf8")) as { tables: Record<string, { columns: Record<string, { name: string; type: string; notNull: boolean; primaryKey: boolean }>; compositePrimaryKeys: Record<string, { columns: string[] }>; foreignKeys: Record<string, { columnsFrom: string[]; columnsTo: string[]; tableTo: string; onDelete: string; onUpdate: string }>; checkConstraints: Record<string, { value: string }>; indexes: Record<string, { isUnique: boolean; method: string; columns: Array<{ expression: string; asc: boolean; nulls: string }>; where?: string }> }> };
      const normalize = (value: string) => {
        let normalized = value.toLowerCase().replace(/"/g, "").replace(/\s+/g, "").replace(/public\./g, "").replace(new RegExp(`(?:${task2Tables.join("|")})\\.`, "g"), "").replace(/::[a-z_]+/g, "").replace(/=any\(array\[/g, "in(").replace(/\]\)/g, ")").replace(/ondelete(?:noaction)?onupdate(?:noaction)?/g, "").replace(/(\w+)between(\w+)and(\w+)/g, "$1>=$2and$1<=$3").replace(/}$/, "");
        let simplified: string;
        do {
          simplified = normalized;
          normalized = normalized.replace(/\((?![^()]*(?:\band\b|\bor\b))([^()]*)\)/g, "$1");
        } while (normalized !== simplified);
        while (normalized.startsWith("check((") && normalized.endsWith("))")) normalized = `check(${normalized.slice(7, -1)}`;
        return normalized.replace(/}$/, "").replace(/checkallocation_coverage_percentisnullorallocation_coverage_percent>=0andallocation_coverage_percentisnullorallocation_coverage_percent<=100$/, "checkallocation_coverage_percentisnullorallocation_coverage_percent>=0andallocation_coverage_percent<=100");
      };
      const physicalNames: Record<string, string> = {
        seat_cycles_release_id_id_pk: "seat_cycles_pkey",
        people_release_id_id_pk: "people_pkey",
        contests_release_id_id_pk: "contests_pkey",
        result_options_release_id_id_pk: "result_options_pkey",
        election_results_release_id_contest_id_result_option_id_pk: "election_results_pkey",
        seat_cycles_release_id_data_releases_id_fk: "seat_cycles_release_id_fkey",
        seat_cycles_release_id_office_id_offices_release_id_id_fk: "seat_cycles_release_id_office_id_fkey",
        seat_cycles_release_id_office_term_id_office_terms_release_id_id_fk: "seat_cycles_release_id_office_term_id_fkey",
        seat_cycles_release_id_geography_version_id_geography_versions_release_id_id_fk: "seat_cycles_release_id_geography_version_id_fkey",
        people_release_id_data_releases_id_fk: "people_release_id_fkey",
        contests_release_id_data_releases_id_fk: "contests_release_id_fkey",
        contests_release_id_seat_cycle_id_seat_cycles_release_id_id_fk: "contests_release_id_seat_cycle_id_fkey",
        contests_release_id_geography_version_id_geography_versions_release_id_id_fk: "contests_release_id_geography_version_id_fkey",
        result_options_release_id_data_releases_id_fk: "result_options_release_id_fkey",
        result_options_release_id_contest_id_contests_release_id_id_fk: "result_options_release_id_contest_id_fkey",
        result_options_release_id_candidacy_id_contest_id_candidacies_release_id_id_contest_id_fk: "result_options_release_id_candidacy_id_contest_id_fkey",
        election_results_release_id_data_releases_id_fk: "election_results_release_id_fkey",
        election_results_release_id_contest_id_contests_release_id_id_fk: "election_results_release_id_contest_id_fkey",
        election_results_release_id_result_option_id_contest_id_result_options_release_id_id_contest_id_fk: "election_results_release_id_result_option_id_contest_id_fkey",
        seat_cycles_natural_uq: "seat_cycles_release_id_office_id_cycle_year_election_kind_key",
        result_options_contest_id_uq: "result_options_release_id_contest_id_id_key",
        contests_denominator_ck: "contests_check",
        contests_allocation_ck: "contests_check1",
        election_results_votes_ck: "election_results_check",
        biographical_fact_provenance_release_id_person_id_fact_effective_at_biographical_facts_release_id_person_id_fact_effective_at_fk: "biographical_fact_provenance_fact_fk",
        committee_assignment_provenance_release_id_person_id_committee_id_role_name_effective_from_committee_assignments_release_id_person_id_committee_id_role_effective_from_fk: "committee_assignment_provenance_assignment_fk",
        funding_category_input_snapshots_release_id_seat_cycle_id_category_coverage_through_methodology_version_funding_category_aggregates_release_id_seat_cycle_id_category_coverage_through_methodology_version_fk: "funding_category_input_snapshots_aggregate_fk",
        outside_spending_input_snapshots_release_id_seat_cycle_id_coverage_through_methodology_version_outside_spending_aggregates_release_id_seat_cycle_id_coverage_through_methodology_version_fk: "outside_spending_input_snapshots_aggregate_fk",
      };
      const physicalName = (name: string) => physicalNames[name] ?? name.slice(0, 63);
      const catalog = await pool.query<{ table_name: string; object_name: string; object_type: string; definition: string }>("SELECT c.relname table_name, con.conname object_name, con.contype::text object_type, pg_get_constraintdef(con.oid) definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' UNION ALL SELECT c.relname, i.relname, 'i', pg_get_indexdef(i.oid) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT x.indisprimary");
      const actual = new Map(catalog.rows.map((row) => [`${row.table_name}:${row.object_name}`, row]));
      const expected = task2Tables.flatMap((table) => { const d = snapshot.tables[`public.${table}`]!; const inlinePrimaryKeys = Object.values(d.columns).filter((column) => column.primaryKey).map((column) => column.name); return [...(inlinePrimaryKeys.length ? [[table, `${table}_pkey`, `PRIMARY KEY (${inlinePrimaryKeys.join(",")})`]] : []), ...Object.entries(d.compositePrimaryKeys).map(([name, v]) => [table, name, `PRIMARY KEY (${v.columns.join(",")})`]), ...Object.entries(d.foreignKeys).map(([name, v]) => [table, name, `FOREIGN KEY (${v.columnsFrom.join(",")}) REFERENCES ${v.tableTo}(${v.columnsTo.join(",")}) ON DELETE ${v.onDelete} ON UPDATE ${v.onUpdate}`]), ...Object.entries(d.checkConstraints).map(([name, v]) => [table, name, `CHECK (${v.value})`]), ...Object.entries(d.indexes).map(([name, v]) => [table, name, `CREATE ${v.isUnique ? "UNIQUE " : ""}INDEX ${physicalName(name)} ON ${table} USING ${v.method} (${v.columns.map((c) => `${c.expression}${c.asc ? "" : " DESC"}${c.nulls === (c.asc ? "last" : "first") ? "" : ` NULLS ${c.nulls.toUpperCase()}`}`).join(",")})${v.where ? ` WHERE ${v.where}` : ""}`])]; });
      expect(new Set(expected.map(([table, name]) => `${table}:${physicalName(name as string)}`)).size).toBe(expected.length);
      for (const [table, name, signature] of expected) expect(normalize(actual.get(`${table}:${physicalName(name as string)}`)?.definition ?? ""), `${table}:${name}`).toBe(normalize(signature));
      expect(expected.length).toBeGreaterThan(0);
    } finally { await pool.end(); }
  });

  it("enforces the ingest-run lifecycle and candidate-only operational rows", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const releaseId = "rel_contract_ingest";
    try {
      const manifest = candidate(releaseId);
      await seedPrototypeManifest(pool, manifest, boundariesFor(manifest));
      await expect(pool.query("INSERT INTO jurisdictions(release_id,jurisdiction_code,house_representation,senate_representation) VALUES($1,'XX','invalid','two_seats')", [releaseId])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO jurisdictions(release_id,jurisdiction_code,house_representation,senate_representation) VALUES($1,'XY','voting','invalid')", [releaseId])).rejects.toMatchObject({ code: "23514" });
      const insertRun = "INSERT INTO ingest_runs(id,release_id,source_id,adapter_version,started_at,completed_at,status,extracted_count,staged_count,quarantined_count) VALUES($1,$2,$3,'contract',now(),now(),$4,1,0,0)";
      for (const status of ["validated", "loaded", "failed"]) await expect(pool.query(insertRun, [`run_direct_${status}`, releaseId, manifest.sources[0]!.id, status])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO ingest_runs(id,release_id,source_id,adapter_version,started_at,completed_at,status,extracted_count,staged_count,quarantined_count) VALUES($1,$2,$3,'contract',now(),NULL,'running',1,1,0)", ["run_direct_staged", releaseId, manifest.sources[0]!.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO ingest_runs(id,release_id,source_id,adapter_version,started_at,completed_at,status,extracted_count,staged_count,quarantined_count) VALUES($1,$2,$3,'contract',now(),NULL,'running',1,0,1)", ["run_direct_quarantined", releaseId, manifest.sources[0]!.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO ingest_runs(id,release_id,source_id,adapter_version,started_at,completed_at,status,extracted_count,staged_count,quarantined_count) VALUES($1,$2,$3,'contract',now(),NULL,'running',1,0,0)", ["run_direct_running", releaseId, manifest.sources[0]!.id])).rejects.toMatchObject({ code: "23514" });
      const contractRun = strictRun("run_contract", releaseId, manifest.sources[0]!.id, 3);
      await startIngestRun(pool, contractRun);
      await expect(heartbeat(pool, "run_contract", contractRun.leaseToken, contractRun.leaseDurationMs)).resolves.toBeUndefined();
      await expect(failExpiredRun(pool, "run_contract", contractRun.leaseToken)).rejects.toThrow();
      expect((await pool.query<{ staged_count: number; quarantined_count: number }>("SELECT staged_count,quarantined_count FROM ingest_runs WHERE id='run_contract'")).rows[0]).toEqual({ staged_count: 0, quarantined_count: 0 });
      await recordStageBatch(pool, "run_contract", contractRun.leaseToken, 2, contractRun.leaseDurationMs);
      await recordQuarantineBatch(pool, "run_contract", contractRun.leaseToken, 1, contractRun.leaseDurationMs);
      await expect(recordStageBatch(pool, "run_contract", contractRun.leaseToken, 1, contractRun.leaseDurationMs)).rejects.toThrow();
      await expect(pool.query("UPDATE ingest_runs SET staged_count=1 WHERE id='run_contract'")).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE ingest_runs SET extracted_count=2 WHERE id='run_contract'")).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO quarantined_records(run_id,release_id,source_natural_key,snapshot_id,payload_checksum,parser_error_code,redacted_diagnostic) VALUES('run_contract',$1,'secret','snap_1',$2,'parse','contributor@example.test')", [releaseId, "b".repeat(64)])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO quarantined_records(run_id,release_id,source_natural_key,snapshot_id,payload_checksum,parser_error_code,redacted_diagnostic) VALUES('run_contract',$1,'address','snap_1',$2,'parse','street address omitted')", [releaseId, "c".repeat(64)])).rejects.toMatchObject({ code: "23514" });
      await expect(markValidated(pool, "run_contract", contractRun.leaseToken)).resolves.toBeUndefined();
      await expect(markLoaded(pool, "run_contract", contractRun.leaseToken)).resolves.toBeUndefined();
      await expect(pool.query("INSERT INTO stg_identity(run_id,release_id,source_natural_key,snapshot_id,entity_id,source_entity_id,display_name) VALUES('run_contract',$1,'loaded-write','snap_1','entity','source','Name')", [releaseId])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO quarantined_records(run_id,release_id,source_natural_key,snapshot_id,payload_checksum,parser_error_code,redacted_diagnostic) VALUES('run_contract',$1,'loaded-write','snap_1',$2,'parse','redacted')", [releaseId, "e".repeat(64)])).rejects.toMatchObject({ code: "23514" });
      await expect(markFailed(pool, "run_contract", contractRun.leaseToken)).rejects.toThrow();
      await expect(pool.query("UPDATE ingest_runs SET status='loaded' WHERE id='run_contract'")).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE ingest_runs SET source_id='rewritten' WHERE id='run_contract'")).rejects.toMatchObject({ code: "23514" });
      await expect(startIngestRun(pool, strictRun("run_wrong_source", releaseId, "not_this_release", 0))).rejects.toThrow();

      const failedRun = { ...strictRun("run_failed", releaseId, manifest.sources[0]!.id, 1), adapterVersion: "contract-failed" };
      await startIngestRun(pool, failedRun);
      await expect(markFailed(pool, "run_failed", failedRun.leaseToken)).resolves.toBeUndefined();
      await expect(pool.query("INSERT INTO stg_acs(run_id,release_id,source_natural_key,snapshot_id,geography,variable,survey_period,unit) VALUES('run_failed',$1,'failed-write','snap_1','geo','var','2024','count')", [releaseId])).rejects.toMatchObject({ code: "23514" });
      await expect(recordQuarantineBatch(pool, "run_failed", failedRun.leaseToken, 1, failedRun.leaseDurationMs)).rejects.toThrow();
      await promoteCandidateRelease(pool, releaseId);
      await expect(pool.query("INSERT INTO stg_identity(run_id,release_id,source_natural_key,snapshot_id,entity_id,source_entity_id,display_name) VALUES('run_contract',$1,'published-write','snap_1','entity','source','Name')", [releaseId])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("INSERT INTO quarantined_records(run_id,release_id,source_natural_key,snapshot_id,payload_checksum,parser_error_code,redacted_diagnostic) VALUES('run_contract',$1,'published-write','snap_1',$2,'parse','redacted')", [releaseId, "d".repeat(64)])).rejects.toMatchObject({ code: "23514" });
    } finally { await pool.end(); }
  });

  it("baselines every registered v1 row with release-independent canonical domain digests", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const sourceId = "rel_contract_baseline_source";
    const targetId = "rel_contract_baseline_target";
    try {
      const source = candidate(sourceId);
      const target = candidate(targetId);
      target.release = { ...target.release, label: "Baselined v1 candidate", sourceCutoff: source.release.sourceCutoff, createdAt: "2025-01-02T00:00:00.000Z" };
      await seedPrototypeManifest(pool, source, boundariesFor(source));
      await promoteCandidateRelease(pool, sourceId);
      await pool.query("INSERT INTO data_releases (id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [target.release.id, target.release.label, target.release.status, target.release.sourceCutoff, target.release.createdAt, target.release.publishedAt, target.release.previousReleaseId]);
      await baselineCandidateRelease(pool, sourceId, targetId);
      const loaded = await loadPrototypeManifest(pool, targetId);
      expect(loaded.release).toMatchObject({ id: targetId, label: target.release.label, status: "candidate" });
      expect(computeCanonicalDataChecksum(loaded)).toBe((await pool.query<{ canonical_data_checksum_sha256: string }>("SELECT canonical_data_checksum_sha256 FROM release_manifests WHERE release_id=$1", [targetId])).rows[0]!.canonical_data_checksum_sha256);
      expect((await pool.query<{ validated_at: Date | null }>("SELECT validated_at FROM release_manifests WHERE release_id=$1", [targetId])).rows[0]?.validated_at).toBeNull();
      expect((await pool.query("SELECT 1 FROM nationwide_validation_gates WHERE release_id=$1", [targetId])).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM release_content_digests WHERE release_id=$1", [targetId])).rowCount).toBe(0);
      for (const table of Object.values(contentDomains).flat()) {
        const sourceCount = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table} WHERE release_id=$1`, [sourceId]);
        const targetCount = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table} WHERE release_id=$1`, [targetId]);
        expect(targetCount.rows[0]!.count).toBe(sourceCount.rows[0]!.count);
      }
      await pool.query("SET TIME ZONE 'America/Los_Angeles'");
      for (const domain of Object.keys(contentDomains) as Array<keyof typeof contentDomains>) {
        expect(await computeReleaseDigest(pool, targetId, domain)).toEqual(await computeReleaseDigest(pool, sourceId, domain));
      }
      expect((await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM sources WHERE release_id=$1", [targetId])).rows[0]!.count).toBeGreaterThan(0);
      await expect(baselineCandidateRelease(pool, sourceId, targetId)).rejects.toThrow();
    } finally { await pool.end(); }
  });

  it("rejects a v1 baseline with a different cutoff before copying content", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const sourceId = "rel_contract_baseline_cutoff_source";
    const targetId = "rel_contract_baseline_cutoff_target";
    try {
      const source = candidate(sourceId);
      const target = candidate(targetId);
      target.release = { ...target.release, label: "Mismatched v1 candidate", sourceCutoff: "2025-01-01T00:00:00.000Z" };
      await seedPrototypeManifest(pool, source, boundariesFor(source));
      await promoteCandidateRelease(pool, sourceId);
      await pool.query("INSERT INTO data_releases (id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [target.release.id, target.release.label, target.release.status, target.release.sourceCutoff, target.release.createdAt, target.release.publishedAt, target.release.previousReleaseId]);
      await expect(baselineCandidateRelease(pool, sourceId, targetId)).rejects.toThrow("candidate source cutoff to equal the source release cutoff");
      expect((await pool.query("SELECT 1 FROM release_manifests WHERE release_id=$1", [targetId])).rowCount).toBe(0);
      for (const table of contentTableRegistry) expect((await pool.query(`SELECT 1 FROM ${table.name} WHERE release_id=$1 LIMIT 1`, [targetId])).rowCount).toBe(0);
    } finally { await pool.end(); }
  });

  it("requires a complete, content-bound nationwide validation gate before v2 can promote", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      await seedNationwideCandidateManifest(pool, manifest, bundle);
      expect((await loadNationwideManifest(pool, manifest.release.id)).biographicalFacts.find((fact) => fact.fact === "birth_date")?.value).toEqual({ kind: "value", value: "1970-01-02" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await validateNationwideCandidateReleaseWithClient(client, manifest.release.id);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally { client.release(); }
      const before = await pool.query("SELECT row_to_json(g) gate, (SELECT jsonb_agg(row_to_json(d) ORDER BY d.domain) FROM release_content_digests d WHERE d.release_id=$1) digests FROM nationwide_validation_gates g WHERE g.release_id=$1", [manifest.release.id]);
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).resolves.toBeUndefined();
      const after = await pool.query("SELECT row_to_json(g) gate, (SELECT jsonb_agg(row_to_json(d) ORDER BY d.domain) FROM release_content_digests d WHERE d.release_id=$1) digests FROM nationwide_validation_gates g WHERE g.release_id=$1", [manifest.release.id]);
      expect(after.rows).toEqual(before.rows);

      await pool.query("DELETE FROM nationwide_validation_gates WHERE release_id=$1", [manifest.release.id]);
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await pool.query("UPDATE nationwide_validation_gates SET domain_checksum_sha256=$2 WHERE release_id=$1", [manifest.release.id, "f".repeat(64)]);
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await pool.query("DELETE FROM release_content_digests WHERE release_id=$1 AND domain='maps'", [manifest.release.id]);
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await expect(pool.query("INSERT INTO release_content_digests(release_id,domain,row_count,sha256,validated_at) VALUES($1,'forged',0,$2,now())", [manifest.release.id, "a".repeat(64)])).rejects.toMatchObject({ code: "23514" });
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).resolves.toBeUndefined();
      await pool.query("UPDATE release_content_digests SET sha256=$2 WHERE release_id=$1 AND domain='maps'", [manifest.release.id, "b".repeat(64)]);
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await pool.query("UPDATE sources SET name='semantic corruption' WHERE release_id=$1", [manifest.release.id]);
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).rejects.toThrow();
      await expect(promoteCandidateRelease(pool, manifest.release.id)).rejects.toThrow();
    } finally { await pool.end(); }
  }, 60_000);

  it("publishes, rolls back, and rolls forward a validated nationwide release through the repository page", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const v1 = candidate("rel_task5_v1");
      const { manifest: v2, bundle } = persistedNationwideSkeleton();
      await seedPrototypeManifest(pool, v1, boundariesFor(v1));
      await promoteCandidateRelease(pool, v1.release.id);
      v2.release = { ...v2.release, previousReleaseId: v1.release.id };
      v2.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(v2);
      await seedNationwideCandidateManifest(pool, v2, bundle);
      await expect(promoteCandidateRelease(pool, v2.release.id)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, v2.release.id);
      await promoteCandidateRelease(pool, v2.release.id);

      const repository = new PostgresSeatResearchRepository(pool);
      expect(await repository.getActiveRelease()).toMatchObject({ id: v2.release.id, status: "published" });
      const expectedSeatIds = new Set(v2.seatCycles.map((cycle) => cycle.id));
      const expectedVacancies = v2.seatCycles.filter((cycle) => cycle.occupancy.status === "vacant");
      expect(expectedSeatIds.size).toBe(541);
      expect(expectedVacancies).toHaveLength(4);

      // A non-dividing page size makes both the final page and each keyset hand-off
      // observable against the real nationwide SQL projection.
      const pageAll = async (sort: "state" | "cash_on_hand" | "presidential_margin_2024", direction: "asc" | "desc", request: Record<string, unknown> = {}) => {
        const items = []; let cursor: string | undefined;
        for (;;) {
          const page = await repository.listSeatPage(v2.release.id, { sort, direction, limit: 100, ...request, ...(cursor ? { cursor } : {}) } as never);
          expect(page).toMatchObject({ releaseId: v2.release.id, total: expectedSeatIds.size });
          items.push(...page.items);
          if (page.nextCursor === null) return items;
          cursor = page.nextCursor;
        }
      };
      const stateItems = await pageAll("state", "asc");
      expect(stateItems).toHaveLength(expectedSeatIds.size);
      expect(new Set(stateItems.map((item) => item.id))).toEqual(expectedSeatIds);
      expect(stateItems.filter((item) => expectedVacancies.some((cycle) => cycle.id === item.id)).every((item) => item.incumbentName === null && item.incumbentParty === null)).toBe(true);

      // There are no presidential data rows in this manifest and no usable cash
      // values.  Every null sort key must retain the bytewise ascending seat-id tie
      // regardless of direction.
      for (const sort of ["presidential_margin_2024", "cash_on_hand"] as const) for (const direction of ["asc", "desc"] as const) {
        const items = await pageAll(sort, direction);
        expect(items.map((item) => item.id)).toEqual([...items.map((item) => item.id)].sort());
      }
      for (const item of stateItems) {
        expect(item.presidentialMargin2024).toMatchObject({ kind: "coverage_missing", value: { kind: "missing", reason: "not_collected" }, reason: "not_collected", methodology: "coverage_missing", status: "reported" });
        expect(item.cashOnHand.kind).toBe("missing");
        if (item.cashOnHand.kind === "missing") expect(item.cashOnHand.reason).toBe("not_collected");
      }

      const delegate = v2.seatCycles.find((cycle) => v2.offices.find((office) => office.id === cycle.officeId)?.kind === "house_delegate")!;
      const residentCommissioner = v2.seatCycles.find((cycle) => v2.offices.find((office) => office.id === cycle.officeId)?.kind === "resident_commissioner")!;
      const senate = v2.seatCycles.find((cycle) => v2.offices.find((office) => office.id === cycle.officeId)?.chamber === "senate")!;
      const identity = stateItems.find((item) => item.id === delegate.id)!;
      for (const [field, value] of [["identitySearch", identity.label], ["identitySearch", identity.stateCode], ["identitySearch", identity.districtCode], ["identitySearch", identity.incumbentName]] as const) {
        const page = await repository.listSeatPage(v2.release.id, { sort: "state", direction: "asc", limit: 100, [field]: value! });
        expect(page.items.map((item) => item.id)).toContain(delegate.id);
      }
      const expectedFilterTotals = [
        [{ chamber: "house" }, v2.offices.filter((office) => office.chamber === "house").length],
        [{ chamber: "senate" }, v2.offices.filter((office) => office.chamber === "senate").length],
        [{ stateCode: identity.stateCode }, v2.offices.filter((office) => office.stateCode === identity.stateCode).length],
        [{ party: "other" }, v2.memberships.length],
        [{ incumbencyStatus: "unknown" }, v2.seatCycles.filter((cycle) => cycle.incumbencyStatus === "unknown").length],
        [{ electionYear: 2024 }, v2.seatCycles.filter((cycle) => cycle.cycleYear === 2024).length],
      ] as const;
      for (const [request, total] of expectedFilterTotals) expect((await repository.listSeatPage(v2.release.id, { sort: "state", direction: "asc", limit: 100, ...request })).total).toBe(total);
      expect((await repository.listSeatPage(v2.release.id, { sort: "state", direction: "asc", limit: 100, identitySearch: "synthetic demographic only" })).total).toBe(0);
      expect(stateItems.map((item) => item.id)).toContain(senate.id);
      expect(stateItems.map((item) => item.id)).toContain(residentCommissioner.id);

      expect(await repository.getSeatListItem(v2.release.id, delegate.id)).toMatchObject({ id: delegate.id, chamber: "house" });
      expect(await repository.getSeatListItem(v2.release.id, "seat_missing" as never)).toBeNull();
      const delegateProfile = await repository.getSeatProfile(v2.release.id, delegate.id);
      const vacancyProfile = await repository.getSeatProfile(v2.release.id, expectedVacancies[0]!.id);
      const expectedClosure = [...new Set([...(delegate.provenance ?? []).map((ref) => ref.snapshotId), ...(v2.offices.find((office) => office.id === delegate.officeId)!.provenance ?? []).map((ref) => ref.snapshotId), ...v2.coverageRecords.filter((record) => record.domain === "election_2024" || (record.domain === "finance" && record.scope.kind === "funding" && record.scope.seatCycleId === delegate.id)).flatMap((record) => record.inputSnapshotIds)])].sort();
      expect(delegateProfile).toMatchObject({ office: { id: delegate.officeId, kind: "house_delegate" }, seatCycle: { id: delegate.id }, contests: [], demographics: [], finance: [] });
      expect(delegateProfile?.snapshots.map((snapshot) => snapshot.id)).toEqual(expectedClosure);
      expect(delegateProfile?.sources).toEqual(v2.sources);
      const vacancy = expectedVacancies[0]!;
      // Vacancy suppresses only the incumbent identity. Its independently sourced
      // contest and finance facts remain visible, exactly as in the manifest projection.
      expect(vacancyProfile).toMatchObject({ membership: null, incumbent: null, contests: v2.contests.filter((contest) => contest.seatCycleId === vacancy.id), demographics: v2.acsObservations.filter((observation) => observation.geographyVersionId === vacancy.geographyVersionId), finance: v2.fecFilingSummaries.filter((summary) => summary.seatCycleId === vacancy.id) });
      expect(await repository.listSources(v2.release.id)).toEqual(v2.sources);
      expect(await repository.listSourceSnapshots(v2.release.id)).toEqual([...v2.snapshots].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      expect(await repository.getSeatFacets(v2.release.id)).toEqual({ states: [...new Set(v2.offices.map((office) => office.stateCode))].sort(), parties: ["other"], incumbencyStatuses: ["unknown"], electionYears: [2024] });

      const first = await repository.listSeatPage(v2.release.id, { sort: "state", direction: "asc", limit: 37 });
      await expect(repository.listSeatPage(v1.release.id, { sort: "state", direction: "asc", limit: 37, cursor: first.nextCursor! })).rejects.toThrow("does not match");
      await expect(repository.listSeatPage(v2.release.id, { sort: "state", direction: "desc", limit: 37, cursor: first.nextCursor! })).rejects.toThrow("does not match");
      await expect(repository.listSeatPage(v2.release.id, { sort: "state", direction: "asc", limit: 37, cursor: "not-a-cursor" })).rejects.toThrow();
      expect(await repository.listSeatPage("rel_missing" as never, { sort: "state", direction: "asc", limit: 37 })).toMatchObject({ total: 0, items: [], nextCursor: null });
      await expect(rollbackPublishedRelease(pool)).resolves.toEqual({ publishedReleaseId: v1.release.id, retiredReleaseId: v2.release.id });
      await expect(rollForwardRetiredRelease(pool, v2.release.id)).resolves.toEqual({ publishedReleaseId: v2.release.id, retiredReleaseId: v1.release.id });
      expect(await repository.getActiveRelease()).toMatchObject({ id: v2.release.id, status: "published" });
      expect((await repository.listSeatPage(v2.release.id, { sort: "state", direction: "asc", limit: 25 })).total).toBe(541);

      const unrelated = candidate("rel_task5_unrelated");
      await seedPrototypeManifest(pool, unrelated, boundariesFor(unrelated));
      await expect(promoteCandidateRelease(pool, unrelated.release.id)).rejects.toThrow(/wrong promotion branch/);
      await expect(rollForwardRetiredRelease(pool, v1.release.id)).rejects.toThrow(/direct successor/);
    } finally { await pool.end(); }
  }, 60_000);

  it("baselines a validated v2 candidate with rewritten release metadata and a fresh gate", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      const targetId = "rel_synthetic_baseline";
      await seedNationwideCandidateManifest(pool, manifest, bundle);
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'Baselined nationwide candidate','candidate',$2,$3,NULL,NULL)", [targetId, manifest.release.sourceCutoff, "2024-01-03T00:00:00.000Z"]);
      await baselineCandidateRelease(pool, manifest.release.id, targetId);
      const loaded = await loadNationwideManifest(pool, targetId);
      expect(loaded.release).toMatchObject({ id: targetId, label: "Baselined nationwide candidate", status: "candidate", sourceCutoff: manifest.release.sourceCutoff, createdAt: "2024-01-03T00:00:00.000Z" });
      expect(loaded.biographicalFacts.find((fact) => fact.fact === "birth_date")!.value).toEqual({ kind: "value", value: "1970-01-02" });
      for (const domain of Object.keys(contentDomains) as Array<keyof typeof contentDomains>) expect(await computeReleaseDigest(pool, targetId, domain)).toEqual(await computeReleaseDigest(pool, manifest.release.id, domain));
      expect((await pool.query("SELECT 1 FROM nationwide_validation_gates WHERE release_id=$1", [targetId])).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM release_content_digests WHERE release_id=$1", [targetId])).rowCount).toBe(0);
      await expect(recheckNationwideValidationGate(pool, targetId)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, targetId);
      await expect(recheckNationwideValidationGate(pool, targetId)).resolves.toBeUndefined();
    } finally { await pool.end(); }
  }, 60_000);

  it("atomically enriches a same-cutoff v2 baseline from locked member identities", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      manifest.biographicalFacts = [];
      manifest.committeeAssignments = [];
      Object.assign(manifest.coverageRecords.find((record) => record.domain === "member")!, { status: "not_collected", expectedCount: 537, observedCount: 0, missingByReason: [{ reason: "not_collected", count: 537 }] });
      manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest);
      await seedNationwideCandidateManifest(pool, manifest, bundle);
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await promoteCandidateRelease(pool, manifest.release.id);
      const targetId = "rel_member_enrichment";
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'Member enrichment','candidate',$2,$3,NULL,$4)", [targetId, manifest.release.sourceCutoff, "2024-01-03T00:00:00.000Z", manifest.release.id]);
      await enrichCandidateMembersFromBaseline(pool, manifest.release.id, targetId);
      const loaded = await loadNationwideManifest(pool, targetId);
      expect(loaded.release.status).toBe("candidate");
      expect(loaded.biographicalFacts).toHaveLength(1074);
      expect(loaded.committeeAssignments).toHaveLength(0);
      expect(loaded.coverageRecords.find((record) => record.domain === "member" && record.scope.kind === "release")).toMatchObject({ status: "complete", expectedCount: 537, observedCount: 537, missingByReason: [], quarantinedCount: 0, incompatibleCount: 0 });
      expect((await pool.query("SELECT domain FROM release_content_digests WHERE release_id=$1", [targetId])).rowCount).toBe(7);
      await expect(recheckNationwideValidationGate(pool, targetId)).resolves.toBeUndefined();
      expect((await loadNationwideManifest(pool, manifest.release.id)).biographicalFacts).toHaveLength(0);
      await expect(verifyPersistedTask6MemberCandidate(pool, targetId, manifest.release.id)).resolves.toEqual({ observed: 537, expected: 537, biographicalFactCount: 1074, committeeAssignmentCount: 0 });
      // Queue the verifier ahead of a writer on the release row.  Releasing the
      // holder lets PostgreSQL grant the verifier's lock first; the writer cannot
      // interleave between its gate recheck and invariant read.
      const holder = await pool.connect();
      await holder.query("BEGIN");
      await holder.query("SELECT 1 FROM data_releases WHERE id=$1 FOR UPDATE", [targetId]);
      let verified = false;
      const verification = verifyPersistedTask6MemberCandidate(pool, targetId, manifest.release.id).then((value) => { verified = true; return value; });
      const mutation = pool.query("UPDATE data_releases SET label=label WHERE id=$1", [targetId]);
      await Promise.resolve();
      expect(verified).toBe(false);
      await holder.query("COMMIT");
      holder.release();
      await expect(verification).resolves.toMatchObject({ observed: 537 });
      await expect(mutation).resolves.toMatchObject({ rowCount: 1 });
      const tampered = async (id: string): Promise<void> => {
        await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,$2,'candidate',$3,$4,NULL,$5)", [id, id, manifest.release.sourceCutoff, "2024-01-03T00:00:00.000Z", manifest.release.id]);
        await enrichCandidateMembersFromBaseline(pool, manifest.release.id, id);
      };
      const exactDobId = "rel_member_enrichment_exact_dob";
      await tampered(exactDobId);
      await pool.query("UPDATE biographical_facts SET value='1970-01-02',value_missing_reason=NULL WHERE ctid IN (SELECT ctid FROM biographical_facts WHERE release_id=$1 AND fact='birth_date' LIMIT 1)", [exactDobId]);
      await expect(assertPersistedTask6MemberInvariant(pool, exactDobId, manifest.release.id)).rejects.toThrow("Persisted Task 6");
      const provenanceMismatchId = "rel_member_enrichment_provenance_mismatch";
      await tampered(provenanceMismatchId);
      await pool.query("DELETE FROM coverage_input_snapshots WHERE release_id=$1 AND domain='member'", [provenanceMismatchId]);
      await expect(assertPersistedTask6MemberInvariant(pool, provenanceMismatchId, manifest.release.id)).rejects.toThrow("Persisted Task 6");
      const unrelatedSnapshotId = "snap_task6_unrelated";
      const unrelatedProvenanceId = "rel_member_enrichment_unrelated_provenance";
      await tampered(unrelatedProvenanceId);
      await pool.query("INSERT INTO source_snapshots(release_id,id,source_id,source_url,published_at,retrieved_at,checksum_sha256,parser_version,license,usage_status) SELECT $1,$2,source_id,source_url,published_at,retrieved_at,checksum_sha256,parser_version,license,'approved' FROM source_snapshots WHERE release_id=$1 LIMIT 1", [unrelatedProvenanceId, unrelatedSnapshotId]);
      await pool.query("INSERT INTO biographical_fact_provenance(release_id,person_id,fact,effective_at,snapshot_id,role) SELECT release_id,person_id,fact,effective_at,$2,role FROM biographical_fact_provenance WHERE release_id=$1 LIMIT 1", [unrelatedProvenanceId, unrelatedSnapshotId]);
      await pool.query("INSERT INTO coverage_input_snapshots(release_id,domain,scope_key,snapshot_id) SELECT release_id,domain,scope_key,$2 FROM coverage_records WHERE release_id=$1 AND domain='member' AND scope_kind='release'", [unrelatedProvenanceId, unrelatedSnapshotId]);
      await expect(assertPersistedTask6MemberInvariant(pool, unrelatedProvenanceId, manifest.release.id)).rejects.toThrow("Persisted Task 6");
      const bioguideMismatchId = "rel_member_enrichment_bioguide_mismatch";
      await tampered(bioguideMismatchId);
      const mismatchedPerson = (await pool.query<{ person_id: string }>("SELECT person_id FROM biographical_facts WHERE release_id=$1 AND fact='bioguide_id' LIMIT 1", [bioguideMismatchId])).rows[0]!.person_id;
      await pool.query("UPDATE people SET bioguide_id='B999999' WHERE release_id=$1 AND id=$2", [bioguideMismatchId, mismatchedPerson]);
      await pool.query("UPDATE biographical_facts SET value='B999999' WHERE release_id=$1 AND person_id=$2 AND fact='bioguide_id'", [bioguideMismatchId, mismatchedPerson]);
      await expect(assertPersistedTask6MemberInvariant(pool, bioguideMismatchId, manifest.release.id)).rejects.toThrow("Persisted Task 6");
      expect((await loadNationwideManifest(pool, manifest.release.id)).biographicalFacts).toHaveLength(0);
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES('rel_member_enrichment_bad','Bad','candidate',$1,$2,NULL,NULL)", ["2024-01-02T00:00:00.000Z", "2024-01-03T00:00:00.000Z"]);
      await expect(enrichCandidateMembersFromBaseline(pool, manifest.release.id, "rel_member_enrichment_bad")).rejects.toThrow();
      expect((await pool.query("SELECT 1 FROM sources WHERE release_id='rel_member_enrichment_bad' LIMIT 1")).rowCount).toBe(0);
    } finally { await pool.end(); }
  }, 600_000); // runner Postgres finishes this in several minutes; peers already carry multi-minute budgets

  it("finalizes Task 7 ACS, Task 8 FEC, and reviewed Task 9 election decisions atomically", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const rawRoot = await mkdtemp(join(tmpdir(), "acs-task7-integration-"));
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      const fipsByState = new Map<string, string>(Object.entries(TIGER_2025_JURISDICTIONS).map(([fips, state]) => [state, fips]));
      const nonVotingJurisdictions = new Set(["DC", "AS", "GU", "MP", "PR", "VI"]);
      const houseGeoidChanges = new Map<string, string>();
      for (const geography of manifest.geographyVersions.filter((value) => value.kind === "house_district")) {
        const stateFips = fipsByState.get(geography.stateCode);
        if (!stateFips) throw new Error(`Missing TIGER FIPS for ${geography.stateCode}`);
        const sourceDistrictCode = nonVotingJurisdictions.has(geography.stateCode) ? "98" : geography.districtCode === "AL" ? "00" : geography.districtCode!.padStart(2, "0");
        houseGeoidChanges.set(geography.sourceGeoid!, `${stateFips}${sourceDistrictCode}`);
        Object.assign(geography, { sourceGeoid: `${stateFips}${sourceDistrictCode}`, vintage: "2025" });
      }
      expect(houseGeoidChanges).toHaveLength(441);
      const featureCollection = JSON.parse(bundle[0]!.bytes) as { features: Array<{ properties: { sourceGeoid: string } }> };
      let changedFeatureCount = 0;
      for (const feature of featureCollection.features) {
        const sourceGeoid = houseGeoidChanges.get(feature.properties.sourceGeoid);
        if (sourceGeoid) {
          feature.properties.sourceGeoid = sourceGeoid;
          changedFeatureCount++;
        }
      }
      expect(changedFeatureCount).toBe(441);
      const bytes = JSON.stringify(featureCollection);
      bundle[0]!.bytes = bytes;
      manifest.geometryArtifacts[0]!.checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      // This is the same R1/R2 setup as Task 6: R1 is published without member
      // facts and R2 receives the locked, atomically copied member surface.
      manifest.biographicalFacts = [];
      manifest.committeeAssignments = [];
      manifest.acsVariables = [];
      manifest.fecFilingSummaries = [];
      manifest.financeAggregates = [];
      const targetFinanceCoverage = manifest.coverageRecords.find((record) => record.domain === "finance" && record.scope.kind === "funding" && record.scope.seatCycleId === "seat_0" && record.scope.fundingKind === "summary")!;
      Object.assign(targetFinanceCoverage, { status: "not_collected", expectedCount: 1, observedCount: 0, missingByReason: [{ reason: "not_collected", count: 1 }] });
      const acsPlaceholder = manifest.coverageRecords.find((record) => record.domain === "acs")!;
      Object.assign(acsPlaceholder, { scope: { kind: "release" }, expectedCount: 1, observedCount: 0, missingByReason: [{ reason: "not_collected", count: 1 }] });
      Object.assign(manifest.coverageRecords.find((record) => record.domain === "member")!, { status: "not_collected", expectedCount: 537, observedCount: 0, missingByReason: [{ reason: "not_collected", count: 537 }] });
      manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest);
      await seedNationwideCandidateManifest(pool, manifest, bundle);
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await promoteCandidateRelease(pool, manifest.release.id);
      const r2 = "rel_task7_acs_candidate";
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'Task 7 ACS','candidate',$2,$3,NULL,$4)", [r2, manifest.release.sourceCutoff, "2024-01-03T00:00:00.000Z", manifest.release.id]);
      await enrichCandidateMembersFromBaseline(pool, manifest.release.id, r2);
      await expect(verifyPersistedTask6MemberCandidate(pool, r2, manifest.release.id)).resolves.toMatchObject({ observed: 537 });

      const repository = new PostgresSeatResearchRepository(pool);
      const listBefore = await repository.listSeatPage(r2 as never, { sort: "state", direction: "asc", limit: 25 });
      expect(listBefore.nextCursor).not.toBeNull();
      const continuationBefore = await repository.listSeatPage(r2 as never, { sort: "state", direction: "asc", limit: 25, cursor: listBefore.nextCursor! });
      const facetsBefore = await repository.getSeatFacets(r2 as never);
      const house = (await loadNationwideManifest(pool, r2)).seatCycles.find((cycle) => {
        const office = manifest.offices.find((value) => value.id === cycle.officeId);
        return office?.chamber === "house" && cycle.geographyVersionId !== undefined;
      })!;
      expect((await repository.getSeatProfile(r2 as never, house.id))!.demographics).toEqual([]);
      const r1Before = await loadNationwideManifest(pool, manifest.release.id);

      const excluded = new Set(["6098", "6698", "6998", "7898"]);
      const geoids = manifest.geographyVersions.filter((geo) => geo.kind === "house_district").map((geo) => geo.sourceGeoid!).filter((geoid) => !excluded.has(geoid)).sort();
      expect(geoids).toHaveLength(437);
      const sourceLockSha256 = createHash("sha256").update(JSON.stringify(ACS_INDICATOR_DICTIONARY.map((definition) => [definition.lockId, definition.sourceUrl, definition.estimateColumn, definition.marginOfErrorColumn]))).digest("hex");
      const rawStore = new LocalRawObjectStore(rawRoot);
      const tables = ACS_INDICATOR_DICTIONARY.map((definition, definitionIndex) => {
        const lines = [
          `GEO_ID|${definition.sourceColumns.join("|")}`,
          ...geoids.map((geoid, index) => {
            const estimate = definitionIndex === 0 && index === 0 ? "-888888888" : String((definitionIndex + 1) * 1000 + index);
            const moe = definitionIndex === 0 && index === 0 ? "-555555555" : String((index % 19) + 1);
            return `5001900US${geoid}|${definition.sourceColumns.map((column) => column === definition.estimateColumn ? estimate : column === definition.marginOfErrorColumn ? moe : "0").join("|")}`;
          }),
        ];
        const bytes = new TextEncoder().encode(lines.join("\n"));
        return { definition, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
      });
      const sourceLockEntries = tables.map(({ definition, bytes, sha256 }) => ({ id: definition.lockId, url: definition.sourceUrl, sha256, byteSize: bytes.byteLength }));
      await pool.query("INSERT INTO sources(release_id,id,name,authority,homepage_url) VALUES($1,'src_acs_2024','acs','official','https://www.census.gov/programs-surveys/acs.html')", [r2]);
      const staged = [];
      for (const { definition, bytes, sha256 } of tables) staged.push(await runSource(createAcsAdapter({
        rawStore, sourceLockSha256, definition, lockId: definition.lockId, sourceBytes: bytes,
        sourceUrl: definition.sourceUrl, sourceChecksumSha256: sha256, sourceByteSize: bytes.byteLength,
        snapshotId: `snap_acs_v2_acs_2024_5yr_${definition.lockId}_${sha256.slice(0, 48)}` as never, parserVersion: ACS_ADAPTER_VERSION, upstreamRelease: "acs-2024-5yr",
      }), { pool, releaseId: r2 as never, sourceId: "src_acs_2024" as never, cutoff: new Date(manifest.release.sourceCutoff), dryRun: true }));
      const runIds = staged.map((result) => result.runIds[0]!);
      expect(runIds).toHaveLength(3);
      expect((await pool.query("SELECT status,extracted_count,staged_count,quarantined_count FROM ingest_runs WHERE id=ANY($1) ORDER BY id", [runIds])).rows).toEqual(expect.arrayContaining(Array.from({ length: 3 }, () => ({ status: "validated", extracted_count: 437, staged_count: 437, quarantined_count: 0 }))));
      const gateBefore = (await pool.query<{ checksum: string; validated_at: Date | null }>("SELECT content_checksum_sha256 checksum,validated_at FROM release_manifests WHERE release_id=$1", [r2])).rows[0]!;

      // Validated staging is immutable. A replay receipt mismatch must reject
      // before any ACS content or validation-gate mutation escapes the finalizer.
      await expect(pool.query("UPDATE stg_acs SET estimate=999999 WHERE run_id=$1", [runIds[0]])).rejects.toMatchObject({ code: "23514" });
      const options = { pool, rawStore, candidateReleaseId: r2, sourceReleaseId: manifest.release.id, runIds: runIds as [string, string, string], sourceLockSha256, sourceLockEntries };
      const mismatchedRawStore: RawObjectStore = {
        put: (input) => rawStore.put(input),
        read: async (receipt, signal) => { const bytes = await rawStore.read(receipt, signal); const tampered = bytes.slice(); tampered[0] = tampered[0]! ^ 1; return tampered; },
      };
      await expect(finalizeCandidateAcs({ ...options, rawStore: mismatchedRawStore })).rejects.toThrow("ACS_FINALIZE_RAW_MISMATCH");
      for (const malformed of [
        { ...sourceLockEntries[0]!, sha256: "f".repeat(64) },
        { ...sourceLockEntries[0]!, byteSize: sourceLockEntries[0]!.byteSize + 1 },
      ]) {
        await expect(finalizeCandidateAcs({ ...options, sourceLockEntries: [malformed, ...sourceLockEntries.slice(1)] })).rejects.toThrow("ACS_FINALIZE_RUN_INVALID");
      }
      expect((await pool.query("SELECT 1 FROM acs_variables WHERE release_id=$1", [r2])).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM acs_observations WHERE release_id=$1", [r2])).rowCount).toBe(0);
      expect((await pool.query("SELECT status FROM ingest_runs WHERE id=ANY($1)", [runIds])).rows.map((row) => row.status)).toEqual(["validated", "validated", "validated"]);
      expect((await pool.query("SELECT content_checksum_sha256 checksum,validated_at FROM release_manifests WHERE release_id=$1", [r2])).rows[0]).toEqual(gateBefore);
      await finalizeCandidateAcs(options);
      await finalizeCandidateAcs(options); // restart-idempotent once runs are loaded
      await expect(assertPersistedTask7AcsInvariant(pool, r2, manifest.release.id)).resolves.toBeUndefined();
      await expect(verifyPersistedTask7AcsCandidate(options)).resolves.toBeUndefined();
      // Both verifiers retain shared advisory/row locks throughout their replay.
      // This is a real PostgreSQL overlap check: neither may escalate to the
      // exclusive lock used by the strict gate recheck.
      await expect(Promise.all([verifyPersistedTask7AcsCandidate(options), verifyPersistedTask7AcsCandidate(options)])).resolves.toEqual([undefined, undefined]);
      await expect(recheckNationwideValidationGate(pool, r2)).resolves.toBeUndefined();
      expect((await pool.query("SELECT count(*)::int count FROM acs_observations WHERE release_id=$1", [r2])).rows[0]).toEqual({ count: 1311 });
      expect((await pool.query("SELECT expected_count,observed_count,incompatible_count FROM coverage_records WHERE release_id=$1 AND domain='acs'", [r2])).rows).toEqual(Array.from({ length: 3 }, () => ({ expected_count: 441, observed_count: 437, incompatible_count: 4 })));
      expect((await pool.query("SELECT status FROM ingest_runs WHERE id=ANY($1)", [runIds])).rows.map((row) => row.status)).toEqual(["loaded", "loaded", "loaded"]);
      expect((await loadNationwideManifest(pool, manifest.release.id)).acsObservations).toEqual(r1Before.acsObservations);
      expect((await loadNationwideManifest(pool, manifest.release.id)).biographicalFacts).toEqual(r1Before.biographicalFacts);

      const profile = await repository.getSeatProfile(r2 as never, house.id);
      const finalized = await loadNationwideManifest(pool, r2);
      const incompatibleHouse = finalized.seatCycles.find((cycle) => {
        const office = finalized.offices.find((value) => value.id === cycle.officeId);
        const geography = finalized.geographyVersions.find((value) => value.id === cycle.geographyVersionId);
        return office?.chamber === "house" && geography?.sourceGeoid !== undefined && excluded.has(geography.sourceGeoid);
      });
      expect(incompatibleHouse).toBeDefined();
      const incompatibleProfile = await repository.getSeatProfile(r2 as never, incompatibleHouse!.id);
      expect(incompatibleProfile!.demographics).toEqual([]);
      expect(incompatibleProfile!.acsAvailability).toEqual({ kind: "incompatible_geography" });
      expect(incompatibleProfile!.acsCoverage).toHaveLength(3);
      expect(incompatibleProfile!.acsCoverage).toEqual(Array.from({ length: 3 }, () => expect.objectContaining({
        domain: "acs", scope: expect.objectContaining({ kind: "acs_indicator" }), expectedCount: 441, observedCount: 437, quarantinedCount: 0, incompatibleCount: 4,
      })));
      const incompatibleAcsSnapshots = incompatibleProfile!.snapshots.filter((snapshot) => snapshot.sourceId === "src_acs_2024");
      expect(incompatibleAcsSnapshots).toHaveLength(3);
      expect(incompatibleAcsSnapshots).toEqual(expect.arrayContaining(tables.map(({ definition, sha256 }) => expect.objectContaining({ id: `snap_acs_v2_acs_2024_5yr_${definition.lockId}_${sha256.slice(0, 48)}`, sourceUrl: definition.sourceUrl }))));
      expect(profile!.demographics).toHaveLength(3);
      expect(profile!.sources.filter((source) => source.id === "src_acs_2024")).toEqual([expect.objectContaining({ name: "acs", authority: "official", homepageUrl: "https://www.census.gov/programs-surveys/acs.html" })]);
      const acsSnapshots = profile!.snapshots.filter((snapshot) => snapshot.sourceId === "src_acs_2024");
      expect(acsSnapshots).toHaveLength(3);
      expect(acsSnapshots).toEqual(expect.arrayContaining(tables.map(({ definition, sha256 }) => expect.objectContaining({ id: `snap_acs_v2_acs_2024_5yr_${definition.lockId}_${sha256.slice(0, 48)}`, sourceUrl: definition.sourceUrl }))));
      expect(await repository.listSeatPage(r2 as never, { sort: "state", direction: "asc", limit: 25 })).toEqual(listBefore);
      expect(await repository.listSeatPage(r2 as never, { sort: "state", direction: "asc", limit: 25, cursor: listBefore.nextCursor! })).toEqual(continuationBefore);
      expect(await repository.getSeatFacets(r2 as never)).toEqual(facetsBefore);
       // Task 8 FEC finalization reuses the baseline's approved mapping evidence.
       const mappingSource = { id: "src_synthetic", name: "Synthetic", authority: "derived", homepageUrl: "https://example.com" };
       const fecSource = { id: "src_task8_fec", name: "fec" as const, authority: "official" as const, homepageUrl: "urn:test:task8:fec" };
       const mappingSnapshot = { id: "snap_input", sourceId: mappingSource.id, sourceUrl: "https://example.com/input", checksumSha256: "a".repeat(64), publishedAt: null, retrievedAt: "2024-01-01T00:00:00.000Z", parserVersion: "synthetic", license: "test", usageStatus: "approved" as const };
       const target = { id: "candidacy_synthetic", seatCycleId: "seat_0" };
       await pool.query("INSERT INTO sources(release_id,id,name,authority,homepage_url) VALUES($1,$2,$3,$4,$5)", [r2, fecSource.id, fecSource.name, fecSource.authority, fecSource.homepageUrl]);
       const baseEnvelope = fecEnvelopeFixture();
       const financeScope = { ...baseEnvelope.financeScope, coverageEndDate: "2024-01-01", asOf: "2024-01-01", cutoff: "2024-01-01" };
       const reports = [{ ...baseEnvelope.reports[0]!, committeeId: "C00000001", coverageEndDate: "2024-01-01", receiptDate: "2024-01-01", cashOnHandEndPeriod: "123.45", totalReceiptsYtd: "456.78", totalDisbursementsYtd: "12.34" }];
       const envelope = { ...baseEnvelope, releaseCutoff: "2024-01-01", financeScope, mapping: { candidateId: "H00000001", electionCycle: 2024, candidacyId: target.id, seatCycleId: target.seatCycleId, snapshotId: mappingSnapshot.id, committees: [{ committeeId: "C00000001", relationshipType: "authorized" as const, effectiveFrom: "2024-01-01", effectiveTo: null }] }, committees: baseEnvelope.committees.map((committee) => ({ ...committee, committeeId: "C00000001" })), reports, pageReceipts: baseEnvelope.pageReceipts.map((page) => page.endpoint === "committee_reports" ? { ...page, query: page.query.map((query) => query.key === "committee_id" ? { ...query, value: "C00000001" } : query.key === "max_receipt_date" ? { ...query, value: "2024-01-01" } : query), requestSha256: fecPageRequestSha256(page.path, page.query.map((query) => query.key === "committee_id" ? { ...query, value: "C00000001" } : query.key === "max_receipt_date" ? { ...query, value: "2024-01-01" } : query)), reportedCount: 1, reportedPages: 1, resultCount: page.page === 1 ? 1 : 0 } : page) };
       const fecBytes = encodeFecSanitizedEnvelope(envelope); const checksum = fecEnvelopeSha256(fecBytes);
       const fecSnapshot = { id: "snap_task8_fec", sourceId: fecSource.id, sourceUrl: "urn:test:task8:fec-envelope", checksumSha256: checksum, publishedAt: null, retrievedAt: "2024-12-31T00:00:00.000Z", parserVersion: "openfec-sanitized-v1" as const, license: "synthetic", usageStatus: "approved" as const };
       await pool.query("INSERT INTO source_snapshots(release_id,id,source_id,source_url,published_at,retrieved_at,checksum_sha256,parser_version,license,usage_status) VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9)", [r2, fecSnapshot.id, fecSource.id, fecSnapshot.sourceUrl, fecSnapshot.retrievedAt, checksum, fecSnapshot.parserVersion, fecSnapshot.license, fecSnapshot.usageStatus]);
       const receipt = await rawStore.put({ objectKey: "task8/synthetic-envelope.json", body: (async function* () { yield Buffer.from(fecBytes); })(), expectedSha256: checksum });
       const run = { ...strictRun("run_task8_fec", r2, fecSource.id, 1, fecSnapshot.id, checksum, "openfec-v1"), adapterVersion: "openfec-sanitized-v1", rawStoreLocator: receipt.storeLocator, rawObjectKey: receipt.objectKey, rawObjectByteSize: receipt.byteSize };
       await startIngestRun(pool, run);
       for (const report of envelope.reports) await pool.query("INSERT INTO stg_fec(run_id,release_id,source_natural_key,snapshot_id,committee_id,filing_id,report_type,reporting_period_start,reporting_period_end,filed_at,amendment_number,cash_on_hand,total_receipts,total_disbursements,redacted_extras) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)", [run.id, r2, `fec:C00000001:${report.fileNumber}`, fecSnapshot.id, report.committeeId, String(report.fileNumber), report.reportType, report.coverageStartDate, report.coverageEndDate, `${report.receiptDate}T00:00:00.000Z`, report.fileNumber - 1, report.cashOnHandEndPeriod, report.totalReceiptsYtd, report.totalDisbursementsYtd, JSON.stringify({ schemaVersion: 1, envelopeChecksumSha256: checksum, candidateId: "H00000001", electionCycle: 2024, electionKey: envelope.electionKey, amendmentIndicator: report.amendmentIndicator, amendmentChain: report.amendmentChain, mostRecent: report.mostRecent, mostRecentFileNumber: report.mostRecentFileNumber, missingReasons: { cashOnHand: null, totalReceipts: null, totalDisbursements: null } })]);
       await recordStageBatch(pool, run.id, run.leaseToken, 1, run.leaseDurationMs); await markValidated(pool, run.id, run.leaseToken);
       const task8 = { pool, rawStore, candidateReleaseId: r2, sourceReleaseId: manifest.release.id, runIds: [run.id], sourceLockSha256: envelope.sourceLockSha256, source: fecSource, snapshot: fecSnapshot, mappingSource, mappingSnapshot, mapping: envelope.mapping, financeScope: envelope.financeScope };
       const gateBeforeTask8 = (await pool.query("SELECT content_checksum_sha256,validated_at FROM release_manifests WHERE release_id=$1", [r2])).rows[0];
       await expect(finalizeCandidateFec({ ...task8, rawStore: { put: rawStore.put.bind(rawStore), read: async value => { const valueBytes = await rawStore.read(value); valueBytes[0] ^= 1; return valueBytes; } } })).rejects.toThrow("FEC_FINALIZE_RAW_MISMATCH");
       expect((await pool.query("SELECT status FROM ingest_runs WHERE id=$1", [run.id])).rows[0]).toEqual({ status: "validated" }); expect((await pool.query("SELECT 1 FROM finance_aggregates WHERE release_id=$1 AND seat_cycle_id=$2", [r2, target.seatCycleId])).rowCount).toBe(0); expect((await pool.query("SELECT content_checksum_sha256,validated_at FROM release_manifests WHERE release_id=$1", [r2])).rows[0]).toEqual(gateBeforeTask8);
       await finalizeCandidateFec(task8); await finalizeCandidateFec(task8);
       await expect(Promise.all([verifyPersistedTask8FecCandidate(task8), verifyPersistedTask8FecCandidate(task8)])).resolves.toEqual([undefined, undefined]);
       await expect(assertPersistedTask7AcsInvariant(pool, r2, manifest.release.id)).resolves.toBeUndefined(); await expect(recheckNationwideValidationGate(pool, r2)).resolves.toBeUndefined();
       const task8Profile = await repository.getSeatProfile(r2 as never, target.seatCycleId as never);
       expect(task8Profile!.financeAggregates).toHaveLength(1); expect(task8Profile!.financeCoverage).toMatchObject({ status: "complete", inputSnapshotIds: [mappingSnapshot.id, fecSnapshot.id] }); expect(task8Profile!.snapshots.map((snapshot) => snapshot.id)).toEqual(expect.arrayContaining([mappingSnapshot.id, fecSnapshot.id]));

       // Task 9 uses the production decision envelope, adapter, run lifecycle,
       // finalizer, and verifier while reusing the baseline's exact approved
       // synthetic evidence snapshot and source-lock receipt.
       await pool.query("INSERT INTO sources(release_id,id,name,authority,homepage_url) VALUES($1,$2,$3,$4,$5)", [r2, ELECTION_DECISION_SOURCE.id, ELECTION_DECISION_SOURCE.name, ELECTION_DECISION_SOURCE.authority, ELECTION_DECISION_SOURCE.homepageUrl]);
       const electionEvidenceLock = { id: "synthetic_input_v1", url: mappingSnapshot.sourceUrl, sha256: mappingSnapshot.checksumSha256, byteSize: 0 };
       const electionSourceLockSha256 = createHash("sha256").update(JSON.stringify(electionEvidenceLock)).digest("hex");
       const passedGate = (value: Record<string, unknown>) => ({ outcome: "passed" as const, evidenceSnapshotIds: [mappingSnapshot.id], value, failureReason: null });
       const unassessedGate = { outcome: "unassessed" as const, evidenceSnapshotIds: [], value: null, failureReason: null };
       const approvedGates = {
         sourceAuthority: passedGate({ originalPublisher: { identity: "Synthetic election authority", role: "original_publisher", evidenceKind: "record" }, intermediaries: [] }),
         license: passedGate({ assessment: "approved" }),
         certification: passedGate({ value: "certified", scope: "statewide presidential results" }),
         reportingUnitGeometry: passedGate({ release: "synthetic-2024", vintage: "2024" }),
         nonGeographicPolicy: passedGate({ policy: "included in authority total" }),
         allocation: passedGate({ method: "none", crosswalkMethodology: "not applicable", weightsMethodology: "not applicable" }),
         reconciliation: passedGate({ delta: 0, authorityTotal: 1 }),
         rounding: passedGate({ rule: "integer votes" }),
         coverage: passedGate({ expectedCount: 1, actualCount: 1 }),
       };
       const unavailableGates = {
         sourceAuthority: approvedGates.sourceAuthority,
         license: { outcome: "failed" as const, evidenceSnapshotIds: [mappingSnapshot.id], value: { assessment: "unknown" }, failureReason: "license_unavailable" as const },
         certification: unassessedGate, reportingUnitGeometry: unassessedGate, nonGeographicPolicy: unassessedGate,
         allocation: unassessedGate, reconciliation: unassessedGate, rounding: unassessedGate, coverage: unassessedGate,
       };
       const decisionSpecs = [
         { jurisdictionCode: "AL" as const, electionYear: 2020 as const, snapshotId: "snap_election_decision_v1_al_2020_review_20240101", gates: unavailableGates },
         { jurisdictionCode: "AK" as const, electionYear: 2024 as const, snapshotId: "snap_election_decision_v1_ak_2024_review_20240101", gates: approvedGates },
       ];
       const electionRuns: string[] = [];
       for (const spec of decisionSpecs) {
         const envelope = {
           schemaVersion: 1 as const, adapterVersion: ELECTION_DECISION_ADAPTER_VERSION as "election-decision-v1", sourceLockSha256: electionSourceLockSha256,
           releaseCutoff: "2024-01-01", decisionSnapshotId: spec.snapshotId,
           evidenceReceipts: [{ snapshotId: mappingSnapshot.id, lockEntryId: electionEvidenceLock.id, url: electionEvidenceLock.url, sha256: electionEvidenceLock.sha256, byteSize: electionEvidenceLock.byteSize }],
           decision: { schemaVersion: 1 as const, jurisdictionCode: spec.jurisdictionCode, electionYear: spec.electionYear, reviewDate: "2024-01-01", methodology: "synthetic reviewed election decision v1", evidenceSnapshotIds: [mappingSnapshot.id], gates: spec.gates },
         };
         const envelopeBytes = encodeElectionDecisionEnvelope(envelope);
         const envelopeChecksumSha256 = electionDecisionEnvelopeSha256(envelopeBytes);
         const result = await runSource(createElectionDecisionAdapter({
           envelopeBytes, envelopeChecksumSha256, envelopeByteSize: envelopeBytes.byteLength,
           sourceLockSha256: electionSourceLockSha256, releaseCutoff: "2024-01-01", snapshotId: spec.snapshotId as never,
           sourceUrl: electionDecisionSourceUrl(envelope, envelopeChecksumSha256), parserVersion: ELECTION_DECISION_ADAPTER_VERSION,
           upstreamRelease: ELECTION_DECISION_UPSTREAM_RELEASE, rawStore, sourceLockEntries: [electionEvidenceLock],
         }), { pool, releaseId: r2 as never, sourceId: ELECTION_DECISION_SOURCE.id as never, cutoff: new Date(manifest.release.sourceCutoff), dryRun: true });
         electionRuns.push(result.runIds[0]!);
       }
       expect((await pool.query("SELECT count(*)::int count FROM sources WHERE release_id=$1 AND id=$2", [r2, ELECTION_DECISION_SOURCE.id])).rows[0]).toEqual({ count: 1 });
       expect((await pool.query("SELECT status,extracted_count,staged_count,quarantined_count FROM ingest_runs WHERE id=ANY($1) ORDER BY id", [electionRuns])).rows).toEqual(Array.from({ length: 2 }, () => ({ status: "validated", extracted_count: 0, staged_count: 0, quarantined_count: 0 })));
       const task9 = { pool, rawStore, candidateReleaseId: r2, sourceReleaseId: manifest.release.id, runIds: electionRuns, sourceLockSha256: electionSourceLockSha256, sourceLockEntries: [electionEvidenceLock] };
       const gateBeforeTask9 = (await pool.query("SELECT content_checksum_sha256,validated_at FROM release_manifests WHERE release_id=$1", [r2])).rows[0];
       const mismatchedElectionStore: RawObjectStore = { put: (input) => rawStore.put(input), read: async (value, signal) => { const valueBytes = (await rawStore.read(value, signal)).slice(); valueBytes[0] ^= 1; return valueBytes; } };
       await expect(finalizeCandidateElectionDecisions({ ...task9, rawStore: mismatchedElectionStore })).rejects.toThrow("ELECTION_FINALIZE_RAW_MISMATCH");
       expect((await pool.query("SELECT status FROM ingest_runs WHERE id=ANY($1) ORDER BY id", [electionRuns])).rows).toEqual([{ status: "validated" }, { status: "validated" }]);
       expect((await pool.query("SELECT count(*)::int count FROM snapshot_derivations WHERE release_id=$1 AND output_snapshot_id=ANY($2)", [r2, decisionSpecs.map((value) => value.snapshotId)])).rows[0]).toEqual({ count: 0 });
       expect((await pool.query("SELECT count(*)::int count FROM election_decision_inputs WHERE release_id=$1 AND election_decision_id=ANY($2)", [r2, ["decision_al_2020", "decision_ak_2024"]])).rows[0]).toEqual({ count: 0 });
       expect((await pool.query("SELECT jurisdiction_code,election_year,status FROM election_decisions WHERE release_id=$1 AND (jurisdiction_code,election_year) IN (('AL',2020),('AK',2024)) ORDER BY jurisdiction_code,election_year", [r2])).rows).toEqual([{ jurisdiction_code: "AK", election_year: 2024, status: "unassessed" }, { jurisdiction_code: "AL", election_year: 2020, status: "unassessed" }]);
       expect((await pool.query("SELECT content_checksum_sha256,validated_at FROM release_manifests WHERE release_id=$1", [r2])).rows[0]).toEqual(gateBeforeTask9);

       await pool.query("UPDATE election_decisions SET id='decision_al_2020_tampered' WHERE release_id=$1 AND id='decision_al_2020'", [r2]);
       await expect(finalizeCandidateElectionDecisions(task9)).rejects.toThrow("ELECTION_FINALIZE_DRIFT_INVALID");
       await pool.query("UPDATE election_decisions SET id='decision_al_2020' WHERE release_id=$1 AND id='decision_al_2020_tampered'", [r2]);

       await finalizeCandidateElectionDecisions(task9);
       const gateAfterTask9 = (await pool.query("SELECT content_checksum_sha256,validated_at FROM release_manifests WHERE release_id=$1", [r2])).rows[0];
       expect(gateAfterTask9.content_checksum_sha256).not.toBe(gateBeforeTask9.content_checksum_sha256);
       expect(gateAfterTask9.validated_at).not.toBeNull();
       await finalizeCandidateElectionDecisions(task9); // exact restart over loaded runs
       await expect(Promise.all([verifyPersistedTask9ElectionCandidate(task9), verifyPersistedTask9ElectionCandidate(task9)])).resolves.toEqual([undefined, undefined]);
       const task9Manifest = await loadNationwideManifest(pool, r2);
       expect(task9Manifest.electionDecisions.filter((row) => (row.jurisdictionCode === "AL" && row.electionYear === 2020) || (row.jurisdictionCode === "AK" && row.electionYear === 2024)).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
         expect.objectContaining({ id: "decision_ak_2024", jurisdictionCode: "AK", electionYear: 2024, status: "approved", inputSnapshotIds: [decisionSpecs[1]!.snapshotId] }),
         expect.objectContaining({ id: "decision_al_2020", jurisdictionCode: "AL", electionYear: 2020, status: "unavailable", inputSnapshotIds: [decisionSpecs[0]!.snapshotId] }),
       ]);
       expect(task9Manifest.coverageRecords.filter((row) => row.scope.kind === "election" && ((row.scope.jurisdictionCode === "AL" && row.scope.electionYear === 2020) || (row.scope.jurisdictionCode === "AK" && row.scope.electionYear === 2024))).sort((a, b) => a.domain.localeCompare(b.domain))).toEqual([
         expect.objectContaining({ domain: "election_2020", status: "unavailable", expectedCount: 1, observedCount: 0, missingByReason: [{ reason: "not_defensibly_modeled", count: 1 }], inputSnapshotIds: [decisionSpecs[0]!.snapshotId] }),
         expect.objectContaining({ domain: "election_2024", status: "complete", expectedCount: 1, observedCount: 1, missingByReason: [], inputSnapshotIds: [decisionSpecs[1]!.snapshotId] }),
       ]);
       expect(task9Manifest.snapshotDerivations.filter((row) => decisionSpecs.some((spec) => spec.snapshotId === row.outputSnapshotId)).sort((a, b) => a.outputSnapshotId.localeCompare(b.outputSnapshotId))).toEqual([
         { releaseId: r2, outputSnapshotId: decisionSpecs[1]!.snapshotId, inputSnapshotIds: [mappingSnapshot.id], methodologyVersion: ELECTION_DECISION_ADAPTER_VERSION },
         { releaseId: r2, outputSnapshotId: decisionSpecs[0]!.snapshotId, inputSnapshotIds: [mappingSnapshot.id], methodologyVersion: ELECTION_DECISION_ADAPTER_VERSION },
       ]);
       expect((await pool.query("SELECT status FROM ingest_runs WHERE id=ANY($1) ORDER BY id", [electionRuns])).rows).toEqual([{ status: "loaded" }, { status: "loaded" }]);

       const alCycle = task9Manifest.seatCycles.find((cycle) => task9Manifest.offices.find((office) => office.id === cycle.officeId)?.stateCode === "AL")!;
       const akCycle = task9Manifest.seatCycles.find((cycle) => task9Manifest.offices.find((office) => office.id === cycle.officeId)?.stateCode === "AK")!;
       const alProfile = await repository.getSeatProfile(r2 as never, alCycle.id);
       const akProfile = await repository.getSeatProfile(r2 as never, akCycle.id);
       expect(alProfile!.electionDecisions.map((row) => [row.electionYear, row.status])).toEqual([[2020, "unavailable"], [2022, "unassessed"], [2024, "unassessed"]]);
       expect(alProfile!.electionCoverage.map((row) => [row.scope.kind === "election" ? row.scope.electionYear : null, row.status])).toEqual([[2020, "unavailable"], [2022, "not_collected"], [2024, "not_collected"]]);
       expect(akProfile!.electionDecisions.map((row) => [row.electionYear, row.status])).toEqual([[2020, "unassessed"], [2022, "unassessed"], [2024, "approved"]]);
       expect(akProfile!.electionCoverage.map((row) => [row.scope.kind === "election" ? row.scope.electionYear : null, row.status])).toEqual([[2020, "not_collected"], [2022, "not_collected"], [2024, "complete"]]);
       expect(alProfile!.snapshots.map((snapshot) => snapshot.id)).toEqual(expect.arrayContaining([mappingSnapshot.id, decisionSpecs[0]!.snapshotId]));
       expect(akProfile!.snapshots.map((snapshot) => snapshot.id)).toEqual(expect.arrayContaining([mappingSnapshot.id, decisionSpecs[1]!.snapshotId]));
       const task9FirstPage = await repository.listSeatPage(r2 as never, { sort: "state", direction: "asc", limit: 25 });
       const task9Continuation = await repository.listSeatPage(r2 as never, { sort: "state", direction: "asc", limit: 25, cursor: listBefore.nextCursor! });
       expect(task9FirstPage.items.map((row) => row.id)).toEqual(listBefore.items.map((row) => row.id));
       expect(task9FirstPage.nextCursor).toBe(listBefore.nextCursor);
       expect(task9Continuation.items.map((row) => row.id)).toEqual(continuationBefore.items.map((row) => row.id));
       expect(task9Continuation.nextCursor).toBe(continuationBefore.nextCursor);
       expect(await repository.getSeatFacets(r2 as never)).toEqual(facetsBefore);
       await expect(assertPersistedTask7AcsInvariant(pool, r2, manifest.release.id)).resolves.toBeUndefined();
       await expect(verifyPersistedTask8FecCandidate(task8)).resolves.toBeUndefined();
       const preservedTask8Profile = await repository.getSeatProfile(r2 as never, target.seatCycleId as never);
       expect(preservedTask8Profile!.financeAggregates).toEqual(task8Profile!.financeAggregates);
       expect(preservedTask8Profile!.financeCoverage).toEqual(task8Profile!.financeCoverage);
       await expect(promoteCandidateRelease(pool, r2)).rejects.toThrow(`Release ${r2} failed election publication readiness`);
       expect((await pool.query("SELECT status FROM data_releases WHERE id=$1", [r2])).rows[0]).toEqual({ status: "candidate" });
    } finally {
      await pool.end();
      await rm(rawRoot, { recursive: true, force: true });
    }
  }, 360_000);

  it("finalizes Task 10 maps atomically from the exact official CD119 layer", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const root = await mkdtemp(join(tmpdir(), "maps-task10-integration-"));
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      const originalSnapshot = manifest.snapshots.find((snapshot) => snapshot.id === manifest.geometryArtifacts[0]!.snapshotId)!;
      const originalSource = manifest.sources.find((source) => source.id === originalSnapshot.sourceId)!;
      originalSnapshot.license = "public-domain";
      originalSnapshot.usageStatus = "approved";
      originalSource.authority = "derived";
      const fipsByState = new Map<string, string>(Object.entries(TIGER_2025_JURISDICTIONS).map(([fips, state]) => [state, fips]));
      const nonVoting = new Set(["DC", "AS", "GU", "MP", "PR", "VI"]);
      const original = JSON.parse(bundle[0]!.bytes) as { features: Array<{ type: "Feature"; properties: { sourceGeoid: string; stateCode: string; districtCode: string | null }; geometry: unknown }> };
      const bySyntheticGeoid = new Map(original.features.map((feature) => [feature.properties.sourceGeoid, feature]));
      const districts = manifest.geographyVersions.filter((g) => g.kind === "house_district");
      const states = manifest.geographyVersions.filter((g) => g.kind === "state");
      const ring = (index: number) => {
        const x = -179 + (index % 60) * 0.2, y = -80 + Math.floor(index / 60) * 0.2;
        const edge = (ax: number, ay: number, bx: number, by: number) => Array.from({ length: 5 }, (_, n) => [ax + (bx - ax) * n / 4, ay + (by - ay) * n / 4]);
        return [...edge(x, y, x + .1, y), ...edge(x + .1, y, x + .1, y + .1).slice(1), ...edge(x + .1, y + .1, x, y + .1).slice(1), ...edge(x, y + .1, x, y).slice(1)];
      };
      const districtFeatures = districts.map((geography, index) => {
        const fips = fipsByState.get(geography.stateCode); if (!fips) throw new Error(`Missing TIGER FIPS for ${geography.stateCode}`);
        const districtCode = nonVoting.has(geography.stateCode) ? "98" : geography.districtCode === "AL" ? "00" : geography.districtCode!.padStart(2, "0");
        const geoid = `${fips}${districtCode}`;
        Object.assign(geography, { sourceGeoid: geoid, vintage: "2025", geometryArtifactId: "artifact_task10_districts" as never });
        return { type: "Feature", properties: { GEOID: geoid, sourceGeoid: geoid, stateCode: geography.stateCode, districtCode: geography.districtCode }, geometry: { type: "MultiPolygon", coordinates: [[ring(index)]] } };
      }).sort((a, b) => a.properties.GEOID.localeCompare(b.properties.GEOID));
      expect(districtFeatures).toHaveLength(441);
      const stateFeatures = states.map((geography) => {
        const feature = bySyntheticGeoid.get(geography.sourceGeoid); if (!feature) throw new Error("Missing synthetic state geometry");
        Object.assign(geography, { geometryArtifactId: "artifact_task10_states" as never });
        return feature;
      });
      const districtBytes = JSON.stringify({ type: "FeatureCollection", features: districtFeatures });
      const stateBytes = JSON.stringify({ type: "FeatureCollection", features: stateFeatures });
      manifest.geometryArtifacts = [
        { ...manifest.geometryArtifacts[0]!, id: "artifact_task10_districts" as never, objectKey: "task10-districts.geojson", checksumSha256: createHash("sha256").update(districtBytes).digest("hex") },
        { ...manifest.geometryArtifacts[0]!, id: "artifact_task10_states" as never, objectKey: "task10-states.geojson", checksumSha256: createHash("sha256").update(stateBytes).digest("hex") },
      ];
      manifest.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(manifest);
      const exactBundle: BoundaryBundle = manifest.geometryArtifacts.map((artifact) => ({ artifactId: artifact.id, objectKey: artifact.objectKey, bytes: artifact.id === "artifact_task10_districts" ? districtBytes : stateBytes }));
      await seedNationwideCandidateManifest(pool, manifest, exactBundle);
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await promoteCandidateRelease(pool, manifest.release.id);
      await expect(recheckNationwideValidationGate(pool, manifest.release.id)).resolves.toBeUndefined();
      const sourceBefore = await loadNationwideManifest(pool, manifest.release.id);
      expect(sourceBefore.mapArtifacts).toEqual([]);

      const candidateId = "rel_task10_maps_candidate";
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'Task 10 maps','candidate',$2,$3,NULL,$4)", [candidateId, manifest.release.sourceCutoff, "2024-01-03T00:00:00.000Z", manifest.release.id]);
      await baselineCandidateRelease(pool, manifest.release.id, candidateId);
      await expect(recheckNationwideValidationGate(pool, candidateId)).rejects.toThrow();
      await validateNationwideCandidateRelease(pool, candidateId);
      await expect(simplifyNationalTigerDistrictLayer(districtBytes, { expectedSourceSha256: "f".repeat(64) })).rejects.toThrow("source checksum mismatch");
      const layer = await simplifyNationalTigerDistrictLayer(districtBytes, { expectedSourceSha256: manifest.geometryArtifacts[0]!.checksumSha256 });
      expect(layer.metrics).toMatchObject({ featureCount: 441 });
      expect(layer.metrics.vertexReduction).toBeGreaterThan(0);
      const store = new LocalMapArtifactStore(root);
      const task10 = { pool, store, candidateReleaseId: candidateId, sourceReleaseId: manifest.release.id, layer };
      const beforeFailure = await pool.query("SELECT content_checksum_sha256,validated_at,(SELECT row_to_json(g) FROM nationwide_validation_gates g WHERE g.release_id=$1) gate FROM release_manifests WHERE release_id=$1", [candidateId]);
      await expect(finalizeCandidateMaps({ ...task10, layer: { ...layer, metrics: { ...layer.metrics, outputSha256: "0".repeat(64) } } })).rejects.toThrow("MAP_FINALIZE_INPUT_INVALID");
      expect((await pool.query("SELECT count(*)::int count FROM map_artifacts WHERE release_id=$1", [candidateId])).rows[0]).toEqual({ count: 0 });
      expect((await pool.query("SELECT content_checksum_sha256,validated_at,(SELECT row_to_json(g) FROM nationwide_validation_gates g WHERE g.release_id=$1) gate FROM release_manifests WHERE release_id=$1", [candidateId])).rows).toEqual(beforeFailure.rows);
      // Repeated cross-test TRUNCATE leaves PostgreSQL with empty-table planner
      // statistics; refresh the joined release tables before the CPU-heavy map drill.
      await pool.query("ANALYZE geography_versions,geometry_artifacts,source_snapshots,sources,district_plans,seat_cycles,office_terms,data_releases");
      let puts = 0;
      const failingStore: MapArtifactStore = { read: receipt => store.read(receipt), put: async input => { puts++; const receipt = await store.put(input); if (puts === 4) throw new Error("injected immutable-store failure"); return receipt; } };
      await expect(finalizeCandidateMaps({ ...task10, store: failingStore })).rejects.toThrow("MAP_FINALIZE_FAILED");
      for (const table of ["map_artifacts", "map_artifact_receipts"]) expect((await pool.query(`SELECT count(*)::int count FROM ${table} WHERE release_id=$1`, [candidateId])).rows[0]).toEqual({ count: 0 });
      expect((await pool.query("SELECT count(*)::int count FROM snapshot_derivations WHERE release_id=$1 AND methodology_version='tiger-mapshaper-0.6.113-dp25m'", [candidateId])).rows[0]).toEqual({ count: 0 });
      expect((await pool.query("SELECT count(*)::int count FROM geometry_artifacts WHERE release_id=$1 AND object_key LIKE 'maps/%'", [candidateId])).rows[0]).toEqual({ count: 0 });
      expect((await pool.query("SELECT content_checksum_sha256,validated_at,(SELECT row_to_json(g) FROM nationwide_validation_gates g WHERE g.release_id=$1) gate FROM release_manifests WHERE release_id=$1", [candidateId])).rows).toEqual(beforeFailure.rows);
      await finalizeCandidateMaps(task10); // adopts the exact immutable orphan bytes
      await finalizeCandidateMaps(task10); // exact restart
      await expect(verifyPersistedCandidateMaps(task10)).resolves.toBeUndefined();
      await expect(Promise.all([verifyPersistedCandidateMaps(task10), verifyPersistedCandidateMaps(task10)])).resolves.toEqual([undefined, undefined]);
      for (const table of ["map_artifacts", "map_artifact_receipts", "map_artifact_inputs"]) expect((await pool.query(`SELECT count(*)::int count FROM ${table} WHERE release_id=$1`, [candidateId])).rows[0]).toEqual({ count: 441 });
      expect((await pool.query("SELECT count(*)::int count FROM snapshot_derivations WHERE release_id=$1 AND methodology_version='tiger-mapshaper-0.6.113-dp25m'", [candidateId])).rows[0]).toEqual({ count: 441 });
      expect((await pool.query("SELECT count(*)::int count FROM geometry_artifacts WHERE release_id=$1 AND object_key LIKE 'maps/%'", [candidateId])).rows[0]).toEqual({ count: 441 });
      expect((await pool.query("SELECT count(*)::int count FROM coverage_input_snapshots WHERE release_id=$1 AND domain='maps'", [candidateId])).rows[0]).toEqual({ count: 441 });
      expect((await pool.query("SELECT ST_IsValid(boundary) valid FROM geography_versions WHERE release_id=$1 AND kind='house_district'", [candidateId])).rows.every((row) => row.valid)).toBe(true);
      expect((await pool.query("SELECT count(*)::int count FROM release_content_digests WHERE release_id=$1", [candidateId])).rows[0]).toEqual({ count: 7 });
      expect((await pool.query("SELECT status FROM data_releases WHERE id=$1", [candidateId])).rows[0]).toEqual({ status: "candidate" });
      await expect(promoteCandidateRelease(pool, candidateId)).rejects.toThrow(/Task 9/);
      expect((await pool.query("SELECT status FROM data_releases WHERE id=$1", [candidateId])).rows[0]).toEqual({ status: "candidate" });
      const sourceAfter = await loadNationwideManifest(pool, manifest.release.id);
      expect(sourceAfter.canonicalDataChecksumSha256).toBe(sourceBefore.canonicalDataChecksumSha256);
      expect(computeCanonicalDataChecksum(sourceAfter)).toBe(computeCanonicalDataChecksum(sourceBefore));

      const first = layer.districts[0]!;
      const replacementFeature = JSON.parse(Buffer.from(first.bytes).toString("utf8")) as { geometry: { coordinates: number[][][][] } };
      replacementFeature.geometry.coordinates[0]![0]![0]![0] += .000001;
      replacementFeature.geometry.coordinates[0]![0]!.at(-1)![0] += .000001;
      const replacementBytes = Buffer.from(JSON.stringify(replacementFeature) + "\n");
      const replacementDistricts = [
        { ...first, bytes: replacementBytes },
        ...layer.districts.slice(1),
      ];
      const replacementJoined = Buffer.concat(replacementDistricts.flatMap(({ geoid, bytes }) => [Buffer.from(`${geoid}\n`), Buffer.from(bytes)]));
      await expect(finalizeCandidateMaps({ ...task10, layer: { ...layer, districts: replacementDistricts, metrics: { ...layer.metrics, outputSha256: createHash("sha256").update(replacementJoined).digest("hex") } } })).rejects.toThrow("MAP_FINALIZE_REPLAY_MISMATCH");

      const tamperedId = "rel_task10_maps_tampered";
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'Task 10 tamper','candidate',$2,$3,NULL,$4)", [tamperedId, manifest.release.sourceCutoff, "2024-01-04T00:00:00.000Z", manifest.release.id]);
      await baselineCandidateRelease(pool, manifest.release.id, tamperedId);
      await validateNationwideCandidateRelease(pool, tamperedId);
      const tampered = { ...task10, candidateReleaseId: tamperedId };
      await finalizeCandidateMaps(tampered);
      await pool.query("UPDATE source_snapshots SET source_url='urn:tampered' WHERE release_id=$1 AND source_id LIKE 'src_maps_%'", [tamperedId]);
      await expect(verifyPersistedCandidateMaps(tampered)).rejects.toThrow("MAP_FINALIZE_PERSISTED_INVARIANT");
    } finally {
      await pool.end();
      await rm(root, { recursive: true, force: true });
    }
  }, 900_000);

  it("rejects a nationwide baseline with a different cutoff before copying content", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      const targetId = "rel_synthetic_baseline_cutoff_mismatch";
      await seedNationwideCandidateManifest(pool, manifest, bundle);
      await validateNationwideCandidateRelease(pool, manifest.release.id);
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'Mismatched nationwide candidate','candidate',$2,$3,NULL,NULL)", [targetId, "2024-01-02T00:00:00.000Z", "2024-01-03T00:00:00.000Z"]);
      await expect(baselineCandidateRelease(pool, manifest.release.id, targetId)).rejects.toThrow("candidate source cutoff to equal the source release cutoff");
      expect((await pool.query("SELECT 1 FROM release_manifests WHERE release_id=$1", [targetId])).rowCount).toBe(0);
      for (const table of contentTableRegistry) expect((await pool.query(`SELECT 1 FROM ${table.name} WHERE release_id=$1 LIMIT 1`, [targetId])).rowCount).toBe(0);
    } finally { await pool.end(); }
  }, 60_000);

  it("persists canonical coverage scope keys and rejects tampering", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const { manifest, bundle } = persistedNationwideSkeleton();
      await seedNationwideCandidateManifest(pool, manifest, bundle);
      const stored = await pool.query<{ domain: string; scope_key: string }>("SELECT domain,scope_key FROM coverage_records WHERE release_id=$1", [manifest.release.id]);
      expect(stored.rows).toHaveLength(manifest.coverageRecords.length);
      for (const record of manifest.coverageRecords) expect(stored.rows).toContainEqual({ domain: record.domain, scope_key: canonicalCoverageScopeKey(record.scope) });
      await expect(pool.query("UPDATE coverage_records SET scope_key='' WHERE ctid=(SELECT ctid FROM coverage_records WHERE release_id=$1 LIMIT 1)", [manifest.release.id])).rejects.toMatchObject({ code: "23514" });
      const record = manifest.coverageRecords[0]!;
      const scopeKey = canonicalCoverageScopeKey(record.scope);
      await pool.query("DELETE FROM coverage_input_snapshots WHERE release_id=$1 AND domain=$2 AND scope_key=$3", [manifest.release.id, record.domain, scopeKey]);
      await pool.query("DELETE FROM coverage_missing_reasons WHERE release_id=$1 AND domain=$2 AND scope_key=$3", [manifest.release.id, record.domain, scopeKey]);
      await pool.query("UPDATE coverage_records SET scope_key='tampered' WHERE release_id=$1 AND domain=$2", [manifest.release.id, record.domain]);
      await expect(loadNationwideManifest(pool, manifest.release.id)).rejects.toThrow("coverage scope key mismatch");
    } finally { await pool.end(); }
  }, 30_000);

  it("Task 3 persists successful staged facts and resumes a dry run", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const raw = task3Raw(); const adapter = task3Adapter(raw, [{ key: "identity-1", entity: "entity-1" }]);
      const first = await runSource(adapter, { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") });
      expect(first.runIds).toHaveLength(1);
      expect((await pool.query("SELECT status,staged_count,quarantined_count FROM ingest_runs WHERE id=$1", [first.runIds[0]])).rows[0]).toEqual({ status: "loaded", staged_count: 1, quarantined_count: 0 });
      expect((await pool.query("SELECT entity_id FROM stg_identity WHERE run_id=$1", [first.runIds[0]])).rows).toEqual([{ entity_id: "entity-1" }]);
      expect((await pool.query("SELECT id,display_name FROM people WHERE release_id=$1 AND id='task3_entity-1'", [task3ReleaseId])).rows).toEqual([{ id: "task3_entity-1", display_name: "Fixture" }]);
    } finally { await pool.end(); }
  });

  it("Task 3 dry-run validates then real rerun resumes without parsing or staging", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const raw = task3Raw(); let parsed = 0; let staged = 0; const base = task3Adapter(raw, [{ key: "identity-1", entity: "entity-1" }]);
      const adapter = { ...base, async *parse(value: RawObject<null>) { parsed += 1; yield* base.parse(value); }, async stage(client: PoolClient, id: string, rows: readonly IdentityRow[]) { staged += 1; await base.stage(client, id, rows); } };
      const dry = await runSource(adapter, { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z"), dryRun: true });
      expect((await pool.query("SELECT status FROM ingest_runs WHERE id=$1", [dry.runIds[0]])).rows[0]).toEqual({ status: "validated" });
      await runSource(adapter, { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") });
      expect({ parsed, staged }).toEqual({ parsed: 1, staged: 1 });
      expect((await pool.query("SELECT status FROM ingest_runs WHERE id=$1", [dry.runIds[0]])).rows[0]).toEqual({ status: "loaded" });
    } finally { await pool.end(); }
  });

  it("Task 3 rolls back content and validation when loading fails", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const raw = task3Raw("snap_load_failure", "9".repeat(64));
      await expect(runSource(task3Adapter(raw, [{ key: "identity-load", entity: "load" }], { loadError: true }), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") })).rejects.toThrow("Ingestion failed");
      expect((await pool.query("SELECT status FROM ingest_runs")).rows).toEqual([{ status: "failed" }]);
      expect((await pool.query("SELECT id FROM people WHERE release_id=$1 AND id='task3_load'", [task3ReleaseId])).rows).toEqual([]);
    } finally { await pool.end(); }
  });

  it("Task 3 loaded reuse is read-only and rejects conflicting snapshots", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const raw = task3Raw(); const adapter = task3Adapter(raw, [{ key: "identity-1", entity: "entity-1" }]); const first = await runSource(adapter, { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") });
      const before = await pool.query("SELECT (SELECT count(*) FROM source_snapshots WHERE release_id=$1) snapshots,(SELECT count(*) FROM stg_identity WHERE run_id=$2) facts", [task3ReleaseId, first.runIds[0]]);
      await expect(runSource(adapter, { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") })).resolves.toEqual({ runIds: [], reusedRunIds: first.runIds });
      expect(await pool.query("SELECT (SELECT count(*) FROM source_snapshots WHERE release_id=$1) snapshots,(SELECT count(*) FROM stg_identity WHERE run_id=$2) facts", [task3ReleaseId, first.runIds[0]])).toEqual(before);
      const conflicting = { ...raw, snapshot: { ...raw.snapshot, license: "restricted" } };
      await expect(runSource(task3Adapter(conflicting, [{ key: "identity-1", entity: "entity-1" }]), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") })).rejects.toThrow("SNAPSHOT_CONFLICT");
    } finally { await pool.end(); }
  });

  it("Task 3 commits opaque quarantine evidence before a later parse failure", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const raw = task3Raw("snap_quarantine", "d".repeat(64), 2); const base = task3Adapter(raw, []);
      const adapter = { ...base, async *parse() { yield { kind: "quarantine" as const, sourceNaturalKey: "opaque natural key", payloadChecksum: "e".repeat(64), errorCode: "parser text" }; throw new Error("parse failure"); } };
      await expect(runSource(adapter, { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z"), maxBatchSize: 1 })).rejects.toThrow("Ingestion failed");
      const evidence = await pool.query<{ source_natural_key: string; parser_error_code: string; redacted_diagnostic: string }>("SELECT q.source_natural_key,q.parser_error_code,q.redacted_diagnostic FROM quarantined_records q");
      expect(evidence.rows[0]).toMatchObject({ source_natural_key: /^[a-f0-9]{64}$/, parser_error_code: /^parse_[a-f0-9]{16}$/, redacted_diagnostic: "parser failure" });
      expect((await pool.query("SELECT status FROM ingest_runs")).rows[0]).toEqual({ status: "failed" });
    } finally { await pool.end(); }
  });

  it("Task 3 fails duplicate cross-batch staging and real staged validation", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const duplicateRaw = task3Raw("snap_duplicate", "f".repeat(64), 2);
      await expect(runSource(task3Adapter(duplicateRaw, [{ key: "same", entity: "one" }, { key: "same", entity: "two" }]), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z"), maxBatchSize: 1 })).rejects.toThrow("Ingestion failed");
      expect((await pool.query("SELECT status FROM ingest_runs")).rows[0]).toEqual({ status: "failed" });
      const invalidRaw = task3Raw("snap_invalid", "1".repeat(64));
      await expect(runSource(task3Adapter(invalidRaw, [{ key: "invalid", entity: "invalid" }], { issue: true }), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") })).rejects.toThrow("Staged validation failed");
      expect((await pool.query("SELECT status FROM ingest_runs ORDER BY started_at DESC LIMIT 1")).rows[0]).toEqual({ status: "failed" });
    } finally { await pool.end(); }
  });

  it("Task 3 failure with a max-one pool finishes and a loaded run is reused after a failed retry", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
    try {
      const sourceId = await seedTask3(pool); const raw = task3Raw();
      await expect(runSource(task3Adapter(raw, [{ key: "bad", entity: "bad" }], { stageError: true }), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") })).rejects.toThrow("Ingestion failed");
      const good = await runSource(task3Adapter(raw, [{ key: "good", entity: "good" }]), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") });
      await expect(runSource(task3Adapter(raw, [{ key: "ignored", entity: "ignored" }]), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") })).resolves.toEqual({ runIds: [], reusedRunIds: good.runIds });
    } finally { await pool.end(); }
  }, 5_000);
  it("Task 3 blocks publication while a lease runs and allows validated runs", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const run = strictRun("run_task3_publication", task3ReleaseId, sourceId, 0);
      await startIngestRun(pool, run);
      await expect(promoteCandidateRelease(pool, task3ReleaseId)).rejects.toThrow();
      await markValidated(pool, run.id, run.leaseToken);
      await expect(promoteCandidateRelease(pool, task3ReleaseId)).resolves.toBeUndefined();
    } finally { await pool.end(); }
  });

  it("Task 3 fences expired owners, recovers the persisted receipt, and loads a distinct retry", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const sourceId = await seedTask3(pool); const raw = task3Raw("snap_expired", "7".repeat(64), 0);
      await pool.query("INSERT INTO source_snapshots(id,release_id,source_id,source_url,published_at,retrieved_at,checksum_sha256,parser_version,license,usage_status) VALUES($1,$2,$3,$4,NULL,clock_timestamp(),$5,$6,'public','approved')", [raw.snapshot.id, task3ReleaseId, sourceId, raw.snapshot.sourceUrl, raw.snapshot.checksumSha256, "task3-v1"]);
      const expired = { ...strictRun("run_task3_expired", task3ReleaseId, sourceId, 0, raw.snapshot.id, raw.receipt.sha256, raw.snapshot.upstreamRelease), adapterVersion: "task3-v1", rawStoreLocator: raw.receipt.storeLocator, rawObjectKey: raw.receipt.objectKey };
      await pool.query("INSERT INTO ingest_runs(id,release_id,source_id,snapshot_id,adapter_version,upstream_release,raw_store_kind,raw_store_locator,raw_object_key,raw_object_sha256,raw_object_byte_size,lease_token,heartbeat_at,lease_expires_at,started_at,status,extracted_count,staged_count,quarantined_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '2 minutes','running',$13,0,0)", [expired.id, expired.releaseId, expired.sourceId, expired.snapshotId, expired.adapterVersion, expired.upstreamRelease, expired.rawStoreKind, expired.rawStoreLocator, expired.rawObjectKey, expired.rawObjectSha256, expired.rawObjectByteSize, expired.leaseToken, expired.extractedCount]);
      await expect(pool.query("UPDATE ingest_runs SET heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '1 minute' WHERE id=$1", [expired.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE ingest_runs SET staged_count=staged_count WHERE id=$1", [expired.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE ingest_runs SET status='validated',completed_at=clock_timestamp(),lease_expires_at=NULL WHERE id=$1", [expired.id])).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query("UPDATE ingest_runs SET status='failed',completed_at=clock_timestamp(),lease_expires_at=NULL,failure_code='ingest_error' WHERE id=$1", [expired.id])).rejects.toMatchObject({ code: "23514" });
      const recovered = await runSource(task3Adapter(raw, []), { pool, releaseId: task3ReleaseId as never, sourceId: sourceId as never, cutoff: new Date("2025-01-01Z") });
      expect(recovered.runIds).toHaveLength(1); expect(recovered.runIds[0]).not.toBe(expired.id);
      expect((await pool.query("SELECT status,failure_code,lease_expires_at FROM ingest_runs WHERE id=$1", [expired.id])).rows[0]).toEqual({ status: "failed", failure_code: "lease_expired", lease_expires_at: null });
      expect((await pool.query("SELECT status FROM ingest_runs WHERE id=$1", [recovered.runIds[0]])).rows[0]).toEqual({ status: "loaded" });
      await expect(recordStageBatch(pool, expired.id, expired.leaseToken, 0, expired.leaseDurationMs)).rejects.toThrow();
      await expect(recordQuarantineBatch(pool, expired.id, expired.leaseToken, 0, expired.leaseDurationMs)).rejects.toThrow();
      await expect(heartbeat(pool, expired.id, expired.leaseToken, expired.leaseDurationMs)).rejects.toThrow();
      await expect(markValidated(pool, expired.id, expired.leaseToken)).rejects.toThrow();
      await expect(markFailed(pool, expired.id, expired.leaseToken)).rejects.toThrow();
      await expect(failExpiredRun(pool, expired.id, expired.leaseToken)).rejects.toThrow();
    } finally { await pool.end(); }
  });

  it("Task 4 finalizes retained nationwide identity and TIGER runs atomically", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    const releaseId = "rel_task4_nationwide";
    const rawRoot = resolve(process.cwd(), ".test-raw-task4-nationwide");
    const sourceIds = { identity: "src_task4_identity", tiger: "src_task4_tiger" };
    try {
      await rm(rawRoot, { recursive: true, force: true });
      await pool.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) VALUES($1,'Task 4 nationwide candidate','candidate',$2,$2,NULL,NULL)", [releaseId, "2026-07-18T00:00:00.000Z"]);
      await pool.query("INSERT INTO sources(id,release_id,name,authority,homepage_url) VALUES($1,$2,'identity','derived','https://clerk.house.gov/'),($3,$2,'tiger','derived','https://www.census.gov/')", [sourceIds.identity, releaseId, sourceIds.tiger]);

      const identityRoot = resolve(process.cwd(), "data/source/identity");
      const geometryRoot = resolve(process.cwd(), "data/geometry/versions/9a5e76fc39867c92b0c816e4b23ca9c467d070c1eafbef6d0988b24e480c4871");
      const [house, senate, senateServiceStarts, cd119, states, tigerManifestBytes] = await Promise.all([
        readFile(resolve(identityRoot, "house-member-data.xml")), readFile(resolve(identityRoot, "senate-members.xml")), readFile(resolve(identityRoot, "senate-service-starts.json")),
        readFile(resolve(geometryRoot, "tiger2025-national-cd119.geojson")), readFile(resolve(geometryRoot, "tiger2025-national-states.geojson")), readFile(resolve(geometryRoot, "tiger2025-national-manifest.json")),
      ]);
      const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
      const sourceLockSha256 = checksum(await readFile(resolve(process.cwd(), "data/source-lock.json")));
      const houseCounts: Record<string, number> = { AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14, HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8, MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12, NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7, SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1 };
      const houseUniverse: HouseSeat[] = [...Object.entries(houseCounts).flatMap(([stateCode, count]) => Array.from({ length: count }, (_, index) => ({ stateCode, districtCode: (count === 1 ? "AL" : String(index + 1).padStart(2, "0")) as HouseSeat["districtCode"], kind: "representative" as const, termStartsAt: "2025-01-03", termEndsAt: "2027-01-03" }))), ...(["DC", "AS", "GU", "MP", "VI"] as const).map(stateCode => ({ stateCode, districtCode: "AL" as const, kind: "delegate" as const, termStartsAt: "2025-01-03", termEndsAt: "2027-01-03" })), { stateCode: "PR", districtCode: "AL", kind: "resident_commissioner", termStartsAt: "2025-01-03", termEndsAt: "2029-01-03" }];
      const senateUniverse: SenateSeat[] = parseSenateRoster(senate.toString(), parseSenateServiceStartsArtifact(senateServiceStarts.toString())).records.map(row => ({ stateCode: row.office.stateCode, senateClass: row.office.senateClass!, ...(row.office.senateClass === 1 ? { termStartsAt: "2025-01-03", termEndsAt: "2031-01-03" } : row.office.senateClass === 2 ? { termStartsAt: "2021-01-03", termEndsAt: "2027-01-03" } : { termStartsAt: "2023-01-03", termEndsAt: "2029-01-03" }) }));
      const rawStore = new LocalRawObjectStore(rawRoot);
      const identity = createIdentityAdapter({ rawStore, snapshotId: "snap_task4_identity" as never, upstreamRelease: "2025", parserVersion: "identity-v1", releaseCutoff: "2026-07-18", sourceLockSha256, house: { bytes: house, url: "https://clerk.house.gov/xml/lists/MemberData.xml", checksumSha256: checksum(house), lockId: "house-xml" }, senate: { bytes: senate, url: "https://www.senate.gov/general/contact_information/senators_cfm.xml", checksumSha256: checksum(senate), lockId: "senate-xml" }, senateServiceStarts: { bytes: senateServiceStarts, url: "urn:dsa-seats:senate-service-starts:v1", checksumSha256: checksum(senateServiceStarts), lockId: "senate-service-starts" }, houseUniverse, senateUniverse, senatePolicy: { noSenateJurisdictions: new Set(["DC", "PR", "AS", "GU", "MP", "VI"]) } });
      const tiger = createTigerAdapter({ rawStore, snapshotId: "snap_task4_tiger" as never, upstreamRelease: "2025", parserVersion: "tiger-v1", sourceLockSha256, lockIds: { cd119: "geo-national-cd119", states: "geo-national-states", manifest: "geo-national-manifest", bundle: "geo-national-bundle" }, manifest: JSON.parse(tigerManifestBytes.toString()) as NationalTigerArtifactManifest, cd119Bytes: cd119, statesBytes: states, sourceUrl: "urn:dsa-seats:tiger2025:national-manifest" });
      const identityRun = await runSource(identity, { pool, releaseId: releaseId as never, sourceId: sourceIds.identity as never, cutoff: new Date("2026-07-18T00:00:00.000Z"), dryRun: true });
      const tigerRun = await runSource(tiger, { pool, releaseId: releaseId as never, sourceId: sourceIds.tiger as never, cutoff: new Date("2026-07-18T00:00:00.000Z"), dryRun: true });
      expect(identityRun.runIds).toHaveLength(1); expect(tigerRun.runIds).toHaveLength(1);
      await expect(finalizeNationwideCandidate({ pool, rawStore, releaseId, identityRunId: identityRun.runIds[0]!, tigerRunId: tigerRun.runIds[0]!, sourceLockSha256: "0".repeat(64) })).rejects.toThrow("NATIONWIDE_FINALIZE_SOURCE_LOCK_MISMATCH");
      await expect(finalizeNationwideCandidate({ pool, rawStore, releaseId, identityRunId: identityRun.runIds[0]!, tigerRunId: "run_task4_missing", sourceLockSha256 })).rejects.toThrow("NATIONWIDE_FINALIZE_CANDIDATE_INVALID");
      expect((await pool.query("SELECT status FROM ingest_runs WHERE id = ANY($1) ORDER BY source_id", [[identityRun.runIds[0], tigerRun.runIds[0]]])).rows).toEqual([{ status: "validated" }, { status: "validated" }]);
      expect((await pool.query("SELECT 1 FROM release_manifests WHERE release_id=$1", [releaseId])).rowCount).toBe(0);
      for (const table of contentTableRegistry.filter(({ name }) => name !== "sources" && name !== "source_snapshots")) expect((await pool.query(`SELECT 1 FROM ${table.name} WHERE release_id=$1 LIMIT 1`, [releaseId])).rowCount).toBe(0);

      await finalizeNationwideCandidate({ pool, rawStore, releaseId, identityRunId: identityRun.runIds[0]!, tigerRunId: tigerRun.runIds[0]!, sourceLockSha256 });
      expect((await pool.query("SELECT status,published_at FROM data_releases WHERE id=$1", [releaseId])).rows).toEqual([{ status: "candidate", published_at: null }]);
      expect((await pool.query("SELECT status FROM ingest_runs WHERE id = ANY($1) ORDER BY source_id", [[identityRun.runIds[0], tigerRun.runIds[0]]])).rows).toEqual([{ status: "loaded" }, { status: "loaded" }]);
      expect((await pool.query("SELECT 1 FROM nationwide_validation_gates WHERE release_id=$1", [releaseId])).rowCount).toBe(1);
      await expect(recheckNationwideValidationGate(pool, releaseId)).resolves.toBeUndefined();
      const contentCounts = async () => Object.fromEntries(await Promise.all(contentTableRegistry.map(async ({ name }) => [name, (await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${name} WHERE release_id=$1`, [releaseId])).rows[0]!.count])));
      const beforeRetryContentCounts = await contentCounts();
      await expect(finalizeNationwideCandidate({ pool, rawStore, releaseId, identityRunId: identityRun.runIds[0]!, tigerRunId: tigerRun.runIds[0]!, sourceLockSha256 })).resolves.toBeUndefined();
      expect(await contentCounts()).toEqual(beforeRetryContentCounts);
      await expect(recheckNationwideValidationGate(pool, releaseId)).resolves.toBeUndefined();
      const loaded = await loadNationwideManifest(pool, releaseId);
      expect(computeCanonicalDataChecksum(loaded)).toBe(loaded.canonicalDataChecksumSha256);
      expect(loaded.sources).toEqual([{ id: sourceIds.identity, releaseId, name: "identity", authority: "derived", homepageUrl: "https://clerk.house.gov/" }, { id: sourceIds.tiger, releaseId, name: "tiger", authority: "derived", homepageUrl: "https://www.census.gov/" }]);
      expect(loaded.snapshots.map(snapshot => ({ id: snapshot.id, sourceId: snapshot.sourceId, sourceUrl: snapshot.sourceUrl, parserVersion: snapshot.parserVersion, usageStatus: snapshot.usageStatus }))).toEqual([{ id: "snap_task4_identity", sourceId: sourceIds.identity, sourceUrl: "identity-envelope:https://clerk.house.gov/xml/lists/MemberData.xml|https://www.senate.gov/general/contact_information/senators_cfm.xml|urn:dsa-seats:senate-service-starts:v1", parserVersion: "identity-v1", usageStatus: "approved" }, { id: "snap_task4_tiger", sourceId: sourceIds.tiger, sourceUrl: "urn:dsa-seats:tiger2025:national-manifest", parserVersion: "tiger-v1", usageStatus: "approved" }]);
      expect({ house: loaded.offices.filter(row => row.chamber === "house").length, senate: loaded.offices.filter(row => row.chamber === "senate").length, cycles: loaded.seatCycles.length, geographies: loaded.geographyVersions.length, memberships: loaded.memberships.length, vacantHouseCycles: loaded.seatCycles.filter(row => row.occupancy.status === "vacant" && loaded.offices.find(office => office.id === row.officeId)?.chamber === "house").length, jurisdictions: loaded.jurisdictions.length }).toEqual({ house: 441, senate: 100, cycles: 541, geographies: 497, memberships: 537, vacantHouseCycles: 4, jurisdictions: 56 });
      expect(loaded.seatCycles.filter(row => row.occupancy.status === "vacant").every(row => !loaded.memberships.some(membership => membership.officeTermId === row.officeTermId))).toBe(true);
      const prOffice = loaded.offices.find(row => row.kind === "resident_commissioner")!;
      const prTerm = loaded.officeTerms.find(row => row.officeId === prOffice.id)!;
      expect(prTerm).toMatchObject({ id: "term_house_pr_al_2029_01_03", startsAt: "2025-01-03", endsAt: "2029-01-03" });
      expect(loaded.memberships.find(row => row.officeTermId === prTerm.id)).toMatchObject({ startsAt: "2025-01-03", endsAt: "2029-01-03" });
      const alRepresentativeTerm = loaded.officeTerms.find(row => row.officeId === loaded.offices.find(office => office.stateCode === "AL" && office.kind === "house_voting")!.id)!;
      expect(alRepresentativeTerm).toMatchObject({ startsAt: "2025-01-03", endsAt: "2027-01-03" });
      expect(loaded.memberships.find(row => row.officeTermId === alRepresentativeTerm.id)).toMatchObject({ startsAt: "2025-01-03", endsAt: "2027-01-03" });
      const boundaries = await pool.query<{ srid: number; type: string; nonempty: boolean; valid: boolean }>("SELECT ST_SRID(boundary) srid,ST_GeometryType(boundary) type,NOT ST_IsEmpty(boundary) nonempty,ST_IsValid(boundary) valid FROM geography_versions WHERE release_id=$1", [releaseId]);
      expect(boundaries.rows).toHaveLength(loaded.geographyVersions.length);
      expect(boundaries.rows.every(boundary => boundary.srid === 4326 && boundary.type === "ST_MultiPolygon" && boundary.nonempty && boundary.valid)).toBe(true);
      expect(JSON.stringify(loaded)).not.toContain("original_publisher");
      expect({ contests: loaded.contests, acs: loaded.acsObservations, finance: [loaded.financeSummaries, loaded.financeAggregates, loaded.fundingCategoryAggregates, loaded.fundingOrganizationAggregates, loaded.outsideSpendingAggregates], maps: loaded.mapArtifacts }).toEqual({ contests: [], acs: [], finance: [[], [], [], [], []], maps: [] });
      const client = await pool.connect();
      try {
        const point = async (stateCode: string) => (await client.query<{ longitude: number; latitude: number }>("SELECT ST_X(ST_PointOnSurface(boundary)) longitude,ST_Y(ST_PointOnSurface(boundary)) latitude FROM geography_versions WHERE release_id=$1 AND kind='house_district' AND state_code=$2 ORDER BY district_code LIMIT 1", [releaseId, stateCode])).rows[0]!;
        const zeroSenatePoints = await client.query<{ state_code: string; longitude: number; latitude: number }>("SELECT state_code,ST_X(ST_PointOnSurface(boundary)) longitude,ST_Y(ST_PointOnSurface(boundary)) latitude FROM geography_versions WHERE release_id=$1 AND kind='house_district' AND state_code = ANY($2) ORDER BY state_code", [releaseId, ["DC", "PR", "AS", "GU", "MP", "VI"]]);
        const zeroSenateHouseCycles = { AS: "seat_house_as_al_current", DC: "seat_house_dc_al_current", GU: "seat_house_gu_al_current", MP: "seat_house_mp_al_current", PR: "seat_house_pr_al_current", VI: "seat_house_vi_al_current" };
        expect(zeroSenatePoints.rows).toHaveLength(6);
        for (const { state_code, longitude, latitude } of zeroSenatePoints.rows) await expect(locateNationwideCandidatePoint(client, releaseId, longitude, latitude)).resolves.toEqual({ kind: "matched", houseSeatCycleId: zeroSenateHouseCycles[state_code as keyof typeof zeroSenateHouseCycles], senateSeatCycleIds: [] });
        const al = await point("AL");
        await expect(locateNationwideCandidatePoint(client, releaseId, al.longitude, al.latitude)).resolves.toEqual({ kind: "matched", houseSeatCycleId: "seat_house_al_01_current", senateSeatCycleIds: ["seat_senate_al_2_current", "seat_senate_al_3_current"] });
      } finally { client.release(); }
    } finally { await pool.end(); await rm(rawRoot, { recursive: true, force: true }); }
  }, 300_000);

  it("Task 11 enforces correction intake, review, controls, and release isolation with real principals", async () => {
    const owner = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const password = randomUUID();
    const principals = {
      intake: `dsa_task11_intake_${suffix}`, reviewer: `dsa_task11_reviewer_${suffix}`,
      maintenance: `dsa_task11_maintenance_${suffix}`, web: `dsa_task11_web_${suffix}`,
    } as const;
    const inherited = { intake: "dsa_seats_correction_intake", reviewer: "dsa_seats_correction_reviewer", maintenance: "dsa_seats_correction_maintenance", web: "dsa_seats_web" } as const;
    const loginUrl = (name: string) => { const url = new URL(testDatabaseUrl!); url.username = name; url.password = password; return url.toString(); };
    const pools: Pool[] = [];
    const hash = (value: string) => createHash("sha256").update(value).digest();
    try {
      expect((await owner.query<{ permitted: boolean }>("SELECT rolsuper OR rolcreaterole AS permitted FROM pg_roles WHERE rolname=current_user")).rows[0]?.permitted).toBe(true);
      for (const [kind, name] of Object.entries(principals)) {
        await owner.query(`CREATE ROLE "${name}" LOGIN INHERIT PASSWORD '${password}'`);
        await owner.query(`GRANT ${inherited[kind as keyof typeof inherited]} TO "${name}"`);
        expect((await owner.query<{ role: string }>("SELECT granted.rolname role FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE member.rolname=$1", [name])).rows).toEqual([{ role: inherited[kind as keyof typeof inherited] }]);
      }
      const intakePool = new Pool({ connectionString: loginUrl(principals.intake), max: 12 });
      const reviewerPool = new Pool({ connectionString: loginUrl(principals.reviewer), max: 4 });
      const maintenancePool = new Pool({ connectionString: loginUrl(principals.maintenance) });
      const webPool = new Pool({ connectionString: loginUrl(principals.web) });
      pools.push(intakePool, reviewerPool, maintenancePool, webPool);

      const v1 = candidate(`rel_task11_v1_${suffix}`); await seedPrototypeManifest(owner, v1, boundariesFor(v1)); await promoteCandidateRelease(owner, v1.release.id);
      const { manifest: v2, bundle } = persistedNationwideSkeleton();
      v2.release = { ...v2.release, previousReleaseId: v1.release.id };
      v2.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(v2);
      await seedNationwideCandidateManifest(owner, v2, bundle); await validateNationwideCandidateRelease(owner, v2.release.id); await promoteCandidateRelease(owner, v2.release.id);
      const before = await owner.query("SELECT (SELECT jsonb_agg(row_to_json(d) ORDER BY domain) FROM release_content_digests d WHERE d.release_id=$1) digests,(SELECT row_to_json(m) FROM release_manifests m WHERE m.release_id=$1) manifest,(SELECT row_to_json(g) FROM nationwide_validation_gates g WHERE g.release_id=$1) gate", [v2.release.id]);
      expect((before.rows[0] as { digests: unknown[] }).digests).toHaveLength(7);
      const seat = v2.seatCycles[0]!.id;
      const intake = new CorrectionRepository(intakePool); const reviewer = new CorrectionReviewerRepository(reviewerPool);
      const submit = (key: string, subject: string, extra: Partial<{ releaseId: string; seatCycleId: string; fieldPath: string; explanation: string; sourceUrl: string }> = {}) => intake.submit({ keyHash: hash(key), subjectHash: hash(subject), releaseId: v2.release.id, seatCycleId: seat, fieldPath: "identity.party", explanation: "  Correct this published record please.\r\n", sourceUrl: "https://example.com/evidence", ...extra });
      const first = await submit("first", "first");
      expect(first).toMatchObject({ outcome: "accepted", created: true, retryAfter: null });
      expect((await owner.query("SELECT release_id,seat_cycle_id,field_path,explanation,source_url FROM operations.correction_submissions WHERE id=$1", [first.correctionId])).rows[0]).toEqual({ release_id: v2.release.id, seat_cycle_id: seat, field_path: "identity.party", explanation: "Correct this published record please.", source_url: "https://example.com/evidence" });
      expect((await owner.query("SELECT actor,to_status,sequence FROM operations.correction_review_events WHERE submission_id=$1", [first.correctionId])).rows[0]).toEqual({ actor: principals.intake, to_status: "submitted", sequence: 1 });

      const raced = await Promise.all([submit("race", "race"), submit("race", "race")]);
      expect(raced.map(row => row.created).sort()).toEqual([false, true]); expect(new Set(raced.map(row => row.correctionId)).size).toBe(1);
      await expect(submit("race", "race", { explanation: "A different correction explanation." })).resolves.toMatchObject({ outcome: "idempotency_conflict" });
      const unavailable = await submit("gone", "gone", { releaseId: "rel_missing" });
      expect(unavailable.outcome).toBe("target_unavailable"); expect(await submit("gone", "gone", { releaseId: "rel_missing" })).toMatchObject({ outcome: "target_unavailable", created: false });
      await expect(submit("gone", "gone", { releaseId: "rel_missing_2" })).resolves.toMatchObject({ outcome: "idempotency_conflict" });
      await expect(submit("invalid", "invalid", { releaseId: "bad" })).resolves.toMatchObject({ outcome: "invalid_request" });
      await expect(submit("missing-seat", "missing-seat", { seatCycleId: "seat_missing" })).resolves.toMatchObject({ outcome: "target_unavailable" });

      await owner.query("DELETE FROM operations.correction_rate_limit_buckets");
      const flood = await Promise.all(Array.from({ length: 105 }, (_, n) => submit(`flood-${n}`, `flood-${n}`)));
      expect(flood.filter(row => row.outcome === "accepted")).toHaveLength(100);
      expect((await owner.query("SELECT count(*)::int count FROM operations.correction_rate_limit_buckets WHERE bucket_kind='subject_hour'")).rows[0]).toEqual({ count: 100 });
      await owner.query("DELETE FROM operations.correction_rate_limit_buckets");
      const subjectSix = await Promise.all(Array.from({ length: 6 }, (_, n) => submit(`six-${n}`, "same-subject")));
      expect(subjectSix.filter(row => row.outcome === "accepted")).toHaveLength(5); expect(subjectSix.some(row => row.outcome === "rate_limited" && row.retryAfter)).toBe(true);
      expect((await owner.query("SELECT bucket_kind,count FROM operations.correction_rate_limit_buckets WHERE bucket_kind LIKE 'global_%' ORDER BY bucket_kind")).rows).toEqual([{ bucket_kind: "global_day", count: 5 }, { bucket_kind: "global_minute", count: 5 }]);

      await expect(webPool.query("SELECT * FROM operations.correction_submissions")).rejects.toMatchObject({ code: "42501" });
      await expect(intakePool.query("SELECT * FROM operations.correction_submissions")).rejects.toMatchObject({ code: "42501" });
      await expect(intakePool.query("SELECT operations.transition_correction_v1($1,1,'submitted','in_review','triaged',NULL,NULL)", [first.correctionId])).rejects.toMatchObject({ code: "42501" });
      await expect(reviewerPool.query("UPDATE operations.correction_submissions SET explanation='no' WHERE id=$1", [first.correctionId])).rejects.toMatchObject({ code: "42501" });
      await expect(reviewerPool.query("SELECT * FROM operations.list_corrections_v1(NULL,NULL,101)")).rejects.toMatchObject({ code: "22023" });
      await expect(maintenancePool.query("SELECT * FROM operations.correction_idempotency_keys")).rejects.toMatchObject({ code: "42501" });
      await owner.query(`GRANT dsa_seats_correction_reviewer TO "${principals.intake}"`);
      await expect(submit("mixed", "mixed")).rejects.toMatchObject({ code: "42501" });
      await owner.query(`REVOKE dsa_seats_correction_reviewer FROM "${principals.intake}"`);
      await owner.query(`GRANT dsa_seats_web TO "${principals.intake}"`);
      await expect(intake.consumeAttempt(hash("mixed-web"))).rejects.toMatchObject({ code: "42501" });
      await owner.query(`REVOKE dsa_seats_web FROM "${principals.intake}"`);
      await owner.query(`GRANT dsa_seats_web TO "${principals.reviewer}"`);
      await expect(reviewer.list({ limit: 1 })).rejects.toMatchObject({ code: "42501" });
      await owner.query(`REVOKE dsa_seats_web FROM "${principals.reviewer}"`);
      for (const mixedRole of ["dsa_seats_address_lookup", "dsa_seats_fec_v2_acquisition"]) {
        await owner.query(`GRANT ${mixedRole} TO "${principals.reviewer}"`);
        await expect(reviewer.list({ limit: 1 })).rejects.toMatchObject({ code: "42501" });
        await expect(reviewer.transition({ correctionId: first.correctionId!, expectedSequence: 1, expectedStatus: "submitted", toStatus: "in_review", reasonCode: "triaged" })).rejects.toMatchObject({ code: "42501" });
        await owner.query(`REVOKE ${mixedRole} FROM "${principals.reviewer}"`);
      }

      await owner.query("DELETE FROM operations.correction_rate_limit_buckets");
      const reviewable = await submit("review", "review"); const id = reviewable.correctionId!;
      const firstPage = await reviewer.list({ limit: 2 });
      expect(firstPage).toHaveLength(2);
      const last = firstPage.at(-1)!;
      const secondPage = await reviewer.list({ after: { submittedAt: last.submittedAt, id: last.id }, limit: 2 });
      expect(secondPage).toHaveLength(2);
      expect(secondPage.map(row => row.id)).not.toEqual(expect.arrayContaining(firstPage.map(row => row.id)));
      const concurrent = await Promise.all([reviewer.transition({ correctionId: id, expectedSequence: 1, expectedStatus: "submitted", toStatus: "in_review", reasonCode: "triaged" }), reviewer.transition({ correctionId: id, expectedSequence: 1, expectedStatus: "submitted", toStatus: "in_review", reasonCode: "triaged" })]);
      expect(concurrent.map(row => row.outcome).sort()).toEqual(["conflict", "transitioned"]);
      expect(await reviewer.transition({ correctionId: id, expectedSequence: 2, expectedStatus: "in_review", toStatus: "accepted", reasonCode: "approved" })).toMatchObject({ outcome: "transitioned", sequence: 3 });
      const candidateId = `rel_task11_candidate_${suffix}`;
      await owner.query("INSERT INTO data_releases(id,label,status,source_cutoff,created_at,published_at,previous_release_id) SELECT $1,'Task 11 candidate','candidate',source_cutoff,clock_timestamp(),NULL,id FROM data_releases WHERE id=$2", [candidateId, v2.release.id]);
      await baselineCandidateRelease(owner, v2.release.id, candidateId);
      const snapshot = (await owner.query<{ id: string; checksum_sha256: string }>("SELECT id,checksum_sha256 FROM source_snapshots WHERE release_id=$1 AND usage_status='approved' LIMIT 1", [candidateId])).rows[0]!;
      expect(await reviewer.transition({ correctionId: id, expectedSequence: 3, expectedStatus: "accepted", toStatus: "queued", reasonCode: "needs_candidate", candidateReleaseId: candidateId })).toMatchObject({ outcome: "transitioned", sequence: 4 });
      await expect(reviewer.transition({ correctionId: id, expectedSequence: 4, expectedStatus: "queued", toStatus: "incorporated", reasonCode: "incorporated", candidateReleaseId: candidateId, approvedSnapshotId: "missing" })).resolves.toMatchObject({ outcome: "invalid_transition" });
      expect(await reviewer.transition({ correctionId: id, expectedSequence: 4, expectedStatus: "queued", toStatus: "incorporated", reasonCode: "incorporated", candidateReleaseId: candidateId, approvedSnapshotId: snapshot.id })).toMatchObject({ outcome: "transitioned", sequence: 5 });
      expect((await owner.query("SELECT approved_snapshot_checksum FROM operations.correction_review_events WHERE submission_id=$1 AND sequence=5", [id])).rows[0]).toEqual({ approved_snapshot_checksum: snapshot.checksum_sha256 });
      await expect(owner.query("UPDATE operations.correction_review_events SET reason_code='x' WHERE submission_id=$1", [id])).rejects.toMatchObject({ code: "55000" });

      const domainAccepts = (input: Record<string, unknown>) => { try { parseCorrectionSubmission(input); return true; } catch { return false; } };
      for (const vector of correctionParityVectors.ids) {
        const domainValid = domainAccepts({ releaseId: vector.value, seatCycleId: seat, fieldPath: "identity.party", explanation: "Correct this published record please." });
        expect((await submit(`id-${vector.value}`, `id-${vector.value}`, { releaseId: vector.value })).outcome === "invalid_request").toBe(!domainValid);
      }
      for (const vector of correctionParityVectors.sourceUrls) {
        const parsed = correctionSubmissionSchema.safeParse({ releaseId: v2.release.id, seatCycleId: seat, fieldPath: "identity.party", explanation: "Correct this published record please.", sourceUrl: vector.value });
        try {
          const canonical = (await owner.query<{ canonical: string | null }>("SELECT operations.canonical_correction_source_url($1) canonical", [vector.value])).rows[0]!.canonical;
          expect(canonical).toBe(parsed.success ? parsed.data.sourceUrl : null);
        } catch (error) {
          if (!(vector.value.includes("\0") && (error as { code?: string }).code === "22021")) throw error;
          expect(parsed.success).toBe(false);
        }
        let databaseInvalid = false;
        try {
          databaseInvalid = (await submit(`url-${vector.value}`, `url-${vector.value}`, { sourceUrl: vector.value })).outcome === "invalid_request";
        } catch (error) {
          if (!(vector.value.includes("\0") && (error as { code?: string }).code === "22021")) throw error;
          databaseInvalid = true;
        }
        expect(databaseInvalid).toBe(!parsed.success);
      }
      await owner.query("UPDATE operations.correction_idempotency_keys SET created_at=clock_timestamp()-interval '26 hours',expires_at=clock_timestamp()-interval '3 hours'; UPDATE operations.correction_rate_limit_buckets SET window_started_at=clock_timestamp()-interval '50 hours',expires_at=clock_timestamp()-interval '3 hours'");
      expect(await new CorrectionMaintenanceRepository(maintenancePool).cleanup()).toMatchObject({ idempotencyDeleted: expect.any(Number), rateBucketsDeleted: expect.any(Number) });
      expect((await owner.query("SELECT count(*)::int count FROM operations.correction_submissions")).rows[0].count).toBeGreaterThan(0);
      expect(await owner.query("SELECT (SELECT jsonb_agg(row_to_json(d) ORDER BY domain) FROM release_content_digests d WHERE d.release_id=$1) digests,(SELECT row_to_json(m) FROM release_manifests m WHERE m.release_id=$1) manifest,(SELECT row_to_json(g) FROM nationwide_validation_gates g WHERE g.release_id=$1) gate", [v2.release.id])).toEqual(before);
      expect((await owner.query("SELECT count(*)::int count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN ('operations.correction_submissions'::regclass,'operations.correction_review_events'::regclass) AND p.proname IN ('guard_candidate_release_content','guard_nationwide_content','guard_release_preflight')")).rows[0]).toEqual({ count: 0 });
    } finally {
      await Promise.all(pools.map(pool => pool.end()));
      for (const name of Object.values(principals)) await owner.query(`DROP ROLE IF EXISTS "${name}"`).catch(() => undefined);
      await owner.end();
    }
  }, 180_000);

  it("Task 12 isolates real address admission and resolves only the published nationwide release", async () => {
    const owner = new Pool({ connectionString: testDatabaseUrl });
    const suffix = randomUUID().replace(/-/g, "");
    const password = randomUUID();
    const principals = { lookup: `dsa_task12_lookup_${suffix}`, maintenance: `dsa_task12_maintenance_${suffix}` } as const;
    const inherited = { lookup: "dsa_seats_address_lookup", maintenance: "dsa_seats_address_maintenance" } as const;
    const pools: Pool[] = [];
    const loginUrl = (name: string) => { const url = new URL(testDatabaseUrl!); url.username = name; url.password = password; return url.toString(); };
    const hash = (value: string) => createHash("sha256").update(value).digest();
    const snapshot = async (releaseId: string) => (await owner.query("SELECT row_to_json(m) manifest,(SELECT row_to_json(g) FROM nationwide_validation_gates g WHERE g.release_id=$1) gate,(SELECT jsonb_agg(row_to_json(d) ORDER BY domain) FROM release_content_digests d WHERE d.release_id=$1) digests FROM release_manifests m WHERE m.release_id=$1", [releaseId])).rows;
    try {
      expect((await owner.query<{ permitted: boolean }>("SELECT rolsuper OR rolcreaterole permitted FROM pg_roles WHERE rolname=current_user")).rows[0]?.permitted).toBe(true);
      for (const [kind, name] of Object.entries(principals)) {
        await owner.query(`CREATE ROLE "${name}" LOGIN INHERIT PASSWORD '${password}'`);
        await owner.query(`GRANT ${inherited[kind as keyof typeof inherited]} TO "${name}"`);
        expect((await owner.query<{ role: string }>("SELECT granted.rolname role FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid WHERE member.rolname=$1 ORDER BY role", [name])).rows).toEqual([{ role: inherited[kind as keyof typeof inherited] }]);
      }
      const lookupPool = new Pool({ connectionString: loginUrl(principals.lookup), max: 16 });
      const maintenancePool = new Pool({ connectionString: loginUrl(principals.maintenance) });
      pools.push(lookupPool, maintenancePool);
      const lookup = new AddressAdmissionRepository(lookupPool);

      // Load both contracts: legacy v1 remains unavailable to nationwide address lookup;
      // v2 is validated before publication and retains the same locator decision shape.
      const v1 = candidate(`rel_task12_v1_${suffix}`);
      await seedPrototypeManifest(owner, v1, boundariesFor(v1)); await promoteCandidateRelease(owner, v1.release.id);
      const { manifest: v2, bundle } = persistedNationwideSkeleton();
      v2.release = { ...v2.release, previousReleaseId: v1.release.id };
      v2.canonicalDataChecksumSha256 = computeCanonicalDataChecksum(v2);
      await seedNationwideCandidateManifest(owner, v2, bundle); await validateNationwideCandidateRelease(owner, v2.release.id); await promoteCandidateRelease(owner, v2.release.id);
      const before = await snapshot(v2.release.id);
      expect((before[0] as { digests: unknown[] }).digests).toHaveLength(7);

      const locator = new PostgresSeatLocator(lookupPool);
      expect(await locator.preflight(v1.release.id, "synthetic")).toBe(false);
      expect(await locator.preflight(v2.release.id, "synthetic")).toBe(true);
      const point = async (state: string) => (await owner.query<{ state_geoid: string; district_geoid: string; longitude: number; latitude: number }>("SELECT s.source_geoid state_geoid,h.source_geoid district_geoid,ST_X(ST_PointOnSurface(h.boundary)) longitude,ST_Y(ST_PointOnSurface(h.boundary)) latitude FROM geography_versions h JOIN geography_versions s ON s.release_id=h.release_id AND s.kind='state' AND s.state_code=h.state_code WHERE h.release_id=$1 AND h.kind='house_district' AND h.state_code=$2 ORDER BY h.district_code LIMIT 1", [v2.release.id, state])).rows[0]!;
      const al = await point("AL");
      await expect(locator.locate(v2.release.id, "synthetic", al.state_geoid!, al.district_geoid!, al.longitude, al.latitude)).resolves.toMatchObject({ kind: "matched", senateRepresentation: "two_seats", senateSeats: expect.arrayContaining([expect.any(Object), expect.any(Object)]) });
      for (const state of ["DC", "PR", "GU", "VI", "AS", "MP"]) {
        const p = await point(state);
        await expect(locator.locate(v2.release.id, "synthetic", p.state_geoid!, p.district_geoid!, p.longitude, p.latitude)).resolves.toMatchObject({ kind: "matched", senateRepresentation: "none", senateSeats: [] });
      }

      await expect(lookupPool.query("SELECT * FROM operations.address_quota_buckets")).rejects.toMatchObject({ code: "42501" });
      await expect(lookupPool.query("UPDATE geography_versions SET label=label")).rejects.toMatchObject({ code: "42501" });
      await expect(maintenancePool.query("SELECT * FROM operations.address_canary_nonces")).rejects.toMatchObject({ code: "42501" });
      await expect(maintenancePool.query("SELECT * FROM operations.consume_address_lookup_v1($1)", [hash("x")])).rejects.toMatchObject({ code: "42501" });
      await owner.query(`GRANT dsa_seats_web TO "${principals.lookup}"`);
      await expect(lookup.consumeMetadataAttempt(hash("mixed"))).rejects.toMatchObject({ code: "42501" });
      await owner.query(`REVOKE dsa_seats_web FROM "${principals.lookup}"`);

      await owner.query("DELETE FROM operations.address_quota_buckets; DELETE FROM operations.address_canary_nonces");
      const queuedLookupPool = new Pool({ connectionString: loginUrl(principals.lookup), max: 1 });
      pools.push(queuedLookupPool);
      const heldLookupClient = await queuedLookupPool.connect();
      const queuedAbort = new AbortController();
      const queuedSubject = hash("task12-queued-abort");
      const queuedAttempt = new AddressAdmissionRepository(queuedLookupPool).consumeMetadataAttempt(queuedSubject, queuedAbort.signal);
      queuedAbort.abort();
      await expect(queuedAttempt).rejects.toBeInstanceOf(CallerAbortError);
      const lateCheckoutDestroyed = new Promise<void>(resolve => queuedLookupPool.once("remove", () => resolve()));
      heldLookupClient.release();
      await lateCheckoutDestroyed;
      expect(queuedLookupPool.totalCount).toBe(0);
      expect((await owner.query<{ count: number }>("SELECT count(*)::int count FROM operations.address_quota_buckets WHERE subject_hash=$1", [queuedSubject])).rows[0]).toEqual({ count: 0 });

      const lockedLookupPool = new Pool({ connectionString: loginUrl(principals.lookup), max: 1 });
      pools.push(lockedLookupPool);
      const lockOwner = await owner.connect();
      const activeSubject = hash("task12-active-abort");
      try {
        await lockOwner.query("BEGIN");
        await lockOwner.query("SELECT pg_advisory_xact_lock(hashtext('dsa_seats_address_admission'))");
        const activeAbort = new AbortController();
        const activeAttempt = new AddressAdmissionRepository(lockedLookupPool).consumeMetadataAttempt(activeSubject, activeAbort.signal);
        const deadline = Date.now() + 1_000;
        let waiting = false;
        while (Date.now() < deadline && !waiting) {
          const blocked = await owner.query<{ waiting: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.usename=$1 AND a.state='active' AND a.query LIKE '%consume_address_metadata_attempt_v1%' AND l.locktype='advisory' AND NOT l.granted) AS waiting", [principals.lookup]);
          waiting = blocked.rows[0]?.waiting === true;
          if (!waiting) await new Promise<void>(resolve => setTimeout(resolve, 5));
        }
        expect(waiting).toBe(true);
        activeAbort.abort();
        let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
        const boundedCancellation = Promise.race([
          activeAttempt,
          new Promise<never>((_, reject) => { cancellationTimer = setTimeout(() => reject(new Error("admission cancellation timeout")), 1_000); }),
        ]);
        try { await expect(boundedCancellation).rejects.toBeInstanceOf(CallerAbortError); }
        finally { if (cancellationTimer) clearTimeout(cancellationTimer); }
        await lockOwner.query("COMMIT");
      } finally {
        await lockOwner.query("ROLLBACK").catch(() => undefined);
        lockOwner.release();
      }
      expect((await owner.query<{ count: number }>("SELECT count(*)::int count FROM operations.address_quota_buckets")).rows[0]).toEqual({ count: 0 });
      expect((await owner.query<{ count: number }>("SELECT count(*)::int count FROM operations.address_canary_nonces")).rows[0]).toEqual({ count: 0 });

      const futureSignatureTimestamp = new Date(Date.now() + 20_000);
      await expect(lookup.consumeCanary({ subjectHash: hash("task12-future-canary-subject"), nonceHash: hash("task12-future-canary-nonce"), keyId: "task12-future", signatureTimestamp: futureSignatureTimestamp, expiresAt: new Date(futureSignatureTimestamp.getTime() + 10 * 60_000) })).resolves.toEqual({ allowed: true, retryAfter: null });
      await owner.query("DELETE FROM operations.address_quota_buckets; DELETE FROM operations.address_canary_nonces");

      const metadataSubject = hash("metadata-subject");
      const metadata = await Promise.all(Array.from({ length: 21 }, () => lookup.consumeMetadataAttempt(metadataSubject)));
      expect(metadata.filter(row => row.allowed)).toHaveLength(20); expect(metadata.find(row => !row.allowed)?.retryAfter).toBeGreaterThan(0);
      expect((await owner.query("SELECT bucket_kind,count FROM operations.address_quota_buckets WHERE subject_hash=$1 ORDER BY bucket_kind", [metadataSubject])).rows).toEqual([{ bucket_kind: "metadata_subject_minute", count: 20 }]);
      await owner.query("DELETE FROM operations.address_quota_buckets");
      const globalMetadata = await Promise.all(Array.from({ length: 301 }, (_, n) => lookup.consumeMetadataAttempt(hash(`global-metadata-${n}`))));
      expect(globalMetadata.filter(row => row.allowed)).toHaveLength(300);
      expect((await owner.query("SELECT count FROM operations.address_quota_buckets WHERE bucket_kind='metadata_global_minute'")).rows[0]).toEqual({ count: 300 });
      expect((await owner.query("SELECT count(*)::int count FROM operations.address_quota_buckets WHERE bucket_kind='metadata_subject_minute'")).rows[0]).toEqual({ count: 300 });

      await owner.query("DELETE FROM operations.address_quota_buckets");
      const enabledSubject = hash("enabled-subject");
      const enabled = await Promise.all(Array.from({ length: 6 }, () => lookup.consumeEnabledLookup(enabledSubject)));
      expect(enabled.filter(row => row.allowed)).toHaveLength(5); expect(enabled.find(row => !row.allowed)?.retryAfter).toBeGreaterThan(0);
      expect((await owner.query("SELECT bucket_kind,count FROM operations.address_quota_buckets WHERE subject_hash=$1", [enabledSubject])).rows).toEqual([{ bucket_kind: "lookup_subject_hour", count: 5 }]);
      await owner.query("DELETE FROM operations.address_quota_buckets");
      const upstream = await Promise.all(Array.from({ length: 101 }, (_, n) => lookup.consumeEnabledLookup(hash(`upstream-${n}`))));
      expect(upstream.filter(row => row.allowed)).toHaveLength(100);
      expect((await owner.query("SELECT bucket_kind,count FROM operations.address_quota_buckets WHERE bucket_kind IN ('upstream_minute','upstream_day') ORDER BY bucket_kind")).rows).toEqual([{ bucket_kind: "upstream_day", count: 100 }, { bucket_kind: "upstream_minute", count: 100 }]);

      await owner.query("DELETE FROM operations.address_quota_buckets; DELETE FROM operations.address_canary_nonces");
      const canary = (n: number) => { const signatureTimestamp = new Date(Date.now() - 1_000); return lookup.consumeCanary({ subjectHash: hash("canary"), nonceHash: hash(`nonce-${n}`), keyId: "task12", signatureTimestamp, expiresAt: new Date(signatureTimestamp.getTime() + 10 * 60_000) }); };
      const canaries = []; for (let n = 0; n < 6; n++) canaries.push(await canary(n));
      expect(canaries.filter(row => row.allowed)).toHaveLength(5); expect(canaries[5]?.retryAfter).toBeGreaterThan(0);
      expect((await owner.query("SELECT count(*)::int count FROM operations.address_canary_nonces")).rows[0]).toEqual({ count: 6 });
      await expect(canary(5)).resolves.toMatchObject({ allowed: false, retryAfter: expect.any(Number) });
      expect((await owner.query("SELECT bucket_kind,count FROM operations.address_quota_buckets ORDER BY bucket_kind")).rows).toEqual([{ bucket_kind: "canary_minute", count: 5 }, { bucket_kind: "upstream_day", count: 5 }, { bucket_kind: "upstream_minute", count: 5 }]);

      await owner.query("INSERT INTO operations.address_quota_buckets VALUES('metadata_subject_minute',$1,clock_timestamp()-interval '3 minutes',1,clock_timestamp()-interval '1 minute'),('metadata_subject_minute',$2,clock_timestamp(),1,clock_timestamp()+interval '1 minute')", [hash("expired"), hash("live")]);
      await owner.query("INSERT INTO operations.address_canary_nonces(nonce_hash,key_id,signature_timestamp,expires_at,consumed_at) SELECT $1,'expired',now_at-interval '11 minutes',now_at-interval '1 minute',now_at-interval '2 minutes' FROM (SELECT clock_timestamp() now_at) clock", [hash("expired-nonce")]);
      const cleaned = await new AddressAdmissionMaintenanceRepository(maintenancePool).cleanup();
      expect(cleaned.quotaBucketsDeleted).toBeGreaterThan(0); expect(cleaned.canaryNoncesDeleted).toBeGreaterThan(0);
      expect((await owner.query("SELECT count(*)::int count FROM operations.address_quota_buckets WHERE expires_at>clock_timestamp()")).rows[0]?.count).toBeGreaterThan(0);
      expect((await owner.query("SELECT count(*)::int count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN ('operations.address_quota_buckets'::regclass,'operations.address_canary_nonces'::regclass) AND p.proname IN ('guard_candidate_release_content','guard_nationwide_content','guard_release_preflight')")).rows[0]).toEqual({ count: 0 });
      expect(await snapshot(v2.release.id)).toEqual(before);
    } finally {
      await Promise.all(pools.map(pool => pool.end()));
      for (const name of Object.values(principals)) await owner.query(`DROP ROLE IF EXISTS "${name}"`).catch(() => undefined);
      await owner.end();
    }
  }, 180_000);

  it("exposes only the typed FEC V2 acquisition surface", async () => {
    const pool = new Pool({ connectionString: testDatabaseUrl });
    try {
      const names = ["claim_fec_v2_run", "heartbeat_fec_v2_run", "abort_fec_v2_run", "reap_expired_fec_v2_run", "stage_fec_v2_snapshot", "stage_fec_v2_artifact", "stage_fec_v2_receipt", "stage_fec_v2_enumeration_page", "stage_fec_v2_ledger_header", "stage_fec_v2_ledger_entry", "stage_fec_v2_page_lineage", "stage_fec_v2_amendment_link", "stage_fec_v2_sanitized_filing", "stage_fec_v2_acquisition_outcome", "read_fec_v2_run_status", "read_fec_v2_staged_receipt_descriptors"];
      const routines = await pool.query<{ proname: string; owner: string; arguments: string }>("SELECT p.proname,r.rolname AS owner,pg_get_function_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='public' AND p.proname=ANY($1) ORDER BY p.proname", [names]);
      expect(routines.rows.map(row => row.proname).sort()).toEqual([...names].sort());
      expect(routines.rows.every(row => row.owner === "dsa_seats_migration_owner" && !/json/i.test(row.arguments))).toBe(true);
      const forbidden = await pool.query<{ allowed: boolean }>("SELECT has_table_privilege('dsa_seats_fec_v2_acquisition','public.fec_v2_runs','UPDATE') OR has_table_privilege('dsa_seats_fec_v2_acquisition','public.stg_fec_v2_artifacts','INSERT') AS allowed");
      expect(forbidden.rows[0]?.allowed).toBe(false);
    } finally { await pool.end(); }
  });
});
