import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { ESLint } from "eslint";
import importPlugin from "eslint-plugin-import";
import a11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";

const require = createRequire(import.meta.url);

test("ESM exports and default options retain glob matching behavior", async () => {
  const { default: matcher, minimatch, Minimatch } = await import("minimatch");
  assert.equal(matcher, minimatch);
  assert.equal(new Minimatch("**/*.tsx").match("src/.hidden.tsx"), false);
  const withDotfiles = matcher.defaults({ dot: true });
  assert.equal(withDotfiles("src/.hidden.tsx", "**/*.tsx"), true);
  assert.equal(withDotfiles("src/.hidden.tsx", "**/*.tsx", { dot: false }), false);
  assert.equal(withDotfiles.makeRe("**/*.tsx").test("src/.hidden.tsx"), true);
  assert.equal(matcher.makeRe("!**/*.tsx").test("src/page.tsx"), false);
  assert.equal(matcher.makeRe("!**/*.tsx").test("src/page.ts"), true);
});

test("ESLint consumers retain callable and constructor glob APIs", () => {
  for (const consumer of ["eslint", "@eslint/eslintrc", "@eslint/config-array", "eslint-plugin-import", "eslint-plugin-jsx-a11y", "eslint-plugin-react", "@typescript-eslint/typescript-estree"]) {
    const consumerRequire = createRequire(require.resolve(consumer));
    const matcher = consumerRequire("minimatch");
    assert.equal(matcher("src/page.tsx", "src/*.{ts,tsx}"), true, consumer);
    assert.equal(matcher("src/page.js", "src/*.{ts,tsx}"), false, consumer);
    assert.equal(new matcher.Minimatch("**/*.tsx").match("src/page.tsx"), true, consumer);
  }
});

test("glob-dependent plugin rules still report violations and honor exceptions", async () => {
  const cases = [
    {
      plugin: importPlugin, name: "import", rule: "no-internal-modules", options: { allow: ["eslint/**"] },
      valid: 'import item from "eslint/use-at-your-own-risk";', invalid: 'import item from "react/jsx-runtime";',
    },
    {
      plugin: a11yPlugin, name: "jsx-a11y", rule: "control-has-associated-label", options: { controlComponents: ["FieldInput"] },
      valid: 'const view = <FieldInput aria-label="Name" />;', invalid: 'const view = <FieldInput />;',
    },
    {
      plugin: reactPlugin, name: "react", rule: "jsx-pascal-case", options: { ignore: ["Bad_*"] },
      valid: "const view = <Bad_component />;", invalid: "const view = <Other_component />;",
    },
  ];
  for (const { plugin, name, rule, options, valid, invalid } of cases) {
    const ruleId = `${name}/${rule}`;
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        files: ["**/*.jsx"],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { [name]: plugin },
        rules: { [ruleId]: ["error", options] },
      },
    });
    const [accepted] = await eslint.lintText(valid, { filePath: "fixture.jsx" });
    assert.equal(accepted.errorCount, 0, ruleId);
    const [rejected] = await eslint.lintText(invalid, { filePath: "fixture.jsx" });
    assert.ok(rejected.messages.some(message => message.ruleId === ruleId && message.severity === 2), ruleId);
  }
});
