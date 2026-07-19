import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { requireRole } from "../middleware/auth.js";
import { generateGroundedAgentAnswer } from "../services/agent.js";
import {
  adminQueue,
  approveListingDraft,
  approveSellerApplication,
  approveSellerDocument,
  approveSellerEvidenceAsset,
  rejectSellerApplication,
  rejectSellerDocument,
  rejectSellerEvidenceAsset,
  requestListingRevision
} from "../services/adminOperations.js";
import { sourceHealth } from "../services/domain.js";
import { aiRuntimeStatus } from "../services/ai.js";

export async function registerAdminRoutes(app: FastifyInstance, db: Db) {
  app.get("/admin/review-queue", async (request, reply) => {
    await requireRole(db, request, reply, "admin");
    return adminQueue(db);
  });

  app.get("/admin/ai-health", async (request, reply) => {
    await requireRole(db, request, reply, "admin");
    const health = await sourceHealth(db);
    const ai = aiRuntimeStatus();
    return {
      ai,
      bedrock: ai.bedrock,
      gemini: ai.gemini,
      fallback: {
        enabled: true,
        active: !ai.available,
        reason: ai.available
          ? `${ai.primary_provider ?? "AI"} is configured for grounded reviewer assistance.`
          : ai.bedrock.last_error ?? ai.gemini.last_error ?? "No AI provider is configured; deterministic reviewer guidance is active."
      },
      source_health: {
        overall_status: health.overall_status,
        blocking: health.blocking,
        checked_sources: health.sources.length
      },
      contracts: [
        { task: "buyer_product_advice", schema: "title, summary, reasons[], caution", status: "covered" },
        { task: "knowledge_graph_chat", schema: "title, summary, reasons[], caution", status: "covered" },
        { task: "admin_prescreen", schema: "observe, reason, act, learn", status: "covered" },
        { task: "admin_automation", schema: "headline, summary, next_steps[], caution", status: "covered" }
      ]
    };
  });

  app.post("/admin/ai-health/test", async (request, reply) => {
    await requireRole(db, request, reply, "admin");
    const health = await sourceHealth(db);
    const answer = await generateGroundedAgentAnswer({
      task: "admin_automation",
      query: (request.body as any)?.query ?? "Run reviewer AI health smoke test.",
      context: {
        source_health: {
          overall_status: health.overall_status,
          blocking: health.blocking,
          checked_sources: health.sources.length
        },
        reviewer_policy: [
          "Do not approve or reject anything automatically.",
          "Surface blockers and next safe reviewer step.",
          "Use only provided evidence."
        ]
      },
      fallback: {
        title: "Reviewer AI smoke test",
        summary: "Fallback reviewer automation is available. A model provider is not required for safe queue ranking.",
        reasons: [
          "Source health can be inspected before a reviewer acts.",
          "Human approval remains required for seller, document, proof, and listing decisions."
        ],
        caution: health.blocking ? "One or more evidence sources are blocking automation." : null
      }
    });
    return {
      ok: true,
      provider: answer.source,
      answer,
      checked_at: new Date().toISOString(),
      required_shape: ["title", "summary", "reasons", "caution"]
    };
  });

  app.post("/admin/seller-applications/:application_id/approve", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return approveSellerApplication(
      db,
      account,
      (request.params as any).application_id,
      (request.body as any)?.notes ?? "Approved by admin."
    );
  });

  app.post("/admin/seller-applications/:application_id/reject", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return rejectSellerApplication(
      db,
      account,
      (request.params as any).application_id,
      (request.body as any)?.notes ?? "Rejected by admin."
    );
  });

  app.post("/admin/listing-drafts/:draft_id/approve", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return approveListingDraft(
      db,
      account,
      (request.params as any).draft_id,
      (request.body as any)?.notes ?? "Listing published as limited evidence."
    );
  });

  app.post("/admin/listing-drafts/:draft_id/revision", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return requestListingRevision(
      db,
      account,
      (request.params as any).draft_id,
      (request.body as any)?.notes ?? "Revision requested."
    );
  });

  app.post("/admin/verification-documents/:document_id/approve", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return approveSellerDocument(
      db,
      account,
      (request.params as any).document_id,
      (request.body as any)?.notes ?? "Document verified by admin."
    );
  });

  app.post("/admin/verification-documents/:document_id/reject", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return rejectSellerDocument(
      db,
      account,
      (request.params as any).document_id,
      (request.body as any)?.notes ?? "Document rejected by admin."
    );
  });

  app.post("/admin/evidence-assets/:proof_id/approve", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return approveSellerEvidenceAsset(
      db,
      account,
      (request.params as any).proof_id,
      (request.body as any)?.notes ?? "Seller proof verified by admin."
    );
  });

  app.post("/admin/evidence-assets/:proof_id/reject", async (request, reply) => {
    const account = await requireRole(db, request, reply, "admin");
    return rejectSellerEvidenceAsset(
      db,
      account,
      (request.params as any).proof_id,
      (request.body as any)?.notes ?? "Seller proof rejected by admin."
    );
  });
}
