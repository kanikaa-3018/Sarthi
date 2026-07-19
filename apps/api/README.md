# Sarthi Node API

Node.js + TypeScript backend for Sarthi.

## Stack

```text
Fastify
MongoDB Atlas
Neo4j driver
Atlas Vector Search
Amazon Bedrock Nova and Titan
Gemini API fallback
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

For local-only testing, `MONGODB_URI=mongodb://127.0.0.1:27017` also works if MongoDB is running locally. Local/community MongoDB does not support Atlas Search commands such as `createSearchIndexes`; when `VECTOR_SEARCH_ENABLED=true`, the API uses local cosine similarity until MongoDB Atlas is configured.

Optional runtime integrations:

```text
AI_PROVIDER_ORDER=bedrock,gemini
BEDROCK_ENABLED=true
AWS_REGION=ap-south-1
BEDROCK_TEXT_MODELS=apac.amazon.nova-micro-v1:0,apac.amazon.nova-lite-v1:0
BEDROCK_VISION_MODELS=apac.amazon.nova-lite-v1:0
BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_EMBEDDING_DIMENSIONS=512

LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=<your-gemini-key>

NEO4J_ENABLED=true
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<password>

VECTOR_SEARCH_ENABLED=true
BEDROCK_VECTOR_SEARCH_INDEX=sarthi_evidence_vector_bedrock_512
VECTOR_SEARCH_INDEX=sarthi_evidence_vector
```

Without these values, the API keeps deterministic MongoDB-backed fallbacks active.

The API reads `.env` from the repo root and `apps/api/.env`. From the repo root, configure non-secret Bedrock settings, then optionally add a Gemini fallback key:

```powershell
npm run setup:bedrock
npm run setup:gemini
```

AWS credentials come from the standard SDK credential chain; never write access keys to `.env`. Restart the API after updating configuration, then verify `/system/readiness`. `npm run ai:smoke` is inert; `npm run ai:smoke -- --live` makes three bounded live calls.

## Commands

```powershell
npm install
npm run seed
npm run vector:index   # optional Atlas index setup; local MongoDB keeps API-side embedding fallback
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
- Bedrock-first grounded answers, confidence assignment, visual matching, and embeddings with Gemini fallback

## Product Data Shape

MongoDB product documents keep only fields that affect trust, checkout, or audit:

- product/category/taxonomy/media;
- seller and supplier snapshot;
- variants/SKU price and stock;
- COD, returns, dispatch, inventory, campaign timer, and price history;
- reviews with reviewer credibility context;
- order outcomes and return reasons;
- seller proof assets and buyer proof requests.
