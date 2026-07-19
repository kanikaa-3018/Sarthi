# Implementation Plan

## Build Order

1. Create seed data and invariants.
2. Implement SQLite schema and repositories.
3. Project SQLite facts into Neo4j.
4. Implement graph traversal queries.
5. Implement deterministic services.
6. Expose backend APIs.
7. Build mobile-first screens.
8. Add agent tool routing.
9. Add grounding validator.
10. Add audit drawer.
11. Add outcome write-back and graph edge update.
12. Add privacy controls.
13. Add low-data, conflict, and failure cases.
14. Add seller evidence console for duplicate-listing quality, verification state, and data freshness.
15. Add data-source freshness contracts and seller verification gates.
16. Add strict outcome write-back validation.
17. Gate demo-only reset, scenario, and debug endpoints outside development/demo modes.
18. Expand buyer feed into a realistic marketplace catalog.
19. Add database-backed buyer signup and pending seller applications.
20. Add seller onboarding and listing management.
21. Add reviewer/admin approval workflow for verification and listing publishing.
22. Add Bharat usability controls, simple mode, trust receipt, and visible agentic check timeline.
23. Add open-source attribution and live-submission documentation.
24. Add optional voice only after text path remains stable.
25. Rehearse full product walkthrough.

## Day 1 Exit Gate

- SQLite database can be seeded.
- Seed invariants pass.
- Neo4j projection contract exists.
- At least one graph path can be described.

## Day 2 Exit Gate

- Evidence, fit, ranking, duplicate, and offer services return typed results.
- Backend can produce the main recommendation without UI or LLM.

## Day 3 Exit Gate

- Feed, comparison, product detail, and checkout screens work with API data.

## Day 4 Exit Gate

- Agent query endpoint calls real tools.
- Audit drawer shows fact IDs and graph path.
- Outcome updates buyer memory.

## Day 5 Exit Gate

- Cold-start, conflicting evidence, service failure, and privacy deletion scenarios work.
- Demo can run on a clean machine.

## Phase 3 Exit Gate

- Product detail includes a trust state that can recommend, caution, or abstain.
- Seller console shows seller verification and source freshness.
- Restricted sellers and stale source systems change product behavior.
- Outcome learning rejects invalid statuses, invalid return reasons, and unknown variants.
- Demo-only controls are blocked when `APP_ENV=production`.
- Backend tests and frontend production build pass.

## Phase 4 Exit Gate

- Buyer home shows a broad marketplace feed, not only duplicate-demo products.
- Feed products carry image, rating, delivery, badge, and Sarthi eligibility metadata from SQLite.
- Sarthi scan can be launched from eligible product clusters.
- Buyer signup creates real database rows and starts an authenticated session.
- Seller signup creates a pending application and seller profile without granting verified trust.
- Newly registered sellers with no listings see an onboarding state, not a broken panel.

## Phase 5 Exit Gate

- Seller onboarding API returns application, verification documents, listing drafts, and next actions.
- Sellers can upload verification document evidence with stored file metadata.
- Sellers can create listing drafts without publishing them to buyers.
- Drafts can be submitted for review.
- Draft readiness clearly separates blocked verification, catalog-only, and evidence-building states.
- Seller console shows onboarding and listing draft lifecycle beside aggregate evidence.

## Phase 6 Exit Gate

- Admin reviewer account is a separate role, not a buyer/seller toggle.
- Buyer and seller accounts cannot access admin review APIs.
- Admin queue shows seller applications, submitted documents, and listing drafts.
- Admin approval verifies a pending seller and approves submitted documents.
- Admin listing approval publishes a submitted draft only when the seller is verified.
- Admin can request listing revision with required notes.
- Published products appear in the buyer feed with limited evidence until outcomes accumulate.
- Backend tests and frontend production build pass.

## Phase 7 Exit Gate

- Buyer signup and app shell expose the full supported Bharat language preference list.
- Buyer can switch between simple and detailed mode without leaving the shopping flow.
- Product detail sidebar includes a Trust Receipt with recommendation status, simple meaning, next step, proof count, evidence strength, and source health.
- Agentic checks are visible as seller, return/outcome, size, offer, and privacy steps.
- Checkout keeps Offer Sach Check visible before COD confirmation.
- Open-source attribution exists for frontend and backend dependencies.
- Backend tests and frontend production build pass.

## Non-Negotiables

- Do not start with the chatbot.
- Do not hard-code final answers.
- Do not show graph/AI claims that are not backed by code.
- Do not add extra features before the core flow works.
- Do not let missing or stale evidence become confident buyer-facing advice.
