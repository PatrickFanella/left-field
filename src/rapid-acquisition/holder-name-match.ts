/**
 * Match a roster holder to a ballot name without inferring identity.
 *
 * The rule is the one the state-legislative score layer applies to its own
 * returns: every token of the family name appears in the candidate's name,
 * and the given name is absent, is the candidate's first token, or appears
 * anywhere among the tokens. A "LAST, First" ballot name is reordered first;
 * an incumbent marker "(I)" or "*" is stripped. Nothing here says who won.
 */
export interface HolderName {
  readonly familyName: string;
  readonly givenName: string;
}

export const normalizeName = (value: string): string => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** Ballot names as tokens, with "LAST, First" put back in given-family order and incumbent markers removed. */
export const candidateTokens = (candidateName: string): readonly string[] => {
  const stripped = candidateName.replace(/\((?:I|i)\)|\*/g, " ");
  const comma = stripped.indexOf(",");
  const ordered = comma >= 0 ? `${stripped.slice(comma + 1)} ${stripped.slice(0, comma)}` : stripped;
  return normalizeName(ordered).split(" ").filter((token) => token !== "");
};

export function holderMatches(holder: HolderName, candidateName: string): boolean {
  const family = normalizeName(holder.familyName).split(" ").filter((token) => token !== "");
  const given = normalizeName(holder.givenName).split(" ")[0] ?? "";
  if (family.length === 0) return false;
  const tokens = candidateTokens(candidateName);
  return family.every((token) => tokens.includes(token)) && (given === "" || tokens[0] === given || tokens.includes(given));
}

/** The one candidate the holder matches, or null when none or several do. */
export function uniqueHolderMatch<T extends { readonly name: string }>(holder: HolderName, candidates: readonly T[]): T | null {
  const matches = candidates.filter((candidate) => holderMatches(holder, candidate.name));
  return matches.length === 1 ? matches[0]! : null;
}
