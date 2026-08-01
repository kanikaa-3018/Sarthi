import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loginAs, resetSeed } from "./helpers";

const auditDir = "../output/playwright/buyer-ui-audit";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
  mkdirSync(auditDir, { recursive: true });
});

test("catalog paginates products and shows the Trust Run immediately", async ({ page, request }) => {
  test.setTimeout(60_000);
  await loginAs(page, request, "buyer");
  await page.route("**/api/trust-runs", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });
  await page.goto("/shop");

  await expect(page.getByRole("heading", { name: "Popular products" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".buyer-product-card")).toHaveCount(8);
  const pagination = page.getByRole("navigation", { name: "Catalog pages" });
  await expect(pagination).toBeVisible();
  await expect(pagination.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Showing 1–8 of 64")).toBeVisible();
  const firstPageClusters = await page.locator(".buyer-product-card").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-cluster-id"))
  );
  expect(new Set(firstPageClusters).size).toBeGreaterThan(6);

  await page.getByRole("button", { name: "Safety", exact: true }).first().click();
  await expect(page.getByRole("status", { name: "Running product trust check" })).toBeVisible();
  await expect(page.getByText("Building an evidence-backed choice")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Compare safer choices" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Sarthi trust run" })).toBeVisible();
  await expect(page.getByText("Seller gate")).toBeVisible();
  await expect(page.getByText("Review credibility")).toBeVisible();
  await expect(page.getByText("Checkout readiness")).toBeVisible();
  await page.screenshot({ path: `${auditDir}/11-trust-run-sheet-desktop.png`, fullPage: true });
  await expect(page.locator(".sarthi-scan-toast, .sarthi-floating-trigger")).toHaveCount(0);
});

test("mobile catalog reaches products quickly and uses six-item pages", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, request, "buyer");
  await page.goto("/shop");

  await expect(page.getByRole("heading", { name: "Popular products" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".buyer-product-card")).toHaveCount(6);
  const firstCard = await page.locator(".buyer-product-card").first().boundingBox();
  expect(firstCard?.y ?? 9999).toBeLessThan(760);
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/10-shop-mobile-before-overhaul-check.png` });
});

test("mobile Trust Run sheet stays readable", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, request, "buyer");
  await page.goto("/shop");

  await expect(page.getByRole("heading", { name: "Popular products" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Safety", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Compare safer choices" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Sarthi trust run" })).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${auditDir}/12-trust-run-sheet-mobile.png`, fullPage: true });
});

test("catalog image controls use backend product galleries", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop");

  const gallery = page.getByRole("group", { name: /Product images for Blue Floral Cotton Dress Everyday Wear/ });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByText("1 / 4")).toBeVisible();
  await gallery.hover();
  await gallery.getByRole("button", { name: "Next image" }).click();
  await expect(gallery.getByText("2 / 4")).toBeVisible();
  await expect(page.locator(".buyer-product-gallery-controls")).toHaveCount(8);
});

test("saved check gives buyers a three-step path and a grounded-answer fallback", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/saved/kurti_1_2?proof=1");

  await expect(page.getByRole("navigation", { name: "Trust check steps" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1. Saved item")).toBeVisible();
  await expect(page.getByText("2. Evidence checked")).toBeVisible();
  await expect(page.getByText("3. Choose safely")).toBeVisible();
  await expect(page.getByRole("form", { name: "Ask from verified facts" })).toBeVisible();
  await expect(page.getByText("Answers use verified product, seller, return, and proof records only.")).toBeVisible();
  await expect(page.getByText("Saved product radar")).toBeVisible();
  await expect(page.getByText("Evidence graph")).toBeVisible();
  await expect(page.getByRole("region", { name: "Evidence path" })).toBeVisible();
  await expect(page.getByText("Simple evidence path")).toBeVisible();

  const factsForm = page.getByRole("form", { name: "Ask from verified facts" });
  await factsForm.getByPlaceholder("Ask: should I buy this?").fill("Is fabric proof enough to buy?");
  await factsForm.getByRole("button", { name: "Check" }).click();
  await expect(page.locator(".buyer-decision-answer")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Verified answer").first()).toBeVisible();
  await expect(page.locator(".buyer-decision-reasons span").first()).toBeVisible();
  const graphChatButton = page.getByRole("button", { name: "Open graph chat" });
  await expect(graphChatButton).toBeEnabled({ timeout: 15_000 });
  await graphChatButton.click();
  await expect(page.getByRole("dialog", { name: "Ask the connected proof map" })).toBeVisible();
  await page.getByRole("button", { name: "Close evidence graph" }).click();
  await page.screenshot({ path: `${auditDir}/22-saved-ready-desktop.png`, fullPage: true });
});

test("orders and proof requests lead with filters and next actions", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/orders");

  await expect(page.getByRole("group", { name: "Filter orders" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Needs action/ })).toBeVisible();
  await expect(page.locator(".order-product-card").first()).toBeVisible();
  await page.screenshot({ path: `${auditDir}/23-orders-desktop.png`, fullPage: true });

  await page.goto("/shop/proofs");
  await expect(page.getByRole("status", { name: "Proof request summary" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Filter proof requests" })).toBeVisible();
  await expect(page.getByText("What to do next").first()).toBeVisible();
  await expect(page.getByText("Closed proof loop").first()).toBeVisible();
  await expect(page.getByText("Demand grouped").first()).toBeVisible();
  await expect(page.getByText("Buyer notified").first()).toBeVisible();
  await page.screenshot({ path: `${auditDir}/24-proofs-desktop.png`, fullPage: true });
});

test("checkout and trust controls explain the buyer decision in plain steps", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/checkout/kurti_1_3/kurti_1_3_xl");

  await expect(page.getByRole("navigation", { name: "Checkout steps" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Review item").first()).toBeVisible();
  await expect(page.getByText("Choose payment").first()).toBeVisible();
  await expect(page.getByText("Place order").first()).toBeVisible();
  await expect(page.getByText("Your item, payment choice, and buyer protection stay visible until you place the order.")).toBeVisible();
  await expect(page.getByLabel("Dark pattern disruptor")).toBeVisible();
  await expect(page.getByText(/Checkout pressure is clear|No checkout pressure found|Do not rush this offer|Checkout pressure blocked/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Checkout confidence" })).toBeVisible();
  await expect(page.getByText(/Prepaid is safer here|COD is safer here/).first()).toBeVisible();
  await expect(page.getByText("Refund expectation is locked before payment.").first()).toBeVisible();
  await expect(page.getByText("No forced payment mode").first()).toBeVisible();
  await page.screenshot({ path: `${auditDir}/25-checkout-desktop.png`, fullPage: true });

  await page.goto("/trust");
  await expect(page.getByRole("region", { name: "Fit and privacy controls" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("You control what Sarthi remembers")).toBeVisible();
  await page.screenshot({ path: `${auditDir}/26-trust-desktop.png`, fullPage: true });
});

test("mobile buyer workspaces remain contained in light and dark themes", async ({ page, request }) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, request, "buyer");
  const routes = [
    {
      route: "/shop/saved/kurti_1_2?proof=1",
      filename: "32-saved-mobile.png",
      ready: async () => {
        await expect(page.getByRole("navigation", { name: "Trust check steps" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("region", { name: "Evidence path" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Open graph chat" })).toBeEnabled({ timeout: 20_000 });
      }
    },
    {
      route: "/shop/orders",
      filename: "33-orders-mobile.png",
      ready: () => expect(page.getByRole("group", { name: "Filter orders" })).toBeVisible({ timeout: 15_000 })
    },
    {
      route: "/shop/proofs",
      filename: "34-proofs-mobile.png",
      ready: () => expect(page.getByRole("status", { name: "Proof request summary" })).toBeVisible({ timeout: 15_000 })
    },
    {
      route: "/shop/checkout/kurti_1_3/kurti_1_3_xl",
      filename: "35-checkout-mobile.png",
      ready: () => expect(page.getByRole("navigation", { name: "Checkout steps" })).toBeVisible({ timeout: 15_000 })
    },
    {
      route: "/trust",
      filename: "36-trust-mobile.png",
      ready: () => expect(page.getByRole("heading", { name: "Your trust controls" })).toBeVisible({ timeout: 15_000 })
    }
  ] as const;

  for (const item of routes) {
    await page.goto(item.route);
    await item.ready();
    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `${auditDir}/${item.filename}`, fullPage: true });
  }

  await page.goto("/shop");
  await page.getByRole("button", { name: "Toggle Theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: `${auditDir}/37-shop-mobile-dark.png`, fullPage: true });
});

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
