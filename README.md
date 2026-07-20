<div align="center">
  <h1>Sarthi</h1>
  <p><strong>Evidence-driven commerce trust for orders buyers actually keep.</strong></p>
  <p>
    National hackathon prototype for Meesho-style marketplace trust decisions:
    compare similar listings, verify proof, guide checkout, learn from outcomes.
  </p>

  <p>
    <a href="https://sarthi-three-ebon.vercel.app/"><strong>Live Demo</strong></a>
    |
    <a href="./docs/DEMO_SCRIPT.md">Demo Script</a>
    |
    <a href="./docs/JUDGE_REVIEW_GUIDE.md">Judge Guide</a>
    |
    <a href="./docs/ARCHITECTURE.md">Architecture</a>
  </p>

  <p>
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=fff" />
    <img alt="Fastify" src="https://img.shields.io/badge/Fastify-5-111111?logo=fastify&logoColor=fff" />
    <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Atlas%20or%20Local-47A248?logo=mongodb&logoColor=fff" />
    <img alt="Amazon Bedrock" src="https://img.shields.io/badge/Amazon_Bedrock-primary-FF9900" />
    <img alt="Gemini" src="https://img.shields.io/badge/Gemini-fallback-8E75B2" />
    <img alt="Neo4j" src="https://img.shields.io/badge/Neo4j-optional-4581C3?logo=neo4j&logoColor=fff" />
  </p>
</div>

---

## The Problem

Marketplace buyers often compare many near-identical listings without knowing which seller, size, offer, review signal, proof asset, or payment mode to trust. That guesswork creates avoidable returns, refund friction, COD risk, and seller support load.

Sarthi is built around one rule:

> Evidence before recommendation.

When evidence is strong, Sarthi helps the buyer move forward. When evidence is weak, it asks for proof, suggests a safer action, or pauses the recommendation.

## Live Demo

| Artifact | Link |
| --- | --- |
| Deployed prototype | [Open Sarthi](https://sarthi-three-ebon.vercel.app/) |
| Demo script | [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) |
| Judge review guide | [docs/JUDGE_REVIEW_GUIDE.md](./docs/JUDGE_REVIEW_GUIDE.md) |
| Architecture notes | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |

## What Sarthi Does

```mermaid
flowchart LR
  A[Buyer trust decision] --> B[Seller proof task]
  B --> C[Admin human review]
  C --> D[Safer buyer-facing trust state]
  D --> E[Kept or returned feedback]
  E --> A
```

| Role | Experience | Impact |
| --- | --- | --- |
| Buyer | Feed, similar-listing comparison, SKU Trust Passport, Size Oracle, proof graph, offer check, checkout confidence, orders, privacy controls. | Less confusion before checkout and fewer avoidable returns. |
| Seller | Evidence console, proof tasks, document upload, listing drafts, measurement correction, admin status. | Clear actions to improve trust without seeing buyer private memory. |
| Admin reviewer | Review Desk, AI Triage, Risk & Policy, Work Saved, seller dossiers, proofs, documents, drafts, audit events. | Less manual reading, cleaner routing, final decisions still human-in-loop. |

## Core Features

| Area | Implemented functionality |
| --- | --- |
| Buyer feed | Marketplace-style browsing with product images, seller, rating, delivery, search, categories, trust states, wishlist, orders, and proof ledger. |
| Confusion Resolver | Compares similar listings by seller trust, SKU outcomes, fit, reviews, price value, proof coverage, offer truth, and uncertainty. |
| SKU Trust Passport | Shows delivered evidence, return risk, seller verification, source health, proof gaps, and traceable fact IDs. |
| Size Oracle | Uses buyer-controlled fit memory plus category and SKU evidence to recommend safer size choices. |
| Galti Mat Dohrao | Surfaces one avoidable issue, such as fabric, color, fit, dispatch, or missing proof. |
| Offer Sach Check | Checks price history, campaign state, inventory pressure, and timer resets before checkout. |
| Checkout Confidence | Recommends COD or prepaid only when evidence supports it, then stores an expectation contract. |
| Outcome Learning | Kept, returned, exchanged, RTO, and correction flows improve future guidance safely. |
| Seller Evidence Loop | Sellers upload proofs, submit verification documents, create drafts, and track review state. |
| Admin Review | Reviewer approves, rejects, or requests revision for applications, documents, proofs, and drafts. |
| Auditability | Decisions carry tools used, fact IDs, timestamps, graph paths, and unsupported-claim blocking. |
| AI failover | Uses Amazon Bedrock Nova/Titan first, Gemini when configured as fallback, then deterministic behavior without mixing vector namespaces. |

## Agentic AI Layer

Sarthi uses agentic AI as tool orchestration, not blind automation.

| Capability | How it works |
| --- | --- |
| Buyer question routing | Detects compare, fit, fabric, seller, offer, checkout, and return intents. |
| Grounded retrieval | Pulls product, seller, SKU, proof, source-health, and graph context before answering. |
| Model assistance | Uses Bedrock Nova first for grounded language and Gemini only as a configured availability fallback. Safety stops never switch providers. |
| Evidence graph | Connects seller, SKU, returns, reviews, offer, proof, buyer-fit context, and final trust score. |
| Admin triage | Summarizes risk, SLA, buyer impact, source checks, and suggested reviewer route. |
| Fallback behavior | If Bedrock, Gemini, Vector Search, or Neo4j is unavailable, deterministic services keep the prototype usable. |

AI cannot approve sellers, publish listings, invent product facts, bypass verification gates, or expose buyer private fit memory to sellers.

## Evaluation Readiness

| Requirement | Where it is covered |
| --- | --- |
| Working prototype | Live demo, seeded accounts, API-backed buyer, seller, admin, checkout, review, and outcome flows. |
| Code quality and architecture | Split React frontend, Fastify API, service modules, tests, architecture docs, and runtime setup. |
| Usability and UX | Role-specific workspaces with a clear demo path, not a single mocked screen. |
| Completeness | Full loop from buyer comparison to seller proof, admin review, checkout guidance, and kept-order learning. |
| Project core | Problem, solution, agentic AI layer, and business impact are covered in this README and [docs/PRD.md](./docs/PRD.md). |
| Live deployment | Public demo link is at the top; judges can test workflows and model-assisted responses directly. |
| Code and setup | Local setup, environment, seed, run, and verification commands are listed below. |
| Open-source attribution | Main libraries, licenses, roles, and external services are documented in [docs/ATTRIBUTION.md](./docs/ATTRIBUTION.md). |

### Prerequisites

- Node.js 20+
- npm 10+
- MongoDB running locally, or a MongoDB Atlas connection string
- AWS CLI credentials or an AWS runtime role for Bedrock; a Gemini key is needed only for fallback
- Neo4j only if testing optional graph projection

### 1. Configure Environment

From the repository root:

```powershell
Copy-Item .env.example .env
```

For local development, this is enough if MongoDB is running on `127.0.0.1:27017`:

```env
NODE_ENV=development
PORT=8000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=sarthi
AUTH_SECRET=change-this-before-sharing
DEMO_CONTROLS_ENABLED=true
```

For Bedrock-first automation in `ap-south-1`:

```powershell
npm run setup:bedrock
```

The helper writes only non-secret model and region settings to `apps/api/.env`; it preserves any existing Gemini key. The SDK uses the normal AWS credential chain (`aws login` locally, an IAM role in production). Do not put AWS access keys in `.env`.

Key settings are:

```env
AI_PROVIDER_ORDER=bedrock,gemini
BEDROCK_ENABLED=true
AWS_REGION=ap-south-1
BEDROCK_TEXT_MODELS=apac.amazon.nova-micro-v1:0,apac.amazon.nova-lite-v1:0
BEDROCK_VISION_MODELS=apac.amazon.nova-lite-v1:0
BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_EMBEDDING_DIMENSIONS=512
```

Gemini remains the automatic fallback when configured:

```env
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=<your-gemini-key>
```

On Windows, this helper writes the key to `apps/api/.env`, which is one of the exact paths the API reads:

```powershell
npm run setup:gemini
```

Restart the API after configuration. `/system/readiness` reports `runtime_integrations.ai`, retains the legacy `runtime_integrations.gemini` object, and never returns credentials.

The smoke command is inert unless `--live` is supplied. The live form makes one bounded text probe (which may try the secondary text model), one bounded vision probe, and one embedding probe:

```powershell
npm run ai:smoke
npm run ai:smoke -- --live
npm run ai:smoke -- --live --capability=vision
```

AWS Free Tier is credit-based rather than unlimited inference. The code limits output tokens, request duration, retries, image size, and the number of documents embedded per query, but you should still configure an AWS Budget alert for your account.

Atlas vector indexes are provider-specific. The command defaults to the first configured provider; select one explicitly when needed:

```powershell
npm --prefix apps/api run vector:index -- --provider=bedrock
npm --prefix apps/api run vector:index -- --provider=gemini
```

For optional graph and vector retrieval:

```env
NEO4J_ENABLED=true
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<password>

VECTOR_SEARCH_ENABLED=true
BEDROCK_VECTOR_SEARCH_COLLECTION=evidence_embeddings_bedrock
BEDROCK_VECTOR_SEARCH_INDEX=sarthi_evidence_vector_bedrock_512
VECTOR_SEARCH_COLLECTION=evidence_embeddings
VECTOR_SEARCH_INDEX=sarthi_evidence_vector
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
```

Local/community MongoDB cannot create Atlas Search indexes. When `VECTOR_SEARCH_ENABLED=true` on local MongoDB, Sarthi uses API-side cosine similarity. On Atlas it uses provider-specific indexes. Titan 512-dimensional vectors and Gemini 768-dimensional vectors are stored separately and never compared.

### 2. Start Backend

```powershell
cd apps\api
npm install
npm run seed
npm run dev
```

The backend runs on:

```text
http://127.0.0.1:8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

### 3. Start Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

The frontend proxies API requests to `http://127.0.0.1:8000`.

## Demo Accounts

| Role | Username | Password |
| --- | --- | --- |
| Buyer | `asha.buyer` | `buyer-asha-pass` |
| Seller | `seller.a` | `seller-a-pass` |
| Admin reviewer | `reviewer.admin` | `admin-reviewer-pass` |

## Recommended Demo Path

1. Sign in as `asha.buyer`.
2. Open the Shop feed and run a Safety Check on a Sarthi-eligible product.
3. Open proof details and inspect the Evidence Graph.
4. Open product detail to show SKU Trust Passport, Size Oracle, and Galti Mat Dohrao.
5. Continue to checkout and show Offer Sach Check plus COD/prepaid guidance.
6. Sign in as `seller.a` and show proof tasks, evidence coach, documents, and listing drafts.
7. Sign in as `reviewer.admin` and show Review Desk, AI Triage, Risk & Policy, Work Saved, and reviewer actions.

For a timed voiceover, use [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md).

## Architecture

<p align="center">
  <img src="./docs/assets/sarthi-architecture.png" alt="Sarthi architecture across user roles, React web app, Fastify API, trust core, optional AI retrieval, audit trail, and MongoDB Atlas" width="100%" />
</p>

Sarthi separates the user-facing React app from the Fastify API, role validation, trust core, evidence graph, deterministic decision engine, optional AI retrieval, and MongoDB/Atlas source of truth. AI assists retrieval and explanation; the deterministic trust layer and human review gate remain responsible for decisions.

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, Lucide icons |
| Backend | Node.js, Fastify, TypeScript |
| Database | MongoDB local or MongoDB Atlas |
| AI | Optional Gemini grounded generation and embeddings |
| Retrieval | Optional Atlas Vector Search or local cosine fallback |
| Graph | Optional Neo4j projection with MongoDB-backed fallback |
| Tests | Node test runner and Playwright E2E |

## Run Locally

### Prerequisites

- Node.js 20+
- npm 10+
- MongoDB local or MongoDB Atlas
- Optional: Gemini API key
- Optional: Neo4j

### 1. Clone and install

```powershell
git clone https://github.com/kanikaa-3018/Sarthi.git
cd Sarthi
npm --prefix apps/api install
npm --prefix frontend install
```

### 2. Configure the API

```powershell
Copy-Item .env.example apps\api\.env
```

For a local MongoDB demo, these values are enough:

```env
PORT=8000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=sarthi
DEMO_CONTROLS_ENABLED=true
```

Optional Gemini:

```env
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=<your-key>
```

### 3. Seed and start the backend

```powershell
npm --prefix apps/api run seed
npm run dev:api
```

Backend health:

```text
http://127.0.0.1:8000/health
```

### 4. Start the frontend

```powershell
npm run dev:frontend
```

Open:

```text
http://localhost:5173
```

The frontend proxies `/api` requests to the Fastify server on port `8000`.

## Verification

```powershell
npm run build:test
npm run e2e
npm run gemini:smoke
```

Individual checks:

```powershell
npm --prefix apps/api run build
npm --prefix apps/api run test
npm --prefix frontend run build
```

## Repository Map

```text
Sarthi/
  apps/api/        Fastify API, services, routes, seed data, tests
  frontend/        React app for buyer, seller, admin, checkout, trust UI
  docs/            Product, architecture, privacy, demo, and judge notes
  scripts/         Local setup helpers
  .env.example     Runtime configuration template
```

General checks:

```powershell
git diff --check
```

## Security And Privacy

- Do not commit `.env`, API keys, MongoDB credentials, seller documents, or real buyer/seller data.
- Buyer personal fit memory is not exposed to sellers or admin reviewers.
- Seller evidence console shows aggregate marketplace evidence and seller-owned proof tasks only.
- Admin review controls are role-gated and separate from buyer/seller routes.
- Bedrock, Gemini, Vector Search, and Neo4j are optional; deterministic fallback paths remain available.
- Audit traces expose facts, tools, timestamps, and blocked unsupported claims, not chain-of-thought.
- Production launch requires official marketplace connectors, managed auth, secure object storage, observability, and reviewer operations controls.

## Product Readiness

Sarthi is a prototype built to demonstrate a complete commerce trust loop. The current seed data is deterministic demo data, not live marketplace data.

Ready for prototype evaluation:

- end-to-end buyer, seller, and admin journeys;
- API-backed role separation;
- reviewable evidence and audit trails;
- seller proof and admin verification workflow;
- Bedrock-first AI with Gemini and deterministic fallbacks;
- setup, demo, and judge-facing documentation.

Still required for production:

- official catalog, order, return, inventory, campaign, seller KYC, and review connectors;
- secure media/document storage;
- managed identity, OTP, account recovery, and session risk controls;
- migration system beyond seeded reset;
- operational reviewer tooling, retention policies, and observability;
- accessibility and real-device QA.

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/PRD.md](./docs/PRD.md) | Product scope, users, modules, requirements, success metrics. |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Runtime architecture, routes, data model, AI boundaries. |
| [docs/TRUST_DATA_AND_PRIVACY.md](./docs/TRUST_DATA_AND_PRIVACY.md) | Evidence model, trust states, privacy and edge cases. |
| [docs/JUDGE_REVIEW_GUIDE.md](./docs/JUDGE_REVIEW_GUIDE.md) | Review path, accounts, checks, and rubric mapping. |
| [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) | Presentation flow for a recorded demo. |
| [docs/PRODUCT_READINESS.md](./docs/PRODUCT_READINESS.md) | What works today and what production still needs. |
| [docs/ATTRIBUTION.md](./docs/ATTRIBUTION.md) | Main packages, versions, licenses, roles, and external services. |

<details>
  <summary><strong>Prototype disclosure</strong></summary>

This project uses deterministic seeded commerce data for evaluation. It is suitable for testing the product logic, role-based workflows, auditability, and UI flow. It is not connected to live marketplace orders, payments, KYC, logistics, or production document storage.

Production use would require official marketplace connectors, managed identity, secure media storage, reviewer operations, observability, retention policy, rate limits, accessibility QA, and AI governance.

</details>

## Security And Privacy Boundaries

- Buyer private fit memory is buyer-only.
- Sellers see aggregate evidence and owned listing tasks, not private buyer memory.
- Admin reviewers see seller applications, documents, proofs, drafts, risk, source health, and audit context.
- AI output is grounded in retrieved facts and falls back deterministically.
- Secrets belong in `.env`; do not commit API keys, database credentials, documents, or real user data.

## License

No open-source license has been published yet. Add a `LICENSE` file before accepting external production contributions.
