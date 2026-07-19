# Product Readiness

## Current Prototype Contract

Sarthi is a connected prototype with three role-specific surfaces and one shared evidence layer:

```text
Buyer trust decisions
Seller evidence improvement
Admin human-in-loop review
Audit and readiness disclosure
```

The current implementation is suitable for hackathon/judge evaluation because the main flows are API-backed, role-separated, and inspectable. It is not a production deployment because marketplace connectors, production identity, document storage, observability, and reviewer operations are not yet attached.

## Working Today

### Buyer

- Marketplace-style feed with product images, ratings, delivery copy, seller copy, and trust states.
- Duplicate listing comparison.
- Product detail with trust state, SKU evidence, source health, conflicts, and proof gaps.
- Size recommendation using buyer memory when enabled.
- Galti Mat Dohrao warning for one avoidable issue.
- Offer Sach Check before checkout.
- Cart confidence and payment guidance.
- Expectation contracts.
- Order placement/simulation and outcome feedback.
- Buyer dashboard, orders, wishlist radar, proof ledger, memory controls, and privacy controls.
- Audit drawer with tools, fact IDs, graph paths, and timestamps.

### Seller

- Seller login and owned seller panel.
- Aggregate-only listing quality and evidence gaps.
- Evidence coach with proof tasks and trust-lift context.
- Proof asset submission.
- Seller onboarding state.
- Verification document upload with file metadata and SHA-256 hash.
- Listing draft creation, submission, readiness status, and review status.
- Measurement correction flow.
- Privacy guard confirming buyer private memory is not exposed.

### Admin Reviewer

- Admin-only review queue.
- Seller dossiers grouping multiple requests for the same seller.
- Active queue across seller applications, verification documents, proof assets, and listing drafts.
- Prescreen suggestions with risk, confidence, SLA, buyer impact, evidence, checks, and route to senior reviewer when needed.
- Approve/reject seller applications.
- Approve/reject verification documents.
- Approve/reject proof assets.
- Approve listing drafts or request revision with notes.
- Audit events after reviewer action.
- Source health and automation plan visibility.

### System

- Fastify API with role and ownership checks.
- MongoDB-backed seed data and evidence documents.
- Optional Gemini grounded responses and confidence language.
- Optional Gemini embeddings plus Atlas Vector Search.
- Optional Neo4j graph projection.
- Deterministic fallback when optional integrations are unavailable.
- System readiness endpoint disclosing runtime integrations, source health, controls, connectors, and blockers.
- Backend trust/RBAC test coverage.

## Prototype Data Disclosure

The current data is deterministic seeded data. It is designed to test product logic and reviewer behavior, not to represent live marketplace performance.

Seeded data is acceptable for:

- validating flows;
- testing trust states;
- showing audit traces;
- demonstrating seller/admin workflows;
- checking role boundaries;
- evaluating UX and product completeness.

Seeded data is not acceptable for:

- real buyer purchase decisions;
- real seller verification;
- real KYC judgment;
- real payment or logistics actions;
- production ranking or enforcement.

## Production Blockers

Before production, Sarthi needs:

| Area | Required work |
| --- | --- |
| Marketplace data | Official catalog, order, return, exchange, review, campaign, inventory, logistics, and seller KYC connectors. |
| Identity | Managed auth, OTP, recovery, device/session risk, password reset, and account lifecycle handling. |
| Storage | Secure object storage for seller documents, product media, proof assets, retention, and access control. |
| Admin operations | Reviewer assignment, maker-checker approval, escalation, SLA ownership, compliance retention, and audit export. |
| Data lifecycle | Schema migrations, seed isolation, backfills, deletion policies, and data quality monitors. |
| Security | Rate limits, abuse controls, secret rotation, input hardening, and privacy/security review. |
| Observability | Logs, metrics, traces, alerts, dashboarding, and incident workflows. |
| UX quality | Accessibility pass, keyboard/screen-reader QA, mobile-device QA, language review, and error-state polish. |
| AI governance | Prompt/version management, model evaluation, hallucination tests, cost controls, and provider fallback monitoring. |

## What Judges Should Credit

- The prototype is not just a landing page or static UI.
- Buyer, seller, and admin flows share the same trust/evidence model.
- Admin review is human-in-loop and does not auto-publish seller claims.
- Gemini is optional and bounded by deterministic services and auditability.
- Weak evidence leads to caution, proof request, or abstention.
- Seller workflow improves evidence without exposing buyer private memory.
- System readiness and production gaps are disclosed.

## What Judges Should Not Assume

- The seeded trust scores are not live marketplace scores.
- The document upload flow stores prototype metadata, not secure production files.
- Gemini is not required for the prototype to run.
- Neo4j and Atlas Vector Search are optional runtime enhancements.
- Payment, KYC, logistics, and production review operations are not integrated yet.

## Readiness Summary

| Dimension | Status |
| --- | --- |
| Working prototype | Ready for local evaluation. |
| Buyer journey | Implemented end-to-end against seed data. |
| Seller journey | Implemented for evidence, proof, onboarding, and drafts. |
| Admin journey | Implemented for review queue and human decisions. |
| API-backed flows | Implemented. |
| Role separation | Implemented in backend middleware and tests. |
| Gemini automation | Optional, with fallback. |
| Production launch | Not ready until connectors and operations are attached. |
