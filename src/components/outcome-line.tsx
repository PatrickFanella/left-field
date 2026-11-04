import Link from "next/link";

import { candidacyLabel, contestStatusLabel, evidenceLabel, outcomeLabel } from "@/lib/outcome-ledger-view";
import type { SeatOutcomeRow } from "@/rapid-acquisition/seat-outcome-ledger";

/**
 * One line on a brief: the seat's 2026 stage and outcome with the evidence
 * it rests on, or the plain statement that nothing settling is retained yet.
 */
export function OutcomeLine({ row }: { row: SeatOutcomeRow | undefined }) {
  if (!row) return <p className="outcome-line">This seat is not in the 2026 outcome ledger.</p>;
  if (row.stage === "not_up_in_2026") return <p className="outcome-line"><strong>2026:</strong> {outcomeLabel(row.outcome)}; the seat is next contested in {row.nextElectionYear ?? "a later year"}.</p>;
  const notes = [
    row.candidacy !== "filed_for_seat" && row.candidacy !== "not_applicable" ? `holder ${candidacyLabel(row.candidacy)}` : null,
    row.primary.status === "pending" || row.primary.status === "won" ? `primary ${contestStatusLabel(row.primary.status)}` : null,
    row.successorParty !== null && row.outcome === "unknown" ? `roster now names a ${row.successorParty} holder` : null,
  ].filter((note): note is string => note !== null);
  return (
    <p className="outcome-line">
      <strong>2026:</strong> {outcomeLabel(row.outcome)}
      {row.outcome !== "unknown" ? ` (${evidenceLabel(row.evidence)})` : ""}
      {notes.length > 0 ? ` · ${notes.join(" · ")}` : ""}
      {` · as of ${row.observedAt}`}. <Link href="/outcomes">How the index did</Link>
    </p>
  );
}
