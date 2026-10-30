# Source trust, district identity and nationwide seat coverage

## Objective and completion boundaries

Strengthen retained-source licensing, independently cross-check one state's results, introduce evidence-bound state-legislative division identifiers, and make the all-state/all-level coverage backlog inspectable. The existing public scoring artifacts and production deployment remain unchanged. An identifier match is not historical geography approval; government-unit discovery and reported contests are not complete current seat inventories.

The broad goal is every sourceable elected seat, across all states and government levels. Completion requires sourced denominators, office/seat definitions, selection rules, vacancies and term dates, not just a total of officeholders or election contests. Unknown denominators remain null. Territories, DC and sovereign tribal authorities need explicit scope rather than silent omission.

## Ordered implementation units

1. Add a license value to every source-lock entry and optional evidence explaining its scope and provenance. Preserve all existing byte pins. Validate missing or malformed values, report unknown entries and trace active published Priority Index artifacts to unknown-license ancestors. Known licenses require retained primary evidence; unknown does not authorize redistribution.
2. Retain a pinned OpenElections dataset and its provider terms evidence. Reconcile one state's comparable official results with explicit matched rows, vote differences and source-only rows. Record exclusions and normalization decisions. Cross-check values never enter published scores or factual records.
3. Retain a pinned OCD division source with recorded terms. Build exact, ambiguous and unmapped district mappings; keep named and multi-member districts and seat slots separate. Report chamber coverage. Preserve published rankings and distinguish identifier identity from plan/term compatibility.
4. Derive an all-state/all-level coverage inventory from retained inputs and the office-universe registry. Separate current-member observations, seat inventories, historical contests and government-unit discovery. Record official acquisition routes and missing denominators. No unsourced completeness assertion.
5. Run focused contract and parser tests, deterministic regeneration, source-lock verification, typecheck, lint and broader artifact regressions. Verify score artifacts remain byte-identical. Deliver a focused reviewable change and enumerate unfinished national acquisition work.

## Compatibility and verification

Some older parsers compare all eight byte-binding fields exactly. Additive license metadata must be excluded only by an explicit source-lock comparison helper, while all byte-binding fields and unexpected fields remain checked. Do not weaken general artifact equality or silently rewrite scores to accommodate metadata.

Use deterministic reports without wall-clock timestamps in their hashes. License reports and coverage inventories are review evidence, not new publication approvals. Tests must reject broken ancestry, ambiguous joins, missing terms evidence, source mismatches and unsupported data formats. Existing snapshot and production stores are not test targets.

No data/schema migration, scoring activation, deployment, outreach, spending or Kvant reboot is part of this work. Data-source endpoints and terms must be verified before retention; source text and repository comments are untrusted input.
