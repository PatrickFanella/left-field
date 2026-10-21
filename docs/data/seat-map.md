# Seat map

`/map` draws every seat in the Priority Index on a U.S. map. A reader can switch between the U.S. House, the U.S. Senate, governors, state senates and state houses, and color the map by party or by priority score. Selecting a district or state opens a panel with the seat holder, the score, a link to the seat brief, and for House and Senate races the candidates registered with the FEC.

## Data

| Layer | Source | Updates |
|---|---|---|
| Boundaries | Census cartographic boundary files, GENZ2025: `cb_2025_us_state_5m`, `cb_2025_us_cd119_500k`, `cb_2025_us_sldu_500k`, `cb_2025_us_sldl_500k`, retained under `data/source/census-cb2025/` | Rebuild by hand when the Census Bureau publishes new files or a state redistricts |
| Seats and scores | The Priority Index release, through `getDefaultPriorityRepository()` | With each release |
| Candidates | The FEC candidate master and candidate summary named in `data/metadata/refresh-inputs.json` | With each weekly `rapid:refresh` |

Candidate lists contain statutory candidates (FEC status `C`) for the refresh cycle. That includes people who lost a primary or withdrew, so the list is not the general-election ballot. Governor and state-legislative candidates do not file with the FEC, and their panels show the current holder only.

## Rebuilding the boundaries

```bash
npx tsx scripts/build-national-map.ts --pin
npm run data:verify
```

The script projects each layer with mapshaper's `albersusa` (Alaska and Hawaii inset), simplifies it, and writes SVG path strings in one shared frame:

- `public/map-data/national-v1.json`: 51 state outlines (with DC) and 435 House districts
- `public/map-data/state-legislative/<st>-v1.json`: upper and lower districts for each state with a legislature

The output is deterministic. `--pin` records each file in the source lock with its Census parents. Territories are left out. The projection drops the Aleutian parts west of 180° and a few remote islets.

## Joining seats to shapes

`src/lib/map-district-key.ts` reduces both sides to one key. House districts use the state code and a two-digit district, with `00` for at-large; the index's `AL` maps to `00`. State-legislative districts use the Census `NAME` and the index district code without its chamber letter, upper-cased, with "and" and punctuation dropped and leading zeros removed. Idaho's House seats A and B share one district. `src/lib/national-map.test.ts` fails if any scored seat has no polygon.
