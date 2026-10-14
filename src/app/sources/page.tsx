import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { loadSourcesPage } from "@/ui/server-data";
import type { SourcesPageViewModel } from "@/ui/view-models";
import {
  Shell,
  RouteState,
  Status,
  fmtCount,
  fmtDate,
  words,
} from "@/components/presentational";
import { housePriorityBriefsV11 } from "@/lib/house-priority-index";
import { getDefaultPriorityRepository } from "@/lib/priority-index-store";
import { loadRapidHousePrimaryCoverage } from "@/ui/rapid-house-primary-coverage";
import { loadRapidLocalContextCoverage } from "@/ui/rapid-local-context-coverage";
import { loadRapidExpansionStatus } from "@/ui/rapid-expansion-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata("/sources", "Source ledger", "Which inputs feed the Priority Index, how many seats each one covers, and the retained snapshots behind them.");
type Coverage = SourcesPageViewModel["coverage"][number];

export default async function Sources() {
  const [result, rapidCoverage, localContextCoverage, expansionStatus] =
    await Promise.all([
      loadSourcesPage(),
      loadRapidHousePrimaryCoverage(),
      loadRapidLocalContextCoverage(),
      loadRapidExpansionStatus(),
    ]);
  if (!result.ok) return <RouteState code={result.code} />;
  const { value: page } = result;
  const indexRows = housePriorityBriefsV11();
  const priorityRepository = getDefaultPriorityRepository();
  const rankedRows = priorityRepository.getBriefs();
  const model = priorityRepository.getModelRelease();
  const rankedIn = (...chambers: string[]) =>
    rankedRows.filter((row) => chambers.includes(row.chamber)).length;
  const driverCoverage = (key: string) =>
    indexRows.filter((row) => {
      const driver = row.scoreDrivers.find(
        (candidate) => candidate.key === key,
      );
      return driver && driver.score !== null;
    }).length;
  const democraticSeats = indexRows.filter(
    (row) => row.incumbentParty === "Democratic",
  ).length;
  const republicanSeats = indexRows.filter(
    (row) => row.incumbentParty === "Republican",
  ).length;
  const groups = [...new Set(page.coverage.map((row) => row.domain))]
    .sort()
    .map((domain) => ({
      domain,
      rows: page.coverage.filter((row) => row.domain === domain),
    }));
  return (
    <Shell release={page.release}>
      <main id="content" className="page sources-page">
        <p className="eyebrow">SOURCE LEDGER</p>
        <h1>What we have, and what we do not.</h1>
        <p className="lede">
          Start with the seven inputs that affect the public ranking. The broader
          release ledger and exact retained snapshots remain available below for
          audit.
        </p>
        <section
          className="source-scorecard"
          aria-label="Priority Index source coverage"
        >
          <article>
            <span>Ranked seats · model {model.version}</span>
            <strong>{fmtCount(rankedRows.length)}</strong>
            <p>
              House {fmtCount(rankedIn("house"))} · Senate {fmtCount(rankedIn("senate"))} · governors{" "}
              {fmtCount(rankedIn("governor"))} · state legislative{" "}
              {fmtCount(rankedIn("state_house", "state_senate"))}
            </p>
          </article>
          <article>
            <span>House cash on hand</span>
            <strong>
              {driverCoverage("cash_vulnerability")} / {indexRows.length}
            </strong>
            <p>
              {indexRows.length - driverCoverage("cash_vulnerability")} House
              seats without a reported value
            </p>
          </article>
          <article>
            <span>Source cutoff</span>
            <strong>{fmtDate(page.release.sourceCutoff)}</strong>
            <p>Published release facts, not live feeds</p>
          </article>
        </section>
        <section className="record-section">
          <div className="section-heading-pair">
            <div>
              <p className="eyebrow">WHAT FEEDS THE SCORE</p>
              <h2>Seven House inputs, two routes</h2>
            </div>
            <p>
              Coverage means a usable numeric component is present. It does not
              mean every desirable historical or challenger-level field has been
              collected. Counts on these cards are House seats; Senate,
              governor, and state-legislative coverage is described below and on
              the Method page.
            </p>
          </div>
          <div className="source-input-grid">
            <SourceInput
              title="District partisanship"
              coverage={`${indexRows.length} / ${indexRows.length}`}
              source="Retained 2024 presidential district results"
              use="Creates the Democratic blue baseline and Republican general-election competitiveness."
            />
            <SourceInput
              title="Primary feasibility"
              coverage={`${driverCoverage("primary_feasibility")} / ${democraticSeats}`}
              source="Published election facts and retained primary evidence"
              use="V0.9 directly measures 22 linked 2024 incumbent contests, including RI-01 through a reviewed alias; other seats retain the earlier partial estimate."
            />
            <SourceInput
              title="AIPAC support"
              coverage={`${driverCoverage("aipac_support")} / ${democraticSeats}`}
              source="FEC-derived AIPAC-network evidence"
              use="Used only on the Democratic AIPAC-supported route; unavailable values stay missing."
            />
            <SourceInput
              title="Incumbent alignment"
              coverage={`${driverCoverage("incumbent_alignment_gap")} / ${democraticSeats}`}
              source="119th House Left and Palestine trackers"
              use="Used only for Democratic incumbents; 210 are full and two are partial observations."
            />
            <SourceInput
              title="Cash vulnerability"
              coverage={`${driverCoverage("cash_vulnerability")} / ${indexRows.length}`}
              source="FEC candidate summary snapshot named by the refresh pointer; the release aggregate is retained where the snapshot has no row"
              use="Affects both routes and is refreshed by rapid:refresh. Seats without a snapshot row keep the release aggregate."
            />
            <SourceInput
              title="Local context"
              coverage={`${driverCoverage("local_context")} / ${indexRows.length}`}
              source="County CVAP, turnout, registration, demographics, 2024 House results, and exact CD119 at-large geography"
              use="Four at-large seats have exact county-universe context. Split-county seats remain unchanged."
            />
            <SourceInput
              title="State primary contestation"
              coverage={`${driverCoverage("state_primary_contestation")} / ${republicanSeats}`}
              source="Retained state-legislative Democratic primary catalogs that record uncontested contests"
              use="Used only on the Republican route as state-level context; six states carry a value and the rest omit the weight."
            />
            <SourceInput
              title="Member and service history"
              coverage="Context, not scored"
              source="House Clerk and Congress Legislators"
              use="Provides identity, biography, and tenure context; it does not independently change rank."
            />
          </div>
          <p className="source-method-link">
            <Link href="/methodology">
              See every weight, formula, and missing-data rule →
            </Link>
          </p>
        </section>
        <section className="record-section">
          <p className="eyebrow">INDEX FINANCE PROJECTION</p>
          <h2>One published finance row per ranked seat</h2>
          <p>
            The v0.3 through v0.9 layers project the incumbent finance aggregate from{" "}
            <code>rel_full_20260804_v2</code> onto the 430 ranked House seats. Since
            v0.10 the active score refreshes cash from the FEC candidate summary
            snapshot; the release aggregate below remains the retained fallback.
            Cash changes the score; receipts and disbursements are displayed as
            context and do not receive separate weights.
          </p>
          <div className="source-projection-facts">
            <span>
              <b>427</b> cash values in the release aggregate
            </span>
            <span>
              <b>3</b> not reported in the release aggregate
            </span>
            <span>
              <b>cf00b2bcfaf0…</b> projection
            </span>
            <span>
              <b>a908273c32fe…</b> retained file
            </span>
          </div>
        </section>
        <section className="record-section">
          <div className="section-heading-pair">
            <div>
              <p className="eyebrow">RELEASE COVERAGE</p>
              <h2>Open a domain for exact scopes</h2>
            </div>
            <p>
              These are factual-release coverage records, not score weights.
              Counts inside different scopes should not be added together as if
              they shared one denominator.
            </p>
          </div>
          <section className="coverage-overview" aria-label="Coverage overview">
            {groups.map(({ domain, rows }) => (
              <CoverageGroup key={domain} domain={domain} rows={rows} />
            ))}
          </section>
        </section>
        <section className="record-section">
          <div className="section-heading-pair">
            <div>
              <p className="eyebrow">RAPID ACQUISITION</p>
              <h2>Rapid House-primary acquisition</h2>
            </div>
            <p>
              This file-backed workstream remains separate from the
              factual-release ledger. V0.9 uses only the 22 official 2024
              contests that pass incumbent identity (exact, documented, or
              reviewed alias) and CD119 district-key joins.
            </p>
          </div>
          {!rapidCoverage ? (
            <p className="muted">
              No generated rapid House-primary coverage ledger is available yet.
            </p>
          ) : (
            <details className="coverage-group">
              <summary>
                <span>
                  <strong>
                    {rapidCoverage.rows.length} state-cycle scopes
                  </strong>
                  <small>Retained source files and parsing progress</small>
                </span>
                <span>
                  <b>
                    {rapidCoverage.rows.reduce(
                      (count, row) => count + row.parsedDistrictCount,
                      0,
                    )}{" "}
                    parsed contests ·{" "}
                    {rapidCoverage.rows.reduce(
                      (count, row) => count + row.sourceAbsentDistrictCount,
                      0,
                    )}{" "}
                    source absent
                  </b>
                  <small>
                    Only the separately gated 2024 subset enters v0.9
                  </small>
                </span>
              </summary>
              <div className="ledger-body">
                <div
                  className="table-wrap"
                  role="region"
                  tabIndex={0}
                  aria-label="Rapid House-primary acquisition coverage"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Scope</th>
                        <th>Status</th>
                        <th>Parsed / target districts</th>
                        <th>Retained artifacts</th>
                        <th>Missing or blocked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rapidCoverage.rows.map((row) => (
                        <tr key={`${row.stateCode}-${row.cycleYear}`}>
                          <td>
                            <strong>
                              {row.stateCode} · {row.cycleYear}
                            </strong>
                          </td>
                          <td>
                            <Status>{words(row.status)}</Status>
                          </td>
                          <td>
                            Parsed {row.parsedDistrictCount} /{" "}
                            {row.expectedTargetDistricts.length}
                            {row.sourceAbsentDistrictCount
                              ? `; source absent ${row.sourceAbsentDistrictCount}`
                              : ""}
                          </td>
                          <td>{row.retainedArtifactCount}</td>
                          <td>
                            {row.missingByReason?.length
                              ? row.missingByReason
                                  .map(
                                    (item) =>
                                      `${words(item.reason)}: ${item.count}`,
                                  )
                                  .join("; ")
                              : "Not recorded"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}
        </section>
        <section className="record-section">
          <div className="section-heading-pair">
            <div>
              <p className="eyebrow">LOCAL CONTEXT INTAKE</p>
              <h2>Retained widely, scored in two places</h2>
            </div>
            <p>
              These retained county and state-legislative inputs are
              independently hash-verified. Two subsets affect the Priority
              Index: the exact at-large county rows, and a state-level
              Democratic contestation share from the state-legislative catalogs
              that record uncontested contests. Office catalogs remain separate.
            </p>
          </div>
          {!localContextCoverage ? (
            <p className="muted">
              No generated rapid local-context coverage receipt is available
              yet.
            </p>
          ) : (
            <details className="coverage-group">
              <summary>
                <span>
                  <strong>
                    {localContextCoverage.artifacts.length} retained context
                    sets
                  </strong>
                  <small>
                    County demographics and elections, state-legislative
                    primaries, and Indiana, New Mexico, and North Carolina
                    local-office catalogs
                  </small>
                </span>
                <span>
                  <b>
                    {expansionStatus
                      ? `${expansionStatus.stateContestation.statesWithContext} states feed contestation`
                      : "0 score-eligible rows"}
                  </b>
                  <small>Separate from released coverage</small>
                </span>
              </summary>
              <div className="ledger-body">
                <div
                  className="table-wrap"
                  role="region"
                  tabIndex={0}
                  aria-label="Rapid local context acquisition coverage"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Context set</th>
                        <th>Scope</th>
                        <th>Coverage</th>
                        <th>Score use</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localContextCoverage.artifacts.map((artifact) => (
                        <tr key={artifact.id}>
                          <td>
                            <strong>{artifact.label}</strong>
                            <small>
                              <code>{artifact.id}</code>
                            </small>
                          </td>
                          <td>{artifact.scope}</td>
                          <td>
                            {Object.entries(artifact.summary)
                              .map(([key, value]) => `${words(key)}: ${value}`)
                              .join(" · ")}
                            {artifact.cyclesThrough !== undefined ? (
                              <>
                                <br />
                                <small>Cycles through {artifact.cyclesThrough}</small>
                              </>
                            ) : null}
                          </td>
                          <td>
                            {(() => {
                              const used = expansionStatus?.stateContestation.states.find(
                                (row) => row.sourceArtifactId === artifact.id,
                              );
                              return used
                                ? `State contestation for ${used.state} (${used.cycleYear}): ${used.contestationScore}`
                                : `Excluded — ${artifact.formulaEligibleCount} eligible rows`;
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}
        </section>
        <section className="record-section">
          <div className="section-heading-pair">
            <div>
              <p className="eyebrow">ACTIVE V0.9</p>
              <h2>Coverage-scaled Republican route, direct primary evidence, and exact county context</h2>
            </div>
            <p>
              V0.9 removes the flat Republican-route cap, adds a state-level
              Democratic primary contestation component, and resolves RI-01
              through a reviewed alias. The four exact at-large local-context
              rows remain active.
            </p>
          </div>
          {!expansionStatus ? (
            <p className="muted">
              The retained v0.9 projection is unavailable.
            </p>
          ) : (
            <div className="source-input-grid">
              <article>
                <div>
                  <h3>House {expansionStatus.score.version}</h3>
                  <strong>
                    {expansionStatus.score.directPrimaryActiveSeats} direct
                    primary / {expansionStatus.score.democraticSeats} Democratic
                  </strong>
                </div>
                <p>
                  {expansionStatus.score.republicanSeatsWithStateContestation} of{" "}
                  {expansionStatus.score.republicanSeats} Republican seats carry
                  state contestation ·{" "}
                  {expansionStatus.score.republicanSeatsWithLocalContext} carry
                  exact local context · Republican maximum{" "}
                  {expansionStatus.score.republicanMaxScore}
                </p>
                <small>
                  {expansionStatus.score.newlyResolvedDistricts
                    .map(
                      (row) =>
                        `${row.districtLabel} activates through a reviewed alias (${row.previousScore} → ${row.activeScore})`,
                    )
                    .join("; ")}
                  . {expansionStatus.score.unresolvedPrimaryRows} identity rows
                  remain unresolved. {expansionStatus.score.unchangedSeats}{" "}
                  seats reproduce {expansionStatus.score.previousVersion}{" "}
                  exactly; the largest movement is{" "}
                  {expansionStatus.score.maxAbsoluteMovement} points. No
                  split-county allocation or winner inference is used.
                </small>
              </article>
              <article>
                <div>
                  <h3>State Democratic primary contestation</h3>
                  <strong>
                    {expansionStatus.stateContestation.statesWithContext} states
                  </strong>
                </div>
                <p>
                  {expansionStatus.stateContestation.states
                    .map(
                      (row) =>
                        `${row.state} ${row.cycleYear}: ${row.contestationScore}`,
                    )
                    .join(" · ")}
                </p>
                <small>
                  {expansionStatus.stateContestation.contestedDemocraticContests}{" "}
                  of {expansionStatus.stateContestation.democraticContests}{" "}
                  retained Democratic state-legislative contests drew more than
                  one named candidate across{" "}
                  {expansionStatus.stateContestation.catalogs} catalogs.{" "}
                  {expansionStatus.stateContestation.formulaEligibleRows} of{" "}
                  {expansionStatus.stateContestation.rows} state-cycle rows are
                  comparable; catalogs that retain contested primaries only are
                  ineligible.
                </small>
              </article>
              <article>
                <div>
                  <h3>Exact at-large local context</h3>
                  <strong>
                    {expansionStatus.score.localContextActiveSeats} seats
                  </strong>
                </div>
                <p>
                  {expansionStatus.score.activeDistricts
                    .map(
                      (row) =>
                        `${row.districtLabel} ${row.localContext} (${Math.round(row.localContextAvailableWeight * 100)}% weight)`,
                    )
                    .join(" · ")}
                </p>
                <small>
                  County turnout, registration, demographics, and the House
                  comparison apply only where every county closes against the
                  current Census universe.
                </small>
              </article>
              {expansionStatus.localOffice.map((catalog) => (
                <article key={catalog.id}>
                  <div>
                    <h3>{catalog.label}</h3>
                    <strong>{catalog.contests} contests</strong>
                  </div>
                  <p>
                    {Object.entries(catalog.summary)
                      .filter(([key]) => key !== "formulaEligibleContests")
                      .map(([key, value]) => `${words(key)}: ${value}`)
                      .join(" · ")}
                  </p>
                  <small>
                    Catalog only: current-holder identity and a local-office
                    scoring method are not collected, and no winner is inferred.
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="record-section">
          <div className="section-heading-pair">
            <div>
              <p className="eyebrow">SENATE V0.1</p>
              <h2>Senate seats scored on the same two routes</h2>
            </div>
            <p>
              The 100 sitting senators are scored from the Congress Legislators
              roster, the statewide 2024 presidential result, the FEC candidate
              summary snapshot, the 119th Senate sheets of the alignment
              trackers, and state Democratic primary contestation. No Senate
              primary evidence is retained, so primary feasibility is omitted
              rather than estimated.
            </p>
          </div>
          {!expansionStatus ? (
            <p className="muted">The retained Senate projection is unavailable.</p>
          ) : (
            <div className="source-input-grid">
              <article>
                <div>
                  <h3>Senate {expansionStatus.senate.version}</h3>
                  <strong>{expansionStatus.senate.seats} seats · {expansionStatus.senate.upIn2026} up in 2026</strong>
                </div>
                <p>
                  {expansionStatus.senate.cashValues} cash values from{" "}
                  <code>{expansionStatus.senate.financeSnapshotId}</code>
                  {expansionStatus.senate.financeCoverageThrough ? ` (latest filing through ${expansionStatus.senate.financeCoverageThrough})` : ""} ·{" "}
                  {expansionStatus.senate.alignmentValues} alignment values ·{" "}
                  {expansionStatus.senate.stateContestationValues} state contestation values
                </p>
                <small>
                  Democratic-caucus route leaders:{" "}
                  {expansionStatus.senate.topDemocratic.map((row) => `${row.seatLabel} ${row.score} (${row.nextElectionYear})`).join(" · ")}.
                  Republican-held flip leaders:{" "}
                  {expansionStatus.senate.topRepublican.map((row) => `${row.seatLabel} ${row.score} (${row.nextElectionYear})`).join(" · ")}.
                </small>
              </article>
              <article>
                <div>
                  <h3>State legislatures</h3>
                  <strong>{expansionStatus.stateLegislative.legislators.toLocaleString("en-US")} legislators</strong>
                </div>
                <p>
                  {expansionStatus.stateLegislative.jurisdictions} jurisdictions ·{" "}
                  {expansionStatus.stateLegislative.chambers} chambers ·{" "}
                  {expansionStatus.stateLegislative.democraticHolders.toLocaleString("en-US")} Democratic ·{" "}
                  {expansionStatus.stateLegislative.republicanHolders.toLocaleString("en-US")} Republican ·{" "}
                  {expansionStatus.stateLegislative.independentHolders} independent or nonpartisan ·{" "}
                  {expansionStatus.stateLegislative.multiMemberDistricts} multi-member districts
                </p>
                <small>
                  Open States roster snapshot {expansionStatus.stateLegislative.snapshotDate} (CC0).{" "}
                  {expansionStatus.stateLegislative.primaryMatched} Democratic holders in{" "}
                  {expansionStatus.stateLegislative.catalogStates} catalog states match a candidate in their latest retained Democratic primary;{" "}
                  {expansionStatus.stateLegislative.holdersNotInLatestPrimary} do not.{" "}
                  {expansionStatus.stateLegislative.scored
                    ? `${expansionStatus.stateLegislative.scored.seats} seats in ${expansionStatus.stateLegislative.scored.coveredStates.join(", ")} are ranked from ${expansionStatus.stateLegislative.scored.generalContests} official general-election contests retained from each state's election authority; the seat's own most recent margin is the district baseline. ${expansionStatus.stateLegislative.scored.stateNotCovered.toLocaleString("en-US")} seats in other states wait for their returns.`
                    : "No state-legislative seats are ranked yet: no open nationwide file gives presidential results by legislative district, and no state returns are retained."}
                </small>
              </article>
            </div>
          )}
        </section>
        <section className="record-section">
          <p className="eyebrow">SOURCE INVENTORY</p>
          <h2>Publishers and retained snapshots</h2>
          <p className="muted">{page.snapshotScope}</p>
          <div className="source-disclosures">
            {page.sources.map(({ source, snapshots }) => (
              <details className="ledger-disclosure" key={String(source.id)}>
                <summary>
                  <span>
                    <strong>{source.name}</strong>
                    <small>{source.id}</small>
                  </span>
                  <span>
                    <Status>{source.authority}</Status>
                    <b>
                      {snapshots.length}{" "}
                      {snapshots.length === 1 ? "snapshot" : "snapshots"}
                    </b>
                  </span>
                </summary>
                <div className="ledger-body">
                  <p>
                    <a href={source.homepageUrl}>Open publisher homepage ↗</a>
                  </p>
                  {snapshots.length === 0 ? (
                    <p className="empty-copy">
                      This source has no snapshots in the active release.
                    </p>
                  ) : (
                    <div
                      className="table-wrap"
                      role="region"
                      tabIndex={0}
                      aria-label={`${source.name} snapshots`}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Snapshot</th>
                            <th>Dates</th>
                            <th>License / usage</th>
                            <th>Checksum / parser</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshots.map((snapshot) => (
                            <tr key={String(snapshot.id)}>
                              <td>
                                <a href={snapshot.sourceUrl}>{snapshot.id}</a>
                              </td>
                              <td>
                                Published: {fmtDate(snapshot.publishedAt)}
                                <small>
                                  Retrieved: {fmtDate(snapshot.retrievedAt)}
                                </small>
                              </td>
                              <td>
                                {snapshot.license}
                                <small>
                                  <Status>{snapshot.usageStatus}</Status>
                                </small>
                              </td>
                              <td>
                                <code>
                                  {snapshot.checksumSha256.slice(0, 12)}…
                                </code>
                                <small>{snapshot.parserVersion}</small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>
    </Shell>
  );
}

function SourceInput({
  title,
  coverage,
  source,
  use,
}: {
  title: string;
  coverage: string;
  source: string;
  use: string;
}) {
  return (
    <article>
      <div>
        <h3>{title}</h3>
        <strong>{coverage}</strong>
      </div>
      <p>{source}</p>
      <small>{use}</small>
    </article>
  );
}

function CoverageGroup({
  domain,
  rows,
}: {
  domain: string;
  rows: readonly Coverage[];
}) {
  const incomplete = rows.filter(
    (row) => row.observedCount < row.expectedCount || row.status !== "complete",
  ).length;
  return (
    <details className="coverage-group">
      <summary>
        <span>
          <strong>{coverageTitle(domain)}</strong>
          <small>{coverageDescription(domain)}</small>
        </span>
        <span>
          <b>
            {rows.length} {rows.length === 1 ? "scope" : "scopes"}
          </b>
          <small>
            {incomplete
              ? `${incomplete} need attention`
              : "all listed scopes complete"}
          </small>
        </span>
      </summary>
      <div className="ledger-body">
        <div
          className="table-wrap"
          role="region"
          tabIndex={0}
          aria-label={`${domain} coverage details`}
        >
          <table>
            <thead>
              <tr>
                <th>Scope</th>
                <th>Status</th>
                <th>Observed / expected</th>
                <th>Unavailable or incompatible</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.domain}-${scopeKey(row.scope)}-${row.status}`}>
                  <td>
                    <strong>{scopeLabel(row.scope)}</strong>
                    <small>
                      {row.recordCount} ledger{" "}
                      {row.recordCount === 1 ? "record" : "records"}
                    </small>
                  </td>
                  <td>
                    <Status>{row.status}</Status>
                  </td>
                  <td>
                    {row.observedCount} / {row.expectedCount}
                  </td>
                  <td>
                    {row.missingByReason.length
                      ? row.missingByReason
                          .map((item) => `${words(item.reason)}: ${item.count}`)
                          .join("; ")
                      : "None recorded"}
                    <small>
                      Quarantined {row.quarantinedCount} · incompatible{" "}
                      {row.incompatibleCount}
                    </small>
                  </td>
                  <td>
                    {row.inputSnapshotCount} input{" "}
                    {row.inputSnapshotCount === 1 ? "snapshot" : "snapshots"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

const coverageTitle = (domain: string) =>
  (
    ({
      acs: "District demographics",
      election: "Election results",
      finance: "Campaign finance",
      geography: "District geography",
      identity: "Member identity",
      maps: "District maps",
      member: "Member records",
    }) as Record<string, string>
  )[domain] ?? words(domain);
const coverageDescription = (domain: string) =>
  (
    ({
      acs: "Census estimates and margins of error",
      election: "Cycle-by-cycle reported result coverage",
      finance: "FEC and categorized funding records",
      geography: "Seat-to-district geographic closure",
      identity: "Current officeholder links",
      maps: "Renderable district boundaries",
      member: "Biographical and service facts",
    }) as Record<string, string>
  )[domain] ?? "Published release coverage";
type CoverageScope = Coverage["scope"];
function scopeLabel(scope: CoverageScope) {
  if (scope.kind === "release") return "Release-wide";
  if (scope.kind === "jurisdiction") return "Jurisdiction-wide";
  if (scope.kind === "seat_cycle") return "Seat-cycle-wide";
  if (scope.kind === "acs_indicator")
    return `${scope.variable} · ${scope.surveyPeriod}`;
  if (scope.kind === "election") return `${scope.electionYear} election`;
  return `${words(scope.fundingKind)} funding`;
}
function scopeKey(scope: CoverageScope) {
  return scope.kind === "acs_indicator"
    ? `${scope.kind}:${scope.variable}:${scope.surveyPeriod}`
    : scope.kind === "election"
      ? `${scope.kind}:${scope.electionYear}`
      : scope.kind === "funding"
        ? `${scope.kind}:${scope.fundingKind}`
        : scope.kind;
}
