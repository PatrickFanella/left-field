import { readFileSync, writeFileSync } from "node:fs";
import { extractIdahoHousePositionLabels } from "../src/rapid-acquisition/idaho-house-seat-authority";
import { readSourceLock } from "../src/rapid-acquisition/intake/source-lock";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--input") throw new Error("Usage: generate-idaho-house-position-labels.ts --input /path/to/nonretained-membership.html");
const value = extractIdahoHousePositionLabels(readFileSync(args[1]!), readSourceLock());
writeFileSync("data/source/identity/idaho/house-district-position-labels-20261030.json", `${JSON.stringify(value, null, 2)}\n`);
