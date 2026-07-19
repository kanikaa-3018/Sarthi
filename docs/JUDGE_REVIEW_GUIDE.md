# Judge Review Guide

This guide helps reviewers inspect Sarthi as a working product, not a scripted single-screen demo.

## What To Evaluate

Sarthi should be reviewed as a connected trust loop:

```text
Buyer browse
  -> duplicate listing comparison
  -> SKU proof and size guidance
  -> checkout confidence
  -> outcome learning
  -> seller evidence tasks
  -> admin review and controlled publishing
```

## Local Setup

### Backend

```powershell
cd apps\api
npm install
npm run seed
npm run dev
```

Backend URL:

```text
http://127.0.0.1:8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed by the terminal, usually:

```text
http://localhost:5173
```

## Demo Accounts

| Role | Username | Password |
| --- | --- | --- |
| Buyer | `asha.buyer` | `buyer-asha-pass` |
| Seller | `seller.a` | `seller-a-pass` |
| Admin reviewer | `reviewer.admin` | `admin-reviewer-pass` |

## Recommended Review Path

### 1. Buyer Path

1. Sign in as `asha.buyer`.
2. Browse the marketplace-style feed.
3. Open a Sarthi-eligible product.
4. Run duplicate-listing comparison.
5. Inspect why one seller/variant is recommended and another is not.
6. Open product detail and check:
   - trust state;
   - SKU Trust Passport;
   - Size Oracle;
   - Galti Mat Dohrao warning;
   - review and evidence snippets;
   - source freshness;
   - audit drawer.
7. Ask Sarthi a question about fit, fabric, seller choice, or offer urgency.
8. Continue to checkout.
9. Inspect Offer Sach Check and checkout confidence.
10. Place or simulate an order and submit kept/returned feedback.
11. Open Trust Center to inspect memory and privacy controls.

### 2. Seller Path

1. Sign in as `seller.a`.
2. Check seller verification state and source health.
3. Review listing quality, evidence gaps, and action items.
4. Open proof/evidence workflow.
5. Submit proof assets or verification documents.
6. Create and submit a listing draft.
7. Confirm the seller sees aggregate evidence only, not buyer private memory.

### 3. Admin Path

1. Sign in as `reviewer.admin`.
2. Open the review queue.
3. Start from seller dossiers to see which seller needs attention first.
4. Review active queue items across:
   - seller applications;
   - verification documents;
   - proof assets;
   - listing drafts.
5. Inspect prescreen suggestions, risk score, SLA state, source evidence, and buyer impact.
6. Approve, reject, or request revision.
7. Confirm audit events update after reviewer action.
8. Confirm listing publishing remains gated by seller verification.

## Evaluation Rubric Mapping

| Rubric area | What to inspect in Sarthi |
| --- | --- |
| Working Prototype | Buyer, seller, and admin routes are connected to the Fastify API and MongoDB seed data. Judges can run the app and complete the main journeys with seeded accounts. |
| Code Quality & Architecture | Frontend, API routes, services, typed contracts, tests, docs, and optional integrations are separated. The architecture doc matches the current Node/Fastify/MongoDB implementation. |
| Usability & UX | Each role has a distinct workspace. Buyer gets simple next steps, seller gets evidence tasks, and admin gets a structured queue instead of raw text overload. |
| Completeness | The prototype covers browse, compare, product proof, checkout confidence, outcome learning, seller evidence, admin review, audit traces, and controlled publishing. |

## Technical Checks

Backend:

```powershell
cd apps\api
npm run build
npm run test
```

Frontend:

```powershell
cd frontend
npm run build
```

Repository hygiene:

```powershell
git diff --check
```

## API Areas To Spot Check

- `GET /system/readiness` for integration and production disclosure.
- `POST /compare` for duplicate listing recommendation.
- `POST /agent/query` for grounded assistant response.
- `POST /checkout/verify-offer` for offer truth.
- `GET /buyers/:buyer_id/memory` and `DELETE /buyers/:buyer_id/memory` for privacy.
- `GET /seller/me/evidence-coach` for seller evidence tasks.
- `GET /admin/review-queue` for admin automation and reviewer queue.
- `GET /audit/:trace_id` for decision proof.

## Important Disclosure

This prototype uses deterministic seeded commerce data. Optional Gemini, Atlas Vector Search, and Neo4j integrations can be configured, but Sarthi remains runnable with deterministic fallbacks. Production use requires official marketplace connectors and operational controls listed in [Product Readiness](PRODUCT_READINESS.md).
