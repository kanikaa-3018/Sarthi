# MongoDB Atlas Setup

Sarthi can run on local MongoDB or MongoDB Atlas. MongoDB is the source of truth for products, SKUs, sellers, reviews, proof requests, checkout snapshots, audit traces, LLM cache records, and optional vector embeddings.

## Required Environment

Set these values in `apps/api/.env` or the deployment environment:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sarthi
AUTH_SECRET=<strong-random-secret>
DEMO_CONTROLS_ENABLED=false
```

Do not commit Atlas credentials. Use a database user with the minimum permissions needed for the selected environment.

## Seed For Evaluation

```powershell
npm --prefix apps/api run seed
```

The seed creates deterministic evaluation records. In production, official connectors should replace these records for catalog, order, return, review, inventory, campaign, payment, and seller verification evidence.

## Optional Vector Search

Enable vector retrieval only when an AI embedding provider is configured:

```env
VECTOR_SEARCH_ENABLED=true
AI_PROVIDER_ORDER=bedrock,gemini
BEDROCK_ENABLED=true
```

Create provider-specific indexes:

```powershell
npm --prefix apps/api run vector:index -- --provider=bedrock
npm --prefix apps/api run vector:index -- --provider=gemini
```

Titan and Gemini embeddings use separate collections and dimensions. The API never mixes 512-dimensional Bedrock vectors with 768-dimensional Gemini vectors.

## Readiness Check

After starting the API, open:

```text
http://127.0.0.1:8000/system/readiness
```

Expected Atlas-specific signals:

- `data_mode` is `mongodb_atlas`.
- `runtime_integrations.atlas_vector_search.status` is `ready_for_queries`, `waiting_for_ai_provider`, or another explicit state.
- `production_connectors` still show official marketplace adapters as required until real data connectors are attached.

If `data_mode` is `mongodb_local`, the API is connected to a local MongoDB URI, not Atlas.
