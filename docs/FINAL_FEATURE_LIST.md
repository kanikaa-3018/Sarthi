# Final Feature List

## P0 Features

### 1. Confusion Resolver

Detects near-duplicate kurti listings and recommends one best listing plus one alternative.

Why it exists:

- Buyers see many similar listings.
- Cheapest is not always the safest.
- The platform wants more kept orders, not random COD attempts.

Inputs:

- duplicate cluster;
- variant outcomes;
- seller dispatch behavior;
- return reasons;
- review evidence;
- buyer fit memory.

Output:

```text
Best match for you: Seller A, XL
Why: size is more consistent, fewer color mismatch returns, dispatches faster.
Alternative: Seller C, cheaper but weaker color evidence.
```

### 2. Per-SKU Trust Card

Shows variant-level evidence with denominators and timestamps.

Do:

- show delivered count;
- show return count;
- show top issue;
- show evidence strength;
- expose fact IDs in audit.

Do not:

- show unexplained `91/100`;
- punish new listings as bad;
- mix seller-level reputation with SKU truth.

### 3. Size Oracle

Recommends a size for the selected variant using category-specific memory.

Priority order:

1. Same-category kept/returned history.
2. Same-category brand-size anchor.
3. Optional measurements.
4. Two-size guidance if confidence is weak.

No universal size mapping across unrelated categories.

### 4. Galti Mat Dohrao

Shows the one avoidable issue for the exact variant.

Examples:

```text
Color looks darker indoors. Check daylight image before ordering.
```

```text
This variant runs small in L. XL is safer for your profile.
```

Rules:

- one warning only;
- must be specific;
- must have sample support;
- must include an action.

### 5. Offer Sach Check

Checks whether checkout urgency is factual.

Statuses:

```text
Verified deal
No need to rush
Not enough history
```

Evidence:

- price events;
- campaign start/end;
- inventory snapshots;
- timer reset facts;
- sales velocity.

Never say `fake timer` or accuse the seller. Show facts calmly.

### 6. Sarthi Samvaad

Text-first, optional voice interface for buyer questions.

Supported intents:

- compare;
- fit;
- fabric;
- color;
- offer urgency;
- avoidable issue;
- checkout confidence.

The agent chooses tools and returns a grounded answer with a UI action.

### 7. Buy-to-Keep Learning

After simulated delivery, the buyer marks kept or returned. The outcome updates SQLite and creates a Neo4j edge.

Rules:

- one buyer outcome updates personal memory;
- aggregate confidence refreshes through smoothing;
- one event does not swing global ranking.

### 8. Audit Drawer

User and support-facing proof drawer.

Shows:

- intents;
- tools used;
- fact IDs;
- denominators;
- timestamps;
- Neo4j path;
- unsupported claims blocked.

Do not expose chain-of-thought.

### 9. Trust State And Data Freshness

Every buyer-facing recommendation carries a state:

```text
ready to buy
limited evidence
conflicting evidence
seller verification pending
seller restricted
data degraded
specific caution
```

Rules:

- stale or unavailable sources pause strong claims;
- restricted sellers block recommendation;
- low-data products abstain instead of being punished;
- pending verification is shown clearly;
- each state includes buyer guidance.

### 10. Privacy Controls

Buyer can:

- view personal fit memory;
- edit fit preference;
- turn fit memory off;
- delete fit memory;
- use text instead of voice.

No SMS, contacts, gallery, notification access, address, payment data, or raw voice retention.

### 11. Seller Evidence Console

Shows each seller how their duplicate listing compares using aggregate marketplace evidence.

Do:

- show seller verification state;
- show data freshness;
- show kept-order rank, avoidable issue, and listing action items;
- protect ownership server-side.

Do not:

- expose buyer personal memory;
- grant verified seller trust on signup;
- publish seller listings without review.

### 12. Admin Review Queue

Separates reviewer decisions from buyer and seller surfaces.

Do:

- show pending seller applications;
- show submitted document evidence and file hashes;
- approve or reject seller verification;
- approve submitted listing drafts only after seller verification;
- request listing revision with reviewer notes;
- publish approved listings as limited-evidence products.

Do not:

- allow buyer or seller accounts to access review controls;
- mark a new listing as high-confidence without outcomes;
- expose buyer personal memory in reviewer decisions.

## P1 Features

- voice input after text path works;
- Hindi UI toggle;
- improved review retrieval;
- small seller coaching snippet;
- PostgreSQL/pgvector production migration.

## Excluded From Finalist Prototype

- Return Window Guardian;
- notification listener;
- full production seller dashboard with payouts, ads, fulfillment, and inventory ops;
- cross-category intelligence;
- real payment integration;
- browser extension dark-pattern scanner.
