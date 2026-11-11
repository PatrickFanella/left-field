# Nationwide office coverage inventory v1

`src/office-universe/coverage-inventory.ts` produces a machine-readable matrix for the 50 states and the District of Columbia. It reads only pinned retained artifacts. Its output keeps three different kinds of evidence separate:

- State-legislative roster-person rows.
- Historical state-legislative and local election contests.
- Government-unit discovery source configuration.

Regenerate the checked-in JSON report with `npm run data:coverage`, or verify it without writing with `npm run data:coverage:check`.

The matrix does not label a jurisdiction, office family, roster row, or contest set complete. It records the NCSL statewide legislative-seat count separately from the roster-person count, and cross-checks DC's 13 Council seats against the District charter. That legislative-only denominator must not be read as a denominator for every elected office in a jurisdiction. Names in the legislative roster are not promoted to current-holder identities.

The retained [NCSL table](https://documents.ncsl.org/wwwncsl/Elections/Legis_Control_2025_4.30.25.pdf) is dated April 30, 2025; the retained roster is dated September 24, 2026. The table counts 7,386 state legislative members and 13 DC Council members. The [official DC Code](https://code.dccouncil.gov/us/dc/council/code/titles/1/chapters/2/index.full.html) independently states the Council membership. Roster differences across these dates may reflect vacancies, source omissions, or different treatment of nonvoting members. The report does not interpret a numerical delta as a vacancy or a missing seat.

The current evidence boundary is deliberately visible in the output: state-legislative roster and general-results artifacts cover all 51 tracked jurisdictions; the NCSL table supplies an authorized legislative-seat count for each of those jurisdictions; and local historical artifacts currently cover Indiana, New Mexico, and North Carolina. North Carolina's primary, general, soil-and-water, and sanitary-district artifacts remain separate records rather than being collapsed into one number. Township and local-judicial families are explicit acquisition categories. Census government-unit discovery is configured for the 50 states but has no retained unit snapshots, and DC is not yet registered in that discovery registry.

US territories and tribal nations are listed as separate scopes rather than silently omitted. Their public office and election sources, jurisdiction identifiers, and selection rules need separate inventories. Federal coverage remains a separately qualified release and is not projected into this operational state/local inventory.

The existing discovery registry points its 50 state slots at the Census Government Units Survey page. The Census says that survey was discontinued in 2025, so the inventory marks those slots as requiring replacement rather than treating their configuration as active discovery coverage.

The next acquisition sequence for each jurisdiction is: replace the discontinued discovery source with a current Census government-organization source and retain a snapshot; identify elected bodies and their office-selection methods; retain official office, term, and election evidence; then record a sourced seat denominator before calculating completeness.
