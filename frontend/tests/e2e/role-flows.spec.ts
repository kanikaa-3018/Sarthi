import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import crypto from "node:crypto";

const API_BASE = "http://127.0.0.1:8000";
const AUTH_STORAGE_KEY = "sarthi.auth.session";

const accounts = {
  buyer: { username: "asha.buyer", password: "buyer-asha-pass" },
  seller: { username: "seller.a", password: "seller-a-pass" },
  admin: { username: "reviewer.admin", password: "admin-reviewer-pass" }
};

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

  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/admin/review-queue") && response.ok(), { timeout: 30_000 }),
    page.goto("/admin")
  ]);
  await expect(page.getByText("Seller review queue")).toBeVisible();
  await expect(page.getByText("Sellers needing action")).toBeVisible();
  await expect(page.getByText("Needs decision")).toBeVisible();
  await expect(page.getByText("1. Check").first()).toBeVisible();

  await page.goto("/admin/agent");
  await expect(page.getByText("AI Triage").first()).toBeVisible();
  await expect(page.getByText("Priority queue")).toBeVisible();
  await expect(page.getByText("Gemini reviewer assist")).toBeVisible();

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

async function loginAs(page: Page, request: APIRequestContext, role: keyof typeof accounts) {
  const account = accounts[role];
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: {
      username: account.username,
      password_hash: sha256(account.password)
    }
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  expect(session.account.role).toBe(role);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
    [AUTH_STORAGE_KEY, session]
  );
  return session as { access_token: string };
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
