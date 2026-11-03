# Priority Index v1.17 — 2026-11-03

## Outcome

Automated release. House layer v0.11 (source cutoff 2026-08-04); Senate layer v0.1 (FEC and roster snapshot 2026-11-03, `fec-candidate-summary-2026-20261103`). Fill in what changed and why before merging.

## Immutable outputs

- `rapid-state-legislative-primary-context-v1`: 19,004 bytes; SHA-256 `e93024ea3dabbf5f07762dd85a0ae4688822882e39b8fade133c97870acf7e89`; package `0da8bd2a52533aa29995b477b4df70f485b810f6021c2ef796a7e4f6745d7658` (unchanged)
- `rapid-house-primary-2024-incumbent-evidence-v2`: 26,734 bytes; SHA-256 `4cd439117287831277f9aff40842c598c04ddd33c9cd1348dafe739e38aa76d2`; package `4b6407987d7cfbe1ec2d16c3a79edb96f1237bd75d1a02903532e923d99226b7` (unchanged)
- `house-score-v09-active-projection-v1`: 507,956 bytes; SHA-256 `cdbefeef90ef0d606ac6f892e4f14bb92e03975cd209d97745fa44eca6d73bd1`; package `b10ae4d65e815c1d207f9f87660082770db4783ea9a0e4515a8ee32df5e1a4b4` (unchanged)
- `statewide-presidential-2024-v1`: 17,342 bytes; SHA-256 `a5d4b06343a7f542d11e6529729945e8554e51e41228295cc7e94fb096674959`; package `e41c1361f9a93e481e14bba9b017cac282360c3b27aa8cd34a8d1746338bd24f` (unchanged)
- `senate-score-v01-projection-v1`: 208,979 bytes; SHA-256 `2d31444bd311d457d9b44c97d1911827840482b1d5c45b29554677e1e45ec3d8`; package `ffe81fa7f79b3b208cc1d662652c3f3d90953c36c9733d070292f9493127e375`
- `house-score-v10-active-projection-v1`: 374,208 bytes; SHA-256 `73fb7ee8792fc113cf80487e44247211a8bf13020bf447cecbf632148fc7a342`; package `cb90bfce215172f652d773f5888503575c092e99e6a98b3735f6c872328a1e0e`
- `house-incumbent-candidacy-v1`: 181,474 bytes; SHA-256 `2a803ab75dbfe52fa4fc5a96a3398ec17093986bad1e109cb07162295962dd5b`; package `b1e64749f79e5d82677dac7d6085d2ddf09bcf824d9bd1deb69f2c937d9b5639`
- `house-score-v11-active-projection-v1`: 246,457 bytes; SHA-256 `e5b41a3304c9359691e4c00fbd277af5562ca4f16acbcb0b3a74761af9230b02`; package `bea394f97d435502f45b7c1ad642c7e9cb2f827054eb4adab92f372ad6d28a9e`
- `governor-score-v01-projection-v1`: 100,766 bytes; SHA-256 `6b54d3f0cef456c4d6e4c1dbb7c6102902530f5eb6342c87bf04b6091eb4c24c`; package `1b9d322dfbbead5df76abc034e55908a081e571e26c62914347ff939c2af659f`
- `state-legislative-roster-v1`: 6,086,501 bytes; SHA-256 `fad321945be1df3b7d5938e10fafb605a5361909fe0a8191c78cc2ca88c48693`; package `0ec93fa6639223a8956943caea296d94e7be6fef556b7de1362f9c07f90dccf9`
- `state-legislative-general-results-v1`: 8,388,343 bytes; SHA-256 `f54c34df6b02da27a982f2cea1232981a50dbdface9a826c5f74cc18e75364fd`; package `9f45ab2021824f281ebd319a963de384f97de3debd594589c29434188ebe5b7c` (unchanged)
- `state-legislative-score-v01-projection-v1`: 14,223,399 bytes; SHA-256 `0d689b065ad16e0aa37bf3ceb9bb042fb17425a9c0780a1cbb24fa1de53dfed2`; package `20a680a3c2055e5d56a27848c97ca15c1424e34cc5e443a06c68ff8cea86c927`

## Reproduction

```sh
npm run rapid:refresh -- --date 2026-11-03 --skip-download
npm run rapid:publish -- --version v1.17 --date 2026-11-03
npm run data:verify
npm run test:fast
```
