import Link from "next/link";

import { candidacyLabel, contestStatusLabel, evidenceLabel, outcomeLabel } from "@/lib/outcome-ledger-view";
import type { SeatOutcomeRow } from "@/rapid-acquisition/seat-outcome-ledger";

/**
 * One line on a brief: the seat's 2026 stage and outcome with the evidence
 * it rests on, or the plain statement that nothing settling is retained yet.
 * The ledger row describes the pre-election holder; when the brief now
 * belongs to someone else, the line says whose outcome it is.
 */
export function outcomeNotes(row: SeatOutcomeRow): string[] {
  return [
    // "No filing observed" is a fact only where a filing source exists, which is the House.
    row.candidacy === "filed_for_other_office" || row.candidacy === "not_on_primary_ballot" ? `holder ${candidacyLabel(row.candidacy)}` : null,
    row.primary.status === "pending" || row.primary.status === "won" ? `primary ${contestStatusLabel(row.primary.status)}` : null,
    row.successorParty !== null && row.outcome === "unknown" ? `roster now names a ${row.successorParty} holder` : null,
  ].filter((note): note is string => note !== null);
}

export function OutcomeLine({ row, currentHolderId }: { row: SeatOutcomeRow | undefined; currentHolderId?: string }) {
  if (!row) return <p className="outcome-line">This seat is not in the 2026 outcome ledger.</p>;
  const whose = currentHolderId !== undefined && currentHolderId !== row.holderId ? ` For the pre-election holder ${row.holderName}:` : "";
  if (row.stage === "not_up_in_2026") return <p className="outcome-line"><strong>2026:</strong>{whose} {outcomeLabel(row.outcome)}; the seat is next contested in {row.nextElectionYear ?? "a later year"}.</p>;
  const notes = outcomeNotes(row);
  return (
    <p className="outcome-line">
      <strong>2026:</strong>{whose} {outcomeLabel(row.outcome)}
      {row.outcome !== "unknown" ? ` (${evidenceLabel(row.evidence)})` : ""}
      {notes.length > 0 ? ` · ${notes.join(" · ")}` : ""}
      {` · as of ${row.observedAt}`}. <Link href="/outcomes">How the index did</Link>
    </p>
  );
}
