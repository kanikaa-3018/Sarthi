import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const auditDir = "../output/playwright/buyer-ui-audit";

test.beforeAll(() => {
  mkdirSync(auditDir, { recursive: true });
});

test("public landing tells the buyer trust story with real commerce imagery", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Buy the product you will actually keep." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Shop with proof" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask the product. Get an answer grounded in proof." })).toBeVisible();
  await expect(page.locator(".landing-brand .sarthi-mark")).toHaveCount(2);
  await expect(page.locator(".landing-page img")).toHaveCount(5);
  await expect.poll(() => page.locator(".landing-page img").evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
  )).toBe(true);

  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of ["agentic", "trust os", "architecture", "oracle", "99.2%", "1,900 cr", "laser-measured"]) {
    expect(body).not.toContain(forbidden);
  }

  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/00-landing-first-viewport-1280x720.png` });
  await page.screenshot({ path: `${auditDir}/01-landing-desktop-1280x720-light.png`, fullPage: true });

  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: `${auditDir}/02-landing-desktop-1280x720-dark.png`, fullPage: true });
});

test("public landing stays usable on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Buy the product you will actually keep." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Shop with proof" }).first()).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/03-landing-mobile-390x844.png`, fullPage: true });
});

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
