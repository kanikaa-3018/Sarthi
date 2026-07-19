# Auth and Demo Account Stabilization Design

**Date:** 2026-07-19
**Branch:** `codex/auth-demo-stabilization`
**Goal:** Make all three seeded demo logins and logout reliable for the hackathon recording without changing otherwise-working product flows.

## Scope

This change covers only the shared login/demo-account path, logout reliability, and isolated regression testing. It does not redesign authentication, alter buyer/seller/admin domain screens, restyle the UI, or rewrite the seed dataset.

The API seed is the canonical runtime truth. Its demo identities are:

| Portal | Username | Password | Expected identity |
| --- | --- | --- | --- |
| Buyer | `asha.buyer` | `buyer-asha-pass` | Asha |
| Seller | `seller.a` | `seller-a-pass` | NayiDisha Fashions |
| Reviewer | `reviewer.admin` | `admin-reviewer-pass` | Reviewer Admin |

## Confirmed Problems

1. The auth UI currently served from the dirty main checkout contains stale hard-coded demo credentials, so “Use demo” fills values that the seeded API rejects. The tracked base and seller worktree still contain the correct canonical values, which confirms the regression was introduced by the active main-worktree UI edit rather than by the seed.
2. The Playwright helper duplicates the correct credentials and logs in directly through the API, so existing tests bypass the broken “Use demo” UI and cannot detect future drift.
3. The shared frontend request helper always sends `Content-Type: application/json`, including for the bodyless `POST /auth/logout`. Fastify rejects that request with HTTP 400 because the declared JSON body is empty, so normal logout currently fails every time.
4. `App.tsx` awaits the server logout request before clearing React session state and navigating. The auth client clears local storage in a `finally`, but a failed request still rejects; consequently the app remains visibly logged in with its Logout button disabled.
5. The current Playwright defaults target the same ports and database normally used by a live demo. An auth test calling `/seed/reset` must not be allowed to reset the running demo database.

## Design

### 1. Shared frontend demo-account contract

Create a small frontend module containing the three canonical demo accounts and their portal/default-route metadata. `AuthScreen` and the E2E login helper will consume this module instead of maintaining independent credential literals.

This deliberately does not add a public API that reveals demo passwords. A development-only credentials endpoint would introduce additional backend and deployment behavior for little benefit during the one-hour stabilization window. Backend seed data remains canonical; UI-driven tests prove the frontend values still authenticate against it.

### 2. Valid request headers for bodyless requests

Set the JSON `Content-Type` header only when a request actually has a body and the caller has not supplied its own content type. JSON-bearing login, signup, and mutation calls retain their existing behavior; bodyless logout and read requests stop claiming to contain JSON.

This fixes the protocol error at its source rather than adding an artificial empty object solely to logout.

### 3. Minimal logout hardening

Wrap the app-level logout flow in `try/finally`. Regardless of whether server-side token revocation succeeds, the client will clear in-memory session state, navigate to `/login`, and reset its loading state. The existing auth client will continue attempting server revocation and clearing persisted local storage.

This preserves the current security behavior when the API is available while guaranteeing that a network failure cannot strand the demo in an authenticated UI.

### 4. UI-driven auth regression coverage

Add a focused Playwright spec that exercises the actual login screen for buyer, seller, and reviewer:

- select the portal;
- click “Use demo”;
- verify the expected credentials are filled;
- submit through the UI;
- verify navigation to that role's landing route and visible authenticated identity.

The spec will also verify normal logout, protected-route redirection after logout, and local logout when the `/auth/logout` request is deliberately failed. Existing broader role-flow specs remain unchanged except for importing the shared demo-account contract where appropriate.

### 5. Isolated E2E runtime

Make Playwright, Vite's API proxy, and the E2E helper accept environment-controlled API/frontend ports. Normal Vite development keeps its existing `5173`/`8000` defaults, while Playwright defaults to dedicated `5190`/`8200` ports and the isolated `sarthi_codex_auth_e2e` database.

Isolation is a safety requirement: the tests reset seed data and must never target the active demo database or its servers.

## Non-goals

- No production user-registration or password-reset work.
- No role/permission architecture changes.
- No modifications to product statistics, disclosure wording, AI claims, checkout behavior, or UI redesigns.
- No changes in the dirty main checkout or seller redesign worktree.
- No automatic merge into either active session.

## Verification

1. Run the new auth Playwright spec on dedicated ports and the isolated database.
2. Run the repository's existing `npm run build:test` baseline suite.
3. Run `git diff --check` and inspect the final diff for scope.
4. Commit only the isolated auth-stabilization changes on `codex/auth-demo-stabilization`; provide the commit for later integration.

## Risk Controls

- Defaults for normal development commands stay unchanged; E2E defaults become isolated by design.
- No seed reset is run against the normal `sarthi` database.
- The change to `AuthScreen` is intentionally small to reduce conflicts with the active UI work.
- Both the normal Fastify logout path and a simulated network failure are tested explicitly because they exercise separate failure modes.
