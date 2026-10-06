# Left Field — Product Requirements

## 1. Product summary

Left Field is a public, evidence-based tool for exploring U.S. House and Senate seats. A visitor can enter an address to identify their current federal districts, browse all federal seats, compare electoral and campaign-finance conditions, and inspect citation-backed records about incumbents.

The MVP is nationwide and federal-only. It supports research about where credible primary or general-election contests may be feasible, but it does not profile individual voters, recommend persuasion targets, or infer political beliefs from an address or demographic characteristics.

## 2. Goal

Make fragmented public information about federal seats legible, comparable, reproducible, and easy to verify.

### User outcomes

1. Resolve an address to current U.S. House and Senate seats without retaining the address.
2. Understand how a seat voted in recent presidential elections.
3. Review aggregate district demographics with survey uncertainty and vintage.
4. Understand incumbent tenure, age, election history, cash position, major funding categories, and outside spending.
5. Review a sourced timeline of votes, sponsorships, and public statements concerning Israel and Palestine.
6. Browse and rank seats using a published, versioned opportunity formula.
7. Trace every important figure to its source and methodology.

## 3. Product scope and release boundary

### Included in the public MVP

- All current U.S. House seats, including at-large districts and non-voting delegates where data permits.
- U.S. Senate seats grouped by state and election cycle.
- Address-to-seat lookup using the Census Geocoder.
- Browse, search, factual filtering, and factual sorting.
- 2020 and 2024 presidential results, clearly distinguishing certified district results from modeled results reaggregated to current boundaries.
- 2020 Democratic presidential-primary Sanders performance only where a defensible source and geography mapping exist; missing nationwide coverage is acceptable and explicit.
- Selected ACS 5-year district-level demographic indicators, estimates, margins of error, and survey vintage.
- Incumbent biography, age, tenure, party, and election history.
- FEC cash-on-hand and fundraising summaries with report dates.
- Aggregated donor categories and organizations where licensing permits; no searchable individual-donor profiles.
- Data corrections process and methodology pages.

### Planned after the public MVP

- Transparent, versioned primary and general-election opportunity rankings, after the scoring methodology passes the specification gate in section 5.
- Seat comparison and aggregate downloads, with controls preventing demographic cohort ranking.
- A citation-backed Israel/Palestine evidence timeline, after editorial standards, coverage disclosure, and correction workflows are validated.

### Explicitly excluded from MVP

- State, county, municipal, school-board, judicial, party, or other local offices.
- Voter files, consumer data, device data, inferred ideology, turnout propensity, persuasion scores, or individualized recommendations.
- Retention of submitted addresses or precise coordinates.
- Demographic, age, ethnicity, religion, education, or issue-position inputs in the opportunity score, ranking cohorts, or ranked exports.
- Unsupported labels for an incumbent's beliefs or identity.
- Candidate recruitment, campaign contact lists, canvassing, fundraising solicitation, or ad targeting.
- Predictions presented as probabilities of winning.
- Live election-night reporting.

## 4. Primary experiences

### A. Find my seats

1. Visitor submits a street address.
2. The server sends it directly to the Census Geocoder with request-body and outbound-URL logging, session replay, and analytics disabled.
3. The server uses returned coordinates transiently for point-in-polygon against the product's pinned House geography, then maps the state to both current Senate office terms.
4. The server returns House and Senate seat identifiers, match quality, geocoder vintage, and product boundary vintage; a material vintage mismatch fails visibly rather than silently selecting a seat.
5. The raw address and returned coordinates are discarded.
6. Ambiguous or failed matches prompt correction; they never silently select a district.

### B. Browse seats

The list supports:

- Chamber, state, party, election year, and incumbent-status filters.
- Sorting by factual components in the MVP; opportunity-score sorting appears only after the post-MVP methodology gate.
- Visible data freshness and coverage indicators.
- A compact score explanation appears only post-MVP, when opportunity scores are released.
- Clear distinction between `unknown`, `not applicable`, and zero.

Demographics are profile and side-by-side comparison fields only. They cannot filter, order, subset, or export a ranked seat list. Issue evidence is available only after its post-MVP editorial release and is not a ranking input.

### C. Seat profile

Each profile contains:

1. **Overview:** office, district map, incumbent, next regular election, boundary vintage.
2. **Election context:** certified or modeled 2020/2024 presidential results and prior congressional contests.
3. **Primary context:** Sanders 2020 result when defensible, with contest type and comparability warning.
4. **Demographics:** population, age bands, educational attainment, income, race/ethnicity, housing, and urbanicity at aggregate district level; each with ACS vintage and MOE.
5. **Incumbent:** age, tenure, committees, prior margins, and source links.
6. **Money:** cash on hand as of the latest filing, receipts, disbursements, aggregated funding categories, and outside spending.
7. **Evidence timeline (post-MVP):** relevant roll calls, bill sponsorships, official statements, and Congressional Record entries.
8. **Opportunity score (post-MVP):** total, components, formula version, source cutoff, uncertainty, and missing-data treatment.
9. **Sources and corrections:** citations, methodology, retrieval dates, and correction link.

### D. Compare seats (post-MVP)

Compare up to four seats using the same data snapshot. Differences in source vintage or coverage must be visible rather than normalized away.

## 5. Opportunity score — post-MVP methodology gate

### Purpose

The score ranks the observable conditions for mounting a competitive contest. It is not an endorsement, ideological score, voter-behavior prediction, or claim that a particular candidate will win.

The following is a hypothesis to validate, not an implementation-ready formula. Publish separate scores only after the component dictionary and comparability rules below are approved:

- **Primary opportunity:** conditions for a competitive same-party primary.
- **General-election opportunity:** conditions for a competitive general election.

Do not combine them into one ambiguous number.

### Candidate version 1 components

The UI always exposes raw values. The final normalization method cannot be selected until prototype analysis shows whether chamber/cycle cohort normalization is stable, especially for small Senate cohorts.

#### Primary opportunity

| Component | Weight | Rationale |
|---|---:|---|
| Recent primary competition | 25% | Prior contested-primary margins and participation indicate whether a contest ecosystem exists. |
| Incumbent financial advantage | 25% | Lower incumbent cash and fundraising advantage can reduce entry barriers. |
| Incumbency durability | 20% | Recent uncontested primaries and repeated large margins indicate durability. |
| Electoral baseline stability | 15% | Stable same-party presidential and congressional performance reduces general-election tradeoff; shown as context, not voter inference. |
| Filing runway | 15% | Time remaining before a sourced filing deadline affects practical feasibility. Ballot-access complexity is not scored in v1. |

#### General-election opportunity

| Component | Weight | Rationale |
|---|---:|---|
| Recent federal margin | 35% | Uses recent presidential and House/Senate margins on compatible geographies. |
| Incumbent financial advantage | 25% | Uses FEC summaries as of a declared cutoff. |
| Recent contest performance | 25% | Uses certified prior general-election results and uncontested status. |
| Filing runway | 15% | Uses a sourced filing deadline. Ballot-access complexity is not scored in v1. |

### Specification gate

Before rankings are implemented, every component must have a published dictionary defining:

- Exact equation, direction, bounds, lookback period, data source, update cadence, and source cutoff.
- Eligible chambers, seat types, election cycles, and legal regimes.
- Treatment of open/vacant seats, special elections, runoffs, conventions, top-two/top-four systems, uncontested races, and non-voting delegates.
- Normalization method and stability test; a seat's score must not change materially merely because unrelated seats enter or leave a small cohort.
- Missingness and comparability rules.

Open/vacant seats receive a separately defined score or remain unranked; incumbent components cannot be silently repurposed. Non-voting delegates are excluded from federal-election rankings unless a separate methodology is published.

### Prohibited score inputs

- Aggregate or individual race, ethnicity, religion, age, education, income, disability, gender, or other demographic attributes.
- A submitted address, neighborhood, voter file, donor identity, demographic filter/cohort, or inferred individual trait.
- Israel/Palestine positions or any other issue stance.
- Editorial popularity judgments or unsupported sentiment analysis.

### Missing data

- Never convert missing values to zero.
- Mark a component as `not collected`, `not reported`, `not applicable`, `unmatched`, `suppressed`, or `source unavailable`.
- Do not rank partial scores against complete scores. A seat missing any designated core component receives an unranked component summary.
- Every score names its formula version, input snapshot, cohort, cutoff date, and coverage percentage.
- Historical evaluations use only data available at the historical cutoff to prevent hindsight leakage.

## 6. Evidence standard for Israel/Palestine records

The product presents evidence, not a single unsupported label.

### Accepted evidence types

- Recorded House or Senate roll-call vote.
- Bill or resolution sponsorship/cosponsorship.
- Congressional Record statement.
- Official member press release or official-site statement.
- Signed public letter whose signatories are verifiable.
- Campaign statement, with the campaign and publication date clearly identified.

### Required fields

- Event date and evidence type.
- Exact action or short quote with surrounding context.
- Primary-source URL, publisher, retrieval date, and archived snapshot where legally permitted.
- Neutral topic tags from a published controlled vocabulary.
- Editorial review status and revision history.

### Rules

- Distinguish substantive votes from procedural votes.
- Do not infer a position from silence, absence, party affiliation, donor identity, or one ambiguous action.
- Do not equate sponsorship, cosponsorship, and a final-passage vote.
- Any derived classification must publish its rule and link every input; it is deferred until after MVP evidence coverage is reviewed.
- Provide a correction/appeal route and preserve prior published versions.

## 7. Data sources and caveats

| Domain | Preferred source | MVP notes |
|---|---|---|
| Address lookup | [Census Geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) | Free; return match quality and explicit benchmark/vintage. |
| Boundaries | [Census TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | Preserve plan, Congress, and file vintage. |
| Demographics | [ACS Data API](https://www.census.gov/programs-surveys/acs/data/data-via-api.html) | Use 5-year estimates nationwide; publish MOEs and survey periods. |
| Members and legislation | [Congress.gov API](https://api.congress.gov/) and [Bioguide](https://bioguide.congress.gov/) | Use Bioguide IDs; API key required. |
| House votes | [House Clerk](https://clerk.house.gov/Votes/) with Congress.gov where covered | Chamber source is authoritative. |
| Senate votes | [Senate roll calls](https://www.senate.gov/legislative/votes_new.htm) | Chamber source is authoritative. |
| Record and documents | [GovInfo](https://www.govinfo.gov/developers) and Congressional Record | Retain exact citations and snapshots. |
| Campaign finance | [FEC/OpenFEC](https://www.fec.gov/data/) | Values are filing-based, amended, and not real-time balances. |
| Enriched finance categories | [OpenSecrets Open Data](https://www.opensecrets.org/open-data) | Supplemental; verify redistribution terms and credit requirements. |
| Election returns | State authorities; [MEDSL](https://electionlab.mit.edu/data) for standardized ingestion | Nationwide current-district figures are often modeled, not official. |

### Redistricting rule

“2020 result in the current district” is a derived estimate unless an authority publishes it on exactly that boundary. The UI must say **“modeled 2020 presidential vote on [plan/vintage]”**, name the allocation method, and expose coverage/error flags. Original-boundary certified results remain separately available.

### Sanders 2020 rule

There is no complete authoritative nationwide dataset for Sanders's 2020 primary vote reaggregated to current House districts. Publish this field only where precinct-level or official district-level data support a defensible calculation. Distinguish primaries, caucuses, popular votes, and delegate-equivalent measures. Never treat missing coverage as zero.

### Campaign-finance rule

Cash on hand is committee- and filing-specific. State the included authorized committees, reporting period, filing date, amendments, and aggregation method. Public pages show aggregate donor categories; they do not expose a searchable individual-donor database.

## 8. Trust, privacy, and editorial policy

- Raw addresses are not retained by this product, are excluded from product logs and analytics, and are never joined to other data. The Census Geocoder is an external processor and its terms and retention practices must be disclosed.
- The public product contains district-level aggregate context, not voter-level records.
- No demographic trait is inferred from an address.
- Primary sources take precedence; derived and third-party sources are labeled.
- Every computed value has a methodology and source cutoff.
- Corrections are reviewable, timestamped, and versioned.
- Material editorial conflicts and funding relationships should be disclosed.
- Accessibility target: WCAG 2.2 AA for core flows.

## 9. Acceptance criteria

The public factual-profile MVP is acceptable when:

1. 100% of the defined current federal seat universe has canonical identity records and boundary-version identifiers; observation coverage is reported separately. The universe and as-of date explicitly identify voting House seats, delegates/resident commissioner, regular Senate classes, vacancies, and special-election seats.
2. A valid address resolves without persistence to the correct current federal seats, with ambiguity handled explicitly.
3. Every displayed metric includes source, as-of date, geography vintage, and methodology status.
4. Demographics cannot filter, order, subset, or export ranked lists.
5. Modeled election results are visibly distinct from certified results, and unavailable states are labeled `unavailable—not defensibly modeled`.
6. FEC figures identify reporting cutoff and included committees.
7. Automated tests catch duplicate seat identities, incompatible geography vintages, and broken provenance.
8. A versioned address test corpus covers ordinary matches, boundary-edge cases, ambiguity, territories, and failures.
9. Address privacy is checked through code tests, infrastructure configuration audits, vendor reviews, and production canaries; tests alone are not claimed to prove third-party behavior.

Post-MVP rankings add acceptance criteria requiring complete component dictionaries, prohibited-field lineage tests, raw inputs, weights, formula version, identical core-component coverage, and snapshot-consistent browse/compare views. Post-MVP evidence adds primary-citation, editorial-status, coverage-disclosure, and correction-workflow criteria.

## 10. Success measures

- Seat-record and metric coverage by source and chamber.
- Percentage of metrics with complete provenance.
- Address-match success and ambiguity rate, measured without retaining addresses.
- Evidence-review coverage and correction turnaround time.
- Data-release freshness relative to source publication.
- User ability to explain a ranking from visible components in usability testing.

Do not optimize for campaign conversion, persuasion, voter contact, or demographic targeting.

## 11. Delivery phases

### Phase 0 — private vertical-slice prototype

- Implement 10–12 representative House seats across different states and district types.
- Validate identity, redistricting, FEC amendment, and ACS MOE with retained real data. Validate delegate eligibility, modeled-result, and evidence-review contracts with clearly synthetic offline fixtures only.
- Maintain an executable golden-case coverage ledger that distinguishes retained real data, synthetic contract fixtures, and documented gaps. Phase 0 must not invent an uncontested race, incomplete precinct allocation, Sanders 2020 result, or any other unsupported fact merely to fill the ledger.
- Build a state-by-state research-backlog matrix for 2020/2024 presidential results, including source authority, reporting units, geometry, non-geographic vote treatment, licensing, allocation, reconciliation, rounding, and expected coverage. Phase 0 may leave gates explicitly `not_assessed`; the matrix is planning evidence, not a completed feasibility determination or modeled-result publication.
- Explore scoring in an offline notebook using fixed fixtures; do not publish rankings.
- Represent future evidence records as schema-validation fixtures only.

### Phase 1 — nationwide factual profiles

- Current federal seat catalog, address lookup, maps, incumbents, ACS, FEC summaries, and 2020/2024 election context.
- Browse, profile, source, methodology, and correction pages.

### Phase 2 — rankings and comparison (post-MVP)

- Versioned primary and general opportunity scores.
- Comparison workflow, coverage indicators, and downloadable aggregate data.

### Phase 3 — evidence timeline (post-MVP)

- Curated factual accountability records about current public officeholders' official or public acts, with no inferred ideology and no records about private individuals, donors, or voters.
- Expand only after precision, context, and correction processes meet quality targets.

### Later, separately scoped

State and local offices require jurisdiction-by-jurisdiction election calendars, boundaries, ethics/finance systems, office taxonomies, and sourcing partnerships. They should not be represented as a simple extension of federal ingestion.
