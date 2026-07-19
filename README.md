# Sarthi
### Buy the product you will actually keep.

Sarthi is an AI-assisted trust layer for online commerce. It helps a buyer decide which similar listing, seller, size, offer, and payment mode is safest before checkout, while giving sellers a clear evidence loop and giving admin reviewers a structured queue for verification and listing approval.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=fff)
![Fastify](https://img.shields.io/badge/Fastify-5-111111?logo=fastify&logoColor=fff)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=fff)
![Bedrock](https://img.shields.io/badge/Amazon_Bedrock-primary-FF9900)
![Gemini](https://img.shields.io/badge/Gemini-fallback-8E75B2)
![Neo4j](https://img.shields.io/badge/Neo4j-optional-4581C3?logo=neo4j&logoColor=fff)

---

## Contents

- [Why Sarthi](#why-sarthi)
- [Product Modules](#product-modules)
- [What Is Working](#what-is-working)
- [Prototype Evaluation Readiness](#prototype-evaluation-readiness)
- [Architecture](#architecture)
- [Agentic AI Layer](#agentic-ai-layer)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Run Locally](#run-locally)
- [Seeded Demo Accounts](#seeded-demo-accounts)
- [Demo Walkthrough](#demo-walkthrough)
- [Verification](#verification)
- [Security And Privacy](#security-and-privacy)
- [Product Readiness](#product-readiness)
- [Documentation](#documentation)

---

## Why Sarthi

Commerce discovery has too many near-identical products. A buyer often has to guess between listings that differ only by seller, size consistency, return history, photos, offer timers, or COD risk. That guess creates preventable returns, buyer frustration, and seller support load.

Sarthi turns scattered marketplace signals into one practical loop:

```text
compare -> explain -> checkout safely -> learn from outcome -> improve evidence
```

- **Compare:** resolve duplicate listings by seller, variant, evidence strength, and buyer fit memory.
- **Explain:** show the trust receipt, proof trail, source freshness, and the one avoidable issue to check.
- **Checkout safely:** verify offer urgency and recommend prepaid/COD only when evidence supports it.
- **Learn:** capture kept/returned outcomes so future size and quality guidance improves.
- **Improve evidence:** route seller uploads and listing drafts through admin review before they affect buyer trust.

## Product Modules

| Module | What it does | Why it matters |
| --- | --- | --- |
| Buyer feed | Shows marketplace-style products, categories, trust states, and comparison entry points. | Judges can browse the product like a real shopping surface, not a static demo. |
| Confusion Resolver | Compares near-duplicate listings and recommends one safer option plus an alternative. | Buyers usually need help choosing between similar sellers, not generic product search. |
| SKU Trust Passport | Shows delivered count, return count, top issue, evidence strength, seller verification, and source freshness. | Trust claims stay inspectable and grounded in denominators. |
| Size Oracle | Uses buyer fit memory, variant evidence, and category-specific history to suggest size. | Reduces avoidable fashion returns without using cross-category guesswork. |
| Galti Mat Dohrao | Surfaces one specific avoidable issue such as fabric, color, or size mismatch. | Gives the buyer one action, not a wall of warnings. |
| Offer Sach Check | Checks price history, campaign state, inventory, and timer facts before checkout. | Prevents panic buying without accusing sellers. |
| Sarthi Samvaad | Text-first assistant for fit, fabric, seller choice, comparison, and offer questions. | Agentic layer routes the question to tools and returns a grounded answer. |
| Buyer Trust Center | Shows privacy controls, fit memory, system readiness, and proof history. | Buyer trust needs visible controls, not hidden settings. |
| Seller Evidence Console | Shows sellers what evidence is missing, which proof requests need action, and how drafts are progressing. | Sellers get actionable tasks without seeing buyer private memory. |
| Admin Review Panel | Groups seller applications, proof uploads, document hashes, listing drafts, policy checks, and audit events. | Reviewer work is structured, human-in-loop, and separated from buyer/seller accounts. |
| Audit Drawer | Shows tools used, fact IDs, timestamps, and blocked unsupported claims. | Judges and support reviewers can inspect why Sarthi made a recommendation. |

## What Is Working

- Role-based buyer, seller, and admin login.
- Database-backed buyer signup.
- Pending seller application flow that does not grant verified trust automatically.
- Buyer feed, product detail, comparison, checkout, trust center, and outcome learning.
- Seller verification documents, proof assets, listing drafts, and readiness states.
- Admin approval/rejection for seller applications, documents, proof assets, and listing drafts.
- Approved listing drafts can publish into the buyer feed only after seller verification.
- MongoDB-backed evidence documents and audit traces.
- Bedrock-first grounded answers, confidence assignment, seller coaching, and visual similarity with Gemini fallback.
- Provider-isolated MongoDB Atlas Vector Search over Titan or Gemini embeddings.
- Optional Neo4j graph projection for relationship paths.
- Deterministic fallback behavior when Bedrock, Gemini, Vector Search, or Neo4j is unavailable.
- Backend RBAC test coverage for buyer, seller, and admin trust boundaries.

## Prototype Evaluation Readiness

The judging rubric shared for the prototype has four practical expectations. Sarthi maps to them as follows:

| Evaluation area | Sarthi readiness |
| --- | --- |
| Working Prototype | Core buyer, seller, and admin flows are implemented against the Node API and MongoDB seed data. The demo can be run locally, tested with seeded accounts, and inspected through real API calls. |
| Code Quality & Architecture | The app is split into a React/Vite frontend, Fastify API, route modules, service modules, typed contracts, and focused tests. Documentation is organized under `docs/` with product, architecture, privacy, demo, and judge review notes. |
| Usability & User Experience | Each role has a separate workspace: buyer for shopping decisions, seller for evidence tasks, and admin for review decisions. The UX avoids exposing raw internal scoring when a simpler next step is enough. |
| Completeness | The connected flow covers browsing, comparison, product proof, checkout confidence, outcome learning, seller uploads, admin review, audit events, and controlled publishing. It is not only a single-screen showcase. |

## Architecture

The current active implementation is Node.js, Fastify, MongoDB, and React. Backend work lives in `apps/api`.

```text
React + Vite frontend
  -> role-based app shell
  -> buyer, seller, admin, trust, checkout, and audit screens
  -> /api client

Fastify API
  -> auth and RBAC middleware
  -> buyer routes
  -> seller routes
  -> admin review routes
  -> decision and checkout routes
  -> system readiness routes

MongoDB / MongoDB Atlas
  -> users, sessions, sellers, products, variants
  -> seller applications and verification documents
  -> proof assets and listing drafts
  -> trust evidence, source health, outcomes, traces

Optional intelligence layers
  -> Amazon Bedrock Nova grounded answers, confidence assignment, and visual checks
  -> Gemini generation fallback
  -> Titan embeddings, then Gemini embeddings, for evidence retrieval
  -> MongoDB Atlas Vector Search
  -> Neo4j evidence graph projection
```

### Service Boundaries

| Area | Implementation | Role |
| --- | --- | --- |
| Frontend | React 19, Vite, TypeScript | Buyer, seller, admin, checkout, trust center, and audit UI. |
| API | Fastify, TypeScript, Zod-style validation patterns | Auth, RBAC, product decisions, seller onboarding, admin review, system readiness. |
| Operational data | MongoDB / MongoDB Atlas | Source of truth for prototype evidence and review state. |
| Agent answers | Amazon Bedrock Nova, with Gemini fallback | Produces short grounded answers under strict schemas and token limits. |
| Semantic retrieval | Titan/Gemini embeddings + Atlas Vector Search, optional | Retrieves evidence snippets without mixing model vector spaces. |
| Graph reasoning | Neo4j, optional | Projects product, seller, buyer outcome, and evidence relationships for explainability. |

If optional integrations are disabled, Sarthi still runs through MongoDB-backed deterministic services and lexical fallback retrieval.

## Agentic AI Layer

Sarthi uses AI where it reduces manual decision work, not where deterministic rules are safer.

- **Buyer agent:** detects intent for compare, fit, fabric, seller choice, offer urgency, and checkout confidence.
- **Grounding layer:** retrieves product evidence and source-health context before answering.
- **AI failover:** when enabled, Bedrock Nova runs first; eligible availability or contract failures fall through to Gemini, then deterministic behavior. Safety stops do not switch providers.
- **Validation layer:** unsupported claims are blocked from buyer-facing answers and exposed in audit traces.
- **Seller assist:** seller-facing evidence tasks explain what proof or listing correction would improve buyer trust.
- **Admin assist:** reviewer queues group seller applications, proof uploads, document evidence, and listing drafts so humans decide only the cases that need review.

The product rule is simple: AI can summarize, route, and explain; it cannot invent facts, bypass verification, or publish seller claims without review.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, React Router, Lucide icons |
| Backend | Node.js, Fastify, TypeScript |
| Database | MongoDB local or MongoDB Atlas |
| Optional graph | Neo4j |
| Optional AI | Amazon Bedrock Nova/Titan with Gemini fallback |
| Optional retrieval | MongoDB Atlas Vector Search |
| Tests | Node test runner with TypeScript execution |

## Repository Layout

```text
Sarthi/
  apps/api/               Active Node.js + Fastify backend
  frontend/               React + Vite buyer, seller, admin UI
  docs/                   Product, architecture, judge, privacy, and demo docs
  scripts/                Local helper scripts
  .env.example            Backend runtime configuration template
  docker-compose.yml      Local service helper
  README.md               Project entry point
```

## Run Locally

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

## Seeded Demo Accounts

| Role | Username | Password |
| --- | --- | --- |
| Buyer | `asha.buyer` | `buyer-asha-pass` |
| Seller | `seller.a` | `seller-a-pass` |
| Admin reviewer | `reviewer.admin` | `admin-reviewer-pass` |

## Demo Walkthrough

1. Sign in as `asha.buyer`.
2. Browse the product feed and open a similar-listing comparison.
3. Inspect the recommended listing, alternative listing, trust state, and proof trail.
4. Ask Sarthi a fit, fabric, seller, or offer question.
5. Open product detail and inspect Size Oracle, Galti Mat Dohrao, Trust Receipt, and Audit Drawer.
6. Continue to checkout and review Offer Sach Check before choosing payment mode.
7. Simulate kept or returned outcome.
8. Sign in as `seller.a` and inspect seller evidence tasks, proof uploads, and listing drafts.
9. Sign in as `reviewer.admin` and process seller applications, documents, proof assets, and submitted drafts.
10. Reopen buyer flow to confirm approved listings and trust states stay controlled by evidence.

For a timed flow, see [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md).

## Verification

Full local verification from the repository root:

```powershell
npm run build:test
npm run e2e
```

Backend:

```powershell
cd apps\api
npm run build
npm run test
```

Frontend:

```powershell
cd frontend
npm run build
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
| [docs/README.md](./docs/README.md) | Entry point for public docs. |
| [docs/PRD.md](./docs/PRD.md) | Product scope, users, modules, requirements, and success metrics. |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Current React/Fastify/MongoDB architecture and optional AI integrations. |
| [docs/TRUST_DATA_AND_PRIVACY.md](./docs/TRUST_DATA_AND_PRIVACY.md) | Evidence model, trust states, privacy boundaries, and edge cases. |
| [docs/JUDGE_REVIEW_GUIDE.md](./docs/JUDGE_REVIEW_GUIDE.md) | Local setup, demo accounts, review path, and rubric mapping. |
| [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) | Seven-minute buyer, seller, and admin presentation flow. |
| [docs/PRODUCT_READINESS.md](./docs/PRODUCT_READINESS.md) | What works today, what is prototype-only, and what production still needs. |
| [docs/ATTRIBUTION.md](./docs/ATTRIBUTION.md) | Open-source package attribution. |

## License

No open-source license has been published yet. Add a `LICENSE` file before accepting external production contributions.
