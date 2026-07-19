import { expect, type APIRequestContext, type Page } from "@playwright/test";
import crypto from "node:crypto";

export const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:58001";

const AUTH_STORAGE_KEY = "sarthi.auth.session";

const accounts = {
  buyer: { username: "asha.buyer", password: "buyer-asha-pass" },
  seller: { username: "seller.a", password: "seller-a-pass" },
  admin: { username: "reviewer.admin", password: "admin-reviewer-pass" }
};

export type DemoRole = keyof typeof accounts;

export async function resetSeed(request: APIRequestContext) {
  const response = await request.post(`${API_BASE}/seed/reset`);
  expect(response.ok(), await response.text()).toBeTruthy();
}

export async function loginAs(page: Page, request: APIRequestContext, role: DemoRole) {
  const session = await apiLogin(request, role);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
    [AUTH_STORAGE_KEY, session]
  );
  return session;
}

export async function apiLogin(request: APIRequestContext, role: DemoRole) {
  const account = accounts[role];
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: {
      username: account.username,
      password_hash: sha256(account.password)
    }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const session = await response.json();
  expect(session.account.role).toBe(role);
  return session as { access_token: string; account: { role: DemoRole } };
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
