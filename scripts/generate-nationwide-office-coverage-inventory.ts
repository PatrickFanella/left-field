import { readFileSync, writeFileSync } from "node:fs";

import {
  buildNationwideOfficeCoverageInventory,
  serializeNationwideOfficeCoverageInventory,
} from "../src/office-universe/coverage-inventory";

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] !== undefined && args[0] !== "--check")) throw new Error("Usage: generate-nationwide-office-coverage-inventory.ts [--check]");
const path = "docs/reviews/nationwide-office-coverage-inventory-v1.json";
const report = buildNationwideOfficeCoverageInventory();
const bytes = serializeNationwideOfficeCoverageInventory(report);
if (args[0] === "--check") {
  if (!readFileSync(path).equals(bytes)) throw new Error(`Nationwide office coverage inventory is stale: ${path}`);
} else writeFileSync(path, bytes);
console.log(JSON.stringify({ path, ...report.summary }));
