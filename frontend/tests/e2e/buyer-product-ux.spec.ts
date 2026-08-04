import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loginAs, resetSeed } from "./helpers";

const auditDir = "../output/playwright/buyer-ui-audit";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
  mkdirSync(auditDir, { recursive: true });
});

test("verified-facts questions are part of the product decision, not buried after checkout", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_1_3?variant=kurti_1_3_xl");

  await expect(page.locator(".product-detail-shell")).toBeVisible();
  await expect(page.locator(".samvaad-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask from verified facts" })).toBeVisible();

  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);

  await page.screenshot({ path: `${auditDir}/04-product-desktop-1280x720.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".samvaad-card")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/05-product-mobile-390x844.png`, fullPage: true });
});

test("product detail shows multi-image gallery with thumbnails", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_1_1?variant=kurti_1_1_xl");

  const gallery = page.getByRole("group", { name: /Product photos for Blue Floral Cotton Kurti Everyday Wear/ });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByText("1 / 4")).toBeVisible();
  await expect(gallery.getByRole("button", { name: "View product photo 2" })).toBeVisible();
  await gallery.getByRole("button", { name: "Next product photo" }).click();
  await expect(gallery.getByText("2 / 4")).toBeVisible();
  await gallery.getByRole("button", { name: "View product photo 1" }).click();
  await expect(gallery.getByText("1 / 4")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
});

test("wishlist trust action opens the saved trust workspace", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop");
  const firstProduct = page.locator(".buyer-product-card").first();
  await expect(firstProduct).toBeVisible();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/wishlist/intents") && response.request().method() === "POST"),
    firstProduct.getByRole("button", { name: /wishlist/i }).click()
  ]);

  await page.goto("/shop/wishlist");
  await expect(page.locator(".wishlist-product-card").first()).toBeVisible();

  const trustAction = page.locator(".wishlist-product-card").first().locator(".wishlist-actions button").nth(1);
  await expect(trustAction).toBeVisible();
  await expect(trustAction).toHaveText(/check trust|proof/i);
  await trustAction.click();

  await expect(page).toHaveURL(/\/shop\/saved\/[^?]+\?proof=1/);
  await expect(page.locator(".sarthi-saved-workspace")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
});

test("trust and fit guidance stay lightweight on the product page", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_3_3?variant=kurti_3_3_l");

  await expect(page.locator(".keep-confidence-card")).toBeVisible();
  await expect(page.locator(".detail-size-options")).toBeVisible();
  await expect(page.getByRole("region", { name: "SKU truth card" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Fit confidence" })).toHaveCount(0);
  await expect(page.getByText("What is verified")).toHaveCount(0);

  await page.locator(".detail-size-options").getByRole("button", { name: "XL", exact: true }).click();
  await expect(page.locator(".detail-size-options button.active")).toHaveText(/XL/);
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".keep-confidence-card")).toBeVisible();
  await expect(page.locator(".detail-size-options")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/10-product-light-trust-mobile.png`, fullPage: true });
});

test("proof dialog owns scrolling and closes from the keyboard", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_1_3?variant=kurti_1_3_xl");
  await expect(page.locator(".product-detail-shell")).toBeVisible();

  await page.locator(".keep-score-interactive-bar").getByRole("button", { name: "See proof" }).click({ force: true });

  await expect(page.getByRole("dialog", { name: "What Sarthi checked" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/buyer-scroll-lock/);
  const backgroundScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 700);
  expect(await page.evaluate(() => window.scrollY)).toBe(backgroundScroll);
  await page.screenshot({ path: `${auditDir}/06-product-proof-dialog-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  const dialogBox = await page.getByRole("dialog", { name: "What Sarthi checked" }).boundingBox();
  expect(dialogBox?.width ?? 999).toBeLessThanOrEqual(372);
  expect(dialogBox?.height ?? 999).toBeLessThanOrEqual(826);
  await page.screenshot({ path: `${auditDir}/07-product-proof-dialog-mobile.png` });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "What Sarthi checked" })).toBeHidden();
});

test("inline proof receipt stays concise and readable", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_1_3?variant=kurti_1_3_l");
  await expect(page.locator(".product-detail-shell")).toBeVisible();

  await page.locator(".detail-help-actions").getByRole("button", { name: "See proof" }).click();
  await expect(page.getByRole("region", { name: "Proof details" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".trust-receipt-card, .simple-proof-summary").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Score explanation" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Conflicting evidence" })).toHaveCount(0);
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/08-product-trust-receipt-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".product-detail-shell")).toBeVisible();
  await page.locator(".detail-help-actions").getByRole("button", { name: "See proof" }).click();
  await expect(page.locator(".trust-receipt-card, .simple-proof-summary").first()).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/09-product-trust-receipt-mobile.png`, fullPage: true });
});

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
