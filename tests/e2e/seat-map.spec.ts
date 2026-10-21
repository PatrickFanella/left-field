import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertBrowserGuards, installBrowserGuards, navigate } from "./browser-guards";

test.beforeEach(async ({ page }) => {
  installBrowserGuards(page);
  await navigate(page, "/map");
  await expect(page.locator(".map-canvas svg .map-districts path")).toHaveCount(435);
});

test.afterEach(async ({ page }, testInfo) => assertBrowserGuards(page, testInfo));

test("opens a House district with its holder and FEC candidates", async ({ page }) => {
  await page.locator(".map-jump select").selectOption("NY");
  await page.getByRole("button", { name: /^NY-14/ }).click();
  const panel = page.locator(".map-panel");
  await expect(panel.getByRole("link", { name: "NY-14" })).toHaveAttribute("href", "/priorities/seat_house_ny_14_current");
  await expect(panel.getByRole("region", { name: /candidates/ }).getByRole("table")).toContainText("Ocasio-Cortez");
});

test("switches to a state legislature and opens a district", async ({ page }) => {
  await page.getByRole("button", { name: "State senate" }).click();
  await page.locator(".map-jump select").selectOption("PA");
  await expect(page.locator(".map-canvas svg .map-districts path")).toHaveCount(50);
  await page.locator(".map-district-list button").first().click();
  await expect(page.locator(".map-panel .map-seat")).toHaveCount(1);
});

test("@a11y has no detectable WCAG A/AA violations on the seat map", async ({ page }) => {
  await page.getByRole("button", { name: "U.S. Senate" }).click();
  await page.locator(".map-jump select").selectOption("GA");
  await expect(page.locator(".map-panel .map-seat")).toHaveCount(2);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});
