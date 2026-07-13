# Sarthi Frontend

Responsive React prototype for the Sarthi buyer, seller, and admin reviewer journeys.

## Local Commands

```powershell
npm install
npm run dev
```

The dev server proxies `/api` to `http://127.0.0.1:8000`.

## Current UI Status

Implemented:

- responsive desktop/mobile app shell;
- deck-inspired neutral, green, and warm accent color system;
- marketplace product photos from feed data;
- role-based login for buyer, seller, and admin reviewer workspaces;
- database-backed buyer signup and pending seller application flow;
- app-wide buyer language preference and simple/detailed reading mode;
- feed workspace;
- ecommerce-style search, category chips, offer strip, and product grid;
- comparison trigger and decision card;
- product detail screen;
- product trust state and seller verification status;
- buyer Trust Receipt with recommendation status, next step, proof count, and source health;
- visible Sarthi agent-check timeline for seller, returns, size, offer, and privacy checks;
- Ask Sarthi input;
- checkout Offer Sach Check;
- outcome screen;
- audit drawer.
- outcome learning state;
- trust center for buyer memory controls and product readiness disclosure;
- seller evidence console with data freshness and verification state;
- seller onboarding panel with verification document uploads and listing drafts;
- admin review queue for seller verification, document evidence hashes, reviewer audit events, and listing publishing;
- real API wiring for buyer, seller, admin, trust, and audit paths.

Next:

- Playwright main journey test.
- Voice input after text path is stable.
- Further visual polish after final demo script is locked.
