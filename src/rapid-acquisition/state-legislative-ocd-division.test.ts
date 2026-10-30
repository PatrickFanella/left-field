import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { readSourceLock } from "./intake/source-lock";

import { buildStateLegislativeOcdCrosswalk, matchExactOcdDivision, matchStateSeatOcdDivision, normalizedOpenStatesDistrictId, openStatesDistrictId, parseOcdOpenStatesRoleCsv, serializeStateLegislativeOcdCrosswalk } from "./state-legislative-ocd-division";

const ncMappings = parseOcdOpenStatesRoleCsv(readFileSync(join(process.cwd(), "data/source/identity/ocd/ocd-division-ids-f1ab837/state-nc-openstates.csv"), "utf8"));

describe("state-legislative OCD division identities", () => {
  it("maps an exact OpenStates role label without normalizing it", () => {
    expect(ncMappings).toHaveLength(170);
    expect(matchStateSeatOcdDivision({ stateCode: "NC", chamber: "lower", district: "7", seatSlot: 1 }, ncMappings)).toEqual({
      status: "mapped",
      openStatesDistrict: "nc-lower-7",
      divisionId: "ocd-division/country:us/state:nc/sldl:7",
      stateCode: "NC",
      chamber: "lower",
      district: "7",
      seatSlot: 1,
      labelMatchMethod: "exact",
    });
    expect(matchStateSeatOcdDivision({ stateCode: "NC", chamber: "lower", district: "007", seatSlot: 1 }, ncMappings)).toEqual({
      status: "mapped",
      divisionId: "ocd-division/country:us/state:nc/sldl:7",
      openStatesDistrict: "nc-lower-007",
      stateCode: "NC",
      chamber: "lower",
      district: "007",
      seatSlot: 1,
      labelMatchMethod: "normalized",
    });
  });

  it("preserves named districts and multi-member seat slots for the caller", () => {
    expect(openStatesDistrictId({ stateCode: "ME", chamber: "lower", district: "Houlton Band of Maliseet Indians", seatSlot: 1 })).toBe("me-lower-Houlton Band of Maliseet Indians");
    // Two seats may legitimately resolve to the same district division; their distinct slots survive the crosswalk.
    const seats = [1, 2].map((seatSlot) => matchStateSeatOcdDivision({ stateCode: "NC", chamber: "upper", district: "7", seatSlot }, ncMappings));
    expect(seats).toEqual([
      expect.objectContaining({ status: "mapped", divisionId: "ocd-division/country:us/state:nc/sldu:7", seatSlot: 1 }),
      expect.objectContaining({ status: "mapped", divisionId: "ocd-division/country:us/state:nc/sldu:7", seatSlot: 2 }),
    ]);
  });

  it("uses only source-proven normalized labels as a fallback", () => {
    const mappings = parseOcdOpenStatesRoleCsv([
      "id,openstates_district",
      "ocd-division/country:us/state:mn/sldl:1a,mn-lower-01a",
      "ocd-division/country:us/state:nh/sldl:belknap_1,nh-lower-belknap-county-no-1",
      "ocd-division/country:us/state:ne/sldu:1,ne-upper-1",
      "ocd-division/country:us/district:dc/ward:1,dc-upper-1",
      "ocd-division/country:us/state:sc/sldl:1,sc-lower-hd-001",
    ].join("\n"));
    expect(normalizedOpenStatesDistrictId("MN lower 01A")).toBe("mn-lower-1a");
    expect(matchStateSeatOcdDivision({ stateCode: "MN", chamber: "lower", district: "1A", seatSlot: 1 }, mappings)).toMatchObject({ status: "mapped", labelMatchMethod: "normalized", divisionId: "ocd-division/country:us/state:mn/sldl:1a" });
    expect(matchStateSeatOcdDivision({ stateCode: "NH", chamber: "lower", district: "Belknap 1", seatSlot: 1 }, mappings)).toMatchObject({ status: "mapped", labelMatchMethod: "normalized", divisionId: "ocd-division/country:us/state:nh/sldl:belknap_1" });
    expect(matchStateSeatOcdDivision({ stateCode: "NE", chamber: "unicameral", district: "1", seatSlot: 1 }, mappings)).toMatchObject({ status: "mapped", labelMatchMethod: "exact", openStatesDistrict: "ne-upper-1" });
    expect(matchStateSeatOcdDivision({ stateCode: "DC", chamber: "unicameral", district: "Ward 1", seatSlot: 1 }, mappings)).toMatchObject({ status: "mapped", labelMatchMethod: "normalized", divisionId: "ocd-division/country:us/district:dc/ward:1" });
    expect(matchStateSeatOcdDivision({ stateCode: "SC", chamber: "lower", district: "1", seatSlot: 1 }, mappings)).toMatchObject({ status: "mapped", labelMatchMethod: "normalized", divisionId: "ocd-division/country:us/state:sc/sldl:1" });
  });

  it("fails closed for conflicting mappings and malformed source rows", () => {
    expect(matchExactOcdDivision("nc-lower-7", [
      { divisionId: "ocd-division/country:us/state:nc/sldl:7", openStatesDistrict: "nc-lower-7" },
      { divisionId: "ocd-division/country:us/state:nc/sldl:007", openStatesDistrict: "nc-lower-7" },
    ])).toEqual({
      status: "ambiguous",
      openStatesDistrict: "nc-lower-7",
      divisionIds: ["ocd-division/country:us/state:nc/sldl:007", "ocd-division/country:us/state:nc/sldl:7"],
    });
    expect(() => parseOcdOpenStatesRoleCsv("id,openstates_district\nnot-an-ocd-id,nc-lower-7\n")).toThrow("STATE_LEG_OCD_DIVISION_ID_INVALID:2");
    expect(matchStateSeatOcdDivision({ stateCode: "MA", chamber: "lower", district: "A B", seatSlot: 1 }, [
      { divisionId: "ocd-division/country:us/state:ma/sldl:a", openStatesDistrict: "ma-lower-a-b" },
      { divisionId: "ocd-division/country:us/state:ma/sldl:b", openStatesDistrict: "ma-lower-a_b" },
    ])).toMatchObject({ status: "ambiguous", labelMatchMethod: "ambiguous" });
  });

  it("rejects changed source URLs and digests instead of trusting local mapping files", () => {
    const lock = readSourceLock(), id = "ocd-division-ids-nc-openstates-f1ab837";
    const changedUrl = { ...lock, entries: lock.entries.map((entry) => entry.id === id ? { ...entry, url: "https://example.test/unpinned" } : entry) };
    const changedDigest = { ...lock, entries: lock.entries.map((entry) => entry.id === id ? { ...entry, sha256: "0".repeat(64) } : entry) };
    expect(() => buildStateLegislativeOcdCrosswalk(process.cwd(), changedUrl)).toThrow(`SOURCE_PIN_MISMATCH:${id}`);
    expect(() => buildStateLegislativeOcdCrosswalk(process.cwd(), changedDigest)).toThrow(`BYTES_MISMATCH:${id}`);
  });

  it("reports every roster chamber while leaving plan compatibility unreviewed", () => {
    const crosswalk = buildStateLegislativeOcdCrosswalk();
    expect(crosswalk.chambers).toHaveLength(100);
    expect(crosswalk.rows).toHaveLength(crosswalk.chambers.reduce((sum, chamber) => sum + chamber.seats, 0));
    expect(crosswalk.chambers.every((chamber) => chamber.mapped + chamber.unmapped + chamber.ambiguous === chamber.seats && chamber.exact + chamber.normalized === chamber.mapped && chamber.planCompatibility === "unreviewed")).toBe(true);
    expect(crosswalk.rows.every((row) => row.planCompatibility === "unreviewed")).toBe(true);
    expect(crosswalk.rows.filter((row) => row.seatSlot > 1).every((row) => row.status === "mapped" || row.status === "unmapped" || row.status === "ambiguous")).toBe(true);
  });

  it("reproduces the compact checked-in review artifact exactly", () => {
    expect(readFileSync(join(process.cwd(), "docs/reviews/state-legislative-ocd-crosswalk-v1.json"), "utf8")).toBe(serializeStateLegislativeOcdCrosswalk(buildStateLegislativeOcdCrosswalk()));
  });
});
