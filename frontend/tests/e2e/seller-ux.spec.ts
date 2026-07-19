import { expect, test } from "@playwright/test";
import { loginAs, resetSeed } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("seller Today page leads with one next action", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller");

  await expect(page.getByRole("heading", { name: "NayiDisha Fashions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Next action" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Seller facts" })).toBeVisible();
});

test("seller routes expose focused workspaces", async ({ page, request }) => {
  await loginAs(page, request, "seller");

  for (const [path, heading] of [
    ["/seller/products", "Products"],
    ["/seller/new", "Create a listing"],
    ["/seller/proofs", "Proof requests"],
    ["/seller/market", "Market Compare"]
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("proof dialog locks the page and restores focus", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller/proofs");
  const trigger = page.getByRole("button", { name: "Upload proof" }).first();

  await trigger.click();

  await expect(page.getByRole("dialog", { name: "Upload proof" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/seller-scroll-lock/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Upload proof" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("seller mobile routes keep their focused hierarchy without horizontal overflow", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, request, "seller");

  for (const [path, heading] of [
    ["/seller", "NayiDisha Fashions"],
    ["/seller/products", "Products"],
    ["/seller/new", "Create a listing"],
    ["/seller/proofs", "Proof requests"],
    ["/seller/market", "Market Compare"]
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);
  }
});
