# Priority Index v1.15 — 2026-10-21

## Outcome

House layer v0.11, Senate and governor layers v0.1 unchanged. State-legislative layer v0.1 adds Minnesota, New Mexico, North Dakota and South Dakota, reaching forty states.

## State-legislative layer v0.1, eighth batch

| State | Source | Contests | Cycles | Uncontested | Seats scored (D / R) | Unscored |
|---|---|---|---|---|---|---|
| MN | Secretary of State results text files: 2024 House, 2022 Senate, 2024 Senate District 45 special | 202 | 2022, 2024 | 13 | 200 (101 / 99) | 0 |
| ND | Secretary of State statewide legislative results pages, 2024 and 2022 | 119 | 2022, 2024 | 55 | 141 (16 / 125) | 0 |
| NM | Secretary of State results service (the JSON behind electionresults.sos.nm.gov), 2024 general and the House District 57 recount | 112 | 2024 | 65 | 110 (68 / 42) | 0 |
| SD | Secretary of State 2024 general canvass with certificate (PDF, layout extract) | 72 | 2024 | 32 | 105 (8 / 97) | 0 |

Reading rules:

- **Minnesota:** DFL is Democratic. Senate District 45 carries both its 2022 contest and the 2024 special; the score takes the special. Specials held in 2025 (House 34B and 40B, Senate 29 and 47) are in separate files and not read yet, so those holders are scored on their predecessors' last general.
- **North Dakota:** each district takes its most recent general, 2024 or 2022. The 2024 page is served at the site's current-election address, which will switch to 2026 results; the retained bytes are the 2024 page. A 2024 single-seat House race for an unexpired term in District 23 is kept as its own position so it does not replace the 2022 two-seat race. The 2022 file's House 9A and 9B no longer exist after the 2023 remedial map and match no seat.
- **New Mexico:** the results service is the Secretary of State's own backend, hosted on `azurewebsites.us`; the site's XLSX export needs a browser session. House District 57 takes the December 2024 automatic recount. The service lists no write-in votes.
- **South Dakota:** House districts elect two members together, except the single-member subdistricts 26A, 26B, 28A and 28B. Candidate names were checked against the Secretary of State's 2024 candidate list for all 72 contests. House District 15 uses the statewide canvass, not Minnehaha County's recount, which moved each candidate by one or two votes.

SD House 27 is a new party mismatch: Open States lists Peri Pourier as Republican, and she ran as a Democrat in 2024. The score treats her as the roster says, as it does the five earlier mismatches.

Arizona, Michigan, Nevada and Ohio were examined and deferred. Every official results host for those states returns a Cloudflare or Incapsula challenge to the project's VPN address, and the residential route needs an interactive sudo password on this host.

Totals across forty states: 7,025 contests, 5,702 seats scored (2,629 Democratic, 3,073 Republican).

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
- `state-legislative-general-results-v1`: 7,157,064 bytes; SHA-256 `c65fab591e448569476fc7ca7c2d3560d6a1af1f08ff29284f583a229ec47ea7`; package `bb1c7fd2af2d74b56f4c265e54ba18858c886d65930bfdb7f4936aaca8e513c6` (unchanged)
- `state-legislative-score-v01-projection-v1`: 13,310,153 bytes; SHA-256 `ca2c875d9201dc6960e75a99b6e81a5c6d8a20b2bad8204d888dac442d3830f7`; package `a5326ebef79221a1e456537fcfe10f3326894f2c618154ccd2b5b2e1c1c178cd`

## Reproduction

```sh
npm run rapid:refresh -- --date 2026-09-24 --skip-download
npm run rapid:publish -- --version v1.15 --date 2026-10-21
npm run data:verify
npm run test:fast
```
