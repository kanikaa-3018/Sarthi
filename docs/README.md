# Sarthi Documentation

This folder is the public documentation set for judges, reviewers, and contributors. It intentionally keeps only the documents needed to understand, run, inspect, and evaluate the prototype.

## Recommended Reading Order

| Document | Use it for |
| --- | --- |
| [PRD](PRD.md) | Product scope, users, modules, requirements, and success metrics. |
| [Architecture](ARCHITECTURE.md) | Current implementation, service boundaries, routes, data flow, and fallback behavior. |
| [Trust, Data, And Privacy](TRUST_DATA_AND_PRIVACY.md) | Evidence model, trust states, privacy boundaries, edge cases, and production data requirements. |
| [Judge Review Guide](JUDGE_REVIEW_GUIDE.md) | Local setup, demo accounts, review path, and evaluation rubric mapping. |
| [Demo Script](DEMO_SCRIPT.md) | Timed presentation flow across buyer, seller, and admin surfaces. |
| [Product Readiness](PRODUCT_READINESS.md) | What is working today, what is prototype-only, and what production still needs. |
| [Attribution](ATTRIBUTION.md) | Open-source packages and dependency sources. |

## What Was Removed

Old phase plans, generated PDFs, initial feature drafts, and implementation checklists were removed from the public docs. Their useful content has been consolidated into the documents above so the repo reads like a final prototype submission instead of a development archive.

## Documentation Principles

- Describe the runnable Node/Fastify/MongoDB implementation.
- Keep buyer, seller, and admin flows connected in every explanation.
- Be explicit about optional Gemini, Atlas Vector Search, and Neo4j integrations.
- Disclose seeded demo data and production connector gaps.
- Avoid promising production behavior that is not implemented in this prototype.
