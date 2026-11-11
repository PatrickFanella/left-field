# Idaho House district and position identities

The official [House membership page](https://legislature.idaho.gov/house/membership/) lists positions A and B in each of 35 districts. The retained [Idaho Code section 34-614A](https://legislature.idaho.gov/statutesrules/idstat/Title34/T34CH6/SECT34-614A/) requires candidates to identify a specific position and provides for separate ballot positions within each district. The pinned OCD file identifies those districts with numeric `sldl` identifiers.

The crosswalk now handles Idaho House labels such as `10A` and `10B` as separate positions sharing district 10's division identifier. It preserves raw district labels, original seat IDs, OpenStates person identifiers, and existing numeric seat slots. The added `districtSeatPosition` records A or B explicitly. This rule applies only to Idaho's lower chamber and districts 1–35; other states' letter suffixes keep their existing meaning. Multiple possible divisions remain ambiguous. Historical boundary compatibility stays unreviewed.

All 70 Idaho House observations now map to 35 shared district divisions. Nationwide, 7,094 of 7,344 observations map, with 250 unmapped and zero ambiguous in these inputs. No roster or score artifact changes.

The membership page contains address-bearing biographies, so its full bytes are nonretained. Its byte size and SHA-256 are locked under `idaho-house-membership-20261030`. A retained extract contains only the 70 district/position pairs, schema, source ID and source digest. It carries no names, addresses or contact details. The retained statute and filtered extract are both byte-verified before the crosswalk builds. Source reuse terms remain unknown.

To reproduce the extract, obtain the exact locked membership snapshot outside the repository and run:

```sh
npx tsx scripts/generate-idaho-house-position-labels.ts --input /path/to/nonretained-membership.html
npm run data:identity:state-seats
npm run data:licenses
```

The extractor rejects changed source bytes or a missing district/position pair. Report-only offline verification needs no copy of the full membership page:

```sh
npm run data:identity:state-seats:check
npm run data:licenses:check
npm run test:run -- src/rapid-acquisition/idaho-house-seat-authority.test.ts src/rapid-acquisition/state-legislative-ocd-division.test.ts src/rapid-acquisition/source-license-report.test.ts
```
