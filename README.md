# Sarthi

Sarthi is a pre-purchase trust and checkout confidence layer for online commerce. It helps buyers choose a safer product, seller, size, offer, and payment mode before checkout, while giving sellers aggregate evidence tasks and giving admins review control.

## Current Direction

The active backend direction is now:

```text
Frontend: React + Vite + TypeScript
Backend: Node.js + TypeScript + Fastify
Database: MongoDB Atlas
Graph reasoning: MongoDB evidence projection, optional Neo4j runtime projection
Semantic retrieval: Optional MongoDB Atlas Vector Search over Gemini embeddings
LLM: Optional Gemini grounded answer and confidence assignment
```

The previous Python/FastAPI backend remains in `backend/` only as historical reference. New backend work should happen in `apps/api`.

## Product Slice

```text
Buyer feed -> Trust score -> Similar listing resolver -> Product detail
Checkout confidence -> Prepaid/COD nudge -> Outcome learning
Buyer trust dashboard -> Seller evidence coach -> Admin review -> Future trust update
```

## Active Apps

```text
apps/api      Node.js + MongoDB Atlas backend
frontend      React buyer/seller/admin UI
docs          Product, HLD, mentorship, and submission docs
```

## Run Node Backend

Create `.env` from `.env.example`, then set your MongoDB Atlas URI:

```powershell
Copy-Item .env.example .env
```

Edit:

```text
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sarthi
AUTH_SECRET=<strong-random-secret>
```

Optional Gemini, Neo4j, and Atlas Vector Search:

```text
LLM_PROVIDER=gemini
LLM_MODEL=gemini-flash-lite-latest
GEMINI_API_KEY=<your-gemini-key>

NEO4J_ENABLED=true
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<password>

VECTOR_SEARCH_ENABLED=true
VECTOR_SEARCH_COLLECTION=evidence_embeddings
VECTOR_SEARCH_INDEX=sarthi_evidence_vector
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
```

If Neo4j or Atlas Vector Search is not configured, Sarthi keeps working through MongoDB projection and lexical retrieval fallback. Local/community MongoDB cannot create Atlas Search indexes; use MongoDB Atlas for `npm run vector:index`, or keep `VECTOR_SEARCH_ENABLED=false` locally.

Install and seed:

```powershell
cd apps\api
npm install
npm run seed
npm run vector:index   # only when using MongoDB Atlas Vector Search
npm run dev
```

The backend runs on `http://127.0.0.1:8000`.

## Run Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` to `http://127.0.0.1:8000`.

## Seeded Review Accounts

Buyer:

```text
username: asha.buyer
password: buyer-asha-pass
```

Seller:

```text
username: seller.a
password: seller-a-pass
```

Admin reviewer:

```text
username: reviewer.admin
password: admin-reviewer-pass
```

## Verification

Node backend:

```powershell
cd apps\api
npm run build
```

Frontend:

```powershell
cd frontend
npm run build
```

## Important Notes

- MongoDB Atlas is the operational data-store target; local MongoDB also works for development.
- MongoDB stores product evidence, trust scores, traces, checkout sessions, proof requests, and LLM/tool cache.
- Review scoring downweights very new, repeated-pattern, or high-return reviewer profiles.
- Neo4j projection is implemented behind `NEO4J_ENABLED=true`; the same evidence map remains MongoDB-backed when Neo4j is unavailable.
- Atlas Vector Search retrieval is implemented behind `VECTOR_SEARCH_ENABLED=true`; it uses Gemini embeddings and falls back to lexical evidence retrieval if the vector index or key is unavailable.
- Gemini is implemented behind `LLM_PROVIDER=gemini` plus `GEMINI_API_KEY`; deterministic fallback remains available for demos.
- The Node backend preserves the frontend API contract so the current UI can migrate without a full rewrite.
- The old Python backend should not be extended further unless it is being used as a reference during migration.

## Docs

- [Product Plan](docs/PLAN.md)
- [Flowchart HLD](docs/FLOWCHART_HLD.md)
- [Mentor Q&A](docs/MENTOR_QA.md)
- [PRD](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy And Trust](docs/PRIVACY_AND_TRUST.md)
