import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRawObjectStore, loadFecV2VersionedStoreFromEnvironment, loadLockedArtifact, loadSourceLock, parseFecV2VersionedStoreConfig, parseSourceLock, sourceId } from "./ingestion-config";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const entry = (changes: Record<string, unknown> = {}) => ({ id: "fixture", url: "https://example.test/fixture", retainedPath: "data/fixture.txt", retainedStatus: "retained", byteSize: 1, sha256: digest("x"), kind: "source", parentIds: [], ...changes });
const lock = (entries: readonly unknown[] = [entry()]) => Buffer.from(JSON.stringify({ version: 1, entries }));
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function productionFecEnv(): Promise<NodeJS.ProcessEnv> {
  const root = await mkdtemp(join(tmpdir(), "fec-evidence-")); temporary.push(root);
  const ca = Buffer.from("test pinned root CA");
  const captured = "2026-07-29T03:21:16Z", retained = "2027-07-29T03:19:15.085Z";
  const evidence = Buffer.from([
    "evidence_class=fec-v2-production-versioned-retained-store",
    `captured_at=${captured}`,
    "endpoint=https://objects.example.test",
    "bucket=fec-v2-artifacts",
    "tls_without_private_ca=rejected",
    "tls_with_pinned_ca=pass",
    `ca_sha256=${createHash("sha256").update(ca).digest("hex")}`,
    "writer_object_delete=denied",
    "store_cli_evidence_begin",
    "admin/fec-v2-artifacts versioning is enabled",
    "Object locking 'COMPLIANCE' is configured for 1YEARS.",
    "  X-Amz-Object-Lock-Mode             : COMPLIANCE ",
    `  X-Amz-Object-Lock-Retain-Until-Date: ${retained} `,
    "store_cli_evidence_end",
    "status=pass",
    "",
  ].join("\n"));
  const evidencePath = join(root, "evidence.txt"), caPath = join(root, "root.crt");
  await writeFile(evidencePath, evidence); await writeFile(caPath, ca);
  return {
    NODE_ENV: "production",
    FEC_V2_STORE_MODE: "production",
    FEC_V2_OBJECT_BUCKET: "fec-v2-artifacts",
    FEC_V2_S3_REGION: "us-east-1",
    FEC_V2_OBJECT_ENDPOINT: "https://objects.example.test",
    FEC_V2_S3_ACCESS_KEY_ID: "dedicated-id",
    FEC_V2_S3_SECRET_ACCESS_KEY: "dedicated-secret",
    FEC_V2_RETENTION_EVIDENCE_FILE: evidencePath,
    FEC_V2_CA_CERT_FILE: caPath,
    FEC_V2_RETENTION_EVIDENCE_SHA256: createHash("sha256").update(evidence).digest("hex"),
  };
}

describe("ingestion runtime configuration", () => {
  it("keeps valid rights annotations outside legacy content pins while rejecting malformed rights", () => {
    expect(parseSourceLock(lock([entry({ license: "unknown" })])).entries).toEqual([entry()]);
    expect(() => parseSourceLock(lock([entry({ license: {} })]))).toThrow("SOURCE_LOCK_INVALID");
    expect(() => parseSourceLock(lock([entry({ license: "MIT" })]))).toThrow("SOURCE_LOCK_INVALID");
    expect(() => parseSourceLock(lock([entry({ license: "unknown", unexpected: true })]))).toThrow("SOURCE_LOCK_INVALID");
  });
  it("strictly parses version-one locks and rejects malformed entry identity", () => {
    expect(parseSourceLock(lock())).toMatchObject({ version: 1, entries: [entry()] });
    for (const invalid of [
      Buffer.from(JSON.stringify({ version: 2, entries: [entry()] })),
      Buffer.from(JSON.stringify({ version: 1, entries: [entry()], extra: true })),
      lock([{ ...entry(), extra: true }]),
      lock([entry({ retainedStatus: "missing" })]),
      lock([entry({ retainedPath: "data/../fixture.txt" })]),
      lock([entry({ url: "" })]),
      lock([entry({ byteSize: Number.MAX_SAFE_INTEGER + 1 })]),
      lock([entry({ parentIds: ["fixture"] })]),
      lock([entry({ parentIds: ["missing"] })]),
      lock([entry({ id: "first", retainedPath: "data/first.txt", parentIds: ["second"] }), entry({ id: "second", retainedPath: "data/second.txt", parentIds: ["first"] })]),
      lock([entry(), entry({ id: "second" })]),
      lock([entry(), entry({ id: "second", retainedPath: "data/fixture.txt" })]),
    ]) expect(() => parseSourceLock(invalid)).toThrow("SOURCE_LOCK_INVALID");
  });
  it("hashes complete lock bytes in production and realpath-confines the lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "ingestion-lock-")); temporary.push(root);
    const bytes = lock(); await writeFile(join(root, "source-lock.json"), bytes);
    await expect(loadSourceLock(root, { NODE_ENV: "production", SOURCE_LOCK_SHA256: digest(bytes.toString()) })).resolves.toMatchObject({ lock: { version: 1 } });
    await expect(loadSourceLock(root, { NODE_ENV: "production", SOURCE_LOCK_SHA256: "0".repeat(64) })).rejects.toThrow("SOURCE_LOCK_SHA256_REQUIRED_OR_MISMATCH");
    const escaped = await mkdtemp(join(tmpdir(), "ingestion-escaped-")); temporary.push(escaped); await writeFile(join(escaped, "lock.json"), bytes); await rm(join(root, "source-lock.json")); await symlink(join(escaped, "lock.json"), join(root, "source-lock.json"));
    await expect(loadSourceLock(root, {} as NodeJS.ProcessEnv)).rejects.toThrow("INGESTION_PATH_INVALID");
  });
  it("accepts the repository lock without reading its large retained artifacts", async () => {
    await expect(loadSourceLock(join(process.cwd(), "data"), {} as NodeJS.ProcessEnv)).resolves.toMatchObject({ lock: { version: 1 } });
  });
  it.each(["fec-efo-workbook-v85", "fec-efo-layouts-v1", "fec-source-policy-v1"] as const)("loads locked %s with its source-lock hash", async id => {
    const { lock: sourceLock } = await loadSourceLock(join(process.cwd(), "data"), {} as NodeJS.ProcessEnv);
    const expected = sourceLock.entries.find(entry => entry.id === id)!;
    await expect(loadLockedArtifact({} as NodeJS.ProcessEnv, id)).resolves.toMatchObject({ sha256: expected.sha256 });
  });
  it("fails closed when retained FEC policy bytes differ from its source-lock hash", async () => {
    const project = await mkdtemp(join(tmpdir(), "ingestion-policy-")); temporary.push(project); const root = join(project, "data"); await mkdir(join(root, "metadata"), { recursive: true });
    const policy = await readFile("data/metadata/fec-source-policy-v1.json"); const policyEntry = { ...entry({ id: "fec-policy", retainedPath: "data/metadata/fec-source-policy-v1.json", byteSize: policy.byteLength, sha256: createHash("sha256").update(policy).digest("hex"), kind: "api_contract" }) };
    await writeFile(join(root, "source-lock.json"), lock([policyEntry])); await writeFile(join(root, "metadata", "fec-source-policy-v1.json"), policy);
    await writeFile(join(root, "metadata", "fec-source-policy-v1.json"), Buffer.concat([policy, Buffer.from(" ")]));
    await expect(loadLockedArtifact({} as NodeJS.ProcessEnv, "fec-policy", project)).rejects.toThrow("SOURCE_LOCK_ARTIFACT_MISMATCH");
  });
  it("requires an explicit local root and production lock hash without exposing credentials", () => {
    expect(() => createRawObjectStore({ NODE_ENV: "development" })).toThrow("RAW_OBJECT_ROOT");
    expect(() => createRawObjectStore({ NODE_ENV: "production", RAW_OBJECT_BUCKET: "raw", INGEST_DATABASE_URL: "postgres://secret", AWS_ACCESS_KEY_ID: "key", SOURCE_LOCK_SHA256: "a".repeat(64) })).toThrow("supplied together");
    expect(() => createRawObjectStore({ NODE_ENV: "production", RAW_OBJECT_BUCKET: "raw", INGEST_DATABASE_URL: "postgres://secret", AWS_ACCESS_KEY_ID: "secret-key", AWS_SECRET_ACCESS_KEY: "secret-value", SOURCE_LOCK_SHA256: "a".repeat(64) })).not.toThrow();
    expect(() => createRawObjectStore({ NODE_ENV: "development", RAW_OBJECT_ROOT: ".raw" })).not.toThrow();
  });
  it("strictly verifies the mounted FEC V2 retention evidence and pinned CA before construction", async () => {
    const env = await productionFecEnv(), config = parseFecV2VersionedStoreConfig(env);
    expect(config).toEqual({ bucket: "fec-v2-artifacts", client: { region: "us-east-1", endpoint: "https://objects.example.test/", forcePathStyle: true, credentials: { accessKeyId: "dedicated-id", secretAccessKey: "dedicated-secret" } }, policy: { mode: "production", endpointUrl: "https://objects.example.test/", certificateValidation: true, retentionEvidenceSha256: env.FEC_V2_RETENTION_EVIDENCE_SHA256 } });
    expect(loadFecV2VersionedStoreFromEnvironment(env)).toBeDefined();
    await writeFile(env.FEC_V2_RETENTION_EVIDENCE_FILE!, Buffer.from("status=pass\n"));
    expect(() => loadFecV2VersionedStoreFromEnvironment(env)).toThrow("FEC_V2_STORE_CONFIGURATION_INVALID");
  });
  it("rejects unsafe FEC V2 loader configuration without leaking credentials", async () => {
    const secret = "do-not-leak";
    const base = { ...(await productionFecEnv()), FEC_V2_S3_SECRET_ACCESS_KEY: secret };
    for (const change of [{ FEC_V2_OBJECT_ENDPOINT: "https://127.0.0.1" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, { FEC_V2_STORE_MODE: "bad" }, { FEC_V2_OBJECT_ENDPOINT: "https://id:pw@objects.example.test" }, { FEC_V2_OBJECT_ENDPOINT: "https://objects.example.test/?q=1" }, { FEC_V2_OBJECT_ENDPOINT: "https://objects.example.test/#x" }, { FEC_V2_S3_ACCESS_KEY_ID: undefined }, { FEC_V2_S3_SECRET_ACCESS_KEY: undefined }, { FEC_V2_RETENTION_EVIDENCE_FILE: undefined }, { FEC_V2_CA_CERT_FILE: undefined }]) {
      try { loadFecV2VersionedStoreFromEnvironment({ ...base, ...change } as NodeJS.ProcessEnv); throw new Error("accepted"); } catch (error) { expect(String(error)).toContain("FEC_V2_STORE_CONFIGURATION"); expect(String(error)).not.toContain(secret); }
    }
  });
  it("allows only literal local-loopback FEC V2 configuration and preserves its session token", () => {
    for (const endpoint of ["http://127.0.0.1:9000/path", "http://127.1.2.3:9000/path", "http://[::1]:9000/path"]) expect(parseFecV2VersionedStoreConfig({ NODE_ENV: "test", FEC_V2_STORE_MODE: "local_loopback", FEC_V2_OBJECT_BUCKET: "fec-v2-artifacts", FEC_V2_S3_REGION: "us-east-1", FEC_V2_OBJECT_ENDPOINT: endpoint, FEC_V2_S3_ACCESS_KEY_ID: "dedicated-id", FEC_V2_S3_SECRET_ACCESS_KEY: "dedicated-secret", FEC_V2_S3_SESSION_TOKEN: "session" }).client).toMatchObject({ forcePathStyle: true, credentials: { accessKeyId: "dedicated-id", secretAccessKey: "dedicated-secret", sessionToken: "session" } });
  });
  it.each(["http://localhost", "http://127.attacker", "http://127.0.0.1.example", "http://[::ffff:8.8.8.8]", "http://[::ffff:127.0.0.1]", "http://0.0.0.0", "http://[::]"])("rejects invalid FEC V2 endpoints: %s", endpoint => { expect(() => parseFecV2VersionedStoreConfig({ NODE_ENV: "test", FEC_V2_STORE_MODE: "local_loopback", FEC_V2_OBJECT_BUCKET: "fec-v2-artifacts", FEC_V2_S3_REGION: "us-east-1", FEC_V2_OBJECT_ENDPOINT: endpoint, FEC_V2_S3_ACCESS_KEY_ID: "dedicated-id", FEC_V2_S3_SECRET_ACCESS_KEY: "dedicated-secret" })).toThrow("FEC_V2_STORE_CONFIGURATION_INVALID"); });
  it("requires exactly one stable-name source row", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 2, rows: [{ id: "src_a" }, { id: "src_b" }] }) };
    await expect(sourceId(pool as never, "rel_a", "identity")).rejects.toThrow("exactly one preregistered identity");
    pool.query.mockResolvedValue({ rowCount: 1, rows: [{ id: "src_identity" }] }); await expect(sourceId(pool as never, "rel_a", "identity")).resolves.toBe("src_identity");
  });
  it("atomically creates or verifies the exact ACS candidate source", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("SELECT status") ? { rowCount: 1, rows: [{ status: "candidate" }] } : sql.includes("SELECT id,name") ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [] });
    const client = { query, release: vi.fn() }, pool = { connect: vi.fn().mockResolvedValue(client) };
    await expect(sourceId(pool as never, "rel_a", "acs")).resolves.toBe("src_acs_2024");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), ["rel_a"]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("data_releases") && String(sql).includes("FOR UPDATE"))).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO sources"), ["rel_a"]);
    const mismatch = { query: vi.fn(async (sql: string) => sql.includes("SELECT status") ? { rowCount: 1, rows: [{ status: "published" }] } : { rowCount: 0, rows: [] }), release: vi.fn() };
    await expect(sourceId({ connect: vi.fn().mockResolvedValue(mismatch) } as never, "rel_a", "acs")).rejects.toThrow("ACS_SOURCE_RELEASE_NOT_CANDIDATE");
  });
});
