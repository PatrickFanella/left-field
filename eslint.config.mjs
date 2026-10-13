import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The Next plugin uses globSync with onlyDirectories for root discovery.
// package.json aliases its vulnerable fast-glob chain to pinned tinyglobby;
// npm run lint verifies that internal-link rules still discover app roots.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
