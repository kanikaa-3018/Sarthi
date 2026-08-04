import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import {
  fitPrediction,
  productForVariant,
  proofCoverage,
  publicProduct,
  rankCluster,
  sellerVerification,
  sourceHealth,
  variantEvidence,
  variantsForProduct,
  verifyOffer
} from "./domain.js";
import { withoutId } from "./format.js";
import { readLlmCache, stableDataCacheKey, writeLlmCache } from "./llmCache.js";
import { projectGraphToNeo4j } from "./neo4jGraph.js";
import { topIssueForCard } from "./sellerOperations.js";
import { resolveSimilarListingSet } from "./similarListings.js";

const GRAPH_CACHE_VERSION = "cluster_knowledge_graph_v2";
const GRAPH_CACHE_TTL_MS = 3 * 60 * 1000;

export async function clusterKnowledgeGraph(db: Db, buyerId: string, clusterId: string, selectedProductId?: string, selectedVariantId?: string) {
  const cachePlan = await clusterKnowledgeGraphCachePlan(db, buyerId, clusterId, selectedProductId, selectedVariantId);
  const cached = await readLlmCache(db, cachePlan.cache_key);
  if (isCachedGraphPayload(cached)) {
    return withGraphCacheState(cached.graph, "hit", cachePlan);
  }

  const graph = await buildClusterKnowledgeGraph(db, buyerId, clusterId, selectedProductId, selectedVariantId, cachePlan);
  const graphWithCache = withGraphCacheState(graph, "miss", cachePlan);
  await writeLlmCache(
    db,
    cachePlan.cache_key,
    "cluster_knowledge_graph",
    {
      cache_version: GRAPH_CACHE_VERSION,
      evidence_version: cachePlan.evidence_version,
      graph: graphWithCache
    },
    { ttlMs: GRAPH_CACHE_TTL_MS }
  );
  return graphWithCache;
}

async function buildClusterKnowledgeGraph(
  db: Db,
  buyerId: string,
  clusterId: string,
  selectedProductId?: string,
  selectedVariantId?: string,
  cachePlan?: GraphCachePlan
) {
  const c = collections(db);
  const cluster = cachePlan?.cluster ?? await c.clusters.findOne({ cluster_id: clusterId });
  const selectedVariant = cachePlan?.selected_variant ?? (selectedVariantId
    ? await c.variants.findOne({ variant_id: selectedVariantId })
    : null);
  const selectedSize = selectedVariant?.size ?? null;
  const similarity = cachePlan?.similarity ?? (selectedProductId ? await resolveSimilarListingSet(db, selectedProductId) : null);
  const comparableProductIds = similarity?.comparable_product_ids ?? [];
  const products = cachePlan?.products ?? (comparableProductIds.length
    ? (await c.products.find({ product_id: { $in: comparableProductIds }, is_sarthi_eligible: 1 }).toArray())
      .sort((left: any, right: any) => comparableProductIds.indexOf(left.product_id) - comparableProductIds.indexOf(right.product_id))
    : await c.products.find({ cluster_id: clusterId, is_sarthi_eligible: 1 }).toArray());
  const ranking = await rankCluster(db, buyerId, clusterId, "comfort", {
    productIds: comparableProductIds,
    selectedVariantId: selectedVariant?.variant_id
  });
  const nodes: any[] = [{
    id: clusterId,
    type: "cluster",
    label: cluster?.label ?? clusterId,
    subtitle: "Comparable listing group",
    status: "active",
    score: null,
    fact_ids: [],
    data: {}
  }, {
    id: `buyer:${buyerId}`,
    type: "buyer_context",
    label: "Your fit memory",
    subtitle: "Private buyer signal, never shared with sellers",
    status: "private",
    score: null,
    fact_ids: [],
    data: { privacy_scope: "buyer_only" }
  }];
  const edges: any[] = [];
  const seller_context = [];
  const factIds = new Set<string>(ranking.fact_ids);

  for (const product of products.slice(0, 4)) {
    const seller = await c.sellers.findOne({ seller_id: product.seller_id });
    const publicP = publicProduct({ ...product, seller_name: seller?.name });
    const variants = await variantsForProduct(db, product.product_id);
    const variant = selectGraphVariant(variants, product.product_id, selectedVariant, selectedSize);
    if (!variant) continue;
    const evidence = await variantEvidence(db, variant.variant_id);
    const fit = await fitPrediction(db, buyerId, variant.variant_id);
    const reviews = await c.reviews.find({ product_id: product.product_id }).limit(5).toArray();
    const candidate = ranking.candidates.find((item: any) => item.variant_id === variant.variant_id) ?? null;
    const verification = await sellerVerification(db, product.seller_id);
    const offer = await verifyOffer(db, variant.variant_id);
    const coverage = await proofCoverage(db, product.product_id, variant.variant_id, { evidence });
    const proofItems = Object.values(coverage) as any[];
    const proofFactIds = proofItems.flatMap((item: any) => item.fact_ids ?? []);
    const missingProofCount = proofItems.filter((item: any) => !item.sufficient).length;
    const reviewFactIds = reviews.flatMap((review: any) => review.fact_id ? [review.fact_id] : []);
    const productNode = `product:${product.product_id}`;
    const sellerNode = `seller:${product.seller_id}`;
    const skuNode = `sku:${variant.variant_id}`;
    const returnsNode = `returns:${variant.variant_id}`;
    const reviewsNode = `reviews:${product.product_id}`;
    const offerNode = `offer:${variant.variant_id}`;
    const priceNode = `price:${variant.variant_id}`;
    const proofNode = `proof:${product.product_id}`;
    const scoreNode = `score:${variant.variant_id}`;
    const buyerFitNode = `buyer:${buyerId}`;

    nodes.push({
      id: sellerNode,
      type: "seller",
      label: seller?.name ?? product.seller_id,
      subtitle: "Seller reliability",
      status: verification.verification_status,
      score: candidate?.factors.seller_trust ?? null,
      fact_ids: [],
      data: verification
    });
    nodes.push({
      id: productNode,
      type: "product",
      label: product.title.split("-")[0].trim(),
      subtitle: product.fabric,
      status: "listed",
      score: product.rating,
      fact_ids: [],
      data: { rating: product.rating }
    });
    nodes.push({
      id: skuNode,
      type: "sku",
      label: variant.size,
      subtitle: `${evidence.delivered_orders_90d} delivered outcomes`,
      status: evidence.evidence_strength,
      score: candidate?.score ?? null,
      fact_ids: evidence.fact_ids,
      data: evidence
    });
    nodes.push({
      id: returnsNode,
      type: "return_reason",
      label: `${Math.round(evidence.return_rate * 100)}% returns`,
      subtitle: `${evidence.delivered_orders_90d} delivered outcomes checked`,
      status: evidence.return_rate > 0.18 ? "high_return_risk" : evidence.evidence_strength,
      score: evidence.return_rate,
      fact_ids: evidence.fact_ids,
      data: evidence
    });
    nodes.push({
      id: reviewsNode,
      type: "reviews",
      label: `${reviews.length} review samples`,
      subtitle: "Reviews are weighted by buyer credibility",
      status: reviews.length ? "weighted" : "limited",
      score: candidate?.factors.review_signal ?? null,
      fact_ids: reviewFactIds,
      data: { sample_count: reviews.length }
    });
    nodes.push({
      id: offerNode,
      type: "offer",
      label: offer.status === "verified_price_drop" ? "Offer OK" : offer.status === "no_need_to_rush" ? "Price proof checked" : "Offer check",
      subtitle: offer.message,
      status: offer.status,
      score: candidate?.factors.offer_truth ?? null,
      fact_ids: offer.fact_ids,
      data: {
        status: offer.status,
        price_evidence: offer.price_evidence,
        campaign_evidence: offer.campaign_evidence,
        inventory_evidence: offer.inventory_evidence
      }
    });
    nodes.push({
      id: priceNode,
      type: "price",
      label: offer.price_evidence?.latest_price ? `Rs ${offer.price_evidence.latest_price}` : "Price history",
      subtitle: offer.campaign_evidence?.timer_reset_count
        ? `${offer.campaign_evidence.timer_reset_count} campaign timer reset(s) checked`
        : "Price history and campaign evidence",
      status: offer.truth_basis,
      score: candidate?.factors.price_value ?? null,
      fact_ids: offer.fact_ids,
      data: {
        latest_price: offer.price_evidence?.latest_price ?? null,
        reference_price: offer.price_evidence?.reference_price ?? null,
        price_event_count: offer.price_evidence?.price_event_count ?? 0,
        campaign_reset_count: offer.campaign_evidence?.timer_reset_count ?? 0,
        buyer_guidance: offer.buyer_guidance
      }
    });
    nodes.push({
      id: proofNode,
      type: "proof",
      label: missingProofCount ? `${missingProofCount} proof gaps` : "Proof covered",
      subtitle: missingProofCount ? "Seller proof is still missing for some claims" : "Proof and outcome evidence cover key claims",
      status: missingProofCount ? "missing_proof" : "covered",
      score: Number(((proofItems.length - missingProofCount) / Math.max(1, proofItems.length)).toFixed(2)),
      fact_ids: proofFactIds,
      data: coverage
    });
    nodes.push({
      id: scoreNode,
      type: "evidence",
      label: `${Math.floor((candidate?.score ?? 0) * 100)}/100 trust`,
      subtitle: "Weighted score from connected seller, SKU, review, proof, offer, and fit signals",
      status: candidate?.score
        ? candidate.score >= 0.72
          ? "recommended"
          : candidate.score >= 0.58
            ? "needs_one_check"
            : "cautious"
        : "not_ranked",
      score: candidate?.score ?? null,
      fact_ids: candidate?.fact_ids ?? ranking.fact_ids,
      data: {
        factors: candidate?.factors ?? {},
        score_breakdown: candidate?.score_breakdown ?? null,
        weight_version: candidate?.weight_version ?? ranking.weighting?.version ?? null
      }
    });
    edges.push(
      edge(clusterId, productNode, "contains", [], 0.8),
      edge(productNode, sellerNode, "sold by", [], 0.8),
      edge(productNode, skuNode, "has sku", evidence.fact_ids, 0.9),
      edge(skuNode, returnsNode, "has outcomes", evidence.fact_ids, 0.9),
      edge(productNode, reviewsNode, "has reviews", reviewFactIds, 0.72),
      edge(skuNode, offerNode, "has offer check", offer.fact_ids, 0.64),
      edge(offerNode, priceNode, "checks price history", offer.fact_ids, 0.74),
      edge(priceNode, scoreNode, "price history guides buyer", offer.fact_ids, factorWeight(candidate, "price_value")),
      edge(productNode, proofNode, "has seller proof", proofFactIds, missingProofCount ? 0.45 : 0.78),
      edge(buyerFitNode, skuNode, "private fit check", fit.fact_ids ?? [], 0.68),
      edge(skuNode, scoreNode, "SKU scored", evidence.fact_ids, 0.9),
      edge(sellerNode, scoreNode, "seller trust affects score", candidate?.fact_ids ?? [], factorWeight(candidate, "seller_trust")),
      edge(returnsNode, scoreNode, "returns affect score", evidence.fact_ids, factorWeight(candidate, "outcome_quality")),
      edge(reviewsNode, scoreNode, "reviews affect score", reviewFactIds, factorWeight(candidate, "review_signal")),
      edge(proofNode, scoreNode, "proof affects score", proofFactIds, factorWeight(candidate, "proof_coverage")),
      edge(offerNode, scoreNode, "offer truth affects score", offer.fact_ids, factorWeight(candidate, "offer_truth")),
      edge(buyerFitNode, scoreNode, "private fit affects score", fit.fact_ids ?? [], factorWeight(candidate, "fit_match")),
      edge(returnsNode, reviewsNode, "returns challenge reviews", [...evidence.fact_ids, ...reviewFactIds], evidence.return_rate > 0.16 ? 0.86 : 0.58),
      edge(returnsNode, proofNode, "returns create proof need", [...evidence.fact_ids, ...proofFactIds], missingProofCount ? 0.82 : 0.46),
      edge(proofNode, reviewsNode, "proof checks review claims", [...proofFactIds, ...reviewFactIds], missingProofCount ? 0.76 : 0.62),
      edge(sellerNode, proofNode, "seller provides proof", proofFactIds, verification.verification_status === "verified" ? 0.72 : 0.52),
      edge(offerNode, proofNode, "timer needs proof", offer.fact_ids, offer.status === "verified_price_drop" ? 0.5 : 0.78)
    );
    for (const fact of [...evidence.fact_ids, ...reviewFactIds, ...offer.fact_ids, ...proofFactIds, ...(fit.fact_ids ?? [])]) {
      factIds.add(fact);
    }
    seller_context.push({
      product: publicP,
      seller: {
        seller_id: product.seller_id,
        name: seller?.name,
        verification
      },
      variant,
      evidence,
      fit,
      reviews: reviews.map(withoutId),
      top_return_reason: await topIssueForCard(db, variant.variant_id),
      price_context: {
        latest_price: variant.current_price,
        campaign: offer.campaign_evidence,
        inventory: offer.inventory_evidence,
        offer
      },
      proof_coverage: coverage,
      candidate,
      node_ids: {
        product: productNode,
        seller: sellerNode,
        sku: skuNode,
        returns: returnsNode,
        reviews: reviewsNode,
        offer: offerNode,
        price: priceNode,
        proof: proofNode,
        score: scoreNode,
        buyer_fit: buyerFitNode
      }
    });
  }

  const graph: any = {
    buyer_id: buyerId,
    cluster: {
      cluster_id: clusterId,
      label: cluster?.label ?? clusterId,
      category: cluster?.category ?? "unknown",
      listing_count: products.length
    },
    summary: {
      title: "MongoDB evidence map projection",
      body: "Server-built evidence map from indexed MongoDB facts.",
      dynamic: true,
      graph_engine: "mongodb_projection",
      similarity: similarity ? {
        method: similarity.method,
        summary: similarity.summary,
        distinct_seller_count: similarity.distinct_seller_count,
        candidates: similarity.candidates.slice(0, 4),
        agent: similarity.agent
      } : null,
      source_health: cachePlan?.source_health ?? await sourceHealth(db),
      fact_count: factIds.size
    },
    ranking,
    selected_product_id: selectedProductId ?? (await productForVariant(db, ranking.winner))?.product_id ?? null,
    selected_variant_id: selectedVariant?.variant_id ?? null,
    selected_size: selectedSize,
    nodes: uniqueBy(nodes, "id"),
    edges,
    seller_context,
    fact_ids: [...factIds],
    evidence_paths: [],
    chat_suggestions: ["Which seller is safest?", "Why are these similar?", "Do returns affect reviews?", "Is this offer real?"]
  };
  graph.evidence_paths = buildEvidencePaths(graph);
  const neo4j = await projectGraphToNeo4j(graph);
  return {
    ...graph,
    summary: {
      ...graph.summary,
      title: neo4j.engine === "neo4j_projection" ? "Neo4j evidence graph projection" : graph.summary.title,
      body: neo4j.engine === "neo4j_projection"
        ? "Server-built evidence map projected into Neo4j for relationship traversal."
        : neo4j.enabled
          ? `MongoDB evidence map is active. Neo4j projection is configured but currently ${neo4j.status}.`
          : "Server-built evidence map from indexed MongoDB facts. Enable Neo4j to project the same nodes into a graph runtime.",
      graph_engine: neo4j.engine,
      neo4j_projection: neo4j
    }
  };
}

type GraphCachePlan = {
  cache_key: string;
  cache_version: string;
  ttl_seconds: number;
  evidence_version: string;
  source_health: any;
  cluster: any;
  selected_variant: any | null;
  selected_size: string | null;
  similarity: Awaited<ReturnType<typeof resolveSimilarListingSet>> | null;
  products: any[];
};

async function clusterKnowledgeGraphCachePlan(
  db: Db,
  buyerId: string,
  clusterId: string,
  selectedProductId?: string,
  selectedVariantId?: string
): Promise<GraphCachePlan> {
  const c = collections(db);
  const [cluster, selectedVariant, sourceHealthValue] = await Promise.all([
    c.clusters.findOne({ cluster_id: clusterId }),
    selectedVariantId ? c.variants.findOne({ variant_id: selectedVariantId }) : Promise.resolve(null),
    sourceHealth(db)
  ]);
  const selectedSize = selectedVariant?.size ?? null;
  const similarity = selectedProductId ? await resolveSimilarListingSet(db, selectedProductId) : null;
  const comparableProductIds = similarity?.comparable_product_ids ?? [];
  const products = comparableProductIds.length
    ? (await c.products.find({ product_id: { $in: comparableProductIds }, is_sarthi_eligible: 1 }).toArray())
      .sort((left: any, right: any) => comparableProductIds.indexOf(left.product_id) - comparableProductIds.indexOf(right.product_id))
    : await c.products.find({ cluster_id: clusterId, is_sarthi_eligible: 1 }).toArray();
  const evidenceVersion = await graphEvidenceVersion(db, buyerId, products, sourceHealthValue);
  const cacheKey = stableDataCacheKey("cluster_knowledge_graph", {
    cache_version: GRAPH_CACHE_VERSION,
    buyer_id: buyerId,
    cluster_id: clusterId,
    selected_product_id: selectedProductId ?? null,
    selected_variant_id: selectedVariant?.variant_id ?? selectedVariantId ?? null,
    selected_size: selectedSize,
    comparable_product_ids: products.map((product: any) => product.product_id),
    evidence_version: evidenceVersion
  });

  return {
    cache_key: cacheKey,
    cache_version: GRAPH_CACHE_VERSION,
    ttl_seconds: Math.floor(GRAPH_CACHE_TTL_MS / 1000),
    evidence_version: evidenceVersion,
    source_health: sourceHealthValue,
    cluster,
    selected_variant: selectedVariant,
    selected_size: selectedSize,
    similarity,
    products
  };
}

async function graphEvidenceVersion(db: Db, buyerId: string, products: any[], health: any) {
  const c = collections(db);
  const productIds = products.map((product: any) => product.product_id).filter(Boolean);
  const sellerIds = [...new Set(products.map((product: any) => product.seller_id).filter(Boolean))];
  const variants = productIds.length
    ? await c.variants.find({ product_id: { $in: productIds } }).toArray()
    : [];
  const variantIds = variants.map((variant: any) => variant.variant_id).filter(Boolean);
  const [
    outcomes,
    reviews,
    proofRequests,
    proofAssets,
    priceEvents,
    campaigns,
    inventory,
    fitProfiles,
    fitMemory,
    sellerProfiles,
    featureWeights
  ] = await Promise.all([
    variantIds.length ? c.outcomes.find({ variant_id: { $in: variantIds } }).toArray() : Promise.resolve([]),
    productIds.length ? c.reviews.find({ product_id: { $in: productIds } }).toArray() : Promise.resolve([]),
    productIds.length ? c.proofRequests.find({ product_id: { $in: productIds }, status: { $in: ["open", "submitted"] } }).toArray() : Promise.resolve([]),
    productIds.length ? c.sellerEvidenceAssets.find({ product_id: { $in: productIds }, status: { $in: ["submitted", "verified"] } }).toArray() : Promise.resolve([]),
    variantIds.length ? c.priceEvents.find({ variant_id: { $in: variantIds } }).toArray() : Promise.resolve([]),
    variantIds.length ? c.campaigns.find({ variant_id: { $in: variantIds } }).toArray() : Promise.resolve([]),
    variantIds.length ? c.inventorySnapshots.find({ variant_id: { $in: variantIds } }).toArray() : Promise.resolve([]),
    c.buyerFitProfiles.find({ buyer_id: buyerId }).toArray(),
    c.fitMemory.find({ buyer_id: buyerId }).toArray(),
    sellerIds.length ? c.sellerProfiles.find({ seller_id: { $in: sellerIds } }).toArray() : Promise.resolve([]),
    c.featureWeights.find({ active: { $ne: 0 } }).toArray()
  ]);

  return cacheDigest({
    source_health: (health?.sources ?? []).map((source: any) => pickStable(source, ["source_id", "last_synced_at", "effective_status", "status"])),
    products: rowsForVersion(products, ["product_id", "seller_id", "title", "category", "garment_type", "fabric", "color_family", "base_price", "rating", "rating_count", "source_refs", "quality_signals", "media_evidence", "fulfillment"]),
    variants: rowsForVersion(variants, ["variant_id", "product_id", "size", "current_price", "stock"]),
    outcomes: rowsForVersion(outcomes, ["order_id", "variant_id", "status", "return_reason", "fact_id", "created_at"]),
    reviews: rowsForVersion(reviews, ["review_id", "product_id", "reviewer_buyer_id", "rating", "verified_purchase", "credibility_weight", "credibility_flags", "created_at", "fact_id"]),
    proof_requests: rowsForVersion(proofRequests, ["request_id", "buyer_id", "seller_id", "product_id", "variant_id", "attribute", "status", "request_count", "updated_at", "created_at"]),
    proof_assets: rowsForVersion(proofAssets, ["proof_id", "seller_id", "product_id", "attribute", "proof_type", "status", "fact_id", "reviewed_at", "submitted_at", "created_at"]),
    price_events: rowsForVersion(priceEvents, ["price_event_id", "variant_id", "price", "event_type", "created_at", "fact_id"]),
    campaigns: rowsForVersion(campaigns, ["campaign_id", "variant_id", "start_at", "end_at", "timer_reset_count", "fact_id"]),
    inventory: rowsForVersion(inventory, ["snapshot_id", "variant_id", "available_to_promise", "sales_velocity_24h", "captured_at", "fact_id"]),
    fit_profiles: rowsForVersion(fitProfiles, ["profile_id", "buyer_id", "active", "label", "relationship", "preferred_fit", "size_map", "updated_at"]),
    fit_memory: rowsForVersion(fitMemory, ["memory_id", "buyer_id", "category", "anchor_variant_id", "retained_size", "preferred_fit", "confidence", "updated_at"]),
    seller_profiles: rowsForVersion(sellerProfiles, ["seller_id", "verification_status", "gst_status", "kyc_status", "pickup_pincode", "data_access_level", "restricted_reason", "last_verified_at"]),
    feature_weights: rowsForVersion(featureWeights, ["category", "version", "active", "weights"])
  });
}

function withGraphCacheState(graph: any, status: "hit" | "miss", plan: GraphCachePlan) {
  return {
    ...graph,
    summary: {
      ...graph.summary,
      cache: {
        status,
        cache_key: plan.cache_key,
        cache_version: plan.cache_version,
        evidence_version: plan.evidence_version,
        ttl_seconds: plan.ttl_seconds
      }
    }
  };
}

function isCachedGraphPayload(value: unknown): value is { graph: any } {
  return Boolean(value && typeof value === "object" && (value as any).cache_version === GRAPH_CACHE_VERSION && (value as any).graph);
}

function cacheDigest(payload: Record<string, unknown>) {
  return stableDataCacheKey("graph_evidence_version", payload).split(":")[1] ?? "unknown";
}

function rowsForVersion(rows: any[], fields: string[]) {
  return rows
    .map((row) => pickStable(row, fields))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function pickStable(row: any, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, row?.[field] ?? null]));
}

function selectGraphVariant(variants: any[], productId: string, selectedVariant: any | null, selectedSize: string | null) {
  if (selectedVariant?.product_id === productId) {
    return variants.find((variant: any) => variant.variant_id === selectedVariant.variant_id) ?? null;
  }
  if (selectedSize) {
    const sameSize = variants.find((variant: any) => normalizeGraphSize(variant.size) === normalizeGraphSize(selectedSize));
    if (sameSize) return sameSize;
  }
  return variants.find((variant: any) => variant.size === "XL") ?? variants[0] ?? null;
}

function normalizeGraphSize(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

export function matchedEvidencePaths(graph: any, query: string, matchedNodeIds: string[] = [], highlightedEdgeIds: string[] = []) {
  const paths = graph?.evidence_paths ?? [];
  if (!paths.length) return [];
  const normalized = String(query ?? "").toLowerCase();
  const preferred = new Set<string>();
  if (/\b(size|fit|xl|large|small|tight|loose|chest|measurement)\b/.test(normalized)) preferred.add("buyer_fit_path");
  if (/\b(offer|price|discount|timer|rush|campaign|deal|cheap)\b/.test(normalized)) preferred.add("offer_timer_path");
  if (/\b(seller|trust|score|return|review|proof|rating|safe|risk|fabric|color|genuine)\b/.test(normalized)) preferred.add("product_score_path");
  const nodeSet = new Set(matchedNodeIds);
  const edgeSet = new Set(highlightedEdgeIds);
  const matched = paths.filter((path: any) =>
    preferred.has(path.path_id) ||
    path.node_ids?.some((nodeId: string) => nodeSet.has(nodeId)) ||
    path.edge_ids?.some((edgeId: string) => edgeSet.has(edgeId))
  );
  return (matched.length ? matched : paths.slice(0, 1)).slice(0, 3);
}

function buildEvidencePaths(graph: any) {
  const context = graph.seller_context?.find((item: any) => item.product?.product_id === graph.selected_product_id) ??
    graph.seller_context?.[0] ??
    null;
  if (!context) return [];
  const ids = context.node_ids ?? {};
  const productPath = pathFromNodes(graph, {
    path_id: "product_score_path",
    title: "Product trust path",
    audience: "buyer",
    summary: "Product, seller, SKU outcomes, reviews, proof, and score are checked together.",
    node_ids: [ids.product, ids.seller, ids.sku, ids.returns, ids.reviews, ids.proof, ids.score],
    steps: [
      pathStep("Product", ids.product, context.product?.title),
      pathStep("Seller", ids.seller, context.seller?.verification?.verification_status),
      pathStep("SKU", ids.sku, `${context.evidence?.delivered_orders_90d ?? 0} delivered outcomes`),
      pathStep("Returns", ids.returns, `${Math.round(Number(context.evidence?.return_rate ?? 0) * 100)}% return rate`),
      pathStep("Reviews", ids.reviews, "Weighted by reviewer credibility"),
      pathStep("Proof", ids.proof, proofGapSummary(context.proof_coverage)),
      pathStep("Score", ids.score, `${Math.round(Number(context.candidate?.score ?? 0) * 100)} / 100`)
    ],
    status: context.candidate?.score >= 0.72 ? "ready" : context.candidate?.score >= 0.58 ? "check_once" : "caution"
  });
  const fitPath = pathFromNodes(graph, {
    path_id: "buyer_fit_path",
    title: "Fit recommendation path",
    audience: "buyer",
    summary: `Private fit memory is matched with SKU outcomes before recommending ${context.fit?.recommended_size ?? context.variant?.size ?? "a size"}.`,
    node_ids: [ids.buyer_fit, ids.sku, ids.returns, ids.score],
    steps: [
      pathStep("Buyer fit", ids.buyer_fit, "Private to buyer"),
      pathStep("SKU outcomes", ids.sku, `${context.evidence?.delivered_orders_90d ?? 0} outcomes checked`),
      pathStep("Return reasons", ids.returns, context.top_return_reason ? labelize(context.top_return_reason.return_reason) : "No dominant issue"),
      pathStep("Recommended size", ids.score, context.fit?.recommended_size ?? context.variant?.size ?? "Check size")
    ],
    status: context.fit?.confidence ?? "medium"
  });
  const offer = context.price_context?.offer ?? {};
  const offerPath = pathFromNodes(graph, {
    path_id: "offer_timer_path",
    title: "Offer and timer path",
    audience: "buyer",
    summary: offer.buyer_guidance ?? "Offer pressure is checked against price history and campaign resets.",
    node_ids: [ids.offer, ids.price, ids.score],
    steps: [
      pathStep("Offer timer", ids.offer, offerStatusLabel(offer.status ?? "offer check")),
      pathStep("Price history", ids.price, offer.price_evidence?.reference_price ? `Reference Rs ${offer.price_evidence.reference_price}` : "Not enough prior price"),
      pathStep("Campaign reset", ids.price, `${offer.campaign_evidence?.timer_reset_count ?? 0} reset(s)`),
      pathStep("Buyer guidance", ids.score, offer.buyer_guidance ?? "Decide using product proof")
    ],
    status: offer.status ?? "not_enough_history"
  });
  return [productPath, fitPath, offerPath];
}

function offerStatusLabel(status: string) {
  if (status === "no_need_to_rush") return "price proof checked";
  return labelize(status);
}

function pathFromNodes(graph: any, input: any) {
  const nodeIds = input.node_ids.filter(Boolean);
  const edgeIds = edgesForPath(graph, nodeIds);
  const factIds = new Set<string>();
  const nodesById = new Map(graph.nodes.map((node: any) => [node.id, node]));
  const edgesById = new Map(graph.edges.map((edge: any) => [edge.id, edge]));
  for (const nodeId of nodeIds) {
    const node: any = nodesById.get(nodeId);
    (node?.fact_ids ?? []).forEach((factId: string) => factIds.add(factId));
  }
  for (const edgeId of edgeIds) {
    const edge: any = edgesById.get(edgeId);
    (edge?.fact_ids ?? []).forEach((factId: string) => factIds.add(factId));
  }
  return {
    ...input,
    node_ids: nodeIds,
    edge_ids: edgeIds,
    fact_ids: [...factIds],
    steps: input.steps.filter((step: any) => step.node_id)
  };
}

function edgesForPath(graph: any, nodeIds: string[]) {
  const pairKeys = new Set<string>();
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    pairKeys.add(`${nodeIds[index]}->${nodeIds[index + 1]}`);
    pairKeys.add(`${nodeIds[index + 1]}->${nodeIds[index]}`);
  }
  return graph.edges
    .filter((edge: any) => pairKeys.has(`${edge.source}->${edge.target}`))
    .map((edge: any) => edge.id);
}

function pathStep(labelText: string, nodeId: string | undefined, detail: string | number | null | undefined) {
  return {
    label: labelText,
    node_id: nodeId ?? "",
    detail: String(detail ?? "Evidence unavailable")
  };
}

function proofGapSummary(coverage: Record<string, any> | undefined) {
  const gaps = Object.values(coverage ?? {}).filter((item: any) => item && item.sufficient === false);
  return gaps.length ? `${gaps.length} proof gap${gaps.length === 1 ? "" : "s"}` : "Proof covered";
}

function edge(source: string, target: string, labelText: string, fact_ids: string[], weight: number) {
  return {
    id: `edge:${source}:${target}:${labelText}`.replaceAll(" ", "_"),
    source,
    target,
    label: labelText,
    weight,
    fact_ids
  };
}

function factorWeight(candidate: any, key: string) {
  const value = candidate?.factors?.[key];
  return typeof value === "number" ? Number(Math.max(0.15, Math.min(0.95, value)).toFixed(2)) : 0.5;
}

function uniqueBy(rows: any[], key: string) {
  const map = new Map();
  for (const row of rows) map.set(row[key], row);
  return [...map.values()];
}

function labelize(value: unknown) {
  return String(value ?? "unknown").replace(/_/g, " ");
}
