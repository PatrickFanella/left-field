import { sourceLockContent } from "./intake/source-lock-content";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateHousePrimaryProjectionV25 } from "./house-primary-projection-v25";

type IdentityStatus = "exact_name_observation" | "derived_name_relationship" | "unresolved_no_retained_given_name_bridge";
type IdentityMethod = "normalized_official_name" | "congress_legislators_suffix_matches_source" | "source_middle_initial_same_first_last_and_district" | "no_retained_gabriel_to_gabe_bridge";

export interface HousePrimaryIncumbentEvidenceRow {
  readonly evidenceId: string; readonly cycleYear: 2024; readonly districtLabel: string; readonly targetSeatId: string; readonly bioguideId: string; readonly officialHouseName: string;
  readonly sourceArtifactId: string; readonly parentProjectionObservationId: string; readonly sourceCandidateName: string; readonly sourceCandidateVotes: number;
  readonly incumbentVotes: number | null; readonly contestVotes: number; readonly incumbentVoteShare: number | null; readonly primaryVulnerability: number | null;
  readonly identityStatus: IdentityStatus; readonly identityMethod: IdentityMethod; readonly historicalGeographyStatus: "exact_cd119_session_and_district_key";
  readonly resultAuthorityStatus: string; readonly sourceWinnerStatus: "not_marked_by_source" | "marked_by_source"; readonly winnerInference: null; readonly formulaEligible: boolean; readonly rowSha256: string;
}

export interface HousePrimaryIncumbentEvidence {
  readonly schema: "rapid-house-primary-2024-incumbent-evidence-v1"; readonly version: 1;
  readonly sourceIds: readonly string[]; readonly rows: readonly HousePrimaryIncumbentEvidenceRow[]; readonly rowSetSha256: string;
  readonly summary: Readonly<{ observations: 22; exactIdentityLinks: 19; derivedIdentityLinks: 2; unresolvedIdentityRows: 1; formulaEligibleRows: 21; linkedCandidateVotes: 1141209; eligibleContestVotes: 1320426; winnerInferences: 0 }>;
  readonly packageSha256: string;
}

const PINS = [
  ["house-xml", "data/source/identity/house-member-data.xml", 556140, "4ccea8259aff2df6a175545e45bdac2dfcdf0085a9cc7ab6c46aa80527bc524b", "0659b260fa34ccd21ab15a99f0093547b33838166077b28a8581921f441b5898"],
  ["congress-legislators-current-20260804", "data/source/identity/congress-legislators-current-20260804.json", 1466894, "bc48cccd12df96164e5a2415fc41e838ca255fe85c297731515529692f7982cf", "de161419a74002bb8f087942b494ce7812b77f755860adbbed217055d5897193"],
  ["rapid-house-primary-projection-v25", "data/metadata/rapid-house-primary-projection-v25.json", 65948, "ad68a7db06677e258aa8062801f91884a8357703003fb23abd594048d46c32ff", "20c7616db171ab7da37325fe79db59071b351c0ee56ab84eca9fc72b06204fc8"],
  ["rapid-house-primary-alabama-results-v1", "data/metadata/rapid-house-primary-alabama-results-v1.json", 3938, "16cb706239d1099be980774496470c9b66bd5b1eaf1e937877362584f8d9c322", "801e7afe249d4d6089e2d4b845d371704a3759bab5662e9110163c08b6c9d2b0"],
  ["rapid-house-primary-structured-results-v1", "data/metadata/rapid-house-primary-structured-results-v1.json", 16927, "db08d56fa46fefc3329a2e2b483c8f5eef767c424432b4f3eaa78383e33470a6", "78574ea3d9dadfa29aed5473ab4de98cb2bee9bd0e1cafd6ab0f523d38b3a438"],
  ["rapid-house-primary-indiana-results-v2", "data/metadata/rapid-house-primary-indiana-results-v2.json", 6135, "26a2b6018634abde4d0590e0bea3583300cc00134164ec77d653dc5c6bc8fb30", "fcd8768e1cf2d3f0ed709e2cf057b0d6755b7d505c581b412e8996182711316a"],
  ["rapid-house-primary-kansas-results-v1", "data/metadata/rapid-house-primary-kansas-results-v1.json", 2099, "d5c9323f75235719d913ad5198635b115889ca5ee54dacb744dd2287eb9a2704", "86738e8e1f7c5e09ff67bdaaf7e4e5c8172da53aa16b9d5090c5c231f019df3d"],
  ["rapid-house-primary-kentucky-results-v3", "data/metadata/rapid-house-primary-kentucky-results-v3.json", 2870, "23ab4ca7e96b91956c036913499f6481bc8c5f555e5ad287a6f95adad0b2788a", "d550b12b3070200a025d4c9484b0f9532418bc50da30130a73726990a20efca5"],
  ["rapid-house-primary-missouri-results-v2", "data/metadata/rapid-house-primary-missouri-results-v2.json", 3823, "aced4a50b0cf3baafaf0bc54b7cd762fb9312a538f4b6ab33c9068389bfc589e", "b1b71cbd93dff2e9d8381db546c8e5cacbada6857a4815a2e2f278032d8ac18e"],
  ["rapid-house-primary-mississippi-results-v3", "data/metadata/rapid-house-primary-mississippi-results-v3.json", 3064, "1d754ec34676e3fd33637de7298bc38acc6ccf51683750d20966bf877673d75e", "826406773850f3692744fa7d2ca7c2a197158fb66e389c8cea3b8b6e8c1c2f05"],
  ["rapid-house-primary-new-hampshire-results-v2", "data/metadata/rapid-house-primary-new-hampshire-results-v2.json", 4716, "a5e2839b0de404432c45f83b463cc7c6c678ae8c714f88703417c6a12342c7ac", "e920b3e5eb83a12b366502f4dcabbc4a19ab85594c99c34fdec2506ad1347fcf"],
  ["rapid-house-primary-nevada-results-v1", "data/metadata/rapid-house-primary-nevada-results-v1.json", 6083, "f2a4927dbdb7967951e1769f04a2689af70ccd16e1520115314261236eebd3e6", "f6061d4307275d96a3455f37b5f8796da56c3f06f7100051c5334ef6b47360e5"],
  ["rapid-house-primary-tennessee-results-v2", "data/metadata/rapid-house-primary-tennessee-results-v2.json", 3234, "a5292df58fc0647abaae13e55e44aecf56c96ec606ab6a6a327582db4fd15e00", "b01f22ebec2aec41cff84ab52de7b05fdeeed5cc984441918813580f427dc2b3"],
  ["rapid-house-primary-vermont-results-v1", "data/metadata/rapid-house-primary-vermont-results-v1.json", 2533, "b7837da459c1b3b16c09671ef9f20072c98ce5f91159bcff6c869ceec7ec1f94", "1c7d95a9c17780ba4ccae11a94005d0e903ae8c9d064d135ab7134038400c5a1"],
  ["rapid-house-primary-wisconsin-results-v1", "data/metadata/rapid-house-primary-wisconsin-results-v1.json", 4860, "cd1253719ed937165d773259b3e7609db7931f154d073f3bce179e3ff98ff0db", "1dd9ff8f3242e8c2c41ac908d54a948d66ed0c591cc4c9bee6bd6c965cb409b1"],
] as const;

const EXPECTED = [
  ["AL-02","F000481","Shomari Figures","rapid-house-primary-alabama-results-v1","Shomari Figures",24979,57518,"exact_name_observation","normalized_official_name"],
  ["AL-07","S001185","Terri A. Sewell","rapid-house-primary-alabama-results-v1","Terri A. Sewell",59091,63803,"exact_name_observation","normalized_official_name"],
  ["DE-AL","M001238","Sarah McBride","rapid-house-primary-structured-results-v1","SARAH MCBRIDE",66764,83607,"exact_name_observation","normalized_official_name"],
  ["HI-01","C001055","Ed Case","rapid-house-primary-structured-results-v1","CASE, Ed",84114,91422,"exact_name_observation","normalized_official_name"],
  ["HI-02","T000487","Jill N. Tokuda","rapid-house-primary-structured-results-v1","TOKUDA, Jill N.",84978,84978,"exact_name_observation","normalized_official_name"],
  ["IN-01","M001214","Frank J. Mrvan","rapid-house-primary-indiana-results-v2","Frank J. Mrvan",31155,31155,"exact_name_observation","normalized_official_name"],
  ["IN-07","C001072","André Carson","rapid-house-primary-indiana-results-v2","André Carson",30868,33891,"exact_name_observation","normalized_official_name"],
  ["KS-03","D000629","Sharice Davids","rapid-house-primary-kansas-results-v1","Davids, Sharice",37837,37837,"exact_name_observation","normalized_official_name"],
  ["KY-03","M001220","Morgan McGarvey","rapid-house-primary-kentucky-results-v3","Morgan McGARVEY",44275,52641,"exact_name_observation","normalized_official_name"],
  ["MO-01","B001324","Wesley Bell","rapid-house-primary-missouri-results-v2","Wesley Bell",63521,124258,"exact_name_observation","normalized_official_name"],
  ["MO-05","C001061","Emanuel Cleaver","rapid-house-primary-missouri-results-v2","Emanuel Cleaver, II",65248,65248,"derived_name_relationship","congress_legislators_suffix_matches_source"],
  ["MS-02","T000193","Bennie G. Thompson","rapid-house-primary-mississippi-results-v3","Bennie G. Thompson",44295,44295,"exact_name_observation","normalized_official_name"],
  ["NH-01","P000614","Chris Pappas","rapid-house-primary-new-hampshire-results-v2","Chris Pappas",54927,57710,"exact_name_observation","normalized_official_name"],
  ["NH-02","G000604","Maggie Goodlander","rapid-house-primary-new-hampshire-results-v2","Maggie Goodlander",42960,67302,"exact_name_observation","normalized_official_name"],
  ["NV-03","L000590","Susie Lee","rapid-house-primary-nevada-results-v1","LEE, SUSIE",33901,36937,"exact_name_observation","normalized_official_name"],
  ["NV-04","H001066","Steven Horsford","rapid-house-primary-nevada-results-v1","HORSFORD, STEVEN",34861,38945,"exact_name_observation","normalized_official_name"],
  ["RI-01","A000380","Gabe Amo","rapid-house-primary-structured-results-v1","Gabriel Amo*",26696,26696,"unresolved_no_retained_given_name_bridge","no_retained_gabriel_to_gabe_bridge"],
  ["RI-02","M001223","Seth Magaziner","rapid-house-primary-structured-results-v1","Seth Magaziner*",25157,25157,"exact_name_observation","normalized_official_name"],
  ["TN-09","C001068","Steve Cohen","rapid-house-primary-tennessee-results-v2","Steve Cohen",30042,40759,"exact_name_observation","normalized_official_name"],
  ["VT-AL","B001318","Becca Balint","rapid-house-primary-vermont-results-v1","Becca Balint",47638,47638,"exact_name_observation","normalized_official_name"],
  ["WI-02","P000607","Mark Pocan","rapid-house-primary-wisconsin-results-v1","Mark Pocan",149581,149897,"exact_name_observation","normalized_official_name"],
  ["WI-04","M001160","Gwen Moore","rapid-house-primary-wisconsin-results-v1","Gwen S. Moore",85017,85428,"derived_name_relationship","source_middle_initial_same_first_last_and_district"],
] as const satisfies readonly (readonly [string,string,string,string,string,number,number,IdentityStatus,IdentityMethod])[];

const OUTPUT = { id: "rapid-house-primary-2024-incumbent-evidence-v1", path: "data/metadata/rapid-house-primary-2024-incumbent-evidence-v1.json", url: "urn:dsa-seats:rapid-house-primary-2024-incumbent-evidence:v1" } as const;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as object).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
const hash = (domain: string, value: unknown) => createHash("sha256").update(`${domain}\0${canonical(value)}`).digest("hex");
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const one = (value: number) => Math.round(value * 10) / 10;
const strip = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\*$/, "").trim();
function nameKey(value: string): string { const clean = strip(value); const reordered = clean.includes(",") ? `${clean.split(",").slice(1).join(" ")} ${clean.split(",")[0]}` : clean; return reordered.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function tag(block: string, key: string) { return block.match(new RegExp(`<${key}>([\\s\\S]*?)<\\/${key}>`))?.[1]?.trim() ?? null; }
function candidateNodes(value: unknown, districtLabel: string, output: Record<string, unknown>[] = []): Record<string, unknown>[] { if (!value || typeof value !== "object") return output; if (Array.isArray(value)) { for (const item of value) candidateNodes(item, districtLabel, output); return output; } const row = value as Record<string, unknown>; if (row.cycleYear === 2024 && row.districtLabel === districtLabel && (Array.isArray(row.candidates) || Array.isArray(row.sourceCandidateNames) || typeof row.sourceCandidateName === "string")) output.push(row); for (const item of Object.values(row)) candidateNodes(item, districtLabel, output); return output; }
function candidates(row: Record<string, unknown>): [string, number][] { if (Array.isArray(row.candidates)) return row.candidates.map((item) => [(item as Record<string, unknown>).sourceCandidateName as string, (item as Record<string, unknown>).votes as number]); if (Array.isArray(row.sourceCandidateNames)) return row.sourceCandidateNames.map((name, index) => [name as string, (row.candidateVotes as number[])[index]!]); return [[row.sourceCandidateName as string, (typeof row.candidateVotes === "number" ? row.candidateVotes : row.sourceCandidateVotes) as number]]; }

export function buildHousePrimaryIncumbentEvidence(root = process.cwd()): HousePrimaryIncumbentEvidence {
  const lock = JSON.parse(readFileSync(join(root, "data/source-lock.json"), "utf8")) as { entries: readonly Record<string, unknown>[] }, values = new Map<string, Buffer>();
  for (const [id, path, bytes, digest, entryDigest] of PINS) { const value = readFileSync(join(root, path)), matches = lock.entries.filter((entry) => entry.id === id); if (value.length !== bytes || sha(value) !== digest || matches.length !== 1 || sha(JSON.stringify(sourceLockContent(matches[0]))) !== entryDigest) throw new Error(`HOUSE_PRIMARY_INCUMBENT_SOURCE_INVALID:${id}`); values.set(id, value); }
  const projection = validateHousePrimaryProjectionV25(JSON.parse(values.get("rapid-house-primary-projection-v25")!.toString("utf8")), root);
  const xml = values.get("house-xml")!.toString("utf8"), congress = JSON.parse(values.get("congress-legislators-current-20260804")!.toString("utf8")) as { id?: { bioguide?: string }; name?: { suffix?: string }; terms?: { type?: string; state?: string; district?: number }[] }[];
  const parsedArtifacts = new Map(PINS.slice(3).map(([id]) => [id, JSON.parse(values.get(id)!.toString("utf8"))]));
  const rows = EXPECTED.map(([districtLabel, bioguideId, officialHouseName, sourceArtifactId, sourceCandidateName, sourceCandidateVotes, contestVotes, identityStatus, identityMethod]) => {
    const stateCode = districtLabel.slice(0, 2), district = districtLabel.slice(3) === "AL" ? 0 : Number(districtLabel.slice(3)), stateDistrict = `${stateCode}${String(district).padStart(2, "0")}`;
    const blocks = [...xml.matchAll(/<member>([\s\S]*?)<\/member>/g)].map((match) => match[1]!).filter((block) => tag(block, "bioguideID") === bioguideId && tag(block, "statedistrict") === stateDistrict && tag(block, "official-name") === officialHouseName);
    const people = congress.filter((person) => person.id?.bioguide === bioguideId), currentTerms = people[0]?.terms?.filter((term) => term.type === "rep" && term.state === stateCode && term.district === district) ?? [];
    if (blocks.length !== 1 || people.length !== 1 || currentTerms.length === 0) throw new Error(`HOUSE_PRIMARY_INCUMBENT_CURRENT_IDENTITY_INVALID:${districtLabel}`);
    if (identityMethod === "congress_legislators_suffix_matches_source" && people[0]!.name?.suffix !== "II") throw new Error("HOUSE_PRIMARY_INCUMBENT_SUFFIX_INVALID");
    if (identityStatus === "exact_name_observation" && nameKey(sourceCandidateName) !== nameKey(officialHouseName)) throw new Error(`HOUSE_PRIMARY_INCUMBENT_EXACT_NAME_INVALID:${districtLabel}`);
    const observation = projection.observations.find((row) => row.cycleYear === 2024 && row.districtLabel === districtLabel), nodes = candidateNodes(parsedArtifacts.get(sourceArtifactId), districtLabel);
    if (!observation || observation.parseStatus !== "parsed" || observation.votes !== contestVotes || !["not_marked_by_source", "marked_by_source"].includes(observation.sourceWinnerStatus ?? "") || observation.identity !== null || observation.scoreEligible || nodes.length !== 1) throw new Error(`HOUSE_PRIMARY_INCUMBENT_PARENT_INVALID:${districtLabel}`);
    const sourceCandidates = candidates(nodes[0]!), matches = sourceCandidates.filter(([name, votes]) => name === sourceCandidateName && votes === sourceCandidateVotes);
    if (matches.length !== 1 || sourceCandidates.reduce((sum, [, votes]) => sum + votes, 0) !== contestVotes) throw new Error(`HOUSE_PRIMARY_INCUMBENT_CANDIDATE_INVALID:${districtLabel}`);
    const formulaEligible = identityStatus !== "unresolved_no_retained_given_name_bridge", incumbentVotes = formulaEligible ? sourceCandidateVotes : null, incumbentVoteShare = incumbentVotes === null ? null : one(100 * incumbentVotes / contestVotes), primaryVulnerability = incumbentVoteShare === null ? null : one(100 - incumbentVoteShare);
    const unsigned = { evidenceId: `rapid-primary-incumbent:2024:${districtLabel.toLowerCase()}`, cycleYear: 2024 as const, districtLabel, targetSeatId: `seat_house_${stateCode.toLowerCase()}_${district === 0 ? "al" : String(district).padStart(2, "0")}_current`, bioguideId, officialHouseName, sourceArtifactId, parentProjectionObservationId: observation.observationId, sourceCandidateName, sourceCandidateVotes, incumbentVotes, contestVotes, incumbentVoteShare, primaryVulnerability, identityStatus, identityMethod, historicalGeographyStatus: "exact_cd119_session_and_district_key" as const, resultAuthorityStatus: observation.resultAuthorityStatus!, sourceWinnerStatus: observation.sourceWinnerStatus as "not_marked_by_source" | "marked_by_source", winnerInference: null, formulaEligible };
    return { ...unsigned, rowSha256: hash("dsa-seats:rapid-house-primary-incumbent-evidence-row:v1", unsigned) };
  }).sort((left, right) => compare(left.districtLabel, right.districtLabel));
  const summary = { observations: 22 as const, exactIdentityLinks: 19 as const, derivedIdentityLinks: 2 as const, unresolvedIdentityRows: 1 as const, formulaEligibleRows: 21 as const, linkedCandidateVotes: 1141209 as const, eligibleContestVotes: 1320426 as const, winnerInferences: 0 as const };
  const actual = { observations: rows.length, exactIdentityLinks: rows.filter((row) => row.identityStatus === "exact_name_observation").length, derivedIdentityLinks: rows.filter((row) => row.identityStatus === "derived_name_relationship").length, unresolvedIdentityRows: rows.filter((row) => row.identityStatus.startsWith("unresolved")).length, formulaEligibleRows: rows.filter((row) => row.formulaEligible).length, linkedCandidateVotes: rows.reduce((sum, row) => sum + (row.incumbentVotes ?? 0), 0), eligibleContestVotes: rows.reduce((sum, row) => sum + (row.formulaEligible ? row.contestVotes : 0), 0), winnerInferences: rows.filter((row) => row.winnerInference !== null).length };
  if (canonical(actual) !== canonical(summary) || new Set(rows.map((row) => row.targetSeatId)).size !== 22) throw new Error("HOUSE_PRIMARY_INCUMBENT_CLOSURE_INVALID");
  const sourceIds = PINS.map(([id]) => id), rowSetSha256 = hash("dsa-seats:rapid-house-primary-incumbent-evidence-row-set:v1", rows), unsigned = { schema: "rapid-house-primary-2024-incumbent-evidence-v1" as const, version: 1 as const, sourceIds, rows, rowSetSha256, summary }, result = { ...unsigned, packageSha256: hash("dsa-seats:rapid-house-primary-incumbent-evidence-package:v1", unsigned) };
  const output = lock.entries.filter((entry) => entry.id === OUTPUT.id); if (output.length === 1) { const bytes = readFileSync(join(root, OUTPUT.path)), expected = { id: OUTPUT.id, url: OUTPUT.url, retainedPath: OUTPUT.path, retainedStatus: "retained", byteSize: bytes.length, sha256: sha(bytes), kind: "derived_artifact", parentIds: sourceIds }; if (canonical(sourceLockContent(output[0])) !== canonical(expected)) throw new Error("HOUSE_PRIMARY_INCUMBENT_OUTPUT_LOCK_INVALID"); } else if (output.length !== 0) throw new Error("HOUSE_PRIMARY_INCUMBENT_OUTPUT_LOCK_INVALID");
  return result;
}

export function validateHousePrimaryIncumbentEvidence(value: unknown, root = process.cwd()): HousePrimaryIncumbentEvidence { const expected = buildHousePrimaryIncumbentEvidence(root); if (canonical(value) !== canonical(expected)) throw new Error("HOUSE_PRIMARY_INCUMBENT_EVIDENCE_INVALID"); return value as HousePrimaryIncumbentEvidence; }
