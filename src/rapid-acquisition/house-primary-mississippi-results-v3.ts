import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type MississippiPrimaryResultsV2,
  validateMississippiPrimaryResultsV2,
} from "./house-primary-mississippi-results-v2";

export interface MississippiPrimaryResult2026 {
  readonly resultId: "ms:primary:2026:02:democratic";
  readonly cycleYear: 2026;
  readonly electionDate: "2026-03-10";
  readonly districtLabel: "MS-02";
  readonly sourceLockIds: readonly [
    "ms-2026-primary-statewide-democratic-recap",
    "ms-2026-primary-statewide-democratic-recap-layout-text",
  ];
  readonly rawParty: "Democrat";
  readonly sourceCandidateNames: readonly [
    "Bennie G. Thompson",
    "Evan Littleton Turnage",
    "Pertis Herman Williams III",
  ];
  readonly candidateVotes: readonly [64334, 9249, 917];
  readonly totalVotes: 74500;
  readonly resultAuthorityStatus: "official_statewide_democratic_recap_pdf_retained_no_separate_certification_instrument";
  readonly sourceWinnerStatus: "not_marked_by_source";
  readonly identity: null;
  readonly scoreEligible: false;
  readonly resultSha256: string;
}

export interface MississippiPrimaryResultsV3 {
  readonly schema: "rapid-house-primary-mississippi-results-v3";
  readonly version: 3;
  readonly parentPackageSha256: string;
  readonly results: readonly [
    ...MississippiPrimaryResultsV2["results"],
    MississippiPrimaryResult2026,
  ];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{
    observations: 3;
    candidateRows: 6;
    candidateVotes: 170629;
    scoreEligibleRows: 0;
  }>;
  readonly packageSha256: string;
}

const PDF = {
  id: "ms-2026-primary-statewide-democratic-recap",
  url: "https://www.sos.ms.gov/content/documents/elections/2026/Recap%20report%20Democratic%20Primary%202026.pdf",
  path: "data/source/rapid/house-primary/ms/2026/statewide-democratic-recap.pdf",
  bytes: 81754,
  sha256: "270b461a23890b7b593146fc10055e3d75e91057ebd4614e17a4064fd94444c4",
  kind: "source",
  parentIds: [],
} as const;
const TEXT = {
  id: "ms-2026-primary-statewide-democratic-recap-layout-text",
  url: "urn:dsa-seats:derived-extract:ms-2026-primary-statewide-democratic-recap:pdftotext-layout",
  path: "data/source/rapid/house-primary/ms/2026/statewide-democratic-recap-layout.txt",
  bytes: 36990,
  sha256: "0af2ea5090bbc15862d144e0cb08da5d4d034c383b45329534b3ab54f4d72e87",
  kind: "derived_extract",
  parentIds: [PDF.id],
} as const;

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value as object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const exact = (left: unknown, right: unknown) => canonical(left) === canonical(right);

export function buildMississippiPrimaryResultsV3(root = process.cwd()): MississippiPrimaryResultsV3 {
  const parent = validateMississippiPrimaryResultsV2(
    JSON.parse(readFileSync(join(root, "data/metadata/rapid-house-primary-mississippi-results-v2.json"), "utf8")),
    root,
  );
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  let text = "";
  for (const pin of [PDF, TEXT]) {
    const bytes = readFileSync(join(root, pin.path));
    if (pin === PDF && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("MISSISSIPPI_2026_PDF_INVALID");
    if (pin === TEXT) text = bytes.toString("utf8");
    const expected = {
      id: pin.id,
      url: pin.url,
      retainedPath: pin.path,
      retainedStatus: "retained",
      byteSize: pin.bytes,
      sha256: pin.sha256,
      kind: pin.kind,
      parentIds: [...pin.parentIds],
    };
    const matches = lock.entries.filter((entry) => entry.id === pin.id);
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256 || matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected)) {
      throw new Error(`MISSISSIPPI_2026_SOURCE_BINDING_INVALID:${pin.id}`);
    }
  }
  if (
    !/Official Results\s+Total Votes Reported by Counties for FEDERAL PRIMARY ELECTION\s+Date of Election:\s*3\/10\/2026/.test(text)
    || !/US House Of Rep 02-2nd Congressional\s+District/.test(text)
    || !/Webster\s+Wilkinson\s+Winston\s+Yalobusha\s+Yazoo\s+TOTAL[\s\S]*?Bennie G\. Thompson\s+Democrat\s+X\s+875\s+X\s+885\s+1457\s+64334[\s\S]*?Evan Littleton Turnage\s+Democrat\s+X\s+70\s+X\s+93\s+256\s+9249[\s\S]*?Pertis Herman Williams III\s+Democrat\s+X\s+14\s+X\s+14\s+21\s+917/.test(text)
  ) throw new Error("MISSISSIPPI_2026_TARGET_TABLE_INVALID");

  const unsignedResult = {
    resultId: "ms:primary:2026:02:democratic" as const,
    cycleYear: 2026 as const,
    electionDate: "2026-03-10" as const,
    districtLabel: "MS-02" as const,
    sourceLockIds: [PDF.id, TEXT.id] as const,
    rawParty: "Democrat" as const,
    sourceCandidateNames: ["Bennie G. Thompson", "Evan Littleton Turnage", "Pertis Herman Williams III"] as const,
    candidateVotes: [64334, 9249, 917] as const,
    totalVotes: 74500 as const,
    resultAuthorityStatus: "official_statewide_democratic_recap_pdf_retained_no_separate_certification_instrument" as const,
    sourceWinnerStatus: "not_marked_by_source" as const,
    identity: null,
    scoreEligible: false as const,
  };
  const result = {
    ...unsignedResult,
    resultSha256: hash("dsa-seats:rapid-house-primary-mississippi-result:v3", unsignedResult),
  };
  const results = [...parent.results, result] as const;
  const summary = { observations: 3 as const, candidateRows: 6 as const, candidateVotes: 170629 as const, scoreEligibleRows: 0 as const };
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-mississippi-result-set:v3", results);
  const unsigned = {
    schema: "rapid-house-primary-mississippi-results-v3" as const,
    version: 3 as const,
    parentPackageSha256: parent.packageSha256,
    results,
    resultSetSha256,
    summary,
  };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-mississippi-package:v3", unsigned) };
}

export function validateMississippiPrimaryResultsV3(value: unknown, root = process.cwd()): MississippiPrimaryResultsV3 {
  const expected = buildMississippiPrimaryResultsV3(root);
  if (!exact(value, expected)) throw new Error("MISSISSIPPI_RESULTS_V3_INVALID");
  return value as MississippiPrimaryResultsV3;
}
