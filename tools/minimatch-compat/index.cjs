// The pinned ESLint plugins call the v3 default export and makeRe(...).test().
// All matching stays in patched minimatch; no regular expressions are generated.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Legacy plugins require a synchronous CommonJS entry point.
const patched = require("minimatch-patched");

function compatible(api) {
  const matcher = (value, pattern, options) => api(value, pattern, options);
  return Object.assign(matcher, api, {
    minimatch: matcher,
    makeRe(pattern, options) {
      const compiled = new api.Minimatch(pattern, options);
      return { test: value => compiled.match(value) };
    },
    defaults: options => compatible(api.defaults(options)),
  });
}

module.exports = compatible(patched.minimatch);
