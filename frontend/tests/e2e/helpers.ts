import { expect, type APIRequestContext, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { getDemoAccountForRole, type DemoRole } from "../../src/demoAccounts";
import { resolveE2eDatabaseName } from "../../e2eRuntime";

export type { DemoRole };

export const API_BASE = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "58001"}`;

const AUTH_STORAGE_KEY = "sarthi.auth.session";
export const E2E_DATABASE_NAME = resolveE2eDatabaseName();

export async function resetSeed(request: APIRequestContext) {
  const health = await request.get(`${API_BASE}/health`);
  expect(health.ok(), await health.text()).toBeTruthy();
  const environment = await health.json() as { db?: string };
  expect(E2E_DATABASE_NAME, "Refusing to reset a database without an e2e marker").toMatch(/(?:^|_)e2e(?:_|$)/);
  expect(environment.db, "Refusing to reset a non-E2E database").toBe(E2E_DATABASE_NAME);

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
  const account = getDemoAccountForRole(role);
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
