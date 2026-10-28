import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadRapidLocalContextCoverage } from "./rapid-local-context-coverage";

const roots: string[] = [];
const root = async () => { const value = await mkdtemp(join(tmpdir(), "dsa-seats-local-context-ui-")); roots.push(value); return value; };
afterEach(async () => { await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))); });
describe("rapid local-context coverage read model", () => {
  it("is absent without the generated receipt", async () => expect(await loadRapidLocalContextCoverage(await root())).toBeNull());
  it("loads locked local-context coverage without rebuilding source archives", async () => {
    const value = await loadRapidLocalContextCoverage();
    expect(value?.schema).toBe("rapid-local-context-coverage-v16");
    expect(value?.artifacts).toHaveLength(20);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-north-carolina-soil-water-general-results-v1")).toMatchObject({ summary: { contests: 100, candidateRows: 510, candidateVotes: 4_143_641 }, formulaEligibleCount: 0, cyclesThrough: 2024 });
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-north-carolina-local-office-general-results-v1")).toMatchObject({ summary: { contests: 635, candidateRows: 1793, candidateVotes: 22_219_489 }, formulaEligibleCount: 0, cyclesThrough: 2024 });
    expect(value?.artifacts.every((artifact) => artifact.formulaEligibleCount === 0)).toBe(true);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-county-senate-results-projection-v1")?.scope).toContain("incomplete 29-state");
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-county-house-results-projection-v1")?.scope).toContain("41 state archives");
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-county-house-results-2022-projection-v1")?.scope).toContain("2022 House");
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-tennessee-state-legislative-primary-results-v1")?.summary.partyContests).toBe(462);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-georgia-state-legislative-primary-results-v1")?.summary.partyContests).toBe(1090);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-north-carolina-state-legislative-primary-results-v1")?.summary.partyContests).toBe(176);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-alabama-state-legislative-primary-results-v1")?.summary.reportedPartyContests).toBe(60);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-delaware-state-legislative-primary-results-v1")?.summary.reportedPartyContests).toBe(25);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-hawaii-state-legislative-primary-results-v1")?.summary.reportedPartyContests).toBe(243);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-missouri-state-legislative-primary-results-v1")?.summary.partyContests).toBe(565);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-kentucky-state-legislative-primary-results-v1")?.summary.reportedPartyContests).toBe(134);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-north-carolina-local-office-primary-results-v1")?.summary.officeContests).toBe(1095);
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-new-mexico-county-office-primary-results-v1")?.summary).toMatchObject({ officeContests: 581, candidateRows: 926, quarantinedContests: 8 });
    expect(value?.artifacts.find((artifact) => artifact.id === "rapid-ohio-state-legislative-democratic-primary-results-v1")?.summary).toMatchObject({ reportedPartyContests: 221, candidateRows: 282, republicanCyclesRetained: 0 });
  });
  it("falls back to the immutable v1 receipt when v2 is absent", async () => {
    const directory = await root(), metadata = join(directory, "data/metadata"), ids = new Set(["rapid-local-context-coverage-v1", "rapid-county-demographics-projection-v1", "rapid-county-election-context-projection-v1", "rapid-indiana-state-legislative-primary-results-v1"]);
    await mkdir(metadata, { recursive: true });
    await Promise.all([...ids].map((id) => cp(join(process.cwd(), "data/metadata", `${id}.json`), join(metadata, `${id}.json`))));
    const sourceLock = JSON.parse(await readFile(join(process.cwd(), "data/source-lock.json"), "utf8")) as { entries: readonly { id: string }[] };
    await writeFile(join(directory, "data/source-lock.json"), JSON.stringify({ entries: sourceLock.entries.filter((entry) => ids.has(entry.id)) }));
    await expect(loadRapidLocalContextCoverage(directory)).resolves.toMatchObject({ schema: "rapid-local-context-coverage-v1", version: 1 });
  });
  it("rejects a well-shaped receipt without source-lock validation", async () => {
    const directory = await root(); await mkdir(join(directory, "data/metadata"), { recursive: true });
    await writeFile(join(directory, "data/metadata/rapid-local-context-coverage-v1.json"), JSON.stringify({ schema: "rapid-local-context-coverage-v1", version: 1, releaseRelationship: "separate_rapid_acquisition_excluded_from_released_score", artifacts: [] }));
    await expect(loadRapidLocalContextCoverage(directory)).resolves.toBeNull();
  });
});
