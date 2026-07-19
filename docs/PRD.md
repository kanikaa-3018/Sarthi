# Sarthi PRD

## 1. Product Summary

Sarthi is an AI-assisted trust layer for online commerce. It helps buyers choose the product they are most likely to keep by checking seller reliability, SKU evidence, size fit, return signals, offer truth, and checkout risk before purchase.

The product is not a standalone chatbot. It is a role-based commerce workflow:

```text
Buyer decision -> Seller evidence loop -> Admin review -> Safer buyer trust state
```

Sarthi's strongest product rule is abstention. If seller verification, source freshness, or product evidence is weak, the system must pause recommendation instead of pretending to be confident.

## 2. Problem

Marketplace buyers often face many similar listings with unclear differences. The product page rarely answers the questions that determine whether an order will be kept:

- Which duplicate listing should I choose?
- Is this seller verified enough for a strong recommendation?
- Will my usual size fit for this exact SKU and seller?
- Are fabric, color, and review signals trustworthy?
- Is the offer actually urgent?
- What is the one mistake I should avoid?
- Is my personal fit memory private?

These gaps create preventable returns, refund friction, COD logistics cost, poor seller feedback loops, and low trust in AI shopping advice.

## 3. Users

| User | Main need | Sarthi responsibility |
| --- | --- | --- |
| Buyer | Make a safe purchase decision quickly. | Show simple, grounded guidance with proof, privacy controls, and a clear next step. |
| Seller | Understand why listings are not winning trust. | Show aggregate evidence gaps, proof tasks, listing readiness, and review status without exposing buyer memory. |
| Admin reviewer | Protect buyer trust while reviewing seller claims. | Group seller applications, documents, proofs, and listing drafts into a structured human-in-loop queue. |
| Judge/support reviewer | Inspect why a decision happened. | Expose fact IDs, tools used, audit traces, source freshness, and blocked unsupported claims. |

## 4. Product Principles

1. Evidence before recommendation.
2. One useful next step beats a wall of scores.
3. Buyer trust is more important than conversion pressure.
4. Seller tools use aggregate evidence only.
5. Admin decisions must be auditable.
6. AI can summarize, route, and explain; it cannot invent facts.
7. Weak data should produce caution or abstention, not false precision.
8. Prototype data and production connector gaps must be disclosed.

## 5. Core Product Modules

### Buyer Feed

- Shows normal commerce cards with image, title, price, rating, delivery, badge, seller, and trust state.
- Supports search, category browsing, saved/wishlist behavior, product detail, and checkout entry.
- Marks Sarthi-eligible listings without hiding non-eligible catalog items.

### Confusion Resolver

- Compares similar listings within a duplicate cluster.
- Ranks seller/variant options using fit, outcomes, seller trust, review credibility, price value, proof coverage, offer truth, and uncertainty.
- Returns a recommended product, an alternative, top factors, and fact IDs.

### SKU Trust Passport

- Shows the SKU-level truth summary for a selected variant.
- Includes outcome evidence, evidence strength, seller verification, source health, offer truth, open proof requests, proof coverage, conflicts, and fact IDs.
- Keeps new or low-data listings in a limited-evidence state instead of punishing them as bad.

### Size Oracle

- Recommends a size using category-specific buyer memory when allowed.
- Falls back to aggregate product evidence when memory is off or missing.
- Explains confidence and gives a two-size caution when evidence is weak.

### Galti Mat Dohrao

- Shows one avoidable issue for the exact listing.
- Uses supported evidence such as color mismatch, fabric complaints, fit returns, dispatch issues, or proof gaps.
- Always includes a buyer action.

### Offer Sach Check

- Runs before checkout.
- Checks price events, campaign state, timer resets, inventory pressure, and current price age.
- Returns one of: verified price drop, no need to rush, or not enough history.
- Avoids accusatory language such as calling a seller fake.

### Sarthi Samvaad

- Accepts natural language buyer questions.
- Detects intents such as compare, fit, fabric, seller choice, offer urgency, and checkout confidence.
- Routes through deterministic services and optional Gemini grounded generation.
- Creates an audit trace with tools, fact IDs, and blocked unsupported claims.

### Checkout Confidence

- Builds expectation contracts before order placement.
- Shows keep-confidence drivers, payment assist, COD/prepaid guidance, and cart-level risk.
- Supports placed-order state and post-delivery feedback.

### Outcome Learning

- Buyer can mark kept, returned, exchanged, RTO, or correction states through structured flows.
- Valid kept/returned outcomes update personal fit memory only when privacy settings allow it.
- A single event does not swing global ranking by itself.

### Buyer Trust Center

- Shows fit memory, privacy settings, proof ledger, orders, review credibility, and trust dashboard.
- Allows memory update, memory disable, and memory deletion.
- Discloses system readiness and production data-source state.

### Seller Evidence Console

- Shows seller-owned listing performance and aggregate action items.
- Includes evidence coach, proof assets, proof nav counts, rating forecast, and listing improvement tasks.
- Allows proof submission and measurement correction.
- Keeps seller data access limited to owned listings and aggregate evidence.

### Seller Onboarding And Drafts

- New seller signup creates a pending seller application.
- Seller uploads verification documents with file name, MIME type, size, storage URI, and SHA-256 hash.
- Seller creates listing drafts that stay private until submitted and reviewed.
- Listing drafts can be blocked by seller verification state, catalog-only status, or missing evidence.

### Admin Review Panel

- Shows active queue, seller dossiers, source health, automation plan, and audit events.
- Classifies work by seller so one seller's multiple applications, documents, proofs, and drafts are easier to review.
- Includes prescreen suggestions with risk score, confidence, suggested action, checks, evidence, buyer impact, SLA state, and route to standard or senior reviewer.
- Supports approve/reject for applications, verification documents, proof assets, and listing drafts.
- Supports listing revision requests with reviewer notes.
- Publishes approved drafts only when seller verification gates pass.

## 6. Functional Requirements

### Authentication And RBAC

- Buyer, seller, and admin roles are separate.
- Backend enforces role and ownership checks.
- Buyer cannot access another buyer's memory or dashboard.
- Seller cannot access another seller's panel or buyer private memory.
- Admin review routes require admin role.
- Auth sessions are bearer-token based for the prototype.

### Buyer Requirements

- Browse feed and product detail.
- Compare duplicate listings.
- Ask grounded questions.
- Inspect proof/audit trail.
- Run offer verification before checkout.
- Place or simulate orders.
- Submit outcome feedback.
- Manage memory and privacy.
- Review orders, proofs, wishlist radar, and trust dashboard.

### Seller Requirements

- View own seller panel.
- See verification and source-health state.
- Review aggregate listing quality and evidence gaps.
- Upload proof assets.
- Upload verification documents.
- Create and submit listing drafts.
- Correct measurement issues.
- Track review status.

### Admin Requirements

- See a single structured queue across applications, documents, proofs, and drafts.
- Review seller-level dossier before item-level decisions.
- Use prescreen checks and risk routing to reduce manual reading.
- Approve or reject seller applications.
- Approve or reject documents and proof assets.
- Approve drafts or request revision.
- View audit events after reviewer action.

### System Requirements

- Health endpoint for runtime status.
- Readiness endpoint for source health, runtime integrations, controls, production connectors, and blockers.
- Demo reset/scenario routes gated outside production.
- Deterministic fallback when Gemini, Neo4j, or Atlas Vector Search is unavailable.

## 7. Non-Functional Requirements

- Responsive UI for desktop and mobile.
- Clear role-based navigation.
- No hardcoded final recommendation answers.
- Type-safe frontend API contracts.
- Modular backend routes and services.
- Auditability through fact IDs and traces.
- Clean public documentation.
- Explicit disclosure of synthetic seed data.

## 8. Success Metrics

| Metric | Why it matters |
| --- | --- |
| Kept-order rate lift | Sarthi optimizes for orders buyers keep, not only orders placed. |
| Avoidable return reduction | Measures impact of size, fabric, color, and offer guidance. |
| Recommendation abstention quality | Confirms the system pauses under weak data instead of guessing. |
| Seller proof completion | Shows whether evidence tasks are actionable. |
| Admin review time reduction | Measures whether prescreening and seller grouping reduce manual effort. |
| Audit trace coverage | Confirms recommendations remain inspectable. |
| Privacy control usage | Confirms buyers can understand and manage memory. |

## 9. Out Of Scope For Current Prototype

- Real payment gateway integration.
- Live marketplace catalog, order, return, inventory, KYC, campaign, and logistics connectors.
- Production document storage.
- Automated legal KYC approval without human review.
- Voice input.
- Full seller operations such as payouts, ads, inventory management, or fulfillment control.
- Production observability, rate limiting, and incident response.

## 10. Evaluation Mapping

| Prototype expectation | Sarthi evidence |
| --- | --- |
| Working MVP | Buyer, seller, and admin flows are API-backed and role-gated. |
| Clean architecture | React/Vite frontend, Fastify API, MongoDB store, optional Gemini, optional Vector Search, optional Neo4j, focused service modules. |
| Usable UX | Each role has a clear workspace and next-step language. Admin queue is grouped by seller and review item. |
| Completeness | The full loop is present: browse, compare, proof, checkout, outcome, seller evidence, admin review, audit, and controlled publishing. |
