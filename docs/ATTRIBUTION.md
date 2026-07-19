# Attribution

This file lists the main open-source packages used by the current Sarthi prototype. Versions are taken from `frontend/package.json`, `frontend/package-lock.json`, `apps/api/package.json`, and `apps/api/package-lock.json`.

## Frontend

| Package | Version range | License | Role |
| --- | --- | --- | --- |
| React | `^19.0.0` | MIT | UI component framework. |
| React DOM | `^19.0.0` | MIT | Browser rendering for React. |
| React Router DOM | `^7.18.1` | MIT | Client-side routing and role workspaces. |
| Vite | `^6.0.5` | MIT | Frontend dev server and production build. |
| `@vitejs/plugin-react` | `^4.3.4` | MIT | React integration for Vite. |
| TypeScript | `^5.7.2` | Apache-2.0 | Static typing and frontend build checks. |
| Lucide React | `^0.468.0` | ISC | Icon set used across buyer, seller, admin, and checkout UI. |

## Backend

| Package | Version range | License | Role |
| --- | --- | --- | --- |
| Fastify | `^5.2.1` | MIT | Node.js HTTP API framework. |
| `@fastify/cors` | `^11.0.0` | MIT | CORS support for local frontend/API development. |
| MongoDB Node.js Driver | `^6.12.0` | Apache-2.0 | MongoDB/MongoDB Atlas database access. |
| Neo4j JavaScript Driver | `^5.28.3` | Apache-2.0 | Optional Neo4j graph projection runtime. |
| Zod | `^3.24.1` | MIT | Runtime data validation patterns. |
| dotenv | `^16.4.7` | BSD-2-Clause | Environment variable loading. |
| tsx | `^4.19.2` | MIT | TypeScript execution for dev, seed, and tests. |
| TypeScript | `^5.7.2` | Apache-2.0 | Backend type checking and build. |
| `@types/node` | `^22.10.5` | MIT | Node.js TypeScript declarations. |

## External Services

| Service | Status | Use |
| --- | --- | --- |
| Gemini API | Optional | Grounded answer generation, confidence phrasing, and embeddings when configured. |
| MongoDB Atlas Vector Search | Optional | Semantic retrieval over evidence embeddings when configured. |
| Neo4j | Optional | Graph projection for explainable relationship paths when configured. |

## Assets And Data

- Product and commerce records in the prototype are deterministic seed/demo data.
- Seller documents and proof assets in the prototype are metadata records, not real uploaded production files.
- UI copy, product framing, trust states, and documentation were created for this project.
- No real buyer private data, seller KYC files, payment credentials, or marketplace production records should be committed.

## Final Release Checklist

Before a public production release:

- run `npm install` in both `apps/api` and `frontend` from a clean machine;
- refresh this file from lock files if dependency versions change;
- add a repository `LICENSE` file if the project will accept external contributions;
- verify licenses with the final dependency tree and any deployment platform requirements.
