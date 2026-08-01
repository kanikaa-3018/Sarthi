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
  await page.goto("/shop/product/kurti_1_3?variant=kurti_1_1_xl");

  await expect(page.locator(".product-detail-shell")).toBeVisible();
  await expect(page.locator(".samvaad-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask from verified facts" })).toBeVisible();

  const askTop = await topOf(page, ".samvaad-card");
  const checkoutTop = await topOf(page, ".cod-action-card");
  expect(askTop).toBeLessThan(checkoutTop);
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

  const gallery = page.getByRole("group", { name: /Product photos for Blue Floral Cotton Dress Everyday Wear/ });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByText("1 / 4")).toBeVisible();
  await expect(gallery.getByRole("button", { name: "View product photo 2" })).toBeVisible();
  await gallery.getByRole("button", { name: "Next product photo" }).click();
  await expect(gallery.getByText("2 / 4")).toBeVisible();
  await gallery.getByRole("button", { name: "View product photo 1" }).click();
  await expect(gallery.getByText("1 / 4")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
});

test("sku truth card and fit confidence explain buyer risk without a technical dump", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_3_3?variant=kurti_3_3_l");

  const truthCard = page.getByRole("region", { name: "SKU truth card" });
  await expect(truthCard).toBeVisible();
  await expect(truthCard.getByText("What is verified")).toBeVisible();
  await expect(truthCard.getByText("What is missing")).toBeVisible();
  await expect(truthCard.getByText("What changed recently")).toBeVisible();
  await expect(truthCard.getByText(/Why score is/i)).toBeVisible();
  await expect(truthCard.getByText("Which seller proof is pending")).toBeVisible();
  await expect(truthCard.getByText("Which claim is unsafe to trust yet")).toBeVisible();

  const fitCard = page.getByRole("region", { name: "Fit confidence" });
  await expect(fitCard).toBeVisible();
  await expect(fitCard.getByText(/Runs small|True to size|Runs loose/)).toBeVisible();
  await expect(fitCard.getByText("Size risk")).toBeVisible();
  await expect(fitCard.getByText("Reviewer-fit summary")).toBeVisible();
  await expect(fitCard.getByText("Seller measurement proof", { exact: true })).toBeVisible();
  await expect(fitCard.getByText("Family profiles")).toBeVisible();

  const reviewCard = page.getByRole("region", { name: "Review credibility" }).first();
  await expect(reviewCard).toBeVisible();
  await expect(reviewCard.locator(".review-credibility-metrics").getByText("raw rating")).toBeVisible();
  await expect(reviewCard.locator(".review-credibility-metrics").getByText("trusted rating")).toBeVisible();
  await expect(reviewCard.getByText("Verified purchase reviews")).toBeVisible();
  await expect(reviewCard.getByText("Review spike detector")).toBeVisible();
  await reviewCard.getByText("Why some reviews were down-weighted").click();
  await expect(reviewCard.locator(".review-warning-tags").getByText(/New account|High-return reviewer|Repeated-text pattern/).first()).toBeVisible();

  const mummyProfile = fitCard.getByRole("button", { name: /Mummy/ });
  await expect(mummyProfile).toBeVisible();
  await mummyProfile.click();
  await expect(page.locator(".detail-size-options button.active")).toHaveText(/XXL/);
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("region", { name: "SKU truth card" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fit confidence" })).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/10-product-truth-fit-mobile.png`, fullPage: true });
});

test("proof dialog owns scrolling and closes from the keyboard", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_1_3?variant=kurti_1_1_xl");
  await expect(page.locator(".product-detail-shell")).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 460));
  await page.getByRole("button", { name: "Proof", exact: true }).first().click();

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

test("trust receipt explains score, review credibility, and conflicting evidence", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_1_3?variant=kurti_1_3_l");
  await expect(page.locator(".product-detail-shell")).toBeVisible();

  await page.locator(".detail-help-actions").getByRole("button", { name: "See proof" }).click();
  await expect(page.getByRole("region", { name: "Proof details" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Score explanation" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Proof details" }).getByLabel("Review credibility")).toBeVisible();
  await expect(page.getByRole("region", { name: "Conflicting evidence" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Proof details" }).getByText(/raw rating|trusted rating/i).first()).toBeVisible();
  await expect(page.getByText("Sarthi found a signal mismatch")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/08-product-trust-receipt-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".product-detail-shell")).toBeVisible();
  await page.locator(".detail-help-actions").getByRole("button", { name: "See proof" }).click();
  await expect(page.getByRole("region", { name: "Score explanation" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Proof details" }).getByLabel("Review credibility")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/09-product-trust-receipt-mobile.png`, fullPage: true });
});

async function topOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
}

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
