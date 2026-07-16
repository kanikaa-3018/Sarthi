import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { id } from "./crypto.js";
import { nowIso } from "./time.js";

const TRUST_WEIGHT_KEYS = [
  "fit_match",
  "outcome_quality",
  "seller_trust",
  "review_signal",
  "rating_signal",
  "price_value",
  "fulfilment_reliability",
  "proof_coverage",
  "offer_truth"
] as const;

type TrustWeightKey = typeof TRUST_WEIGHT_KEYS[number];
type TrustWeights = Record<TrustWeightKey, number>;

const DEFAULT_TRUST_WEIGHTS: TrustWeights = {
  fit_match: 0.18,
  outcome_quality: 0.22,
  seller_trust: 0.18,
  review_signal: 0.14,
  rating_signal: 0.1,
  price_value: 0.06,
  fulfilment_reliability: 0.08,
  proof_coverage: 0.03,
  offer_truth: 0.01
};

type TrustWeightConfig = {
  source: string;
  version: string;
  category: string;
  weights: TrustWeights;
  raw_weights: Record<string, unknown>;
};

export async function sourceHealth(db: Db) {
  const rows = await collections(db).dataSources.find({}).sort({ source_id: 1 }).toArray();
  const sources = rows.map((source: any) => {
    const hours = Math.max(0, (Date.now() - new Date(source.last_synced_at).getTime()) / 36e5);
    const effective_status = source.status === "operational" && hours > source.freshness_sla_hours ? "stale" : source.status;
    return { ...withoutId(source), hours_since_sync: Number(hours.toFixed(1)), effective_status, fresh: effective_status === "operational" };
  });
  const blocking = sources.some((source) => ["stale", "unavailable"].includes(source.effective_status));
  return { overall_status: blocking ? "stale" : "operational", blocking, sources };
}

export async function sellerVerification(db: Db, sellerId: string) {
  const c = collections(db);
  const [seller, profile] = await Promise.all([
    c.sellers.findOne({ seller_id: sellerId }),
    c.sellerProfiles.findOne({ seller_id: sellerId })
  ]);
  return {
    seller_id: sellerId,
    seller_name: seller?.name ?? null,
    verification_status: profile?.verification_status ?? "pending",
    gst_status: profile?.gst_status ?? "pending_review",
    kyc_status: profile?.kyc_status ?? "under_review",
    pickup_pincode: profile?.pickup_pincode ?? null,
    categories: profile?.categories ?? [],
    support_contact: profile?.support_contact ?? null,
    data_access_level: profile?.data_access_level ?? "limited",
    restricted_reason: profile?.restricted_reason ?? null,
    last_verified_at: profile?.last_verified_at ?? null
  };
}

export async function productWithSeller(db: Db, productId: string) {
  const c = collections(db);
  const product = await c.products.findOne({ product_id: productId });
  if (!product) return null;
  const seller = await c.sellers.findOne({ seller_id: product.seller_id });
  return publicProduct({ ...product, seller_name: seller?.name, median_dispatch_hours: seller?.median_dispatch_hours });
}

export function publicProduct(product: any) {
  return {
    product_id: product.product_id,
    cluster_id: product.cluster_id,
    seller_id: product.seller_id,
    seller_name: product.seller_name ?? product.seller?.name ?? "",
    title: product.title,
    category: product.category,
    garment_type: product.garment_type,
    fabric: product.fabric,
    color_family: product.color_family,
    base_price: product.base_price,
    image_url: product.image_url,
    rating: product.rating,
    rating_count: product.rating_count,
    commerce_badge: product.commerce_badge,
    delivery_text: product.delivery_text,
    is_sarthi_eligible: product.is_sarthi_eligible,
    median_dispatch_hours: product.median_dispatch_hours,
    source_refs: product.source_refs,
    taxonomy_attributes: product.taxonomy_attributes,
    seller_snapshot: product.seller_snapshot,
    fulfillment: product.fulfillment
  };
}

export async function variantsForProduct(db: Db, productId: string) {
  return (await collections(db).variants.find({ product_id: productId }).sort({ current_price: 1 }).toArray()).map(withoutId);
}

export async function variantEvidence(db: Db, variantId: string) {
  const c = collections(db);
  const outcomes = await c.outcomes.find({ variant_id: variantId }).toArray();
  const delivered = outcomes.filter((o: any) => ["delivered_kept", "returned", "exchanged"].includes(o.status)).length;
  const returns = outcomes.filter((o: any) => o.status === "returned").length;
  const colorMismatch = outcomes.filter((o: any) => o.return_reason === "color_different").length;
  const fitFeedback = outcomes.filter((o: any) => ["too_small", "too_large", null].includes(o.return_reason ?? null)).length;
  const kept = outcomes.filter((o: any) => o.status === "delivered_kept").length;
  const variant = await c.variants.findOne({ variant_id: variantId });
  const product = variant ? await c.products.findOne({ product_id: variant.product_id }) : null;
  const seller = product ? await c.sellers.findOne({ seller_id: product.seller_id }) : null;
  return {
    sku_id: variantId,
    variant_id: variantId,
    delivered_orders_90d: delivered,
    returns_90d: returns,
    return_rate: delivered ? Number((returns / delivered).toFixed(3)) : 0,
    fit_feedback_count: fitFeedback,
    fit_as_expected_rate: delivered ? Number((kept / delivered).toFixed(3)) : 0,
    color_mismatch_returns: colorMismatch,
    median_dispatch_hours: seller?.median_dispatch_hours ?? 48,
    evidence_strength: delivered >= 35 ? "strong" : delivered >= 12 ? "medium" : delivered > 0 ? "weak" : "unknown",
    fact_ids: outcomes.slice(0, 8).map((outcome: any) => outcome.fact_id),
    last_updated_at: outcomes[0]?.created_at ?? nowIso()
  };
}

export async function topReturnReason(db: Db, variantId: string) {
  const outcomes = await collections(db).outcomes.find({ variant_id: variantId, status: "returned" }).toArray();
  const counts = new Map<string, { count: number; fact_ids: string[] }>();
  for (const outcome of outcomes) {
    const reason = outcome.return_reason ?? "unknown";
    const item = counts.get(reason) ?? { count: 0, fact_ids: [] };
    item.count += 1;
    item.fact_ids.push(outcome.fact_id);
    counts.set(reason, item);
  }
  const [reason, value] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0] ?? [];
  if (!reason) return null;
  return { return_reason: reason, count: value.count, fact_ids: value.fact_ids.slice(0, 5) };
}

export async function avoidableIssue(db: Db, variantId: string) {
  const top = await topReturnReason(db, variantId);
  if (!top) return null;
  const copy: Record<string, { title: string; action: string }> = {
    too_small: { title: "Runs small for some buyers", action: "Choose one size larger if you prefer comfort fit." },
    too_large: { title: "May feel loose", action: "Check measurement chart before ordering." },
    color_different: { title: "Color can look different", action: "Check daylight image or seller color proof." },
    fabric_different: { title: "Fabric expectation risk", action: "Ask for fabric close-up before prepaid checkout." },
    damaged: { title: "Packaging quality risk", action: "Check packaging proof before ordering." }
  };
  const selected = copy[top.return_reason] ?? { title: "One avoidable issue detected", action: "Check proof before ordering." };
  return { reason: top.return_reason, title: selected.title, action: selected.action, count: top.count, fact_ids: top.fact_ids };
}

export async function fitPrediction(db: Db, buyerId: string, variantId: string, preferredFit = "comfort") {
  const c = collections(db);
  const variant = await c.variants.findOne({ variant_id: variantId });
  const product = variant ? await c.products.findOne({ product_id: variant.product_id }) : null;
  const buyer = await c.buyers.findOne({ buyer_id: buyerId });
  const memory = product && buyer?.fit_memory_enabled
    ? await c.fitMemory.find({ buyer_id: buyerId, category: product.category }).sort({ updated_at: -1 }).toArray()
    : [];
  const retained = memory[0]?.retained_size;
  const recommended = retained ?? (variant?.size === "L" && preferredFit === "comfort" ? "XL" : variant?.size ?? "XL");
  return {
    buyer_id: buyerId,
    variant_id: variantId,
    recommended_size: recommended,
    confidence: memory.length ? "medium" : "low",
    reasons: memory.length
      ? [`Your past ${product?.category ?? "category"} memory prefers ${recommended}.`, "Sarthi also checks SKU kept/returned outcomes."]
      : ["Personal fit memory is unavailable; Sarthi used aggregate SKU evidence."],
    fact_ids: memory.map((item: any) => item.fact_id).slice(0, 4)
  };
}

export async function trustState(db: Db, product: any, evidence: any) {
  const verification = await sellerVerification(db, product.seller_id);
  const health = await sourceHealth(db);
  if (verification.verification_status === "restricted") {
    return state("seller_restricted", "blocked", false, "Seller is restricted", "This listing cannot be recommended until seller restrictions are resolved.", ["Seller restriction is a hard blocker."], ["seller_verification"], health, verification);
  }
  if (verification.verification_status !== "verified") {
    return state("seller_verification_pending", "low", false, "Seller verification pending", "Sarthi can show catalog facts, but will not strongly recommend this seller yet.", ["Seller verification is pending."], ["seller_verification"], health, verification);
  }
  if (health.blocking) {
    return state("data_degraded", "low", false, "Data freshness issue", "Sarthi is pausing strong recommendation because one or more evidence sources are stale.", ["Source freshness is degraded."], ["fresh_sources"], health, verification);
  }
  if (evidence.evidence_strength === "unknown" || evidence.delivered_orders_90d < 8) {
    return state("limited_evidence", "low", false, "Limited evidence", "This listing can be browsed, but Sarthi needs more outcomes before strong recommendation.", ["Not enough delivered outcomes for strong confidence."], ["order_outcomes"], health, verification);
  }
  if (evidence.return_rate > 0.22) {
    return state("specific_caution", "medium", true, "Buy with one check", "There is a repeated avoidable issue. Check the warning before buying.", ["Return rate is higher than preferred for this SKU."], [], health, verification);
  }
  return state("ready_to_buy", evidence.evidence_strength === "strong" ? "high" : "medium", true, "Ready with evidence", "Sarthi found enough seller, SKU, and source evidence for a recommendation.", ["Seller verified.", "SKU evidence is usable."], [], health, verification);
}

function state(status: string, confidence: string, can_recommend: boolean, headline: string, buyer_guidance: string, reasons: string[], missing_data: string[], data_freshness: any, seller_verification: any) {
  return { status, confidence, can_recommend, headline, summary: buyer_guidance, buyer_guidance, reasons, missing_data, data_freshness, seller_verification };
}

export async function reviewEvidence(db: Db, productId: string) {
  const reviews = await collections(db).reviews.find({ product_id: productId }).toArray();
  const build = (attribute: string) => {
    const rows = reviews.filter((review: any) => review.attribute === attribute).slice(0, 3);
    return {
      fact_ids: rows.map((row: any) => row.fact_id),
      passages: rows.map((row: any) => ({
        text: row.text,
        rating: row.rating,
        fact_id: row.fact_id,
        credibility_weight: Number((row.credibility_weight ?? 0.6).toFixed(2)),
        credibility_flags: row.credibility_flags ?? []
      }))
    };
  };
  return { fabric: build("fabric"), color: build("color"), credibility_summary: await reviewCredibilitySummary(db, productId) };
}

export async function reviewCredibilitySummary(db: Db, productId: string) {
  const reviews = await collections(db).reviews.find({ product_id: productId }).toArray();
  if (!reviews.length) {
    return {
      review_count: 0,
      credible_review_count: 0,
      raw_average: null,
      weighted_average: null,
      average_weight: 0,
      low_weight_review_count: 0,
      reliability: "unknown",
      flags: [],
      fact_ids: []
    };
  }
  const totalWeight = reviews.reduce((sum: number, review: any) => sum + reviewWeight(review), 0);
  const weightedAverage = reviews.reduce((sum: number, review: any) => sum + review.rating * reviewWeight(review), 0) / Math.max(totalWeight, 0.01);
  const rawAverage = reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviews.length;
  const lowWeight = reviews.filter((review: any) => reviewWeight(review) < 0.55);
  const flagCounts = new Map<string, number>();
  for (const review of reviews) {
    for (const flag of review.credibility_flags ?? []) {
      flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
    }
  }
  const flags = [...flagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([flag, count]) => ({ flag, count }));
  const averageWeight = totalWeight / reviews.length;
  return {
    review_count: reviews.length,
    credible_review_count: reviews.filter((review: any) => reviewWeight(review) >= 0.7).length,
    raw_average: Number(rawAverage.toFixed(2)),
    weighted_average: Number(weightedAverage.toFixed(2)),
    average_weight: Number(averageWeight.toFixed(2)),
    low_weight_review_count: lowWeight.length,
    reliability: averageWeight >= 0.75 ? "strong" : averageWeight >= 0.55 ? "mixed" : "weak",
    flags,
    fact_ids: reviews.map((review: any) => review.fact_id).slice(0, 8)
  };
}

export async function conflicts(db: Db, product: any, variantId: string) {
  const evidence = await variantEvidence(db, variantId);
  const reviews = await collections(db).reviews.find({ product_id: product.product_id }).toArray();
  const avgReview = reviews.reduce((sum: number, row: any) => sum + row.rating, 0) / Math.max(1, reviews.length);
  const credibility = await reviewCredibilitySummary(db, product.product_id);
  const rows = [];
  if (avgReview >= 4 && evidence.return_rate > 0.18) {
    rows.push({
      type: "positive_reviews_return_conflict",
      severity: "medium",
      summary: "Reviews are generally positive, but recent outcomes show avoidable returns.",
      action: "Use return reasons and proof coverage before trusting generic reviews.",
      fact_ids: evidence.fact_ids.slice(0, 4)
    });
  }
  if ((credibility.raw_average ?? 0) - (credibility.weighted_average ?? 0) >= 0.35) {
    rows.push({
      type: "review_credibility_gap",
      severity: "medium",
      summary: "Raw reviews look stronger than the credibility-weighted review signal.",
      action: "Give less weight to reviews from very new, high-return, or repeated-pattern accounts.",
      fact_ids: credibility.fact_ids
    });
  }
  return rows;
}

async function trustWeightConfig(db: Db, category?: string): Promise<TrustWeightConfig> {
  const c = collections(db);
  const exact = category ? await c.featureWeights.findOne({ category, active: { $ne: 0 } }) : null;
  const doc = exact
    ?? await c.featureWeights.findOne({ category: "default", active: { $ne: 0 } })
    ?? await c.featureWeights.findOne({ active: { $ne: 0 } });
  const rawWeights = (doc?.weights ?? {}) as Record<string, unknown>;
  const sellerReliability = numericWeight(rawWeights.seller_reliability ?? rawWeights.seller_trust);
  const sellerVerification = numericWeight(rawWeights.seller_verification);
  const sellerTrustParts = [sellerReliability, sellerVerification].filter((value): value is number => typeof value === "number");
  const sellerTrust = sellerTrustParts.length ? sellerTrustParts.reduce((sum, value) => sum + value, 0) : undefined;
  const mapped = normalizeTrustWeights({
    fit_match: numericWeight(rawWeights.fit_match ?? rawWeights.fit_consistency),
    outcome_quality: numericWeight(rawWeights.outcome_quality ?? rawWeights.sku_outcome),
    seller_trust: sellerTrust,
    review_signal: numericWeight(rawWeights.review_signal ?? rawWeights.review_credibility),
    rating_signal: numericWeight(rawWeights.rating_signal ?? rawWeights.product_rating),
    price_value: numericWeight(rawWeights.price_value),
    fulfilment_reliability: numericWeight(rawWeights.fulfilment_reliability ?? rawWeights.dispatch),
    proof_coverage: numericWeight(rawWeights.proof_coverage),
    offer_truth: numericWeight(rawWeights.offer_truth)
  });
  return {
    source: doc ? "mongodb_feature_weights" : "default_runtime_weights",
    version: publicTrustPolicyVersion(doc?.version, doc?.category ?? category),
    category: doc?.category ?? category ?? "default",
    weights: mapped,
    raw_weights: rawWeights
  };
}

function publicTrustPolicyVersion(version: unknown, category?: string) {
  const value = typeof version === "string" ? version : "";
  if (value.includes("apparel") || category === "women_kurtis") return "Sarthi Apparel Trust Policy v1";
  return "Sarthi Trust Policy v1";
}

function numericWeight(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeTrustWeights(input: Partial<TrustWeights>): TrustWeights {
  const values = TRUST_WEIGHT_KEYS.map((key) => [key, input[key] ?? DEFAULT_TRUST_WEIGHTS[key]] as const);
  const total = values.reduce((sum, [, value]) => sum + value, 0) || 1;
  return Object.fromEntries(values.map(([key, value]) => [key, Number((value / total).toFixed(4))])) as TrustWeights;
}

function proofCoverageScore(coverage: Record<string, any>) {
  const items = Object.values(coverage);
  if (!items.length) return 0.45;
  const weighted = items.reduce((sum, item: any) => {
    const importance = ["transparency", "fabric", "size"].includes(item.attribute) ? 1.25 : 0.8;
    return sum + (item.sufficient ? importance : 0);
  }, 0);
  const possible = items.reduce((sum, item: any) => sum + (["transparency", "fabric", "size"].includes(item.attribute) ? 1.25 : 0.8), 0);
  return Math.max(0.15, Math.min(1, weighted / Math.max(possible, 0.01)));
}

function offerTruthScore(offer: any) {
  if (offer.status === "verified_price_drop") return 0.9;
  if (offer.status === "no_need_to_rush") return 0.72;
  return 0.48;
}

export async function rankCluster(db: Db, buyerId: string, clusterId: string, preferredFit = "comfort", options: { recordSnapshot?: boolean; intent?: string } = {}) {
  const c = collections(db);
  const cluster = await c.clusters.findOne({ cluster_id: clusterId });
  const weightConfig = await trustWeightConfig(db, cluster?.category);
  const products = await c.products.find({ cluster_id: clusterId, is_sarthi_eligible: 1 }).toArray();
  const candidates = [];
  const factIds = new Set<string>();
  for (const product of products) {
    const productVariants = await variantsForProduct(db, product.product_id);
    const target = productVariants.find((variant: any) => variant.size === "XL") ?? productVariants[0];
    if (!target) continue;
    const evidence = await variantEvidence(db, target.variant_id);
    const verification = await sellerVerification(db, product.seller_id);
    const fit = await fitPrediction(db, buyerId, target.variant_id, preferredFit);
    const reviewCredibility = await reviewCredibilitySummary(db, product.product_id);
    const coverage = await proofCoverage(db, product.product_id, target.variant_id);
    const offer = await verifyOffer(db, target.variant_id);
    const sellerScore = verification.verification_status === "verified" ? 0.9 : 0.45;
    const outcomeQuality = 1 - Math.min(0.6, evidence.return_rate) / 0.6;
    const fitScore = fit.confidence === "medium" ? 0.75 : 0.55;
    const ratingSignal = Math.max(0, Math.min(1, product.rating / 5));
    const priceValue = 1 - Math.min(1, Math.max(0, product.base_price - 320) / 900);
    const weightedReviewRating = reviewCredibility.weighted_average ?? product.rating;
    const reviewSignal = Math.max(0.25, Math.min(1, weightedReviewRating / 5 * (0.72 + reviewCredibility.average_weight * 0.28) - (evidence.return_rate > 0.18 ? 0.15 : 0)));
    const proofScore = proofCoverageScore(coverage);
    const offerScore = offerTruthScore(offer);
    const fairStartBoost = verification.verification_status === "verified" && evidence.delivered_orders_90d < 30 ? (30 - evidence.delivered_orders_90d) / 30 * 0.07 : 0;
    const uncertaintyPenalty = evidence.evidence_strength === "strong" ? 0 : evidence.evidence_strength === "medium" ? 0.06 : 0.18;
    const fulfilmentReliability = 1 - Math.min(1, evidence.median_dispatch_hours / 72);
    const weightedScore =
      fitScore * weightConfig.weights.fit_match +
      outcomeQuality * weightConfig.weights.outcome_quality +
      sellerScore * weightConfig.weights.seller_trust +
      reviewSignal * weightConfig.weights.review_signal +
      ratingSignal * weightConfig.weights.rating_signal +
      priceValue * weightConfig.weights.price_value +
      fulfilmentReliability * weightConfig.weights.fulfilment_reliability +
      proofScore * weightConfig.weights.proof_coverage +
      offerScore * weightConfig.weights.offer_truth;
    const score = Number(Math.max(0.05, Math.min(0.98,
      weightedScore -
      uncertaintyPenalty +
      fairStartBoost
    )).toFixed(3));
    for (const id of evidence.fact_ids) factIds.add(id);
    for (const id of reviewCredibility.fact_ids) factIds.add(id);
    for (const id of offer.fact_ids) factIds.add(id);
    candidates.push({
      variant_id: target.variant_id,
      product_id: product.product_id,
      seller_id: product.seller_id,
      score,
      factors: {
        fit_match: Number(fitScore.toFixed(2)),
        outcome_quality: Number(outcomeQuality.toFixed(2)),
        expectation_match: evidence.return_rate < 0.18 ? 0.78 : 0.58,
        fulfilment_reliability: Number(fulfilmentReliability.toFixed(2)),
        seller_trust: Number(sellerScore.toFixed(2)),
        review_signal: Number(reviewSignal.toFixed(2)),
        review_credibility: reviewCredibility.average_weight,
        rating_signal: Number(ratingSignal.toFixed(2)),
        price_value: Number(priceValue.toFixed(2)),
        proof_coverage: Number(proofScore.toFixed(2)),
        offer_truth: Number(offerScore.toFixed(2)),
        uncertainty_penalty: uncertaintyPenalty,
        fair_start_boost: Number(fairStartBoost.toFixed(2))
      },
      weight_version: weightConfig.version,
      fact_ids: evidence.fact_ids.slice(0, 5)
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (options.recordSnapshot && candidates.length) {
    await c.trustScoreSnapshots.insertMany(candidates.map((candidate: any) => ({
      snapshot_id: id("trust_score"),
      buyer_id: buyerId,
      cluster_id: clusterId,
      product_id: candidate.product_id,
      variant_id: candidate.variant_id,
      seller_id: candidate.seller_id,
      decision_intent: options.intent ?? "rank_cluster",
      score: candidate.score,
      factors: candidate.factors,
      weights: weightConfig.weights,
      weight_version: weightConfig.version,
      fact_ids: candidate.fact_ids,
      created_at: nowIso()
    })));
  }
  const winner = candidates[0];
  const alt = candidates[1] ?? null;
  const winnerProduct = winner ? await productForVariant(db, winner.variant_id) : null;
  return {
    winner: winner?.variant_id ?? "",
    alternative: alt?.variant_id ?? null,
    winner_label: winnerProduct ? `${winnerProduct.seller_name} - ${winnerProduct.title.split("-")[0].trim()}` : "Sarthi pick",
    top_factors: ["seller trust", "SKU kept-order evidence", "fit consistency", "reviewer credibility"],
    uncertainty: winner?.score > 0.75 ? "low" : "medium",
    candidates,
    weighting: weightConfig,
    fact_ids: [...factIds].slice(0, 16)
  };
}

export async function productForVariant(db: Db, variantId: string) {
  const variant = await collections(db).variants.findOne({ variant_id: variantId });
  if (!variant) return null;
  return productWithSeller(db, variant.product_id);
}

export function graphPath(variantId: string, factIds: string[] = []) {
  return {
    path_type: "trust_decision",
    available_from: "mongodb_atlas_weighted_graph",
    nodes: ["buyer", "fit_memory", variantId, "seller", "reviews", "returns", "offer"],
    relationships: ["USES", "MATCHES", "SOLD_BY", "HAS_REVIEW", "HAS_OUTCOME", "HAS_OFFER"],
    fact_ids: factIds.slice(0, 8),
    summary: "Sarthi linked buyer fit context, SKU outcomes, seller trust, reviews, and offer evidence."
  };
}

export async function createTrace(db: Db, payload: any) {
  const trace = {
    trace_id: payload.trace_id ?? id("trace"),
    buyer_id: payload.buyer_id,
    product_id: payload.product_id ?? null,
    variant_id: payload.variant_id ?? null,
    intent: payload.intent ?? ["trust_check"],
    tools_used: payload.tools_used ?? [],
    fact_ids: payload.fact_ids ?? [],
    graph_paths: payload.graph_paths ?? [],
    created_at: nowIso()
  };
  await collections(db).auditTraces.insertOne(trace);
  return trace;
}

export async function facts(db: Db, factIds: string[]) {
  if (!factIds.length) return [];
  return (await collections(db).facts.find({ fact_id: { $in: factIds } }).toArray()).map(withoutId);
}

export async function verifyOffer(db: Db, variantId: string) {
  const c = collections(db);
  const events = await c.priceEvents.find({ variant_id: variantId }).sort({ created_at: 1 }).toArray();
  const campaign = await c.campaigns.findOne({ variant_id: variantId });
  const inventory = await c.inventorySnapshots.findOne({ variant_id: variantId });
  const latest = events.at(-1);
  const reference = events[0];
  const delta = reference && latest ? reference.price - latest.price : null;
  const hasDrop = delta !== null && delta > 0;
  const timerReset = (campaign?.timer_reset_count ?? 0) >= 2;
  const status = hasDrop && !timerReset ? "verified_price_drop" : timerReset ? "no_need_to_rush" : "not_enough_history";
  const message = status === "verified_price_drop"
    ? "Verified deal. This is lower than the recent reference price."
    : status === "no_need_to_rush"
      ? "No need to rush. This price has been active and the timer has reset before."
      : "Not enough history to verify this offer yet.";
  const fact_ids = [...events.map((event: any) => event.fact_id), campaign?.fact_id, inventory?.fact_id].filter(Boolean);
  return {
    variant_id: variantId,
    status,
    message,
    buyer_guidance: status === "verified_price_drop" ? "You can use the offer if product trust is also strong." : "Do not choose only because of urgency.",
    truth_basis: status === "verified_price_drop" ? "price_drop" : status === "no_need_to_rush" ? "timer_reset" : "insufficient_history",
    price_evidence: {
      latest_price: latest?.price ?? null,
      reference_price: reference?.price ?? null,
      price_delta: delta,
      price_event_count: events.length,
      current_price_age_days: 5,
      points: events.map((event: any) => ({ price: event.price, event_type: event.event_type, created_at: event.created_at, fact_id: event.fact_id }))
    },
    campaign_evidence: campaign ? { campaign_id: campaign.campaign_id, start_at: campaign.start_at, end_at: campaign.end_at, timer_reset_count: campaign.timer_reset_count, fact_id: campaign.fact_id } : null,
    inventory_evidence: inventory ? { available_to_promise: inventory.available_to_promise, sales_velocity_24h: inventory.sales_velocity_24h, captured_at: inventory.captured_at, fact_id: inventory.fact_id } : null,
    checks: [
      { key: "price_history", label: "Price history", status: hasDrop ? "positive" : "neutral", detail: hasDrop ? `Price is Rs ${delta} below baseline.` : "Not enough price movement for a strong deal claim.", fact_ids: events.map((event: any) => event.fact_id) },
      { key: "campaign_timer", label: "Timer behavior", status: timerReset ? "caution" : "neutral", detail: timerReset ? "Campaign timer has reset before, so urgency should be treated calmly." : "No repeated timer reset found.", fact_ids: campaign?.fact_id ? [campaign.fact_id] : [] },
      { key: "inventory_pressure", label: "Inventory pressure", status: inventory?.available_to_promise < 5 ? "caution" : "neutral", detail: inventory ? `${inventory.available_to_promise} units available to promise.` : "Inventory snapshot unavailable.", fact_ids: inventory?.fact_id ? [inventory.fact_id] : [] }
    ],
    fact_ids
  };
}

export async function proofCoverage(db: Db, productId: string, variantId?: string | null) {
  const assets = await collections(db).sellerEvidenceAssets.find({ product_id: productId, status: { $in: ["submitted", "verified"] } }).toArray();
  const attributes = ["transparency", "fabric", "color", "size", "packaging", "offer"] as const;
  const recommendations: Record<string, string> = {
    transparency: "daylight_photo",
    fabric: "fabric_closeup",
    color: "daylight_photo",
    size: "measurement_chart",
    packaging: "packaging_photo",
    offer: "seller_note"
  };
  const result: Record<string, any> = {};
  for (const attribute of attributes) {
    const matching = assets.filter((asset: any) => asset.attribute === attribute);
    result[attribute] = {
      attribute,
      sufficient: matching.length > 0 || ["color", "offer"].includes(attribute),
      evidence_count: matching.length,
      source_summary: matching.length ? `${matching.length} seller proof asset(s) available.` : ["color", "offer"].includes(attribute) ? "Covered by catalog or offer facts." : "Seller proof is missing.",
      recommended_proof_type: recommendations[attribute],
      fact_ids: matching.map((asset: any) => asset.fact_id)
    };
  }
  if (variantId) {
    const ev = await variantEvidence(db, variantId);
    if (ev.delivered_orders_90d > 10) {
      result.size.sufficient = true;
      result.size.evidence_count = ev.delivered_orders_90d;
      result.size.source_summary = "Size confidence is supported by delivered outcome evidence.";
      result.size.fact_ids = ev.fact_ids.slice(0, 5);
    }
  }
  return result;
}

export function evidenceGaps(coverage: Record<string, any>) {
  return Object.values(coverage)
    .filter((item: any) => !item.sufficient)
    .map((item: any) => ({
      attribute: item.attribute,
      severity: ["transparency", "fabric", "size"].includes(item.attribute) ? "high" : "medium",
      title: `${label(item.attribute)} proof missing`,
      summary: `Sarthi needs ${item.recommended_proof_type.replaceAll("_", " ")} before making this claim stronger.`,
      recommended_proof_type: item.recommended_proof_type,
      coverage: item,
      fact_ids: item.fact_ids
    }));
}

export async function skuPassport(db: Db, buyerId: string, productId: string, variantId?: string) {
  const product = await productWithSeller(db, productId);
  if (!product) throw new Error("Product not found");
  const variants = await variantsForProduct(db, productId);
  const variant = variantId ? variants.find((item: any) => item.variant_id === variantId) : variants.find((item: any) => item.size === "XL") ?? variants[0];
  const evidence = await variantEvidence(db, variant.variant_id);
  const fit = await fitPrediction(db, buyerId, variant.variant_id);
  const issue = await avoidableIssue(db, variant.variant_id);
  const offer = await verifyOffer(db, variant.variant_id);
  const reviews = await reviewEvidence(db, productId);
  const coverage = await proofCoverage(db, productId, variant.variant_id);
  const gaps = evidenceGaps(coverage);
  const trust = await trustState(db, product, evidence);
  const conflictRows = await conflicts(db, product, variant.variant_id);
  const requests = await collections(db).proofRequests.find({ product_id: productId, status: "open" }).toArray();
  const fact_ids = [...new Set([...evidence.fact_ids, ...fit.fact_ids, ...offer.fact_ids, ...gaps.flatMap((gap: any) => gap.fact_ids ?? [])])];
  return {
    buyer_id: buyerId,
    product,
    variant,
    truth_summary: { headline: trust.headline, status: trust.status, confidence: trust.confidence, can_recommend: trust.can_recommend, buyer_guidance: trust.buyer_guidance },
    outcome_evidence: evidence,
    fit,
    avoidable_issue: issue,
    offer_truth: offer,
    review_evidence: reviews,
    proof_coverage: coverage,
    evidence_gaps: gaps,
    open_proof_requests: requests.map((row: any) => publicProofRequest(row)),
    conflicts: conflictRows,
    trust_state: trust,
    fact_ids
  };
}

type KeepConfidenceDriver = {
  type: string;
  label: string;
  severity: "low" | "medium" | "high";
  positive: boolean;
  fact_ids: string[];
};

type KeepConfidenceIntervention = {
  type: "change_size" | "check_proof" | "save_fit_memory" | "continue_checkout" | "limited_evidence";
  label: string;
  action: string;
  suggested_size?: string | null;
  target_variant_id?: string | null;
  reason: string;
  fact_ids: string[];
};

function keepBand(score: number) {
  if (score >= 0.75) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

function clampKeepScore(score: number) {
  return Math.max(0.05, Math.min(0.98, score));
}

function keepDriver(type: string, label: string, severity: KeepConfidenceDriver["severity"], positive: boolean, fact_ids: string[] = []): KeepConfidenceDriver {
  return { type, label, severity, positive, fact_ids };
}

function keepAction(
  type: KeepConfidenceIntervention["type"],
  label: string,
  action: string,
  reason: string,
  fact_ids: string[] = [],
  extra: Partial<Pick<KeepConfidenceIntervention, "suggested_size" | "target_variant_id">> = {}
): KeepConfidenceIntervention {
  return { type, label, action, reason, fact_ids, ...extra };
}

export async function computeKeepConfidence(db: Db, buyerId: string, variantId: string, preferredFit = "comfort") {
  const c = collections(db);
  const variant = await c.variants.findOne({ variant_id: variantId });
  if (!variant) throw new Error("Variant not found");
  const product = await productWithSeller(db, variant.product_id);
  if (!product) throw new Error("Product not found");
  const buyer = await c.buyers.findOne({ buyer_id: buyerId });
  const variants = await variantsForProduct(db, product.product_id);
  const evidence = await variantEvidence(db, variantId);
  const fit = await fitPrediction(db, buyerId, variantId, preferredFit);
  const issue = await avoidableIssue(db, variantId);
  const trust = await trustState(db, product, evidence);
  const recommendedVariant = variants.find((item: any) => item.size === fit.recommended_size) ?? null;
  const selectedSize = variant.size ?? null;
  const canCompareSize = Boolean(selectedSize && selectedSize !== "ONE_SIZE" && fit.recommended_size);

  let score = 0.82;
  let scoreCap = 0.98;
  const drivers: KeepConfidenceDriver[] = [];
  const interventions: KeepConfidenceIntervention[] = [];
  const factIds = new Set<string>([...evidence.fact_ids, ...fit.fact_ids]);

  if (issue) {
    for (const factId of issue.fact_ids ?? []) factIds.add(factId);
  }

  if (canCompareSize && selectedSize === fit.recommended_size) {
    score += 0.08;
    drivers.push(keepDriver(
      "fit_match",
      `Selected size ${selectedSize} matches the recommended size.`,
      "low",
      true,
      fit.fact_ids
    ));
  } else if (canCompareSize && recommendedVariant) {
    score -= 0.16;
    drivers.push(keepDriver(
      "size_mismatch",
      `Size ${selectedSize} differs from the safer size ${fit.recommended_size}.`,
      "medium",
      false,
      fit.fact_ids
    ));
    interventions.push(keepAction(
      "change_size",
      `Switch to ${fit.recommended_size}`,
      "change_size",
      "This size better matches the buyer's fit memory and SKU outcomes.",
      fit.fact_ids,
      { suggested_size: fit.recommended_size, target_variant_id: recommendedVariant.variant_id }
    ));
  } else if (!canCompareSize) {
    drivers.push(keepDriver("single_size", "This item does not need size selection.", "low", true));
  }

  if (fit.confidence === "medium" || fit.confidence === "high") {
    score += 0.04;
    drivers.push(keepDriver("fit_memory", `Fit guidance has ${fit.confidence} confidence.`, "low", true, fit.fact_ids));
  } else {
    score -= 0.06;
    drivers.push(keepDriver("fit_memory_limited", "Personal fit memory is limited for this product type.", "low", false, fit.fact_ids));
  }

  if (!buyer?.fit_memory_enabled) {
    score -= 0.05;
    drivers.push(keepDriver("memory_off", "Private fit memory is off, so guidance uses aggregate evidence only.", "low", false));
    interventions.push(keepAction(
      "save_fit_memory",
      "Enable fit memory after a kept order",
      "save_fit_memory",
      "Future size guidance becomes sharper when kept orders can update private memory."
    ));
  }

  if (evidence.evidence_strength === "strong") {
    score += 0.06;
    drivers.push(keepDriver("outcome_depth", `${evidence.delivered_orders_90d} recent delivered orders support this SKU.`, "low", true, evidence.fact_ids.slice(0, 4)));
  } else if (evidence.evidence_strength === "medium") {
    score += 0.02;
    drivers.push(keepDriver("outcome_depth", `${evidence.delivered_orders_90d} recent delivered orders checked.`, "low", true, evidence.fact_ids.slice(0, 4)));
  } else {
    score -= evidence.evidence_strength === "weak" ? 0.08 : 0.14;
    scoreCap = Math.min(scoreCap, evidence.evidence_strength === "weak" ? 0.68 : 0.52);
    drivers.push(keepDriver("limited_outcomes", "Outcome evidence is still building for this SKU.", "medium", false, evidence.fact_ids.slice(0, 4)));
    interventions.push(keepAction(
      "limited_evidence",
      "Buy only if the proof is enough for you",
      "review_evidence",
      "Sarthi is not hiding uncertainty; there are fewer kept-order signals for this SKU.",
      evidence.fact_ids.slice(0, 4)
    ));
  }

  if (evidence.return_rate <= 0.1 && evidence.delivered_orders_90d > 0) {
    score += 0.06;
    drivers.push(keepDriver("low_return_rate", "Recent returns are low for this SKU.", "low", true, evidence.fact_ids.slice(0, 4)));
  } else if (evidence.return_rate >= 0.28) {
    score -= 0.2;
    drivers.push(keepDriver("high_return_rate", `${Math.round(evidence.return_rate * 100)}% recent return rate needs one check.`, "high", false, evidence.fact_ids.slice(0, 4)));
  } else if (evidence.return_rate >= 0.18) {
    score -= 0.12;
    drivers.push(keepDriver("elevated_return_rate", `${Math.round(evidence.return_rate * 100)}% recent return rate needs attention.`, "medium", false, evidence.fact_ids.slice(0, 4)));
  } else if (evidence.return_rate > 0) {
    score -= 0.04;
    drivers.push(keepDriver("some_returns", "Some avoidable returns exist, but not at a blocker level.", "low", false, evidence.fact_ids.slice(0, 4)));
  }

  if (issue) {
    const issueAction = ["too_small", "too_large"].includes(issue.reason) && recommendedVariant
      ? "change_size"
      : "review_evidence";
    const issueType: KeepConfidenceIntervention["type"] = issueAction === "change_size" ? "change_size" : "check_proof";
    const issueLabel = issueAction === "change_size" ? `Use ${fit.recommended_size} for safer fit` : issue.title;
    score -= ["damaged", "fabric_different", "color_different"].includes(issue.reason) ? 0.08 : 0.04;
    drivers.push(keepDriver("avoidable_issue", issue.title, "medium", false, issue.fact_ids));
    interventions.push(keepAction(
      issueType,
      issueLabel,
      issueAction,
      issue.action,
      issue.fact_ids,
      issueType === "change_size" ? { suggested_size: fit.recommended_size, target_variant_id: recommendedVariant?.variant_id ?? null } : {}
    ));
  }

  if (trust.seller_verification.verification_status !== "verified") {
    score -= 0.14;
    scoreCap = Math.min(scoreCap, 0.58);
    drivers.push(keepDriver("seller_verification", "Seller verification is not fully complete yet.", "medium", false));
  } else if (evidence.delivered_orders_90d < 30) {
    score += 0.03;
    scoreCap = Math.min(scoreCap, 0.72);
    drivers.push(keepDriver(
      "fair_start",
      "Verified newer seller gets fair exposure, but confidence stays provisional until more outcomes arrive.",
      "low",
      true
    ));
  } else {
    drivers.push(keepDriver("seller_verified", "Seller verification passed.", "low", true));
  }

  if (trust.data_freshness.blocking) {
    score -= 0.18;
    scoreCap = Math.min(scoreCap, 0.48);
    drivers.push(keepDriver("source_freshness", "One or more evidence sources are stale.", "high", false));
  }

  if (!product.is_sarthi_eligible) {
    score -= 0.12;
    scoreCap = Math.min(scoreCap, 0.6);
    drivers.push(keepDriver("catalog_only", "This listing has catalog facts but not full Sarthi comparison evidence.", "medium", false));
  }

  score = clampKeepScore(Math.min(score, scoreCap));
  const band = keepBand(score);
  if (!interventions.length) {
    interventions.push(keepAction(
      "continue_checkout",
      "Continue with this choice",
      "continue_checkout",
      "The main checks are aligned for this SKU and size.",
      [...factIds].slice(0, 6)
    ));
  }

  const headline = band === "high"
    ? "Looks like a keeper"
    : band === "medium"
      ? "One check can improve confidence"
      : "Fix one thing before checkout";
  const summary = band === "high"
    ? "Selected size, seller status, and SKU outcome evidence are aligned enough to proceed."
    : band === "medium"
      ? "Sarthi found usable evidence, but one size, proof, or outcome signal should be reviewed before checkout."
      : "Sarthi is keeping confidence low because evidence is limited or a mismatch needs attention.";

  const fact_ids = [...factIds].slice(0, 16);
  return {
    buyer_id: buyerId,
    product_id: product.product_id,
    variant_id: variantId,
    selected_size: selectedSize,
    recommended_size: fit.recommended_size,
    score: Number(score.toFixed(3)),
    confidence_band: band,
    headline,
    summary,
    drivers,
    interventions,
    fact_ids,
    graph_path: graphPath(variantId, fact_ids)
  };
}

export async function createOrIncrementProofRequest(db: Db, buyerId: string, product: any, variantId: string | null, attribute: string, question: string) {
  const c = collections(db);
  const existing = await c.proofRequests.findOne({ seller_id: product.seller_id, product_id: product.product_id, attribute, status: "open" });
  if (existing) {
    await c.proofRequests.updateOne({ _id: existing._id }, { $inc: { request_count: 1 }, $set: { updated_at: nowIso(), buyer_question: question } });
    return publicProofRequest({ ...existing, request_count: existing.request_count + 1, updated_at: nowIso() });
  }
  const request = {
    request_id: id("proof_req"),
    buyer_id: buyerId,
    seller_id: product.seller_id,
    product_id: product.product_id,
    variant_id: variantId,
    attribute,
    buyer_question: question,
    status: "open",
    request_count: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
    resolved_at: null,
    resolution_proof_id: null,
    fact_id: id("fact_proof_req")
  };
  await c.proofRequests.insertOne(request);
  await c.facts.insertOne({ fact_id: request.fact_id, source_table: "proof_requests", source_id: request.request_id, source_type: "proof_request", summary: `${label(attribute)} proof requested by buyers.`, created_at: request.created_at, expires_at: null });
  return publicProofRequest(request);
}

export function publicProofRequest(row: any) {
  return {
    request_id: row.request_id,
    seller_id: row.seller_id,
    product_id: row.product_id,
    variant_id: row.variant_id,
    attribute: row.attribute,
    status: row.status,
    request_count: row.request_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    fact_id: row.fact_id
  };
}

function reviewWeight(review: any) {
  let weight = typeof review.credibility_weight === "number" ? review.credibility_weight : 0.6;
  if (!review.verified_purchase) weight -= 0.12;
  if ((review.reviewer_age_days ?? 0) < 30) weight -= 0.16;
  if ((review.reviewer_return_rate ?? 0) > 0.45) weight -= 0.24;
  if ((review.credibility_flags ?? []).includes("repeated_text_pattern")) weight -= 0.14;
  if ((review.credibility_flags ?? []).includes("generic_quality_text")) weight -= 0.1;
  return Math.max(0.2, Math.min(1, weight));
}

export function inferAttribute(question = "") {
  const lower = question.toLowerCase();
  if (lower.includes("transparent") || lower.includes("thin") || lower.includes("see through")) return "transparency";
  if (lower.includes("fabric") || lower.includes("kapda") || lower.includes("material")) return "fabric";
  if (lower.includes("color") || lower.includes("colour")) return "color";
  if (lower.includes("size") || lower.includes("fit") || lower.includes("tight") || lower.includes("loose")) return "size";
  if (lower.includes("pack")) return "packaging";
  if (lower.includes("offer") || lower.includes("price")) return "offer";
  return "fabric";
}

export function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function withoutId(row: any) {
  if (!row) return row;
  const { _id, ...rest } = row;
  return rest;
}
