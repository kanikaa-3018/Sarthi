# Architecture

## Core Principle

SQLite stores facts. Neo4j explains relationships. The agent routes questions to tools. The UI shows a simple decision.

```text
React UI
  -> FastAPI endpoints
  -> Agent orchestrator
  -> deterministic services
  -> SQLite source-of-truth facts
  -> data-source and seller verification contracts
  -> Neo4j projected relationship paths
```

## SQLite Responsibilities

SQLite is the prototype source of truth for:

- buyers;
- accounts and sessions;
- sellers and seller verification profiles;
- seller applications;
- seller verification document evidence and file metadata;
- seller listing drafts;
- products;
- variants;
- data source contracts;
- duplicate clusters;
- reviews;
- order outcomes;
- return reasons;
- price events;
- campaigns;
- inventory snapshots;
- fit memory;
- fact records;
- recommendation traces.

## Neo4j Responsibilities

Neo4j is projected from SQLite and used for multi-hop reasoning:

```text
buyer -> kept variant -> fit memory -> candidate variant
variant -> returned_for -> issue -> corrective action
variant -> price events -> campaign -> inventory -> offer status
```

Neo4j must not invent facts. Every relationship that supports a buyer-facing claim must carry a `fact_id` that maps back to SQLite.

## Agent Responsibilities

The agent:

- understands buyer intent;
- selects the required tools;
- asks at most one clarification;
- converts tool results into buyer language;
- returns a UI action.

The agent does not:

- calculate trust scores directly;
- invent product facts;
- override deterministic service thresholds;
- expose chain-of-thought.

## Deterministic Services

- `duplicate_detection`: finds comparable listings.
- `evidence_aggregator`: builds SKU/variant evidence cards.
- `fit_predictor`: recommends size with confidence.
- `kept_order_ranker`: ranks variants for kept-order likelihood.
- `offer_verifier`: checks offer urgency.
- `review_retriever`: retrieves relevant review snippets.
- `data_contracts`: computes source freshness, seller verification, and product trust state.
- `seller_onboarding`: manages seller applications, uploaded document evidence, drafts, and readiness.
- `admin_review`: applies reviewer decisions and publishes eligible drafts.
- `response_validator`: blocks unsupported claims.
- `privacy`: controls personal memory behavior.

## Failure Behavior

- If LLM fails: return deterministic service summary.
- If voice fails: text path remains complete.
- If Neo4j fails: SQLite-backed answer still works, audit marks graph proof unavailable.
- If data is sparse: return unknown/low-confidence, not false precision.
- If source data is stale or unavailable: pause strong buyer-facing claims.
- If seller verification is restricted or missing: block recommendation for that seller.
- If outcome write-back is malformed: reject before evidence or memory changes.
