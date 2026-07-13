# Sarthi Backend

FastAPI backend for the Sarthi prototype.

## Local Commands

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m app.seed
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Test

```powershell
python -m pytest
```

Current suite: 58 tests covering auth/RBAC, buyer trust contracts, scenario behavior, seller onboarding, admin review, privacy, production guards, and Bharat language preference signup.

## Current Endpoints

- `GET /health`
- `GET /system/readiness`
- `POST /auth/login`
- `POST /auth/signup/buyer`
- `POST /auth/signup/seller`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /feed`
- `GET /clusters/{cluster_id}`
- `GET /products/{product_id}`
- `POST /compare`
- `POST /agent/query`
- `POST /checkout/verify-offer`
- `POST /orders/simulate`
- `GET /buyers/{buyer_id}/privacy`
- `GET /buyers/{buyer_id}/memory`
- `PATCH /buyers/{buyer_id}/memory`
- `DELETE /buyers/{buyer_id}/memory`
- `GET /audit/{trace_id}`
- `GET /sellers`
- `GET /seller/me/panel`
- `GET /seller/me/onboarding`
- `POST /seller/me/verification/documents`
- `POST /seller/me/listing-drafts`
- `POST /seller/me/listing-drafts/{draft_id}/submit`
- `GET /sellers/{seller_id}/panel`
- `GET /data-sources`
- `GET /admin/review-queue`
- `POST /admin/seller-applications/{application_id}/approve`
- `POST /admin/seller-applications/{application_id}/reject`
- `POST /admin/listing-drafts/{draft_id}/approve`
- `POST /admin/listing-drafts/{draft_id}/revision`

Demo/development-only:

- `POST /seed/reset`
- `GET /scenarios`
- `GET /scenarios/{scenario_id}`
- `POST /scenarios/{scenario_id}/activate`
- `POST /graph/sync`
- `GET /graph/path`

These controls are blocked when `APP_ENV=production`.
