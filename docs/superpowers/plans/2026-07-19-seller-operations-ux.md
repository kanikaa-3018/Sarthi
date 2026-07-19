# Seller Operations UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seller console with an action-first, responsive operations workspace covering Today, Products, New listing, Proofs, and Market Compare without changing seller API contracts or privacy boundaries.

**Architecture:** Keep the existing `/seller/*` application route and API client, but replace the monolithic `SellerPanel.tsx` implementation with a compatibility export to a focused `seller/` component set. Pure view-model functions turn existing onboarding, panel, and evidence-coach payloads into task, product, proof-lane, and market-comparison models; route components render those models and emit typed callbacks to `SellerWorkspace`.

**Tech Stack:** React 19, TypeScript 5.7, React Router 7, Vite 6, Lucide React, Playwright, Fastify/MongoDB test backend.

---

### Task 1: Isolate E2E Runtime and Add Seller UX Contract Tests

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/playwright.config.ts`
- Modify: `frontend/tests/e2e/helpers.ts`
- Create: `frontend/tests/e2e/seller-ux.spec.ts`

- [ ] **Step 1: Make Vite's proxy target configurable without changing its default**

```ts
const apiTarget = process.env.SARTHI_API_TARGET ?? "http://127.0.0.1:8000";
const frontendPort = Number(process.env.SARTHI_FRONTEND_PORT ?? 5173);

export default defineConfig({
  server: {
    port: frontendPort,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
```

- [ ] **Step 2: Give Playwright independent ports and a dedicated database**

```ts
const apiPort = Number(process.env.E2E_API_PORT ?? 8100);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 5180);
const apiUrl = `http://127.0.0.1:${apiPort}`;

// In defineConfig:
use: { baseURL: `http://127.0.0.1:${frontendPort}`, trace: "retain-on-failure" },
webServer: [
  {
    command: "npm --prefix ../apps/api run dev",
    url: `${apiUrl}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(apiPort),
      MONGODB_DB: process.env.E2E_MONGODB_DB ?? "sarthi_codex_seller_ui_e2e",
      DEMO_CONTROLS_ENABLED: "true"
    }
  },
  {
    command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
    url: `http://127.0.0.1:${frontendPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, SARTHI_API_TARGET: apiUrl, SARTHI_FRONTEND_PORT: String(frontendPort) }
  }
]
```

- [ ] **Step 3: Point E2E API helpers at the isolated port**

```ts
export const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8100";
```

- [ ] **Step 4: Write failing seller behavior tests**

```ts
import { expect, test } from "@playwright/test";
import { loginAs, resetSeed } from "./helpers";

test.beforeEach(async ({ request }) => resetSeed(request));

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

test("seller mobile pages do not overflow horizontally", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, request, "seller");
  for (const path of ["/seller", "/seller/products", "/seller/new", "/seller/proofs", "/seller/market"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  }
});
```

- [ ] **Step 5: Run the focused suite and verify the UI contract fails while the isolated backend starts successfully**

Run from `frontend` after loading `MONGODB_URI` and credentials from the user's existing environment into the process, but overriding `E2E_MONGODB_DB`:

```powershell
$env:E2E_MONGODB_DB='sarthi_codex_seller_ui_e2e'
npm run test:e2e -- seller-ux.spec.ts
```

Expected: the isolated API and frontend start on ports 8100 and 5180; tests fail on missing `Next action`, canonical seller headings, or accessible proof dialog—not on authentication or database connection.

- [ ] **Step 6: Commit the isolated test harness and failing contract**

```powershell
git add frontend/vite.config.ts frontend/playwright.config.ts frontend/tests/e2e/helpers.ts frontend/tests/e2e/seller-ux.spec.ts
git commit -m "test: define seller workspace UX contract"
```

### Task 2: Add Seller View Models and Copy

**Files:**
- Create: `frontend/src/screens/seller/sellerModel.ts`
- Create: `frontend/src/screens/seller/sellerCopy.ts`
- Modify: `frontend/tests/e2e/seller-ux.spec.ts`

- [ ] **Step 1: Extend the failing contract with visible seller priority and market evidence assertions**

```ts
await expect(page.getByRole("region", { name: "Next action" })).toContainText(/proof|verification|listing/i);
await page.goto("/seller/market");
await expect(page.getByText("Why this position")).toBeVisible();
await expect(page.getByText("Best next improvement")).toBeVisible();
```

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run: `npm run test:e2e -- seller-ux.spec.ts`

Expected: FAIL because seller view models and pages are not implemented.

- [ ] **Step 3: Define explicit display models and pure priority functions**

```ts
export type SellerRoute = "today" | "products" | "new" | "proofs" | "market";

export type SellerActionItem = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  meta: string;
  actionLabel: string;
  action: { type: "verification" | "proof" | "product" | "draft" | "new"; id?: string };
};

export function buildSellerActions(input: {
  onboarding: SellerOnboardingResponse | null;
  panel: SellerPanelResponse | null;
  coach: SellerEvidenceCoachResponse | null;
}): SellerActionItem[] {
  // Add verification, rejected proof, open proof, product fix, and draft actions.
  // Sort by explicit priority rank and keep stable source order.
}

export function buildProofLanes(coach: SellerEvidenceCoachResponse | null) {
  const tasks = coach?.tasks ?? [];
  const assets = coach?.proof_assets ?? [];
  return {
    openTasks: tasks,
    rejected: assets.filter((asset) => asset.status === "rejected"),
    inReview: assets.filter((asset) => asset.status === "submitted"),
    buyerVisible: assets.filter((asset) => asset.status === "verified")
  };
}
```

- [ ] **Step 4: Add concise English, Hindi, and Hinglish seller copy**

`sellerCopy.ts` exports a `sellerCopy(language)` function and a typed dictionary containing only strings used by the new seller workspace. Copy uses direct seller language such as `Do this next`, `Needs your action`, `With reviewer`, and `Buyer-visible`; it does not mention an AI coach.

- [ ] **Step 5: Run TypeScript build**

Run: `npm run build`

Expected: PASS with the pure models and copy compiling before page integration.

- [ ] **Step 6: Commit view models and copy**

```powershell
git add frontend/src/screens/seller/sellerModel.ts frontend/src/screens/seller/sellerCopy.ts frontend/tests/e2e/seller-ux.spec.ts
git commit -m "refactor: model seller work around clear actions"
```

### Task 3: Build the Seller Shell, Today Page, and Products Page

**Files:**
- Create: `frontend/src/screens/seller/SellerShell.tsx`
- Create: `frontend/src/screens/seller/SellerTodayPage.tsx`
- Create: `frontend/src/screens/seller/SellerProductsPage.tsx`
- Create: `frontend/src/screens/seller/SellerWorkspace.tsx`
- Replace: `frontend/src/screens/SellerPanel.tsx`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: Add route and hierarchy assertions that fail on the old seller panel**

```ts
await expect(page.getByRole("navigation", { name: "Seller workspace" })).toBeVisible();
await expect(page.getByText("4.4 from 6,048 buyer ratings")).toBeVisible();
await page.goto("/seller/products");
await expect(page.getByRole("table", { name: "Seller products" })).toBeVisible();
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm run test:e2e -- seller-ux.spec.ts`

Expected: FAIL on the new navigation, restrained identity line, and product table.

- [ ] **Step 3: Implement `SellerWorkspace` orchestration and canonical route parsing**

`SellerWorkspace` fetches onboarding first, then panel and evidence coach in parallel, retains successful partial data, derives actions/products/lanes, and passes typed callbacks to focused pages. It recognizes legacy `/seller/trust-coach`, `/seller/listing-lab`, and `?tab=` URLs and replaces them with canonical routes.

- [ ] **Step 4: Implement the shell and restrained identity header**

```tsx
<main className="seller-app">
  <header className="seller-identity">
    <div>
      <p className="seller-kicker">Seller workspace</p>
      <h1>{seller.name}</h1>
      <p>{ratingLine} <span aria-hidden="true">·</span> {verificationLabel}</p>
    </div>
    <button className="seller-button seller-button-primary" onClick={onNewListing}>New listing</button>
  </header>
  <nav aria-label="Seller workspace">
    <button onClick={() => onNavigate("/seller")}>Today</button>
    <button onClick={() => onNavigate("/seller/products")}>Products</button>
    <button onClick={() => onNavigate("/seller/proofs")}>Proofs</button>
    <button onClick={() => onNavigate("/seller/market")}>Market Compare</button>
  </nav>
  {children}
</main>
```

- [ ] **Step 5: Implement Today as one next action, five-row queue, then facts**

The first action is rendered in `<section aria-label="Next action">`; the facts row uses `<section aria-label="Seller facts">`. Do not render the old insight, trust strip, proof-impact cards, rating coach, or duplicated metric dashboard.

- [ ] **Step 6: Implement Products as semantic table plus mobile records**

Search and status filters are local state. Product actions open proof, measurement, or detail flows through callbacks owned by `SellerWorkspace`. Table cells expose readable facts rather than raw composite scores.

- [ ] **Step 7: Replace `SellerPanel.tsx` with the compatibility export and update application navigation**

```tsx
export { SellerWorkspace as SellerPanel } from "./seller/SellerWorkspace";
```

Seller application navigation becomes Today, Products, Proofs, Market Compare, and New listing while retaining the existing `/seller/*` route guard.

- [ ] **Step 8: Run focused tests and frontend build**

Run: `npm run test:e2e -- seller-ux.spec.ts`

Expected: Today and Products expectations pass; New listing, proof-dialog, and Market Compare tests may still fail because those tasks follow.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 9: Commit shell, Today, and Products**

```powershell
git add frontend/src/screens/SellerPanel.tsx frontend/src/screens/seller frontend/src/app/App.tsx
git commit -m "feat: make seller workspace action first"
```

### Task 4: Build the Guided New Listing Flow

**Files:**
- Create: `frontend/src/screens/seller/SellerListingFlow.tsx`
- Modify: `frontend/src/screens/seller/SellerWorkspace.tsx`
- Modify: `frontend/tests/e2e/seller-ux.spec.ts`

- [ ] **Step 1: Add a failing three-stage listing test**

```ts
await page.goto("/seller/new");
await expect(page.getByText("Step 1 of 3")).toBeVisible();
await page.getByLabel("Product title").fill("Blue cotton kurti");
await page.getByLabel("Category").fill("women_kurtis");
await page.getByLabel("Garment type").fill("kurti");
await page.getByLabel("Fabric").fill("cotton");
await page.getByLabel("Colour family").fill("blue");
await page.getByLabel("Base price").fill("899");
await page.getByRole("button", { name: "Continue to image" }).click();
await expect(page.getByText("Step 2 of 3")).toBeVisible();
await page.getByRole("button", { name: "Back" }).click();
await expect(page.getByLabel("Product title")).toHaveValue("Blue cotton kurti");
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm run test:e2e -- seller-ux.spec.ts -g "listing"`

Expected: FAIL because the staged flow does not exist.

- [ ] **Step 3: Implement controlled stage state and field-level validation**

The form stores all existing draft API fields, validates the current stage, focuses the first invalid input, preserves data when moving backward, previews the selected image, and shows readiness issues only on the review stage.

- [ ] **Step 4: Keep verification and drafts subordinate to listing creation**

The review stage explains verification blockers and offers `Save draft`. Existing drafts render below the flow with status and submit action. Document upload appears only when verification is the current blocking action, not as a permanent side panel.

- [ ] **Step 5: Run listing test and build**

Run: `npm run test:e2e -- seller-ux.spec.ts -g "listing"`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit listing flow**

```powershell
git add frontend/src/screens/seller/SellerListingFlow.tsx frontend/src/screens/seller/SellerWorkspace.tsx frontend/tests/e2e/seller-ux.spec.ts
git commit -m "feat: guide sellers through listing creation"
```

### Task 5: Rebuild Proof Lanes and Upload Dialog

**Files:**
- Create: `frontend/src/screens/seller/SellerProofsPage.tsx`
- Create: `frontend/src/screens/seller/SellerProofDialog.tsx`
- Create: `frontend/src/screens/seller/useDialogLock.ts`
- Modify: `frontend/src/screens/seller/SellerWorkspace.tsx`
- Modify: `frontend/tests/e2e/role-flows.spec.ts`
- Modify: `frontend/tests/e2e/seller-ux.spec.ts`

- [ ] **Step 1: Update the existing proof approval test to the intentional accessible labels**

Use `Upload proof`, `Proof title`, `Proof file or secure link`, `What this proves`, and `Submit for review`. Keep the network response and admin approval assertions unchanged.

- [ ] **Step 2: Run proof tests and verify failure**

Run: `npm run test:e2e -- seller-ux.spec.ts role-flows.spec.ts -g "proof"`

Expected: FAIL on the new proof lanes and dialog labels.

- [ ] **Step 3: Implement proof lanes**

`SellerProofsPage` renders `Needs your action`, `With reviewer`, and `Buyer-visible` tabs from `buildProofLanes`. Only actionable rows have an upload action. Rejected proof uses the reviewer note and `Replace proof` label.

- [ ] **Step 4: Implement the accessible focused dialog**

```tsx
<div className="seller-dialog-backdrop" onMouseDown={handleBackdrop}>
  <section
    ref={dialogRef}
    role="dialog"
    aria-modal="true"
    aria-labelledby="seller-proof-dialog-title"
    aria-describedby="seller-proof-dialog-description"
    className="seller-dialog"
  >
    <header>
      <div>
        <p>Proof request</p>
        <h2 id="seller-proof-dialog-title">Upload proof</h2>
        <p id="seller-proof-dialog-description">Answer the buyer concern with evidence a reviewer can verify.</p>
      </div>
      <button type="button" aria-label="Close proof dialog" onClick={onClose}>Close</button>
    </header>
    <form id="seller-proof-form" onSubmit={onSubmit}>
      <section className="seller-proof-request-context">
        <strong>{task.title}</strong>
        <p>{task.rationale}</p>
        <span>{proofTypeLabel(task.recommended_proof_type)}</span>
      </section>
      {error && <div role="alert">{error}</div>}
      <label>
        Proof file
        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={onFileChange} />
      </label>
      <label>
        Proof title
        <input value={title} onChange={(event) => onTitleChange(event.target.value)} />
      </label>
      <label>
        What this proves
        <textarea value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
      </label>
    </form>
    <footer>
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="submit" form="seller-proof-form" disabled={submitting}>Submit for review</button>
    </footer>
  </section>
</div>
```

`useDialogLock` adds `seller-scroll-lock` to `html` and `body`, traps Tab within the dialog, closes on Escape when idle, and restores focus to the trigger.

- [ ] **Step 5: Preserve form state and show API errors in the dialog**

Suggested title and description prefill fields directly. The dialog closes only after a successful API response. API failure keeps the file and text values and focuses an error summary.

- [ ] **Step 6: Run proof tests and build**

Run: `npm run test:e2e -- seller-ux.spec.ts role-flows.spec.ts -g "proof"`

Expected: PASS, including the seller-to-admin approval loop.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit proof workspace**

```powershell
git add frontend/src/screens/seller frontend/tests/e2e/role-flows.spec.ts frontend/tests/e2e/seller-ux.spec.ts
git commit -m "feat: focus seller proof work on buyer requests"
```

### Task 6: Build Evidence-Based Market Compare

**Files:**
- Create: `frontend/src/screens/seller/SellerMarketPage.tsx`
- Modify: `frontend/src/screens/seller/sellerModel.ts`
- Modify: `frontend/src/screens/seller/SellerWorkspace.tsx`
- Modify: `frontend/tests/e2e/seller-ux.spec.ts`

- [ ] **Step 1: Add a failing market comparison test**

```ts
await page.goto("/seller/market");
await expect(page.getByLabel("Product to compare")).toBeVisible();
await expect(page.getByRole("table", { name: "Market evidence comparison" })).toBeVisible();
await expect(page.getByText("Why this position")).toBeVisible();
await expect(page.getByText("Best next improvement")).toBeVisible();
await expect(page.getByText(/percentile|AI score/i)).toHaveCount(0);
```

- [ ] **Step 2: Run the market test and confirm failure**

Run: `npm run test:e2e -- seller-ux.spec.ts -g "Market"`

Expected: FAIL because the evidence table and recommendation hierarchy do not exist.

- [ ] **Step 3: Derive comparison rows without inventing values**

`buildMarketComparison` emits dimensions only when data exists: price, rating evidence, return behavior, size evidence, dispatch, and proof coverage. It calculates counts from `seller_listings` and `competing_listings` only when a denominator is available; otherwise it emits a label such as `Evidence unavailable`.

- [ ] **Step 4: Render selected product, comparison table, reasons, and one next improvement**

The selected product is anchored with a neutral `Your listing` label. The recommendation links to Products, Proofs, or New listing depending on the model action. Secondary improvements are limited to three ordered rows.

- [ ] **Step 5: Run market test and build**

Run: `npm run test:e2e -- seller-ux.spec.ts -g "Market"`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit Market Compare**

```powershell
git add frontend/src/screens/seller frontend/tests/e2e/seller-ux.spec.ts
git commit -m "feat: make seller market comparison actionable"
```

### Task 7: Consolidate Seller Styling and Responsive Behavior

**Files:**
- Replace: `frontend/src/styles/seller.css`
- Modify: `frontend/src/styles/refined.css`
- Modify: `frontend/src/styles/responsive.css`
- Modify: `frontend/tests/e2e/seller-ux.spec.ts`
- Modify: `frontend/tests/e2e/visual-smoke.spec.ts`

- [ ] **Step 1: Extend responsive tests to 390, 768, and 1440px and both themes**

For each canonical seller route, assert horizontal overflow is at most 2px. Open the proof dialog at mobile width and assert its bounding box fits the viewport, the footer is visible after scrolling, and background `scrollY` does not change.

- [ ] **Step 2: Run the responsive tests and record failures**

Run: `npm run test:e2e -- seller-ux.spec.ts visual-smoke.spec.ts`

Expected: FAIL until the new scoped style system is complete.

- [ ] **Step 3: Replace seller.css with the scoped design system**

All selectors begin with `.seller-app` or the modal's `.seller-dialog-*` namespace. Implement the documented type scale, 1200px content width, 4–48px spacing scale, neutral borders, single accent, semantic states, 44px controls, semantic tables, mobile records, three-stage listing layout, proof lanes, and full-height mobile dialog.

- [ ] **Step 4: Remove obsolete seller override generations**

Delete seller-console v2/v3/v4 and later seller-specific blocks from `refined.css` after verifying no new component uses those selectors. Remove redundant seller media rules from `responsive.css`. Do not change buyer or admin selectors sharing the same file.

- [ ] **Step 5: Verify light/dark, focus, overflow, and reduced motion**

Add theme-aware token use, visible `:focus-visible` outlines, `prefers-reduced-motion` handling, safe-area padding for mobile sticky actions, wrapping for long translated copy, and `overflow-wrap: anywhere` only on identifiers/URLs.

- [ ] **Step 6: Update visual smoke screenshots and run tests**

Run: `npm run test:e2e -- seller-ux.spec.ts visual-smoke.spec.ts`

Expected: PASS with screenshots for Today, Products, New listing, Proofs, proof dialog, and Market Compare.

- [ ] **Step 7: Commit scoped seller styling**

```powershell
git add frontend/src/styles/seller.css frontend/src/styles/refined.css frontend/src/styles/responsive.css frontend/tests/e2e/seller-ux.spec.ts frontend/tests/e2e/visual-smoke.spec.ts
git commit -m "style: give seller workflows a restrained responsive system"
```

### Task 8: Full Regression, Accessibility, and Cleanup Verification

**Files:**
- Modify if a verified regression requires correction: `frontend/src/app/App.tsx`
- Modify if a verified regression requires correction: `frontend/src/screens/SellerPanel.tsx`
- Modify if a verified regression requires correction: `frontend/src/screens/seller/*`
- Modify if a verified regression requires correction: `frontend/src/styles/seller.css`
- Modify if a verified regression requires correction: `frontend/src/styles/refined.css`
- Modify if a verified regression requires correction: `frontend/src/styles/responsive.css`
- Modify if a verified regression requires correction: `frontend/tests/e2e/*`

- [ ] **Step 1: Run all frontend E2E tests against the isolated database**

Run: `npm run test:e2e`

Expected: all role flows, seller UX tests, and visual smoke tests pass with zero failures.

- [ ] **Step 2: Run the complete repository verification**

Run from repository root: `npm run build:test`

Expected: API build passes, 26 backend tests pass, and frontend production build passes.

- [ ] **Step 3: Check diff hygiene and seller override removal**

Run:

```powershell
git diff --check
rg -n "Seller console v2|Seller console v3|Seller console v4" frontend/src/styles/refined.css
git status --short
```

Expected: `git diff --check` passes; no obsolete seller override markers remain; status contains only intentional seller UX files.

- [ ] **Step 4: Inspect generated screenshots at desktop and mobile widths**

Confirm task hierarchy, wrapping, focus, dialog containment, visible actions, and absence of decorative gradients/glass/AI imagery. If a screenshot violates the specification, fix the source and rerun the focused test before continuing.

- [ ] **Step 5: Commit any corrections produced by the verified regression failures**

```powershell
git add frontend/src/app/App.tsx frontend/src/screens/SellerPanel.tsx frontend/src/screens/seller frontend/src/styles/seller.css frontend/src/styles/refined.css frontend/src/styles/responsive.css frontend/tests/e2e
git commit -m "fix: close seller workspace UX regressions"
```

- [ ] **Step 6: Record final branch evidence**

Run:

```powershell
git log --oneline --decorate -8
git status --short --branch
```

Expected: branch `codex/seller-ui-overhaul` is clean and contains the design, tests, implementation, styling, and any verified cleanup commits.
