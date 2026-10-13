import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";
import nextPlugin from "@next/eslint-plugin-next";

// Qualify the tinyglobby alias through the Next rule that discovers root dirs.
// A broken glob adapter must not silently disable internal-link linting.
test("Next internal-link lint discovers literal and globbed app roots", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "next-eslint-glob-"));
  try {
    for (const app of ["web", "admin"]) {
      await mkdir(path.join(fixture, "apps", app, "pages"), { recursive: true });
      await writeFile(path.join(fixture, "apps", app, "pages", "about.jsx"), "export default function About() { return null; }\n");
    }
    await writeFile(path.join(fixture, "apps", "not-a-directory"), "fixture");
    const web = path.join(fixture, "apps", "web");
    const rootDirs = [
      undefined,
      web,
      path.join(fixture, "apps", "*"),
      path.join(fixture, "apps", "{web,admin}"),
      [web, path.join(fixture, "apps", "admin")],
      web.replaceAll("/", "\\"),
    ];
    for (const rootDir of rootDirs) {
      const eslint = new ESLint({
        cwd: web,
        overrideConfigFile: true,
        overrideConfig: {
          files: ["**/*.jsx"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          plugins: { "@next/next": nextPlugin },
          settings: { next: rootDir === undefined ? {} : { rootDir } },
          rules: { "@next/next/no-html-link-for-pages": "error" },
        },
      });
      const [internal] = await eslint.lintText('const link = <a href="/about/">About</a>;', { filePath: "fixture.jsx" });
      assert.ok(internal.messages.some(message => message.ruleId === "@next/next/no-html-link-for-pages" && message.severity === 2), `Internal-link lint must remain active for rootDir=${JSON.stringify(rootDir)}`);
      const [external] = await eslint.lintText('const link = <a href="https://example.com/about/">About</a>;', { filePath: "fixture.jsx" });
      assert.equal(external.errorCount, 0);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
