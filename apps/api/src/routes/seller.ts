import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { z } from "zod";
import { requireRole } from "../middleware/auth.js";
import {
  correctSellerMeasurement,
  createListingDraft,
  listSellers,
  sellerEvidenceCoach,
  sellerOnboarding,
  sellerPanel,
  submitListingDraft,
  submitSellerDocument,
  submitSellerEvidence,
  updateListingDraft
} from "../services/sellerOperations.js";

const proofAttributeSchema = z.enum(["transparency", "fabric", "color", "size", "packaging", "offer"]);
const proofTypeSchema = z.enum(["daylight_photo", "fabric_closeup", "measurement_chart", "packaging_photo", "seller_note"]);

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
      attribute: proofAttributeSchema,
      proof_type: proofTypeSchema,
      title: z.string().trim().min(8).max(90),
      description: z.string().trim().min(24).max(600),
      asset_url: z.string().trim().min(3).max(2_750_000)
    }).parse(request.body);
    return submitSellerEvidence(db, account.seller_id, body);
  });

  app.get("/seller/me/onboarding", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return sellerOnboarding(db, account.seller_id);
  });

  app.post("/seller/me/verification/documents", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    const body = z.object({
      document_type: z.enum(["gst_certificate", "pan_card", "address_proof", "bank_proof"]),
      reference: z.string().min(2),
      file_name: z.string().min(1),
      mime_type: z.string().min(1),
      content_base64: z.string().min(1)
    }).parse(request.body);
    return submitSellerDocument(db, account.seller_id, body);
  });

  app.post("/seller/me/listing-drafts", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    const body = z.object({
      title: z.string().min(3),
      category: z.string().min(2),
      garment_type: z.string().min(2),
      fabric: z.string().min(2),
      color_family: z.string().min(2),
      base_price: z.number().positive(),
      image_url: z.string().min(1)
    }).parse(request.body);
    return createListingDraft(db, account.seller_id, body);
  });

  app.patch("/seller/me/listing-drafts/:draft_id", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    const body = z.object({
      title: z.string().min(3).optional(),
      category: z.string().min(2).optional(),
      garment_type: z.string().min(2).optional(),
      fabric: z.string().min(2).optional(),
      color_family: z.string().min(2).optional(),
      base_price: z.number().positive().optional(),
      image_url: z.string().min(1).optional()
    }).parse(request.body);
    return updateListingDraft(db, account.seller_id, (request.params as any).draft_id, body);
  });

  app.post("/seller/me/listing-drafts/:draft_id/submit", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    return submitListingDraft(db, account.seller_id, (request.params as any).draft_id);
  });

  app.post("/seller/listings/:product_id/correct-measurement", async (request, reply) => {
    const account = await requireRole(db, request, reply, "seller");
    const productId = (request.params as any).product_id;
    const body = z.object({
      l_chest: z.number().positive(),
      xl_chest: z.number().positive()
    }).parse(request.body);
    return correctSellerMeasurement(db, account.seller_id, productId, body);
  });
}
