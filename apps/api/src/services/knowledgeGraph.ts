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
import { projectGraphToNeo4j } from "./neo4jGraph.js";
import { topIssueForCard } from "./sellerOperations.js";
import { resolveSimilarListingSet } from "./similarListings.js";

export async function clusterKnowledgeGraph(db: Db, buyerId: string, clusterId: string, selectedProductId?: string) {
  const c = collections(db);
  const cluster = await c.clusters.findOne({ cluster_id: clusterId });
  const similarity = selectedProductId ? await resolveSimilarListingSet(db, selectedProductId) : null;
  const comparableProductIds = similarity?.comparable_product_ids ?? [];
  const products = comparableProductIds.length
    ? (await c.products.find({ product_id: { $in: comparableProductIds }, is_sarthi_eligible: 1 }).toArray())
      .sort((left: any, right: any) => comparableProductIds.indexOf(left.product_id) - comparableProductIds.indexOf(right.product_id))
    : await c.products.find({ cluster_id: clusterId, is_sarthi_eligible: 1 }).toArray();
  const ranking = await rankCluster(db, buyerId, clusterId, "comfort", {
    productIds: comparableProductIds
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
    const variant = variants.find((item: any) => item.size === "XL") ?? variants[0];
    const evidence = await variantEvidence(db, variant.variant_id);
    const fit = await fitPrediction(db, buyerId, variant.variant_id);
    const reviews = await c.reviews.find({ product_id: product.product_id }).limit(5).toArray();
    const candidate = ranking.candidates.find((item: any) => item.variant_id === variant.variant_id) ?? null;
    const verification = await sellerVerification(db, product.seller_id);
    const offer = await verifyOffer(db, variant.variant_id);
    const coverage = await proofCoverage(db, product.product_id, variant.variant_id);
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
      label: offer.status === "verified_price_drop" ? "Offer OK" : offer.status === "no_need_to_rush" ? "No rush" : "Offer check",
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
        proof: proofNode,
        score: scoreNode,
        buyer_fit: buyerFitNode
      }
    });
  }

  const graph = {
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
        candidates: similarity.candidates.slice(0, 4)
      } : null,
      source_health: await sourceHealth(db),
      fact_count: factIds.size
    },
    ranking,
    selected_product_id: (await productForVariant(db, ranking.winner))?.product_id ?? null,
    nodes: uniqueBy(nodes, "id"),
    edges,
    seller_context,
    fact_ids: [...factIds],
    chat_suggestions: ["Which seller is safest?", "Why are these similar?", "Do returns affect reviews?"]
  };
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
