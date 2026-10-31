import { describe, expect, it } from "vitest";
import { extractIdahoHousePositionLabels, verifyIdahoHouseSeatAuthority } from "./idaho-house-seat-authority";
import { readSourceLock } from "./intake/source-lock";
import { sha } from "./shared";
import { buildStateLegislativeOcdCrosswalk, matchStateSeatOcdDivision } from "./state-legislative-ocd-division";

describe("Idaho district and separate House positions", () => {
  it("retains all 70 distinct seat identities while sharing 35 district divisions", () => {
    const rows = buildStateLegislativeOcdCrosswalk().rows.filter((row) => row.stateCode === "ID" && row.chamber === "lower");
    expect(rows).toHaveLength(70);
    expect(new Set(rows.map((row) => row.seatId)).size).toBe(70);
    expect(rows.every((row) => row.status === "mapped" && row.planCompatibility === "unreviewed")).toBe(true);
    const mapped = rows.filter((row) => row.status === "mapped");
    expect(new Set(mapped.map((row) => row.divisionId)).size).toBe(35);
    for (const id of new Set(mapped.map((row) => row.divisionId))) expect(mapped.filter((row) => row.divisionId === id).map((row) => row.districtSeatPosition).sort()).toEqual(["A", "B"]);
  });

  it("does not remove suffixes in other states, accept extra Idaho positions, or hide conflicts", () => {
    const mappings = [{ divisionId: "ocd-division/country:us/state:id/sldl:1", openStatesDistrict: "id-lower-1" }];
    expect(matchStateSeatOcdDivision({ stateCode: "ID", chamber: "lower", district: "1C", seatSlot: 1 }, mappings).status).toBe("unmapped");
    expect(matchStateSeatOcdDivision({ stateCode: "MN", chamber: "lower", district: "1A", seatSlot: 1 }, [{ ...mappings[0]!, openStatesDistrict: "mn-lower-1" }]).status).toBe("unmapped");
    expect(matchStateSeatOcdDivision({ stateCode: "ID", chamber: "lower", district: "1A", seatSlot: 1 }, [...mappings, { ...mappings[0]!, divisionId: "ocd-division/country:us/state:id/sldl:other" }]).status).toBe("ambiguous");
  });

  it("requires pinned authority and a complete privacy-filtered extract", () => {
    const lock = readSourceLock();
    expect(() => verifyIdahoHouseSeatAuthority(process.cwd(), { ...lock, entries: lock.entries.filter((row) => row.id !== "idaho-legislative-position-statute-20261030") })).toThrow("ENTRY_MISSING");
    const html = Buffer.from(Array.from({ length: 35 }, (_, i) => ["A", "B"].map((p) => `<p>District ${i + 1} House Seat ${p}</p><address>private address</address>`).join("")).join(""));
    const fixture = { ...lock, entries: lock.entries.map((row) => row.id === "idaho-house-membership-20261030" ? { ...row, byteSize: html.length, sha256: sha(html) } : row) };
    const value = extractIdahoHousePositionLabels(html, fixture);
    expect(value.positions).toHaveLength(70);
    expect(JSON.stringify(value)).not.toContain("private address");
    expect(() => extractIdahoHousePositionLabels(Buffer.from("changed"), fixture)).toThrow("MEMBERSHIP_BYTES_INVALID");
    const incomplete = Buffer.from("District 1 House Seat A");
    const partial = { ...fixture, entries: fixture.entries.map((row) => row.id === "idaho-house-membership-20261030" ? { ...row, byteSize: incomplete.length, sha256: sha(incomplete) } : row) };
    expect(() => extractIdahoHousePositionLabels(incomplete, partial)).toThrow("POSITION_COVERAGE_INVALID");
  });
});
