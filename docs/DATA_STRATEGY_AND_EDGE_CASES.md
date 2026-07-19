# Data Strategy And Edge Cases

This document answers the judge/mentor objection:

```text
How do you get official return rates, size accuracy, price history, inventory, and seller reliability if there is no public API?
```

## Short Answer For Judges

For the hackathon prototype, we use a clearly disclosed synthetic Meesho-like dataset with invariant tests. We do not claim these numbers are real Meesho production data.

In a real Meesho-integrated product, Sarthi would use authorized first-party platform data:

- catalog attributes;
- SKU and variant metadata;
- order status;
- delivery status;
- RTO events;
- return and exchange events;
- structured return reasons;
- review text;
- campaign start/end;
- price events;
- inventory snapshots;
- seller dispatch metrics;
- buyer-provided fit preference and personal fit memory.

Sarthi is not a cross-site scraper. It is a platform-embedded decision layer.

## What We Should Say In The Demo

Use this exact stance:

```text
We do not have access to Meesho production data in the hackathon, so the prototype uses synthetic commerce events generated with documented rules. The point of the prototype is to show how existing first-party platform signals can be converted into a pre-purchase confidence decision. Every shown claim has a fact ID, denominator, timestamp, and test-backed invariant. In production, the same services would read authorized Meesho catalog, order, return, campaign, inventory, and review systems.
```

Do not say:

```text
We fetched real Meesho return rates.
```

Do not imply:

```text
The synthetic numbers prove actual return reduction.
```

## Why Judges Can Still Trust The Prototype

Judges should trust the prototype because it proves the mechanism, not because it claims hidden access to real data.

Trust signals:

- synthetic data is disclosed;
- seed generation rules are documented;
- totals reconcile through invariant tests;
- return counts never exceed delivered orders;
- every buyer-facing number links to a fact ID;
- graph relationships map back to SQLite fact records;
- low-data products show abstention instead of false confidence;
- changing data changes the output;
- the LLM cannot invent product facts.

This is stronger than hard-coded demo data because the same logic works across multiple seeded products, buyers, outcomes, and price histories.

## Source Of Each Signal

| Signal | Prototype source | Production source | If missing |
|---|---|---|---|
| Return rate | synthetic order outcomes | first-party return/order events | show unknown, do not rank by return rate |
| Size accuracy | retained/returned size outcomes | order + return reason + exchange data | ask buyer for fit anchor or show two-size guidance |
| Top avoidable issue | synthetic return reasons + reviews | structured return reason taxonomy + reviews | show no warning |
| Color/fabric confidence | tagged reviews + return reasons | reviews, returns, catalog attributes | answer only from catalog/reviews with low confidence |
| Seller dispatch | synthetic dispatch metric | logistics/order fulfillment data | omit dispatch reason |
| Price truth | synthetic price events | price history/campaign service | `Not enough history` |
| Scarcity truth | synthetic inventory snapshots | available-to-promise inventory + velocity | do not comment on scarcity |
| Personal fit memory | seeded buyer outcomes | buyer's kept/returned orders with consent | cold-start fit flow |
| Review evidence | synthetic tagged reviews | review service + retrieval | do not cite reviews |
| Graph paths | projected SQLite seed facts | projected production facts | show graph unavailable or use SQLite fallback |

## Capability Levels

The product should degrade by capability, not break.

### Level 0: Catalog Only

Available:

- title;
- category;
- size chart;
- fabric label;
- price shown.

Behavior:

- no return-rate claims;
- no size confidence beyond size chart;
- no offer urgency claim;
- ask buyer one useful question if needed.

Copy:

```text
I do not have enough return history for this product yet. I can help compare catalog details and size chart only.
```

### Level 1: Catalog + Reviews

Available:

- product attributes;
- review snippets.

Behavior:

- answer fabric/color questions from reviews;
- mark confidence as review-based;
- do not show product trust score.

Copy:

```text
Reviews mention light fabric, but return history is not available yet.
```

### Level 2: SKU Outcomes

Available:

- delivered orders;
- returns;
- return reasons;
- exchanges.

Behavior:

- show Per-SKU Trust Card;
- show one avoidable warning;
- rank comparable listings with smoothing.

Copy:

```text
31 of 284 delivered orders were returned. Most captured returns were size-related.
```

### Level 3: Personal Fit Memory

Available:

- buyer's same-category kept/returned history;
- buyer fit preference.

Behavior:

- recommend size with confidence;
- allow memory delete/off;
- never use sensitive attributes.

Copy:

```text
Used two past kurti outcomes and your comfort-fit preference.
```

### Level 4: Price + Campaign + Inventory

Available:

- price events;
- campaign end time;
- timer resets;
- inventory snapshots;
- sales velocity.

Behavior:

- run Offer Sach Check;
- verify deal or say no need to rush;
- never accuse seller/platform.

Copy:

```text
No need to rush. This price has been active for 5 days.
```

## Important Product Boundary

Sarthi does not need all data to be useful, but each feature requires its own minimum evidence.

If evidence is unavailable, the feature must abstain:

- no price history -> no offer-truth claim;
- no return history -> no return-rate claim;
- no fit memory -> ask one fit anchor or use size chart;
- no review evidence -> do not answer subjective fabric/color questions;
- no inventory -> do not validate scarcity.

This is what makes the product trustworthy.

## Edge Cases And Required Behavior

### New Product

Risk:

- no outcomes yet;
- no return-rate data.

Behavior:

- mark as `new/insufficient history`;
- use seller dispatch and catalog facts only;
- do not call it risky.

### New Seller

Risk:

- sparse seller metrics.

Behavior:

- judge listing by SKU/variant evidence where available;
- smooth sparse data toward category prior;
- avoid permanently penalizing.

### Sparse Returns

Risk:

- 1 return out of 2 orders can look terrible.

Behavior:

- minimum evidence thresholds;
- Bayesian smoothing;
- show uncertainty.

### Conflicting Reviews And Returns

Risk:

- reviews praise color but return reasons say color mismatch.

Behavior:

- prioritize verified outcomes for risk;
- cite review conflict separately;
- lower confidence.

Copy:

```text
Reviews praise the color, but recent returns mention color mismatch. Check daylight image before ordering.
```

### Logistics-Caused Return

Risk:

- product gets blamed for delivery damage or late delivery.

Behavior:

- separate logistics-caused returns from product-caused returns;
- do not use logistics failures as fabric/fit warnings.

### Product Listing Changed

Risk:

- old returns refer to old catalog photos or old size chart.

Behavior:

- expire warnings after catalog/image/measurement changes;
- require fresh outcomes before strong claims.

### Sponsored Listing

Risk:

- judges may worry paid promotion biases the recommendation.

Behavior:

- keep sponsored status outside confidence score;
- show if a listing is sponsored separately;
- recommendation reasons must remain evidence-based.

### Deleted Buyer Memory

Risk:

- privacy concern.

Behavior:

- fit memory deletion should remove personal fit records;
- future fit advice falls back to catalog/category evidence;
- audit should show personal memory was not used.

### Voice Failure

Risk:

- voice demo breaks.

Behavior:

- text path remains complete;
- voice is an input method only.

### LLM Failure

Risk:

- generated answer unavailable.

Behavior:

- deterministic services return structured summary;
- no fake successful answer.

### Neo4j Failure

Risk:

- graph database unavailable on judge machine.

Behavior:

- SQLite-backed recommendation still works;
- audit marks graph proof unavailable;
- graph sync can be retried.

### Price History Missing

Risk:

- Offer Sach Check overclaims.

Behavior:

- return `Not enough history`;
- do not call timer fake.

### Inventory Missing

Risk:

- cannot verify `Only 2 left`.

Behavior:

- do not validate scarcity;
- say inventory support is unavailable.

### Review Spam

Risk:

- review text is unreliable.

Behavior:

- detect duplicated text/review bursts as low quality;
- prefer order outcomes over suspicious reviews.

### Category Expansion

Risk:

- size model is not universal.

Behavior:

- launch category by category;
- define fit/risk features per category;
- do not reuse kurti logic for electronics or beauty.

## If An E-Commerce Platform Does Not Track These Signals

Then Sarthi cannot provide the full product. It can only provide lower capability levels.

This is acceptable because the target deployment is Meesho or a similar marketplace with first-party commerce events. Sarthi is not meant to magically infer private operational truth from public pages.

For a smaller e-commerce platform:

- Level 0/1 works with catalog and reviews.
- Level 2 requires basic order/return tracking.
- Level 3 requires buyer account history and consent.
- Level 4 requires price/campaign/inventory systems.

The product is robust because it degrades honestly. It is not robust because it guesses missing data.

## Mentor-Friendly Explanation

Use this answer:

```text
Sarthi is designed as a first-party platform feature. In production, the data comes from systems Meesho already operates: catalog, orders, returns, exchanges, reviews, campaigns, inventory, and logistics. We do not have that access in the hackathon, so we built a synthetic but internally consistent event dataset. The important prototype proof is that every claim is generated from auditable records, every record has a fact ID, and missing evidence causes abstention. That means the product can safely degrade from full confidence advice to simple catalog guidance instead of hallucinating.
```

## One-Line Defense

```text
We are not proving access to Meesho data; we are proving the product and engineering system that can safely turn authorized first-party commerce data into buyer confidence.
```
