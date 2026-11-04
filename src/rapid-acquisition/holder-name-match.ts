/**
 * Match a roster holder to a ballot name without inferring identity.
 *
 * The family name must match in full: every token of it appears in the
 * candidate's name. The given name then matches when it is absent, equals a
 * token, is an initial of the candidate's first token, or is a nickname that
 * is a prefix of the formal first name (or the reverse: "Ed" and "Edward",
 * "Kim" and "Kimberly"). A source that marks its incumbents, "(I)" or "*",
 * settles identity on the family name alone. A "LAST, First" ballot name is
 * reordered first. Nothing here says who won.
 */
export interface HolderName {
  readonly familyName: string;
  readonly givenName: string;
}

export const normalizeName = (value: string): string => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const INCUMBENT_MARK = /\((?:I|i)\)|\*/;
/** True when the source itself marks this candidate as the incumbent. */
export const carriesIncumbentMark = (candidateName: string): boolean => INCUMBENT_MARK.test(candidateName);

/** Ballot names as tokens, with "LAST, First" put back in given-family order and incumbent markers removed. */
export const candidateTokens = (candidateName: string): readonly string[] => {
  const stripped = candidateName.replace(/\((?:I|i)\)|\*/g, " ");
  const comma = stripped.indexOf(",");
  const ordered = comma >= 0 ? `${stripped.slice(comma + 1)} ${stripped.slice(0, comma)}` : stripped;
  return normalizeName(ordered).split(" ").filter((token) => token !== "");
};

const familyTokens = (holder: HolderName): readonly string[] => normalizeName(holder.familyName).split(" ").filter((token) => token !== "");

/** Every token of the holder's family name appears in the candidate's name. */
export function familyMatches(holder: HolderName, candidateName: string): boolean {
  const family = familyTokens(holder);
  if (family.length === 0) return false;
  const tokens = candidateTokens(candidateName);
  return family.every((token) => tokens.includes(token));
}

const givenMatches = (holder: HolderName, tokens: readonly string[]): boolean => {
  const given = normalizeName(holder.givenName).split(" ")[0] ?? "";
  if (given === "") return true;
  if (tokens[0] === given || tokens.includes(given)) return true;
  const first = tokens[0] ?? "";
  if (given.length === 1) return first.startsWith(given);
  return first.length >= 2 && (first.startsWith(given) || given.startsWith(first));
};

export function holderMatches(holder: HolderName, candidateName: string): boolean {
  if (!familyMatches(holder, candidateName)) return false;
  return givenMatches(holder, candidateTokens(candidateName)) || carriesIncumbentMark(candidateName);
}

/** The one candidate the holder matches, or null when none or several do. */
export function uniqueHolderMatch<T extends { readonly name: string }>(holder: HolderName, candidates: readonly T[]): T | null {
  const matches = candidates.filter((candidate) => holderMatches(holder, candidate.name));
  return matches.length === 1 ? matches[0]! : null;
}
