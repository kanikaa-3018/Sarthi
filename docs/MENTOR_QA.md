# Mentor Q&A

This file is a quick reference for mentor and judge discussions. It explains what Sarthi does, why it matters, and where the prototype is intentionally bounded.

## 1. What problem is Sarthi solving?

Sarthi helps Bharat marketplace buyers avoid unsafe or confusing purchases before checkout. The core problem is not only price discovery. Buyers often face duplicate listings, inconsistent seller quality, unclear size fit, weak review evidence, fake urgency, and low confidence in COD decisions.

## 2. Who is the primary user?

The primary user is a buyer from a tier 2 or tier 3 market who wants a simple answer: which item is safer to buy, what size should I choose, and what should I check before paying. The interface is designed to avoid technical language and give one clear next step.

## 3. What makes the buyer flow stronger than a normal product page?

Sarthi does four things before the buyer commits:

- compares duplicate listings across sellers;
- checks seller verification, returns, reviews, and source freshness;
- gives a fit recommendation using buyer memory only when allowed;
- runs an offer check before checkout so the buyer is not pressured by unclear urgency.

## 4. How is agentic AI used?

The agent does not invent recommendations. It routes a buyer question through product, seller, return, review, fit, offer, and graph tools, then returns a grounded answer with proof. If evidence is weak, the agent pauses the recommendation instead of forcing a confident answer.

## 5. What is the trust receipt?

The trust receipt is a buyer-readable proof summary. It shows what was checked, whether buying is recommended or paused, why that decision was made, and the safest next action. Detailed proof is available for reviewers and advanced users, but the default buyer view stays simple.

## 6. Why is this useful for COD-heavy commerce?

COD orders create risk for buyers, sellers, and platforms when buyers order uncertain products and return them later. Sarthi nudges buyers toward safer prepaid choices when trust is high, and pauses risky purchases when evidence is limited or seller verification is weak.

## 7. How does Sarthi protect buyer privacy?

Buyer fit memory is personal. Sellers only see aggregate listing evidence and action items. They do not see a buyer's private size history, personal outcomes, or preference memory.

## 8. What is the role of the seller panel?

The seller panel helps sellers understand why their listing is not trusted enough yet. It shows verification state, evidence gaps, duplicate listing comparison, and improvement actions based on aggregate marketplace signals.

## 9. What is the role of the admin panel?

The admin panel controls seller verification and listing approval. It keeps risky seller onboarding away from the buyer surface and records reviewer decisions with document metadata and audit history.

## 10. What data is real in the prototype?

The prototype uses deterministic synthetic data for judging and repeatable demos. The product design already defines production connectors for catalog, seller KYC, orders, returns, reviews, price events, campaigns, inventory, and logistics.

## 11. What should judges test in the demo?

Use the buyer flow first:

- browse the feed;
- compare duplicate listings;
- open product trust details;
- ask a Samvaad question;
- open proof;
- proceed to checkout;
- run the offer and payment recommendation flow;
- mark the order outcome.

Then check that the seller panel only exposes aggregate evidence, and that admin review controls are role protected.

## 12. What is intentionally out of scope?

The prototype does not include a real payment gateway, official marketplace connectors, notification scraping, or production logistics integration. Those are integration steps after validation of the trust layer.
