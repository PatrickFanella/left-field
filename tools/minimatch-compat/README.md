# ESLint minimatch adapter

The audit gate rejects minimatch before 11.0.1 for
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
The pinned ESLint plugins still use its older callable CommonJS export;
`eslint-plugin-import` also calls `makeRe(pattern).test(value)`. A direct
override to v11 breaks those rules.

This development dependency delegates matching to pinned minimatch 11.0.3.
It supplies a callable default export, modern named exports, and the `.test()`
interface used by the import rule. `makeRe` returns a matcher object, **not a
RegExp**; this adapter does not implement the removed regular-expression API
or every historical minimatch behavior. It is only for the locked lint tools.

The root direct dependency and `$minimatch` override let npm resolve every
consumer to the same local package. `npm run lint` checks resolution and runs
glob-dependent import, accessibility, and React rules against accepted and
rejected examples. Remove the adapter when these tools support the patched
matcher's exports directly.
