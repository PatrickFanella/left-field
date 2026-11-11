import matcher from "./index.cjs";

export default matcher;
export const { minimatch, Minimatch, GLOBSTAR, sep, filter, defaults, braceExpand, match, escape, unescape, makeRe } = matcher;
