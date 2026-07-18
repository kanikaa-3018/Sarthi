# Product Readiness

## Current Product Contract

Sarthi is a connected commerce-confidence product with four product surfaces:

- buyer shopping assistant;
- seller listing evidence console;
- trust and privacy center;
- admin review queue.

Buyer, seller, and admin surfaces are separated by authenticated roles. A buyer session cannot access seller or admin APIs. A seller session cannot access buyer memory, buyer recommendations, admin review controls, or another seller's panel.

The product is considered coherent only when all four surfaces use the same evidence layer:

- MongoDB Atlas evidence documents are the source of truth;
- graph paths explain multi-hop reasoning;
- audit traces expose fact summaries;
- privacy settings affect size advice;
- seller tools use aggregate evidence only.
- role and ownership checks are enforced server-side.
- reviewer decisions change seller/listing state through explicit admin endpoints.

## Product-Ready Slices Built

- Duplicate listing comparison.
- Per-SKU trust evidence.
- Size recommendation with memory-aware and memory-off behavior.
- One avoidable issue per listing.
- Offer Sach Check at checkout.
- Agent question path with trace creation.
- Outcome learning loop.
- Audit drawer with fact details.
- Trust Center for memory on/off, fit preference, and memory deletion.
- Read-only seller console for duplicate-listing quality and action items.
- Role-based login with server-side sessions and ownership checks.
- Data-source freshness contracts for every claim-bearing feature.
- Seller verification gates for buyer and seller surfaces.
- Product trust states that pause recommendation on stale data, restricted sellers, or insufficient evidence.
- Strict outcome write-back validation for statuses, return reasons, and unknown variants.
- Demo reset/scenario/debug endpoints gated outside development and demo modes.
- Marketplace-style buyer feed with 32 seeded products, images, ratings, delivery copy, and category browsing.
- Database-backed buyer signup.
- Pending seller application signup that does not grant verified seller trust.
- Seller onboarding workspace with verification document records.
- Seller listing drafts with review submission and readiness states.
- Admin reviewer queue for seller applications, document evidence, and listing drafts.
- Seller approval flow that marks seller verification as trusted only after admin action.
- Listing approval flow that publishes submitted drafts to the buyer feed only after seller verification.
- Listing revision flow with required reviewer notes.
- Seller document upload with file metadata, SHA-256 hash, local evidence storage URI, and reviewer visibility.
- Reviewer audit events for seller approval, seller rejection, listing publication, and revision requests.
- System readiness disclosure in the Trust Center for data mode, source health, implemented controls, and production blockers.
- Stricter signup password validation and normalized login lookup.

## Remaining Production Blockers

These are not UI polish items; they are real production blockers:

- real marketplace data connectors;
- managed identity provider / OTP login integration;
- password reset, email/phone verification, and account recovery;
- production recovery, device/session management, and risk checks;
- third-party seller KYC/GST verification and production document storage;
- production reviewer operations, maker-checker escalation, and compliance retention;
- real media upload/storage for listing photos;
- marketplace catalog/inventory integration for approved listing publishing;
- write authorization for seller actions;
- proper migration system beyond seeded MongoDB reset;
- admin-only operational controls instead of prototype reset/scenario APIs;
- observability, rate limits, and error reporting;
- accessibility pass with keyboard and screen-reader testing;
- mobile browser QA on real devices;
- security/privacy review for any voice feature before enabling it.

## Rule

Do not add new product surfaces until buyer, seller, privacy, and audit paths remain connected under tests.
