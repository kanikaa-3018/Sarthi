# Initial Feature Scope

Sarthi started as a focused pre-purchase confidence layer for Bharat commerce buyers. The core idea is not to build a generic shopping chatbot; it is to help a buyer avoid preventable loss before placing a COD order.

## Target User

Primary user:

- Tier-2 and Tier-3 marketplace buyer.
- Often shops through COD.
- Faces repeated problems with size, seller quality, confusing duplicate listings, return friction, and fake urgency.
- May prefer Hinglish or another Indian language over formal English.
- Needs simple, trustworthy explanations rather than raw analytics.

Secondary users:

- Marketplace sellers who need to understand why their duplicate listing is not winning buyer trust.
- Admin reviewers who need to verify sellers and prevent low-trust listings from becoming buyer-facing recommendations.

## Initial Buyer Features

### 1. Confusion Resolver

Problem:
The same product can appear across several sellers with similar images, titles, and prices. A buyer cannot easily know which listing is least likely to cause a return.

Sarthi behavior:
The system compares duplicate listings through kept-order evidence, return rate, dispatch signal, fit confidence, and seller verification. It recommends only when evidence is good enough.

Why it matters:
This directly reduces wrong-listing purchases, repeated returns, and COD friction.

### 2. Per-SKU Trust Card

Problem:
Ratings are broad and often do not answer the buyer's actual risk: will this size, color, fabric, and seller combination work?

Sarthi behavior:
Each selected SKU shows evidence strength, delivered orders, returns, fit accuracy, color mismatch risk, seller status, and source health.

Why it matters:
Trust moves from generic star ratings to product-specific evidence.

### 3. Size Oracle

Problem:
Bharat fashion commerce has inconsistent size charts across sellers. A buyer's usual size is not always safe.

Sarthi behavior:
The system predicts a recommended size using buyer fit memory when enabled and aggregate outcome evidence when memory is off.

Why it matters:
Wrong size is one of the most common preventable return reasons.

### 4. Galti Mat Dohrao

Problem:
Buyers repeat the same mistake because platforms rarely surface why the last order failed at the next purchase moment.

Sarthi behavior:
The system warns when the current listing resembles a prior avoidable issue, such as color mismatch, fabric expectation mismatch, or size failure.

Why it matters:
The product learns from outcomes and turns past mistakes into future protection.

### 5. Offer Sach Check

Problem:
Countdown timers and limited-time offers can create false urgency.

Sarthi behavior:
At checkout, Sarthi checks price history, campaign facts, inventory, and timer-reset signals before confirming whether the buyer should rush.

Why it matters:
The buyer gets protection exactly where fake urgency can affect the decision.

### 6. Sarthi Samvaad

Problem:
Buyers ask natural questions like "Mera usual L hai, kya order karun?" or "Kapda thin to nahi hai?"

Sarthi behavior:
The agent routes questions through deterministic tools for comparison, fit, offer, graph traversal, and evidence retrieval. Answers include audit traces and fact IDs.

Why it matters:
The AI is useful because it is grounded, not because it can generate fluent shopping advice.

### 7. Trust Receipt

Problem:
AI recommendations can feel like black boxes.

Sarthi behavior:
The buyer sees what Sarthi checked: seller verification, return evidence, size fit, offer truth readiness, and privacy protection.

Why it matters:
This makes the agentic workflow inspectable and easier to trust.

## Seller And Admin Features

### Seller Console

Sellers can see aggregate listing evidence, competing duplicate listings, quality gaps, and action items. They cannot see personal buyer memory.

### Seller Onboarding

New sellers apply with business information, upload verification documents, and create listing drafts. New listings do not become high-trust buyer recommendations until verification and outcome evidence exist.

### Admin Review Queue

Admin reviewers approve or reject seller applications and listing drafts. Approvals require document evidence and create reviewer audit events.

## Scope Boundaries

Included now:

- SQLite-backed data model.
- Neo4j projection contracts and graph-path reasoning.
- Buyer, seller, and admin role separation.
- Synthetic but deterministic marketplace data.
- Source-health and trust-state disclosure.
- Backend tests and frontend production build.

Not claimed as production-complete yet:

- Official Meesho or third-party marketplace data connectors.
- Human-reviewed translations for every language.
- Live deployment URL.
- Production monitoring, rate limiting, and secret management.
- Voice input.
