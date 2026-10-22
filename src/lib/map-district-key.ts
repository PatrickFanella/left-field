/**
 * Join keys between Census cartographic boundaries and Priority Index seats.
 *
 * Census names a state-legislative district by its NAME field ("19",
 * "Merrimack 08", "Berkshire-Hampden-Franklin-Hampshire"); the index carries
 * the same district after a one-letter chamber prefix ("S19", "HMerrimack 8",
 * "SBerkshire, Hampden, Franklin and Hampshire"). Both sides reduce to upper-case
 * letters and digits with "and" dropped and leading zeros removed from each
 * number. Idaho elects two House members per district as seats A and B; both
 * map to the one district polygon.
 */
export function stateLegislativeDistrictKey(stateCode: string, name: string): string {
  let key = name.toUpperCase().replace(/\bAND\b/g, " ").replace(/\d+/g, (digits) => String(Number(digits))).replace(/[^A-Z0-9]/g, "");
  if (stateCode === "ID") key = key.replace(/^(\d+)[AB]$/, "$1");
  return key;
}

/** Index district code minus its chamber prefix ("S19" → key of "19"). */
export const seatDistrictKey = (stateCode: string, districtCode: string): string => stateLegislativeDistrictKey(stateCode, districtCode.slice(1));

/** House key: state postal code plus two-digit district; at-large is "00" (the index also writes "AL"). */
export const houseDistrictKey = (stateCode: string, districtCode: string): string => `${stateCode}-${districtCode === "AL" ? "00" : districtCode.padStart(2, "0")}`;
