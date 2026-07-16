import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { env, isProduction } from "./config/env.js";
import { closeMongo, collections, connectMongo } from "./db/mongo.js";
import { resetMongoSeed } from "./data/seed.js";
import { accountForRequest, assertBuyer, publicAccount, requireAccount, requireRole } from "./middleware/auth.js";
import { generateGroundedAgentAnswer } from "./services/agent.js";
import { hashPassword, id, makeToken, sha256, tokenHash, verifyPassword } from "./services/crypto.js";
import {
  buyerFitProfileState,
  computeCartConfidence,
  createWishlistIntent,
  upsertBuyerFitProfile,
  wishlistRadar
} from "./services/decisionEngine.js";
import {
  avoidableIssue,
  computeKeepConfidence,
  conflicts,
  createOrIncrementProofRequest,
  createTrace,
  evidenceGaps,
  facts,
  fitPrediction,
  graphPath,
  inferAttribute,
  label,
  productForVariant,
  productWithSeller,
  proofCoverage,
  publicProduct,
  rankCluster,
  reviewEvidence,
  sellerVerification,
  skuPassport,
  sourceHealth,
  trustState,
  variantEvidence,
  variantsForProduct,
  verifyOffer,
  withoutId
} from "./services/domain.js";
import { nowIso } from "./services/time.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const db = await connectMongo();
if (env.seedOnStart && !isProduction()) {
  await resetMongoSeed(db);
}

app.setErrorHandler((error, _request, reply) => {
  const err = error as Error & { statusCode?: number };
  const statusCode = err.statusCode ?? 500;
  reply.code(statusCode).send({ detail: err.message });
});

app.get("/health", async () => ({ ok: true, backend: "node", database: "mongodb_atlas", db: env.mongoDbName }));

app.get("/system/readiness", async () => ({
  app_env: env.nodeEnv,
  data_mode: "mongodb_atlas",
  user_disclosure: "This build uses MongoDB Atlas-ready evidence documents and seeded demo records until official connectors are attached.",
  source_health: await sourceHealth(db),
  implemented_controls: [
    "role separated auth",
    "MongoDB evidence store",
    "buyer fit profile guardrails",
    "weighted trust scoring",
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
}));

app.post("/auth/login", async (request, reply) => {
  const body = z.object({ username: z.string(), password: z.string() }).parse(request.body);
  const account = await collections(db).accounts.findOne({ username: body.username.trim().toLowerCase(), disabled: 0 });
  if (!account || !verifyPassword(body.password, account.password_salt, account.password_hash)) {
    return reply.code(401).send({ detail: "Invalid username or password" });
  }
  const session = await createSession(account.account_id);
  return { account: publicAccount(account), ...session };
});

app.post("/auth/signup/buyer", async (request, reply) => {
  const body = z.object({ username: z.string().min(3), password: z.string().min(8), display_name: z.string().min(1), language: z.string().default("english") }).parse(request.body);
  const username = body.username.trim().toLowerCase();
  if (await collections(db).accounts.findOne({ username })) {
    return reply.code(409).send({ detail: "Username already exists" });
  }
  const buyer_id = id("buyer");
  await collections(db).buyers.insertOne({ buyer_id, display_name: body.display_name, language: body.language, cod_preferred: 1, fit_memory_enabled: 1, preferred_fit: "comfort", joined_at: nowIso() });
  await collections(db).buyerReviewProfiles.insertOne({
    buyer_id,
    marketplace_age_days: 0,
    delivered_orders: 0,
    returned_orders: 0,
    rto_orders: 0,
    return_rate: 0,
    rto_rate: 0,
    review_count: 0,
    verified_purchase_rate: 0,
    credibility_weight: 0.45,
    risk_band: "new_user",
    risk_signals: ["new_account", "no_order_history"],
    updated_at: nowIso()
  });
  const { salt, hash } = hashPassword(body.password);
  const account = { account_id: id("acct"), username, display_name: body.display_name, role: "buyer", buyer_id, seller_id: null, password_salt: salt, password_hash: hash, disabled: 0, created_at: nowIso() };
  await collections(db).accounts.insertOne(account);
  return { account: publicAccount(account), ...(await createSession(account.account_id)) };
});

app.post("/auth/signup/seller", async (request, reply) => {
  const body = z.object({
    username: z.string().min(3),
    password: z.string().min(8),
    business_name: z.string().min(1),
    gst_number: z.string().min(4),
    pickup_pincode: z.string().min(4),
    support_contact: z.string().min(3)
  }).parse(request.body);
  const username = body.username.trim().toLowerCase();
  if (await collections(db).accounts.findOne({ username })) return reply.code(409).send({ detail: "Username already exists" });
  const seller_id = id("seller_user");
  await collections(db).sellers.insertOne({ seller_id, name: body.business_name, median_dispatch_hours: 48 });
  await collections(db).sellerProfiles.insertOne({
    seller_id,
    verification_status: "pending",
    gst_status: "pending_review",
    kyc_status: "under_review",
    pickup_pincode: body.pickup_pincode,
    categories: [],
    support_contact: body.support_contact,
    data_access_level: "limited",
    restricted_reason: null,
    last_verified_at: null
  });
  const application = { application_id: id("seller_app"), seller_id, business_name: body.business_name, gst_number: body.gst_number, pickup_pincode: body.pickup_pincode, support_contact: body.support_contact, status: "pending_review", created_at: nowIso() };
  await collections(db).sellerApplications.insertOne(application);
  const { salt, hash } = hashPassword(body.password);
  const account = { account_id: id("acct"), username, display_name: body.business_name, role: "seller", buyer_id: null, seller_id, password_salt: salt, password_hash: hash, disabled: 0, created_at: nowIso() };
  await collections(db).accounts.insertOne(account);
  return { account: publicAccount(account), ...(await createSession(account.account_id)), application: { application_id: application.application_id, verification_status: "pending", status: "pending_review" } };
});

app.get("/auth/me", async (request, reply) => {
  const account = await requireAccount(db, request, reply);
  return { account: publicAccount(account) };
});

app.post("/auth/logout", async (request) => {
  const authorization = request.headers.authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    await collections(db).sessions.updateOne({ token_hash: tokenHash(authorization.slice("bearer ".length).trim()) }, { $set: { revoked_at: nowIso() } });
  }
  return { ok: true };
});

app.post("/seed/reset", async (_request, reply) => {
  if (!env.demoControlsEnabled || isProduction()) return reply.code(403).send({ detail: "Seed reset disabled" });
  return { ok: true, counts: await resetMongoSeed(db) };
});

app.get("/scenarios", async () => ({ scenarios: defaultScenarios() }));
app.post("/scenarios/:scenario_id/activate", async (request) => ({ scenario: defaultScenarios().find((item) => item.scenario_id === (request.params as any).scenario_id) ?? defaultScenarios()[0] }));

app.get("/data-sources", async (request, reply) => {
  const account = await requireAccount(db, request, reply);
  return { account_role: account.role, health: await sourceHealth(db) };
});

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
  const total = await c.products.countDocuments(filter);
  const products = await c.products.find(filter).skip(offset).limit(limit).toArray();
  const sellerMap = new Map((await c.sellers.find({}).toArray()).map((seller: any) => [seller.seller_id, seller]));
  return {
    buyer_id: query.buyer_id,
    products: products.map((product: any) => publicProduct({ ...product, seller_name: sellerMap.get(product.seller_id)?.name, median_dispatch_hours: sellerMap.get(product.seller_id)?.median_dispatch_hours })),
    total,
    limit,
    offset,
    has_more: offset + products.length < total
  };
});

app.get("/sellers", async (request, reply) => {
  await requireRole(db, request, reply, "seller");
  return { sellers: await listSellers() };
});

app.get("/seller/me/panel", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  return sellerPanel(account.seller_id, (request.query as any).cluster_id);
});

app.get("/sellers/:seller_id/panel", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  const sellerId = (request.params as any).seller_id;
  if (account.seller_id !== sellerId) return reply.code(403).send({ detail: "Seller cannot access another seller panel" });
  return sellerPanel(sellerId, (request.query as any).cluster_id);
});

app.get("/seller/me/evidence-coach", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  return sellerEvidenceCoach(account.seller_id);
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
  const product = await collections(db).products.findOne({ product_id: body.product_id });
  if (!product || product.seller_id !== account.seller_id) return reply.code(403).send({ detail: "Cannot submit proof for another seller listing" });
  const proof_id = id("proof");
  const fact_id = id("fact_proof");
  await collections(db).sellerEvidenceAssets.insertOne({ proof_id, seller_id: account.seller_id, product_id: body.product_id, attribute: body.attribute, proof_type: body.proof_type, title: body.title, description: body.description, asset_url: body.asset_url, status: "verified", created_at: nowIso(), reviewed_at: nowIso(), fact_id });
  const update = await collections(db).proofRequests.updateMany({ seller_id: account.seller_id, product_id: body.product_id, attribute: body.attribute, status: "open" }, { $set: { status: "resolved", resolved_at: nowIso(), resolution_proof_id: proof_id, updated_at: nowIso() } });
  await collections(db).facts.insertOne({ fact_id, source_table: "seller_evidence_assets", source_id: proof_id, source_type: "seller_proof", summary: `${label(body.attribute)} proof submitted by seller.`, created_at: nowIso(), expires_at: null });
  return { proof_id, seller_id: account.seller_id, product_id: body.product_id, attribute: body.attribute, proof_type: body.proof_type, status: "verified", fact_id, resolved_open_requests: update.modifiedCount };
});

app.get("/seller/me/onboarding", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  return sellerOnboarding(account.seller_id);
});

app.post("/seller/me/verification/documents", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  const body: any = request.body;
  const document = { document_id: id("doc"), seller_id: account.seller_id, document_type: body.document_type, reference: body.reference, file_name: body.file_name, mime_type: body.mime_type, file_size_bytes: Buffer.from(body.content_base64 ?? "", "base64").length, sha256: sha256(body.content_base64 ?? body.reference ?? ""), storage_uri: `mongodb-atlas/seller_documents/${account.seller_id}/${body.file_name}`, uploaded_at: nowIso(), status: "submitted", submitted_at: nowIso(), reviewed_at: null, notes: "Submitted for TrustOps review." };
  await collections(db).sellerVerificationDocuments.insertOne(document);
  return sellerOnboarding(account.seller_id);
});

app.post("/seller/me/listing-drafts", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  const body: any = request.body;
  const draft = { draft_id: id("draft"), seller_id: account.seller_id, ...body, target_cluster_id: await suggestCluster(body.category, body.garment_type, body.color_family), status: "draft", readiness_status: "blocked_seller_verification", created_at: nowIso(), updated_at: nowIso(), submitted_at: null };
  await collections(db).listingDrafts.insertOne(draft);
  return sellerOnboarding(account.seller_id);
});

app.post("/seller/me/listing-drafts/:draft_id/submit", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  await collections(db).listingDrafts.updateOne({ draft_id: (request.params as any).draft_id, seller_id: account.seller_id }, { $set: { status: "submitted", updated_at: nowIso(), submitted_at: nowIso() } });
  return sellerOnboarding(account.seller_id);
});

app.post("/seller/listings/:product_id/correct-measurement", async (request, reply) => {
  const account = await requireRole(db, request, reply, "seller");
  const product = await collections(db).products.findOne({ product_id: (request.params as any).product_id });
  if (!product || product.seller_id !== account.seller_id) return reply.code(403).send({ detail: "Cannot edit another seller listing" });
  return { ok: true, status: "pending_evidence_review" };
});

app.get("/admin/review-queue", async (request, reply) => {
  await requireRole(db, request, reply, "admin");
  return adminQueue();
});

app.post("/admin/seller-applications/:application_id/approve", async (request, reply) => {
  const account = await requireRole(db, request, reply, "admin");
  const applicationId = (request.params as any).application_id;
  const notes = (request.body as any)?.notes ?? "Approved by admin.";
  const appDoc = await collections(db).sellerApplications.findOne({ application_id: applicationId });
  if (appDoc) {
    await collections(db).sellerApplications.updateOne({ application_id: applicationId }, { $set: { status: "approved" } });
    await collections(db).sellerProfiles.updateOne({ seller_id: appDoc.seller_id }, { $set: { verification_status: "verified", gst_status: "verified", kyc_status: "verified", data_access_level: "aggregate_only", last_verified_at: nowIso() } });
    await recordAdminEvent(account, "seller_application_approved", "seller_application", applicationId, appDoc.seller_id, "approved", notes);
  }
  return adminQueue();
});

app.post("/admin/seller-applications/:application_id/reject", async (request, reply) => {
  const account = await requireRole(db, request, reply, "admin");
  const applicationId = (request.params as any).application_id;
  const notes = (request.body as any)?.notes ?? "Rejected by admin.";
  const appDoc = await collections(db).sellerApplications.findOne({ application_id: applicationId });
  if (appDoc) {
    await collections(db).sellerApplications.updateOne({ application_id: applicationId }, { $set: { status: "rejected" } });
    await collections(db).sellerProfiles.updateOne({ seller_id: appDoc.seller_id }, { $set: { verification_status: "restricted", restricted_reason: notes } });
    await recordAdminEvent(account, "seller_application_rejected", "seller_application", applicationId, appDoc.seller_id, "rejected", notes);
  }
  return adminQueue();
});

app.post("/admin/listing-drafts/:draft_id/approve", async (request, reply) => {
  const account = await requireRole(db, request, reply, "admin");
  const draftId = (request.params as any).draft_id;
  const draft = await collections(db).listingDrafts.findOne({ draft_id: draftId });
  if (draft) {
    const product_id = id("product");
    const seller = await collections(db).sellers.findOne({ seller_id: draft.seller_id });
    await collections(db).products.insertOne({ product_id, cluster_id: draft.target_cluster_id ?? id("cluster"), seller_id: draft.seller_id, title: draft.title, category: draft.category, garment_type: draft.garment_type, fabric: draft.fabric, color_family: draft.color_family, base_price: draft.base_price, image_url: draft.image_url, rating: 4.0, rating_count: 0, commerce_badge: "New seller", delivery_text: "Delivery after seller confirmation", is_sarthi_eligible: 1, seller_name: seller?.name });
    await collections(db).variants.insertOne({ variant_id: `${product_id}_xl`, product_id, size: "XL", current_price: draft.base_price, stock: 10 });
    await collections(db).listingDrafts.updateOne({ draft_id: draftId }, { $set: { status: "approved", readiness_status: "evidence_building", updated_at: nowIso() } });
    await recordAdminEvent(account, "listing_draft_approved", "listing_draft", draftId, draft.seller_id, "approved", (request.body as any)?.notes ?? "Listing published as limited evidence.");
  }
  return adminQueue();
});

app.post("/admin/listing-drafts/:draft_id/revision", async (request, reply) => {
  const account = await requireRole(db, request, reply, "admin");
  const draftId = (request.params as any).draft_id;
  const draft = await collections(db).listingDrafts.findOne({ draft_id: draftId });
  if (draft) {
    await collections(db).listingDrafts.updateOne({ draft_id: draftId }, { $set: { status: "needs_revision", updated_at: nowIso() } });
    await recordAdminEvent(account, "listing_revision_requested", "listing_draft", draftId, draft.seller_id, "revision", (request.body as any)?.notes ?? "Revision requested.");
  }
  return adminQueue();
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
    privacy: await privacySummary(buyerId)
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
  const variant = variants.find((item: any) => item.variant_id === requestedVariantId) ?? variants.find((item: any) => item.size === "XL") ?? variants[0];
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

app.get("/products/:product_id/sku-passport", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const buyerId = (request.query as any).buyer_id;
  assertBuyer(account, buyerId);
  return skuPassport(db, buyerId, (request.params as any).product_id, (request.query as any).variant_id);
});

app.post("/compare", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const body: any = request.body;
  assertBuyer(account, body.buyer_id);
  const ranking = await rankCluster(db, body.buyer_id, body.cluster_id, body.preferred_fit, { recordSnapshot: true, intent: "compare" });
  const fit = await fitPrediction(db, body.buyer_id, ranking.winner, body.preferred_fit);
  const trace = await createTrace(db, { buyer_id: body.buyer_id, variant_id: ranking.winner, intent: ["compare"], tools_used: ["rankCluster", "fitPrediction"], fact_ids: ranking.fact_ids, graph_paths: [graphPath(ranking.winner, ranking.fact_ids)] });
  const product = await productForVariant(db, ranking.winner);
  return { trace_id: trace.trace_id, selected_product_id: product?.product_id ?? "", ranking, fit, graph_path: graphPath(ranking.winner, ranking.fact_ids) };
});

app.get("/knowledge-graph/clusters/:cluster_id", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const buyerId = (request.query as any).buyer_id;
  assertBuyer(account, buyerId);
  return clusterKnowledgeGraph(buyerId, (request.params as any).cluster_id);
});

app.post("/knowledge-graph/chat", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const body: any = request.body;
  assertBuyer(account, body.buyer_id);
  const cacheKey = llmCacheKey("knowledge_graph_chat", { buyer_id: body.buyer_id, cluster_id: body.cluster_id, query: body.query });
  const cached = await readLlmCache(cacheKey);
  if (cached) {
    const trace = await createTrace(db, { buyer_id: body.buyer_id, intent: ["knowledge_graph_chat"], tools_used: ["llmCache"], fact_ids: cached.answer?.fact_ids ?? [], graph_paths: cached.graph_path ? [cached.graph_path] : [] });
    return { ...cached, trace_id: trace.trace_id, cache: { hit: true, cache_key: cacheKey } };
  }
  const graph = await clusterKnowledgeGraph(body.buyer_id, body.cluster_id);
  const factIds = graph.fact_ids.slice(0, 8);
  const grounded = await generateGroundedAgentAnswer({
    task: "graph_chat",
    query: body.query ?? "",
    context: {
      cluster: graph.cluster,
      selected_product_id: graph.selected_product_id,
      ranking: graph.ranking ? {
        winner: graph.ranking.winner,
        alternative: graph.ranking.alternative,
        top_factors: graph.ranking.top_factors,
        candidates: graph.ranking.candidates.slice(0, 4).map((candidate: any) => ({
          variant_id: candidate.variant_id,
          product_id: candidate.product_id,
          seller_id: candidate.seller_id,
          score: candidate.score,
          factors: candidate.factors
        }))
      } : null,
      seller_context: graph.seller_context.slice(0, 4).map((context: any) => ({
        product: {
          product_id: context.product.product_id,
          title: context.product.title,
          seller_name: context.product.seller_name,
          price: context.product.base_price,
          rating: context.product.rating,
          fabric: context.product.fabric
        },
        seller_verification: context.seller.verification.verification_status,
        sku_evidence: {
          delivered_orders_90d: context.evidence.delivered_orders_90d,
          return_rate: context.evidence.return_rate,
          evidence_strength: context.evidence.evidence_strength,
          median_dispatch_hours: context.evidence.median_dispatch_hours
        },
        candidate_score: context.candidate?.score ?? null
      })),
      fact_ids: factIds
    },
    fallback: {
      title: "Sarthi graph answer",
      summary: "Sarthi checked seller trust, SKU outcomes, review credibility, and proof coverage before answering.",
      reasons: ["The graph separates seller reliability from product quality.", "Return outcomes can downweight generic positive reviews.", "Missing proof becomes a seller action item."],
      caution: null
    }
  });
  const answer = {
    query: body.query,
    title: grounded.title,
    summary: grounded.summary,
    reasons: grounded.reasons,
    caution: grounded.caution,
    matched_node_ids: graph.nodes.slice(0, 4).map((node: any) => node.id),
    highlighted_edge_ids: graph.edges.slice(0, 4).map((edge: any) => edge.id),
    fact_ids: factIds,
    follow_up_questions: graph.chat_suggestions
  };
  const trace = await createTrace(db, { buyer_id: body.buyer_id, intent: ["knowledge_graph_chat"], tools_used: ["clusterKnowledgeGraph", "answerGraphQuestion"], fact_ids: factIds, graph_paths: [graphPath(graph.ranking?.winner ?? "", factIds)] });
  const response = { trace_id: trace.trace_id, answer, graph_path: graphPath(graph.ranking?.winner ?? "", factIds), agent: { provider: grounded.source }, cache: { hit: false, cache_key: cacheKey } };
  await writeLlmCache(cacheKey, "knowledge_graph_chat", response);
  return response;
});

app.post("/decision/regret-firewall", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const body: any = request.body;
  assertBuyer(account, body.buyer_id);
  const contextProduct = body.product_id ? await productWithSeller(db, body.product_id) : (await collections(db).products.findOne({ cluster_id: body.cluster_id, is_sarthi_eligible: 1 }));
  const product = contextProduct?.product_id ? contextProduct : publicProduct(contextProduct);
  if (!product) return reply.code(404).send({ detail: "Product context not found" });
  const variants = await variantsForProduct(db, product.product_id);
  const variant = variants.find((item: any) => item.size === "XL") ?? variants[0];
  const passport = await skuPassport(db, body.buyer_id, product.product_id, variant.variant_id);
  const attribute = inferAttribute(body.query);
  const missing = passport.evidence_gaps.find((gap: any) => gap.attribute === attribute) ?? passport.evidence_gaps[0] ?? null;
  const proofRequest = missing && body.create_missing_proof_request !== false ? await createOrIncrementProofRequest(db, body.buyer_id, product, variant.variant_id, missing.attribute, body.query ?? "") : null;
  const ranking = await rankCluster(db, body.buyer_id, product.cluster_id, body.preferred_fit, { recordSnapshot: true, intent: "regret_firewall" });
  const trace = await createTrace(db, { buyer_id: body.buyer_id, product_id: product.product_id, variant_id: variant.variant_id, intent: ["regret_firewall"], tools_used: ["skuPassport", "proofCoverage", "createProofRequest"], fact_ids: passport.fact_ids, graph_paths: [graphPath(variant.variant_id, passport.fact_ids)] });
  return {
    trace_id: trace.trace_id,
    buyer_id: body.buyer_id,
    context: { product_id: product.product_id, cluster_id: product.cluster_id, category: product.category, garment_type: product.garment_type },
    decision: missing ? { code: "ask_seller_proof", label: "Ask seller proof", summary: missing.summary, primary_action: missing.title, confidence: "medium" } : { code: "buy_without_rush", label: "Safe to consider", summary: "No major proof gap detected.", primary_action: "Continue to product detail", confidence: "medium" },
    selected: { product, variant, recommended_size: passport.fit.recommended_size },
    ranking,
    sku_truth_passport: passport,
    missing_proof: missing,
    proof_request: proofRequest,
    graph_paths: [graphPath(variant.variant_id, passport.fact_ids)],
    fact_ids: passport.fact_ids
  };
});

app.post("/agent/query", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const body: any = request.body;
  assertBuyer(account, body.buyer_id);
  const cacheKey = llmCacheKey("agent_query", { buyer_id: body.buyer_id, cluster_id: body.cluster_id, selected_variant_id: body.selected_variant_id, query: body.query });
  const cached = await readLlmCache(cacheKey);
  if (cached) {
    const trace = await createTrace(db, { buyer_id: body.buyer_id, variant_id: body.selected_variant_id, intent: ["samvaad"], tools_used: ["llmCache"], fact_ids: cached.fact_ids ?? [] });
    return { ...cached, trace_id: trace.trace_id, cache: { hit: true, cache_key: cacheKey } };
  }
  const product = body.selected_variant_id ? await productForVariant(db, body.selected_variant_id) : body.cluster_id ? publicProduct(await collections(db).products.findOne({ cluster_id: body.cluster_id })) : null;
  const passport = product && body.selected_variant_id
    ? await skuPassport(db, body.buyer_id, product.product_id, body.selected_variant_id)
    : null;
  const fact_ids: string[] = passport?.fact_ids?.slice(0, 12) ?? [];
  const grounded = await generateGroundedAgentAnswer({
    task: "product_advice",
    query: body.query ?? "",
    context: {
      product: product ? {
        product_id: product.product_id,
        title: product.title,
        seller_name: product.seller_name,
        category: product.category,
        fabric: product.fabric,
        price: product.base_price,
        rating: product.rating
      } : null,
      passport: passport ? {
        truth_summary: passport.truth_summary,
        selected_size: passport.variant.size,
        fit: passport.fit,
        outcome_evidence: passport.outcome_evidence,
        avoidable_issue: passport.avoidable_issue,
        offer_truth: {
          status: passport.offer_truth.status,
          message: passport.offer_truth.message,
          truth_basis: passport.offer_truth.truth_basis
        },
        evidence_gaps: passport.evidence_gaps.map((gap: any) => ({
          attribute: gap.attribute,
          severity: gap.severity,
          summary: gap.summary,
          recommended_proof_type: gap.recommended_proof_type
        })),
        conflicts: passport.conflicts
      } : null,
      fact_ids
    },
    fallback: {
      title: "Sarthi answer",
      summary: "Sarthi checked seller, SKU, review, return, proof, and offer evidence. If proof is missing, it asks the seller instead of guessing.",
      reasons: ["Answers are grounded in MongoDB evidence documents.", "Seller proof gaps become aggregate seller tasks."],
      caution: passport?.evidence_gaps?.length ? "Some proof is still missing, so the recommendation should stay cautious." : null
    }
  });
  const trace = await createTrace(db, { buyer_id: body.buyer_id, product_id: product?.product_id, variant_id: body.selected_variant_id, intent: ["samvaad"], tools_used: ["intentDetection", "groundedAnswer", grounded.source], fact_ids });
  const response = {
    trace_id: trace.trace_id,
    intent: [inferAttribute(body.query), "trust_question"],
    answer: {
      title: grounded.title,
      summary: grounded.summary,
      reasons: grounded.reasons,
      caution: grounded.caution,
      primary_action: body.selected_variant_id ? { type: "open_variant", variant_id: body.selected_variant_id, label: "Inspect SKU proof" } : null
    },
    agent: { provider: grounded.source },
    fact_ids
  };
  await writeLlmCache(cacheKey, "agent_query", response);
  return response;
});

app.post("/checkout/verify-offer", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const body: any = request.body;
  assertBuyer(account, body.buyer_id);
  const offer = await verifyOffer(db, body.variant_id);
  const keepConfidence = await computeKeepConfidence(db, body.buyer_id, body.variant_id, body.preferred_fit ?? "comfort");
  const factIds = [...new Set([...offer.fact_ids, ...keepConfidence.fact_ids])];
  const trace = await createTrace(db, {
    buyer_id: body.buyer_id,
    variant_id: body.variant_id,
    intent: ["offer_truth", "checkout_confidence"],
    tools_used: ["verifyOffer", "computeKeepConfidence", "checkoutConfidence"],
    fact_ids: factIds,
    graph_paths: [graphPath(body.variant_id, factIds)]
  });
  return {
    trace_id: trace.trace_id,
    offer,
    keep_confidence: { trace_id: trace.trace_id, ...keepConfidence },
    graph_path: graphPath(body.variant_id, factIds)
  };
});

app.post("/expectation-contracts", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const body: any = request.body;
  assertBuyer(account, body.buyer_id);
  const product = await productForVariant(db, body.variant_id);
  if (!product) return reply.code(404).send({ detail: "Variant not found" });
  const passport = await skuPassport(db, body.buyer_id, product.product_id, body.variant_id);
  const contract = expectationContract(body.buyer_id, product.product_id, body.variant_id, passport);
  await collections(db).expectationContracts.insertOne(contract);
  return contract;
});

app.get("/expectation-contracts/:contract_id", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const contract = await collections(db).expectationContracts.findOne({ contract_id: (request.params as any).contract_id });
  if (!contract) return reply.code(404).send({ detail: "Contract not found" });
  assertBuyer(account, contract.buyer_id);
  return withoutId(contract);
});

app.post("/orders/simulate", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const body: any = request.body;
  assertBuyer(account, body.buyer_id);
  const order_id = id("order");
  const fact_id = id("fact_order");
  await collections(db).outcomes.insertOne({ order_id, buyer_id: body.buyer_id, variant_id: body.variant_id, status: body.status, return_reason: body.return_reason ?? null, created_at: nowIso(), fact_id });
  await collections(db).facts.insertOne({ fact_id, source_table: "order_outcomes", source_id: order_id, source_type: "order_outcome", summary: `${body.status} outcome for ${body.variant_id}`, created_at: nowIso(), expires_at: null });
  const reviewerProfile = await refreshBuyerReviewProfile(body.buyer_id);
  let memoryUpdate = { updated: false, reason: "memory disabled" } as any;
  const buyer = await collections(db).buyers.findOne({ buyer_id: body.buyer_id });
  if (buyer?.fit_memory_enabled && body.status === "delivered_kept") {
    const product = await productForVariant(db, body.variant_id);
    const variant = await collections(db).variants.findOne({ variant_id: body.variant_id });
    const memory_id = id("fit_memory");
    const memory = { memory_id, buyer_id: body.buyer_id, category: product?.category ?? "unknown", anchor_variant_id: body.variant_id, retained_size: variant?.size ?? "XL", preferred_fit: "comfort", confidence: "medium", updated_at: nowIso(), fact_id: id("fact_memory") };
    await collections(db).fitMemory.insertOne(memory);
    memoryUpdate = { updated: true, memory_id, retained_size: memory.retained_size };
  }
  let contract: any = null;
  if (body.contract_id) {
    contract = await collections(db).expectationContracts.findOne({ contract_id: body.contract_id });
    if (contract) {
      const status = body.status === "returned" ? "broken" : "kept";
      const broken_dimension = body.return_reason?.includes("fabric") ? "fabric" : body.return_reason?.includes("color") ? "color" : body.return_reason?.includes("small") || body.return_reason?.includes("large") ? "fit" : null;
      await collections(db).expectationContracts.updateOne({ contract_id: body.contract_id }, { $set: { status, completed_at: nowIso(), outcome_order_id: order_id, broken_dimension } });
      contract = { ...contract, status, completed_at: nowIso(), outcome_order_id: order_id, broken_dimension };
    }
  }
  return {
    outcome: { order_id, fact_id, created_at: nowIso(), status: body.status, memory_update: memoryUpdate },
    expectation_contract: contract ? withoutId(contract) : null,
    graph_sync: { available: true, reviewer_credibility_weight: reviewerProfile.credibility_weight },
    memory: (await collections(db).fitMemory.find({ buyer_id: body.buyer_id }).toArray()).map(withoutId)
  };
});

app.get("/buyers/:buyer_id/privacy", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const buyerId = (request.params as any).buyer_id;
  assertBuyer(account, buyerId);
  return privacySummary(buyerId);
});

app.get("/buyers/:buyer_id/dashboard", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const buyerId = (request.params as any).buyer_id;
  assertBuyer(account, buyerId);
  return buyerDashboard(buyerId);
});

app.get("/buyers/:buyer_id/memory", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const buyerId = (request.params as any).buyer_id;
  assertBuyer(account, buyerId);
  return { buyer_id: buyerId, memory: (await collections(db).fitMemory.find({ buyer_id: buyerId }).toArray()).map(withoutId), privacy: await privacySummary(buyerId) };
});

app.patch("/buyers/:buyer_id/memory", async (request, reply) => {
  const account = await requireRole(db, request, reply, "buyer");
  const buyerId = (request.params as any).buyer_id;
  assertBuyer(account, buyerId);
  const body: any = request.body;
  await collections(db).buyers.updateOne({ buyer_id: buyerId }, { $set: { ...(body.fit_memory_enabled !== undefined ? { fit_memory_enabled: body.fit_memory_enabled ? 1 : 0 } : {}), ...(body.preferred_fit ? { preferred_fit: body.preferred_fit } : {}) } });
  return { buyer_id: buyerId, fit_memory_enabled: Boolean((await collections(db).buyers.findOne({ buyer_id: buyerId }))?.fit_memory_enabled), memory: (await collections(db).fitMemory.find({ buyer_id: buyerId }).toArray()).map(withoutId) };
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

async function createSession(accountId: string) {
  const access_token = makeToken();
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await collections(db).sessions.insertOne({ token_hash: tokenHash(access_token), account_id: accountId, created_at: nowIso(), expires_at, revoked_at: null });
  return { access_token, token_type: "bearer" as const, expires_at };
}

async function listSellers() {
  const c = collections(db);
  const sellers = await c.sellers.find({}).toArray();
  return Promise.all(sellers.map(async (seller: any) => ({
    seller_id: seller.seller_id,
    name: seller.name,
    median_dispatch_hours: seller.median_dispatch_hours,
    product_count: await c.products.countDocuments({ seller_id: seller.seller_id }),
    cluster_ids: [...new Set((await c.products.find({ seller_id: seller.seller_id }).toArray()).map((product: any) => product.cluster_id))]
  })));
}

async function sellerPanel(sellerId: string, clusterId?: string) {
  const c = collections(db);
  const seller = await c.sellers.findOne({ seller_id: sellerId });
  const firstProduct = await c.products.findOne({ seller_id: sellerId });
  const selectedCluster = clusterId ?? firstProduct?.cluster_id ?? "cluster_floral_blue";
  const listings = await c.products.find({ cluster_id: selectedCluster }).toArray();
  const cards = await Promise.all(listings.map((product: any) => listingCard(product)));
  const own = cards.filter((card) => card.seller.seller_id === sellerId);
  const competitors = cards.filter((card) => card.seller.seller_id !== sellerId);
  const cluster = await c.clusters.findOne({ cluster_id: selectedCluster });
  return {
    seller: { seller_id: sellerId, name: seller?.name ?? "", median_dispatch_hours: seller?.median_dispatch_hours ?? 48, product_count: await c.products.countDocuments({ seller_id: sellerId }), cluster_ids: [...new Set((await c.products.find({ seller_id: sellerId }).toArray()).map((product: any) => product.cluster_id))] },
    seller_verification: await sellerVerification(db, sellerId),
    data_freshness: await sourceHealth(db),
    cluster: { cluster_id: selectedCluster, label: cluster?.label ?? selectedCluster, size: "XL", listing_count: listings.length, seller_count: new Set(listings.map((item: any) => item.seller_id)).size, stats: { delivered_orders_90d: cards.reduce((sum, card) => sum + card.metrics.delivered_orders_90d, 0), returns_90d: cards.reduce((sum, card) => sum + card.metrics.returns_90d, 0), median_return_rate: median(cards.map((card) => card.metrics.return_rate).filter((value) => value !== null) as number[]), median_dispatch_hours: median(cards.map((card) => card.metrics.median_dispatch_hours)), minimum_orders_for_strong_decision: 30 } },
    decision_policy: { name: "Sarthi weighted trust score", weights: { sku_outcome: 18, seller_reliability: 15, seller_verification: 12, fit: 12, review_credibility: 12, product_rating: 10, proof: 8, offer: 6, dispatch: 5, price: 2 }, inputs_used: ["aggregate outcomes", "seller verification", "review credibility"], inputs_not_used: ["private buyer memory"] },
    seller_listings: own,
    competing_listings: competitors,
    privacy_guard: { safe_for_seller: true, summary: "Seller view uses aggregate listing evidence only. Buyer memory and identity are not exposed." },
    fact_ids: [...new Set(cards.flatMap((card) => card.fact_ids))].slice(0, 16)
  };
}

async function listingCard(product: any) {
  const seller = await collections(db).sellers.findOne({ seller_id: product.seller_id });
  const variants = await variantsForProduct(db, product.product_id);
  const variant = variants.find((item: any) => item.size === "XL") ?? variants[0];
  const evidence = await variantEvidence(db, variant.variant_id);
  const topIssue = await topIssueForCard(variant.variant_id);
  const score = Math.round((1 - evidence.return_rate) * 55 + (product.rating / 5) * 25 + (seller?.median_dispatch_hours ? Math.max(0, 20 - seller.median_dispatch_hours / 4) : 8));
  return {
    product: publicProduct({ ...product, seller_name: seller?.name, median_dispatch_hours: seller?.median_dispatch_hours }),
    variant,
    seller: { seller_id: product.seller_id, name: seller?.name ?? "", median_dispatch_hours: seller?.median_dispatch_hours },
    quality_score: Math.max(0, Math.min(100, score)),
    decision_status: evidence.evidence_strength === "weak" ? "insufficient_evidence" : evidence.return_rate > 0.2 ? "needs_seller_action" : "eligible_for_recommendation",
    cluster_position: null,
    metrics: { kept_rate: evidence.delivered_orders_90d ? 1 - evidence.return_rate : null, return_rate: evidence.return_rate, fit_as_expected_rate: evidence.fit_as_expected_rate, color_match_rate: evidence.delivered_orders_90d ? 1 - evidence.color_mismatch_returns / evidence.delivered_orders_90d : null, delivered_orders_90d: evidence.delivered_orders_90d, returns_90d: evidence.returns_90d, color_mismatch_returns: evidence.color_mismatch_returns, median_dispatch_hours: evidence.median_dispatch_hours, evidence_strength: evidence.evidence_strength },
    top_issue: topIssue,
    action_items: topIssue ? [{ priority: "high", title: `${label(topIssue.return_reason)} needs proof`, rationale: "Repeated buyer outcomes show an avoidable issue.", metric: topIssue.return_reason, fact_ids: topIssue.fact_ids }] : [],
    fact_ids: evidence.fact_ids
  };
}

async function topIssueForCard(variantId: string) {
  const issue = await avoidableIssue(db, variantId);
  return issue ? { return_reason: issue.reason, count: issue.count, fact_ids: issue.fact_ids } : null;
}

async function sellerEvidenceCoach(sellerId: string) {
  const c = collections(db);
  const requests = await c.proofRequests.find({ seller_id: sellerId, status: "open" }).toArray();
  const tasks = await Promise.all(requests.map(async (request: any) => {
    const product = await c.products.findOne({ product_id: request.product_id });
    return { type: "missing_buyer_proof", priority: request.request_count >= 3 ? "high" : "medium", product_id: request.product_id, product_title: product?.title ?? request.product_id, attribute: request.attribute, title: `${label(request.attribute)} proof requested`, rationale: `${request.request_count} buyer doubt(s) need aggregate proof before stronger trust.`, recommended_proof_type: recommendationForAttribute(request.attribute), buyer_demand: request.request_count, first_seen_at: request.created_at, last_seen_at: request.updated_at, fact_ids: [request.fact_id] };
  }));
  return { seller_id: sellerId, open_task_count: tasks.length, resolved_request_count: await c.proofRequests.countDocuments({ seller_id: sellerId, status: "resolved" }), tasks, privacy_guard: { safe_for_seller: true, summary: "Only aggregate proof demand is shown. No buyer identity or fit memory is exposed." } };
}

async function sellerOnboarding(sellerId: string) {
  const sellerList = await listSellers();
  const seller = sellerList.find((item) => item.seller_id === sellerId) ?? { seller_id: sellerId, name: "", median_dispatch_hours: 48, product_count: 0, cluster_ids: [] };
  const application = await collections(db).sellerApplications.findOne({ seller_id: sellerId }, { sort: { created_at: -1 } });
  const documents = await collections(db).sellerVerificationDocuments.find({ seller_id: sellerId }).toArray();
  const drafts = await collections(db).listingDrafts.find({ seller_id: sellerId }).toArray();
  const verification = await sellerVerification(db, sellerId);
  const missingDocs = ["gst_certificate", "address_proof", "bank_proof"].filter((type) => !documents.some((doc: any) => doc.document_type === type));
  return {
    seller: { ...seller, product_count: seller.product_count },
    seller_verification: verification,
    application: application ? withoutId(application) : null,
    documents: documents.map(withoutId),
    listing_drafts: drafts.map(withoutId),
    policy: { buyer_feed_blocked_until: ["seller verification approved", "listing draft approved"], personal_buyer_data_used: false, new_listing_default: "limited_evidence" },
    next_actions: [
      ...missingDocs.map((doc) => ({ priority: "high", title: `Upload ${label(doc)}`, detail: "Required for seller verification.", blocked: true })),
      ...(verification.verification_status !== "verified" ? [{ priority: "high", title: "Wait for admin verification", detail: "Buyer-facing trust remains limited until approval.", blocked: true }] : [])
    ]
  };
}

async function adminQueue() {
  const c = collections(db);
  const applications = await c.sellerApplications.find({}).sort({ created_at: -1 }).toArray();
  const sellers = new Map((await c.sellers.find({}).toArray()).map((seller: any) => [seller.seller_id, seller]));
  const profiles = new Map((await c.sellerProfiles.find({}).toArray()).map((profile: any) => [profile.seller_id, profile]));
  const documents = await c.sellerVerificationDocuments.find({}).sort({ submitted_at: -1 }).toArray();
  const drafts = await c.listingDrafts.find({}).sort({ updated_at: -1 }).toArray();
  const auditEvents = await c.adminAuditEvents.find({}).sort({ created_at: -1 }).limit(50).toArray();
  return {
    seller_applications: applications.map((app: any) => ({ ...withoutId(app), seller_name: sellers.get(app.seller_id)?.name ?? app.business_name, verification_status: profiles.get(app.seller_id)?.verification_status ?? null })),
    documents: documents.map((doc: any) => ({ ...withoutId(doc), seller_name: sellers.get(doc.seller_id)?.name ?? "" })),
    listing_drafts: drafts.map((draft: any) => ({ ...withoutId(draft), seller_name: sellers.get(draft.seller_id)?.name ?? "", verification_status: profiles.get(draft.seller_id)?.verification_status ?? null })),
    audit_events: auditEvents.map(withoutId)
  };
}

function llmCacheKey(scope: string, payload: Record<string, unknown>) {
  return `${scope}:${sha256(JSON.stringify(stableCachePayload({
    provider: env.llmProvider,
    model: env.llmModel,
    ...payload
  })))}`;
}

function stableCachePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCachePayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableCachePayload(item)])
    );
  }
  return value;
}

async function readLlmCache(cacheKey: string) {
  const row = await collections(db).llmCache.findOne({ cache_key: cacheKey, expires_at: { $gt: new Date() } });
  return row?.payload ?? null;
}

async function writeLlmCache(cacheKey: string, scope: string, payload: Record<string, unknown>) {
  await collections(db).llmCache.updateOne(
    { cache_key: cacheKey },
    {
      $set: {
        cache_key: cacheKey,
        scope,
        payload,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000)
      }
    },
    { upsert: true }
  );
}

async function clusterKnowledgeGraph(buyerId: string, clusterId: string) {
  const c = collections(db);
  const cluster = await c.clusters.findOne({ cluster_id: clusterId });
  const products = await c.products.find({ cluster_id: clusterId, is_sarthi_eligible: 1 }).toArray();
  const ranking = await rankCluster(db, buyerId, clusterId);
  const nodes: any[] = [{ id: clusterId, type: "cluster", label: cluster?.label ?? clusterId, subtitle: "Comparable listing group", status: "active", score: null, fact_ids: [], data: {} }];
  const edges: any[] = [];
  const seller_context = [];
  const factIds = new Set<string>(ranking.fact_ids);
  for (const product of products.slice(0, 4)) {
    const publicP = publicProduct({ ...product, seller_name: (await c.sellers.findOne({ seller_id: product.seller_id }))?.name });
    const variants = await variantsForProduct(db, product.product_id);
    const variant = variants.find((item: any) => item.size === "XL") ?? variants[0];
    const evidence = await variantEvidence(db, variant.variant_id);
    const fit = await fitPrediction(db, buyerId, variant.variant_id);
    const reviews = await c.reviews.find({ product_id: product.product_id }).limit(5).toArray();
    const candidate = ranking.candidates.find((item: any) => item.variant_id === variant.variant_id) ?? null;
    const seller = await c.sellers.findOne({ seller_id: product.seller_id });
    const productNode = `product:${product.product_id}`;
    const sellerNode = `seller:${product.seller_id}`;
    const skuNode = `sku:${variant.variant_id}`;
    nodes.push({ id: sellerNode, type: "seller", label: seller?.name ?? product.seller_id, subtitle: "Seller reliability", status: (await sellerVerification(db, product.seller_id)).verification_status, score: candidate?.factors.seller_trust ?? null, fact_ids: [], data: {} });
    nodes.push({ id: productNode, type: "product", label: product.title.split("-")[0].trim(), subtitle: product.fabric, status: "listed", score: product.rating, fact_ids: [], data: { rating: product.rating } });
    nodes.push({ id: skuNode, type: "sku", label: variant.size, subtitle: `${evidence.delivered_orders_90d} delivered outcomes`, status: evidence.evidence_strength, score: candidate?.score ?? null, fact_ids: evidence.fact_ids, data: evidence });
    edges.push(edge(clusterId, productNode, "contains", [], 0.8), edge(productNode, sellerNode, "sold by", [], 0.8), edge(productNode, skuNode, "has sku", evidence.fact_ids, 0.9));
    for (const fact of evidence.fact_ids) factIds.add(fact);
    seller_context.push({ product: publicP, seller: { seller_id: product.seller_id, name: seller?.name, verification: await sellerVerification(db, product.seller_id) }, variant, evidence, fit, reviews: reviews.map(withoutId), top_return_reason: await topIssueForCard(variant.variant_id), price_context: { latest_price: variant.current_price, campaign: await c.campaigns.findOne({ variant_id: variant.variant_id }), inventory: await c.inventorySnapshots.findOne({ variant_id: variant.variant_id }) }, candidate, node_ids: { product: productNode, seller: sellerNode, sku: skuNode } });
  }
  return {
    buyer_id: buyerId,
    cluster: { cluster_id: clusterId, label: cluster?.label ?? clusterId, category: cluster?.category ?? "unknown", listing_count: products.length },
    summary: { title: "Sarthi weighted trust graph", body: "Graph connects sellers, products, SKUs, reviews, returns, proof, offer, checkout, and outcomes.", dynamic: true, source_health: await sourceHealth(db), fact_count: factIds.size },
    ranking,
    selected_product_id: (await productForVariant(db, ranking.winner))?.product_id ?? null,
    nodes: uniqueBy(nodes, "id"),
    edges,
    seller_context,
    fact_ids: [...factIds],
    chat_suggestions: ["Which seller is safest?", "Why not choose the cheapest?", "Is prepaid safe for this item?"]
  };
}

function edge(source: string, target: string, labelText: string, fact_ids: string[], weight: number) {
  return { id: `edge:${source}:${target}:${labelText}`.replaceAll(" ", "_"), source, target, label: labelText, weight, fact_ids };
}

async function buyerDashboard(buyerId: string) {
  const c = collections(db);
  const buyer = await c.buyers.findOne({ buyer_id: buyerId });
  const profile = await refreshBuyerReviewProfile(buyerId);
  const outcomes = await c.outcomes.find({ buyer_id: buyerId }).sort({ created_at: -1 }).toArray();
  const proofRequests = await c.proofRequests.countDocuments({ buyer_id: buyerId });
  const contracts = await c.expectationContracts.find({ buyer_id: buyerId }).sort({ created_at: -1 }).limit(5).toArray();
  const latestMemory = await c.fitMemory.find({ buyer_id: buyerId }).sort({ updated_at: -1 }).limit(3).toArray();
  const kept = outcomes.filter((outcome: any) => outcome.status === "delivered_kept").length;
  const returned = outcomes.filter((outcome: any) => outcome.status === "returned").length;
  const rto = outcomes.filter((outcome: any) => outcome.status === "rto").length;
  const checkoutMode = profile.credibility_weight >= 0.75 && returned <= kept
    ? "normal_prepaid_eligibility"
    : profile.credibility_weight >= 0.55
      ? "balanced_checkout_guidance"
      : "extra_trust_steps";
  return {
    buyer_id: buyerId,
    profile: {
      display_name: buyer?.display_name ?? "Buyer",
      language: buyer?.language ?? "english",
      preferred_fit: buyer?.preferred_fit ?? "comfort",
      joined_at: buyer?.joined_at ?? null
    },
    activity: {
      kept_orders: kept,
      returned_orders: returned,
      rto_orders: rto,
      total_outcomes: outcomes.length,
      proof_requests_created: proofRequests,
      expectation_contracts: await c.expectationContracts.countDocuments({ buyer_id: buyerId })
    },
    review_credibility: {
      weight: profile.credibility_weight,
      risk_band: profile.risk_band,
      signals: profile.risk_signals,
      explanation: "Sarthi gives lower review weight to very new users, repeated generic reviews, high returns, or high RTO behavior so product scores are harder to manipulate."
    },
    checkout_guidance: {
      mode: checkoutMode,
      prepaid_nudge_allowed: checkoutMode !== "extra_trust_steps",
      message: checkoutMode === "normal_prepaid_eligibility"
        ? "Prepaid can be nudged when product trust, offer truth, and refund clarity are strong."
        : checkoutMode === "balanced_checkout_guidance"
          ? "Prepaid can be shown with clear savings, but Sarthi should avoid pressure copy."
          : "Avoid strong prepaid nudges until cleaner order history and product evidence exist."
    },
    privacy: await privacySummary(buyerId),
    recent_memory: latestMemory.map(withoutId),
    recent_expectation_contracts: contracts.map(withoutId),
    guardrails: [
      "Buyer fit memory is not shown to sellers.",
      "Review weight affects aggregate scoring only; it does not block a buyer from shopping.",
      "Prepaid nudges require product trust and offer truth, not only user profile."
    ]
  };
}

async function refreshBuyerReviewProfile(buyerId: string) {
  const c = collections(db);
  const [buyer, existing, outcomes, reviewCount] = await Promise.all([
    c.buyers.findOne({ buyer_id: buyerId }),
    c.buyerReviewProfiles.findOne({ buyer_id: buyerId }),
    c.outcomes.find({ buyer_id: buyerId }).toArray(),
    c.reviews.countDocuments({ reviewer_buyer_id: buyerId })
  ]);
  const joinedAt = buyer?.joined_at ?? existing?.updated_at ?? nowIso();
  const marketplace_age_days = Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000));
  const completed = outcomes.filter((outcome: any) => ["delivered_kept", "returned", "exchanged"].includes(outcome.status));
  const kept = outcomes.filter((outcome: any) => outcome.status === "delivered_kept").length;
  const returned = outcomes.filter((outcome: any) => outcome.status === "returned").length;
  const rto = outcomes.filter((outcome: any) => outcome.status === "rto").length;
  const return_rate = completed.length ? Number((returned / completed.length).toFixed(3)) : existing?.return_rate ?? 0;
  const rto_rate = completed.length + rto ? Number((rto / (completed.length + rto)).toFixed(3)) : existing?.rto_rate ?? 0;
  const risk_signals = [
    ...(marketplace_age_days < 30 ? ["new_account"] : []),
    ...(completed.length < 3 ? ["thin_order_history"] : []),
    ...(return_rate > 0.45 ? ["high_return_rate"] : []),
    ...(rto_rate > 0.25 ? ["high_rto_rate"] : []),
    ...(existing?.risk_signals ?? []).filter((signal: string) => ["repeated_text_pattern"].includes(signal))
  ];
  let credibility_weight = 0.92;
  if (marketplace_age_days < 30) credibility_weight -= 0.22;
  if (completed.length < 3) credibility_weight -= 0.16;
  if (return_rate > 0.45) credibility_weight -= 0.28;
  if (rto_rate > 0.25) credibility_weight -= 0.16;
  if (risk_signals.includes("repeated_text_pattern")) credibility_weight -= 0.14;
  credibility_weight = Number(Math.max(0.2, Math.min(1, credibility_weight)).toFixed(2));
  const risk_band = credibility_weight >= 0.75 ? "trusted" : credibility_weight >= 0.55 ? "watch" : marketplace_age_days < 30 ? "new_user" : "high_return";
  const profile = {
    buyer_id: buyerId,
    marketplace_age_days,
    delivered_orders: kept,
    returned_orders: returned,
    rto_orders: rto,
    return_rate,
    rto_rate,
    review_count: reviewCount,
    verified_purchase_rate: completed.length ? 1 : 0,
    credibility_weight,
    risk_band,
    risk_signals,
    updated_at: nowIso()
  };
  await c.buyerReviewProfiles.updateOne({ buyer_id: buyerId }, { $set: profile }, { upsert: true });
  return profile;
}

async function privacySummary(buyerId: string) {
  const buyer = await collections(db).buyers.findOne({ buyer_id: buyerId });
  const count = await collections(db).fitMemory.countDocuments({ buyer_id: buyerId });
  return { buyer_id: buyerId, fit_memory_enabled: Boolean(buyer?.fit_memory_enabled), memory_record_count: count, used: buyer?.fit_memory_enabled ? ["fit memory for size guidance", "aggregate order outcomes"] : ["aggregate order outcomes"], not_used: ["seller cannot access buyer memory", "contacts", "SMS", "raw voice", "payment credentials"] };
}

function expectationContract(buyerId: string, productId: string, variantId: string, passport: any) {
  const contract_id = id("contract");
  const fact_id = id("fact_contract");
  return {
    contract_id,
    buyer_id: buyerId,
    product_id: productId,
    variant_id: variantId,
    status: "active",
    contract: {
      title: "Sarthi expectation contract",
      summary: "Fact-backed snapshot before checkout.",
      items: [
        { dimension: "fit", claim: `Recommended size ${passport.fit.recommended_size}`, confidence: passport.fit.confidence, buyer_action: "Choose recommended size or inspect measurements.", fact_ids: passport.fit.fact_ids },
        { dimension: "fabric", claim: passport.product.fabric, confidence: passport.proof_coverage.fabric.sufficient ? "medium" : "weak", buyer_action: passport.proof_coverage.fabric.sufficient ? "Proceed normally." : "Ask seller for fabric proof.", fact_ids: passport.proof_coverage.fabric.fact_ids },
        { dimension: "color", claim: passport.product.color_family, confidence: "medium", buyer_action: "Check daylight image if color matters.", fact_ids: passport.review_evidence.color.fact_ids },
        { dimension: "dispatch", claim: passport.product.delivery_text, confidence: "medium", buyer_action: "Review delivery promise.", fact_ids: [] },
        { dimension: "offer", claim: passport.offer_truth.message, confidence: passport.offer_truth.status === "verified_price_drop" ? "high" : "medium", buyer_action: passport.offer_truth.buyer_guidance, fact_ids: passport.offer_truth.fact_ids }
      ],
      fact_ids: passport.fact_ids,
      privacy: { buyer_visible: true, seller_visible_as_aggregate_only: true, raw_private_memory_exposed: false }
    },
    created_at: nowIso(),
    completed_at: null,
    outcome_order_id: null,
    broken_dimension: null,
    fact_id
  };
}

function recommendationForAttribute(attribute: string) {
  const map: Record<string, string> = { transparency: "daylight_photo", fabric: "fabric_closeup", color: "daylight_photo", size: "measurement_chart", packaging: "packaging_photo", offer: "seller_note" };
  return map[attribute] ?? "seller_note";
}

async function suggestCluster(category: string, garmentType: string, colorFamily: string) {
  const cluster = await collections(db).clusters.findOne({ category });
  return cluster?.cluster_id ?? `cluster_${category}_${garmentType}_${colorFamily}`.replaceAll(" ", "_").toLowerCase();
}

async function recordAdminEvent(account: any, action: string, targetType: string, targetId: string, sellerId: string | null, decision: string, notes: string) {
  await collections(db).adminAuditEvents.insertOne({ event_id: id("admin_event"), actor_account_id: account.account_id, actor_name: account.display_name, action, target_type: targetType, target_id: targetId, seller_id: sellerId, decision, notes, created_at: nowIso() });
}

function defaultScenarios() {
  return [{
    scenario_id: "mentor_checkout_flow",
    title: "Checkout trust and prepaid nudge",
    description: "Buyer saves a product, Sarthi checks trust, and checkout decides whether prepaid can be nudged.",
    buyer_id: "buyer_asha",
    cluster_id: "cluster_floral_blue",
    product_id: "kurti_1_1",
    variant_id: "kurti_1_1_xl",
    question: "Mera usual L hai, kapda thin toh nahi hai?",
    expected: ["trust score", "proof gap", "checkout confidence"],
    start: { screen: "buyer_feed", buyer_id: "buyer_asha", cluster_id: "cluster_floral_blue", product_id: "kurti_1_1", variant_id: "kurti_1_1_xl" },
    data_disclosure: "MongoDB Atlas seeded evidence is used until official connectors are available."
  }];
}

function uniqueBy(rows: any[], key: string) {
  const map = new Map();
  for (const row of rows) map.set(row[key], row);
  return [...map.values()];
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(3));
}

process.on("SIGINT", async () => {
  await closeMongo();
  process.exit(0);
});

await app.listen({ port: env.port, host: "0.0.0.0" });
