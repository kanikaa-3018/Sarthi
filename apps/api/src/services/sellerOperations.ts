import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { id, sha256 } from "./crypto.js";
import {
  avoidableIssue,
  publicProduct,
  sellerVerification,
  sourceHealth,
  variantEvidence,
  variantsForProduct
} from "./domain.js";
import { label, withoutId } from "./format.js";
import { nowIso } from "./time.js";

export async function listSellers(db: Db) {
  const c = collections(db);
  const sellers = await c.sellers.find({}).toArray();
  return Promise.all(sellers.map(async (seller: any) => {
    const products = await c.products.find({ seller_id: seller.seller_id }).project({ cluster_id: 1 }).toArray();
    return {
      seller_id: seller.seller_id,
      name: seller.name,
      median_dispatch_hours: seller.median_dispatch_hours,
      product_count: products.length,
      cluster_ids: [...new Set(products.map((product: any) => product.cluster_id))]
    };
  }));
}

export async function sellerPanel(db: Db, sellerId: string, clusterId?: string) {
  const c = collections(db);
  const seller = await c.sellers.findOne({ seller_id: sellerId });
  const firstProduct = await c.products.findOne({ seller_id: sellerId });
  const selectedCluster = clusterId ?? firstProduct?.cluster_id ?? "cluster_floral_blue";
  const listings = await c.products.find({ cluster_id: selectedCluster }).toArray();
  const cards = await Promise.all(listings.map((product: any) => listingCard(db, product)));
  const own = cards.filter((card) => card.seller.seller_id === sellerId);
  const competitors = cards.filter((card) => card.seller.seller_id !== sellerId);
  const cluster = await c.clusters.findOne({ cluster_id: selectedCluster });
  const sellerProducts = await c.products.find({ seller_id: sellerId }).project({ cluster_id: 1 }).toArray();
  return {
    seller: {
      seller_id: sellerId,
      name: seller?.name ?? "",
      median_dispatch_hours: seller?.median_dispatch_hours ?? 48,
      product_count: sellerProducts.length,
      cluster_ids: [...new Set(sellerProducts.map((product: any) => product.cluster_id))]
    },
    seller_verification: await sellerVerification(db, sellerId),
    data_freshness: await sourceHealth(db),
    cluster: {
      cluster_id: selectedCluster,
      label: cluster?.label ?? selectedCluster,
      size: "XL",
      listing_count: listings.length,
      seller_count: new Set(listings.map((item: any) => item.seller_id)).size,
      stats: {
        delivered_orders_90d: cards.reduce((sum, card) => sum + card.metrics.delivered_orders_90d, 0),
        returns_90d: cards.reduce((sum, card) => sum + card.metrics.returns_90d, 0),
        median_return_rate: median(cards.map((card) => card.metrics.return_rate).filter((value) => value !== null) as number[]),
        median_dispatch_hours: median(cards.map((card) => card.metrics.median_dispatch_hours)),
        minimum_orders_for_strong_decision: 30
      }
    },
    decision_policy: {
      name: "Sarthi weighted confidence score",
      weights: {
        sku_outcome: 18,
        seller_reliability: 15,
        seller_verification: 12,
        fit: 12,
        review_credibility: 12,
        product_rating: 10,
        proof: 8,
        offer: 6,
        dispatch: 5,
        price: 2
      },
      inputs_used: ["aggregate outcomes", "seller verification", "review credibility"],
      inputs_not_used: ["private buyer memory"]
    },
    seller_listings: own,
    competing_listings: competitors,
    privacy_guard: {
      safe_for_seller: true,
      summary: "Seller view uses aggregate listing evidence only. Buyer memory and identity are not exposed."
    },
    fact_ids: [...new Set(cards.flatMap((card) => card.fact_ids))].slice(0, 16)
  };
}

export async function listingCard(db: Db, product: any) {
  const c = collections(db);
  const seller = await c.sellers.findOne({ seller_id: product.seller_id });
  const variants = await variantsForProduct(db, product.product_id);
  const variant = variants.find((item: any) => item.size === "XL") ?? variants[0];
  const evidence = await variantEvidence(db, variant.variant_id);
  const topIssue = await topIssueForCard(db, variant.variant_id);
  const score = Math.round((1 - evidence.return_rate) * 55 + (product.rating / 5) * 25 + (seller?.median_dispatch_hours ? Math.max(0, 20 - seller.median_dispatch_hours / 4) : 8));
  return {
    product: publicProduct({ ...product, seller_name: seller?.name, median_dispatch_hours: seller?.median_dispatch_hours }),
    variant,
    seller: { seller_id: product.seller_id, name: seller?.name ?? "", median_dispatch_hours: seller?.median_dispatch_hours },
    quality_score: Math.max(0, Math.min(100, score)),
    decision_status: evidence.evidence_strength === "weak" ? "insufficient_evidence" : evidence.return_rate > 0.2 ? "needs_seller_action" : "eligible_for_recommendation",
    cluster_position: null,
    metrics: {
      kept_rate: evidence.delivered_orders_90d ? 1 - evidence.return_rate : null,
      return_rate: evidence.return_rate,
      fit_as_expected_rate: evidence.fit_as_expected_rate,
      color_match_rate: evidence.delivered_orders_90d ? 1 - evidence.color_mismatch_returns / evidence.delivered_orders_90d : null,
      delivered_orders_90d: evidence.delivered_orders_90d,
      returns_90d: evidence.returns_90d,
      color_mismatch_returns: evidence.color_mismatch_returns,
      median_dispatch_hours: evidence.median_dispatch_hours,
      evidence_strength: evidence.evidence_strength
    },
    top_issue: topIssue,
    action_items: topIssue ? [{
      priority: "high",
      title: `${label(topIssue.return_reason)} needs proof`,
      rationale: "Repeated buyer outcomes show an avoidable issue.",
      metric: topIssue.return_reason,
      fact_ids: topIssue.fact_ids
    }] : [],
    fact_ids: evidence.fact_ids
  };
}

export async function topIssueForCard(db: Db, variantId: string) {
  const issue = await avoidableIssue(db, variantId);
  return issue ? { return_reason: issue.reason, count: issue.count, fact_ids: issue.fact_ids } : null;
}

export async function sellerEvidenceCoach(db: Db, sellerId: string) {
  const c = collections(db);
  const requests = await c.proofRequests.find({ seller_id: sellerId, status: "open" }).toArray();
  const tasks = await Promise.all(requests.map(async (request: any) => {
    const product = await c.products.findOne({ product_id: request.product_id });
    return {
      type: "missing_buyer_proof",
      priority: request.request_count >= 3 ? "high" : "medium",
      product_id: request.product_id,
      product_title: product?.title ?? request.product_id,
      attribute: request.attribute,
      title: `${label(request.attribute)} proof requested`,
      rationale: `${request.request_count} buyer doubt(s) need aggregate proof before stronger trust.`,
      recommended_proof_type: recommendationForAttribute(request.attribute),
      buyer_demand: request.request_count,
      first_seen_at: request.created_at,
      last_seen_at: request.updated_at,
      fact_ids: [request.fact_id]
    };
  }));
  return {
    seller_id: sellerId,
    open_task_count: tasks.length,
    resolved_request_count: await c.proofRequests.countDocuments({ seller_id: sellerId, status: "resolved" }),
    tasks,
    privacy_guard: {
      safe_for_seller: true,
      summary: "Only aggregate proof demand is shown. No buyer identity or fit memory is exposed."
    }
  };
}

export async function submitSellerEvidence(db: Db, sellerId: string, body: any) {
  const c = collections(db);
  const product = await c.products.findOne({ product_id: body.product_id });
  if (!product || product.seller_id !== sellerId) {
    const error = new Error("Cannot submit proof for another seller listing");
    (error as any).statusCode = 403;
    throw error;
  }
  const proof_id = id("proof");
  const fact_id = id("fact_proof");
  await c.sellerEvidenceAssets.insertOne({
    proof_id,
    seller_id: sellerId,
    product_id: body.product_id,
    attribute: body.attribute,
    proof_type: body.proof_type,
    title: body.title,
    description: body.description,
    asset_url: body.asset_url,
    status: "verified",
    created_at: nowIso(),
    reviewed_at: nowIso(),
    fact_id
  });
  const update = await c.proofRequests.updateMany(
    { seller_id: sellerId, product_id: body.product_id, attribute: body.attribute, status: "open" },
    { $set: { status: "resolved", resolved_at: nowIso(), resolution_proof_id: proof_id, updated_at: nowIso() } }
  );
  await c.facts.insertOne({
    fact_id,
    source_table: "seller_evidence_assets",
    source_id: proof_id,
    source_type: "seller_proof",
    summary: `${label(body.attribute)} proof submitted by seller.`,
    created_at: nowIso(),
    expires_at: null
  });
  return {
    proof_id,
    seller_id: sellerId,
    product_id: body.product_id,
    attribute: body.attribute,
    proof_type: body.proof_type,
    status: "verified",
    fact_id,
    resolved_open_requests: update.modifiedCount
  };
}

export async function sellerOnboarding(db: Db, sellerId: string) {
  const c = collections(db);
  const sellerList = await listSellers(db);
  const seller = sellerList.find((item) => item.seller_id === sellerId) ?? {
    seller_id: sellerId,
    name: "",
    median_dispatch_hours: 48,
    product_count: 0,
    cluster_ids: []
  };
  const [application, documents, drafts, verification] = await Promise.all([
    c.sellerApplications.findOne({ seller_id: sellerId }, { sort: { created_at: -1 } }),
    c.sellerVerificationDocuments.find({ seller_id: sellerId }).toArray(),
    c.listingDrafts.find({ seller_id: sellerId }).toArray(),
    sellerVerification(db, sellerId)
  ]);
  const missingDocs = ["gst_certificate", "address_proof", "bank_proof"].filter((type) => !documents.some((doc: any) => doc.document_type === type));
  return {
    seller: { ...seller, product_count: seller.product_count },
    seller_verification: verification,
    application: application ? withoutId(application) : null,
    documents: documents.map(withoutId),
    listing_drafts: drafts.map(withoutId),
    policy: {
      buyer_feed_blocked_until: ["seller verification approved", "listing draft approved"],
      personal_buyer_data_used: false,
      new_listing_default: "limited_evidence"
    },
    next_actions: [
      ...missingDocs.map((doc) => ({ priority: "high", title: `Upload ${label(doc)}`, detail: "Required for seller verification.", blocked: true })),
      ...(verification.verification_status !== "verified" ? [{ priority: "high", title: "Wait for admin verification", detail: "Buyer-facing trust remains limited until approval.", blocked: true }] : [])
    ]
  };
}

export async function submitSellerDocument(db: Db, sellerId: string, body: any) {
  const document = {
    document_id: id("doc"),
    seller_id: sellerId,
    document_type: body.document_type,
    reference: body.reference,
    file_name: body.file_name,
    mime_type: body.mime_type,
    file_size_bytes: Buffer.from(body.content_base64 ?? "", "base64").length,
    sha256: sha256(body.content_base64 ?? body.reference ?? ""),
    storage_uri: `mongodb-atlas/seller_documents/${sellerId}/${body.file_name}`,
    uploaded_at: nowIso(),
    status: "submitted",
    submitted_at: nowIso(),
    reviewed_at: null,
    notes: "Submitted for TrustOps review."
  };
  await collections(db).sellerVerificationDocuments.insertOne(document);
  return sellerOnboarding(db, sellerId);
}

export async function createListingDraft(db: Db, sellerId: string, body: any) {
  const draft = {
    draft_id: id("draft"),
    seller_id: sellerId,
    ...body,
    target_cluster_id: await suggestCluster(db, body.category, body.garment_type, body.color_family),
    status: "draft",
    readiness_status: "blocked_seller_verification",
    created_at: nowIso(),
    updated_at: nowIso(),
    submitted_at: null
  };
  await collections(db).listingDrafts.insertOne(draft);
  return sellerOnboarding(db, sellerId);
}

export async function submitListingDraft(db: Db, sellerId: string, draftId: string) {
  await collections(db).listingDrafts.updateOne(
    { draft_id: draftId, seller_id: sellerId },
    { $set: { status: "submitted", updated_at: nowIso(), submitted_at: nowIso() } }
  );
  return sellerOnboarding(db, sellerId);
}

export async function assertSellerOwnsProduct(db: Db, sellerId: string, productId: string) {
  const product = await collections(db).products.findOne({ product_id: productId });
  if (!product || product.seller_id !== sellerId) {
    const error = new Error("Cannot edit another seller listing");
    (error as any).statusCode = 403;
    throw error;
  }
}

function recommendationForAttribute(attribute: string) {
  const map: Record<string, string> = {
    transparency: "daylight_photo",
    fabric: "fabric_closeup",
    color: "daylight_photo",
    size: "measurement_chart",
    packaging: "packaging_photo",
    offer: "seller_note"
  };
  return map[attribute] ?? "seller_note";
}

async function suggestCluster(db: Db, category: string, garmentType: string, colorFamily: string) {
  const cluster = await collections(db).clusters.findOne({ category });
  return cluster?.cluster_id ?? `cluster_${category}_${garmentType}_${colorFamily}`.replaceAll(" ", "_").toLowerCase();
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(3));
}
