import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, posix, relative, resolve } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "pg";
import { LocalRawObjectStore, S3RawObjectStore, type RawObjectStore } from "@/ingestion/core/raw-object-store";
import { createNonproductionS3VersionedRawObjectStore, createS3VersionedRawObjectStore, isFecV2LiteralLoopbackHost, type EndpointPolicy, type S3VersionedStoreConfig, type VersionedRawObjectStore } from "@/ingestion/fec/versioned-artifact-store";
import { createIdentityAdapter } from "@/ingestion/identity/adapter";
import { parseSenateRoster, parseSenateServiceStartsArtifact } from "@/ingestion/identity/senate";
import type { SenateSeat } from "@/ingestion/identity/senate";
import type { HouseSeat } from "@/ingestion/identity/house";
import { createTigerAdapter } from "@/ingestion/tiger/adapter";
import { parseNationalTigerArtifacts, type NationalTigerArtifactManifest } from "@/ingestion/tiger/national";
import { runSource, type RunSourceResult } from "@/ingestion/core/run-source";
import { getRuntimeOperationalSignalSink } from "@/operations/runtime-signals";
import { ACS_ADAPTER_VERSION, ACS_SOURCE_LIMITS, createAcsAdapter } from "@/ingestion/acs/adapter";
import { ACS_INDICATOR_DICTIONARY } from "@/ingestion/acs/indicator-dictionary";

export type ConfiguredSource = "identity" | "tiger" | "acs";
const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
export type LockEntry = { readonly id: string; readonly url: string; readonly retainedPath: string | null; readonly retainedStatus: "retained" | "nonretained"; readonly byteSize: number; readonly sha256: string; readonly kind: string; readonly parentIds: readonly string[] };
type SourceLock = { readonly version: 1; readonly entries: readonly LockEntry[] };
type LockedArtifact = { readonly bytes: Uint8Array; readonly url: string; readonly sha256: string; readonly target: string; readonly entry: LockEntry };

const fail = (message: string): never => { throw new Error(message); };
const isInside = (root: string, target: string): boolean => { const path = relative(root, target); return path !== "" && !path.startsWith("..") && !path.includes(`..${posix.sep}`); };
const retainedPathIsExact = (path: string): boolean => (path.startsWith("data/") || path.startsWith("public/")) && posix.normalize(path) === path && !path.includes("//") && !path.endsWith("/");
const lockPath = (entry: LockEntry): string => entry.retainedPath!.slice("data/".length);

async function confinedFile(root: string, path: string): Promise<string> {
  const target = await realpath(resolve(root, path));
  if (!isInside(root, target) || !(await stat(target)).isFile()) fail("INGESTION_PATH_INVALID");
  return target;
}
export function parseSourceLock(bytes: Uint8Array): SourceLock {
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { return fail("SOURCE_LOCK_INVALID"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("SOURCE_LOCK_INVALID");
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !("version" in record) || !("entries" in record) || record.version !== 1 || !Array.isArray(record.entries)) return fail("SOURCE_LOCK_INVALID");
  const entries = record.entries.map((value): LockEntry => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("SOURCE_LOCK_INVALID");
    const entry = value as Record<string, unknown>;
    if (Object.keys(entry).length !== 8 || !["id", "url", "retainedPath", "retainedStatus", "byteSize", "sha256", "kind", "parentIds"].every(key => key in entry)) return fail("SOURCE_LOCK_INVALID");
    const retained = entry.retainedStatus === "retained";
    if (typeof entry.id !== "string" || !entry.id || typeof entry.url !== "string" || !entry.url || typeof entry.kind !== "string" || !entry.kind || !Number.isSafeInteger(entry.byteSize) || (entry.byteSize as number) < 0 || typeof entry.sha256 !== "string" || !hashPattern.test(entry.sha256) || !Array.isArray(entry.parentIds) || entry.parentIds.some(id => typeof id !== "string" || !id) || new Set(entry.parentIds).size !== entry.parentIds.length || (!retained && entry.retainedStatus !== "nonretained") || (retained ? typeof entry.retainedPath !== "string" || !retainedPathIsExact(entry.retainedPath) : entry.retainedPath !== null)) return fail("SOURCE_LOCK_INVALID");
    return entry as unknown as LockEntry;
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length || new Set(entries.flatMap(entry => entry.retainedPath ? [entry.retainedPath] : [])).size !== entries.filter(entry => entry.retainedPath).length || entries.some(entry => entry.parentIds.includes(entry.id) || entry.parentIds.some(parent => !entries.some(candidate => candidate.id === parent)))) return fail("SOURCE_LOCK_INVALID");
  const visiting = new Set<string>(); const visited = new Set<string>(); const visit = (id: string): void => { if (visiting.has(id)) fail("SOURCE_LOCK_INVALID"); if (visited.has(id)) return; visiting.add(id); for (const parent of entries.find(entry => entry.id === id)!.parentIds) visit(parent); visiting.delete(id); visited.add(id); }; for (const entry of entries) visit(entry.id);
  return { version: 1, entries };
}
export async function loadSourceLock(dataRoot: string, env: NodeJS.ProcessEnv): Promise<{ readonly root: string; readonly lock: SourceLock; readonly sha256: string }> {
  const root = await realpath(dataRoot);
  if (!(await stat(root)).isDirectory()) fail("PROJECT_DATA_ROOT_INVALID");
  const bytes = await readFile(await confinedFile(root, "source-lock.json"));
  const actual = sha(bytes);
  if (env.NODE_ENV === "production" && (!env.SOURCE_LOCK_SHA256 || !hashPattern.test(env.SOURCE_LOCK_SHA256) || env.SOURCE_LOCK_SHA256 !== actual)) fail("SOURCE_LOCK_SHA256_REQUIRED_OR_MISMATCH");
  return { root, lock: parseSourceLock(bytes), sha256: actual };
}
export async function verifyConfiguredSourceLock(env: NodeJS.ProcessEnv, projectRoot = process.cwd()): Promise<{ readonly root: string; readonly lock: SourceLock; readonly sha256: string }> {
  const project = await realpath(projectRoot); const root = await realpath(resolve(project, env.PROJECT_DATA_ROOT ?? "data"));
  if (!isInside(project, root)) fail("PROJECT_DATA_ROOT_ESCAPE");
  return loadSourceLock(root, env);
}
async function locked(root: string, lock: SourceLock, id: string, override?: string): Promise<LockedArtifact> {
  const entry = lock.entries.find(value => value.id === id);
  if (!entry || entry.retainedStatus !== "retained" || !entry.retainedPath?.startsWith("data/")) fail("SOURCE_LOCK_ENTRY_INVALID");
  const selected = entry as LockEntry & { readonly retainedPath: string };
  const target = await confinedFile(root, override ?? lockPath(selected));
  const bytes = await readFile(target);
  if (bytes.byteLength !== selected.byteSize || sha(bytes) !== selected.sha256) fail("SOURCE_LOCK_ARTIFACT_MISMATCH");
  return { bytes, url: selected.url, sha256: selected.sha256, target, entry: selected };
}

/** Read one named retained object only after validating its lock entry and bytes. */
export async function loadLockedArtifact(env: NodeJS.ProcessEnv, id: string, projectRoot = process.cwd()): Promise<{ readonly bytes: Uint8Array; readonly sha256: string }> {
  const { root, lock } = await verifyConfiguredSourceLock(env, projectRoot);
  const artifact = await locked(root, lock, id);
  return { bytes: artifact.bytes, sha256: artifact.sha256 };
}
async function verifyTigerBundle(root: string, lock: SourceLock, env: NodeJS.ProcessEnv): Promise<readonly [LockedArtifact, LockedArtifact, LockedArtifact, LockedArtifact]> {
  const [cd119, states, manifest, bundle] = await Promise.all([locked(root, lock, "geo-national-cd119", env.TIGER_CD119_PATH), locked(root, lock, "geo-national-states", env.TIGER_STATES_PATH), locked(root, lock, "geo-national-manifest", env.TIGER_MANIFEST_PATH), locked(root, lock, "geo-national-bundle", env.TIGER_BUNDLE_PATH)]);
  const directory = await realpath(resolve(bundle.target, ".."));
  if (!isInside(root, directory) || basename(directory) !== bundle.sha256) fail("TIGER_BUNDLE_LOCK_MISMATCH");
  const expected = [cd119, states, manifest, bundle];
  const names = (await readdir(directory)).sort(); const expectedNames = expected.map(value => basename(value.entry.retainedPath!)).sort();
  if (names.length !== expectedNames.length || names.some((name, index) => name !== expectedNames[index])) fail("TIGER_BUNDLE_LOCK_MISMATCH");
  await Promise.all(expected.map(async value => {
    const bytes = await readFile(await confinedFile(root, resolve(directory, basename(value.entry.retainedPath!))));
    if (bytes.byteLength !== value.entry.byteSize || sha(bytes) !== value.sha256) fail("TIGER_BUNDLE_LOCK_MISMATCH");
  }));
  let value: { schemaVersion?: unknown; nationalTigerManifestSha256?: unknown; artifacts?: { cd119Sha256?: unknown; statesSha256?: unknown } };
  try { value = JSON.parse(Buffer.from(bundle.bytes).toString("utf8")) as typeof value; } catch { return fail("TIGER_BUNDLE_LOCK_MISMATCH"); }
  if (value.schemaVersion !== 1 || value.nationalTigerManifestSha256 !== manifest.sha256 || value.artifacts?.cd119Sha256 !== cd119.sha256 || value.artifacts?.statesSha256 !== states.sha256 || new Set(bundle.entry.parentIds).size !== 3 || !["geo-national-cd119", "geo-national-states", "geo-national-manifest"].every(id => bundle.entry.parentIds.includes(id))) fail("TIGER_BUNDLE_LOCK_MISMATCH");
  return [cd119, states, manifest, bundle];
}
const houseTerm = (stateCode: string) => ({ termStartsAt: "2025-01-03", termEndsAt: stateCode === "PR" ? "2029-01-03" : "2027-01-03" } as const);
const senateTerm = (senateClass: SenateSeat["senateClass"]) => senateClass === 1 ? { termStartsAt: "2025-01-03", termEndsAt: "2031-01-03" } as const : senateClass === 2 ? { termStartsAt: "2021-01-03", termEndsAt: "2027-01-03" } as const : { termStartsAt: "2023-01-03", termEndsAt: "2029-01-03" } as const;

export function assertProductionIngestionEnv(env: NodeJS.ProcessEnv): void { if (env.NODE_ENV === "production" && (!env.RAW_OBJECT_BUCKET || !env.INGEST_DATABASE_URL || !env.SOURCE_LOCK_SHA256 || !hashPattern.test(env.SOURCE_LOCK_SHA256))) fail("Production ingestion requires RAW_OBJECT_BUCKET, INGEST_DATABASE_URL, and SOURCE_LOCK_SHA256"); }
export function createArtifactRawObjectStore(env: NodeJS.ProcessEnv, projectRoot = process.cwd()): RawObjectStore {
  if (env.NODE_ENV === "production") { if (!env.RAW_OBJECT_BUCKET) fail("Production artifact storage requires RAW_OBJECT_BUCKET"); if (!!env.AWS_ACCESS_KEY_ID !== !!env.AWS_SECRET_ACCESS_KEY) fail("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be supplied together"); return new S3RawObjectStore(new S3Client({ region: env.AWS_REGION, endpoint: env.RAW_OBJECT_ENDPOINT, forcePathStyle: env.RAW_OBJECT_FORCE_PATH_STYLE === "true", ...(env.AWS_ACCESS_KEY_ID ? { credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY! } } : {}) }), env.RAW_OBJECT_BUCKET!); }
  const rawRoot = env.RAW_OBJECT_ROOT; if (!rawRoot) fail("Nonproduction ingestion requires explicit RAW_OBJECT_ROOT"); return new LocalRawObjectStore(resolve(projectRoot, rawRoot!));
}
export function createRawObjectStore(env: NodeJS.ProcessEnv, projectRoot = process.cwd()): RawObjectStore { assertProductionIngestionEnv(env); return createArtifactRawObjectStore(env, projectRoot); }
export function verifyFecV2RetentionEvidence(env: NodeJS.ProcessEnv, bucket: string, endpoint: string): string {
  const evidencePath = env.FEC_V2_RETENTION_EVIDENCE_FILE, caPath = env.FEC_V2_CA_CERT_FILE;
  if (typeof evidencePath !== "string" || typeof caPath !== "string" || !evidencePath.startsWith("/") || !caPath.startsWith("/")) return fail("FEC_V2_STORE_CONFIGURATION_REQUIRED");
  const evidenceFile: string = evidencePath, caFile: string = caPath;
  let bytes: Buffer, ca: Buffer;
  try {
    const evidenceTarget = realpathSync(evidenceFile), caTarget = realpathSync(caFile);
    if (!statSync(evidenceTarget).isFile() || !statSync(caTarget).isFile()) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
    bytes = readFileSync(evidenceTarget); ca = readFileSync(caTarget);
  } catch { return fail("FEC_V2_STORE_CONFIGURATION_INVALID"); }
  if (bytes.byteLength < 1 || bytes.byteLength > 64 * 1024 || ca.byteLength < 1 || ca.byteLength > 64 * 1024 || bytes.includes(0) || ca.includes(0)) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  const evidenceSha256 = sha(bytes);
  if (!env.FEC_V2_RETENTION_EVIDENCE_SHA256 || evidenceSha256 !== env.FEC_V2_RETENTION_EVIDENCE_SHA256) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  const text = bytes.toString("utf8"), fields = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([a-z][a-z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      if (fields.has(match[1]!)) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
      fields.set(match[1]!, match[2]!);
    }
  }
  let evidenceEndpoint: string;
  try { evidenceEndpoint = new URL(fields.get("endpoint") ?? "").toString(); } catch { return fail("FEC_V2_STORE_CONFIGURATION_INVALID"); }
  const captured = Date.parse(fields.get("captured_at") ?? ""), retained = Date.parse(/X-Amz-Object-Lock-Retain-Until-Date:\s*(\S+)/.exec(text)?.[1] ?? "");
  const retentionDays = (retained - captured) / 86_400_000;
  if (
    fields.get("evidence_class") !== "fec-v2-production-versioned-retained-store"
    || fields.get("bucket") !== bucket
    || evidenceEndpoint !== endpoint
    || fields.get("tls_without_private_ca") !== "rejected"
    || fields.get("tls_with_pinned_ca") !== "pass"
    || fields.get("ca_sha256") !== sha(ca)
    || fields.get("writer_object_delete") !== "denied"
    || fields.get("status") !== "pass"
    || !text.includes("versioning is enabled")
    || !text.includes("Object locking 'COMPLIANCE' is configured for 1YEARS.")
    || !text.includes("X-Amz-Object-Lock-Mode             : COMPLIANCE")
    || !Number.isFinite(retentionDays)
    || retentionDays < 364
    || retentionDays > 367
  ) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  return evidenceSha256;
}
/** Pure, strict FEC V2 configuration: this never falls back to generic AWS settings. */
export function parseFecV2VersionedStoreConfig(env: NodeJS.ProcessEnv): S3VersionedStoreConfig {
  const bucket=env.FEC_V2_OBJECT_BUCKET, region=env.FEC_V2_S3_REGION, endpoint=env.FEC_V2_OBJECT_ENDPOINT;
  if(!bucket||!region||!endpoint||!env.FEC_V2_S3_ACCESS_KEY_ID||!env.FEC_V2_S3_SECRET_ACCESS_KEY) fail("FEC_V2_STORE_CONFIGURATION_REQUIRED");
  if(env.NODE_TLS_REJECT_UNAUTHORIZED==="0") fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  const required={bucket:bucket!,region:region!,endpoint:endpoint!,accessKeyId:env.FEC_V2_S3_ACCESS_KEY_ID!,secretAccessKey:env.FEC_V2_S3_SECRET_ACCESS_KEY!};
  if(!/^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])?$/.test(required.bucket)) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  let url:URL;try{url=new URL(required.endpoint);}catch{return fail("FEC_V2_STORE_CONFIGURATION_INVALID");}
  if(url.username||url.password||url.search||url.hash) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  if(env.FEC_V2_STORE_MODE!=="production"&&env.FEC_V2_STORE_MODE!=="local_loopback") fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  const local=env.FEC_V2_STORE_MODE==="local_loopback";
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, ""); const literalLoopback=isFecV2LiteralLoopbackHost(host);
  if(host==="0.0.0.0"||host==="::"||host.startsWith("::ffff:") || (env.NODE_ENV==="production"&&local)|| (local ? url.protocol!=="http:"||!literalLoopback : url.protocol!=="https:"||literalLoopback||host==="localhost"||host.startsWith("::ffff:")||!env.FEC_V2_RETENTION_EVIDENCE_SHA256||!hashPattern.test(env.FEC_V2_RETENTION_EVIDENCE_SHA256))) fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  if(env.FEC_V2_OBJECT_FORCE_PATH_STYLE!==undefined&&env.FEC_V2_OBJECT_FORCE_PATH_STYLE!=="true") fail("FEC_V2_STORE_CONFIGURATION_INVALID");
  // The AWS SDK's Node transport validates TLS by default; disabling it via its global env is rejected above.
  const config=Object.freeze({region:required.region,endpoint:url.toString(),forcePathStyle:true as const,credentials:Object.freeze({accessKeyId:required.accessKeyId,secretAccessKey:required.secretAccessKey,...(env.FEC_V2_S3_SESSION_TOKEN?{sessionToken:env.FEC_V2_S3_SESSION_TOKEN}:{})})});
  const retentionEvidenceSha256 = local ? undefined : verifyFecV2RetentionEvidence(env, required.bucket, config.endpoint);
  const policy:EndpointPolicy=Object.freeze(local?{mode:"local_loopback",endpointUrl:config.endpoint,certificateValidation:false}:{mode:"production",endpointUrl:config.endpoint,certificateValidation:true,retentionEvidenceSha256:retentionEvidenceSha256!});
  return Object.freeze({bucket:required.bucket,client:config,policy});
}
/** Production construction has no injectable client boundary. */
export function loadFecV2VersionedStoreFromEnvironment(env: NodeJS.ProcessEnv): VersionedRawObjectStore { const config=parseFecV2VersionedStoreConfig(env); return config.policy.mode === "production" ? createS3VersionedRawObjectStore(config) : createNonproductionS3VersionedRawObjectStore(config); }
export async function sourceId(pool: Pool, release: string, name: ConfiguredSource): Promise<string> {
  if (name !== "acs") { const result = await pool.query<{ id: string }>("SELECT id FROM sources WHERE release_id=$1 AND name=$2", [release, name]); if (result.rowCount !== 1) fail(`Expected exactly one preregistered ${name} source for release ${release}`); return result.rows[0]!.id; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize with lifecycle operations without requiring the ingest role to
    // hold UPDATE on data_releases. SELECT ... FOR UPDATE would silently widen
    // this least-privilege boundary because PostgreSQL requires UPDATE privilege
    // for row locks, even when the query only reads status.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dsa_seats_release:' || $1))", [release]);
    const releaseRow = await client.query<{ status: string }>("SELECT status FROM data_releases WHERE id=$1", [release]);
    if (releaseRow.rowCount !== 1 || releaseRow.rows[0]!.status !== "candidate") fail("ACS_SOURCE_RELEASE_NOT_CANDIDATE");
    const rows = await client.query<{ id: string; name: string; authority: string; homepage_url: string }>("SELECT id,name,authority,homepage_url FROM sources WHERE release_id=$1 AND (name='acs' OR id='src_acs_2024') FOR UPDATE", [release]);
    if (!rows.rowCount) await client.query("INSERT INTO sources(id,release_id,name,authority,homepage_url) VALUES('src_acs_2024',$1,'acs','official','https://www.census.gov/programs-surveys/acs.html')", [release]);
    else if (rows.rowCount !== 1 || rows.rows[0]!.id !== "src_acs_2024" || rows.rows[0]!.name !== "acs" || rows.rows[0]!.authority !== "official" || rows.rows[0]!.homepage_url !== "https://www.census.gov/programs-surveys/acs.html") fail("ACS_SOURCE_MISMATCH");
    await client.query("UPDATE release_manifests SET validated_at=NULL WHERE release_id=$1", [release]);
    await client.query("COMMIT"); return "src_acs_2024";
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
export type AcsFetch = (input: string, init: RequestInit) => Promise<Response>;
async function fetchAcsTable(entry: LockEntry, expectedUrl: string, fetcher: AcsFetch, signal?: AbortSignal): Promise<Uint8Array> {
  const url = new URL(entry.url), expected = new URL(expectedUrl);
  if (entry.url !== expectedUrl || url.protocol !== "https:" || url.origin !== expected.origin || url.pathname !== expected.pathname || url.search || url.hash || entry.retainedStatus !== "nonretained" || entry.retainedPath !== null || entry.kind !== "raw_table" || !Number.isSafeInteger(entry.byteSize) || entry.byteSize < 0 || entry.byteSize > ACS_SOURCE_LIMITS.tableBytes || !hashPattern.test(entry.sha256)) fail("ACS_SOURCE_LOCK_ENTRY_INVALID");
  const timeout = AbortSignal.timeout(30_000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response | undefined;
  try { response = await fetcher(expectedUrl, { redirect: "error", cache: "no-store", signal: combined }); } catch { fail(combined.aborted ? "ACS_FETCH_TIMEOUT" : "ACS_FETCH_FAILED"); }
  const body = response?.ok ? response.body : undefined;
  if (!body) throw new Error("ACS_FETCH_RESPONSE_INVALID");
  const reader = body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > ACS_SOURCE_LIMITS.tableBytes || length > entry.byteSize) fail("ACS_FETCH_SIZE_MISMATCH"); chunks.push(part.value); } } catch (error) { await reader.cancel().catch(() => undefined); if (error instanceof Error && error.message === "ACS_FETCH_SIZE_MISMATCH") throw error; fail(combined.aborted ? "ACS_FETCH_TIMEOUT" : "ACS_FETCH_FAILED"); }
  const bytes = Buffer.concat(chunks, length);
  if (bytes.byteLength !== entry.byteSize || sha(bytes) !== entry.sha256) fail("ACS_FETCH_RECEIPT_MISMATCH");
  return bytes;
}
export async function runConfiguredSource(source: ConfiguredSource, args: { release: string; cutoff: string; dryRun: boolean; signal?: AbortSignal }, pool: Pool, rawStore: RawObjectStore, env: NodeJS.ProcessEnv, projectRoot = process.cwd(), fetcher: AcsFetch = fetch): Promise<RunSourceResult> {
  const { root, lock, sha256: sourceLockSha256 } = await verifyConfiguredSourceLock(env, projectRoot);
  const signalSink = getRuntimeOperationalSignalSink();
  const sourceKey = await sourceId(pool, args.release, source); const cutoff = new Date(`${args.cutoff}T00:00:00.000Z`);
  if (source === "acs") {
    if (!args.dryRun) fail("ACS_STAGING_REQUIRES_DRY_RUN");
    const runIds: string[] = [], reusedRunIds: string[] = [];
    for (const definition of ACS_INDICATOR_DICTIONARY) {
      const entry = lock.entries.find(value => value.id === definition.lockId);
      if (!entry) throw new Error("ACS_SOURCE_LOCK_ENTRY_INVALID");
      const bytes = await fetchAcsTable(entry, definition.sourceUrl, fetcher, args.signal);
      const adapter = createAcsAdapter({ rawStore, sourceLockSha256, definition, lockId: definition.lockId, sourceBytes: bytes, sourceUrl: definition.sourceUrl, sourceChecksumSha256: entry.sha256, sourceByteSize: entry.byteSize, snapshotId: `snap_acs_v2_acs_2024_5yr_${definition.lockId}_${entry.sha256.slice(0, 48)}` as never, parserVersion: ACS_ADAPTER_VERSION, upstreamRelease: "acs-2024-5yr" });
      const result = await runSource(adapter, { pool, releaseId: args.release as never, sourceId: sourceKey as never, cutoff, dryRun: true, signal: args.signal, signalSink }); runIds.push(...result.runIds); reusedRunIds.push(...result.reusedRunIds);
    }
    return { runIds, reusedRunIds };
  }
  const [cd119, states, nationalManifest, bundle] = await verifyTigerBundle(root, lock, env);
  if (source === "tiger") { const manifest = JSON.parse(Buffer.from(nationalManifest.bytes).toString("utf8")) as NationalTigerArtifactManifest; const adapter = createTigerAdapter({ rawStore, snapshotId: `snap_tiger_${sha(nationalManifest.bytes).slice(0, 48)}` as never, upstreamRelease: "tiger2025-national", parserVersion: "tiger-national-v1", sourceLockSha256, lockIds: { cd119: "geo-national-cd119", states: "geo-national-states", manifest: "geo-national-manifest", bundle: "geo-national-bundle" }, manifest, cd119Bytes: cd119.bytes, statesBytes: states.bytes, sourceUrl: bundle.url }); return runSource(adapter, { pool, releaseId: args.release as never, sourceId: sourceKey as never, cutoff, dryRun: args.dryRun, signalSink }); }
  const [house, senate, starts] = await Promise.all([locked(root, lock, "house-xml", env.IDENTITY_HOUSE_PATH), locked(root, lock, "senate-xml", env.IDENTITY_SENATE_PATH), locked(root, lock, "senate-service-starts", env.IDENTITY_SENATE_SERVICE_STARTS_PATH)]);
  const tiger = parseNationalTigerArtifacts(JSON.parse(Buffer.from(cd119.bytes).toString("utf8")), JSON.parse(Buffer.from(states.bytes).toString("utf8"))); const startsMap = parseSenateServiceStartsArtifact(Buffer.from(starts.bytes).toString("utf8")); const senateRows = parseSenateRoster(Buffer.from(senate.bytes).toString("utf8"), startsMap); if (senateRows.errors.length) fail("IDENTITY_SENATE_UNIVERSE_INVALID");
  const houseUniverse: HouseSeat[] = tiger.cd119.map(row => ({ stateCode: row.stateCode, districtCode: row.districtCode! as HouseSeat["districtCode"], kind: row.stateCode === "DC" || ["AS", "GU", "MP", "VI"].includes(row.stateCode) ? "delegate" : row.stateCode === "PR" ? "resident_commissioner" : "representative", ...houseTerm(row.stateCode) })); const senateUniverse: SenateSeat[] = senateRows.records.map(row => ({ stateCode: row.office.stateCode, senateClass: row.office.senateClass!, ...senateTerm(row.office.senateClass!) })); const adapter = createIdentityAdapter({ rawStore, snapshotId: `snap_identity_${sha(Buffer.concat([house.bytes, senate.bytes, starts.bytes])).slice(0, 48)}` as never, upstreamRelease: "identity-retained-v1", parserVersion: "identity-national-v1", releaseCutoff: args.cutoff, sourceLockSha256, house: { ...house, checksumSha256: house.sha256, lockId: house.entry.id }, senate: { ...senate, checksumSha256: senate.sha256, lockId: senate.entry.id }, senateServiceStarts: { ...starts, checksumSha256: starts.sha256, lockId: starts.entry.id }, houseUniverse, senateUniverse, senatePolicy: { noSenateJurisdictions: new Set(["DC", "PR", "AS", "GU", "MP", "VI"]) } }); return runSource(adapter, { pool, releaseId: args.release as never, sourceId: sourceKey as never, cutoff, dryRun: args.dryRun, signalSink });
}
