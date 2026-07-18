# Sarthi Product Plan

## 1. Product Goal

Sarthi is a trust assistant for online shopping.

It helps a buyer decide:

```text
Can I trust this product, this seller, this size, this offer, and this payment choice before checkout?
```

The goal is to reduce wrong purchases, avoidable returns, and COD rejection by giving buyers a simple evidence-backed decision before they place an order.

## 2. Problem

Buyers often struggle because:

- many sellers list similar-looking products;
- the cheapest option may not be the safest;
- seller rating and product rating can conflict;
- size, fabric, color, and quality are hard to judge online;
- reviews may be generic, misleading, or not relevant to the exact SKU;
- offer timers and prepaid offers can create pressure;
- COD rejection causes delivery cost, return cost, inventory lock, support load, and seller loss.

Sarthi solves this by checking evidence before recommendation instead of making the buyer guess.

## 3. Users

### Buyer

Needs a simple recommendation, size help, offer truth, payment confidence, and privacy control.

### Seller

Needs fair discovery, clear improvement tasks, and aggregate buyer feedback without seeing private buyer data.

### Admin / Reviewer

Needs control over seller verification, listing approval, proof review, and auditability.

## 4. Product Surfaces

Sarthi will have three connected surfaces:

1. Buyer App
2. Seller Portal
3. Admin Review Console

All three use the same trust evidence layer:

- product and SKU facts;
- seller verification;
- seller rating and product rating;
- reviews and review credibility;
- return reasons;
- price and offer history;
- payment offers;
- buyer fit memory;
- seller proof assets;
- order outcomes;
- audit traces.

## 5. Core Buyer Experience

1. Buyer searches, opens, or wishlists a product.
2. Sarthi checks if similar seller listings exist.
3. Sarthi calculates a trust score for the product-SKU-seller combination.
4. Buyer sees a simple recommendation, reason, size guidance, and warning.
5. Buyer can ask Sarthi a product question.
6. If proof is missing, Sarthi creates an aggregate seller proof request.
7. At checkout, Sarthi checks offer truth and whether prepaid can be safely nudged.
8. Buyer chooses COD or prepaid.
9. Delivery outcome updates future trust.

## 6. Core Features

| Feature | What It Does | Why It Matters |
|---|---|---|
| Trust Score | Shows a score like `72/100` with confidence and reason breakdown. | Gives buyer a quick but explainable trust signal. |
| Similar Listing Resolver | Compares similar products from different sellers and recommends one safer option plus one alternative. | Reduces confusion when many sellers list similar products. |
| New Seller Fair-Start | Gives verified new sellers fair exposure but keeps buyer confidence provisional. | New sellers are not buried, but buyers are not misled. |
| Per-SKU Trust Passport | Shows trust for the exact variant, including proof, return reasons, and missing evidence. | Avoids relying only on generic seller or product rating. |
| Size Oracle | Recommends the safest size using buyer memory and SKU/category outcomes. | Reduces size-related returns. |
| Galti Mat Dohrao | Shows one avoidable warning, such as color mismatch or size risk. | Gives the buyer one clear action before purchase. |
| Sarthi Samvaad | Lets buyer ask natural questions like fit, fabric, seller trust, or offer urgency. | Makes the product easy for non-technical users. |
| Knowledge Graph | Connects seller, product, SKU, reviews, returns, proof, offer, checkout, and outcomes. | Helps explain why a recommendation was made. |
| Review Credibility | Downweights generic, repeated, stale, or contradicted reviews. | Prevents false-positive reviews from misleading the score. |
| Rating Conflict Handling | Separates seller rating from product rating. | Handles cases like low seller rating but high product rating, or the opposite. |
| Offer Sach Check | Checks if the offer or urgency is factual. | Protects buyer from pressure-based checkout decisions. |
| Checkout Confidence | Nudges prepaid only when product, seller, offer, and refund trust are strong enough. | Reduces COD rejection without pressuring the buyer. |
| Buyer Trust Dashboard | Shows the buyer their privacy controls, fit memory state, order behavior, review credibility weight, and checkout guidance. | Builds trust and prevents hidden scoring. |
| Expectation Contract | Saves the buyer's expected size, fabric, color, dispatch, and offer before checkout. | Helps identify what broke if the order is returned. |
| Outcome Learning | Learns from kept or returned orders. | Improves future recommendations. |
| Seller Evidence Coach | Shows sellers aggregate proof gaps and improvement tasks. | Helps honest sellers improve trust. |
| Admin Review | Controls seller verification, listing approval, and proof validation. | Prevents self-declared trust. |
| Trust Center | Lets buyer control fit memory and privacy settings. | Builds user trust. |
| Audit Drawer | Shows tools used, fact IDs, graph path, score basis, and missing evidence. | Makes AI decisions inspectable. |

## 7. Trust Score Approach

Sarthi will use a weighted trust score. The score is not a random AI number.

Main attributes:

- SKU kept-order outcome;
- seller reliability;
- seller verification;
- fit and size consistency;
- review credibility;
- product rating quality;
- proof coverage;
- offer truth;
- dispatch reliability;
- price value.

For fashion-like products, some attributes matter more than others. For example:

- SKU kept/returned outcomes should have high weight.
- Seller reliability should have high weight.
- Fit consistency should have high weight.
- Fabric proof matters, but fabric preference can vary by user, so it should not dominate the score alone.
- Price should not dominate because cheapest is not always safest.

Every score should show:

- score;
- confidence level;
- top positive reasons;
- top risks;
- sample size or evidence strength;
- missing evidence.

Example:

```text
Trust Score: 72/100
Confidence: Medium
Why: verified seller, stronger XL kept history, stable price.
Watchout: fabric proof is weak and sample size is still small.
```

## 8. New Seller Fair-Start

New sellers should not start at zero trust only because they have fewer orders.

Sarthi will use:

- category prior for new listings;
- fair-start exposure for verified new sellers;
- confidence cap until enough outcomes exist;
- score adjustment as buyers keep or return products.

Important rule:

```text
Fair-start improves opportunity, not fake buyer trust.
```

Unverified, restricted, or suspicious sellers do not get this benefit.

## 9. Stronger Knowledge Graph

The graph connects:

```text
Buyer -> Fit Memory -> SKU -> Product -> Seller -> Reviews -> Returns -> Proof -> Offer -> Checkout -> Outcome
```

It helps answer:

- Why is this seller safer?
- Is this product good but the seller risky?
- Is this seller good but this SKU risky?
- Are positive reviews contradicted by return reasons?
- What proof is missing?
- Should prepaid be nudged at checkout?

Graph edges will carry weight, confidence, source, timestamp, and evidence type.

## 10. Review And Rating Logic

Sarthi will not blindly trust ratings.

### Low Seller Rating, High Product Rating

The product may be good, but seller reliability may be risky.

### High Seller Rating, Low Product Rating

The seller may be reliable, but this SKU may have quality, size, or fabric issues.

### Positive Reviews, High Returns

Reviews may be false positives or irrelevant. The contradicted attribute should be downweighted.

Review credibility will consider verified purchase, reviewer account age, reviewer return/RTO behavior, duplicate text, burst pattern, rating-text mismatch, and contradiction with returns.

Reviews from very new users or users with unusually high returns should not disappear, but their score impact should be lower until their behavior becomes reliable. This prevents fake or noisy reviews from dominating product trust.

## 11. Checkout Confidence And Prepaid Nudge

Checkout is a critical point because COD rejection creates cost.

Sarthi will nudge prepaid only when trust is strong enough.

Inputs:

- product trust score;
- seller trust;
- offer truth;
- payment or bank offer;
- refund clarity;
- delivery confidence;
- data freshness.

### Nudge Modes

| Mode | When | Example Copy |
|---|---|---|
| Prepaid Recommended | Trust is strong and saving is verified. | `Pay online to save Rs 40. Sarthi checked seller trust, product evidence, and offer truth. COD is still available.` |
| Balanced Choice | Trust is moderate or some proof is missing. | `Prepaid can save Rs 25, but fabric proof is still limited. Choose prepaid only if you are comfortable.` |
| No Prepaid Nudge | Trust is weak or data is unclear. | `Sarthi is not recommending prepaid for this item yet because evidence is limited.` |

Hard blockers:

- seller restricted;
- seller verification pending;
- offer not verified;
- weak product evidence;
- unclear refund/payment information;
- stale data;
- high return risk.

## 12. Seller Flow

1. Seller applies for access.
2. Admin verifies the seller.
3. Seller creates listing draft.
4. Admin approves listing.
5. Listing appears with limited evidence until real outcomes accumulate.
6. Seller receives aggregate action items from buyer doubts and returns.
7. Seller uploads proof or fixes listing details.
8. Approved proof improves future trust.

Seller never sees private buyer fit memory or individual buyer identity.

## 13. Admin Flow

Admin controls:

- seller approval;
- seller rejection or revision;
- listing approval;
- proof review;
- audit logs.

This ensures trust is governed and not self-declared by sellers.

## 14. Agentic AI Role

Sarthi's AI is an orchestrator, not just a chatbot.

The agent:

1. understands buyer intent;
2. selects the right tools;
3. checks facts from databases and graph;
4. calculates or fetches trust score;
5. verifies offer and checkout confidence;
6. creates seller proof request if evidence is missing;
7. gives a simple grounded answer;
8. stores audit trace;
9. uses cache when facts have not changed.

The agent must not invent facts, expose hidden reasoning, expose buyer memory to sellers, or push prepaid under weak trust.

## 15. Data And Architecture

Planned architecture:

| Component | Purpose |
|---|---|
| MongoDB Atlas | Stores product evidence, scores, traces, checkout sessions, proof requests, and cache. |
| Atlas Search | Searches products, reviews, seller proof, and text evidence. |
| Atlas Vector Search | Finds similar reviews, doubts, questions, and proof evidence. |
| Neo4j | Stores weighted relationships for graph reasoning. |
| Object Storage | Stores proof images, seller documents, and listing media. |

MongoDB Atlas is suitable because product evidence is flexible. Different categories can have different fields without forcing every product into the same rigid structure.

The LLM/tool cache will reduce repeated calls when the same product, facts, score version, and user intent have not changed.

The product database will store only decision-useful fields from marketplace product bundles:

- product identity, category, taxonomy, images, and variants;
- seller identity, verification snapshot, pickup/dispatch context, and seller ratings;
- price events, campaign timer events, inventory snapshots, COD/returns availability;
- reviews with reviewer credibility context;
- order outcomes and return reasons;
- seller proof assets and buyer proof requests.

Large raw marketplace payloads should not be copied into the product surface unless they support scoring, explanation, audit, or checkout.

## 16. Implementation Phases

### Phase 1: Trust Score

Build weighted score, breakdown, confidence, and new seller fair-start.

### Phase 2: Knowledge Graph

Build graph relationships for seller, product, SKU, reviews, returns, proof, offer, checkout, and outcome.

### Phase 3: Checkout Confidence

Build prepaid confidence score and safe checkout nudges.

### Phase 4: Seller Evidence Loop

Convert buyer doubts and return reasons into aggregate seller tasks.

### Phase 5: MongoDB Atlas Integration

Store dynamic evidence, score snapshots, agent traces, checkout sessions, and cache in MongoDB Atlas.

### Phase 6: End-To-End Demo

Connect buyer, checkout, seller, admin, and outcome learning into one smooth product flow.

## 17. Success Metrics

- kept-order rate;
- avoidable return reduction;
- COD rejection reduction;
- prepaid adoption under high-trust conditions;
- seller proof task completion;
- buyer trust score engagement;
- recommendation abstention when evidence is weak;
- cache hit rate for repeated agent queries;
- buyer memory opt-out correctness.

## 18. Final Summary

Sarthi is a closed-loop trust product.

It starts with buyer confusion, calculates explainable trust, supports safer checkout decisions, sends aggregate proof gaps to sellers, uses admin review for governance, and learns from delivery outcomes.

The product is valuable because it reduces uncertainty before checkout, where many wrong purchases begin.
