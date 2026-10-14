import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { cache } from "react";
import { loadProfilePage } from "@/ui/server-data";
import { Shell, RouteState, Status, Lineage, fact, fmtDate, fmtMoney, fmtNumber, incumbencyLabel, partyLabel, words } from "@/components/presentational";
import { SeatMap } from "@/components/seat-map";
import { ElectionAvailability } from "@/components/election-availability";
import { FinanceAvailability } from "@/components/finance-availability";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// One profile read serves both the document title and the page.
const loadProfile = cache((id: string) => loadProfilePage({ id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await loadProfile((await params).id);
  if (!result.ok) return { title: "Seat record unavailable", robots: { index: false, follow: false } };
  const { identity } = result.value;
  return pageMetadata(`/seats/${encodeURIComponent((await params).id)}`, `${identity.geographyLabel} · seat record`, `Factual seat record for ${identity.geographyLabel}${identity.currentHolder ? `, held by ${identity.currentHolder}` : ""}.`);
}

export default async function SeatProfile({ params }: Props) {
  const result = await loadProfile((await params).id);
  if (!result.ok) return <RouteState code={result.code} />;

  const { value: page } = result;
  const p = page.headlineFacts;
  const biography = page.biography;

  return <Shell release={page.release}><main id="content" className="page">
    <p className="eyebrow">SEAT RECORD / {page.identity.geographyVintage}</p>
    <div className="identity">
      <div>
        <h1>{page.identity.geographyLabel}</h1>
        <p>{officeLabel(page.identity.officeKind)} · {page.identity.stateCode}{page.identity.districtCode ? `-${page.identity.districtCode}` : ""} · {incumbencyLabel(page.identity.incumbencyStatus)}</p>
      </div>
      <dl>
        <dt>Current holder</dt>
        <dd>{page.identity.currentHolder ?? "No current holder recorded"}{page.identity.currentHolderParty ? ` · ${partyLabel(page.identity.currentHolderParty)}` : ""}</dd>
        <dt>Occupancy</dt>
        <dd>{page.identity.occupancyStatus === "vacant" ? "Vacant" : words(page.identity.occupancyStatus)} as of {fmtDate(page.identity.occupancyAsOf)}</dd>
        <dt>Senate representation</dt>
        <dd>{page.identity.jurisdictionPolicy.senateRepresentation === "none" ? "No Senate representation from this jurisdiction policy." : "Two Senate seats in this jurisdiction policy."}{page.identity.jurisdictionPolicy.source === "legacy_fallback" && " Legacy compatibility policy."}</dd>
      </dl>
    </div>

    <section className="boundary-record" aria-labelledby="boundary-heading"><div><p className="eyebrow">RELEASE-PINNED GEOGRAPHY</p><h2 id="boundary-heading">District boundary</h2><p className="muted">{page.identity.geographyLabel} · vintage {page.identity.geographyVintage} · {page.release.label}</p><SeatMap descriptor={page.map} label={page.identity.geographyLabel} /></div><div className="boundary-ledger"><table><caption>Published boundary record</caption><tbody><tr><th>Geography</th><td>{page.identity.geographyLabel}</td></tr><tr><th>District / office</th><td>{page.identity.stateCode}{page.identity.districtCode ? `-${page.identity.districtCode}` : ""} · {words(page.identity.chamber)}</td></tr><tr><th>Vintage</th><td>{page.identity.geographyVintage}</td></tr><tr><th>Release</th><td>{page.release.label}</td></tr><tr><th>GeoJSON</th><td>{page.map ? <a href={page.map.url}>Published boundary GeoJSON</a> : "Unavailable"}</td></tr></tbody></table></div></section>

    <section className="fact-grid" aria-label="Headline sourced facts">
      <article>
        <p className="eyebrow">2024 PRESIDENTIAL MARGIN</p>
        <h2>{fact(p.presidentialMargin2024.value, x => `${x > 0 ? "+" : ""}${x.toFixed(1)} pp`)}</h2>
        <Lineage status={p.presidentialMargin2024.status} asOf={p.presidentialMargin2024.asOf} methodology={p.presidentialMargin2024.methodology} inputs={p.presidentialMargin2024.inputSnapshotIds} />
      </article>
      <article>
        <p className="eyebrow">{p.cashOnHand.kind === "aggregate" ? "CASH ON HAND / AGGREGATE" : "CASH ON HAND / FEC SUMMARY"}</p>
        <h2>{p.cashOnHand.kind === "value" ? fmtMoney(p.cashOnHand.value) : p.cashOnHand.kind === "aggregate" ? `Aggregate — ${fmtMoney(p.cashOnHand.value)}` : `Unavailable — ${words(p.cashOnHand.reason)}`}</h2>
        <p className="lineage">{p.cashOnHand.kind === "value" ? <>Filed {fmtDate(p.cashOnHand.filedAt)} · reporting through {fmtDate(p.cashOnHand.coverageThrough)} · {p.cashOnHand.inputSnapshotIds.length} input snapshots</> : p.cashOnHand.kind === "aggregate" ? <>Aggregate as of {fmtDate(p.cashOnHand.asOf)} · coverage through {fmtDate(p.cashOnHand.coverageThrough)} · {p.cashOnHand.inputSnapshotIds.length} input snapshots</> : <>As of {fmtDate(p.cashOnHand.asOf)} · {p.cashOnHand.inputSnapshotIds.length} input snapshots</>}</p>
        <p className="muted">{p.cashOnHand.kind === "aggregate" ? <>Aggregate methodology: {p.cashOnHand.methodologyVersion}. Not a single filing or a live balance.</> : "FEC values are filing summaries, not live balances."}</p>
        <FinanceAvailability cashOnHand={p.cashOnHand} availability={page.financeAvailability} aggregates={page.financeAggregates} />
      </article>
    </section>

    <section className="record-section" aria-labelledby="member-record-heading">
      <p className="eyebrow">SOURCED BIOGRAPHY / COVERAGE</p>
      <h2 id="member-record-heading">Member record</h2>
      <p className="muted">Facts are limited to this release’s source cutoff: {fmtDate(page.release.sourceCutoff)}. Bioguide coverage is an identity-match measure, not complete biography coverage.</p>
      {(page.identity.occupancyStatus !== "occupied" || !page.identity.currentHolder) && <p className="empty-copy">No current member biography is attached to this seat record.</p>}
      <dl>
        <dt>Bioguide ID</dt>
        <dd>{biography.bioguideId?.kind === "value" ? biography.bioguideId.value : biography.bioguideId?.kind === "missing" ? `Unavailable — ${words(biography.bioguideId.reason)}` : "Unavailable — no Bioguide ID fact attached"}</dd>
        <dt>Birth date</dt>
        <dd>{biography.birthDate?.kind === "value" ? fmtDate(biography.birthDate.value) : biography.birthDate?.kind === "missing" ? `Unavailable — ${words(biography.birthDate.reason)}` : "Unavailable — no birth-date fact attached"}</dd>
      </dl>
      {biography.facts.length > 0 && <div className="table-wrap" role="region" tabIndex={0} aria-label="Member fact observations. Scroll horizontally to view all columns.">
        <table>
          <caption>Member fact observations and provenance snapshots</caption>
          <thead><tr><th>Fact</th><th>Recorded value</th><th>Effective / observed</th><th>Provenance snapshots</th></tr></thead>
          <tbody>{biography.facts.map((row) => <tr key={`${row.fact}-${row.effectiveAt}`}>
            <td><strong>{words(row.fact)}</strong></td>
            <td>{row.value.kind === "value" ? (row.fact === "birth_date" ? fmtDate(row.value.value) : row.value.value) : `Unavailable — ${words(row.value.reason)}`}</td>
            <td>{fmtDate(row.effectiveAt)}</td>
            <td>{row.provenance.map((reference) => <span key={`${String(reference.snapshotId)}-${reference.role}`}>{String(reference.snapshotId)} · {words(reference.role)}</span>)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {biography.memberCoverage ? <p className="lineage"><Status>{biography.memberCoverage.status}</Status><span>Release-wide member identity-match coverage</span><span>{biography.memberCoverage.observedCount} observed / {biography.memberCoverage.expectedCount} expected</span><span>{biography.memberCoverage.inputSnapshotIds.length} input {biography.memberCoverage.inputSnapshotIds.length === 1 ? "snapshot" : "snapshots"}</span></p> : <p className="empty-copy">Release-wide member identity-match coverage is unavailable for this profile.</p>}
      <p className="muted">{biography.committeeAssignmentsNote}</p>
      {page.committeeAssignments.length > 0 && <div className="table-wrap" role="region" tabIndex={0} aria-label="Legislative committee assignments. Scroll horizontally to view all columns."><table><caption>Legislative committee assignments</caption><thead><tr><th>Committee</th><th>Role</th><th>Effective period</th><th>Source snapshots</th></tr></thead><tbody>{page.committeeAssignments.map((assignment) => <tr key={`${assignment.committeeId}-${assignment.role}`}><td><strong>{assignment.committeeName}</strong></td><td>{assignment.role}</td><td>{fmtDate(assignment.effectiveFrom)} — {assignment.effectiveTo ? fmtDate(assignment.effectiveTo) : "current at cutoff"}</td><td>{assignment.inputSnapshotIds.join(", ")}</td></tr>)}</tbody></table></div>}
    </section>

    <ElectionAvailability decisions={page.electionDecisions} jurisdictionCode={page.identity.stateCode} />
    <section className="record-section"><h2>Election records</h2>{page.elections.length === 0 ? <p className="empty-copy">Unavailable — no election records in this profile.</p> : page.elections.map(e => <article className="contest" key={String(e.id)}><h3>{words(e.kind)} · {words(e.round)} · {fmtDate(e.electionDate)}</h3><Lineage status={e.lineage.status} asOf={e.lineage.asOf} methodology={e.lineage.methodology} inputs={e.lineage.inputs} /><p><Status>{e.certificationStatus}</Status> {e.reportingCompletenessPercent}% reporting · {words(e.reportingUnit)} · allocation: {words(e.allocationMethod)} ({fact(e.allocationCoveragePercent)}) · denominator: {fact(e.denominatorVotes)}</p><div className="results">{page.electionResults.filter(r => r.contestId === e.id).map(r => <div key={String(r.resultOptionId)}><strong>{r.label}</strong><span>{r.party ? words(r.party) : "Party unavailable"} · {r.optionKind}</span><b>{fact(r.votes)}</b><Lineage status={r.lineage.status} asOf={r.lineage.asOf} methodology={r.lineage.methodology} inputs={r.lineage.inputs} /></div>)}</div></article>)}</section>
    <section className="record-section"><h2>District context / ACS</h2><p className="muted">Descriptive district context only; it is not available as a filter or targeting input.</p>{page.demographics.length === 0 ? <p className="empty-copy">{page.acsAvailability.kind === "incompatible_geography" ? "Unavailable — this geography is incompatible with ACS district coverage." : "Unavailable — no ACS observations in this profile."}</p> : <div className="table-wrap" role="region" tabIndex={0} aria-label="District context and ACS data. Scroll horizontally to view all columns."><table><thead><tr><th>Measure</th><th>Estimate</th><th>Margin of error</th><th>Period / universe</th></tr></thead><tbody>{page.demographics.map(d => <tr key={d.variable}><td><strong>{d.label}</strong><small>{d.variable} · {d.unit}</small></td><td>{fact(d.estimate, d.unit === "usd" ? fmtMoney : fmtNumber)}</td><td>{fact(d.marginOfError, d.unit === "usd" ? fmtMoney : fmtNumber)}</td><td>{d.surveyPeriod}<small>{d.universe}</small><Lineage status={d.lineage.status} asOf={d.lineage.asOf} methodology={d.lineage.methodology} inputs={d.lineage.inputs} /></td></tr>)}</tbody></table></div>}</section>
    <section className="record-section"><h2>Gross committee finance</h2><p className="muted">Gross totals across included committees; no transfer netting.</p>{page.financeAggregates.map(a => <article key={String(a.id)}><h3>Gross cash {fact(a.cashOnHand, fmtMoney)}</h3><p>Gross receipts {fact(a.receipts, fmtMoney)} · gross disbursements {fact(a.disbursements, fmtMoney)}</p><p className="lineage">Coverage through {fmtDate(a.coverageThrough)} · as of {fmtDate(a.asOf)} · {a.methodologyVersion} · {a.includedCommitteeCount} included / {a.missingCommitteeCount} missing committees</p></article>)}<h3>Receipt categories</h3>{page.fundingCategoryAggregates.length === 0 ? <p className="empty-copy">Unavailable — no receipt-category calculation is published.</p> : <div className="table-wrap" role="region" tabIndex={0} aria-label="FEC receipt categories. Scroll horizontally to view all columns."><table><thead><tr><th>Category</th><th>Amount</th><th>Coverage / method</th></tr></thead><tbody>{page.fundingCategoryAggregates.map(a => <tr key={`${a.category}-${a.coverageThrough}`}><td>{words(a.category)}</td><td>{fact(a.amount, fmtMoney)}</td><td>{fmtDate(a.coverageThrough)}<small>{a.methodologyVersion}</small></td></tr>)}</tbody></table></div>}<h3>Independent expenditures</h3>{page.outsideSpendingAggregates.length === 0 ? <p className="empty-copy">Unavailable — no independent-expenditure calculation is published.</p> : page.outsideSpendingAggregates.map(a => <article key={`${a.coverageThrough}-${a.methodologyVersion}`}><p>Supporting: <strong>{fact(a.supportAmount, fmtMoney)}</strong> · Opposing: <strong>{fact(a.opposeAmount, fmtMoney)}</strong></p><p className="lineage">Through {fmtDate(a.coverageThrough)} · {a.methodologyVersion} · {a.inputSnapshotIds.length} input snapshots</p></article>)}{page.fundingOrganizationAggregates.length > 0 && <div className="table-wrap" role="region" tabIndex={0} aria-label="Independent expenditure organizations. Scroll horizontally to view all columns."><table><caption>Reporting organizations</caption><thead><tr><th>Organization</th><th>Amount</th><th>Coverage</th></tr></thead><tbody>{page.fundingOrganizationAggregates.map(a => <tr key={String(a.id)}><td>{a.organizationName}<small>{a.organizationExternalId ?? "No external ID"}</small></td><td>{fact(a.amount, fmtMoney)}</td><td>{fmtDate(a.coverageThrough)}</td></tr>)}</tbody></table></div>}<h2>FEC filing history</h2>{page.finance.length === 0 ? <p className="empty-copy">No filing summaries are attached to this profile.</p> : <div className="table-wrap" role="region" tabIndex={0} aria-label="FEC filing history. Scroll horizontally to view all columns."><table><thead><tr><th>Report</th><th>Period</th><th>Cash / receipts / disbursements</th><th>Filing context</th></tr></thead><tbody>{page.finance.map(f => <tr key={String(f.id)}><td>{f.reportType}<small>Committee {f.committeeId}</small></td><td>{fmtDate(f.reportingPeriodStart)} — {fmtDate(f.reportingPeriodEnd)}</td><td>{fact(f.cashOnHand, fmtMoney)}<small>Receipts: {fact(f.totalReceipts, fmtMoney)} · Disbursements: {fact(f.totalDisbursements, fmtMoney)}</small></td><td>{words(f.amendmentStatus)} · amendment {f.amendmentNumber}<small>Filed {fmtDate(f.filedAt)}</small><Lineage status={f.lineage.status} asOf={f.lineage.asOf} methodology={f.lineage.methodology} inputs={f.lineage.inputs} /></td></tr>)}</tbody></table></div>}</section>
    <section className="record-section provenance" id="source-closure"><h2>Sources behind this record</h2><p>Sources and snapshots used by this profile are listed here and in the <a href="/sources">source ledger</a>.</p><ul>{page.sourceClosure.sources.map(s => <li key={String(s.id)}><a href={s.homepageUrl}>{s.name}</a> · {s.authority}</li>)}</ul>{page.sourceClosure.snapshots.map(s => <p key={String(s.id)}><a href={s.sourceUrl}>{String(s.id)}</a> · retrieved {fmtDate(s.retrievedAt)} · {s.usageStatus}</p>)}</section>
    <section className="record-section correction-callout" aria-labelledby="correction-heading"><p className="eyebrow">RECORD REVIEW</p><h2 id="correction-heading">See something to correct?</h2><p>Submit a correction for this release. The cited release remains immutable; reviewed changes may appear only in a later release.</p><a className="button" href={`/corrections?release=${encodeURIComponent(String(page.release.id))}&seat=${encodeURIComponent(page.identity.id)}`}>Submit a correction</a></section>
  </main></Shell>;
}

function officeLabel(kind: "house_voting" | "house_delegate" | "resident_commissioner" | "senate") { return ({ house_voting: "Voting member", house_delegate: "Delegate", resident_commissioner: "Resident Commissioner", senate: "Senator" })[kind]; }
