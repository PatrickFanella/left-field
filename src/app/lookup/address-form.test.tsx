import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressForm } from "./address-form";

const token = { ok: true, json: async () => ({ csrfToken: "csrf" }) };
const matched = { status: "matched", senateRepresentation: "none", houseSeat: { officeTermId: "office_house_1", seatCycleId: "seat_house_1" }, senateSeats: [] };

describe("AddressForm", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("discloses the Census URL boundary and posts only JSON after a no-store bootstrap", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(token).mockResolvedValueOnce({ ok: true, json: async () => matched }); vi.stubGlobal("fetch", fetch);
    render(<AddressForm />); const input = await screen.findByLabelText("Street address");
    expect(screen.getByRole("link", { name: "official Census privacy material" })).toHaveAttribute("href", "https://www.census.gov/about/policies/privacy.html");
    fireEvent.change(input, { target: { value: "123 Example Street" } }); fireEvent.click(screen.getByRole("button", { name: "Find seats" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2)); expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" }); expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf" } }); expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ address: "123 Example Street" }); expect(input).toHaveValue(""); expect(await screen.findByRole("status")).toHaveFocus(); expect(screen.getByText("This territory has no Senate representation.")).toBeInTheDocument();
  });
  it("uses finite messages that do not repeat an address or server detail", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(token).mockResolvedValueOnce({ ok: false, json: async () => ({ status: "no_match", detail: "123 Example Street 1,2" }) }); vi.stubGlobal("fetch", fetch);
    render(<AddressForm />); fireEvent.change(await screen.findByLabelText("Street address"), { target: { value: "123 Example Street" } }); fireEvent.click(screen.getByRole("button", { name: "Find seats" }));
    const status = await screen.findByRole("status"); expect(status).toHaveTextContent("No match was found"); expect(status).not.toHaveTextContent("123 Example"); await waitFor(() => expect(status).toHaveFocus());
  });
  it("aborts outstanding work and clears the controlled field on unmount", async () => {
    let signal: AbortSignal | undefined; const fetch = vi.fn().mockResolvedValueOnce(token).mockImplementationOnce((_url, init) => { signal = (init as RequestInit).signal ?? undefined; return new Promise(() => {}); }); vi.stubGlobal("fetch", fetch);
    const view = render(<AddressForm />); const input = await screen.findByLabelText("Street address"); fireEvent.change(input, { target: { value: "123 Example Street" } }); fireEvent.click(screen.getByRole("button", { name: "Find seats" })); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2)); view.unmount(); expect(signal?.aborted).toBe(true);
  });
});
