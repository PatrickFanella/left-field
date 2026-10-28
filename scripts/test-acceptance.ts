/** The acceptance gate consumes CI-provisioned disposable database lanes. */
import { spawn } from "node:child_process";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { stripVTControlCharacters } from "node:util";

export interface AcceptanceEnvironment {
  readonly integrationDatabaseUrl: string;
  readonly queryDatabaseUrl: string;
  readonly e2eDatabaseUrl: string;
  readonly webDatabaseUrl: string;
  readonly mapRoot: string;
  readonly profilePath: string;
}

export type AcceptanceLane = "integration" | "query" | "browser" | "static";
export interface AcceptanceCommand { readonly lane: AcceptanceLane; readonly command: string; readonly args: readonly string[]; }

export function assertAcceptanceEnvironment(env: Readonly<Record<string, string | undefined>>): AcceptanceEnvironment {
  if (env.ACCEPTANCE_TESTS !== "1") throw new Error("ACCEPTANCE_TESTS must equal exactly 1");
  if (env.NODE_ENV?.toLowerCase() === "production") throw new Error("Acceptance harness refuses NODE_ENV=production");
  const urls = ["DATABASE_URL", "TEST_DATABASE_URL", "QUERY_DATABASE_URL", "E2E_DATABASE_URL", "WEB_DATABASE_URL"] as const;
  const parsed = urls.map(name => {
    const value = env[name];
    if (!value) throw new Error(`${name} is required`);
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`${name} must be a PostgreSQL URL`); }
    if (!(["postgres:", "postgresql:"] as string[]).includes(url.protocol)) throw new Error(`${name} must be a PostgreSQL URL`);
    const hostname = url.hostname.toLowerCase();
    const configuredDatabaseHost = env.ACCEPTANCE_DATABASE_HOST;
    const isolatedContainerHost = env.CI === "true" && env.ACCEPTANCE_JOB_CONTAINER === "1" && configuredDatabaseHost !== undefined && /^acceptance-postgres-[0-9a-f]{12}-[0-9]+-[0-9]+$/.test(configuredDatabaseHost) && hostname === configuredDatabaseHost.toLowerCase();
    if (!(["localhost", "127.0.0.1", "::1"] as string[]).includes(hostname) && !isolatedContainerHost) throw new Error(`${name} must use a loopback host or the exact isolated CI database alias`);
    if (url.search || url.hash) throw new Error(`${name} must not include query parameters or fragments`);
    if (!url.username) throw new Error(`${name} must include a LOGIN username`);
    const database = decodeURIComponent(url.pathname).replace(/^\//, "");
    if (!/_test$/i.test(database)) throw new Error(`${name} must name a database ending in _test`);
    if (/(^|[._-])prod(uction)?([._-]|$)/i.test(`${url.hostname}/${database}`)) throw new Error("Acceptance harness refuses production");
    return { value, url, database };
  });
  if (parsed[0]!.database !== parsed[1]!.database) throw new Error("DATABASE_URL and TEST_DATABASE_URL must name the same integration database");
  if (parsed[3]!.database !== parsed[4]!.database) throw new Error("E2E_DATABASE_URL and WEB_DATABASE_URL must name the same browser database");
  if (new Set([parsed[0]!.database, parsed[2]!.database, parsed[3]!.database]).size !== 3) throw new Error("integration, query, and browser databases must be pairwise distinct");
  if (parsed[4]!.url.username === parsed[3]!.url.username) throw new Error("WEB_DATABASE_URL username must differ from the browser migration owner");
  const configuredRoot = env.ACCEPTANCE_MAP_ARTIFACT_ROOT;
  if (!configuredRoot || !isAbsolute(configuredRoot)) throw new Error("ACCEPTANCE_MAP_ARTIFACT_ROOT must be an absolute dedicated Task13 test directory");
  const mapRoot = resolve(configuredRoot), temporary = resolve(tmpdir()), fromTemporary = relative(temporary, mapRoot);
  const underTemporary = fromTemporary.length > 0 && fromTemporary !== ".." && !fromTemporary.startsWith(`..${sep}`) && !isAbsolute(fromTemporary);
  if (!underTemporary || !/task13/i.test(mapRoot) || !/^task10(?:[-_][a-z0-9]+)*$/i.test(basename(mapRoot))) throw new Error("ACCEPTANCE_MAP_ARTIFACT_ROOT must be a dedicated Task13 Task10 root under the system temp directory");
  const profilePath = env.E2E_MAP_PROFILE_PATH;
  if (!profilePath || !/^\/seats\/[^/?#]+$/.test(profilePath)) throw new Error("E2E_MAP_PROFILE_PATH must name the seeded profile route");
  return { integrationDatabaseUrl: parsed[0]!.value, queryDatabaseUrl: parsed[2]!.value, e2eDatabaseUrl: parsed[3]!.value, webDatabaseUrl: parsed[4]!.value, mapRoot, profilePath };
}

/** Keep this list as the CI aggregate contract; tests pin its order and lanes. */
export const acceptanceCommands: readonly AcceptanceCommand[] = [
  { lane: "integration", command: "npm", args: ["run", "db:migrate"] },
  { lane: "integration", command: "npm", args: ["run", "test:integration"] },
  { lane: "integration", command: "npm", args: ["run", "test:run", "--", "--exclude", "src/db/integration.test.ts", "--maxWorkers=1", "--no-file-parallelism", "--pool=forks", "--execArgv=--max-old-space-size=2560"] },
  { lane: "query", command: "npm", args: ["run", "db:migrate"] },
  { lane: "query", command: "npm", args: ["run", "measure:task5-queries"] },
  { lane: "browser", command: "npm", args: ["run", "test:e2e:task13"] },
  ...(["typecheck", "lint", "build", "data:verify"] as const).map(script => ({ lane: "static" as const, command: "npm", args: ["run", script] })),
  { lane: "static", command: "npm", args: ["audit", "--audit-level=low"] },
  { lane: "static", command: "docker", args: ["compose", "config", "-q"] },
  { lane: "static", command: "npm", args: ["run", "db:generate"] },
  { lane: "static", command: "git", args: ["diff", "--exit-code", "--", "drizzle"] },
];

export function acceptanceCommandEnvironment(base: Readonly<Record<string, string | undefined>>, environment: AcceptanceEnvironment, lane: AcceptanceLane): NodeJS.ProcessEnv {
  const databaseUrl = lane === "integration" ? environment.integrationDatabaseUrl : lane === "query" ? environment.queryDatabaseUrl : lane === "browser" ? environment.e2eDatabaseUrl : undefined;
  return { ...base, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl, QUERY_DATABASE_URL: lane === "query" ? environment.queryDatabaseUrl : undefined, E2E_DATABASE_URL: lane === "browser" ? environment.e2eDatabaseUrl : undefined, WEB_DATABASE_URL: lane === "browser" ? environment.webDatabaseUrl : undefined, QUERY_EVIDENCE_MODE: lane === "query" ? "verify" : undefined, MAP_ARTIFACT_ROOT: environment.mapRoot, E2E_MAP_PROFILE_PATH: environment.profilePath, E2E_BASE_URL: undefined, E2E_SERVER_COMMAND: undefined } as unknown as NodeJS.ProcessEnv;
}

export interface CommandResult { readonly status: number | null; readonly output: string; readonly error?: Error; readonly outputStreamed?: boolean; }
export type CommandRunner = (command: string, args: readonly string[], env: NodeJS.ProcessEnv) => CommandResult | Promise<CommandResult>;
export const spawnCommand: CommandRunner = (command, args, env) => new Promise(resolve => {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const stdout: string[] = [], stderr: string[] = [];
  let error: Error | undefined;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout.push(chunk); process.stdout.write(chunk); });
  child.stderr.on("data", (chunk: string) => { stderr.push(chunk); process.stderr.write(chunk); });
  child.once("error", cause => { error = cause; });
  child.once("close", status => resolve({ status, output: stdout.join("") + stderr.join(""), error, outputStreamed: true }));
});
function isTestCommand(command: string, args: readonly string[]): boolean { return command === "npm" && args[0] === "run" && args[1]?.startsWith("test:"); }
function hasSkippedOrPendingSummary(output: string): boolean {
  return stripVTControlCharacters(output).split(/\r?\n/).some(line => {
    const summary = line.trim().replace(/^(?:Test Files|Tests)\s+/i, "");
    if (/^#\s+(?:skipped|pending)\s+0*[1-9]\d*\s*$/i.test(summary)) return true;
    return /^\d+\s+(?:passed|failed|skipped|pending)\b/i.test(summary)
      && /(?:^|\|)\s*0*[1-9]\d*\s+(?:skipped|pending)(?=\s*(?:\||\(|$))/i.test(summary);
  });
}

export async function runAcceptance(env: Readonly<Record<string, string | undefined>> = process.env, runner: CommandRunner = spawnCommand): Promise<void> {
  const environment = assertAcceptanceEnvironment(env);
  for (const { lane, command, args } of acceptanceCommands) {
    process.stdout.write(`[acceptance:${lane}] ${command} ${args.join(" ")}\n`);
    const result = await runner(command, args, acceptanceCommandEnvironment(env, environment, lane));
    if (!result.outputStreamed) process.stdout.write(result.output);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
    if (isTestCommand(command, args) && hasSkippedOrPendingSummary(result.output)) throw new Error(`${command} ${args.join(" ")} reported skipped or pending work`);
  }
}
if (process.argv[1]?.endsWith("test-acceptance.ts")) { void runAcceptance().catch(error => { console.error(error); process.exitCode = 1; }); }
