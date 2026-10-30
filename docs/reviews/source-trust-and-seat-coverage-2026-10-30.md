# Source trust and state-seat coverage

This change adds review evidence for licensing, independent result comparisons, district identifiers, and nationwide seat acquisition. The frozen roster, published score packages, release pointer, database, and deployed service are unchanged.

## Rights attached to retained bytes

Every committed source-lock entry now records `license`. An unassessed or unresolved license is `unknown`. A known value needs scoped evidence with a source URL, review date, and explanation. Retained evidence can be referenced by its own source-lock ID. Repository software licenses cannot be used to license separate data files.

The OpenStates people repository explicitly dedicates its people data under CC0-1.0. Congress Legislators and the pinned Open Civic Data identifier repository also supply CC0 evidence. Their retained license and README files support the corresponding entries. These annotations record provider terms; they do not certify current officeholders, geographic compatibility, or third-party rights.

MEDSL and OpenElections election data remain `unknown` where no scoped redistribution grant was established. Citation instructions, public access, and a license in a different software repository do not establish data terms. The new metadata does not grant publication or redistribution approval.

`npm run data:verify` checks every retained hash and size, validates rights evidence, rejects broken or cyclic lineage, and lists every unknown-license entry. New builders serialize unresolved rights as `unknown`; the common upsert helper carries reviewed terms forward only when the full content pin is unchanged. Older frozen builders compare the original content fields through an explicit helper that excludes only `license` and `licenseEvidence`. Every other field, including unexpected fields, still participates in the comparison; general artifact equality is unchanged.

`npm run data:licenses` regenerates [the dependency report](source-license-dependency-report-v1.json); `npm run data:licenses:check` checks it without writing. The report reads the byte-verified active release descriptor to find published chamber roots. Its refresh configuration is reported separately: retaining a research source in refresh configuration does not mean its values enter a published chamber score. Derived outputs retain all unknown-license ancestors even if their own terms are recorded. This report follows declared `parentIds`; it does not invent missing provenance.

## Independent result comparison

The [Arizona review](arizona-2024-general-openelections-crosscheck-v1.md) compares the retained 2024 signed-canvass transcription with pinned same-election OpenElections files for all fifteen counties. Candidate matches require the same chamber, district, party, and a documented name normalization. Spelling differences stay source-only; numerical differences stay visible. The official canvass remains controlling, and comparison values never enter the score or factual-record builders.

OpenElections has no North Carolina 2024 results file in either pinned NC repository inspected for this work. Its 2020 file cannot validate the retained 2024 NCSBE totals. A North Carolina comparison remains pending a same-election source; Arizona supplies a working same-election reconciliation without disguising that gap.

## District identity and seat completeness

The [OCD crosswalk](state-legislative-ocd-crosswalk-v1.json) joins retained roster observations to retained division identifiers. It preserves raw labels and separate slots in multi-member districts and reports every chamber's mapped, unmapped, and ambiguous observations. A common division identifier does not establish that two election years use the same boundaries. Plan compatibility remains `unreviewed`, and no crosswalk result changes a ranking.

The [nationwide inventory](nationwide-office-coverage-inventory-v1.md) separates roster people, historical contests, authorized legislative-seat counts, and government-unit discovery. Authorized counts are dated source observations, not proof of today's vacancies or complete current officeholders. Statewide executive, judicial, county, municipal, township, school, and special-district acquisition still needs office definitions, selection rules, terms, and sourceable denominators. Unknown all-office totals remain null.

The Census Government Units Survey page currently configured in the discovery registry states that the survey was discontinued. Those configured slots are marked as needing replacement, not as retained coverage. The next acquisition work is a current government-organization directory, followed by jurisdiction-specific elected-body and office authority. Territories and tribal governments remain explicit additional scopes.

## Reproduction

```sh
npm run data:verify
npm run data:licenses:check
npm run data:crosscheck:az:check
npm run data:identity:state-seats:check
npm run data:coverage:check
```

These are local review artifacts. Full national seat acquisition, historical plan qualification, production activation, and deployment are separate work.

Primary evidence: [OpenStates people dedication](https://raw.githubusercontent.com/openstates/people/118f6813e026526f638e84cfbb70088195098191/README.md), [Congress Legislators license](https://raw.githubusercontent.com/unitedstates/congress-legislators/15530b7d621009eb5fc7eda67f75194d7d91f8c1/LICENSE), [OCD identifiers license](https://raw.githubusercontent.com/opencivicdata/ocd-division-ids/f1ab837759a241279c66b066d2fc40190a0eb3de/LICENSE.md), [OpenElections NC data tree](https://github.com/openelections/openelections-data-nc/tree/a129ab6d2fca3c481fa3eafbe660c6530904ee18), [OpenElections NC raw-results tree](https://github.com/openelections/openelections-results-nc/tree/420bd46d3cab524087f6083b551a9854a0df16bc), and [Census GUS status](https://www.census.gov/programs-surveys/gus.html).
