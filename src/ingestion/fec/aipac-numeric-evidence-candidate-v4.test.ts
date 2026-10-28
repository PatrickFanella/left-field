import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAipacNumericEvidenceCandidateV4FromFiles, validateAipacNumericEvidenceCandidateV4 } from "./aipac-numeric-evidence-candidate-v4";

const retained = () => validateAipacNumericEvidenceCandidateV4(JSON.parse(readFileSync("data/metadata/aipac-numeric-evidence-candidate-v4.json", "utf8")));
const paths = () => {
  const source = process.env.DSA_SEATS_AIPAC_PAS2_DIR ?? "/tmp/dsa-aipac-evidence-20260804";
  return {
    closure: resolve("data/metadata/aipac-evidence-closure-proposal-v1.json"),
    foundation: resolve("data/metadata/aipac-evidence-foundation-candidate-v4.json"),
    projection: resolve("data/metadata/dsa-target-factual-projection-20260804-v1.json"),
    roster: resolve("data/metadata/dsa-target-incumbent-roster-20260804-v1.json"),
    sourceReceipts: resolve("data/metadata/aipac-source-receipts-v1.json"),
    pas2ZipByCycle: { 2022: resolve(source, "pas222.zip"), 2024: resolve(source, "pas224.zip"), 2026: resolve(source, "pas226.zip") },
  };
};

describe("AIPAC numeric evidence v4 retained artifact", () => {
  it("closes both CA-31 2024 channels without changing N/A semantics", () => {
    const value = retained();
    const ca = value.seats.find(row => row.seatCycleId === "seat_house_ca_31_current")!;
    const ma = value.seats.find(row => row.seatCycleId === "seat_house_ma_06_current")!;
    expect(ca).toMatchObject({ status: "complete", incumbentCandidateId: "H8CA39174" });
    expect(ca.coverage.filter(row => row.cycleYear === 2024).every(row => row.disposition.startsWith("complete_"))).toBe(true);
    expect(value.summary).toMatchObject({ completeSeats: 212, partiallyBlockedPendingSeats: 0, blockedCoverageCells: 0, notApplicableCoverageCells: 4 });
    expect(ma.coverage.filter(row => row.disposition === "not_applicable_no_house_candidacy")).toHaveLength(2);

    // PAS2 archives are deliberately external. Validate the retained package on
    // every run; also compare a raw rebuild when supplied. An explicit directory
    // must be complete: missing or changed archives fail in the builder.
    const inputs = paths();
    if (process.env.DSA_SEATS_AIPAC_PAS2_DIR !== undefined || Object.values(inputs.pas2ZipByCycle).every(path => existsSync(path))) {
      expect(buildAipacNumericEvidenceCandidateV4FromFiles(inputs)).toEqual(value);
    }
  });

  it("rejects one-channel completion tampering", () => {
    const value = retained();
    const ca = value.seats.find(row => row.seatCycleId === "seat_house_ca_31_current")!;
    ca.coverage.find(row => row.cycleYear === 2024)!.disposition = "blocked_pending_mapping";
    expect(() => validateAipacNumericEvidenceCandidateV4(value)).toThrow();
  });
});
