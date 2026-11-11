import { readWorkbookSheet } from "../intake/workbook";
import type { StateGeneralSource } from "../state-legislative-general-results";
import type { RawPrimaryContest, StatePrimaryAdapter } from "../state-primary-results-2026";

/**
 * Virginia Department of Elections, official results of the August 4, 2026
 * Democratic and Republican primaries from its election-night reporting API
 * (each election's metadata reads isOfficialResults: true, last updated
 * August 17, 2026 after the State Board's certification). The ballot-items
 * document holds one item per contest, district totals per ballot option, a
 * write-in flag and the Department's own isWinner mark. No state-legislative
 * seat is on the 2026 ballot; the offices are U.S. Senate and U.S. House.
 *
 * Virginia holds no primary for a party whose only filer is unopposed, and a
 * party may nominate by convention or firehouse primary instead. For every
 * Democratic or Republican nomination with no primary contest, the nominee is
 * read from the Department's November 3, 2026 federal candidate list (the
 * official list of candidates certified to the general ballot, revision of
 * October 6, 2026) and reported as an uncounted sole nominee. Where a primary
 * was held, the list must name the same candidate the primary marks as
 * winner, so a replacement nominee fails the parse instead of passing
 * silently.
 */
const ENR = "https://enr.elections.virginia.gov/results/public/api/elections/virginia";
const PARTIES = ["Democratic", "Republican"] as const;
type Party = (typeof PARTIES)[number];
const ballotItemsId = (party: Party): string => `va-2026-primary-${party.toLowerCase()}-ballot-items-json`;
const LIST_ID = "va-2026-general-federal-candidate-list-xlsx";
const SOURCES: readonly StateGeneralSource[] = [
  ...PARTIES.map((party): StateGeneralSource => ({ id: ballotItemsId(party), url: `${ENR}/2026-August-${party}-Primary/ballot-items`, path: `data/source/rapid/state-primary/va/2026-primary-${party.toLowerCase()}-ballot-items.json`, cycleYear: 2026, electionDate: "2026-08-04", note: `${party} primary of August 4, 2026, official results (isOfficialResults true, updated August 17, 2026); U.S. Senate and House contests actually held.` })),
  { id: LIST_ID, url: "https://www.elections.virginia.gov/media/castyourballot/candidatelist/2026/2026-November-Federal-Offices-Candidate-List-(rev-10-6-2026).xlsx", path: "data/source/rapid/state-primary/va/2026-general-federal-candidate-list.xlsx", cycleYear: 2026, electionDate: "2026-08-04", note: "Official November 3, 2026 federal candidate list (rev. October 6, 2026); names the Democratic and Republican nominees chosen without a primary (unopposed, convention or firehouse primary)." },
];

type Localized = { languageId: string; text: string }[];
type BallotItem = { name: Localized; voteTotal: number; voteFor: Localized; summaryResults: { ballotOptions: { name: Localized; voteCount: number; isWriteIn: boolean; isWinner: boolean }[] } };

const fail = (code: string): never => { throw new Error(`VIRGINIA_PRIMARY_${code}`); };
const english = (names: Localized): string => names.find((name) => name.languageId === "en")?.text ?? fail("NAME_MISSING");

const officeOf = (title: string): Pick<RawPrimaryContest, "office" | "district"> | null => {
  if (title === "Member, United States Senate") return { office: "us_senate", district: null };
  const match = title.match(/^Member, House of Representatives \((\d+)(?:st|nd|rd|th) District\)$/);
  return match ? { office: "us_house", district: match[1]! } : null;
};

function parseBallotItems(bytes: Buffer, party: Party): RawPrimaryContest[] {
  const document = JSON.parse(bytes.toString("utf8")) as { data: BallotItem[]; totalRecordCount: number };
  if (!Array.isArray(document.data) || document.data.length !== document.totalRecordCount) fail("PAGINATION_INCOMPLETE");
  return document.data.flatMap((item): RawPrimaryContest[] => {
    const title = english(item.name), office = officeOf(title);
    if (!office) return [];
    if (english(item.voteFor) !== "Vote for only one") fail(`VOTE_FOR:${title}`);
    const candidates = item.summaryResults.ballotOptions.map((option) => ({ name: english(option.name), votes: option.voteCount, ...(option.isWriteIn ? { writeIn: true } : {}), ...(option.isWinner ? { winner: true } : {}) }));
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== item.voteTotal) fail(`TOTAL_MISMATCH:${party}:${title}`);
    return [{ ...office, rawParty: party, candidates }];
  });
}

function parseCandidateList(bytes: Buffer, readSource: (sourceId: string) => Buffer): RawPrimaryContest[] {
  const primaries = new Map(PARTIES.flatMap((party) => parseBallotItems(readSource(ballotItemsId(party)), party)).map((contest) => [`${contest.office}|${contest.district}|${contest.rawParty}`, contest]));
  const sheet = readWorkbookSheet(bytes, "Candidates");
  if (["Office Title", "District", "Candidate Party", "Candidate Name"].some((label, index) => sheet.at(index + 1, 1) !== label)) fail("LIST_HEADER");
  const contests: RawPrimaryContest[] = [];
  const listed = new Set<string>();
  for (let row = 2; row <= sheet.maxRow; row++) {
    const party = PARTIES.find((name) => name === sheet.at(3, row));
    if (!party) continue;
    const district = sheet.at(2, row), title = sheet.at(1, row);
    const office = title === "Member, United States Senate" && district === "Statewide" ? officeOf(title) : officeOf(`${title} (${district})`);
    if (!office) fail(`LIST_OFFICE:${row}`);
    const key = `${office!.office}|${office!.district}|${party}`, name = sheet.at(4, row);
    if (listed.has(key)) fail(`LIST_DUPLICATE_NOMINEE:${key}`);
    listed.add(key);
    const primary = primaries.get(key);
    if (primary) {
      const winners = primary.candidates.filter((candidate) => candidate.winner === true).map((candidate) => candidate.name);
      if (winners.length !== 1 || winners[0] !== name) fail(`LIST_NOMINEE_NOT_PRIMARY_WINNER:${key}:${name}`);
      continue;
    }
    contests.push({ ...office!, rawParty: party, candidates: [{ name, votes: null, winner: true }] });
  }
  return contests;
}

export const VIRGINIA_PRIMARY: StatePrimaryAdapter = {
  stateCode: "VA",
  authority: "Virginia Department of Elections, official primary results and certified candidate list",
  system: "partisan",
  sources: SOURCES,
  expectedContests: { [ballotItemsId("Democratic")]: 5, [ballotItemsId("Republican")]: 4, [LIST_ID]: 15 },
  parse: (bytes, source, readSource) => {
    if (source.id === LIST_ID) return parseCandidateList(bytes, readSource);
    return parseBallotItems(bytes, PARTIES.find((party) => source.id === ballotItemsId(party)) ?? fail(`SOURCE_UNKNOWN:${source.id}`));
  },
};
