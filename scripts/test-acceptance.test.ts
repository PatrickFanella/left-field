import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptanceCommands, assertAcceptanceEnvironment, runAcceptance, spawnCommand } from "./test-acceptance";

const safe = { ACCEPTANCE_TESTS: "1", DATABASE_URL: "postgresql://dsa_seats@127.0.0.1:5432/dsa_acceptance_integration_test", TEST_DATABASE_URL: "postgresql://dsa_seats@localhost:5432/dsa_acceptance_integration_test", QUERY_DATABASE_URL: "postgresql://dsa_seats@127.0.0.1:5432/dsa_acceptance_query_test", E2E_DATABASE_URL: "postgresql://dsa_seats@127.0.0.1:5432/dsa_acceptance_browser_test", WEB_DATABASE_URL: "postgresql://acceptance_web@127.0.0.1:5432/dsa_acceptance_browser_test", ACCEPTANCE_MAP_ARTIFACT_ROOT: join(tmpdir(), "dsa-seats-task13", "task10-maps"), E2E_MAP_PROFILE_PATH: "/seats/seat_0" };
const withDatabaseHost = (hostname: string) => Object.fromEntries(Object.entries(safe).map(([name, value]) => [name, name.endsWith("DATABASE_URL") ? value.replace(/(?:127\.0\.0\.1|localhost)/, hostname) : value]));

describe("acceptance harness", () => {
  afterEach(() => vi.restoreAllMocks());
  it("requires opt-in and isolated, credentialed disposable lanes", () => {
    expect(() => assertAcceptanceEnvironment({ ...safe, ACCEPTANCE_TESTS: "true" })).toThrow("exactly 1");
    expect(() => assertAcceptanceEnvironment({ ...safe, DATABASE_URL: "postgresql://db.example/dsa_test" })).toThrow("loopback");
    expect(() => assertAcceptanceEnvironment({ ...safe, QUERY_DATABASE_URL: "postgresql://dsa_seats@localhost/dsa_test_copy" })).toThrow("ending in _test");
    expect(() => assertAcceptanceEnvironment({ ...safe, QUERY_DATABASE_URL: safe.DATABASE_URL })).toThrow("pairwise distinct");
    expect(() => assertAcceptanceEnvironment({ ...safe, E2E_DATABASE_URL: safe.QUERY_DATABASE_URL, WEB_DATABASE_URL: "postgresql://acceptance_web@localhost:5432/dsa_acceptance_query_test" })).toThrow("pairwise distinct");
    expect(() => assertAcceptanceEnvironment({ ...safe, WEB_DATABASE_URL: "postgresql://dsa_seats@localhost/dsa_acceptance_browser_test" })).toThrow("differ from the browser migration owner");
    expect(() => assertAcceptanceEnvironment({ ...safe, DATABASE_URL: "postgresql://dsa_seats@localhost/dsa_acceptance_integration_test?sslmode=disable" })).toThrow("parameters");
    expect(() => assertAcceptanceEnvironment({ ...safe, QUERY_DATABASE_URL: "postgresql://localhost/dsa_acceptance_query_test" })).toThrow("LOGIN username");
    expect(() => assertAcceptanceEnvironment({ ...safe, NODE_ENV: "production" })).toThrow("refuses NODE_ENV");
    const databaseHost = "acceptance-postgres-012345abcdef-5381-1";
    const ci = withDatabaseHost(databaseHost);
    expect(() => assertAcceptanceEnvironment({ ...ci, ACCEPTANCE_JOB_CONTAINER: "1", ACCEPTANCE_DATABASE_HOST: databaseHost })).toThrow("exact isolated CI database alias");
    expect(() => assertAcceptanceEnvironment({ ...ci, CI: "true", ACCEPTANCE_DATABASE_HOST: databaseHost })).toThrow("exact isolated CI database alias");
    expect(() => assertAcceptanceEnvironment({ ...ci, CI: "true", ACCEPTANCE_JOB_CONTAINER: "1" })).toThrow("exact isolated CI database alias");
    expect(() => assertAcceptanceEnvironment({ ...withDatabaseHost("database.internal"), CI: "true", ACCEPTANCE_JOB_CONTAINER: "1", ACCEPTANCE_DATABASE_HOST: "database.internal" })).toThrow("exact isolated CI database alias");
    expect(() => assertAcceptanceEnvironment({ ...ci, CI: "true", ACCEPTANCE_JOB_CONTAINER: "1", ACCEPTANCE_DATABASE_HOST: databaseHost.toUpperCase() })).toThrow("exact isolated CI database alias");
    expect(() => assertAcceptanceEnvironment({ ...ci, CI: "true", ACCEPTANCE_JOB_CONTAINER: "1", ACCEPTANCE_DATABASE_HOST: "acceptance-postgres-fedcba987654-5381-1" })).toThrow("exact isolated CI database alias");
    expect(() => assertAcceptanceEnvironment({ ...withDatabaseHost("postgres"), CI: "true", ACCEPTANCE_JOB_CONTAINER: "1", ACCEPTANCE_DATABASE_HOST: "postgres" })).toThrow("exact isolated CI database alias");
    expect(assertAcceptanceEnvironment({ ...ci, CI: "true", ACCEPTANCE_JOB_CONTAINER: "1", ACCEPTANCE_DATABASE_HOST: databaseHost })).toMatchObject({ integrationDatabaseUrl: expect.stringContaining(`@${databaseHost}:`) });
  });
  it("runs the pinned lane order with lane-specific environments", async () => {
    expect(acceptanceCommands.map(({ lane, command, args }) => `${lane}: ${command} ${args.join(" ")}`)).toEqual([
      "integration: npm run db:migrate", "integration: npm run test:integration", "integration: npm run test:run -- --exclude src/db/integration.test.ts --maxWorkers=1 --no-file-parallelism --pool=forks --execArgv=--max-old-space-size=2560", "query: npm run db:migrate", "query: npm run measure:task5-queries", "browser: npm run test:e2e:task13", "static: npm run typecheck", "static: npm run lint", "static: npm run build", "static: npm run data:verify", "static: npm audit --audit-level=low", "static: docker compose config -q", "static: npm run db:generate", "static: git diff --exit-code -- drizzle",
    ]);
    const environments = new Map<string, NodeJS.ProcessEnv>();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runAcceptance({ ...safe, OFFICE_UNIVERSE_DATABASE_URL: "postgresql://untrusted.example/production" }, (command, args, env) => { environments.set(`${command} ${args.join(" ")}`, env); return { status: 0, output: "passed\n" }; });
    expect(environments.get("npm run test:integration")).toMatchObject({ DATABASE_URL: safe.DATABASE_URL, TEST_DATABASE_URL: safe.DATABASE_URL, OFFICE_UNIVERSE_DATABASE_URL: safe.DATABASE_URL, WEB_DATABASE_URL: undefined });
    expect(environments.get("npm run measure:task5-queries")).toMatchObject({ DATABASE_URL: safe.QUERY_DATABASE_URL, TEST_DATABASE_URL: safe.QUERY_DATABASE_URL, QUERY_EVIDENCE_MODE: "verify", OFFICE_UNIVERSE_DATABASE_URL: undefined });
    expect(environments.get("npm run test:e2e:task13")).toMatchObject({ DATABASE_URL: safe.E2E_DATABASE_URL, TEST_DATABASE_URL: safe.E2E_DATABASE_URL, WEB_DATABASE_URL: safe.WEB_DATABASE_URL, OFFICE_UNIVERSE_DATABASE_URL: undefined });
  });
  it("fails before later lanes can run when a test reports skips", async () => {
    const calls: string[] = []; vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runAcceptance(safe, (command, args) => { calls.push(args.join(" ")); return { status: 0, output: args[1] === "test:integration" ? "Tests 1 skipped\n" : "passed\n" }; })).rejects.toThrow("skipped");
    expect(calls).toEqual(["run db:migrate", "run test:integration"]);
  });
  it.each([
    "Tests 2532 passed | 7 skipped (2539)",
    "Test Files 420 passed | 2 skipped (422)",
    "Tests 11 passed | 1 pending (12)",
    "\u001b[32mTests\u001b[0m \u001b[33m1 skipped\u001b[0m (1)",
    "\u001b[32mTests\u001b[0m 2532 passed | \u001b[33m7 skipped\u001b[0m (2539)\r\n",
    "  1 skipped (2.0m)",
    "# skipped 2",
  ])("rejects positive omitted-test counts in real reporter summaries: %s", async output => {
    const calls: string[] = []; vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runAcceptance(safe, (_command, args) => {
      calls.push(args.join(" "));
      return { status: 0, output: args[1] === "test:integration" ? output : "passed\n" };
    })).rejects.toThrow("skipped or pending");
    expect(calls).toEqual(["run db:migrate", "run test:integration"]);
  });
  it.each([
    "Tests 2539 passed (2539)",
    "Tests 2539 passed | 0 skipped (2539)",
    "Test Files 422 passed | 0 pending (422)",
    "# skipped 0",
    "stderr | checks > rejects skipped results\nordinary skipped-work diagnostic",
  ])("accepts complete runs and ignores non-summary diagnostics: %s", async output => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runAcceptance(safe, () => ({ status: 0, output }))).resolves.toBeUndefined();
  });

  it("streams output before a child exits", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acceptance-progress-"));
    const release = join(directory, "release");
    let live = "";
    vi.spyOn(process.stdout, "write").mockImplementation(chunk => { live += String(chunk); return true; });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = String.raw`process.stdout.write("ready\n");
      const timer = setInterval(() => {
        if (require("node:fs").existsSync(process.env.RELEASE_FILE)) {
          clearInterval(timer); process.stdout.write("done\n");
        }
      }, 10);
      setTimeout(() => process.exit(2), 3000).unref();`;
    const running = Promise.resolve(spawnCommand(process.execPath, ["-e", code], { ...process.env, RELEASE_FILE: release }));
    try {
      await vi.waitFor(() => expect(live).toContain("ready\n"), { timeout: 2000 });
      expect(live).not.toContain("done\n");
      writeFileSync(release, "continue");
      const result = await running;
      expect(result.status).toBe(0);
      expect(result.output).toBe("ready\ndone\n");
    } finally {
      writeFileSync(release, "continue");
      await running;
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("captures complete output beyond spawnSync's default buffer limit", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await spawnCommand(process.execPath, ["-e", String.raw`process.stdout.write("x".repeat(2*1024*1024)); process.stderr.write("warning\n")`], process.env);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.output).toBe("x".repeat(2 * 1024 * 1024) + "warning\n");
  });

  it("stops the aggregate on a child failure", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await spawnCommand(process.execPath, ["-e", "process.exit(7)"], process.env);
    expect(result.status).toBe(7);
    const calls: string[] = [];
    await expect(runAcceptance(safe, async (_command, args) => { calls.push(args.join(" ")); return result; })).rejects.toThrow("failed with status 7");
    expect(calls).toEqual(["run db:migrate"]);
  });
  it("preserves child launch errors", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await spawnCommand("/nonexistent/acceptance-command", [], process.env);
    expect(result.error).toMatchObject({ code: "ENOENT" });
    await expect(runAcceptance(safe, async () => result)).rejects.toMatchObject({ code: "ENOENT" });
  });

});
