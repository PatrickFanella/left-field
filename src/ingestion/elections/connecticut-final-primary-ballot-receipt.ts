import { sourceLockContent } from "../../rapid-acquisition/intake/source-lock-content";
import { createHash } from "node:crypto";
import { canonicalJson } from "../fec/aipac-proposed-packages";

type LockEntry = { id: string; url: string; retainedPath: string | null; retainedStatus: "retained" | "nonretained"; byteSize: number; sha256: string; kind: string; parentIds: string[] };
type Lock = { version: 1; entries: LockEntry[] };
type CatalogIndex = { cycleYear: 2022 | 2024; id: string; url: string; retainedPath: string; byteSize: number; sha256: string; townRows: 169; democraticBallotLinks: number };
type CatalogDocument = { sourceLockId: string; cycleYear: 2022 | 2024; townLabel: string; url: string; retainedPath: string; byteSize: number; sha256: string; pageCount: number; reviewMethod: "pdftotext_layout_review" | "ocr_visual_review"; houseOfficeContestRows: 0; personalAddressFieldsObserved: 0 };
type CatalogTownRow = { cycleYear: 2022 | 2024; townIndex: number; townLabel: string; democraticBallotStatus: "official_linked_ballot_reviewed" | "no_democratic_ballot_link_on_official_index"; sourceLockId: string | null };
type Catalog = { schema: "connecticut-final-primary-ballot-source-catalog-v1"; version: 1; preparedAt: string; sourceCutoff: string; indexes: CatalogIndex[]; documents: CatalogDocument[]; townRows: CatalogTownRow[] };
export type ConnecticutFinalPrimaryBallotReceiptInput = { catalogBytes: Buffer; sourceLock: Lock };
export type ConnecticutFinalPrimaryBallotReceipt = ReturnType<typeof assemble>;

const CATALOG_SHA256 = "746dba8bf3f7f4e47e776a47d63f876be496f6faa0e7101e31b0a68a5da410ca";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain, "ascii").update(canonicalJson(value), "utf8").digest("hex");
const fail = (reason: string): never => { throw new Error(`CT_FINAL_PRIMARY_BALLOT_RECEIPT_INVALID:${reason}`); };

function exactEntry(lock: Lock, expected: LockEntry): LockEntry {
  const matches = lock.entries.filter((entry) => entry.id === expected.id);
  if (matches.length !== 1 || canonicalJson(sourceLockContent(matches[0])) !== canonicalJson(sourceLockContent(expected))) fail(`source_lock:${expected.id}`);
  return matches[0]!;
}

function inputs(input: ConnecticutFinalPrimaryBallotReceiptInput) {
  if (input.sourceLock.version !== 1 || sha(input.catalogBytes) !== CATALOG_SHA256) fail("input");
  const catalog = JSON.parse(input.catalogBytes.toString("utf8")) as Catalog;
  if (catalog.schema !== "connecticut-final-primary-ballot-source-catalog-v1" || catalog.version !== 1 || catalog.indexes.length !== 2 || catalog.documents.length !== 196 || catalog.townRows.length !== 338) fail("catalog_shape");
  const expectedIndexes: LockEntry[] = catalog.indexes.map((source) => ({ id: source.id, url: source.url, retainedPath: source.retainedPath, retainedStatus: "retained", byteSize: source.byteSize, sha256: source.sha256, kind: "official_primary_ballot_index", parentIds: [] }));
  const expectedDocuments: LockEntry[] = catalog.documents.map((source) => ({ id: source.sourceLockId, url: source.url, retainedPath: source.retainedPath, retainedStatus: "retained", byteSize: source.byteSize, sha256: source.sha256, kind: "official_primary_ballot", parentIds: [`ct-${source.cycleYear}-primary-${source.cycleYear === 2022 ? "town" : "sample"}-ballot-index`] }));
  const rawSources = ([...expectedIndexes, ...expectedDocuments].map((entry) => exactEntry(input.sourceLock, entry))).map(sourceLockContent);
  const expectedCatalog: LockEntry = { id: "ct-final-primary-ballot-source-catalog-v1", url: "urn:dsa-seats:connecticut-final-primary-ballot-source-catalog:v1:2026-08-06", retainedPath: "data/source/elections/primary-results/connecticut/ballots/source-catalog-v1.json", retainedStatus: "retained", byteSize: input.catalogBytes.length, sha256: CATALOG_SHA256, kind: "derived_manifest", parentIds: rawSources.map((entry) => entry.id) };
  const catalogSource = exactEntry(input.sourceLock, expectedCatalog);
  const townKeys = catalog.townRows.map((row) => `${row.cycleYear}:${row.townIndex}`);
  if (new Set(townKeys).size !== 338 || new Set(catalog.documents.map((row) => row.sourceLockId)).size !== 196 || catalog.indexes.some((row) => row.townRows !== 169) || catalog.documents.some((row) => row.houseOfficeContestRows !== 0 || row.personalAddressFieldsObserved !== 0)) fail("catalog_universe");
  return { catalog, rawSources, catalogSource: sourceLockContent(catalogSource) };
}

function assemble(input: ConnecticutFinalPrimaryBallotReceiptInput) {
  const { catalog, rawSources, catalogSource } = inputs(input);
  const documents = catalog.documents.map((source) => ({
    documentId: `ct-ballot-review:${source.cycleYear}:${String(catalog.documents.filter((candidate) => candidate.cycleYear === source.cycleYear).findIndex((candidate) => candidate.sourceLockId === source.sourceLockId) + 1).padStart(3, "0")}`,
    cycleYear: source.cycleYear,
    townLabel: source.townLabel,
    party: "Democratic" as const,
    sourceLockId: source.sourceLockId,
    sourcePageCount: source.pageCount,
    reviewMethod: source.reviewMethod,
    observedOfficeScope: "all_office_rows_on_posted_ballot" as const,
    houseOfficeContestRows: 0 as const,
    ballotEvidenceConclusion: "no_us_house_office_contest_observed_in_posted_ballot" as const,
    personalAddressFieldsObserved: 0 as const,
    nominationStatus: null,
    resultStatus: null,
    scoreEligible: false as const,
  })).map((row) => ({ ...row, rowSha256: digest("dsa-seats:ct-final-primary-ballot-document:v1\0", row) }));
  const townRows = catalog.townRows.map((source) => {
    const row = {
      observationId: `ct-ballot-index:${source.cycleYear}:${String(source.townIndex).padStart(3, "0")}`,
      cycleYear: source.cycleYear,
      townIndex: source.townIndex,
      townLabel: source.townLabel,
      party: "Democratic" as const,
      indexSourceLockId: `ct-${source.cycleYear}-primary-${source.cycleYear === 2022 ? "town" : "sample"}-ballot-index`,
      democraticBallotStatus: source.democraticBallotStatus,
      ballotSourceLockId: source.sourceLockId,
      houseOfficeContestObserved: source.sourceLockId ? false : null,
      noPrimaryConclusion: null,
      nominationStatus: null,
      resultStatus: null,
      scoreEligible: false as const,
    };
    return { ...row, rowSha256: digest("dsa-seats:ct-final-primary-ballot-town:v1\0", row) };
  });
  const unsigned = {
    schema: "connecticut-final-primary-ballot-receipt-v1" as const,
    version: 1 as const,
    generatedAt: "2026-08-06T13:00:00.000Z" as const,
    sourceCutoff: "2026-08-06" as const,
    originalPublisher: "Connecticut Secretary of the State" as const,
    reviewerOnly: true as const,
    publicationEligible: false as const,
    review: { status: "proposed" as const, reviewer: null, reviewedAt: null, resolution: null },
    inputs: { sourceCatalog: { sourceLockId: catalogSource.id, fileSha256: CATALOG_SHA256, parentSourceCount: catalogSource.parentIds.length }, sourceSetSha256: digest("dsa-seats:ct-final-primary-ballot-source-set:v1\0", rawSources) },
    indexCoverage: catalog.indexes.map((source) => ({ cycleYear: source.cycleYear, sourceLockId: source.id, townRows: source.townRows, democraticBallotLinks: source.democraticBallotLinks, noDemocraticBallotLinkRows: source.townRows - source.democraticBallotLinks })),
    methodology: {
      scope: "complete_official_posted_democratic_primary_ballot_index_and_linked_ballot_corpus_for_2022_and_2024" as const,
      linkedBallotReview: "all_196_linked_democratic_ballots_reviewed_for_us_house_office_rows" as const,
      directTextReviewDocuments: 193 as const,
      ocrVisualReviewDocuments: 3 as const,
      indexBlankMeaning: "no_democratic_ballot_link_on_the_retained_official_index_only" as const,
      noAbsenceEscalation: true as const,
      statutoryEffectAssessed: false as const,
    },
    documents,
    townRows,
    summary: { indexSources: 2 as const, townCycleRows: 338 as const, linkedDemocraticBallots: 196 as const, noDemocraticBallotLinkRows: 142 as const, linkedBallotsWithHouseOfficeContest: 0 as const, directTextReviewDocuments: 193 as const, ocrVisualReviewDocuments: 3 as const, nominationConclusions: 0 as const, resultConclusions: 0 as const, scoreEligibleRows: 0 as const },
    limitations: [
      "A posted-ballot review establishes only whether a U.S. House office contest appears on the retained ballot bytes; it does not by itself establish why no contest appears.",
      "A blank Democratic cell on an official town index is retained as no linked ballot, not as proof of no candidate, no valid challenge, cancellation, uncontested nomination, withdrawal, death, or disqualification.",
      "The single 2022 text occurrence of Congressional District 1 is a ballot jurisdiction header, not a U.S. House office row.",
      "This receipt does not apply Connecticut statutes or establish a nominee, winner, certified result, evaluator value, approval, publication, or deployment state.",
    ] as const,
    unresolvedGates: ["independent_review_of_posted_ballot_corpus", "human_legal_review_of_statutory_effect", "join_reviewed_evidence_into_connecticut_primary_evidence_package_v3", "complete_human_review_and_publication_approval"] as const,
  };
  return {
    ...unsigned,
    documentSetSha256: digest("dsa-seats:ct-final-primary-ballot-document-set:v1\0", documents.map(({ documentId, rowSha256 }) => ({ documentId, rowSha256 }))),
    townRowSetSha256: digest("dsa-seats:ct-final-primary-ballot-town-set:v1\0", townRows.map(({ observationId, rowSha256 }) => ({ observationId, rowSha256 }))),
    packageSha256: digest("dsa-seats:ct-final-primary-ballot-package:v1\0", unsigned),
  };
}

export function buildConnecticutFinalPrimaryBallotReceipt(input: ConnecticutFinalPrimaryBallotReceiptInput) { return assemble(input); }
export function validateConnecticutFinalPrimaryBallotReceipt(value: ConnecticutFinalPrimaryBallotReceipt, input: ConnecticutFinalPrimaryBallotReceiptInput) {
  if (canonicalJson(value) !== canonicalJson(assemble(input))) fail("semantic_or_hash_drift");
  return value;
}
