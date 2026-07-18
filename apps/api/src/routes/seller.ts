import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { z } from "zod";
import { requireRole } from "../middleware/auth.js";
import {
  assertSellerOwnsProduct,
  createListingDraft,
  listSellers,
  sellerEvidenceCoach,
  sellerOnboarding,
  sellerPanel,
  submitListingDraft,
  submitSellerDocument,
  submitSellerEvidence
} from "../services/sellerOperations.js";

export async function registerSellerRoutes(app: FastifyInstance, db: Db) {
  app.get("/sellers", async (request, reply) => {
    await requireRole(db, request, reply, "seller");
    return { sellers: await listSellers(db) };
  });

  app.get("/seller/me/panel", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return sellerPanel(db, account.seller_id, (request.query as any).cluster_id);
  });

  app.get("/sellers/:seller_id/panel", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    const sellerId = (request.params as any).seller_id;
    if (account.seller_id !== sellerId) {
      return reply.code(403).send({ detail: "Seller cannot access another seller panel" });
    }
    return sellerPanel(db, sellerId, (request.query as any).cluster_id);
  });

  app.get("/seller/me/evidence-coach", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return sellerEvidenceCoach(db, account.seller_id);
  });

  app.post("/seller/me/evidence-assets", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    const body = z.object({
      product_id: z.string(),
      attribute: z.string(),
      proof_type: z.string(),
      title: z.string().min(1),
      description: z.string().min(1),
      asset_url: z.string().min(1)
    }).parse(request.body);
    return submitSellerEvidence(db, account.seller_id, body);
  });

  app.get("/seller/me/onboarding", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return sellerOnboarding(db, account.seller_id);
  });

  app.post("/seller/me/verification/documents", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return submitSellerDocument(db, account.seller_id, request.body);
  });

  app.post("/seller/me/listing-drafts", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return createListingDraft(db, account.seller_id, request.body);
  });

  app.post("/seller/me/listing-drafts/:draft_id/submit", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return submitListingDraft(db, account.seller_id, (request.params as any).draft_id);
  });

  app.post("/seller/listings/:product_id/correct-measurement", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    await assertSellerOwnsProduct(db, account.seller_id, (request.params as any).product_id);
    return { ok: true, status: "pending_evidence_review" };
  });
}
