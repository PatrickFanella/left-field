import type { CoverageRecord } from "@/domain/contracts";
import type { FinanceAggregateViewModel, FinanceAvailabilityViewModel, ProfilePageViewModel } from "@/ui/view-models";
import { Status, fmtDate } from "./presentational";

type CashOnHand = ProfilePageViewModel["headlineFacts"]["cashOnHand"];
type CoverageReason = CoverageRecord["missingByReason"][number]["reason"];

export function FinanceAvailability({ cashOnHand, availability, aggregates }: { cashOnHand: CashOnHand; availability: FinanceAvailabilityViewModel | null; aggregates: readonly FinanceAggregateViewModel[] }) {
  const missingCash = cashOnHand.kind === "missing" ? cashExplanation(cashOnHand.reason) : null;
  const includedCommittees = aggregates.reduce((sum, item) => sum + item.includedCommitteeCount, 0);
  const missingCommittees = aggregates.reduce((sum, item) => sum + item.missingCommitteeCount, 0);

  return <section className="finance-availability" aria-labelledby="finance-availability-heading">
    <h3 id="finance-availability-heading">Finance summary availability</h3>
    <p className="muted">This statement covers the release-scoped FEC candidate summary associated with this seat. It is not a live balance, a finding about filing compliance, or a statement about AIPAC or other outside spending.</p>
    {missingCash && <p><strong>{missingCash.heading}</strong> {missingCash.detail}</p>}
    {availability ? <>
      <p><Status>{availability.status}</Status> <strong>{coverageHeading(availability.status)}</strong> {coverageDetail(availability.status)}</p>
      <p className="lineage"><span>{availability.observedCount} observed / {availability.expectedCount} expected</span><span>{availability.quarantinedCount} quarantined / {availability.incompatibleCount} incompatible</span></p>
      {availability.missingByReason.length > 0 && <ul>{availability.missingByReason.map(({ reason, count }) => <li key={reason}><strong>{count} {reason.replace(/_/g, " ")}:</strong> {REASON_DETAILS[reason]}</li>)}</ul>}
      {missingCash && aggregates.length > 0 && <p>Aggregate totals shown below cover {includedCommittees} included {includedCommittees === 1 ? "committee" : "committees"} and {missingCommittees} {missingCommittees === 1 ? "committee" : "committees"} without a usable aggregate filing. They do not replace the missing summary field.</p>}
      {availability.evidence.length > 0 && <p>Published source for this availability statement: {availability.evidence.map((item, index) => <span key={item.id}>{index > 0 && ", "}<a href={item.sourceUrl}>{item.sourceName} snapshot {item.id}</a> <small>retrieved {fmtDate(item.retrievedAt)}</small></span>)}</p>}
    </> : <p className="empty-copy">Finance availability details are not published for this release. No value or zero is inferred.</p>}
    <p><a href="#source-closure">See the sources behind this record</a> · <a href="/sources">Open the release-wide source ledger</a>.</p>
  </section>;
}

function cashExplanation(reason: string): { heading: string; detail: string } {
  if (reason === "not_reported") return { heading: "Cash-on-hand amount not reported in this release.", detail: "The approved source did not provide a usable reported cash-on-hand amount for this seat's finance-summary scope at the release cutoff. This is not a zero balance, and it does not mean that no committee activity or filing exists." };
  if (reason === "not_collected") return { heading: "Cash-on-hand amount not collected for this release.", detail: "The release did not collect or assess the required summary field. This does not mean the amount is zero or that no filing exists." };
  return { heading: `Cash-on-hand amount unavailable — ${reason.replace(/_/g, " ")}.`, detail: "The release keeps the stated reason and does not infer a value or a zero." };
}

function coverageHeading(status: FinanceAvailabilityViewModel["status"]): string {
  if (status === "complete") return "Summary coverage is complete for this seat in this release.";
  if (status === "partial") return "Summary coverage is partial for this seat in this release.";
  if (status === "not_collected") return "Summary coverage was not collected for this seat in this release.";
  return "Summary coverage is unavailable for this seat in this release.";
}

function coverageDetail(status: FinanceAvailabilityViewModel["status"]): string {
  if (status === "complete") return "Complete coverage does not mean every monetary field is reported and never converts a missing field into zero.";
  if (status === "partial") return "Only observed facts are displayed; omitted values are not zero.";
  if (status === "not_collected") return "This does not mean a report, committee, or financial activity does not exist.";
  return "The exact reason is retained below; no balance, activity, committee, or filing outcome is inferred.";
}

const REASON_DETAILS: Record<CoverageReason, string> = {
  not_collected: "The release did not collect or assess the expected summary. This is not evidence that a filing does not exist.",
  not_reported: "The approved source did not report a usable summary for this seat's mapped finance scope at the release cutoff. No amount is inferred as zero.",
  not_yet_reported: "The expected summary had not been reported by the source at the release cutoff. Later reporting is outside this immutable release.",
  suppressed: "The source withheld the expected value. The release does not reconstruct or estimate it.",
  unmatched: "The release could not defensibly match the source record to this seat's finance scope. No exact identity relationship is inferred.",
  source_unavailable: "The required source was unavailable for this release. This is not evidence that a filing or activity does not exist.",
  license_unavailable: "The release could not publish the expected source under its reuse boundary. This is not evidence that the underlying value is absent.",
  not_defensibly_modeled: "Available inputs could not support a defensible value. No amount, balance, or zero is inferred.",
};
