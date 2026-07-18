import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(here, "../../.env"),
  resolve(here, "../../../../.env")
]) {
  config({ path, override: false });
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongoDbName: process.env.MONGODB_DB ?? "sarthi",
  authSecret: process.env.AUTH_SECRET ?? "dev-only-change-me",
  seedOnStart: process.env.SEED_ON_START === "true",
  demoControlsEnabled: process.env.DEMO_CONTROLS_ENABLED !== "false",
  externalServiceTimeoutMs: Number(process.env.EXTERNAL_SERVICE_TIMEOUT_MS ?? 3500),
  llmProvider: process.env.LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "disabled"),
  llmModel: process.env.LLM_MODEL ?? "gemini-flash-lite-latest",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "gemini-embedding-001",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 768),
  neo4jEnabled: process.env.NEO4J_ENABLED === "true",
  neo4jUri: process.env.NEO4J_URI ?? "",
  neo4jUsername: process.env.NEO4J_USERNAME ?? "",
  neo4jPassword: process.env.NEO4J_PASSWORD ?? "",
  vectorSearchEnabled: process.env.VECTOR_SEARCH_ENABLED === "true",
  vectorSearchCollection: process.env.VECTOR_SEARCH_COLLECTION ?? "evidence_embeddings",
  vectorSearchIndex: process.env.VECTOR_SEARCH_INDEX ?? "sarthi_evidence_vector"
};

export function isProduction() {
  return env.nodeEnv === "production";
}
