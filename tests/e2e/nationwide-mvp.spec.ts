import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertBrowserGuards, installBrowserGuards, navigate } from "./browser-guards";

const profilePath = process.env.E2E_MAP_PROFILE_PATH;
test.beforeEach(async ({ page }) => {
  installBrowserGuards(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await assertBrowserGuards(page, testInfo);
});

test.beforeEach(() => {
  if (!profilePath) throw new Error("E2E_MAP_PROFILE_PATH is required for the mandatory Task13 gate");
});

test("browses the seeded nationwide record and public ledger routes", async ({ page }) => {
  for (const [path, heading] of [["/", "Where the field bends."], ["/browse", "Browse the active record"], [profilePath!, "Synthetic 0"], ["/sources", "What we have, and what we do not."], ["/methodology", "How the Priority Index works"], ["/outcomes", "How the index did in 2026"], ["/about", "Who publishes this"]] as const) {
    const response = await navigate(page, path);
    expect(response?.status(), path).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    if (path === "/browse") await expect(page.getByRole("region", { name: /Scroll horizontally to view all columns/ }).first()).toBeVisible();
  }
});

test("shows empty, invalid, and missing-record states without server failures", async ({ page }) => {
  await navigate(page, "/browse?stateCode=ZZ");
  await expect(page.getByRole("heading", { name: "No records match these factual filters." })).toBeVisible();
  await navigate(page, "/browse?stateCode=not-a-state");
  await expect(page.getByRole("heading", { name: "Request not available" })).toBeVisible();
  await navigate(page, "/seats/seat_missing");
  await expect(page.getByRole("heading", { name: "Seat not in this release" })).toBeVisible();
});

test("keeps default address lookup disabled and exposes the correction entry point", async ({ page }) => {
  const addressRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/address/")) addressRequests.push(request.url()); });
  await navigate(page, "/lookup");
  await expect(page.getByRole("heading", { name: "Address lookup is not enabled here" })).toBeVisible();
  await expect(page.getByLabel("Street address")).toHaveCount(0);
  expect(addressRequests).toEqual([]);
  await navigate(page, "/corrections");
  await expect(page.getByRole("heading", { name: "Corrections are not enabled here" })).toBeVisible();
});

test("renders the seeded map and keyboard-accessible profile tables", async ({ page }) => {
  await navigate(page, profilePath!);
  const map = page.getByRole("region", { name: "District boundary" });
  await expect(map.locator("svg")).toBeVisible();
  await expect(map.locator("path")).toHaveAttribute("d", /^M/);
  const tables = page.locator(".record-section .table-wrap");
  expect(await tables.count()).toBeGreaterThan(0);
  for (let index = 0; index < await tables.count(); index++) {
    await expect(tables.nth(index)).toHaveAttribute("tabindex", "0");
    await expect(tables.nth(index)).toHaveAttribute("aria-label", /Scroll horizontally to view all columns\.$/);
  }
});

test("@a11y has no detectable WCAG A/AA violations across nationwide routes", async ({ page }) => {
  for (const path of ["/", "/browse", "/sources", "/methodology", "/about", "/lookup", profilePath!]) {
    await navigate(page, path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations, path).toEqual([]);
  }
});
