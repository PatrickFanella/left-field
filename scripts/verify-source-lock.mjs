import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { validateSourceRights } from "./lib/source-license.mjs";

const lock = JSON.parse(await readFile("data/source-lock.json", "utf8"));
if (!lock || typeof lock !== "object" || lock.version !== 1 || !Array.isArray(lock.entries)) {
  throw new Error("Source lock must be a version 1 object with an entries array");
}

const ids = new Set();
for (const entry of lock.entries) {
  if (!entry || typeof entry !== "object") throw new Error("Source lock entries must be objects");
  if (typeof entry.id !== "string" || entry.id.length === 0 || ids.has(entry.id)) throw new Error(`Invalid or duplicate source-lock ID: ${entry.id}`);
  ids.add(entry.id);
  if (typeof entry.url !== "string" || entry.url.length === 0) throw new Error(`Invalid URL: ${entry.id}`);
  if (!["retained", "nonretained"].includes(entry.retainedStatus)) throw new Error(`Invalid retained status: ${entry.id}`);
  if (!Number.isSafeInteger(entry.byteSize) || entry.byteSize < 0) throw new Error(`Invalid byte size: ${entry.id}`);
  if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Invalid SHA-256: ${entry.id}`);
  if (typeof entry.kind !== "string" || entry.kind.length === 0) throw new Error(`Invalid kind: ${entry.id}`);
  if (!Array.isArray(entry.parentIds) || entry.parentIds.some((id) => typeof id !== "string") || new Set(entry.parentIds).size !== entry.parentIds.length) {
    throw new Error(`Invalid parent IDs: ${entry.id}`);
  }
}
validateSourceRights(lock);
for (const entry of lock.entries) {
  for (const parentId of entry.parentIds) {
    if (parentId === entry.id || !ids.has(parentId)) throw new Error(`Unknown or self-referential parent ${parentId}: ${entry.id}`);
  }
}

const paths = new Set();
for (const entry of lock.entries) {
  if (entry.kind === "fec_response" && entry.retainedPath !== null) throw new Error(`FEC response must be nonretained: ${entry.id}`);
  if (entry.retainedStatus === "retained") {
    if (!entry.retainedPath) throw new Error(`Missing retained path: ${entry.id}`);
    if (paths.has(entry.retainedPath)) throw new Error(`Duplicate retained path: ${entry.retainedPath}`);
    paths.add(entry.retainedPath);
    const bytes = await readFile(entry.retainedPath); const info = await stat(entry.retainedPath);
    if (info.size !== entry.byteSize || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`Source lock mismatch: ${entry.id}`);
  } else if (entry.retainedPath !== null) throw new Error(`Nonretained entry has a path: ${entry.id}`);
}

async function retainedRegularFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await retainedRegularFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

for (const root of ["data/source", "data/geometry", "data/metadata"]) {
  for (const file of await retainedRegularFiles(root)) {
    const retainedPath = relative(".", file);
    if (!paths.has(retainedPath)) throw new Error(`Untracked retained file: ${retainedPath}`);
  }
}
const fecFiles = await readdir("data/source/fec");
if (fecFiles.length !== 1 || fecFiles[0] !== "summary-filings.json") throw new Error("Unexpected retained FEC file; contributor CSVs are prohibited");
console.log(`Verified ${lock.entries.length} source-lock entries.`);
const unknown = lock.entries.filter((entry) => entry.license === "unknown").map((entry) => entry.id).sort();
console.log(`Unknown source licenses (${unknown.length}); these are review gaps, not redistribution grants:`);
for (const id of unknown) console.log(`  ${id}`);
