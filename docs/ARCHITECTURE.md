# Architecture

## Current Runtime

The active implementation is:

```text
Frontend: React + Vite + TypeScript
Backend: Node.js + Fastify + TypeScript
Database: MongoDB local or MongoDB Atlas
Optional LLM: Gemini
Optional retrieval: MongoDB Atlas Vector Search over Gemini embeddings
Optional graph: Neo4j projection
```

The runnable backend is `apps/api`.

## System Flow

```text
React app
  -> typed API client
  -> Fastify routes
  -> auth/RBAC middleware
  -> domain services
  -> MongoDB evidence documents
  -> optional Gemini / Vector Search / Neo4j
  -> audit traces and fact IDs
```

## Frontend Structure

| Area | Files | Responsibility |
| --- | --- | --- |
| App shell | `frontend/src/app/App.tsx` | Role routing, navigation, language/simple mode, buyer/seller/admin route guards. |
| API client | `frontend/src/api/client.ts` | Typed calls to backend routes. |
| Buyer screens | `FeedScreen`, `ProductDetailPanel`, `CheckoutPage`, `TrustCenter`, `OutcomeScreen`, `SarthiLensPanel` | Feed, comparison, proof, checkout, orders, memory, and trust surfaces. |
| Seller screen | `SellerPanel.tsx` | Evidence console, proof tasks, onboarding, documents, listing drafts, seller action board. |
| Admin screen | `AdminReviewPanel.tsx` | Review queue, seller dossiers, applications, documents, proof assets, drafts, policy, impact, audit. |
| Shared types | `frontend/src/types/api.ts` | API response contracts used by UI. |
| Styles | `frontend/src/styles/*.css` | Role-specific UI systems and responsive layout. |

## Backend Structure

| Area | Files | Responsibility |
| --- | --- | --- |
| App bootstrap | `apps/api/src/app.ts`, `server.ts` | Fastify app, CORS, error handler, Mongo connection, optional seed-on-start. |
| Config | `apps/api/src/config/env.ts` | Runtime environment and optional integration flags. |
| Auth middleware | `apps/api/src/middleware/auth.ts` | Session lookup, role checks, buyer/seller ownership checks. |
| Routes | `apps/api/src/routes/*.ts` | API contract for auth, buyer, seller, admin, decisions, and system readiness. |
| Services | `apps/api/src/services/*.ts` | Domain decisions, seller/admin operations, confidence scoring, Gemini, vector search, graph, session, crypto, scenarios. |
| Seed data | `apps/api/src/data/seed.ts` | Deterministic demo data for local review. |
| Tests | `apps/api/src/tests/trust-rbac.test.ts` | Trust and role-boundary validation. |

## Route Groups

| Group | Representative routes | Purpose |
| --- | --- | --- |
| Auth | `POST /auth/login`, `POST /auth/signup/buyer`, `POST /auth/signup/seller`, `GET /auth/me`, `POST /auth/logout` | Role-based sessions and onboarding entry. |
| Buyer | `GET /feed`, `GET /products/:id`, `GET /products/:id/sku-passport`, `GET /buyers/:id/memory`, `DELETE /buyers/:id/memory` | Feed, product trust, proof, memory, dashboard, privacy, orders. |
| Decisions | `POST /compare`, `POST /agent/query`, `POST /checkout/verify-offer`, `POST /orders/place`, `POST /orders/return-assistant` | Agentic decisions, checkout confidence, expectation contracts, outcome learning. |
| Seller | `GET /seller/me/panel`, `GET /seller/me/evidence-coach`, `POST /seller/me/evidence-assets`, `POST /seller/me/listing-drafts` | Seller evidence, proof uploads, onboarding, draft publishing requests. |
| Admin | `GET /admin/review-queue`, application/document/proof/draft approve/reject routes | Human-in-loop seller and listing review. |
| System | `GET /health`, `GET /system/readiness`, `GET /data-sources`, demo scenario/reset routes | Runtime status, source health, production disclosure. |

## Data Model

MongoDB is the prototype source of truth. Core document families include:

- accounts and sessions;
- buyers, profiles, memory, orders, dashboards, proof ledgers;
- sellers, seller applications, verification documents, proof assets;
- products, variants, duplicate clusters, taxonomy, media, seller snapshots;
- variant evidence, reviews, return reasons, price events, campaigns, inventory snapshots;
- proof requests, listing drafts, expectation contracts, order outcomes;
- fact records, audit traces, LLM/tool cache, optional vector embeddings.

Every buyer-facing decision should be traceable to fact IDs where possible.

## Decision Pipeline

```text
Request
  -> authenticate and check ownership
  -> load product/seller/buyer/source evidence
  -> run deterministic scoring and trust gates
  -> optionally retrieve semantic evidence
  -> optionally ask Gemini for grounded phrasing or confidence language
  -> validate unsupported claims
  -> create audit trace
  -> return simple UI action plus proof data
```

## Agentic AI Design

Sarthi uses agentic behavior as tool orchestration:

- intent detection for compare, fit, fabric, seller, offer, checkout, and return questions;
- retrieval of product evidence and source-health context;
- deterministic scoring for trust-critical decisions;
- optional Gemini text generation when configured;
- audit trace creation for facts, tools, graph paths, and unsupported claims;
- deterministic fallback when AI services are unavailable.

AI is not allowed to approve sellers, publish listings, invent product facts, or override verification gates.

## Admin Automation Architecture

The admin queue reduces manual reading by grouping work in three layers:

1. **Seller dossier:** one row per seller with verification state, open items, risk, documents, drafts, proofs, buyer requests waiting, and next action.
2. **Active queue:** item-level queue across applications, documents, proof assets, and listing drafts with risk score, SLA, buyer impact, primary action, and prescreen evidence.
3. **Prescreen suggestion:** observe/reason/act/learn structure with checks and route to standard or senior reviewer.

The final approve/reject/revision action remains human-in-loop.

## Optional Integrations

| Integration | Enabled by | Fallback |
| --- | --- | --- |
| Gemini | `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` | Deterministic answer and confidence copy. |
| Gemini embeddings | `GEMINI_API_KEY`, embedding env values | Lexical retrieval or disabled retrieval. |
| Atlas Vector Search | `VECTOR_SEARCH_ENABLED=true` on MongoDB Atlas | Lexical fallback and readiness warning. |
| Neo4j | `NEO4J_ENABLED=true` plus URI/credentials | MongoDB-backed graph path summaries. |

## Failure Behavior

- If Gemini fails, return deterministic answer and record provider fallback.
- If Vector Search is unavailable, use lexical evidence retrieval.
- If Neo4j is disabled or unavailable, keep MongoDB-backed graph paths.
- If seller verification is pending/restricted, pause strong buyer recommendations.
- If source data is stale, show degraded trust state and block strong claims.
- If product evidence is weak, return limited evidence with next best proof action.
- If outcome write-back is invalid, reject the update before changing memory.

## Security Boundaries

- Backend role checks are mandatory; UI navigation is not the security boundary.
- Buyer private fit memory is buyer-only.
- Seller views are seller-owned and aggregate-only.
- Admin review sees seller/application/listing/proof evidence, not buyer private memory.
- Demo reset/scenario controls must stay disabled in production.
- Secrets belong in `.env`, not source control.
