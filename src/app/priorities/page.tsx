import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { Shell, fmtCount, fmtDate } from "@/components/presentational";
import { formatPartisanMargin } from "@/lib/house-priority-index";
import { getDefaultPriorityRepository } from "@/lib/priority-index-store";
import { DEFAULT_MINIMUM_INPUTS, measuredInputs, paginate, parseMinimumInputs, priorityStandings } from "@/lib/priority-index-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata("/", "Election seat research", "Ranked research profiles for U.S. House and Senate seats, governorships, and state-legislative seats, with the evidence behind each score.");
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const value = (input: string | string[] | undefined): string =>
  typeof input === "string" ? input : "";
const routeLabel = (route: string): string =>
  route === "deep_blue" ? "Deep blue" : route === "aipac_supported_blue" ? "AIPAC-supported blue" : route === "democratic_incumbent_primary" ? "Democratic incumbent" : "Republican-held flip";

const isStateChamber = (chamber: string): boolean => chamber === "state_house" || chamber === "state_senate";

export default async function Priorities({ searchParams }: Props) {
  const repo = getDefaultPriorityRepository();
  const briefs = repo.getBriefs();
  const model = repo.getModelRelease();
  const standings = priorityStandings(briefs);
  const params = await searchParams;
  const query = value(params.q).trim().toLocaleLowerCase("en-US"),
    state = value(params.state),
    route = value(params.route),
    chamber = value(params.chamber),
    cycle = value(params.cycle),
    evidence = value(params.evidence),
    minimumInputs = parseMinimumInputs(evidence);
  const states = [...new Set(briefs.map((row) => row.stateCode))].sort();
  const cycles = [...new Set(briefs.map((row) => row.nextElectionYear))].sort();
  const matching = briefs.filter(
    (row) =>
      (!query ||
        `${row.districtLabel} ${row.incumbentName} ${row.officialHouseName}`
          .toLocaleLowerCase("en-US")
          .includes(query)) &&
      (!state || row.stateCode === state) &&
      (!route || row.qualifyingRoute === route) &&
      (!chamber || row.chamber === chamber) &&
      (!cycle || String(row.nextElectionYear) === cycle),
  );
  const filtered = matching.filter((row) => measuredInputs(row) >= minimumInputs);
  const view = paginate(filtered, value(params.page));
  const pageHref = (page: number): string => {
    const next = new URLSearchParams();
    for (const [key, entry] of [["q", value(params.q).trim()], ["state", state], ["chamber", chamber], ["cycle", cycle], ["route", route], ["evidence", evidence]] as const) if (entry) next.set(key, entry);
    if (page > 1) next.set("page", String(page));
    const search = next.toString();
    return search ? `/?${search}` : "/";
  };
  const anyEvidenceHref = (() => {
    const next = new URLSearchParams(pageHref(1).slice(2));
    next.set("evidence", "any");
    return `/?${next.toString()}`;
  })();

  const houseSeats = briefs.filter((row) => row.chamber === "house").length;
  const senateSeats = briefs.filter((row) => row.chamber === "senate").length;
  const governorSeats = briefs.filter((row) => row.chamber === "governor").length;
  const stateRows = briefs.filter((row) => isStateChamber(row.chamber));
  const stateCount = new Set(stateRows.filter((row) => row.stateCode !== "DC").map((row) => row.stateCode)).size;
  const defaultViewSeats = briefs.filter((row) => measuredInputs(row) >= DEFAULT_MINIMUM_INPUTS).length;
  const singleInputSeats = briefs.filter((row) => measuredInputs(row) === 1).length;

  const topScore = filtered[0]?.provisionalTargetScore.toFixed(1);
  const lowScore = filtered.at(-1)?.provisionalTargetScore.toFixed(1);
  const threeOrMoreInputs = filtered.filter((row) => measuredInputs(row) >= 3).length;
  const republicanHeld = filtered.filter((row) => row.incumbentParty === "Republican").length;
  return (
    <Shell>
      <main id="content" className="page priorities-page">
        <header className="priority-hero">
          <div>
            <p className="eyebrow">{`PRIORITY INDEX · MODEL ${model.version} · PUBLISHED ${fmtDate(model.publishedAt)} · HOUSE SOURCE CUTOFF ${fmtDate(model.cutoffDate)}`}</p>
            <h1>Where the field bends.</h1>
            <p className="lede">
              {fmtCount(houseSeats)} House seats, {fmtCount(senateSeats)} Senate seats, {fmtCount(governorSeats)} governorships{stateRows.length > 0 ? `, and ${fmtCount(stateRows.length)} state-legislative seats in ${stateCount} ${stateCount === 1 ? "state" : "states"}${stateRows.some((row) => row.stateCode === "DC") ? " and DC" : ""}` : ""}, ordered
              by how much reason the retained evidence gives to investigate
              each one. A score is a research priority, not a forecast.
            </p>
            <p className="hero-note">
              This view opens on seats scored on two or more inputs.{" "}
              {fmtCount(singleInputSeats)} seats carry a single input and often
              tie; choose “Any evidence” under Evidence to include them.{" "}
              <Link href="/methodology">How the score is built</Link>
            </p>
          </div>
          <div className="index-mark">
            <strong>{fmtCount(briefs.length)}</strong>
            <span>seats scored</span>
            <b>{fmtCount(defaultViewSeats)}</b>
            <span>with two or more inputs</span>
          </div>
        </header>

        <form className="priority-filters" method="get">
          <label>
            Search
            <input
              name="q"
              defaultValue={value(params.q)}
              placeholder="District or incumbent"
            />
          </label>
          <label>
            State
            <select name="state" defaultValue={state}>
              <option value="">All states</option>
              {states.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label>
            Chamber
            <select name="chamber" defaultValue={chamber}>
              <option value="">All chambers</option>
              <option value="house">House</option>
              <option value="senate">Senate</option>
              <option value="governor">Governor</option>
              <option value="state_senate">State Senate / unicameral / DC Council</option>
              <option value="state_house">State House</option>
            </select>
          </label>
          <label>
            Next election
            <select name="cycle" defaultValue={cycle}>
              <option value="">Any year</option>
              {cycles.map((year) => (
                <option key={year} value={String(year)}>{year}</option>
              ))}
            </select>
          </label>
          <label>
            Route
            <select name="route" defaultValue={route}>
              <option value="">All routes</option>
              <option value="aipac_supported_blue">AIPAC-supported blue</option>
              <option value="deep_blue">Deep blue</option>
              <option value="democratic_incumbent_primary">Democratic incumbent (Senate, governor, state)</option>
              <option value="republican_fringe_general">Republican-held flip</option>
            </select>
          </label>
          <label>
            Evidence
            <select name="evidence" defaultValue={minimumInputs === 1 ? "any" : String(minimumInputs)}>
              <option value="2">Two or more inputs</option>
              <option value="3">Three or more inputs</option>
              <option value="any">Any evidence</option>
            </select>
          </label>
          <button>Apply</button>
        </form>

        {filtered.length > 0 && (
          <dl className="priority-stats" aria-label="Summary of the seats in this view">
            <div>
              <dt>Seats in this view</dt>
              <dd>{fmtCount(filtered.length)}</dd>
            </div>
            <div>
              <dt>Score range</dt>
              <dd>{topScore === lowScore ? topScore : `${topScore} – ${lowScore}`}</dd>
            </div>
            <div>
              <dt>Three or more inputs</dt>
              <dd>{fmtCount(threeOrMoreInputs)}</dd>
            </div>
            <div>
              <dt>Republican-held</dt>
              <dd>{fmtCount(republicanHeld)}</dd>
            </div>
          </dl>
        )}

        <div className="priority-list">
          <div className="priority-list-head" aria-hidden="true">
            <span>Index rank / score</span>
            <span>Seat / incumbent</span>
            <span>What the score is made of</span>
            <span>Route / evidence</span>
          </div>
          {view.rows.map((row) => {
            const standing = standings.get(row.seatCycleId)!;
            const inputs = measuredInputs(row);
            return (
              <article className="priority-entry" key={row.seatCycleId}>
                <div className="priority-row">
                  <div className="rank-lockup">
                    <span>#{fmtCount(standing.rank)}</span>
                    <strong>{row.provisionalTargetScore.toFixed(1)}</strong>
                    {standing.tiedWith > 1 && <small>Tie of {fmtCount(standing.tiedWith)}</small>}
                  </div>
                  <div>
                    <span className="priority-seat">{row.districtLabel}{row.openSeatSignal ? " · open seat" : ""}</span>
                    <h2>
                      <Link href={`/priorities/${row.seatCycleId}`}>{row.officialHouseName}</Link>
                    </h2>
                    <p>
                      {row.incumbentParty} · {formatPartisanMargin(row.presidentialDemocraticMargin2024)}{isStateChamber(row.chamber) ? " own race" : ""} ·{" "}
                      {row.chamber === "governor" || isStateChamber(row.chamber) ? `${row.cumulativeHouseServiceYears.toFixed(1)}-year term` : `${row.cumulativeHouseServiceYears.toFixed(1)} years in ${row.chamber === "senate" ? "Senate" : "House"}`} · next election {row.nextElectionYear}
                    </p>
                  </div>
                  <div className="driver-snapshot">
                    {row.scoreDrivers.map((driver) => (
                      <div key={driver.key}>
                        <span>{driver.label}</span>
                        {driver.score === null ? (
                          <em>Not in this score</em>
                        ) : (
                          <>
                            <i>
                              <b style={{ width: `${driver.score}%` }} />
                            </i>
                            <strong>{driver.score.toFixed(1)}</strong>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="priority-route">
                    <span className={`route-tag route-${row.qualifyingRoute}`}>
                      {routeLabel(row.qualifyingRoute)}
                    </span>
                    <span className="evidence-count">
                      {inputs} {inputs === 1 ? "input" : "inputs"} measured
                    </span>
                  </div>
                </div>
                <details className="priority-more">
                  <summary>Why it ranks here</summary>
                  <div className="priority-expansion">
                    <div><h3>Score</h3><p>{row.scoreSummary}</p></div>
                    <div><h3>{row.chamber === "senate" || row.chamber === "governor" ? "State" : "District"}</h3><p>{row.districtSummary}</p></div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <section className="empty">
            <h2>No seats match these filters.</h2>
            {matching.length > 0 && (
              <p>
                {fmtCount(matching.length)} matching {matching.length === 1 ? "seat has" : "seats have"} fewer measured inputs than this view requires.{" "}
                <Link href={anyEvidenceHref}>Include {matching.length === 1 ? "it" : "them"}</Link>
              </p>
            )}
            <Link href="/">Reset the index</Link>
          </section>
        )}
        {filtered.length > 0 && (
          <nav className="pagination" aria-label="Priority index pages">
            {view.page > 1 ? <Link className="button" href={pageHref(view.page - 1)} rel="prev">← Previous 50</Link> : <span />}
            <p>
              Seats {fmtCount(view.first)}–{fmtCount(view.last)} of {fmtCount(filtered.length)} · page {fmtCount(view.page)} of {fmtCount(view.pageCount)}
            </p>
            {view.page < view.pageCount ? <Link className="button" href={pageHref(view.page + 1)} rel="next">Next 50 →</Link> : <span />}
          </nav>
        )}
      </main>
    </Shell>
  );
}
