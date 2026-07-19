# Reviewer Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the reviewer UI into a clear task-first workbench while preserving every existing reviewer capability and API action.

**Architecture:** Keep `AdminReviewPanel` state and service callbacks as the source of truth. Make limited semantic markup changes for recommendation labelling, collapsible guidance, and mobile upload cards, then isolate the visual overhaul in a last-loaded reviewer stylesheet.

**Tech Stack:** React 19, TypeScript, React Router, CSS, Playwright.

---

### Task 1: Lock the required reviewer behavior with failing tests

**Files:**
- Create: `frontend/tests/e2e/reviewer-workbench.spec.ts`

- [ ] **Step 1: Write the desktop hierarchy regression test**

```ts
test("review desk keeps the selected decision visible without duplicate briefing", async ({ page, request }) => {
  await loginAs(page, request, "admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin");
  await expect(page.getByTestId("reviewer-workbench")).toBeVisible();
  await expect(page.getByText("Recommended", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Next reviewer step")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve document" })).toBeInViewport();
});
```

- [ ] **Step 2: Write the mobile navigation and upload-card regression test**

```ts
test("mobile reviewer navigation and upload actions remain complete", async ({ page, request }) => {
  await loginAs(page, request, "admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/uploads");
  await expect(page.getByRole("button", { name: "Work Saved" })).toBeInViewport();
  await expect(page.getByTestId("reviewer-upload-cards")).toBeVisible();
  await expect(page.getByTestId("reviewer-upload-cards").getByRole("button", { name: "Review" }).first()).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
});
```

- [ ] **Step 3: Run the new tests and verify the expected failure**

Run: `npm run test:e2e -- reviewer-workbench.spec.ts`

Expected: FAIL because the workbench test ids, recommendation label, and mobile upload cards do not yet exist.

### Task 2: Establish semantic workbench markup without changing handlers

**Files:**
- Modify: `frontend/src/screens/AdminReviewPanel.tsx`

- [ ] **Step 1: Mark the reviewer workbench and remove the duplicate command briefing**

```tsx
<main className="seller-report-shell reviewer-workbench" data-testid="reviewer-workbench">
```

Keep `AgentRoomView` unchanged and stop rendering `AgentBriefingStrip` above the command tabs. The automatic seller selection remains driven by `queue.automation_plan.first_queue_item_id`.

- [ ] **Step 2: Label the recommended seller inside the queue**

Derive the recommendation from the existing automation plan and pass `recommended` into `SellerReportButton`:

```tsx
const recommendedSellerId = queue.automation_plan.first_queue_item_id
  ? queue.active_queue.find((item) => item.queue_item_id === queue.automation_plan.first_queue_item_id)?.seller_id
  : null;

{recommended && <span className="reviewer-recommended-label">Recommended</span>}
```

- [ ] **Step 3: Preserve guidance through progressive disclosure**

Render `ReviewActionChecklist` as a collapsed `<details className="reviewer-guidance">` with a `Review guidance` summary and the existing step copy inside it. Move it below the actionable review card so it does not block the decision.

- [ ] **Step 4: Add mobile upload cards using the same row data and selection callback**

```tsx
<div className="reviewer-upload-card-list" data-testid="reviewer-upload-cards">
  {filteredRows.map((row) => (
    <UploadQueueCard key={row.id} row={row} selected={selectedUploadId === row.id} onSelect={() => setSelectedUploadId(row.id)} />
  ))}
</div>
```

Each card explicitly renders seller, upload title, kind, status, check summary, submitted time, and the existing Review selection action.

- [ ] **Step 5: Add a return-to-queue control to the selected upload panel**

Pass `onClose={() => setSelectedUploadId(null)}` into `UploadReviewPanel` and render a `Back to uploads` button. Do not alter approve or reject callbacks.

### Task 3: Add an isolated reviewer visual system

**Files:**
- Create: `frontend/src/styles/reviewer-workbench.css`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Import the scoped stylesheet last**

```css
@import './styles/reviewer-workbench.css';
```

- [ ] **Step 2: Define the calm desktop workbench**

Scope every rule beneath `.admin-app-route` or `.reviewer-workbench`. Normalize the page header, tabs, queue panel, selected summary, pending-item row, recommendation summary, review card, note editor, and actions using neutral surfaces and semantic status colors.

- [ ] **Step 3: Keep the first decision in the initial desktop viewport**

Remove the duplicated briefing height, compact the seller summary and item queue, collapse guidance, and keep evidence/validation in their existing foldouts. Do not hide any action or evidence control.

- [ ] **Step 4: Define tablet and mobile layout**

At 900px stack queue and detail panels. At 760px render complete primary navigation, two-column review tabs, mobile upload cards, full-width decision actions, and hide only the redundant desktop upload table.

### Task 4: Verify behavior and visual acceptance

**Files:**
- Modify if required: `frontend/tests/e2e/reviewer-workbench.spec.ts`
- Verify: `frontend/tests/e2e/role-flows.spec.ts`
- Verify: `frontend/tests/e2e/visual-smoke.spec.ts`

- [ ] **Step 1: Run the new test and verify green**

Run: `npm run test:e2e -- reviewer-workbench.spec.ts`

Expected: 2 tests passed.

- [ ] **Step 2: Run existing reviewer behavior tests**

Run: `npm run test:e2e -- role-flows.spec.ts --grep "admin route|seller proof submission"`

Expected: reviewer routes and proof approval loop pass without handler changes.

- [ ] **Step 3: Run build and API tests**

Run: `npm run build`

Run from repository root: `npm test`

Expected: TypeScript/Vite build exits 0 and all API tests pass.

- [ ] **Step 4: Inspect screenshots at 1440x1000 and 390x844**

Verify no clipped navigation, no root overflow, visible upload actions, readable contrast, and a clear decision hierarchy.

- [ ] **Step 5: Commit the verified change**

```powershell
git add docs/superpowers frontend/src frontend/tests/e2e/reviewer-workbench.spec.ts
git commit -m "feat: overhaul reviewer workbench UI"
```
