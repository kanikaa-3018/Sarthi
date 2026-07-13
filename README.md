# Sarthi

Sarthi is a pre-purchase confidence agent for Bharat commerce. It helps buyers choose the safer duplicate listing, pick the right size, understand the one risk that matters, verify whether an offer is genuinely urgent, and learn from kept or returned outcomes.

The product is intentionally not a generic shopping chatbot. Sarthi is a trust layer inside an ecommerce journey: it uses deterministic tools, fact IDs, source-health checks, and audit traces before showing buyer-facing advice.

## Current Product Slice

```text
Buyer feed -> Duplicate listing comparison -> Product detail -> Offer Sach Check -> Outcome learning
Seller panel -> Seller onboarding -> Listing drafts
Admin review -> Seller verification -> Listing publishing
```

## What Is Implemented

- Marketplace-style buyer feed with realistic product cards.
- Buyer, seller, and admin authentication with backend RBAC.
- Confusion Resolver for duplicate seller listings.
- Per-SKU Trust Card and source-health disclosure.
- Size Oracle using buyer memory when enabled and aggregate evidence otherwise.
- Galti Mat Dohrao warning for avoidable repeated mistakes.
- Offer Sach Check before COD confirmation.
- Sarthi Samvaad agent with tool routing and audit traces.
- Buyer Trust Receipt and visible agent-check timeline.
- Trust Center for memory controls and readiness disclosure.
- Seller console with aggregate evidence and action items.
- Seller onboarding with document upload metadata and listing drafts.
- Admin review queue with seller approval, listing review, and reviewer audit events.
- SQLite source of truth with Neo4j projection contracts.
- Backend tests covering auth, trust, privacy, seller, admin, scenarios, and production guards.

## Tech Stack

```text
Frontend: React + Vite + TypeScript
Backend: FastAPI + Python
Operational store: SQLite
Graph layer: Neo4j projection contract with SQLite fallback paths
Tests: Pytest
```

## Run Locally

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

The frontend proxies `/api` to `http://127.0.0.1:8000`.

## Seeded Review Accounts

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

## Verification

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

Latest local verification:

- `python -m pytest`: 58 passed.
- `npm run build`: passed.

## Docs

- [Docs Index](docs/README.md)
- [PRD](docs/PRD.md)
- [Initial Features](docs/INITIAL_FEATURES.md)
- [Judge Review Guide](docs/JUDGE_REVIEW_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Data Strategy And Edge Cases](docs/DATA_STRATEGY_AND_EDGE_CASES.md)
- [Privacy And Trust](docs/PRIVACY_AND_TRUST.md)
- [Product Readiness](docs/PRODUCT_READINESS.md)
- [Open-Source Attribution](docs/ATTRIBUTION.md)
- [Submission Checklist](docs/SUBMISSION_CHECKLIST.md)

## Data Disclosure

The current build uses deterministic synthetic marketplace data for evaluation. Production use requires official connectors for catalog, seller KYC, orders, returns, reviews, campaign pricing, inventory, and logistics. The product surfaces source-health and readiness disclosures so weak or missing evidence does not become confident buyer advice.
