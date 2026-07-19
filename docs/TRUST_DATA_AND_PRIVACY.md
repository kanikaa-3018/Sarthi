# Trust, Data, And Privacy

## Purpose

Sarthi makes purchase recommendations only when evidence supports them. This document explains the data model, trust states, privacy boundaries, edge cases, and production connector requirements behind that rule.

## Evidence Sources

| Evidence area | Prototype source | Production source needed |
| --- | --- | --- |
| Catalog and product media | MongoDB seed documents | Catalog service and media pipeline. |
| Seller verification | Seeded seller profiles, applications, documents | KYC/GST verification, compliance workflow, secure document store. |
| Orders and returns | Seeded order outcomes and simulated feedback | Order, return, exchange, RTO, and refund systems. |
| Reviews | Seeded review evidence with credibility fields | Review/UGC service plus reviewer risk signals. |
| Price and campaigns | Seeded price events and campaigns | Pricing, promotion, campaign, and offer services. |
| Inventory and dispatch | Seeded inventory and fulfillment snapshots | Inventory, logistics, dispatch, and SLA systems. |
| Buyer fit memory | Buyer-controlled prototype memory | Consent-managed first-party account memory. |
| Seller proof assets | Prototype proof metadata and status | Secure object storage, moderation, and retention policy. |
| Admin decisions | Reviewer action endpoints and audit events | Production reviewer operations and maker-checker controls. |

## Core Entities

| Entity | Important fields | Used by |
| --- | --- | --- |
| Account/session | role, buyer ID, seller ID, token expiry | Auth and RBAC. |
| Buyer | profile, language, memory setting, dashboard state | Buyer UI, privacy, fit advice. |
| Fit memory | category, anchor variant, retained size, confidence, fact ID | Size Oracle and checkout confidence. |
| Seller | verification status, KYC/GST status, data access level, restricted reason | Seller gates, buyer trust state, admin review. |
| Seller application | business name, GST, pincode, support contact, review status | Seller signup and admin approval. |
| Verification document | type, file metadata, SHA-256 hash, status, notes | Seller onboarding and admin document review. |
| Product | title, category, image, seller, price, taxonomy, buyer trust | Feed, detail, comparison. |
| Variant | size, price, stock, SKU evidence | Product detail, size, checkout. |
| Variant evidence | delivered orders, returns, return rate, fit rate, dispatch, fact IDs | Trust passport and ranking. |
| Review evidence | attribute, sentiment, rating, credibility weight, fact ID | Fabric/color/fit reasoning. |
| Price event/campaign/inventory | current price, reference price, timer resets, stock pressure, fact ID | Offer Sach Check. |
| Proof request | product, attribute, request count, status, fact ID | Buyer proof ledger and seller evidence coach. |
| Proof asset | seller proof, proof type, quality score, status, review notes | Seller console and admin proof review. |
| Listing draft | title, category, price, target cluster, readiness, review status | Seller listing lab and admin publishing. |
| Expectation contract | checkout promises, privacy boundary, order state | Checkout and outcome learning. |
| Audit trace | intent, tools used, facts, graph paths, timestamp | Buyer/support/judge inspection. |

## Trust States

Every product recommendation returns a trust state.

| State | Meaning | Buyer guidance |
| --- | --- | --- |
| `ready_to_buy` | Seller, SKU evidence, source freshness, and key checks are strong enough. | Continue, with visible proof. |
| `limited_evidence` | Data exists but is too thin for a strong claim. | Buy only after the named proof/action. |
| `conflicting_evidence` | Signals disagree across reviews, returns, size, seller, or source state. | Compare alternatives or wait for proof. |
| `seller_verification_pending` | Seller is not verified yet. | Do not show strong recommendation. |
| `seller_restricted` | Seller is blocked or restricted. | Block recommendation. |
| `data_degraded` | Source freshness or availability is not good enough. | Pause strong claims. |
| `specific_caution` | Product can be considered but has one clear issue to check. | Follow the listed action. |

## Confidence Rules

- New listings are not treated as bad; they are limited evidence.
- Strong recommendations require seller verification and fresh source data.
- A single kept/returned outcome can update personal memory but cannot dominate global ranking.
- Review ratings are weighted by credibility signals.
- Repeated high-return or very new reviewer profiles are downweighted.
- Any unsupported AI-generated claim must be blocked or converted into caution.

## Buyer Privacy Boundary

| Data | Buyer can see | Seller can see | Admin can see |
| --- | --- | --- | --- |
| Personal fit memory | Yes | No | No |
| Buyer order outcome | Yes | Aggregate impact only | Operational/audit summary only when needed |
| Buyer proof request | Yes | Request attribute and aggregate demand | Review context only |
| Product-level return evidence | Yes | Aggregate listing evidence | Yes |
| Seller documents | No | Own documents | Yes |
| Listing drafts | No until published | Own drafts | Yes |
| Audit trace facts | Yes for buyer-facing decisions | Not buyer private facts | Reviewer-safe operational facts |

## Privacy Controls

Buyer controls:

- view fit memory;
- change active fit preference;
- disable memory use;
- delete fit memory;
- use text path without voice;
- inspect proof and audit history.

Sarthi does not require:

- SMS access;
- contacts;
- gallery access;
- notification reading;
- address book access;
- payment credentials;
- raw voice retention.

## Admin Review Boundary

Admin reviewers can decide seller and listing readiness. They should not receive raw buyer private memory.

Admin-visible review context includes:

- seller application fields;
- verification document metadata and hash;
- listing draft details;
- seller proof assets;
- proof request counts;
- source health;
- risk score and prescreen checks;
- buyer impact summary;
- audit events.

Admin cannot:

- publish a listing for an unverified seller;
- mark a new listing high-confidence without outcomes;
- bypass review notes on revision requests;
- use buyer private memory for seller decisions.

## Gemini And Agentic AI Boundary

Gemini is optional and used for grounded language, confidence phrasing, and assistive summaries when configured.

Rules:

- Retrieval happens before generation.
- Deterministic services own trust-critical scoring.
- Gemini output must remain tied to fact IDs and source context.
- If Gemini fails, deterministic fallback stays available.
- AI suggestions do not replace admin approval.
- The audit drawer shows tools, facts, and blocked unsupported claims, not chain-of-thought.

## Edge Cases

| Case | Product behavior |
| --- | --- |
| Cold-start SKU | Use seller/catalog facts, show limited evidence, request proof if needed. |
| New seller | Keep verification pending until admin approval. |
| Restricted seller | Block buyer recommendation and seller trust lift. |
| Stale source | Mark data degraded and pause strong claims. |
| Conflicting reviews | Show conflict and action instead of averaging away the issue. |
| Offer has no price history | Say not enough history, not fake. |
| Timer resets frequently | Show caution with campaign facts. |
| Buyer disables memory | Size advice falls back to aggregate evidence. |
| Buyer deletes memory | Remove stored fit memory and keep future advice memory-free. |
| Seller submits multiple proofs | Group by seller and product for admin review. |
| Draft submitted before verification | Keep blocked until seller verification is approved. |
| Proof rejected | Keep request open or require clearer asset with notes. |
| Neo4j unavailable | Use MongoDB-backed graph summary and mark graph projection unavailable. |
| Vector index unavailable | Use lexical fallback and expose readiness warning. |

## Production Requirements

Before production use, Sarthi needs:

- official marketplace connectors for catalog, orders, returns, reviews, campaigns, inventory, logistics, seller KYC, and payments;
- secure media/document storage;
- managed authentication with OTP, recovery, and session risk controls;
- migration system beyond seeded reset;
- production admin operations, escalation, audit retention, and maker-checker review;
- observability, rate limiting, error monitoring, and abuse controls;
- accessibility and real mobile-device QA;
- privacy and security review for any voice feature.

## Disclosure

The current prototype uses deterministic seeded data and optional runtime integrations. It is valid for evaluating product logic, workflow completeness, UX, and technical architecture. It is not a production deployment until official connectors and operational controls are attached.
