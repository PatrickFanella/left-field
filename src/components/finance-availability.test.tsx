import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceAvailability } from "./finance-availability";
import type { FinanceAvailabilityViewModel, ProfilePageViewModel } from "@/ui/view-models";

const snapshot = { id: "snap_fec", sourceUrl: "https://www.fec.gov/files/bulk-downloads/2026/weball26.zip", sourceName: "FEC Candidate Summary 2026", retrievedAt: "2026-08-04T18:20:00.000Z" };
const availability = (status: FinanceAvailabilityViewModel["status"], reason: FinanceAvailabilityViewModel["missingByReason"][number]["reason"] | null): FinanceAvailabilityViewModel => ({
  releaseId: "release_1" as never,
  domain: "finance",
  scope: { kind: "funding", seatCycleId: "seat_1" as never, fundingKind: "summary" },
  status,
  expectedCount: 1,
  observedCount: status === "complete" ? 1 : 0,
  missingByReason: reason ? [{ reason, count: 1 }] : [],
  quarantinedCount: 0,
  incompatibleCount: 0,
  inputSnapshotIds: ["snap_fec" as never],
  evidence: [snapshot],
});
const missingCash = (reason: "not_reported" | "not_collected"): ProfilePageViewModel["headlineFacts"]["cashOnHand"] => ({ kind: "missing", reason, asOf: "2026-08-04", inputSnapshotIds: ["snap_fec" as never] });

describe("FinanceAvailability", () => {
  it("explains not reported without converting missing finance into zero or inactivity", () => {
    render(<FinanceAvailability cashOnHand={missingCash("not_reported")} availability={availability("unavailable", "not_reported")} aggregates={[]} />);
    expect(screen.getByRole("heading", { name: "Finance summary availability" })).toBeVisible();
    expect(screen.getByText("Cash-on-hand amount not reported in this release.")).toBeVisible();
    expect(screen.getByText(/approved source did not provide a usable reported cash-on-hand amount/)).toHaveTextContent("does not mean that no committee activity or filing exists");
    expect(screen.queryByText(/filing summary used for this record/i)).not.toBeInTheDocument();
    expect(screen.getByText(/approved source did not report a usable summary/)).toHaveTextContent("No amount is inferred as zero");
    expect(screen.getByRole("link", { name: /FEC Candidate Summary 2026 snapshot snap_fec/ })).toHaveAttribute("href", snapshot.sourceUrl);
    expect(screen.getByRole("link", { name: "See the sources behind this record" })).toHaveAttribute("href", "#source-closure");
    expect(screen.getByRole("link", { name: "Open the release-wide source ledger" })).toHaveAttribute("href", "/sources");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps not collected distinct and retains aggregate committee scope", () => {
    const aggregate = { id: "aggregate_1", asOf: "2026-08-04", coverageThrough: "2026-06-30", cashOnHand: { kind: "missing" as const, reason: "not_reported" as const }, receipts: { kind: "missing" as const, reason: "not_reported" as const }, disbursements: { kind: "missing" as const, reason: "not_reported" as const }, methodologyVersion: "v1", committeeInputs: [], includedCommitteeCount: 1, missingCommitteeCount: 2 };
    render(<FinanceAvailability cashOnHand={missingCash("not_collected")} availability={availability("not_collected", "not_collected")} aggregates={[aggregate as never]} />);
    expect(screen.getByText("Cash-on-hand amount not collected for this release.")).toBeVisible();
    expect(screen.getByText(/Aggregate totals shown below cover 1 included committee and 2 committees without a usable aggregate filing/)).toBeVisible();
    expect(screen.queryByText(/filing summary used for this record did not provide/)).not.toBeInTheDocument();
  });

  it("states complete coverage without claiming every amount is present", () => {
    const cash = { kind: "value" as const, value: 125, filingId: "filing_1" as never, committeeId: "committee_1" as never, coverageThrough: "2026-06-30", filedAt: "2026-07-15T00:00:00.000Z", inputSnapshotIds: ["snap_fec" as never] };
    render(<FinanceAvailability cashOnHand={cash} availability={availability("complete", null)} aggregates={[]} />);
    expect(screen.getByText("Summary coverage is complete for this seat in this release.")).toBeVisible();
    expect(screen.getByText(/does not mean every monetary field is reported/)).toHaveTextContent("never converts a missing field into zero");
  });

  it("fails closed when scoped availability is absent", () => {
    render(<FinanceAvailability cashOnHand={missingCash("not_reported")} availability={null} aggregates={[]} />);
    expect(screen.getByText(/Finance availability details are not published/)).toHaveTextContent("No value or zero is inferred");
    expect(screen.queryByText(/Published source for this availability statement/)).not.toBeInTheDocument();
  });
});
