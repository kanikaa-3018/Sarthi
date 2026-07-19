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
  await expect(page.locator(".seller-console-shell")).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${screenshotDir}/seller-dashboard.png`, fullPage: true });

  await page.goto("/seller/proofs");
  await expect(page.getByText(/Buyer proof requests|Proof center/i).first()).toBeVisible();
  await expect(page.locator(".seller-proof-ledger")).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/seller-proof-center.png`, fullPage: true });

  await loginAs(page, request, "admin");
  await page.goto("/admin/uploads");
  await expect(page.getByText("Upload review")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".seller-uploads-layout")).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/admin-upload-review.png`, fullPage: true });
});

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
