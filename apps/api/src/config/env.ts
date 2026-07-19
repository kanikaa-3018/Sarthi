import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AiProvider } from "../services/aiTypes.js";

const here = dirname(fileURLToPath(import.meta.url));
for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(here, "../../.env"),
  resolve(here, "../../../../.env")
]) {
  config({ path, override: false });
}

type EnvironmentSource = Record<string, string | undefined>;

export function parseAiConfig(source: EnvironmentSource) {
  const explicitOrder = source.AI_PROVIDER_ORDER;
  const providerOrder = explicitOrder === undefined
    ? legacyProviderOrder(source.LLM_PROVIDER)
    : providerList(explicitOrder);
  const geminiEmbeddingDimensions = positiveInteger(source.EMBEDDING_DIMENSIONS, 768);

  return {
    providerOrder,
    bedrockEnabled: source.BEDROCK_ENABLED === "true",
    awsRegion: source.AWS_REGION ?? source.AWS_DEFAULT_REGION ?? "ap-south-1",
    bedrockTextModels: valueList(source.BEDROCK_TEXT_MODELS, [
      "apac.amazon.nova-micro-v1:0",
      "apac.amazon.nova-lite-v1:0"
    ]),
    bedrockVisionModels: valueList(source.BEDROCK_VISION_MODELS, ["apac.amazon.nova-lite-v1:0"]),
    bedrockEmbeddingModel: source.BEDROCK_EMBEDDING_MODEL ?? "amazon.titan-embed-text-v2:0",
    bedrockEmbeddingDimensions: positiveInteger(source.BEDROCK_EMBEDDING_DIMENSIONS, 512),
    bedrockVectorSearchCollection: source.BEDROCK_VECTOR_SEARCH_COLLECTION ?? "evidence_embeddings_bedrock",
    bedrockVectorSearchIndex: source.BEDROCK_VECTOR_SEARCH_INDEX ?? "sarthi_evidence_vector_bedrock_512",
    geminiModel: source.LLM_MODEL ?? "gemini-3.1-flash-lite",
    geminiApiKey: source.GEMINI_API_KEY ?? "",
    geminiEmbeddingModel: source.EMBEDDING_MODEL ?? "gemini-embedding-001",
    geminiEmbeddingDimensions
  };
}

function legacyProviderOrder(value: string | undefined): AiProvider[] {
  if (value === undefined) return ["bedrock", "gemini"];
  if (value === "disabled") return [];
  return providerList(value);
}

function providerList(value: string) {
  return valueList(value, [])
    .filter((provider): provider is AiProvider => provider === "bedrock" || provider === "gemini");
}

function valueList(value: string | undefined, fallback: string[]) {
  if (value === undefined) return fallback;
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const aiConfig = parseAiConfig(process.env);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongoDbName: process.env.MONGODB_DB ?? "sarthi",
  authSecret: process.env.AUTH_SECRET ?? "dev-only-change-me",
  seedOnStart: process.env.SEED_ON_START === "true",
  demoControlsEnabled: process.env.DEMO_CONTROLS_ENABLED !== "false",
  externalServiceTimeoutMs: Number(process.env.EXTERNAL_SERVICE_TIMEOUT_MS ?? 8000),
  ...aiConfig,
  llmProvider: process.env.LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "disabled"),
  llmModel: aiConfig.geminiModel,
  geminiApiKey: aiConfig.geminiApiKey,
  embeddingModel: aiConfig.geminiEmbeddingModel,
  embeddingDimensions: aiConfig.geminiEmbeddingDimensions,
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
