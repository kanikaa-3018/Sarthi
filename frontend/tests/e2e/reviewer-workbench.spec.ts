import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAs, resetSeed } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("review desk keeps the selected decision visible without duplicate briefing", async ({ page, request }) => {
  await loginAs(page, request, "admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin");

  await expect(page.getByTestId("reviewer-workbench")).toBeVisible();
  await expect(page.getByText("Recommended", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Next reviewer step", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve document" })).toBeInViewport();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
});

test("mobile reviewer navigation and upload actions remain complete", async ({ page, request }) => {
  await loginAs(page, request, "admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/uploads");

  for (const label of ["Review Desk", "AI Triage", "Risk & Policy", "Work Saved"]) {
    await expectFullyInsideViewport(page, page.getByRole("button", { name: label }));
  }
  const cards = page.getByTestId("reviewer-upload-cards");
  await expect(cards).toBeVisible();
  await cards.getByRole("button", { name: "Review" }).first().click();
  await expect(page.getByText("Selected upload", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve (document|proof)/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to uploads" }).click();
  await expect(cards).toBeVisible();
  await expect(cards.getByText("Submitted", { exact: true }).first()).toBeVisible();
  await expect(cards.getByText("Checks", { exact: true }).first()).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
});

async function expectFullyInsideViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
