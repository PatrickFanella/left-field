import Link from "next/link";

import { CHAMBER_ORDER, coverageTable, evidenceLabel, filterOutcomeRows, outcomeLabel } from "@/lib/outcome-ledger-view";
import { paginate } from "@/lib/priority-index-view";
import type { SeatOutcomeLedger, SeatOutcomeRow } from "@/rapid-acquisition/seat-outcome-ledger";
import { OUTCOMES, type Outcome } from "@/rapid-acquisition/seat-outcome-resolver";

import { outcomeNotes } from "./outcome-line";
import { fmtCount, fmtDate, words } from "./presentational";

/**
 * The 2026 outcomes page body. Pure: it renders the ledger it is given, so
 * the test can hand it a fixture in which every outcome occurs. Unknown
 * counts come first in every table because they are the honest headline.
 */
const CHAMBER_LABELS: Readonly<Record<string, string>> = { house: "House", senate: "Senate", governor: "Governors", state_house: "State House", state_senate: "State Senate / unicameral / DC Council" };
const ROUTE_LABELS: Readonly<Record<string, string>> = { deep_blue: "Deep blue", aipac_supported_blue: "AIPAC-supported blue", democratic_incumbent_primary: "Democratic incumbent", republican_fringe_general: "Republican-held flip" };
/** Unknown first, then the rest in resolution order. */
const DISPLAY_OUTCOMES: readonly Outcome[] = ["unknown", ...OUTCOMES.filter((outcome) => outcome !== "unknown" && outcome !== "not_up_in_2026")];

export type OutcomesParams = Readonly<Record<string, string | string[] | undefined>>;
const value = (input: string | string[] | undefined): string => typeof input === "string" ? input : "";

export function OutcomesView({ ledger, params, modelVersion, publishedAt }: { ledger: SeatOutcomeLedger; params: OutcomesParams; modelVersion: string; publishedAt: string }) {
  const filters = { chamber: value(params.chamber), route: value(params.route), outcome: value(params.outcome), state: value(params.state), query: value(params.q).trim() };
  const upRows = ledger.rows.filter((row) => row.stage === "up_in_2026");
  const filtered = filterOutcomeRows(ledger.rows, filters);
  const view = paginate(filtered, value(params.page));
  const states = [...new Set(upRows.map((row) => row.stateCode))].sort();
  const coverage = coverageTable(ledger);
  const settled = upRows.length - ledger.summary.byOutcome.unknown;
  const pageHref = (page: number): string => {
    const next = new URLSearchParams();
    for (const [key, entry] of [["q", filters.query], ["state", filters.state], ["chamber", filters.chamber], ["route", filters.route], ["outcome", filters.outcome]] as const) if (entry) next.set(key, entry);
    if (page > 1) next.set("page", String(page));
    const search = next.toString();
    return search ? `/outcomes?${search}` : "/outcomes";
  };
  const chambersWithRoutes = CHAMBER_ORDER.filter((chamber) => ledger.comparison.byChamberRoute.some((cell) => cell.chamber === chamber));

  return (
    <main id="content" className="page outcomes-page">
      <header className="priority-hero">
        <div>
          <p className="eyebrow">{`2026 OUTCOMES · PRE-ELECTION MODEL ${modelVersion} FROZEN ${fmtDate(publishedAt)} · EVIDENCE AS OF ${fmtDate(ledger.observedAt)}`}</p>
          <h1>How the index did in 2026</h1>
          <p className="lede">
            The Priority Index as it stood on election day, seat by seat, beside what the retained evidence now says happened. {fmtCount(upRows.length)} of the {fmtCount(ledger.rows.length)} seats were on the 2026 ballot. {fmtCount(ledger.summary.byOutcome.unknown)} of those have no settling evidence yet; {fmtCount(settled)} are settled, each by a source-marked winner, a certified count or a roster change, never by inference.
          </p>
          <p className="hero-note">A primary loss is its own outcome, settled months before the general. Unofficial counts and runoff-bound first rounds stay pending. <Link href="/methodology#outcomes">How outcomes are resolved</Link></p>
        </div>
        <div className="index-mark">
          <strong>{fmtCount(ledger.summary.byOutcome.unknown)}</strong>
          <span>seats without retained evidence</span>
          <b>{fmtCount(settled)}</b>
          <span>settled</span>
        </div>
      </header>

      <section className="record-section">
        <div className="section-heading-pair"><div><p className="eyebrow">COVERAGE</p><h2>Which seats carry a score</h2></div><p>Every seat of the frozen release, scored or not. An unscored seat names why; nothing is imputed.</p></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scroll horizontally to view all columns of the coverage table">
          <table aria-label="Coverage by chamber">
            <thead><tr><th scope="col">Chamber</th><th scope="col">Seats</th><th scope="col">Scored</th><th scope="col">Unscored, by reason</th></tr></thead>
            <tbody>
              {coverage.map((row) => (
                <tr key={row.chamber}>
                  <th scope="row">{CHAMBER_LABELS[row.chamber]}</th>
                  <td>{fmtCount(row.seats)}</td>
                  <td>{fmtCount(row.scored)}</td>
                  <td>{row.unscored.length === 0 ? "—" : row.unscored.map((reason) => <span key={reason.reason}>{words(reason.reason)}: {fmtCount(reason.count)}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="record-section">
        <div className="section-heading-pair"><div><p className="eyebrow">OUTCOMES</p><h2>What happened, by chamber</h2></div><p>Seats on the 2026 ballot only. The first column is what is not yet known.</p></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scroll horizontally to view all columns of the outcomes table">
          <table aria-label="Outcomes by chamber">
            <thead><tr><th scope="col">Chamber</th>{DISPLAY_OUTCOMES.map((outcome) => <th scope="col" key={outcome}>{outcomeLabel(outcome)}</th>)}</tr></thead>
            <tbody>
              {CHAMBER_ORDER.map((chamber) => (
                <tr key={chamber}>
                  <th scope="row">{CHAMBER_LABELS[chamber]}</th>
                  {DISPLAY_OUTCOMES.map((outcome) => <td key={outcome}>{fmtCount(ledger.summary.byChamber[chamber][outcome])}</td>)}
                </tr>
              ))}
              <tr>
                <th scope="row">All</th>
                {DISPLAY_OUTCOMES.map((outcome) => <td key={outcome}><strong>{fmtCount(ledger.summary.byOutcome[outcome])}</strong></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="record-section">
        <div className="section-heading-pair"><div><p className="eyebrow">COMPARISON</p><h2>Outcomes by pre-election score band</h2></div><p>For each chamber and route, how the seats the index scored 70 and above, 50 to 69.9, and under 50 fared. Read the unknown column first: a band with mostly unknown seats says nothing yet.</p></div>
        {chambersWithRoutes.map((chamber) => (
          <div className="table-wrap" tabIndex={0} role="region" aria-label={`Scroll horizontally to view all columns of the ${CHAMBER_LABELS[chamber]} score band table`} key={chamber}>
            <table aria-label={`${CHAMBER_LABELS[chamber]} outcomes by score band and route`}>
              <caption>{CHAMBER_LABELS[chamber]}</caption>
              <thead><tr><th scope="col">Route</th><th scope="col">Score band</th>{DISPLAY_OUTCOMES.map((outcome) => <th scope="col" key={outcome}>{outcomeLabel(outcome)}</th>)}</tr></thead>
              <tbody>
                {ledger.comparison.byChamberRoute.filter((cell) => cell.chamber === chamber).map((cell) => (
                  <tr key={`${cell.route}-${cell.band}`}>
                    <th scope="row">{ROUTE_LABELS[cell.route] ?? cell.route}</th>
                    <td>{cell.band}</td>
                    {DISPLAY_OUTCOMES.map((outcome) => <td key={outcome}>{fmtCount(cell.counts[outcome])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scroll horizontally to view all columns of the rank quartile table">
          <table aria-label="Outcomes by cross-chamber rank quartile">
            <caption>All scored seats by pre-election rank quartile (1 is the top quarter)</caption>
            <thead><tr><th scope="col">Quartile</th>{DISPLAY_OUTCOMES.map((outcome) => <th scope="col" key={outcome}>{outcomeLabel(outcome)}</th>)}</tr></thead>
            <tbody>
              {ledger.comparison.byRankQuartile.map((cell) => (
                <tr key={cell.quartile}><th scope="row">{cell.quartile}</th>{DISPLAY_OUTCOMES.map((outcome) => <td key={outcome}>{fmtCount(cell.counts[outcome])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="record-section">
        <div className="section-heading-pair"><div><p className="eyebrow">SEATS</p><h2>Every seat on the 2026 ballot</h2></div><p>In pre-election rank order. Each row links to the seat&apos;s brief.</p></div>
        <form className="priority-filters" method="get" action="/outcomes">
          <label>Search<input name="q" defaultValue={filters.query} placeholder="Seat or holder" /></label>
          <label>State<select name="state" defaultValue={filters.state}><option value="">All states</option>{states.map((code) => <option key={code}>{code}</option>)}</select></label>
          <label>Chamber<select name="chamber" defaultValue={filters.chamber}><option value="">All chambers</option>{CHAMBER_ORDER.map((chamber) => <option key={chamber} value={chamber}>{CHAMBER_LABELS[chamber]}</option>)}</select></label>
          <label>Route<select name="route" defaultValue={filters.route}><option value="">All routes</option>{Object.entries(ROUTE_LABELS).map(([route, label]) => <option key={route} value={route}>{label}</option>)}</select></label>
          <label>Outcome<select name="outcome" defaultValue={filters.outcome}><option value="">All outcomes</option>{DISPLAY_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{outcomeLabel(outcome)}</option>)}</select></label>
          <button>Apply</button>
        </form>
        {filtered.length === 0 ? (
          <section className="empty-state"><h3>No seats on the 2026 ballot match these filters.</h3><Link href="/outcomes">Reset the list</Link></section>
        ) : (
          <>
            <ol className="outcome-list" aria-label="Seats on the 2026 ballot">
              {view.rows.map((row) => <OutcomeRow key={row.seatId} row={row} />)}
            </ol>
            <nav className="pagination" aria-label="Outcome list pages">
              {view.page > 1 ? <Link className="button" href={pageHref(view.page - 1)} rel="prev">← Previous 50</Link> : <span />}
              <p>Seats {fmtCount(view.first)}–{fmtCount(view.last)} of {fmtCount(filtered.length)} · page {fmtCount(view.page)} of {fmtCount(view.pageCount)}</p>
              {view.page < view.pageCount ? <Link className="button" href={pageHref(view.page + 1)} rel="next">Next 50 →</Link> : <span />}
            </nav>
          </>
        )}
      </section>
    </main>
  );
}

function OutcomeRow({ row }: { row: SeatOutcomeRow }) {
  const notes = outcomeNotes(row);
  return (
    <li className={`outcome-entry outcome-${row.outcome}`}>
      <div className="rank-lockup">
        <span>{row.rank === null ? "unranked" : `#${fmtCount(row.rank)}`}</span>
        <strong>{row.score === null ? "—" : row.score.toFixed(1)}</strong>
      </div>
      <div>
        <h3><Link href={`/priorities/${encodeURIComponent(row.seatId)}`}>{row.seatLabel} · {row.holderName}</Link></h3>
        <p>{row.holderParty} · {CHAMBER_LABELS[row.chamber]}{row.route ? ` · ${ROUTE_LABELS[row.route] ?? row.route}` : " · unscored"}</p>
      </div>
      <div className="outcome-cell">
        <span className={`status status-${row.outcome.replace(/_/g, "-")}`}>{outcomeLabel(row.outcome)}</span>
        <small>{row.outcome === "unknown" ? evidenceLabel("none") : evidenceLabel(row.evidence)}{notes.length > 0 ? ` · ${notes.join(" · ")}` : ""}</small>
      </div>
    </li>
  );
}
