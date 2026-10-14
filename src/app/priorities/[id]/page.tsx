import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, fmtCount, fmtDate, fmtMoney } from "@/components/presentational";
import { formatPartisanMargin } from "@/lib/house-priority-index";
import { getDefaultPriorityRepository } from "@/lib/priority-index-store";
import { measuredInputs, priorityStandings } from "@/lib/priority-index-view";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = getDefaultPriorityRepository().getBrief((await params).id);
  return row
    ? pageMetadata(`/priorities/${encodeURIComponent(row.seatCycleId)}`, `${row.districtLabel} · ${row.officialHouseName}`, row.scoreSummary)
    : { title: "Brief not found", robots: { index: false, follow: false } };
}

export default async function PriorityBrief({ params }: Props) {
  const repo = getDefaultPriorityRepository();
  const model = repo.getModelRelease();
  const briefs = repo.getBriefs();
  const row = repo.getBrief((await params).id);
  if (!row) notFound();
  const standing = priorityStandings(briefs).get(row.seatCycleId)!;
  const inputs = measuredInputs(row);
  const stateOffice = row.chamber === "governor" || row.chamber === "state_house" || row.chamber === "state_senate";
  return (
    <Shell>
      <main id="content" className="page priority-detail">
        <Link className="back-link" href="/">
          ← Priority Index
        </Link>
        <header className="brief-hero">
          <div>
            <p className="eyebrow">
              {row.districtLabel}{row.openSeatSignal ? " · OPEN SEAT" : ""} · MODEL {model.version} · {inputs} {inputs === 1 ? "INPUT" : "INPUTS"} MEASURED
            </p>
            <h1>{row.officialHouseName}</h1>
            <p className="lede">{row.scoreSummary}</p>
          </div>
          <div className="score-seal">
            <span>Priority score</span>
            <strong>{row.provisionalTargetScore.toFixed(1)}</strong>
            <b>#{fmtCount(standing.rank)} of {fmtCount(briefs.length)}</b>
            {standing.tiedWith > 1 && <small>Tie of {fmtCount(standing.tiedWith)}</small>}
          </div>
        </header>

        <section className="brief-columns">
          <article>
            <p className="eyebrow">THE MEMBER</p>
            <h2>Record</h2>
            <p>{row.personSummary}</p>
            <dl className="brief-facts">
              <dt>{row.chamber === "governor" ? "Term start" : row.chamber === "state_house" || row.chamber === "state_senate" ? "Baseline election" : `First ${row.chamber === "senate" ? "Senate" : "House"} service`}</dt>
              <dd>{fmtDate(row.firstHouseServiceDate)}</dd>
              <dt>{row.chamber === "house" ? "District changes" : "Next election"}</dt>
              <dd>{row.chamber === "house" ? row.districtChangeCount : row.nextElectionYear}</dd>
              <dt>Alignment gap</dt>
              <dd>
                {row.scoreDrivers.find((driver) => driver.key === "incumbent_alignment_gap")?.score?.toFixed(1) ?? "Not in this score"}
              </dd>
              <dt>{stateOffice ? "Open States record" : "Bioguide record"}</dt>
              <dd><code>{row.bioguideId}</code></dd>
            </dl>
          </article>
          <article>
            <p className="eyebrow">{row.chamber === "house" || row.chamber === "state_house" || row.chamber === "state_senate" ? "THE DISTRICT" : "THE STATE"}</p>
            <h2>{row.districtLabel}</h2>
            <p>{row.districtSummary}</p>
            <dl className="brief-facts">
              <dt>{row.chamber === "state_house" || row.chamber === "state_senate" ? "Own-race margin" : "2024 presidential margin"}</dt>
              <dd>{formatPartisanMargin(row.presidentialDemocraticMargin2024)}</dd>
              <dt>Cash on hand</dt>
              <dd>
                {row.incumbentCashOnHand === null
                  ? "Not reported"
                  : fmtMoney(row.incumbentCashOnHand)}
              </dd>
              <dt>Receipts / disbursements</dt>
              <dd>{row.incumbentReceipts === null ? "Not reported" : fmtMoney(row.incumbentReceipts)} / {row.incumbentDisbursements === null ? "Not reported" : fmtMoney(row.incumbentDisbursements)}</dd>
              <dt>Finance through</dt>
              <dd>{row.financeCoverageThrough ? fmtDate(row.financeCoverageThrough) : "Not reported"}</dd>
              <dt>Route</dt>
              <dd>
                {row.qualifyingRoute === "deep_blue"
                  ? "Deep blue"
                  : row.qualifyingRoute === "aipac_supported_blue"
                    ? "AIPAC-supported blue"
                    : row.qualifyingRoute === "democratic_incumbent_primary"
                      ? "Democratic incumbent route"
                      : "Republican-held flip screen"}
              </dd>
              <dt>Baseline score</dt>
              <dd>{row.baselineTargetScore.toFixed(1)}</dd>
            </dl>
          </article>
        </section>

        <section className="score-anatomy" style={{ "--drivers": row.scoreDrivers.length } as CSSProperties}>
          <div className="section-intro">
            <p className="eyebrow">SCORE ANATOMY</p>
            <h2>What makes the score</h2>
          </div>
          {row.scoreDrivers.map((driver) => (
            <article key={driver.key}>
              <div>
                <h3>{driver.label}</h3>
                {driver.score !== null && <strong>{driver.score.toFixed(1)}</strong>}
              </div>
              {driver.score === null ? (
                <p className="driver-absent">Not in this score</p>
              ) : (
                <div className="driver-track">
                  <i style={{ width: `${driver.score}%` }} />
                </div>
              )}
              <p>{driver.explanation}</p>
            </article>
          ))}
        </section>

        <section className="record-section">
          <p className="eyebrow">{row.chamber === "senate" ? "SENATE TERM" : row.chamber === "governor" ? "GUBERNATORIAL TERM" : row.chamber === "state_house" || row.chamber === "state_senate" ? "CURRENT TERM" : "HOUSE HISTORY"}</p>
          <h2>Recorded service</h2>
          <div className="service-timeline">
            {row.serviceHistory.map((term) => (
              <div key={`${term.stateCode}-${term.district}-${term.start}`}>
                <span>
                  {term.start.slice(0, 4)}–
                  {term.currentAtCutoff ? "now" : term.end.slice(0, 4)}
                </span>
                <strong>
                  {term.stateCode}-{typeof term.district === "number" ? String(term.district).padStart(2, "0") : term.district}
                </strong>
                <small>
                  {term.currentAtCutoff
                    ? "Current at source cutoff"
                    : "Completed term"}
                </small>
              </div>
            ))}
          </div>
        </section>

        <section className="brief-method">
          <p>
            <strong>Formula</strong> {row.formula}
          </p>
          <p>
            Source cutoff {fmtDate(model.cutoffDate)} ·{" "}
            <Link href="/methodology">How the score is built</Link> ·{" "}
            <Link href="/sources">Source ledger</Link>
            {(row.chamber === "house" || row.chamber === "senate") && (
              <>
                {" "}·{" "}
                <Link prefetch={false} href={`/seats/${row.seatCycleId}`}>
                  Factual seat record
                </Link>
              </>
            )}
          </p>
        </section>
      </main>
    </Shell>
  );
}
