# Priority Index v1.16 — 2026-10-23

## Outcome

State-legislative result coverage now includes all 50 states plus DC, with 8,163 retained general-election contests. Of 7,344 sitting roster members, 6,829 are scored (3,076 Democratic and 3,753 Republican), up from 6,024. The other 515 remain explicitly unscored: 440 have no compatible retained district contest, 58 have no major-party baseline, and 17 have a holder party outside the current scoring routes. No seat remains `state_not_covered`. These are jurisdiction and retained-result counts, not complete nationwide seat-level baseline coverage.

House v0.11, Senate v0.1, governor v0.1, the September 24 roster and finance inputs, and the score formulas are unchanged. Local-office expansion is deferred by the owner's instruction.

| Added jurisdiction | Official source | Retained contests | Roster seats scored |
| --- | --- | ---: | ---: |
| Alabama | Certified November 28, 2022 statewide canvass, pinned PDF/layout text | 140 | 140 |
| DC | Board of Elections certified precinct CSVs, 2022 and 2024 | 11 | 11 |
| Louisiana | Secretary of State November 18, 2023 general-runoff workbook, all sheets | 20 | 20 |
| Mississippi | Official 2023 statewide recapitulation, pinned PDF/layout text | 174 | 169 |
| Nebraska | Board of State Canvassers 2022/2024 books, pinned PDF/layout text | 50 | 0 |
| New Hampshire | All 26 sheets from eleven official 2024 legislative workbooks | 226 | 404 |
| Oklahoma | State Election Board browser race-level CSV exports, 2022 and 2024 | 82 | 61 |

Reading rules and limits:

- Louisiana's November returns cover runoff races. October majority elections and unopposed seats are not relabeled as general-election contests or filled from the holder roster. The 122 roster members without a November baseline remain unscored.
- Oklahoma omits unopposed candidates from the general ballot. The 86 roster members with no retained matching contest stay unscored. The 2024 Senate District 46 unexpired-term contest retains its special-general classification.
- Nebraska's 49 districts are represented by 50 contests, including the 2022 District 31 two-year election superseded by 2024. The source's nonpartisan labels are preserved; no inferred D/R affiliations or margins enter the score.
- DC's two at-large groups retain separate 2022/2024 positions. Ward, at-large, and chairman records use Council labels. Council shapes use the already retained Census 2025 upper-chamber ward boundaries and DC outline, with citywide positions drawn before wards. The shared upper/unicameral map/filter group includes DC Council explicitly.
- New Hampshire maps also include the 39 floterial districts from the state Office of Planning and Development shapefile linked on its Political Districts page. Census base districts remain unchanged, and every scored seat now has a map polygon. These districts overlap base districts by design.
- New Hampshire's Strafford 4 recount replaces the original figures explicitly printed in the same workbook. County names and source-stated multi-member seat counts remain intact. Published workbook counts describe votes and contest seats; the Open States roster describes current holders and may omit vacancies. The retained county workbooks are the result source; separate recount sheets and later special elections have not been exhaustively reconciled.
- These sources do not refresh the September 24 identities, acquire missing chamber cycles in earlier states, or establish complete current special-election coverage. Term lengths remain chamber defaults; special-election term ends are not modeled. Two additional roster-versus-result party differences are flagged for NH Belknap 6 and Sullivan 6; the source and roster labels are both retained.

Reproduce the workbook extracts with `npx tsx scripts/rapid/retain-state-workbook-sheets.ts NH` and `... LA`. They require LibreOffice only at acquisition time. Original source bytes and deterministic extracts are pinned together; production and tests read the retained bytes.

## Immutable outputs

- `rapid-state-legislative-primary-context-v1`: 19,004 bytes; SHA-256 `e93024ea3dabbf5f07762dd85a0ae4688822882e39b8fade133c97870acf7e89`; package `0da8bd2a52533aa29995b477b4df70f485b810f6021c2ef796a7e4f6745d7658` (unchanged)
- `rapid-house-primary-2024-incumbent-evidence-v2`: 26,734 bytes; SHA-256 `4cd439117287831277f9aff40842c598c04ddd33c9cd1348dafe739e38aa76d2`; package `4b6407987d7cfbe1ec2d16c3a79edb96f1237bd75d1a02903532e923d99226b7` (unchanged)
- `house-score-v09-active-projection-v1`: 507,956 bytes; SHA-256 `cdbefeef90ef0d606ac6f892e4f14bb92e03975cd209d97745fa44eca6d73bd1`; package `b10ae4d65e815c1d207f9f87660082770db4783ea9a0e4515a8ee32df5e1a4b4` (unchanged)
- `statewide-presidential-2024-v1`: 17,342 bytes; SHA-256 `a5d4b06343a7f542d11e6529729945e8554e51e41228295cc7e94fb096674959`; package `e41c1361f9a93e481e14bba9b017cac282360c3b27aa8cd34a8d1746338bd24f` (unchanged)
- `senate-score-v01-projection-v1`: 208,922 bytes; SHA-256 `da12b66ad7586f8b93335382fbbfa72f2087dc992078fd26f487d0659f68e8ce`; package `ee06b046168eff55867bbb916b201dca58998808d2aba5ec851b7e26ecfe2c2d` (unchanged)
- `house-score-v10-active-projection-v1`: 373,592 bytes; SHA-256 `dc7d05776f71ca8c477b3f60e0be3945bcdf3d3e481378a6bc7f62d586cceca8`; package `2ef951affcd6d98b1ead93cf35d402d26bb0cdd44755440a31ace97bdc8cc402` (unchanged)
- `house-incumbent-candidacy-v1`: 181,474 bytes; SHA-256 `c0d4b60778aba1132ae5513c090243e236f32646859b7b0d6e90ed011ee60620`; package `bfde20b699e4a804a8cb1a522da45531f22cfb28e16df79857bfc26b93f40540` (unchanged)
- `house-score-v11-active-projection-v1`: 246,453 bytes; SHA-256 `b60f340316e371e4f288927e896145bc3e937c8c1e998e618df911a9977b85d4`; package `d4090aaeb4d8604de0e14479416b65268928ec61f40b914faf04b6dc49314834` (unchanged)
- `governor-score-v01-projection-v1`: 100,920 bytes; SHA-256 `9828838a28751867768cf3704b965eddff106297e6f73bc4278e62c9f9e67e4d`; package `13d86586c6fb0ace141597cad1abfa0d5fe966368b872110991161473575aabb` (unchanged)
- `state-legislative-roster-v1`: 6,093,010 bytes; SHA-256 `00be4090582f8b5b9e2a6cde80a767ded8b3a806bd6b469da1fff36c88d2264b`; package `aebf57452e4e6ad9eb0bc69b8886db2951e21f0cae5d50ad84cfd916d3477199` (unchanged)
- `state-legislative-general-results-v1`: 8,388,343 bytes; SHA-256 `f54c34df6b02da27a982f2cea1232981a50dbdface9a826c5f74cc18e75364fd`; package `9f45ab2021824f281ebd319a963de384f97de3debd594589c29434188ebe5b7c` (unchanged)
- `state-legislative-score-v01-projection-v1`: 14,237,998 bytes; SHA-256 `1a73d3a1d5057ed56214ae0a6d8bb1b61b8cb2866592f1dd49d306879ad7c5f1`; package `17baaf8157b8d031084bdab4c048301e37072fb6c011f24f735175f22dbf6ab0` (unchanged)

## Reproduction

```sh
npm run rapid:refresh -- --date 2026-09-24 --skip-download
npm run rapid:publish -- --version v1.16 --date 2026-10-23
npm run data:verify
npm run test:fast
```

## Local validation

On Kvant, the source-lock verifier passed all 1,595 entries; 139 fast checks and 28 focused general-result/scoring checks passed. Typecheck, lint, production build and `git diff --check` passed. Map checks require a polygon for every scored seat, including DC and New Hampshire floterials. The built application rendered v1.16, New Hampshire results, and DC council results through the T3 browser. The build still reports existing broad file-tracing warnings, and the fast suite emits PDF fixture diagnostics while passing.

These are local checks. Hosted CI and production activation are recorded separately in the deployment receipt.
