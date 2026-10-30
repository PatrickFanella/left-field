import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";
import { byteCompare, hash, sha, exact } from "./shared";

export interface SouthDakotaCountyFipsNormalizationRow {
  readonly stateCode: "SD";
  readonly sourceCountyFips: "46113";
  readonly currentCountyFips: "46102";
  readonly countyName: "OGLALA LAKOTA";
  readonly cycleYear: 2024;
  readonly office: "US HOUSE";
  readonly districtRaw: "AT-LARGE";
  readonly candidateName: "DUSTY JOHNSON" | "SHERYL JOHNSON";
  readonly candidateParty: "REPUBLICAN" | "DEMOCRAT";
  readonly candidatePartyDetailed: "REPUBLICAN" | "DEMOCRAT";
  readonly specialElection: false;
  readonly writeIn: false;
  readonly votes: number;
  readonly sourceRowCount: 9;
  readonly sourceRowSetSha256: string;
  readonly sourceLockIds: readonly ["medsl-2024-house-state-sd", "census-county-changes-2010s-20260809"];
  readonly authority: "research_fallback_with_official_geographic_identifier_normalization";
  readonly winnerIdentity: null;
  readonly formulaEligible: false;
  readonly rowSha256: string;
}

export interface SouthDakotaCountyFipsNormalization {
  readonly schema: "rapid-south-dakota-county-fips-normalization-v1";
  readonly version: 1;
  readonly authority: Readonly<{
    source: "United States Census Bureau county changes for the 2010s";
    oldCountyName: "Shannon County";
    oldCountyFips: "46113";
    newCountyName: "Oglala Lakota County";
    newCountyFips: "46102";
    effectiveDate: "2015-05-01";
    changeType: "official_name_and_code_change";
    boundaryEquivalenceClaimed: false;
  }>;
  readonly methodology: Readonly<{
    scope: "only_2024_south_dakota_us_house_total_rows_labeled_oglala_lakota_with_source_fips_46113";
    normalization: "replace_obsolete_46113_with_current_46102_using_official_census_change_notice";
    rawSourcePreserved: true;
    winnerInference: false;
    formulaEligible: false;
  }>;
  readonly rows: readonly SouthDakotaCountyFipsNormalizationRow[];
  readonly summary: Readonly<{ sourceRows: 18; normalizedCandidateRows: 2; candidateVotes: 3033; exactCurrentCountyKeysAdded: 1; formulaEligibleRows: 0 }>;
  readonly rowSetSha256: string;
  readonly packageSha256: string;
}

const SOURCE = { id: "medsl-2024-house-state-sd", url: "https://raw.githubusercontent.com/MEDSL/2024-elections-official/df531089c78e6d0098db1a6bfb3849a066a06995/individual_states/sd24.zip", path: "data/source/rapid/county-house-results/2024/sd24.zip", bytes: 189_810, sha256: "06517ec31937a56860cde5a6e105cd668bc6b2915e6d19d6eb8db693a0d91a3c" } as const;
const AUTHORITY = { id: "census-county-changes-2010s-20260809", url: "https://www.census.gov/programs-surveys/geography/technical-documentation/county-changes.2010.html", path: "data/source/rapid/geography/census-county-changes-2010s.html", bytes: 329_445, sha256: "edbee4c6ab07c5c544e5161bf5b5b0afe06829aa23ce2b8b91f9931e81cf992c" } as const;
const OUTPUT = { id: "rapid-south-dakota-county-fips-normalization-v1", url: "urn:dsa-seats:rapid-south-dakota-county-fips-normalization:v1:2024", path: "data/metadata/rapid-south-dakota-county-fips-normalization-v1.json" } as const;

function csvLine(line: string): string[] {
  const fields: string[] = []; let field = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (quoted) { if (character === '"' && line[index + 1] === '"') { field += '"'; index++; } else if (character === '"') quoted = false; else field += character; }
    else if (character === '"' && field === "") quoted = true;
    else if (character === ",") { fields.push(field); field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("SD_FIPS_CSV_QUOTE_INVALID");
  fields.push(field.replace(/\r$/, ""));
  return fields;
}

export function buildSouthDakotaCountyFipsNormalization(root = process.cwd()): SouthDakotaCountyFipsNormalization {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] };
  const zipBytes = readFileSync(join(root, SOURCE.path)), authorityBytes = readFileSync(join(root, AUTHORITY.path));
  const expectedSources = [
    { id: SOURCE.id, url: SOURCE.url, retainedPath: SOURCE.path, retainedStatus: "retained", byteSize: SOURCE.bytes, sha256: SOURCE.sha256, kind: "source", parentIds: [] },
    { id: AUTHORITY.id, url: AUTHORITY.url, retainedPath: AUTHORITY.path, retainedStatus: "retained", byteSize: AUTHORITY.bytes, sha256: AUTHORITY.sha256, kind: "source", parentIds: [] },
  ];
  if (zipBytes.length !== SOURCE.bytes || sha(zipBytes) !== SOURCE.sha256 || authorityBytes.length !== AUTHORITY.bytes || sha(authorityBytes) !== AUTHORITY.sha256 || expectedSources.some((expected) => { const matches = lock.entries.filter((entry) => entry.id === expected.id); return matches.length !== 1 || !exact(sourceLockContent(matches[0]), expected); })) throw new Error("SD_FIPS_SOURCE_INVALID");
  const authorityText = authorityBytes.toString("utf8");
  if (!authorityText.includes("Oglala Lakota County, South Dakota (46-102)") || !authorityText.includes("Changed name and code from Shannon County (46-113) effective May 1, 2015.") || !authorityText.includes("Changed name and code to Oglala Lakota County (46-102) effective May 1, 2015.")) throw new Error("SD_FIPS_AUTHORITY_INVALID");
  const archive = unzipSync(zipBytes), member = archive["sd24.csv"];
  if (!member || Object.keys(archive).length !== 1) throw new Error("SD_FIPS_ARCHIVE_INVALID");
  const lines = new TextDecoder().decode(member).trimEnd().split(/\r?\n/), header = csvLine(lines[0]!);
  const required = ["office", "party_detailed", "party_simplified", "mode", "votes", "county_name", "county_fips", "candidate", "district", "year", "stage", "special", "writein", "state_po"];
  if (required.some((name) => !header.includes(name))) throw new Error("SD_FIPS_HEADER_INVALID");
  const groups = new Map<string, { party: "DEMOCRAT" | "REPUBLICAN"; votes: number; count: number; hasher: ReturnType<typeof createHash> }>();
  let sourceRows = 0;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index]!, values = csvLine(line);
    if (values.length !== header.length) throw new Error(`SD_FIPS_ROW_WIDTH_INVALID:${index + 1}`);
    const at = (name: string) => values[header.indexOf(name)]!;
    if (at("office") !== "US HOUSE" || at("stage") !== "GEN" || at("mode") !== "TOTAL" || at("county_fips") !== "46113") continue;
    sourceRows++;
    if (at("state_po") !== "SD" || at("county_name") !== "OGLALA LAKOTA" || at("year") !== "2024" || at("district") !== "AT-LARGE" || at("special") !== "FALSE" || at("writein") !== "FALSE" || !["DEMOCRAT", "REPUBLICAN"].includes(at("party_simplified")) || at("party_simplified") !== at("party_detailed") || !/^\d+$/.test(at("votes"))) throw new Error(`SD_FIPS_SOURCE_ROW_INVALID:${index + 1}`);
    const candidate = at("candidate");
    if (![["DUSTY JOHNSON", "REPUBLICAN"], ["SHERYL JOHNSON", "DEMOCRAT"]].some(([name, party]) => candidate === name && at("party_simplified") === party)) throw new Error(`SD_FIPS_CANDIDATE_INVALID:${index + 1}`);
    const current = groups.get(candidate) ?? { party: at("party_simplified") as "DEMOCRAT" | "REPUBLICAN", votes: 0, count: 0, hasher: createHash("sha256") };
    current.votes += Number(at("votes")); current.count++; current.hasher.update(`${index + 1}\0${line}\n`); groups.set(candidate, current);
  }
  if (sourceRows !== 18 || groups.size !== 2) throw new Error("SD_FIPS_SOURCE_CLOSURE_INVALID");
  const rows = [...groups].map(([candidateName, group]) => {
    if (group.count !== 9) throw new Error(`SD_FIPS_CANDIDATE_CLOSURE_INVALID:${candidateName}`);
    const unsigned = { stateCode: "SD" as const, sourceCountyFips: "46113" as const, currentCountyFips: "46102" as const, countyName: "OGLALA LAKOTA" as const, cycleYear: 2024 as const, office: "US HOUSE" as const, districtRaw: "AT-LARGE" as const, candidateName: candidateName as "DUSTY JOHNSON" | "SHERYL JOHNSON", candidateParty: group.party, candidatePartyDetailed: group.party, specialElection: false as const, writeIn: false as const, votes: group.votes, sourceRowCount: 9 as const, sourceRowSetSha256: group.hasher.digest("hex"), sourceLockIds: [SOURCE.id, AUTHORITY.id] as const, authority: "research_fallback_with_official_geographic_identifier_normalization" as const, winnerIdentity: null, formulaEligible: false as const };
    return { ...unsigned, rowSha256: hash("dsa-seats:rapid-south-dakota-county-fips-normalization-row:v1", unsigned) };
  }).sort((left, right) => byteCompare(left.candidateName, right.candidateName));
  if (!exact(rows.map((row) => [row.candidateName, row.votes]), [["DUSTY JOHNSON", 720], ["SHERYL JOHNSON", 2313]])) throw new Error("SD_FIPS_VOTE_CLOSURE_INVALID");
  const authority = { source: "United States Census Bureau county changes for the 2010s" as const, oldCountyName: "Shannon County" as const, oldCountyFips: "46113" as const, newCountyName: "Oglala Lakota County" as const, newCountyFips: "46102" as const, effectiveDate: "2015-05-01" as const, changeType: "official_name_and_code_change" as const, boundaryEquivalenceClaimed: false as const };
  const methodology = { scope: "only_2024_south_dakota_us_house_total_rows_labeled_oglala_lakota_with_source_fips_46113" as const, normalization: "replace_obsolete_46113_with_current_46102_using_official_census_change_notice" as const, rawSourcePreserved: true as const, winnerInference: false as const, formulaEligible: false as const };
  const summary = { sourceRows: 18 as const, normalizedCandidateRows: 2 as const, candidateVotes: 3033 as const, exactCurrentCountyKeysAdded: 1 as const, formulaEligibleRows: 0 as const };
  const rowSetSha256 = hash("dsa-seats:rapid-south-dakota-county-fips-normalization-row-set:v1", rows), unsigned = { schema: "rapid-south-dakota-county-fips-normalization-v1" as const, version: 1 as const, authority, methodology, rows, summary, rowSetSha256 };
  const result = { ...unsigned, packageSha256: hash("dsa-seats:rapid-south-dakota-county-fips-normalization-package:v1", unsigned) };
  const output = lock.entries.filter((entry) => entry.id === OUTPUT.id);
  if (output.length === 1) {
    const outputBytes = readFileSync(join(root, OUTPUT.path)), expected = { id: OUTPUT.id, url: OUTPUT.url, retainedPath: OUTPUT.path, retainedStatus: "retained", byteSize: outputBytes.length, sha256: sha(outputBytes), kind: "derived_artifact", parentIds: [SOURCE.id, AUTHORITY.id] };
    if (!exact(sourceLockContent(output[0]), expected)) throw new Error("SD_FIPS_OUTPUT_LOCK_INVALID");
  } else if (output.length !== 0) throw new Error("SD_FIPS_OUTPUT_LOCK_INVALID");
  return result;
}

export function validateSouthDakotaCountyFipsNormalization(value: unknown, root = process.cwd()): SouthDakotaCountyFipsNormalization {
  const expected = buildSouthDakotaCountyFipsNormalization(root);
  if (!exact(value, expected)) throw new Error("SD_FIPS_NORMALIZATION_INVALID");
  return value as SouthDakotaCountyFipsNormalization;
}
