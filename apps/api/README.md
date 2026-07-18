# Sarthi Node API

Node.js + TypeScript backend for Sarthi.

## Stack

```text
Fastify
MongoDB Atlas
Neo4j driver
Atlas Vector Search
Gemini API
Zod
TypeScript
```

## Environment

Copy the root `.env.example` to `.env` and set:

```text
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sarthi
AUTH_SECRET=<strong-random-secret>
```

For local-only testing, `MONGODB_URI=mongodb://127.0.0.1:27017` also works if MongoDB is running locally. Local/community MongoDB does not support Atlas Search commands such as `createSearchIndexes`, so keep `VECTOR_SEARCH_ENABLED=false` unless `MONGODB_URI` points to MongoDB Atlas.

Optional runtime integrations:

```text
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your-gemini-key>

NEO4J_ENABLED=true
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<password>

VECTOR_SEARCH_ENABLED=true
VECTOR_SEARCH_INDEX=sarthi_evidence_vector
```

Without these values, the API keeps deterministic MongoDB-backed fallbacks active.

## Commands

```powershell
npm install
npm run seed
npm run vector:index   # optional, only on MongoDB Atlas
npm run dev
```

Build:

```powershell
npm run build
```

## API Contract

The Node backend preserves the existing frontend `/api` contract:

- auth
- buyer feed
- product detail
- SKU passport
- compare
- knowledge graph
- checkout offer verification
- expectation contracts
- outcome simulation
- seller evidence coach
- seller onboarding
- admin review
- audit traces
- buyer privacy and memory controls
- buyer trust dashboard
- reviewer credibility weighting for reviews from new or high-return users
- optional Neo4j evidence graph projection
- optional Atlas Vector Search evidence retrieval
- optional Gemini grounded answers and confidence assignment

## Product Data Shape

MongoDB product documents keep only fields that affect trust, checkout, or audit:

- product/category/taxonomy/media;
- seller and supplier snapshot;
- variants/SKU price and stock;
- COD, returns, dispatch, inventory, campaign timer, and price history;
- reviews with reviewer credibility context;
- order outcomes and return reasons;
- seller proof assets and buyer proof requests.
