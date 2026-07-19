# Sarthi Buyer Commerce Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every remaining buyer UI requirement in `issue-1.md` with a consistent, responsive commerce and proof experience.

**Architecture:** Keep existing API and state flows intact. Add focused presentation state to the buyer screens, clarify markup hierarchy, and append a scoped buyer-commerce CSS layer so seller/admin styling is unaffected. Use Playwright contracts before each behavior change and capture route screenshots from those same tests.

**Tech Stack:** React 19, TypeScript, React Router, CSS, Playwright, existing Fastify/MongoDB demo API.

---

### Task 1: Buyer shell and catalog browsing

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/screens/FeedScreen.tsx`
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/styles/buyer.css`
- Create: `frontend/tests/e2e/buyer-commerce-overhaul.spec.ts`

- [ ] Add a Playwright test that signs in as buyer, opens `/shop`, asserts at most eight visible product cards on desktop, numbered pagination with `aria-current="page"`, immediate visible status after clicking Safety, and at most two columns with no overflow at 390px.

```ts
await loginAs(page, request, "buyer");
await page.goto("/shop");
await expect(page.locator(".product-card:visible")).toHaveCount(8);
await expect(page.getByRole("navigation", { name: "Catalog pages" })).toBeVisible();
await page.getByRole("button", { name: "Safety", exact: true }).first().click();
await expect(page.getByRole("status", { name: "Checking product safety" })).toBeVisible();
```
- [ ] Run the focused test and confirm it fails because all 32 products render and Safety has no immediate progress surface.
- [ ] Add `catalogPage`, derived page count/range, reset-on-filter behavior, pagination markup, and a Safety progress state that opens before the async comparison.

```ts
const CATALOG_PAGE_SIZE = 8;
const pageCount = Math.max(1, Math.ceil(visibleProducts.length / CATALOG_PAGE_SIZE));
const pagedProducts = visibleProducts.slice((catalogPage - 1) * CATALOG_PAGE_SIZE, catalogPage * CATALOG_PAGE_SIZE);
```
- [ ] Support an optional `image_urls?: string[]` product field and render image navigation only when more than one valid URL exists.
- [ ] Add `buyer-app-route` shell scoping and mobile bottom navigation; compact discovery controls and product cards in the buyer CSS layer.
- [ ] Re-run the focused test and confirm catalog, loading, and mobile assertions pass.

### Task 2: Saved workspace and evidence fallback

**Files:**
- Modify: `frontend/src/screens/SarthiSavedWorkspacePanel.tsx`
- Modify: `frontend/src/screens/KnowledgeGraphExplorer.tsx`
- Modify: `frontend/src/screens/FeedScreen.tsx`
- Modify: `frontend/src/styles/buyer.css`
- Test: `frontend/tests/e2e/buyer-commerce-overhaul.spec.ts`

- [ ] Add a test for `/shop/saved/kurti_1_2?proof=1` that asserts a three-stage decision guide, one recommendation heading, a visible plain-language proof route, a usable question fallback, and no intrusive floating proof control.

```ts
await page.goto("/shop/saved/kurti_1_2?proof=1");
await expect(page.getByRole("list", { name: "Decision steps" }).getByRole("listitem")).toHaveCount(3);
await expect(page.getByRole("heading", { name: /recommended seller/i })).toBeVisible();
await expect(page.locator(".sarthi-floating-trigger")).toHaveCount(0);
```
- [ ] Run it and confirm the stage guide/fallback assertions fail.
- [ ] Reorder saved markup into selected item, recommendation, and evidence stages; remove duplicate leading status copy while keeping all existing actions.

```tsx
<ol className="saved-decision-steps" aria-label="Decision steps">
  <li className="complete">Selected item</li>
  <li className="active">Compare proof</li>
  <li>Choose and continue</li>
</ol>
```
- [ ] Add a graph fallback card for missing/error states with known evidence summary and retry guidance; keep technical graph behind the existing view switch.
- [ ] Remove the saved-ready toast/floating trigger outside the saved workspace because Proof navigation and inline actions preserve access.
- [ ] Re-run the saved-workspace test and capture desktop/mobile images.

### Task 3: Checkout hierarchy

**Files:**
- Modify: `frontend/src/screens/CheckoutPage.tsx`
- Modify: `frontend/src/styles/buyer.css`
- Test: `frontend/tests/e2e/buyer-commerce-overhaul.spec.ts`

- [ ] Add a test for the checkout route that asserts ordered Review, Payment, Delivery, and Order summary regions, a plain-language Sarthi recommendation before numeric evidence, a final total-bearing action, and no mobile overflow.

```ts
await page.goto("/shop/checkout/kurti_1_1/kurti_1_1_xl");
await expect(page.getByRole("region", { name: "Review item" })).toBeVisible();
await expect(page.getByRole("region", { name: "Payment method" })).toBeVisible();
await expect(page.getByRole("complementary", { name: "Order summary" })).toBeVisible();
```
- [ ] Run it and confirm the new region/order assertions fail.
- [ ] Add semantic labelled regions, simplify score-first recommendation markup into conclusion-first copy plus supporting facts, and make the summary sticky only on desktop.

```tsx
<section aria-labelledby="checkout-payment-heading" className="checkout-section-card">
  <h2 id="checkout-payment-heading">Payment method</h2>
  <p className="checkout-recommendation-conclusion">{copy.paymentRecommendation}</p>
</section>
```
- [ ] Add stable skeleton and mobile in-flow summary styles without changing payment or order handlers.
- [ ] Re-run the checkout test and capture desktop/mobile images.

### Task 4: Orders workspace

**Files:**
- Modify: `frontend/src/screens/FeedScreen.tsx`
- Modify: `frontend/src/styles/buyer.css`
- Test: `frontend/tests/e2e/buyer-commerce-overhaul.spec.ts`

- [ ] Add a test that opens `/shop/orders`, verifies All/Needs feedback/Kept/Returned filters, a compact two-column desktop grid, one-column mobile layout, and retained View item/outcome actions.

```ts
for (const label of ["All", "Needs feedback", "Kept", "Returned"]) {
  await expect(page.getByRole("button", { name: label })).toBeVisible();
}
await expect(page.locator(".buyer-order-grid")).toHaveCSS("grid-template-columns", /px .*px/);
```
- [ ] Run it and confirm filters and compact grid are missing.
- [ ] Add local order filtering and restructure each row into a focused order card with image, status, metadata, and relevant action.

```ts
type OrderFilter = "all" | "feedback" | "kept" | "returned";
const visibleOrders = orders.filter((order) => orderMatchesFilter(order, orderFilter));
```
- [ ] Style the grid and feedback priority states at desktop/mobile widths.
- [ ] Re-run the orders test and capture both viewports.

### Task 5: Proof center

**Files:**
- Modify: `frontend/src/screens/FeedScreen.tsx`
- Modify: `frontend/src/styles/buyer.css`
- Test: `frontend/tests/e2e/buyer-commerce-overhaul.spec.ts`

- [ ] Add a test for `/shop/proofs` that asserts a compact summary strip, state filters/groups, collapsed technical details, visible next-safe-step copy, and a mobile first request within the initial two viewports.

```ts
await page.goto("/shop/proofs");
await expect(page.getByRole("group", { name: "Proof summary" })).toBeVisible();
await expect(page.getByRole("button", { name: "Needs action" })).toBeVisible();
await expect(page.locator("details[open]")).toHaveCount(0);
```
- [ ] Run it and confirm compact summary and grouping controls are missing.
- [ ] Convert summary cards into a compact strip, add status filters, keep one primary action per proof state, and preserve the existing details disclosure and proof actions.

```ts
type ProofFilter = "action" | "ready" | "history";
const visibleProofs = proofItems.filter((item) => proofMatchesFilter(item, proofFilter));
```
- [ ] Re-run the proof-center test and capture desktop/mobile images.

### Task 6: Trust Center clarity

**Files:**
- Modify: `frontend/src/screens/TrustCenter.tsx`
- Modify: `frontend/src/styles/buyer.css`
- Test: `frontend/tests/e2e/buyer-commerce-overhaul.spec.ts`

- [ ] Add a test for `/trust` that verifies Fit and privacy, Payment guidance, and Learning from outcomes groups, plain privacy consequences, collapsed technical source detail, and no overflow in both themes.

```ts
for (const heading of ["Fit and privacy", "Payment guidance", "Learning from outcomes"]) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}
```
- [ ] Run it and confirm the grouped headings are missing.
- [ ] Add a compact section navigator/overview and group existing controls under the three buyer mental models without changing handlers.

```tsx
<nav className="trust-section-nav" aria-label="Trust control sections">
  <a href="#fit-and-privacy">Fit and privacy</a>
  <a href="#payment-guidance">Payment guidance</a>
  <a href="#learning-outcomes">Learning from outcomes</a>
</nav>
```
- [ ] Move full source detail after the plain checklist and tune responsive layout.
- [ ] Re-run the Trust Center test in light/dark and capture both images.

### Task 7: Overlay standardization and full regression

**Files:**
- Modify: `frontend/src/screens/FeedScreen.tsx`
- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/styles/buyer.css`
- Test: `frontend/tests/e2e/buyer-commerce-overhaul.spec.ts`
- Modify: `output/playwright/buyer-ui-audit/README.md`

- [ ] Extend dialog tests to cover comparison and proof dialog roles, labels, maximum dimensions, internal scroll, background scroll lock, focus return, and Escape.

```ts
const trigger = page.getByRole("button", { name: "Safety", exact: true }).first();
await trigger.click();
const dialog = page.getByRole("dialog", { name: "Compare safer choices" });
await expect(dialog).toBeVisible();
await expect(page.locator("html")).toHaveClass(/buyer-scroll-lock/);
await page.keyboard.press("Escape");
await expect(trigger).toBeFocused();
```
- [ ] Run them and confirm comparison dialog semantics/focus assertions fail.
- [ ] Apply the same labelled-dialog contract and shared size rules to comparison and proof overlays.

```tsx
<div role="dialog" aria-modal="true" aria-labelledby="compare-dialog-title" className="bottom-sheet-content compare-sheet-content">
  <h2 id="compare-dialog-title">Compare safer choices</h2>
</div>
```
- [ ] Run the focused buyer overhaul, landing, product, auth, and role-flow tests.
- [ ] Run `npm run build` in `frontend` and `git diff --check` at repository root.
- [ ] Review every generated screenshot visually, fix any overlap/clipping/contrast issue, update the audit README, and repeat verification after the final visual correction.
