import { expect, test } from "@playwright/test";
import { API_BASE, loginAs, resetSeed } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("buyer can reach checkout confidence flow", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop/checkout/kurti_1_1/kurti_1_1_xl");
  await expect(page.getByText(/Payment method|Cash on Delivery|Pay online/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Place|placing/i }).first()).toBeVisible();
});

test("seller can reach proof request workspace", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller/proofs");
  await expect(page.getByText(/Buyer asks|proof requests|Proof/i).first()).toBeVisible();
});

test("admin route workspaces and guarded review routes are available", async ({ page, request }) => {
  const session = await loginAs(page, request, "admin");

  await page.goto("/admin");
  await expect(page.getByText("Seller review queue")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Sellers needing action")).toBeVisible();
  await expect(page.getByText("Needs decision")).toBeVisible();
  await expect(page.getByText("1. Check").first()).toBeVisible();

  await page.goto("/admin/agent");
  await expect(page.getByText("AI Triage").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Priority queue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reviewer plan" })).toBeVisible();

  await page.goto("/admin/policy");
  await expect(page.getByText("Risk & Policy").first()).toBeVisible();
  await expect(page.getByText("Human-in-loop gates")).toBeVisible();

  await page.goto("/admin/impact");
  await expect(page.getByText("Work Saved").first()).toBeVisible();
  await expect(page.getByText("Where effort goes")).toBeVisible();

  const probe = await request.post(`${API_BASE}/admin/verification-documents/not-a-real-doc/approve`, {
    headers: { authorization: `Bearer ${session.access_token}` },
    data: { notes: "E2E route probe only." }
  });
  expect(probe.status()).toBe(404);
});

test("seller proof submission reaches admin approval loop", async ({ page, request }) => {
  const sellerSession = await loginAs(page, request, "seller");

  await page.goto("/seller/proofs");
  await expect(page.getByText("Show buyers proof they can trust")).toBeVisible();
  await page.getByRole("button", { name: /Upload next proof/i }).click();

  await expect(page.getByText("Review and submit")).toBeVisible();
  await page.getByRole("button", { name: /Apply draft/i }).click();
  await expect(page.getByLabel("Proof title")).toHaveValue("Fabric close-up proof");
  await page.getByLabel("Proof file or real image link").fill("seeded://proofs/e2e/fabric-closeup");
  await expect(page.getByRole("button", { name: /Submit proof reference/i })).toBeEnabled();

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/seller/me/evidence-assets") &&
      response.request().method() === "POST" &&
      response.ok()
    ),
    page.getByRole("button", { name: /Submit proof reference/i }).click()
  ]);

  await expect(page.getByText(/Proof submitted to admin/i)).toBeVisible();
  await expect(page.getByText(/Fabric close-up for fabric/i).first()).toBeVisible();
  await expect(page.getByText("Admin review").first()).toBeVisible();

  await loginAs(page, request, "admin");
  await page.goto("/admin/uploads");
  await expect(page.getByText("Upload review")).toBeVisible();
  await page.getByPlaceholder("Search seller, document, product").fill("Fabric close-up proof");

  const proofRow = page.getByRole("row").filter({ hasText: "Fabric close-up proof" });
  await expect(proofRow).toBeVisible();
  await proofRow.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Selected upload")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve proof/i })).toBeEnabled();

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/admin/evidence-assets/") &&
      response.url().includes("/approve") &&
      response.request().method() === "POST" &&
      response.ok()
    ),
    page.getByRole("button", { name: /Approve proof/i }).click()
  ]);

  await expect(page.getByText("Seller proof approved.")).toBeVisible();

  const coach = await request.get(`${API_BASE}/seller/me/evidence-coach`, {
    headers: { authorization: `Bearer ${sellerSession.access_token}` }
  });
  expect(coach.ok()).toBeTruthy();
  const payload = await coach.json();
  expect(payload.proof_assets.some((asset: any) =>
    asset.product_title === "Blue Floral Cotton Kurti Office Ready" &&
    asset.proof_type === "fabric_closeup" &&
    asset.attribute === "fabric" &&
    asset.status === "verified"
  )).toBeTruthy();
});
