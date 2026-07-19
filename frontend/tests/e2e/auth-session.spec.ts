import { expect, test, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS, type AuthPortal } from "../../src/demoAccounts";
import { API_BASE, resetSeed } from "./helpers";

const portalButtons: Record<AuthPortal, RegExp> = {
  buyer: /Buyer.*Private fit memory/i,
  seller: /Seller.*Aggregate evidence only/i,
  reviewer: /Reviewer.*Admin access only/i
};

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

for (const portal of Object.keys(DEMO_ACCOUNTS) as AuthPortal[]) {
  const account = DEMO_ACCOUNTS[portal];

  test(`${portal} demo account signs in through the UI`, async ({ page }) => {
    await loginThroughDemo(page, portal);
    await expect(page).toHaveURL(account.defaultPath);
    await expect(page.getByText(account.displayName, { exact: true }).first()).toBeVisible();
  });
}

test("logout clears the browser session and revokes the API token", async ({ page, request }) => {
  await loginThroughDemo(page, "buyer");
  await expect(page).toHaveURL(DEMO_ACCOUNTS.buyer.defaultPath);
  const stored = await page.evaluate(() => localStorage.getItem("sarthi.auth.session"));
  expect(stored).not.toBeNull();
  const token = (JSON.parse(stored!) as { access_token: string }).access_token;
  const logoutResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/logout") && response.request().method() === "POST"
  );

  await page.getByTitle("Logout").click();
  expect((await logoutResponse).status()).toBe(200);
  await expect(page).toHaveURL("/login");
  expect(await page.evaluate(() => localStorage.getItem("sarthi.auth.session"))).toBeNull();
  await page.goto("/shop");
  await expect(page).toHaveURL("/login");

  const me = await request.get(`${API_BASE}/auth/me`, {
    headers: { authorization: `Bearer ${token}` }
  });
  expect(me.status()).toBe(401);
});

test("logout completes locally when the API request fails", async ({ page }) => {
  await loginThroughDemo(page, "buyer");
  await expect(page).toHaveURL(DEMO_ACCOUNTS.buyer.defaultPath);
  await page.route("**/api/auth/logout", (route) => route.abort("failed"));

  await page.getByTitle("Logout").click();

  await expect(page).toHaveURL("/login");
  expect(await page.evaluate(() => localStorage.getItem("sarthi.auth.session"))).toBeNull();
  await page.goto("/shop");
  await expect(page).toHaveURL("/login");
});

test("logout completes locally before a stalled API request settles", async ({ page }) => {
  await loginThroughDemo(page, "buyer");
  await expect(page).toHaveURL(DEMO_ACCOUNTS.buyer.defaultPath);
  await page.route("**/api/auth/logout", () => new Promise(() => {}));

  await page.getByTitle("Logout").click();

  await expect(page).toHaveURL("/login", { timeout: 1_000 });
  expect(await page.evaluate(() => localStorage.getItem("sarthi.auth.session"))).toBeNull();
});

async function loginThroughDemo(page: Page, portal: AuthPortal) {
  const account = DEMO_ACCOUNTS[portal];
  await page.goto("/login");
  if (portal !== "buyer") {
    await page.getByRole("button", { name: portalButtons[portal] }).click();
  }
  await page.getByRole("button", { name: "Use demo" }).click();
  await expect(page.locator('input[autocomplete="username"]')).toHaveValue(account.username);
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveValue(account.password);
  await page.getByRole("button", { name: "Continue" }).click();
}
