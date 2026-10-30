import { readFileSync, writeFileSync } from "node:fs";

import { buildArizona2024GeneralOpenElectionsCrosscheck, readPinnedArizona2024GeneralOpenElectionsCrosscheck } from "../src/rapid-acquisition/crosschecks/arizona-2024-general";

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] !== undefined && args[0] !== "--check")) throw new Error("Usage: generate-arizona-2024-general-openelections-crosscheck.ts [--check]");

const report = buildArizona2024GeneralOpenElectionsCrosscheck(readPinnedArizona2024GeneralOpenElectionsCrosscheck());
const path = "docs/reviews/arizona-2024-general-openelections-crosscheck-v1.json";
const text = `${JSON.stringify(report, null, 2)}\n`;
if (args[0] === "--check") {
  if (readFileSync(path, "utf8") !== text) throw new Error(`Arizona OpenElections cross-check report is stale: ${path}`);
} else writeFileSync(path, text);
console.log(JSON.stringify({ path, ...report.summary }));
