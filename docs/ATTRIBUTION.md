# Open-Source Attribution

This file lists the main open-source packages used by Sarthi. Versions are taken from `frontend/package-lock.json`, `frontend/package.json`, and `backend/requirements.txt`; locally installed Python metadata was checked where available.

## Frontend

| Package | Version used locally | License | Role | Source |
| --- | ---: | --- | --- | --- |
| React | 19.2.7 | MIT | UI library | https://github.com/facebook/react |
| React DOM | 19.2.7 | MIT | Browser rendering | https://github.com/facebook/react |
| Vite | 6.4.3 | MIT | Frontend dev server and build tooling | https://github.com/vitejs/vite |
| TypeScript | 5.9.3 | Apache-2.0 | Static typing and frontend build checks | https://github.com/microsoft/TypeScript |
| `@vitejs/plugin-react` | 4.7.0 | MIT | React integration for Vite | https://github.com/vitejs/vite-plugin-react |
| `lucide-react` | 0.468.0 | ISC | UI icon set | https://github.com/lucide-icons/lucide |
| `@types/react` | 19.2.17 | MIT | TypeScript React types | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/react-dom` | 19.2.3 | MIT | TypeScript React DOM types | https://github.com/DefinitelyTyped/DefinitelyTyped |

## Backend

| Package | Project pin | Locally observed version | License | Role | Source |
| --- | ---: | ---: | --- | --- | --- |
| FastAPI | 0.115.6 | 0.135.1 | MIT | HTTP API framework | https://github.com/fastapi/fastapi |
| Uvicorn | 0.32.1 | 0.34.0 | BSD-3-Clause | ASGI server | https://github.com/encode/uvicorn |
| Pydantic | 2.10.4 | 2.12.5 | MIT | Request/response validation | https://github.com/pydantic/pydantic |
| Pytest | 8.3.4 | 8.4.1 | MIT | Backend test runner | https://github.com/pytest-dev/pytest |
| `python-dotenv` | 1.0.1 | 1.1.1 | BSD-3-Clause | Local environment variable loading | https://github.com/theskumar/python-dotenv |
| Neo4j Python Driver | 5.27.0 | Not installed in current global Python env | Apache-2.0, verify after install | Optional Neo4j graph connector | https://github.com/neo4j/neo4j-python-driver |

## Project-Owned Assets

| Asset | Ownership / Role |
| --- | --- |
| Synthetic catalog, buyer, seller, price, review, and outcome seed data | Project-created data for demonstration and tests. Not scraped from a marketplace. |
| Product placeholder SVGs in `frontend/public` | Project-created local visual placeholders. |
| Sarthi service, ranking, evidence, trust, admin, seller, auth, and UI code | Project implementation. |

## Submission Note

Before final public submission, run dependency installation in a clean environment and refresh this file from the generated lock files. The current backend tests ran in the host Python environment, which has newer FastAPI/Pydantic/Pytest versions than the pinned `backend/requirements.txt`.
