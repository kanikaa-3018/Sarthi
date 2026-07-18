import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { z } from "zod";
import { collections } from "../db/mongo.js";
import { assertBuyer, requireRole } from "../middleware/auth.js";
import {
  buyerFitProfileState,
  computeCartConfidence,
  createWishlistIntent,
  upsertBuyerFitProfile,
  wishlistRadar
} from "../services/decisionEngine.js";
import {
  avoidableIssue,
  computeKeepConfidence,
  conflicts,
  createTrace,
  facts,
  fitPrediction,
  graphPath,
  productWithSeller,
  publicProduct,
  reviewEvidence,
  skuPassport,
  trustState,
  variantEvidence,
  variantsForProduct
} from "../services/domain.js";
import { buyerDashboard, privacySummary } from "../services/buyerOperations.js";
import { withoutId } from "../services/format.js";

export async function registerBuyerRoutes(app: FastifyInstance, db: Db) {
  app.get("/feed", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const query: any = request.query;
    assertBuyer(account, query.buyer_id);
    const limit = Number(query.limit ?? 48);
    const offset = Number(query.offset ?? 0);
    const filter: any = {};
    if (query.category && query.category !== "All") filter.category = query.category;
    if (query.q) filter.$text = { $search: String(query.q) };
    const c = collections(db);
    const [total, products, sellers] = await Promise.all([
      c.products.countDocuments(filter),
      c.products.find(filter).skip(offset).limit(limit).toArray(),
      c.sellers.find({}).toArray()
    ]);
    const sellerMap = new Map(sellers.map((seller: any) => [seller.seller_id, seller]));
    return {
      buyer_id: query.buyer_id,
      products: products.map((product: any) => publicProduct({
        ...product,
        seller_name: sellerMap.get(product.seller_id)?.name,
        median_dispatch_hours: sellerMap.get(product.seller_id)?.median_dispatch_hours
      })),
      total,
      limit,
      offset,
      has_more: offset + products.length < total
    };
  });

  app.get("/products/:product_id", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.query as any).buyer_id;
    assertBuyer(account, buyerId);
    const product = await productWithSeller(db, (request.params as any).product_id);
    if (!product) return reply.code(404).send({ detail: "Product not found" });
    const variants = await variantsForProduct(db, product.product_id);
    const selected = variants.find((variant: any) => variant.size === "XL") ?? variants[0];
    const evidence = await variantEvidence(db, selected.variant_id);
    const fit = await fitPrediction(db, buyerId, selected.variant_id);
    const keepConfidence = await computeKeepConfidence(db, buyerId, selected.variant_id);
    const keepTrace = await createTrace(db, {
      buyer_id: buyerId,
      product_id: product.product_id,
      variant_id: selected.variant_id,
      intent: ["keep_confidence"],
      tools_used: ["variantEvidence", "fitPrediction", "trustState", "computeKeepConfidence"],
      fact_ids: keepConfidence.fact_ids,
      graph_paths: [keepConfidence.graph_path]
    });
    const tracePath = graphPath(selected.variant_id, evidence.fact_ids);
    return {
      buyer_id: buyerId,
      product,
      variants,
      selected_variant: selected,
      fit,
      evidence,
      avoidable_issue: await avoidableIssue(db, selected.variant_id),
      review_evidence: await reviewEvidence(db, product.product_id),
      conflicts: await conflicts(db, product, selected.variant_id),
      trust_state: await trustState(db, product, evidence),
      keep_confidence: { trace_id: keepTrace.trace_id, ...keepConfidence },
      graph_paths: [tracePath],
      privacy: await privacySummary(db, buyerId)
    };
  });

  app.get("/products/:product_id/keep-confidence", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.query as any).buyer_id;
    assertBuyer(account, buyerId);
    const product = await productWithSeller(db, (request.params as any).product_id);
    if (!product) return reply.code(404).send({ detail: "Product not found" });
    const variants = await variantsForProduct(db, product.product_id);
    const requestedVariantId = (request.query as any).variant_id;
    const variant = variants.find((item: any) => item.variant_id === requestedVariantId)
      ?? variants.find((item: any) => item.size === "XL")
      ?? variants[0];
    if (!variant) return reply.code(404).send({ detail: "Variant not found" });
    const keepConfidence = await computeKeepConfidence(db, buyerId, variant.variant_id, (request.query as any).preferred_fit ?? "comfort");
    const trace = await createTrace(db, {
      buyer_id: buyerId,
      product_id: product.product_id,
      variant_id: variant.variant_id,
      intent: ["keep_confidence"],
      tools_used: ["variantEvidence", "fitPrediction", "trustState", "computeKeepConfidence"],
      fact_ids: keepConfidence.fact_ids,
      graph_paths: [keepConfidence.graph_path]
    });
    return { trace_id: trace.trace_id, ...keepConfidence };
  });

  app.get("/products/:product_id/sku-passport", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.query as any).buyer_id;
    assertBuyer(account, buyerId);
    return skuPassport(db, buyerId, (request.params as any).product_id, (request.query as any).variant_id);
  });

  app.get("/buyers/:buyer_id/fit-profiles", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    return buyerFitProfileState(db, buyerId);
  });

  app.post("/buyers/:buyer_id/fit-profiles", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    const body = z.object({
      profile_id: z.string().optional(),
      label: z.string().optional(),
      relationship: z.string().optional(),
      preferred_fit: z.string().optional(),
      active: z.boolean().optional(),
      size_map: z.record(z.unknown()).optional(),
      notes: z.array(z.unknown()).optional()
    }).parse(request.body);
    return upsertBuyerFitProfile(db, buyerId, body);
  });

  app.post("/wishlist/intents", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body = z.object({
      buyer_id: z.string(),
      product_id: z.string(),
      selected_variant_id: z.string().optional(),
      profile_id: z.string().optional(),
      target_price: z.number().optional(),
      create_seller_signal: z.boolean().optional()
    }).parse(request.body);
    assertBuyer(account, body.buyer_id);
    return createWishlistIntent(db, body.buyer_id, body);
  });

  app.get("/buyers/:buyer_id/wishlist-radar", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    return wishlistRadar(db, buyerId);
  });

  app.post("/cart/confidence", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body = z.object({
      buyer_id: z.string(),
      profile_id: z.string().optional(),
      payment_mode: z.enum(["cod", "prepaid"]).optional(),
      items: z.array(z.object({
        product_id: z.string().optional(),
        variant_id: z.string().optional(),
        size: z.string().optional(),
        quantity: z.number().optional()
      })).min(1)
    }).parse(request.body);
    assertBuyer(account, body.buyer_id);
    return computeCartConfidence(db, body.buyer_id, body);
  });

  app.get("/buyers/:buyer_id/privacy", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    return privacySummary(db, buyerId);
  });

  app.get("/buyers/:buyer_id/dashboard", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    return buyerDashboard(db, buyerId);
  });

  app.get("/buyers/:buyer_id/memory", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    return {
      buyer_id: buyerId,
      memory: (await collections(db).fitMemory.find({ buyer_id: buyerId }).toArray()).map(withoutId),
      privacy: await privacySummary(db, buyerId)
    };
  });

  app.patch("/buyers/:buyer_id/memory", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    const body: any = request.body;
    await collections(db).buyers.updateOne(
      { buyer_id: buyerId },
      {
        $set: {
          ...(body.fit_memory_enabled !== undefined ? { fit_memory_enabled: body.fit_memory_enabled ? 1 : 0 } : {}),
          ...(body.preferred_fit ? { preferred_fit: body.preferred_fit } : {})
        }
      }
    );
    return {
      buyer_id: buyerId,
      fit_memory_enabled: Boolean((await collections(db).buyers.findOne({ buyer_id: buyerId }))?.fit_memory_enabled),
      memory: (await collections(db).fitMemory.find({ buyer_id: buyerId }).toArray()).map(withoutId)
    };
  });

  app.delete("/buyers/:buyer_id/memory", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.params as any).buyer_id;
    assertBuyer(account, buyerId);
    const result = await collections(db).fitMemory.deleteMany({ buyer_id: buyerId });
    await collections(db).buyers.updateOne({ buyer_id: buyerId }, { $set: { fit_memory_enabled: 0 } });
    return { buyer_id: buyerId, deleted_fit_memory_records: result.deletedCount, fit_memory_enabled: false };
  });

  app.get("/audit/:trace_id", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const trace = await collections(db).auditTraces.findOne({ trace_id: (request.params as any).trace_id });
    if (!trace) return reply.code(404).send({ detail: "Trace not found" });
    if (trace.buyer_id) assertBuyer(account, trace.buyer_id);
    return { ...withoutId(trace), fact_details: await facts(db, trace.fact_ids ?? []) };
  });
}
