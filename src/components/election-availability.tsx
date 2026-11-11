import type { ElectionDecisionViewModel } from "@/ui/view-models";
import { Status, fmtDate } from "./presentational";

export function ElectionAvailability({ decisions, jurisdictionCode }: { decisions: readonly ElectionDecisionViewModel[]; jurisdictionCode: string }) {
  return <section className="record-section" aria-labelledby="election-availability-heading">
    <h2 id="election-availability-heading">Why election information may be unavailable</h2>
    <p className="muted">These are availability statements for {jurisdictionCode} in the named election year. They apply across this release&apos;s profiles in that jurisdiction; they are not findings about this seat, its current holder, a candidate, or whether a contest was uncontested.</p>
    {decisions.length === 0 ? <p className="empty-copy">Availability details are not published for this release.</p> : decisions.map((decision) => <ElectionAvailabilityRecord decision={decision} key={`${decision.jurisdictionCode}-${decision.electionYear}`} />)}
  </section>;
}

function ElectionAvailabilityRecord({ decision }: { decision: ElectionDecisionViewModel }) {
  const coherent = decision.coverage?.scope.kind === "election"
    && decision.coverage.scope.jurisdictionCode === decision.jurisdictionCode
    && decision.coverage.scope.electionYear === decision.electionYear;
  const explanation = coherent ? explanationFor(decision) : null;

  return <article className="contest" aria-labelledby={`election-availability-${decision.electionYear}`}>
    <h3 id={`election-availability-${decision.electionYear}`}>{decision.electionYear} election data for {decision.jurisdictionCode}</h3>
    {explanation ? <>
      <p><Status>{decision.status}</Status> <strong>{explanation.heading}</strong> {explanation.detail}</p>
      <p className="lineage"><span>{decision.coverage!.observedCount} observed / {decision.coverage!.expectedCount} expected</span><span>{decision.coverage!.missingByReason.length === 0 ? "Nothing recorded as missing" : decision.coverage!.missingByReason.map(({ reason, count }) => `${count} ${reason.replace(/_/g, " ")}`).join(", ")}</span></p>
    </> : <p className="empty-copy">Availability details are not published for this release.</p>}
    {explanation && decision.evidence.length > 0 && <p>Published evidence for this release: {decision.evidence.map((item, index) => <span key={item.id}>{index > 0 && ", "}<a href={item.sourceUrl}>{item.sourceName} snapshot {item.id}</a> <small>retrieved {fmtDate(item.retrievedAt)}</small></span>)}</p>}
    <p><a href="/sources">Open the release source ledger</a>.</p>
  </article>;
}

function explanationFor(decision: ElectionDecisionViewModel): { heading: string; detail: string } | null {
  const coverage = decision.coverage;
  if (!coverage) return null;
  if (decision.status === "unassessed" && coverage.status === "not_collected" && coverage.missingByReason.some(({ reason }) => reason === "not_collected")) return {
    heading: "Not collected for this release.",
    detail: "The release did not collect or assess the required source data for this jurisdiction and year. This does not mean records do not exist.",
  };
  if (decision.status === "unavailable" && coverage.status === "unavailable" && coverage.missingByReason.some(({ reason }) => reason === "not_defensibly_modeled")) return {
    heading: "Not defensibly modeled.",
    detail: "The release does not publish a result because the available inputs could not support a defensible model. No value, winner, margin, zero, or uncontested status is inferred.",
  };
  if (decision.status === "approved" && coverage.status === "complete" && coverage.missingByReason.length === 0) return {
    heading: "Available in this release.",
    detail: "The published election records below contain the release-scoped result. Certification is stated separately on each election record.",
  };
  return null;
}
