import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type KentuckyPrimaryResultsV2,
  validateKentuckyPrimaryResultsV2,
} from "./house-primary-kentucky-results-v2";

export interface KentuckyPrimarySourceAbsence2026 {
  readonly observationId: "ky:primary:2026:03:democratic";
  readonly cycleYear: 2026;
  readonly electionDate: "2026-05-19";
  readonly districtLabel: "KY-03";
  readonly status: "source_absent_no_disposition_inference";
  readonly sourceLockIds: readonly [
    "ky-2026-primary-certification-vote-totals",
    "ky-2026-primary-certification-vote-totals-layout-text",
  ];
  readonly sourceContestId: null;
  readonly candidateCount: null;
  readonly votes: null;
  readonly sourceWinnerStatus: null;
  readonly resultAuthorityStatus: null;
  readonly winner: null;
  readonly identity: null;
  readonly scoreEligible: false;
  readonly absenceSha256: string;
}

export interface KentuckyPrimaryResultsV3 {
  readonly schema: "rapid-house-primary-kentucky-results-v3";
  readonly version: 3;
  readonly parentPackageSha256: string;
  readonly results: KentuckyPrimaryResultsV2["results"];
  readonly sourceAbsent: readonly [KentuckyPrimarySourceAbsence2026];
  readonly resultSetSha256: string;
  readonly summary: Readonly<{
    reportedContests: 2;
    sourceAbsent: 1;
    candidateRows: 5;
    candidateVotes: 134981;
    scoreEligibleRows: 0;
  }>;
  readonly packageSha256: string;
}

const PDF = {
  id: "ky-2026-primary-certification-vote-totals",
  url: "https://elect.ky.gov/Documents/2026%20Primary%20Certification%20of%20Vote%20Totals%20Final.pdf",
  path: "data/source/rapid/house-primary/ky/2026/primary-certification-vote-totals.pdf",
  bytes: 221_811,
  sha256: "e69458bae9bcce14f4aa22b3394ff0d47f9c5c9f8bd2915be1650519fdd8cd9c",
  kind: "source",
  parentIds: [],
} as const;
const TEXT = {
  id: "ky-2026-primary-certification-vote-totals-layout-text",
  url: "urn:dsa-seats:derived-extract:ky-2026-primary-certification-vote-totals:pdftotext-layout",
  path: "data/source/rapid/house-primary/ky/2026/primary-certification-vote-totals-layout.txt",
  bytes: 96_612,
  sha256: "b0fc0f90ac2837238c5bbb8a535c0e0e04a879accd99035852fb4145549c5232",
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

export function buildKentuckyPrimaryResultsV3(root = process.cwd()): KentuckyPrimaryResultsV3 {
  const parent = validateKentuckyPrimaryResultsV2(
    JSON.parse(readFileSync(join(root, "data/metadata/rapid-house-primary-kentucky-results-v2.json"), "utf8")),
    root,
  );
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  let text = "";
  for (const pin of [PDF, TEXT]) {
    const bytes = readFileSync(join(root, pin.path));
    if (pin === PDF && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("KENTUCKY_2026_PDF_INVALID");
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
      throw new Error(`KENTUCKY_2026_SOURCE_BINDING_INVALID:${pin.id}`);
    }
  }

  if (!/Commonwealth of Kentucky\s+Michael G\. Adams, Secretary of State\s+May 19, 2026\s+Official 2026 Primary Election Results/.test(text)) {
    throw new Error("KENTUCKY_2026_AUTHORITY_INVALID");
  }
  const houseStart = text.search(/For the office of\s+United States Representative in Congress/);
  const followingOffice = text.slice(houseStart + 1).search(/For the office of\s+State Senator/);
  if (houseStart < 0 || followingOffice < 0) throw new Error("KENTUCKY_2026_HOUSE_INVENTORY_INVALID");
  const house = text.slice(houseStart, houseStart + 1 + followingOffice);
  const inventory = [...house.matchAll(/([1-6])(?:st|nd|rd|th) Congressional District\s+(Republican|Democratic) Party/g)]
    .map((match) => `${match[1]}:${match[2]}`);
  if (!exact(inventory, [
    "1:Republican",
    "2:Republican",
    "2:Democratic",
    "3:Republican",
    "4:Republican",
    "4:Democratic",
    "5:Republican",
    "6:Republican",
    "6:Democratic",
  ])) throw new Error("KENTUCKY_2026_HOUSE_INVENTORY_INVALID");
  if (
    !/3rd Congressional District\s+Republican Party[\s\S]*?Maria Teresa[\s\S]*?Total Votes\s+15,855\s+6,807\s+5,893\s+4,313/.test(house)
    || /3rd Congressional District\s+Democratic Party/.test(house)
  ) throw new Error("KENTUCKY_2026_TARGET_ABSENCE_INVALID");

  const absenceUnsigned = {
    observationId: "ky:primary:2026:03:democratic" as const,
    cycleYear: 2026 as const,
    electionDate: "2026-05-19" as const,
    districtLabel: "KY-03" as const,
    status: "source_absent_no_disposition_inference" as const,
    sourceLockIds: [PDF.id, TEXT.id] as const,
    sourceContestId: null,
    candidateCount: null,
    votes: null,
    sourceWinnerStatus: null,
    resultAuthorityStatus: null,
    winner: null,
    identity: null,
    scoreEligible: false as const,
  };
  const sourceAbsent = [{
    ...absenceUnsigned,
    absenceSha256: hash("dsa-seats:rapid-house-primary-kentucky-absence:v3", absenceUnsigned),
  }] as const;
  const summary = {
    reportedContests: 2 as const,
    sourceAbsent: 1 as const,
    candidateRows: 5 as const,
    candidateVotes: 134981 as const,
    scoreEligibleRows: 0 as const,
  };
  const resultSetSha256 = hash("dsa-seats:rapid-house-primary-kentucky-result-set:v3", { results: parent.results, sourceAbsent });
  const unsigned = {
    schema: "rapid-house-primary-kentucky-results-v3" as const,
    version: 3 as const,
    parentPackageSha256: parent.packageSha256,
    results: parent.results,
    sourceAbsent,
    resultSetSha256,
    summary,
  };
  return { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-kentucky-package:v3", unsigned) };
}

export function validateKentuckyPrimaryResultsV3(value: unknown, root = process.cwd()): KentuckyPrimaryResultsV3 {
  const expected = buildKentuckyPrimaryResultsV3(root);
  if (!exact(value, expected)) throw new Error("KENTUCKY_RESULTS_V3_INVALID");
  return value as KentuckyPrimaryResultsV3;
}
