# Auth and Demo Account Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every seeded demo account sign in through the real UI and make logout complete safely without touching the active main or seller worktrees.

**Architecture:** The API seed remains canonical. A browser-safe frontend contract supplies the same three accounts to the login screen and Playwright helpers, while UI tests validate that contract against an isolated database. Logout is fixed at the HTTP boundary first, then hardened at the React session boundary for network failure.

**Tech Stack:** React 19, TypeScript, Vite, Playwright, Fastify, MongoDB, npm.

---

## File Map

- Create `frontend/src/demoAccounts.ts`: canonical browser-safe demo metadata.
- Create `frontend/tests/e2e/auth-session.spec.ts`: real UI login and logout regressions.
- Modify `frontend/src/screens/AuthScreen.tsx`: consume shared demo metadata.
- Modify `frontend/tests/e2e/helpers.ts`: consume shared accounts and isolated API port.
- Modify `frontend/playwright.config.ts`: own test ports and isolated database.
- Modify `frontend/vite.config.ts`: configurable test proxy with unchanged dev defaults.
- Modify `frontend/src/api/client.ts`: valid headers for bodyless requests.
- Modify `frontend/src/app/App.tsx`: guaranteed local logout.

### Task 1: Isolate the Playwright runtime

**Files:**
- Modify: `frontend/playwright.config.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tests/e2e/helpers.ts`

- [ ] **Step 1: Make Vite's existing defaults configurable**

Add above `defineConfig` in `frontend/vite.config.ts`:

```ts
const apiTarget = process.env.SARTHI_API_TARGET ?? "http://127.0.0.1:8000";
const frontendPort = Number(process.env.SARTHI_FRONTEND_PORT ?? 5173);
```

Use `frontendPort` for `server.port` and `apiTarget` for `server.proxy["/api"].target`. Do not change the fallback values or any build configuration.

- [ ] **Step 2: Replace the Playwright configuration with an isolated runtime**

```ts
import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.E2E_API_PORT ?? 8200);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 5190);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: { baseURL: frontendUrl, trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm --prefix ../apps/api run dev",
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...inheritedEnv,
        NODE_ENV: "test",
        PORT: String(apiPort),
        MONGODB_DB: process.env.E2E_MONGODB_DB ?? "sarthi_codex_auth_e2e",
        DEMO_CONTROLS_ENABLED: "true"
      }
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...inheritedEnv,
        SARTHI_API_TARGET: apiUrl,
        SARTHI_FRONTEND_PORT: String(frontendPort)
      }
    }
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
```

- [ ] **Step 3: Point helpers at the same isolated API**

Replace the fixed `API_BASE` in `frontend/tests/e2e/helpers.ts`:

```ts
export const API_BASE = process.env.E2E_API_BASE
  ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? "8200"}`;
```

- [ ] **Step 4: Prove the isolated setup with an existing test**

Run:

```powershell
npm --prefix frontend run test:e2e -- role-flows.spec.ts --grep "buyer can reach checkout confidence flow"
```

Expected: one test passes using ports 5190/8200 and database `sarthi_codex_auth_e2e`; live ports 5173/8000 are not reused.

- [ ] **Step 5: Commit**

```powershell
git add frontend/playwright.config.ts frontend/vite.config.ts frontend/tests/e2e/helpers.ts
git commit -m "test: isolate browser test runtime"
```

### Task 2: Establish one demo-account contract and test real UI login

**Files:**
- Create: `frontend/src/demoAccounts.ts`
- Create: `frontend/tests/e2e/auth-session.spec.ts`
- Modify: `frontend/src/screens/AuthScreen.tsx`
- Modify: `frontend/tests/e2e/helpers.ts`

- [ ] **Step 1: Write the failing role-login test**

Create `frontend/tests/e2e/auth-session.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS, type AuthPortal } from "../../src/demoAccounts";
import { resetSeed } from "./helpers";

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
```

- [ ] **Step 2: Verify the test is red**

Run `npm --prefix frontend run test:e2e -- auth-session.spec.ts`.

Expected: FAIL because `frontend/src/demoAccounts.ts` does not exist.

- [ ] **Step 3: Add the canonical contract**

Create `frontend/src/demoAccounts.ts`:

```ts
export type AuthPortal = "buyer" | "seller" | "reviewer";
export type DemoRole = "buyer" | "seller" | "admin";

type DemoAccount = {
  username: string;
  password: string;
  label: string;
  role: DemoRole;
  displayName: string;
  defaultPath: "/shop" | "/seller" | "/admin";
};

export const DEMO_ACCOUNTS = {
  buyer: {
    username: "asha.buyer",
    password: "buyer-asha-pass",
    label: "Asha (Buyer)", role: "buyer", displayName: "Asha", defaultPath: "/shop"
  },
  seller: {
    username: "seller.a",
    password: "seller-a-pass",
    label: "NayiDisha Fashions (Seller)", role: "seller",
    displayName: "NayiDisha Fashions", defaultPath: "/seller"
  },
  reviewer: {
    username: "reviewer.admin",
    password: "admin-reviewer-pass",
    label: "Reviewer Admin", role: "admin", displayName: "Reviewer Admin", defaultPath: "/admin"
  }
} as const satisfies Record<AuthPortal, DemoAccount>;

export function getDemoAccountForRole(role: DemoRole) {
  const portal: AuthPortal = role === "admin" ? "reviewer" : role;
  return DEMO_ACCOUNTS[portal];
}
```

- [ ] **Step 4: Consume the contract in runtime and test helpers**

In `AuthScreen.tsx`, import `DEMO_ACCOUNTS` and `AuthPortal`, delete the local portal type and credential object, and use:

```ts
const demo = DEMO_ACCOUNTS[portal];
```

In `helpers.ts`, import `getDemoAccountForRole` and `DemoRole`, delete the local account object/type, re-export the type, and use:

```ts
const account = getDemoAccountForRole(role);
```

No signup, portal-copy, layout, password hashing, or seed code changes are permitted.

- [ ] **Step 5: Verify and commit**

Run `npm --prefix frontend run test:e2e -- auth-session.spec.ts`.

Expected: three role-login tests pass and show Asha, NayiDisha Fashions, and Reviewer Admin at `/shop`, `/seller`, and `/admin`.

```powershell
git add frontend/src/demoAccounts.ts frontend/src/screens/AuthScreen.tsx frontend/tests/e2e/helpers.ts frontend/tests/e2e/auth-session.spec.ts
git commit -m "fix: lock demo accounts to seeded identities"
```

### Task 3: Fix normal logout at the HTTP boundary

**Files:**
- Modify: `frontend/tests/e2e/auth-session.spec.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add a failing normal-logout test**

Import `API_BASE` from `./helpers`, then add:

```ts
test("logout clears the browser session and revokes the API token", async ({ page, request }) => {
  await loginThroughDemo(page, "buyer");
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
```

- [ ] **Step 2: Verify the actual failure**

Run `npm --prefix frontend run test:e2e -- auth-session.spec.ts --grep "revokes the API token"`.

Expected: FAIL with logout HTTP 400 and Fastify's empty-JSON-body error.

- [ ] **Step 3: Fix request headers at their source**

In `frontend/src/api/client.ts`, replace the unconditional JSON content type with:

```ts
if (init?.body != null && !headers.has("Content-Type")) {
  headers.set("Content-Type", "application/json");
}
```

Keep authorization, hashing, parsing, and persisted-session cleanup unchanged.

- [ ] **Step 4: Verify and commit**

Re-run the targeted test. Expected: PASS with logout 200, local redirect, protected-route guard, and revoked-token 401.

```powershell
git add frontend/src/api/client.ts frontend/tests/e2e/auth-session.spec.ts
git commit -m "fix: send valid bodyless logout request"
```

### Task 4: Guarantee local logout during server failure

**Files:**
- Modify: `frontend/tests/e2e/auth-session.spec.ts`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: Add a failing network-failure test**

```ts
test("logout completes locally when the API request fails", async ({ page }) => {
  await loginThroughDemo(page, "buyer");
  await page.route("**/api/auth/logout", (route) => route.abort("failed"));
  await page.getByTitle("Logout").click();
  await expect(page).toHaveURL("/login");
  expect(await page.evaluate(() => localStorage.getItem("sarthi.auth.session"))).toBeNull();
  await page.goto("/shop");
  await expect(page).toHaveURL("/login");
});
```

- [ ] **Step 2: Verify the UI failure**

Run `npm --prefix frontend run test:e2e -- auth-session.spec.ts --grep "completes locally"`.

Expected: FAIL because the page remains on `/shop` with the authenticated identity and disabled Logout button.

- [ ] **Step 3: Guarantee app-level cleanup**

Replace `handleLogout` in `frontend/src/app/App.tsx`:

```ts
async function handleLogout() {
  setLoggingOut(true);
  try {
    await logout();
  } catch {
    // Local logout must still complete when server revocation is unavailable.
  } finally {
    setSession(null);
    navigate("/login", { replace: true });
    setLoggingOut(false);
  }
}
```

- [ ] **Step 4: Verify and commit**

Run `npm --prefix frontend run test:e2e -- auth-session.spec.ts --grep "logout"`.

Expected: both normal and failed-server logout tests pass.

```powershell
git add frontend/src/app/App.tsx frontend/tests/e2e/auth-session.spec.ts
git commit -m "fix: always complete local logout"
```

### Task 5: Verify repository health and hand off safely

- [ ] **Step 1: Run the complete auth spec**

Run `npm --prefix frontend run test:e2e -- auth-session.spec.ts`.

Expected: five passing tests on isolated ports/database.

- [ ] **Step 2: Run the full baseline**

Run `npm run build:test`.

Expected: API build, all API tests, and frontend production build pass.

- [ ] **Step 3: Inspect scope**

```powershell
git diff --check HEAD~4..HEAD
git status --short
git log --oneline --decorate -6
```

Expected: no whitespace errors and no changes outside the listed auth/test/docs files.

- [ ] **Step 4: Hand off without touching dirty sessions**

Do not merge automatically. Report the branch and commits. Warn that active main's `AuthScreen.tsx` will conflict at the stale credential object; integration must retain its new layout while importing `DEMO_ACCOUNTS`.

