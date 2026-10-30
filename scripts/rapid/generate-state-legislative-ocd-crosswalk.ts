import { readFile, writeFile } from "node:fs/promises";

import { buildStateLegislativeOcdCrosswalk, serializeStateLegislativeOcdCrosswalk } from "@/rapid-acquisition/state-legislative-ocd-division";

const path = "docs/reviews/state-legislative-ocd-crosswalk-v1.json";

async function main(): Promise<void> {
  const check = process.argv.slice(2);
  if (check.some((argument) => argument !== "--check")) throw new Error("STATE_LEG_OCD_CROSSWALK_ARGUMENT_INVALID");
  const bytes = Buffer.from(serializeStateLegislativeOcdCrosswalk(buildStateLegislativeOcdCrosswalk()));
  if (check.includes("--check")) {
    let existing: Buffer;
    try { existing = await readFile(path); } catch { throw new Error("STATE_LEG_OCD_CROSSWALK_OUT_OF_DATE"); }
    if (!existing.equals(bytes)) throw new Error("STATE_LEG_OCD_CROSSWALK_OUT_OF_DATE");
    return;
  }
  await writeFile(path, bytes);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "STATE_LEG_OCD_CROSSWALK_GENERATION_FAILED"}\n`);
  process.exitCode = 1;
});
