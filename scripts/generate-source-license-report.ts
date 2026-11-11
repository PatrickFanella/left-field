import { readFileSync, writeFileSync } from "node:fs";

import { buildCurrentSourceLicenseReport, serializeSourceLicenseReport } from "../src/rapid-acquisition/source-license-report";

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] !== undefined && args[0] !== "--check")) throw new Error("Usage: generate-source-license-report.ts [--check]");
const path = "docs/reviews/source-license-dependency-report-v1.json";
const report = buildCurrentSourceLicenseReport();
const text = serializeSourceLicenseReport(report);
if (args[0] === "--check") {
  if (readFileSync(path, "utf8") !== text) throw new Error(`Source-license report is stale: ${path}`);
} else writeFileSync(path, text);
console.log(JSON.stringify({ path, ...report.summary }));
