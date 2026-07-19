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

async function topOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
}

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
