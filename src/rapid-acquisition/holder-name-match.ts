/**
 * Match a roster holder to a ballot name without inferring identity.
 *
 * The family name must match in full: every token of it appears in the
 * candidate's name. The given name then matches when it is absent, equals a
 * token, is an initial of the candidate's first token, is a nickname that is
 * a prefix of the formal first name (or the reverse: "Ed" and "Edward", "Kim"
 * and "Kimberly"), or is a common nickname of it ("Bill" and "William"). The
 * holder's recorded nickname, where a roster keeps one, counts as a given
 * name. A source that marks its incumbents, "(I)" or "*", settles identity on
 * the family name alone.
 *
 * A family name of two or more words ("Graham Nordone") also matches a ballot
 * that prints only one of them, but only when the given name matches the
 * ballot's first name outright or as a nickname, never by initial or prefix.
 *
 * A "LAST, First" ballot name is reordered first; a comma before a suffix
 * ("Jeffrie Long, Jr.") is not a reordering. Nothing here says who won.
 */
export interface HolderName {
  readonly familyName: string;
  readonly givenName: string;
  /** A name the roster says the holder goes by ("Chuck" for Charles), counted as another given name. */
  readonly nickname?: string;
}

export const normalizeName = (value: string): string => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Common English given-name nicknames, formal name first. A pair matches when both names appear in one entry.
 * Prefix nicknames ("Dan", "Kim", "Greg") need no entry; the prefix rule already accepts them.
 */
const NICKNAMES: readonly (readonly string[])[] = [
  ["william", "bill", "billy", "will", "willie"], ["robert", "bob", "bobby", "rob", "robbie", "bert"], ["richard", "dick", "rick", "ricky", "rich", "richie"],
  ["michael", "mike", "mickey"], ["thomas", "tom", "tommy"], ["james", "jim", "jimmy", "jamie"], ["joseph", "joe", "joey"], ["john", "jack", "johnny"],
  ["charles", "chuck", "charlie", "chip"], ["david", "dave", "davey"], ["daniel", "danny"], ["edward", "ed", "eddie", "ted", "ned"], ["theodore", "ted", "teddy"],
  ["anthony", "tony"], ["andrew", "andy", "drew"], ["stephen", "steve", "stevie"], ["steven", "steve", "stevie"], ["lawrence", "larry"], ["gerald", "jerry"],
  ["terrence", "terry"], ["terence", "terry"], ["ronald", "ronnie"], ["donald", "donnie"], ["nicholas", "nick", "nicky"], ["patrick", "pat"], ["peter", "pete"],
  ["alexander", "alex", "al"], ["albert", "al", "bert"], ["alfred", "al", "fred"], ["henry", "hank", "harry"], ["harold", "hal", "harry"], ["frederick", "fred", "freddie"],
  ["francis", "frank"], ["franklin", "frank"], ["jonathan", "jon"], ["nathaniel", "nate", "nat"], ["nathan", "nate"], ["gabriel", "gabe"], ["jacob", "jake"],
  ["randall", "randy"], ["randolph", "randy"], ["leonard", "len", "lenny"], ["luis", "lou"], ["eugene", "gene"], ["zachary", "zach"], ["phillip", "phil"],
  ["benjamin", "ben", "benny"], ["samuel", "sam", "sammy"], ["matthew", "matt"], ["timothy", "tim", "timmy"], ["christopher", "chris"], ["kenneth", "ken", "kenny"],
  ["elizabeth", "liz", "beth", "betsy", "betty", "lisa", "libby", "eliza"], ["elisabeth", "liz", "lisa", "beth"], ["margaret", "peggy", "maggie", "meg", "marge"],
  ["patricia", "patty", "pat", "trish", "tricia"], ["rebecca", "becky", "becca"], ["deborah", "debbie", "deb"], ["debra", "debbie", "deb"],
  ["katherine", "kate", "katie", "kathy", "kat"], ["catherine", "cathy", "kate", "katie"], ["kathryn", "kate", "katie", "kathy"], ["kathleen", "kathy", "katie", "kate"],
  ["christine", "chris", "tina", "christy"], ["christina", "chris", "tina", "christy"], ["jennifer", "jen", "jenny"], ["jacqueline", "jackie"], ["susan", "sue", "susie"],
  ["suzanne", "sue", "suzy"], ["nicole", "nikki"], ["victoria", "vicky", "tori"], ["cynthia", "cindy"], ["virginia", "ginny"], ["dorothy", "dottie", "dot"],
  ["abigail", "abby"], ["judith", "judy"], ["martin", "marty"], ["anissa", "nissa"], ["nelida", "nellie", "nelly"], ["gwendolyn", "gwen"], ["roberta", "bobbie"],
];
const NICKNAME_GROUPS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const groups = new Map<string, Set<string>>();
  for (const entry of NICKNAMES) for (const name of entry) groups.set(name, new Set([...(groups.get(name) ?? []), ...entry]));
  return groups;
})();
const nicknameOf = (left: string, right: string): boolean => NICKNAME_GROUPS.get(left)?.has(right) ?? false;

const INCUMBENT_MARK = /\((?:I|i)\)|\*/;
/** True when the source itself marks this candidate as the incumbent. */
export const carriesIncumbentMark = (candidateName: string): boolean => INCUMBENT_MARK.test(candidateName);

const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/;

/** Ballot names as tokens, with "LAST, First" put back in given-family order and incumbent markers removed. */
export const candidateTokens = (candidateName: string): readonly string[] => {
  const stripped = candidateName.replace(/\((?:I|i)\)|\*/g, " ");
  const comma = stripped.indexOf(",");
  const after = comma >= 0 ? normalizeName(stripped.slice(comma + 1)).split(" ").filter((token) => token !== "") : [];
  const suffixOnly = after.length > 0 && after.every((token) => SUFFIX.test(token));
  const ordered = comma >= 0 && !suffixOnly ? `${stripped.slice(comma + 1)} ${stripped.slice(0, comma)}` : stripped;
  return normalizeName(ordered).split(" ").filter((token) => token !== "");
};

const familyTokens = (holder: HolderName): readonly string[] => normalizeName(holder.familyName).split(" ").filter((token) => token !== "");
/** The holder's given-name tokens and recorded nickname; only the first given token may be an initial. */
const givenNames = (holder: HolderName): readonly string[] => [...new Set([...normalizeName(holder.givenName).split(" ").filter((token, index) => token !== "" && (index === 0 || token.length > 1)), ...normalizeName(holder.nickname ?? "").split(" ").filter((token) => token.length > 1)])];

/**
 * The candidate carries the holder's family name: every token of it, or for a family name of two or more words,
 * any one of them. The looser half only widens what counts as a possible match, never what settles one.
 */
export function familyMatches(holder: HolderName, candidateName: string): boolean {
  const family = familyTokens(holder);
  if (family.length === 0) return false;
  const tokens = candidateTokens(candidateName);
  return family.every((token) => tokens.includes(token)) || (family.length > 1 && family.some((token) => tokens.includes(token)));
}

const givenMatches = (given: string, tokens: readonly string[]): boolean => {
  if (tokens.includes(given)) return true;
  const first = tokens[0] ?? "";
  if (given.length === 1) return first.startsWith(given);
  if (first.length >= 2 && (first.startsWith(given) || given.startsWith(first))) return true;
  return tokens.some((token) => nicknameOf(given, token));
};

export function holderMatches(holder: HolderName, candidateName: string): boolean {
  const family = familyTokens(holder);
  if (family.length === 0) return false;
  const tokens = candidateTokens(candidateName), givens = givenNames(holder);
  if (family.every((token) => tokens.includes(token))) return givens.length === 0 || givens.some((given) => givenMatches(given, tokens)) || carriesIncumbentMark(candidateName);
  // Part of a compound family name: the first name must match outright or as a nickname.
  const first = tokens[0] ?? "";
  return family.length > 1 && family.some((token) => tokens.includes(token)) && givens.some((given) => given.length > 1 && (given === first || nicknameOf(given, first)));
}

/** The one candidate the holder matches, or null when none or several do. */
export function uniqueHolderMatch<T extends { readonly name: string }>(holder: HolderName, candidates: readonly T[]): T | null {
  const matches = candidates.filter((candidate) => holderMatches(holder, candidate.name));
  return matches.length === 1 ? matches[0]! : null;
}
