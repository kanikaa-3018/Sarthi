import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loginAs, resetSeed } from "./helpers";

const screenshotDir = "test-results/visual-smoke";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
  mkdirSync(screenshotDir, { recursive: true });
});

test("seller and admin core screens stay visually stable", async ({ page, request }) => {
  await loginAs(page, request, "seller");

  await page.goto("/seller");
  await expect(page.getByRole("heading", { name: "NayiDisha Fashions" })).toBeVisible();
  await expect(page.locator(".seller-app")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${screenshotDir}/seller-today.png`, fullPage: true });

  await page.goto("/seller/products");
  await expect(page.getByRole("table", { name: "Seller products" })).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${screenshotDir}/seller-products.png`, fullPage: true });

  const measurementRow = page.getByRole("row").filter({ hasText: "Maroon Festive Kurta Set Festival Edit" });
  await measurementRow.getByRole("button", { name: "Update measurements" }).click();
  await expect(page.getByRole("dialog", { name: "Update measurements" })).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/seller-measurement-dialog.png` });
  await page.keyboard.press("Escape");

  await page.goto("/seller/new");
  await expect(page.getByRole("heading", { name: "Create a listing" })).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${screenshotDir}/seller-new-listing.png`, fullPage: true });

  await page.goto("/seller/proofs");
  await expect(page.getByRole("heading", { name: "Proof requests" })).toBeVisible();
  await expect(page.locator(".seller-proof-lane")).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/seller-proof-center.png`, fullPage: true });

  await page.getByRole("button", { name: "Upload proof" }).first().click();
  await expect(page.getByRole("dialog", { name: "Upload proof" })).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/seller-proof-dialog.png` });
  await page.keyboard.press("Escape");

  await page.goto("/seller/market");
  await expect(page.getByRole("table", { name: "Market evidence comparison" })).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${screenshotDir}/seller-market-compare.png`, fullPage: true });

  await page.getByTitle("Toggle Theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: `${screenshotDir}/seller-market-compare-dark.png`, fullPage: true });
  await page.getByTitle("Toggle Theme").click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/seller/proofs");
  await expect(page.getByRole("heading", { name: "Proof requests" })).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${screenshotDir}/seller-proofs-mobile.png`, fullPage: true });

  await page.setViewportSize({ width: 1280, height: 720 });

  await loginAs(page, request, "admin");
  await page.goto("/admin/uploads");
  await expect(page.getByText("Upload review")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".seller-uploads-layout")).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/admin-upload-review.png`, fullPage: true });
});

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
