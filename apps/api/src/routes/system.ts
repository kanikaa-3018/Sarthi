import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { env, isProduction } from "../config/env.js";
import { resetMongoSeed } from "../data/seed.js";
import { requireAccount } from "../middleware/auth.js";
import { defaultScenarios } from "../services/scenarios.js";
import { sourceHealth } from "../services/domain.js";
import { aiRuntimeStatus } from "../services/ai.js";
import { neo4jHealth } from "../services/neo4jGraph.js";
import { vectorSearchHealth } from "../services/vectorSearch.js";

export async function registerSystemRoutes(app: FastifyInstance, db: Db) {
  app.get("/health", async () => ({
    ok: true,
    backend: "node",
    database: "mongodb_atlas",
    db: env.mongoDbName
  }));

  app.get("/system/readiness", async () => {
    const [health, neo4j, vector] = await Promise.all([
      sourceHealth(db),
      neo4jHealth(),
      vectorSearchHealth(db)
    ]);
    const ai = aiRuntimeStatus();
    return {
      app_env: env.nodeEnv,
      data_mode: "mongodb_atlas",
      user_disclosure: "This build uses MongoDB Atlas-ready evidence documents and seeded demo records until official connectors are attached.",
      source_health: health,
      runtime_integrations: {
        ai,
        bedrock: ai.bedrock,
        gemini: ai.gemini,
        neo4j,
        atlas_vector_search: vector
      },
      implemented_controls: [
        "role separated auth",
        "MongoDB evidence store",
        "Neo4j evidence graph projection when configured",
        "Atlas Vector Search semantic retrieval when configured",
        "Bedrock-first grounded answers, confidence scoring, and visual checks with Gemini fallback",
        "buyer fit profile guardrails",
        "weighted confidence scoring",
        "reviewer credibility weighting",
        "wishlist trust radar",
        "cart bracketing prevention",
        "checkout confidence nudge",
        "seller proof loop",
        "audit traces"
      ],
      production_connectors: [
        { name: "Catalog", prototype_source: "MongoDB seed", production_source: "Catalog service", status: "adapter_required" },
        { name: "Orders and returns", prototype_source: "MongoDB seed", production_source: "Order/returns service", status: "adapter_required" },
        { name: "Buyer review risk", prototype_source: "MongoDB seed", production_source: "UGC/user risk service", status: "adapter_required" },
        { name: "Seller verification", prototype_source: "MongoDB seed", production_source: "KYC/GST registry", status: "adapter_required" },
        { name: "Payment offers", prototype_source: "MongoDB seed", production_source: "Checkout/payment offers service", status: "adapter_required" }
      ],
      production_blockers: ["official connectors", "managed auth/OTP", "secure object storage", "reviewer operations"],
      can_compete_without_blockers: false
    };
  });

  app.post("/seed/reset", async (_request, reply) => {
    if (!env.demoControlsEnabled || isProduction()) {
      return reply.code(403).send({ detail: "Seed reset disabled" });
    }
    return { ok: true, counts: await resetMongoSeed(db) };
  });

  app.get("/scenarios", async () => ({ scenarios: defaultScenarios() }));

  app.post("/scenarios/:scenario_id/activate", async (request) => ({
    scenario: defaultScenarios().find((item) => item.scenario_id === (request.params as any).scenario_id) ?? defaultScenarios()[0]
  }));

  app.get("/data-sources", async (request, reply) => {
    const account = await requireAccount(db, request, reply);
    return { account_role: account.role, health: await sourceHealth(db) };
  });

}
