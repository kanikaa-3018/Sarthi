# Judge Review Guide

This guide explains how to inspect Sarthi as a working product instead of a scripted demo.

## What To Look For

Sarthi is strongest when evaluated through the full connected flow:

1. Buyer browses a normal feed.
2. Buyer resolves duplicate listings.
3. Product detail shows trust state, Trust Receipt, size recommendation, and agent checks.
4. Buyer asks Samvaad a grounded question.
5. Checkout runs Offer Sach Check before COD confirmation.
6. Buyer outcome updates memory.
7. Seller sees aggregate evidence, not buyer memory.
8. Admin verifies sellers and controls listing publication.

## Local Run

Backend:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m app.seed
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Seeded Accounts

Buyer:

```text
username: asha.buyer
password: buyer-asha-pass
```

Seller:

```text
username: seller.a
password: seller-a-pass
```

Admin reviewer:

```text
username: reviewer.admin
password: admin-reviewer-pass
```

## Recommended Review Path

### Buyer Path

1. Sign in as `asha.buyer`.
2. Use the header to switch language and simple/detailed mode.
3. Browse the feed.
4. Select an eligible product cluster.
5. Click duplicate-listing resolution.
6. Continue to product detail.
7. Inspect:
   - Trust status.
   - Trust Receipt.
   - Sarthi decision trail.
   - Size Oracle.
   - Galti Mat Dohrao warning.
   - Per-SKU evidence.
8. Ask Samvaad a question about fit, fabric, seller choice, or offer urgency.
9. Open the audit/proof log.
10. Start COD checkout and inspect Offer Sach Check.
11. Simulate kept or returned outcome.

### Seller Path

1. Sign in as `seller.a`.
2. Review seller verification status.
3. Inspect duplicate-listing metrics.
4. Confirm only aggregate evidence is shown.
5. Check seller action items.
6. Review onboarding/document upload and listing draft areas.

### Admin Path

1. Sign in as `reviewer.admin`.
2. Open review queue.
3. Inspect seller applications, document evidence hashes, listing drafts, and audit events.
4. Confirm buyer/seller users cannot access admin APIs.

## Technical Validation

Backend:

```powershell
cd backend
python -m pytest
```

Frontend:

```powershell
cd frontend
npm run build
```

Current validated state:

- Frontend production build passes.
- Backend test suite passes with 58 tests.

## Evaluation Criteria Mapping

### Working Prototype

- Buyer, seller, and admin flows are API-backed.
- Auth sessions and RBAC are enforced by backend.
- Recommendations use services over seed data, not hardcoded answers.

### Innovation And Creativity

- Trust Receipt makes agentic AI inspectable.
- Offer Sach Check attacks fake urgency at checkout.
- Buyer memory improves future fit without exposing private data to sellers.

### High Potential Impact

- Reduces preventable returns and COD friction.
- Helps buyers understand risk before spending.
- Helps sellers improve evidence and listing quality.

### Feasibility And Scalability

- SQLite is current local source of truth.
- Neo4j projection supports graph reasoning.
- Data-source health and production connector requirements are disclosed.

### Technical Excellence

- Modular backend services.
- Typed schemas and frontend API contracts.
- Tests for auth, trust, privacy, seller, admin, scenarios, and production guards.
- Audit traces and fact IDs available for decisions.

## Important Disclosure

The current data is deterministic synthetic data for build-phase evaluation. Production deployment requires official marketplace connectors for catalog, orders, returns, seller KYC, reviews, campaign pricing, inventory, and logistics.
