# Bedrock Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the verified Bedrock-primary/Gemini-fallback implementation into the latest committed `main` without touching the uncommitted deployed-worktree changes.

**Architecture:** Merge in a dedicated branch based on current `main`. Preserve the current split seller UI and environment-driven E2E topology, then layer in provider-neutral AI contracts, Bedrock health, isolated vector namespaces, and fail-safe provider routing.

**Tech Stack:** TypeScript, Fastify, React, Vite, Playwright, AWS SDK for JavaScript v3, Amazon Bedrock Converse/InvokeModel APIs.

---

### Task 1: Merge the Feature History

**Files:**
- Merge: `codex/bedrock-primary-fallback`
- Record: `docs/superpowers/plans/2026-07-19-bedrock-main-integration.md`

- [ ] **Step 1: Confirm the integration branch is clean and based on `main`**

Run: `git status --short && git merge-base --is-ancestor main HEAD`

Expected: only this plan is untracked and the ancestry command exits zero.

- [ ] **Step 2: Commit the integration plan**

Run: `git add docs/superpowers/plans/2026-07-19-bedrock-main-integration.md && git commit -m "docs: plan Bedrock main integration"`

Expected: one documentation commit on `codex/bedrock-integration`.

- [ ] **Step 3: Start the feature merge without committing**

Run: `git merge --no-ff --no-commit codex/bedrock-primary-fallback`

Expected: Git reports conflicts in the documentation and frontend integration files while applying all backend provider work.

### Task 2: Preserve the Current Frontend Architecture

**Files:**
- Modify: `README.md`
- Modify: `frontend/playwright.config.ts`
- Modify: `frontend/src/screens/SellerPanel.tsx`
- Modify: `frontend/tests/e2e/helpers.ts`
- Modify: `frontend/vite.config.ts`
- Verify: `frontend/src/types/api.ts`

- [ ] **Step 1: Keep the current seller workspace boundary**

Set `frontend/src/screens/SellerPanel.tsx` to:

```ts
export { SellerWorkspace as SellerPanel } from "./seller/SellerWorkspace";
```

The obsolete monolithic seller screen from the feature branch must not replace the deployed split workspace.

- [ ] **Step 2: Combine the E2E isolation settings**

Keep `E2E_API_PORT`/`E2E_FRONTEND_PORT`, `SARTHI_API_TARGET`, `SARTHI_FRONTEND_PORT`, the dedicated `sarthi_codex_auth_e2e` database, and `reuseExistingServer: false`. Add `BEDROCK_ENABLED: "false"`, `AI_PROVIDER_ORDER: ""`, and `GEMINI_API_KEY: ""` to the Playwright API server environment so ordinary E2E never invokes a paid provider.

- [ ] **Step 3: Keep one environment-driven API URL**

Keep this helper definition:

```ts
export const API_BASE = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "8200"}`;
```

Do not retain the duplicate hard-coded `58001` declaration.

- [ ] **Step 4: Preserve the deployed Vite proxy contract**

Keep `SARTHI_API_TARGET` and `SARTHI_FRONTEND_PORT` as the Vite environment names, with defaults `http://127.0.0.1:8000` and `5173`.

- [ ] **Step 5: Combine README content and verify provider-neutral types**

Retain the current product overview and add the Bedrock architecture/configuration/smoke/index sections. Confirm `AiGeneratedProvider`, `AiAnswerProvider`, `BedrockRuntimeStatus`, `AiRuntimeStatus.available`, and per-capability health exist in `frontend/src/types/api.ts` alongside the latest buyer types.

- [ ] **Step 6: Resolve and inspect the merge**

Run: `git diff --check && git diff --name-only --diff-filter=U`

Expected: no whitespace errors and no unresolved paths.

### Task 3: Verify the Integrated Product

**Files:**
- Test: `apps/api/src/tests/*.test.ts`
- Test: `frontend/tests/e2e/*.spec.ts`

- [ ] **Step 1: Run the complete offline build and unit suite**

Run: `npm run build:test`

Expected: API compilation succeeds, all backend tests pass without provider calls, and the production frontend bundle builds.

- [ ] **Step 2: Run isolated browser E2E**

Run: `npm run e2e`

Expected: every Chromium role, proof-loop, buyer-commerce, and visual smoke flow passes against isolated servers.

- [ ] **Step 3: Audit secrets and deployment behavior**

Run: `git grep -n -E "AKIA[0-9A-Z]{16}|GEMINI_API_KEY=.+|AWS_SECRET_ACCESS_KEY=.+" -- ':!package-lock.json'`

Expected: no committed credential values. Confirm normal tests do not run `ai:smoke -- --live`.

- [ ] **Step 4: Commit the resolved merge**

Run: `git commit -m "merge: integrate Bedrock primary provider"`

Expected: the merge commit records both parents and leaves a clean tracked worktree.

### Task 4: Prepare the Already-Deployed Environment

**Files:**
- Reference: `.env.example`
- Reference: `scripts/setup-bedrock-env.ps1`
- Reference: `apps/api/src/routes/system.ts`

- [ ] **Step 1: Document required runtime variables**

Use `AWS_REGION=ap-south-1`, `BEDROCK_ENABLED=true`, and `AI_PROVIDER_ORDER=bedrock,gemini` in the deployed API environment. Supply `GEMINI_API_KEY` through the deployment secret store only when live Gemini fallback is desired.

- [ ] **Step 2: Document runtime IAM requirements**

The deployed compute role—not a developer profile—must authorize the bounded Bedrock model invocations used by Nova Micro, Nova Lite, and Titan Text Embeddings V2. No AWS access key belongs in application environment files.

- [ ] **Step 3: Define the post-deploy gate**

After deploying the integrated commit, require `/system/readiness` to report Bedrock as the available primary for text, vision, and embedding. Run only explicitly selected bounded smoke capabilities when necessary, and keep live smoke out of CI and scheduled jobs.
