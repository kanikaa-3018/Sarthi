# Sarthi Product Requirements Document

## 1. Product Summary

Sarthi is a pre-purchase confidence agent for Bharat commerce. It helps a buyer decide whether a product listing is safe to buy, which seller option is better, which size is likely to fit, whether an offer is genuinely urgent, and what risk to avoid before placing a COD order.

The product is designed as a trust layer inside an ecommerce journey, not as a standalone chatbot. Its most important behavior is abstention: if seller verification, source freshness, or product evidence is not good enough, Sarthi must pause recommendation instead of inventing confidence.

## 2. Problem Statement

Many Bharat marketplace buyers face preventable losses because product pages do not clearly answer:

- Which duplicate listing should I choose?
- Is this seller trustworthy enough?
- Will my usual size fit for this seller and SKU?
- Are the reviews actually relevant to fabric, color, and fit?
- Is this limited-time offer real or just urgency pressure?
- Will my past return mistake repeat?
- Is my personal shopping memory private?

These gaps create wrong purchases, return friction, delayed refunds, lower seller trust, and COD logistics cost.

## 3. Target Users

### Buyer

Needs:

- Simple explanations.
- Mobile-first flow.
- COD confidence.
- Language preference.
- Clear next step.
- Protection from fake urgency.
- Privacy control over fit memory.

Pain points:

- Duplicate products from multiple sellers.
- Inconsistent size charts.
- Poor review relevance.
- Misleading offers.
- Unclear seller quality.
- Low trust in AI-generated advice.

### Seller

Needs:

- Understand why a listing is not winning trust.
- Improve evidence, dispatch, and product description quality.
- Onboard without seeing private buyer data.

Pain points:

- Competing duplicate listings.
- Lack of feedback on return causes.
- No clear path from catalog-only to recommendation-eligible.

### Admin Reviewer

Needs:

- Verify sellers.
- Review documents.
- Approve or request listing revision.
- Maintain auditability.

Pain points:

- Self-serve seller signup can create buyer risk if verification is weak.
- Review decisions need evidence and traceability.

## 4. Product Principles

1. Evidence before recommendation.
2. Clear abstention when data is weak.
3. Buyer trust over conversion pressure.
4. Private buyer memory must never be exposed to sellers.
5. AI must show what it checked.
6. Simple mode should explain decisions without technical language.
7. Seller tools must use aggregate evidence only.
8. Synthetic demo data must be disclosed until official connectors exist.

## 5. Current Product Scope

### Buyer Journey

1. Buyer signs in or creates an account.
2. Buyer browses a normal ecommerce feed.
3. Sarthi activates only when a product cluster has comparable duplicate listings.
4. Buyer runs duplicate-listing comparison.
5. Sarthi selects a listing only if trust gates pass.
6. Buyer opens product detail.
7. Sarthi shows:
   - Trust state.
   - Trust Receipt.
   - Agent-check timeline.
   - Size recommendation.
   - Avoidable issue warning.
   - Per-SKU evidence.
8. Buyer asks Samvaad questions.
9. Checkout runs Offer Sach Check.
10. Buyer records kept/returned outcome.
11. Outcome updates buyer memory when allowed.

### Seller Journey

1. Seller applies for access.
2. Seller profile starts as pending.
3. Seller uploads verification documents.
4. Seller creates listing drafts.
5. Seller sees aggregate listing evidence and action items.
6. Seller cannot see private buyer memory.

### Admin Journey

1. Admin signs in through reviewer role.
2. Admin reviews seller applications and uploaded documents.
3. Admin approves, rejects, or requests revision.
4. Listing approval publishes products only when verification gates pass.
5. Reviewer audit events are stored.

## 6. Functional Requirements

### Authentication And Roles

- Buyer, seller, and admin must have separate roles.
- Users cannot switch role from the UI.
- Backend must enforce ownership checks.
- Buyer cannot access another buyer's memory.
- Seller cannot access buyer memory.
- Seller cannot access another seller's panel.
- Admin APIs require admin role.

### Buyer Feed

- Show a normal marketplace feed, not only demo duplicate products.
- Product cards must include image, title, price, rating, delivery, badge, and seller.
- Eligible products can trigger Sarthi comparison.
- Non-eligible products remain browsable as catalog items.

### Trust State

- Product detail must return a trust state.
- Trust state must include status, confidence, recommendation permission, reasons, missing data, seller verification, and source freshness.
- Recommendation must pause when evidence is limited, seller is restricted, or data is degraded.

### Trust Receipt

- Show whether recommendation is allowed or paused.
- Explain what the status means.
- Provide the next best step.
- In detailed mode, show proof count, evidence strength, and source health.

### Agent-Check Timeline

The buyer-facing timeline must show:

- Seller verification checked.
- Return and delivered-order evidence checked.
- Size fit checked.
- Price/offer check ready.
- Privacy boundary checked.

### Size Oracle

- Recommend a size for the selected SKU.
- Use buyer fit memory only when enabled.
- Fall back to aggregate product evidence when memory is off.
- Explain confidence.

### Offer Sach Check

- Run before COD confirmation.
- Check price events, campaign facts, inventory, and urgency signals.
- Show whether a price drop is verified, whether there is no need to rush, or whether price history is insufficient.
- Provide an audit trace.

### Samvaad Agent

- Accept natural buyer questions.
- Detect intent.
- Route through deterministic tools.
- Return grounded answer with fact IDs.
- Create audit trace.
- Avoid unsupported claims.

### Outcome Learning

- Buyer can simulate kept or returned outcome.
- Returned outcomes require structured reason.
- Kept outcomes cannot include return reason.
- Valid outcomes can update fit memory.

### Seller Panel

- Show only seller-owned listings.
- Show aggregate metrics, competing listing context, and action items.
- Hide private buyer memory.
- Show verification and source-health state.

### Seller Onboarding

- New sellers start as pending.
- Sellers can upload GST, address, bank, and PAN style documents.
- Stored document metadata must include type, file name, size, MIME type, storage URI, and SHA-256 hash.
- Listing drafts remain non-public until review.

### Admin Review

- Admin can approve or reject seller applications.
- Approval requires document evidence.
- Admin can approve listing drafts only for verified sellers.
- Admin can request revisions with notes.
- Reviewer audit events must be visible.

## 7. Non-Functional Requirements

- Mobile responsive.
- Clear simple mode.
- Localized language preference foundation.
- Deterministic test data.
- Testable backend services.
- No hardcoded final recommendation answers.
- No confident advice under stale or missing evidence.
- Public docs must disclose synthetic data mode.

## 8. Data Requirements

Current evidence store:

- MongoDB Atlas stores buyers, buyer review profiles, sellers, products, variants, evidence, reviews, prices, campaigns, inventory, outcomes, memory, documents, drafts, accounts, sessions, checkout contracts, cache records, and audit traces.

Graph layer:

- Neo4j projection uses MongoDB fact records for multi-hop reasoning.
- MongoDB-backed graph paths exist for development and tests when Neo4j is unavailable.

Production connectors needed:

- Catalog.
- Seller KYC.
- Orders and returns.
- Reviews.
- Campaign and price events.
- Inventory.
- Logistics/dispatch.

## 9. Agentic AI Design

Sarthi's agentic behavior is tool orchestration, not free-form generation.

Agent tools:

- Candidate variant retrieval.
- Kept-order ranking.
- Fit prediction.
- Offer verification.
- Graph traversal.
- Grounded response validation.
- Audit trace creation.

The agent must:

- Detect buyer intent.
- Use relevant tools.
- Collect fact IDs.
- Generate only grounded summary.
- Show proof trail.
- Pause or caution when evidence conflicts.

## 10. Privacy Requirements

- Buyer fit memory belongs only to the buyer account.
- Sellers receive aggregate listing evidence only.
- Admin review sees seller/application evidence, not private buyer memory.
- Buyer can disable or delete fit memory.
- Privacy state must be visible in Trust Center and Trust Receipt.

## 11. Success Metrics

Product metrics:

- Reduction in avoidable returns.
- Increase in kept-order rate.
- Reduction in buyer confusion for duplicate listings.
- Reduction in checkout urgency mistakes.
- Seller improvement action completion.

Trust metrics:

- Percentage of recommendations with strong or medium evidence.
- Abstention rate under weak evidence.
- Audit trace availability.
- Buyer memory opt-out handling.

Hackathon evaluation mapping:

- Working prototype: end-to-end buyer, seller, and admin flows.
- Innovation: trust receipt plus offer truth plus privacy-aware agentic checks.
- Impact: protects COD-first buyers and improves seller quality feedback.
- Feasibility: MongoDB Atlas evidence store, graph projection, deterministic services.
- Technical excellence: tests, RBAC, audit traces, data contracts, modular services.

## 12. Out Of Scope For Current Build

- Real marketplace API integration.
- Payment gateway.
- Real logistics integration.
- Human-reviewed translation pack.
- Voice input.
- Production observability.
- Automated document OCR/KYC decisioning.

## 13. Roadmap

### Next

- Add hosted deployment.
- Add Playwright buyer journey test.
- Add seed reset guard documentation for deployment.
- Add screenshots/video walkthrough.
- Add human-reviewed language copy for top regions.

### Later

- Official marketplace connectors.
- Voice input.
- Seller document OCR assist.
- Real-time campaign fraud detection.
- Production monitoring and alerting.
