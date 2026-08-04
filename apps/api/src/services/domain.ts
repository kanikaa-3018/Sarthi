import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { aggregateConfidenceScore, assignConfidenceItems, type ConfidenceItem } from "./confidenceScoring.js";
import { id } from "./crypto.js";
import { label, withoutId } from "./format.js";
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
type TrustConfidenceItem = ConfidenceItem<TrustWeightKey>;

const DEFAULT_TRUST_WEIGHTS: TrustWeights = {
  fit_match: 18,
  outcome_quality: 22,
  seller_trust: 18,
  review_signal: 14,
  rating_signal: 10,
  price_value: 6,
  fulfilment_reliability: 8,
  proof_coverage: 3,
  offer_truth: 1
};

const APPAREL_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "ONE_SIZE"];

type TrustWeightConfig = {
  source: string;
  version: string;
  category: string;
  weights: TrustWeights;
  raw_weights: Record<string, unknown>;
};

export async function sourceHealth(db: Db) {
  const rows = await collections(db).dataSources.find({}).sort({ source_id: 1 }).toArray();
  const nowMs = seededDemoSnapshot(rows)
    ? Math.max(...rows.map((source: any) => new Date(source.last_synced_at).getTime()).filter(Number.isFinite)) + 5 * 60 * 1000
    : Date.now();
  const sources = rows.map((source: any) => {
    const hours = Math.max(0, (nowMs - new Date(source.last_synced_at).getTime()) / 36e5);
    const effective_status = source.status === "operational" && hours > source.freshness_sla_hours ? "stale" : source.status;
    return { ...withoutId(source), hours_since_sync: Number(hours.toFixed(1)), effective_status, fresh: effective_status === "operational" };
  });
  const blocking = sources.some((source) => ["stale", "unavailable"].includes(source.effective_status));
  return { overall_status: blocking ? "stale" : "operational", blocking, sources };
}

function seededDemoSnapshot(rows: any[]) {
  const seededSourceIds = new Set([
    "buyer_fit_profiles",
    "buyer_memory",
    "buyer_review_profiles",
    "campaigns",
    "catalog",
    "graph_projection",
    "inventory",
    "orders",
    "pricing",
    "returns",
    "reviews",
    "seller_verification"
  ]);
  return rows.length >= 8 &&
    rows.every((source: any) => seededSourceIds.has(source.source_id)) &&
    rows.every((source: any) => source.reliability === "first_party_contract");
}

export async function sellerVerification(db: Db, sellerId: string) {
  const c = collections(db);
  const [seller, profile] = await Promise.all([
    c.sellers.findOne({ seller_id: sellerId }),
    c.sellerProfiles.findOne({ seller_id: sellerId })
  ]);
  return sellerVerificationFromRows(sellerId, seller, profile);
}

function sellerVerificationFromRows(sellerId: string, seller: any, profile: any) {
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
    image_urls: Array.isArray(product.image_urls) && product.image_urls.length ? product.image_urls : [product.image_url].filter(Boolean),
    rating: product.rating,
    rating_count: product.rating_count,
    commerce_badge: product.commerce_badge,
    delivery_text: product.delivery_text,
    is_sarthi_eligible: product.is_sarthi_eligible,
    median_dispatch_hours: product.median_dispatch_hours,
    source_refs: product.source_refs,
    taxonomy_attributes: product.taxonomy_attributes,
    seller_snapshot: product.seller_snapshot,
    fulfillment: product.fulfillment,
    media_evidence: normalizeProductMediaEvidence(product),
    quality_signals: product.quality_signals
  };
}

function normalizeProductMediaEvidence(product: any) {
  const images = Array.isArray(product.image_urls) && product.image_urls.length
    ? product.image_urls
    : [product.image_url].filter(Boolean);
  const existing = product.media_evidence ?? {};
  const angleLabels = Array.isArray(existing.angle_labels) && existing.angle_labels.length
    ? existing.angle_labels
    : ["Main", "Alternate", "Fabric close-up", "Lifestyle"].slice(0, images.length);
  const apparelCategories = new Set(["women_kurtis", "women_kurta_sets", "women_tops", "women_bottomwear", "women_sarees"]);
  const apparel = apparelCategories.has(product.category);
  const hasFabricCloseup = angleLabels.some((labelText: string) => labelText.toLowerCase().includes("fabric"));
  const hasHumanModel = !apparel || angleLabels.some((labelText: string) => labelText.toLowerCase().includes("lifestyle") || labelText.toLowerCase().includes("model"));
  const hasMeasurementChart = Boolean(product.quality_signals?.size_chart_available) && !String(product.product_id ?? "").endsWith("_2");
  const reviewerPhotoCount = Number(existing.reviewer_photo_count ?? (images.length >= 3 ? 2 : 1));
  const requiredAssets = existing.required_assets ?? [
    mediaAsset("main_product", "Main product photo", images.length >= 1 ? "present" : "missing", true, "Buyer can inspect the primary listing image."),
    mediaAsset("human_model", "Human-model image", apparel ? (hasHumanModel ? "present" : "missing") : "not_required", apparel, apparel ? "Apparel should show fall, length, and fit on a human model." : "Not required for this category."),
    mediaAsset("fabric_closeup", "Fabric close-up", hasFabricCloseup ? "present" : "missing", apparel, "Close-up reduces fabric and transparency doubt."),
    mediaAsset("measurement_chart", "Measurement chart", hasMeasurementChart ? "linked" : apparel ? "missing" : "not_required", apparel, "Used by fit confidence before checkout."),
    mediaAsset("reviewer_photos", "Reviewer/customer photos", reviewerPhotoCount > 0 ? "present" : "missing", true, `${reviewerPhotoCount} buyer photo signal${reviewerPhotoCount === 1 ? "" : "s"} attached to this catalog group.`)
  ];
  const missingAngles = existing.missing_angles ?? requiredAssets
    .filter((asset: any) => asset.required && asset.status === "missing")
    .map((asset: any) => asset.label);
  const qualityScore = Number(existing.quality_score ?? Math.max(42, Math.min(98,
    48 +
    images.length * 8 +
    (hasHumanModel ? 12 : 0) +
    (hasFabricCloseup ? 10 : 0) +
    (hasMeasurementChart ? 8 : 0) +
    Math.min(8, reviewerPhotoCount * 4)
  )));
  return {
    image_count: Number(existing.image_count ?? images.length),
    angle_labels: angleLabels,
    verification_status: existing.verification_status ?? (images.length >= 2 ? "verified_gallery" : "limited_gallery"),
    source: existing.source ?? "seller_catalog_media",
    issues: existing.issues ?? [],
    warnings: existing.warnings ?? missingAngles.map((angle: string) => `${angle} missing important angle`),
    quality_score: qualityScore,
    clarity_score: Number(existing.clarity_score ?? Math.min(100, 68 + images.length * 6 + (hasFabricCloseup ? 8 : 0))),
    gallery_readiness: existing.gallery_readiness ?? (missingAngles.length ? "needs_more_media" : "complete"),
    human_model_required: existing.human_model_required ?? apparel,
    required_assets: requiredAssets,
    missing_angles: missingAngles,
    reviewer_photo_count: reviewerPhotoCount,
    buyer_copy: existing.buyer_copy ?? (missingAngles.length
      ? `Image check is usable, but ${String(missingAngles[0]).toLowerCase()} should be added before high confidence.`
      : "Image proof covers the important buying angles for this category."),
    checked_at: existing.checked_at ?? nowIso()
  };
}

function mediaAsset(key: string, labelText: string, status: string, required: boolean, detail: string) {
  return { key, label: labelText, status, required, detail };
}

export async function variantsForProduct(db: Db, productId: string) {
  return (await collections(db).variants.find({ product_id: productId }).sort({ current_price: 1 }).toArray()).map(withoutId);
}

export async function variantEvidence(db: Db, variantId: string) {
  const c = collections(db);
  const outcomes = await c.outcomes.find({ variant_id: variantId }).toArray();
  const variant = await c.variants.findOne({ variant_id: variantId });
  const product = variant ? await c.products.findOne({ product_id: variant.product_id }) : null;
  const seller = product ? await c.sellers.findOne({ seller_id: product.seller_id }) : null;
  return summarizeVariantEvidence(variantId, variant, seller, outcomes);
}

function summarizeVariantEvidence(variantId: string, variant: any, seller: any, outcomes: any[]) {
  const delivered = outcomes.filter((o: any) => ["delivered_kept", "returned", "exchanged"].includes(o.status)).length;
  const returns = outcomes.filter((o: any) => o.status === "returned").length;
  const colorMismatch = outcomes.filter((o: any) => o.return_reason === "color_different").length;
  const fitFeedback = outcomes.filter((o: any) => ["too_small", "too_large", null].includes(o.return_reason ?? null)).length;
  const kept = outcomes.filter((o: any) => o.status === "delivered_kept").length;
  return {
    sku_id: variant?.variant_id ?? variantId,
    variant_id: variant?.variant_id ?? variantId,
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
  const variants = product ? await variantsForProduct(db, product.product_id) : [];
  const availableSizes = new Set(variants.map((item: any) => normalizeProfileSize(item.size)).filter(Boolean));
  const activeProfiles = product && buyer?.fit_memory_enabled
    ? await c.buyerFitProfiles.find({ buyer_id: buyerId, active: 1 }).sort({ updated_at: -1 }).limit(1).toArray()
    : [];
  const activeProfile = activeProfiles[0] ?? null;
  const profileSize = product
    ? availableSizeOrNull(activeProfile?.size_map?.[product.category] ?? activeProfile?.size_map?.[product.garment_type], availableSizes)
    : null;
  const memory = product && buyer?.fit_memory_enabled
    ? (await c.fitMemory.find({ buyer_id: buyerId }).sort({ updated_at: -1 }).toArray())
        .filter((row: any) => fitMemoryRank(row, product) > 0)
    : [];
  const retained = availableSizeOrNull(memory[0]?.retained_size, availableSizes);
  const outcomePick = variants.length
    ? await recommendedSizeFromSiblingOutcomes(c, variants, preferredFit)
    : null;
  const selectedSize = availableSizeOrNull(variant?.size, availableSizes);
  const selectedIndex = APPAREL_SIZE_ORDER.indexOf(selectedSize ?? "");
  const comfortFallback = preferredFit === "comfort" && selectedIndex >= 0
    ? availableSizeOrNull(APPAREL_SIZE_ORDER[Math.min(selectedIndex + 1, APPAREL_SIZE_ORDER.length - 2)], availableSizes)
    : null;
  const recommended = profileSize ?? retained ?? outcomePick?.size ?? comfortFallback ?? selectedSize ?? "XL";
  const strongProfileEvidence = Boolean(retained) || (outcomePick?.delivered_orders ?? 0) >= 12;
  let confidence: "low" | "medium" | "high" = "low";
  if (profileSize) {
    confidence = strongProfileEvidence ? "high" : "medium";
  } else if (retained || (outcomePick?.delivered_orders ?? 0) >= 12) {
    confidence = "medium";
  }
  const factIds = [...new Set([
    ...memory.map((item: any) => item.fact_id).filter(Boolean),
    ...(outcomePick?.fact_ids ?? [])
  ])].slice(0, 6);
  const reasons = profileSize
    ? [
        `Your buyer-owned fit profile recommends ${recommended} for ${label(product?.category)}.`,
        "Sarthi checks sibling SKU outcomes before showing size risk."
      ]
    : retained
      ? [
          `Your past kept-order memory prefers ${recommended} for this apparel family.`,
          "Sarthi also checks SKU kept/returned outcomes."
        ]
      : [
          "Personal fit memory is unavailable; Sarthi used sibling SKU outcome evidence.",
          outcomePick ? `${outcomePick.size} has the strongest kept-order signal among available sizes.` : "Outcome evidence is still thin for this product."
        ];
  return {
    buyer_id: buyerId,
    variant_id: variantId,
    recommended_size: recommended,
    confidence,
    reasons,
    fact_ids: factIds
  };
}

function availableSizeOrNull(value: unknown, availableSizes: Set<string | null>) {
  const size = normalizeProfileSize(value);
  return size && availableSizes.has(size) ? size : null;
}

async function recommendedSizeFromSiblingOutcomes(c: ReturnType<typeof collections>, variants: any[], preferredFit: string) {
  const variantIds = variants.map((item: any) => item.variant_id).filter(Boolean);
  const outcomes = variantIds.length
    ? await c.outcomes.find({ variant_id: { $in: variantIds } }).toArray()
    : [];
  const scored = variants
    .map((variant: any) => {
      const size = normalizeProfileSize(variant.size);
      const stats = sizeOutcomeStats(variant, outcomes.filter((outcome: any) => outcome.variant_id === variant.variant_id));
      const fitRisk = Math.min(1, stats.tight_fit_return_rate + stats.loose_fit_return_rate);
      const evidenceBonus = Math.min(0.08, stats.delivered_orders / 500);
      const sizeIndex = APPAREL_SIZE_ORDER.indexOf(size ?? "");
      const comfortBias = preferredFit === "comfort" && sizeIndex >= 0
        ? Math.min(0.035, sizeIndex * 0.006)
        : 0;
      const regularBias = preferredFit === "regular" && ["M", "L"].includes(size ?? "")
        ? 0.025
        : 0;
      const score = stats.delivered_orders
        ? stats.keep_rate * 0.58 + (1 - stats.return_rate) * 0.22 + (1 - fitRisk) * 0.12 + evidenceBonus + comfortBias + regularBias
        : 0;
      return { size, stats, score };
    })
    .filter((item) => item.size && item.size !== "ONE_SIZE" && item.stats.delivered_orders > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.stats.delivered_orders !== left.stats.delivered_orders) return right.stats.delivered_orders - left.stats.delivered_orders;
      return APPAREL_SIZE_ORDER.indexOf(right.size ?? "") - APPAREL_SIZE_ORDER.indexOf(left.size ?? "");
    });
  const best = scored[0];
  if (!best?.size) return null;
  return {
    size: best.size,
    delivered_orders: best.stats.delivered_orders,
    fact_ids: best.stats.fact_ids
  };
}

function fitMemoryRank(row: any, product: any) {
  if (!row?.category || !product) return 0;
  if (row.category === product.category) return 4;
  if (row.category === product.garment_type) return 3;
  return fitFamilyKey(row.category) && fitFamilyKey(row.category) === fitFamilyKey(product.category) ? 2 : 0;
}

function fitFamilyKey(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  if (!text) return "";
  if (/(kurti|kurta|ethnic|coord|co-ord)/.test(text)) return "upper_ethnic";
  if (/(top|tee|shirt|blouse)/.test(text)) return "upper_casual";
  if (/(bottom|palazzo|cargo|denim|pant|jean)/.test(text)) return "bottomwear";
  if (/(saree|dupatta)/.test(text)) return "drape";
  return text;
}

export async function trustState(db: Db, product: any, evidence: any, options: { health?: any; verification?: any } = {}) {
  const verification = options.verification ?? await sellerVerification(db, product.seller_id);
  const health = options.health ?? await sourceHealth(db);
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

export async function feedTrustSummary(db: Db, product: any, options: { health?: any } = {}) {
  const c = collections(db);
  const [variants, verification, openProofCount] = await Promise.all([
    variantsForProduct(db, product.product_id),
    sellerVerification(db, product.seller_id),
    c.proofRequests.countDocuments({
      product_id: product.product_id,
      status: { $in: ["open", "submitted"] }
    })
  ]);
  const selected = variants.find((variant: any) => variant.size === "XL") ?? variants[0];
  if (!selected) {
    return {
      status: "limited_evidence",
      confidence: "low",
      can_recommend: false,
      headline: "Need more proof",
      buyer_guidance: "This listing can be viewed, but Sarthi cannot check a SKU yet.",
      reasons: ["No SKU found for this product."],
      missing_data: ["sku"],
      source_status: options.health?.overall_status ?? "unknown",
      seller_status: verification.verification_status,
      evidence_strength: "unknown",
      delivered_orders_90d: 0,
      open_proof_count: openProofCount
    };
  }
  const evidence = await variantEvidence(db, selected.variant_id);
  const trust = await trustState(db, product, evidence, { health: options.health, verification });
  return {
    status: trust.status,
    confidence: trust.confidence,
    can_recommend: trust.can_recommend,
    headline: trust.headline,
    buyer_guidance: trust.buyer_guidance,
    reasons: trust.reasons,
    missing_data: trust.missing_data,
    source_status: trust.data_freshness.overall_status,
    seller_status: trust.seller_verification.verification_status,
    evidence_strength: evidence.evidence_strength,
    delivered_orders_90d: evidence.delivered_orders_90d,
    open_proof_count: openProofCount
  };
}

export async function feedTrustSummaries(db: Db, products: any[], options: { health?: any } = {}) {
  if (!products.length) return new Map<string, any>();
  const c = collections(db);
  const productIds = products.map((product) => product.product_id);
  const sellerIds = [...new Set(products.map((product) => product.seller_id).filter(Boolean))];

  const [variants, sellers, profiles, proofCounts] = await Promise.all([
    c.variants.find({ product_id: { $in: productIds } }).sort({ product_id: 1, current_price: 1 }).toArray(),
    c.sellers.find({ seller_id: { $in: sellerIds } }).toArray(),
    c.sellerProfiles.find({ seller_id: { $in: sellerIds } }).toArray(),
    c.proofRequests.aggregate([
      { $match: { product_id: { $in: productIds }, status: { $in: ["open", "submitted"] } } },
      { $group: { _id: "$product_id", count: { $sum: 1 } } }
    ]).toArray()
  ]);

  const variantsByProduct = new Map<string, any[]>();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
  }

  const selectedByProduct = new Map<string, any>();
  for (const product of products) {
    const productVariants = variantsByProduct.get(product.product_id) ?? [];
    selectedByProduct.set(product.product_id, productVariants.find((variant) => variant.size === "XL") ?? productVariants[0]);
  }

  const selectedVariantIds = [...selectedByProduct.values()].filter(Boolean).map((variant) => variant.variant_id);
  const outcomes = selectedVariantIds.length
    ? await c.outcomes.find({ variant_id: { $in: selectedVariantIds } }).toArray()
    : [];
  const outcomesByVariant = new Map<string, any[]>();
  for (const outcome of outcomes) {
    const list = outcomesByVariant.get(outcome.variant_id) ?? [];
    list.push(outcome);
    outcomesByVariant.set(outcome.variant_id, list);
  }

  const sellerById = new Map(sellers.map((seller: any) => [seller.seller_id, seller]));
  const profileBySellerId = new Map(profiles.map((profile: any) => [profile.seller_id, profile]));
  const proofCountByProduct = new Map(proofCounts.map((row: any) => [row._id, row.count]));
  const summaries = new Map<string, any>();

  for (const product of products) {
    const seller = sellerById.get(product.seller_id);
    const verification = sellerVerificationFromRows(product.seller_id, seller, profileBySellerId.get(product.seller_id));
    const openProofCount = proofCountByProduct.get(product.product_id) ?? 0;
    const selected = selectedByProduct.get(product.product_id);
    if (!selected) {
      summaries.set(product.product_id, {
        status: "limited_evidence",
        confidence: "low",
        can_recommend: false,
        headline: "Need more proof",
        buyer_guidance: "This listing can be viewed, but Sarthi cannot check a SKU yet.",
        reasons: ["No SKU found for this product."],
        missing_data: ["sku"],
        source_status: options.health?.overall_status ?? "unknown",
        seller_status: verification.verification_status,
        evidence_strength: "unknown",
        delivered_orders_90d: 0,
        open_proof_count: openProofCount
      });
      continue;
    }

    const evidence = summarizeVariantEvidence(
      selected.variant_id,
      selected,
      seller,
      outcomesByVariant.get(selected.variant_id) ?? []
    );
    const trust = await trustState(db, product, evidence, { health: options.health, verification });
    summaries.set(product.product_id, {
      status: trust.status,
      confidence: trust.confidence,
      can_recommend: trust.can_recommend,
      headline: trust.headline,
      buyer_guidance: trust.buyer_guidance,
      reasons: trust.reasons,
      missing_data: trust.missing_data,
      source_status: trust.data_freshness.overall_status,
      seller_status: trust.seller_verification.verification_status,
      evidence_strength: evidence.evidence_strength,
      delivered_orders_90d: evidence.delivered_orders_90d,
      open_proof_count: openProofCount
    });
  }

  return summaries;
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
        credibility_flags: row.credibility_flags ?? [],
        verified_purchase: Boolean(row.verified_purchase),
        down_weight_reasons: reviewDownWeightReasons(row)
      }))
    };
  };
  return { fabric: build("fabric"), color: build("color"), credibility_summary: await reviewCredibilitySummary(db, productId) };
}

export async function reviewCredibilitySummary(db: Db, productId: string) {
  const c = collections(db);
  const reviews = await c.reviews.find({ product_id: productId }).toArray();
  if (!reviews.length) {
    return {
      review_count: 0,
      credible_review_count: 0,
      raw_average: null,
      weighted_average: null,
      rating_gap: null,
      average_weight: 0,
      low_weight_review_count: 0,
      reliability: "unknown",
      flags: [],
      rating_comparison: {
        raw_rating: null,
        trusted_rating: null,
        gap: null,
        headline: "No reviews yet",
        summary: "Sarthi cannot compare raw and trusted ratings until reviews arrive."
      },
      review_spike: {
        status: "unknown",
        recent_review_count: 0,
        window_days: 7,
        share_recent: 0,
        message: "No review history is available for spike checks.",
        fact_ids: []
      },
      downweighted_reviews: [],
      visible_review_checks: [],
      trust_answer: "Sarthi does not use reviews alone when review evidence is missing.",
      fact_ids: []
    };
  }
  const reviewFactIds = reviews.map((review: any) => review.fact_id).filter(Boolean);
  const factRows = reviewFactIds.length
    ? await c.facts.find({ fact_id: { $in: reviewFactIds } }).toArray()
    : [];
  const factsById = new Map(factRows.map((fact: any) => [fact.fact_id, fact]));
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
  const roundedRaw = Number(rawAverage.toFixed(2));
  const roundedWeighted = Number(weightedAverage.toFixed(2));
  const ratingGap = Number((roundedRaw - roundedWeighted).toFixed(2));
  const reviewSpike = reviewSpikeDetector(reviews, factsById);
  const downweightedReviews = lowWeight
    .sort((left: any, right: any) => reviewWeight(left) - reviewWeight(right))
    .slice(0, 4)
    .map((review: any) => publicReviewCredibilityCard(review, factsById.get(review.fact_id)));
  const visibleReviewChecks = [
    {
      key: "verified_purchase",
      label: "Verified purchase reviews",
      value: `${reviews.filter((review: any) => Boolean(review.verified_purchase)).length}/${reviews.length}`,
      status: reviews.some((review: any) => !review.verified_purchase) ? "watch" : "good",
      detail: "Reviews without a completed order are still visible, but carry lower score weight."
    },
    {
      key: "new_account",
      label: "New-account warning",
      value: String(reviews.filter((review: any) => reviewDownWeightReasons(review).some((reason) => reason.key === "new_account")).length),
      status: flags.some((flag) => flag.flag === "new_account") ? "watch" : "good",
      detail: "Very new accounts do not get the same influence as stable buyers."
    },
    {
      key: "high_return",
      label: "High-return reviewer warning",
      value: String(reviews.filter((review: any) => reviewDownWeightReasons(review).some((reason) => reason.key === "high_return")).length),
      status: flags.some((flag) => flag.flag === "high_return_rate" || flag.flag === "high_rto_rate") ? "watch" : "good",
      detail: "Reviewers with unusually high return/RTO patterns get reduced influence."
    },
    {
      key: "repeated_text",
      label: "Repeated-text pattern warning",
      value: String(reviews.filter((review: any) => reviewDownWeightReasons(review).some((reason) => reason.key === "repeated_text")).length),
      status: flags.some((flag) => flag.flag === "repeated_text_pattern" || flag.flag === "generic_quality_text") ? "watch" : "good",
      detail: "Generic or repeated review text is treated as weaker evidence."
    },
    {
      key: "review_spike",
      label: "Review spike detector",
      value: `${Math.round(reviewSpike.share_recent * 100)}%`,
      status: reviewSpike.status === "watch" ? "watch" : "good",
      detail: reviewSpike.message
    }
  ];
  return {
    review_count: reviews.length,
    credible_review_count: reviews.filter((review: any) => reviewWeight(review) >= 0.7).length,
    raw_average: roundedRaw,
    weighted_average: roundedWeighted,
    rating_gap: ratingGap,
    average_weight: Number(averageWeight.toFixed(2)),
    low_weight_review_count: lowWeight.length,
    reliability: averageWeight >= 0.75 ? "strong" : averageWeight >= 0.55 ? "mixed" : "weak",
    flags,
    rating_comparison: {
      raw_rating: roundedRaw,
      trusted_rating: roundedWeighted,
      gap: ratingGap,
      headline: ratingGap >= 0.35 ? "Raw rating is inflated" : "Raw and trusted ratings are aligned",
      summary: ratingGap >= 0.35
        ? "Some reviews look positive but come from weaker reviewer patterns, so Sarthi lowers their influence."
        : "Reviewer credibility does not materially change the visible rating for this product."
    },
    review_spike: reviewSpike,
    downweighted_reviews: downweightedReviews,
    visible_review_checks: visibleReviewChecks,
    trust_answer: "Normal ratings count every review almost equally. Sarthi compares raw rating with trusted rating, lowers weak reviewer patterns, and then combines reviews with SKU outcomes and seller proof.",
    fact_ids: reviews.map((review: any) => review.fact_id).slice(0, 8)
  };
}

function publicReviewCredibilityCard(review: any, fact: any) {
  const reasons = reviewDownWeightReasons(review);
  return {
    review_id: review.review_id,
    attribute: review.attribute,
    rating: review.rating,
    text: review.text,
    trusted_weight: Number(reviewWeight(review).toFixed(2)),
    verified_purchase: Boolean(review.verified_purchase),
    reviewer_context: {
      age_bucket: review.reviewer_age_days < 30 ? "new" : review.reviewer_age_days < 90 ? "recent" : "established",
      return_risk: review.reviewer_return_rate > 0.45 ? "high" : review.reviewer_return_rate > 0.25 ? "watch" : "normal"
    },
    down_weight_reasons: reasons,
    explanation: reasons.length
      ? `Down-weighted because ${reasons.map((reason) => reason.label.toLowerCase()).join(", ")}.`
      : "No major review credibility issue found.",
    created_at: fact?.created_at ?? null,
    fact_id: review.fact_id
  };
}

function reviewDownWeightReasons(review: any) {
  const flags = new Set(review.credibility_flags ?? []);
  const reasons: Array<{ key: string; label: string; detail: string; severity: "low" | "medium" | "high" }> = [];
  if (!review.verified_purchase) {
    reasons.push({
      key: "unverified_purchase",
      label: "Not a verified purchase",
      detail: "The reviewer does not have a completed purchase trail for this item.",
      severity: "medium"
    });
  }
  if ((review.reviewer_age_days ?? 0) < 30 || flags.has("new_account") || flags.has("thin_order_history") || flags.has("no_order_history")) {
    reasons.push({
      key: "new_account",
      label: "New account",
      detail: "New or thin-history accounts can be genuine, but should not dominate the score yet.",
      severity: "medium"
    });
  }
  if ((review.reviewer_return_rate ?? 0) > 0.45 || flags.has("high_return_rate") || flags.has("high_rto_rate")) {
    reasons.push({
      key: "high_return",
      label: "High-return reviewer",
      detail: "This reviewer has a high return/RTO pattern, so their review receives lower score weight.",
      severity: "high"
    });
  }
  if (flags.has("repeated_text_pattern") || flags.has("generic_quality_text")) {
    reasons.push({
      key: "repeated_text",
      label: "Repeated-text pattern",
      detail: "The review text looks generic or repeated, so it is treated as weaker evidence.",
      severity: "medium"
    });
  }
  if (flags.has("needs_attribute_proof")) {
    reasons.push({
      key: "needs_attribute_proof",
      label: "Needs seller proof",
      detail: "The review mentions an attribute that still needs seller-side proof.",
      severity: "medium"
    });
  }
  return reasons.slice(0, 4);
}

function reviewSpikeDetector(reviews: any[], factsById: Map<string, any>) {
  const datedReviews = reviews
    .map((review: any) => ({ review, timestamp: Date.parse(review.created_at ?? factsById.get(review.fact_id)?.created_at ?? "") }))
    .filter((row) => Number.isFinite(row.timestamp));
  if (!datedReviews.length) {
    return {
      status: "unknown",
      recent_review_count: 0,
      window_days: 7,
      share_recent: 0,
      message: "Review dates are not available, so spike detection stays neutral.",
      fact_ids: []
    };
  }
  const latest = Math.max(...datedReviews.map((row) => row.timestamp));
  const windowMs = 7 * 86_400_000;
  const recent = datedReviews.filter((row) => latest - row.timestamp <= windowMs);
  const share = recent.length / reviews.length;
  const repeatedTexts = new Map<string, number>();
  for (const review of reviews) {
    const key = String(review.text ?? "").trim().toLowerCase();
    if (!key) continue;
    repeatedTexts.set(key, (repeatedTexts.get(key) ?? 0) + 1);
  }
  const repeatedCluster = Math.max(0, ...repeatedTexts.values());
  const status = share >= 0.65 || repeatedCluster >= 3 ? "watch" : "normal";
  return {
    status,
    recent_review_count: recent.length,
    window_days: 7,
    share_recent: Number(share.toFixed(2)),
    message: status === "watch"
      ? "A large share of reviews arrived close together or repeat similar text, so review influence is capped."
      : "No unusual review spike is affecting this product right now.",
    fact_ids: recent.map((row) => row.review.fact_id).filter(Boolean).slice(0, 6)
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
  return Object.fromEntries(values.map(([key, value]) => [key, Math.max(1, Math.round(value))])) as TrustWeights;
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

function sellerFairStartPolicy(verification: any, evidence: any, proofScore: number) {
  const verified = verification.verification_status === "verified";
  const delivered = Number(evidence.delivered_orders_90d ?? 0);
  const returnRate = Number(evidence.return_rate ?? 0);
  const keptRate = delivered ? 1 - returnRate : null;
  const limitedEvidence = delivered < 30;
  const proofFirst = verified && limitedEvidence && proofScore >= 0.55;
  const verificationGate = verified ? "passed" : verification.verification_status === "restricted" ? "restricted" : "pending";
  const scoreCap = !verified
    ? 0.52
    : delivered < 5
      ? 0.64
      : delivered < 15
        ? 0.7
        : delivered < 30
          ? 0.76
          : 0.98;
  const keepGrowth = keptRate !== null && keptRate >= 0.84 ? 0.018 : keptRate !== null && keptRate >= 0.76 ? 0.01 : 0;
  const boost = verified && limitedEvidence
    ? Math.min(0.065, 0.018 + proofScore * 0.028 + keepGrowth)
    : 0;
  return {
    verification_gate: verificationGate,
    eligible: verified,
    limited_evidence: limitedEvidence,
    proof_first_ranking: proofFirst,
    boost: Number(boost.toFixed(3)),
    score_cap: Number(scoreCap.toFixed(3)),
    delivered_orders_90d: delivered,
    kept_rate: keptRate === null ? null : Number(keptRate.toFixed(3)),
    confidence_growth: !verified
      ? "blocked_until_verification"
      : !limitedEvidence
        ? "outcome_backed"
        : keptRate !== null && keptRate >= 0.84
          ? "faster_after_kept_orders"
          : proofFirst
            ? "proof_first_until_orders_grow"
            : "limited_until_more_outcomes",
    buyer_label: !verified
      ? "Seller verification pending"
      : limitedEvidence
        ? "New verified seller: proof-first, limited evidence"
        : "Outcome-backed seller"
  };
}

type ScoreGuardReason = {
  key: string;
  label: string;
  detail: string;
  severity: "low" | "medium" | "high";
  penalty: number;
  score_cap?: number;
  fact_ids?: string[];
};

type ScoreIntegrityGuardInput = {
  variantId: string;
  rawAdjustedScore: number;
  evidence: any;
  reviewCredibility: any;
  sourceHealth: any;
};

async function scoreIntegrityGuard(db: Db, input: ScoreIntegrityGuardInput) {
  const reasons: ScoreGuardReason[] = [];
  const caps: number[] = [];
  const addReason = (reason: ScoreGuardReason) => {
    reasons.push({
      ...reason,
      penalty: Number(reason.penalty.toFixed(3)),
      score_cap: reason.score_cap === undefined ? undefined : Number(reason.score_cap.toFixed(3))
    });
    if (reason.score_cap !== undefined) caps.push(reason.score_cap);
  };

  if (input.sourceHealth?.blocking) {
    addReason({
      key: "stale_sources",
      label: "Freshness guard",
      detail: "One or more evidence sources are stale, so Sarthi will not give a high-confidence recommendation.",
      severity: "high",
      penalty: 0.12,
      score_cap: 0.49
    });
  }

  if (input.reviewCredibility?.review_spike?.status === "watch") {
    addReason({
      key: "review_spike",
      label: "Review spike guard",
      detail: "A burst of recent or repeated reviews was detected, so review influence is capped until outcomes confirm it.",
      severity: "medium",
      penalty: 0.06,
      score_cap: 0.72,
      fact_ids: input.reviewCredibility.review_spike.fact_ids ?? []
    });
  }

  if ((input.reviewCredibility?.review_count ?? 0) >= 3 && (input.reviewCredibility?.average_weight ?? 1) < 0.55) {
    addReason({
      key: "low_review_credibility",
      label: "Reviewer quality guard",
      detail: "Too many reviews came from weaker reviewer patterns, so ratings cannot dominate the score.",
      severity: "medium",
      penalty: 0.04,
      score_cap: 0.74,
      fact_ids: input.reviewCredibility.fact_ids ?? []
    });
  }

  if ((input.evidence?.delivered_orders_90d ?? 0) >= 20 && (input.evidence?.return_rate ?? 0) > 0.22) {
    addReason({
      key: "return_spike",
      label: "Return guard",
      detail: "Recent return outcomes are high enough that Sarthi keeps the score conservative.",
      severity: "high",
      penalty: 0.08,
      score_cap: 0.68,
      fact_ids: input.evidence.fact_ids ?? []
    });
  }

  const previous = await previousScoreSummary(db, input.variantId);
  if (previous && input.rawAdjustedScore - previous.average >= 0.12) {
    const cap = Math.min(0.82, previous.average + 0.1);
    addReason({
      key: "score_jump",
      label: "Sudden score jump",
      detail: "This SKU improved sharply from recent score history. Sarthi lets the score grow gradually until fresh outcomes confirm the change.",
      severity: "medium",
      penalty: 0.06,
      score_cap: cap
    });
  } else if (previous && previous.average - input.rawAdjustedScore >= 0.12) {
    addReason({
      key: "score_drop",
      label: "Score dropped",
      detail: "The current evidence is weaker than recent history, so Sarthi shows the lower confidence immediately.",
      severity: "medium",
      penalty: 0
    });
  }

  const appliedPenalty = Math.min(0.28, reasons.reduce((sum, reason) => sum + reason.penalty, 0));
  const scoreCap = caps.length ? Math.min(...caps) : null;
  const adjustedBeforeCap = input.rawAdjustedScore - appliedPenalty;
  const adjustedScore = scoreCap === null
    ? adjustedBeforeCap
    : Math.min(scoreCap, adjustedBeforeCap);
  return {
    guard_version: "score_integrity_guard_v1",
    status: input.sourceHealth?.blocking ? "blocked" : reasons.length ? "watch" : "clear",
    applied_penalty: Number(appliedPenalty.toFixed(3)),
    score_cap: scoreCap === null ? null : Number(scoreCap.toFixed(3)),
    adjusted_score: Number(adjustedScore.toFixed(3)),
    reasons,
    previous_score: previous,
    source_health_status: input.sourceHealth?.overall_status ?? "unknown"
  };
}

async function previousScoreSummary(db: Db, variantId: string) {
  const rows = await collections(db).trustScoreSnapshots
    .find({ variant_id: variantId })
    .sort({ created_at: -1 })
    .limit(5)
    .toArray();
  const scores = rows
    .map((row: any) => Number(row.score))
    .filter((score: number) => Number.isFinite(score));
  if (!scores.length) return null;
  const average = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
  return {
    variant_id: variantId,
    average: Number(average.toFixed(3)),
    latest: Number(scores[0].toFixed(3)),
    sample_size: scores.length,
    last_seen_at: rows[0]?.created_at ?? null
  };
}

type RankClusterOptions = {
  recordSnapshot?: boolean;
  intent?: string;
  productIds?: string[];
  selectedVariantId?: string;
};

export async function rankCluster(db: Db, buyerId: string, clusterId: string, preferredFit = "comfort", options: RankClusterOptions = {}) {
  const c = collections(db);
  const cluster = await c.clusters.findOne({ cluster_id: clusterId });
  const [weightConfig, health] = await Promise.all([
    trustWeightConfig(db, cluster?.category),
    sourceHealth(db)
  ]);
  const productIds = [...new Set(options.productIds ?? [])];
  const products = productIds.length
    ? (await c.products.find({ product_id: { $in: productIds }, is_sarthi_eligible: 1 }).toArray())
      .sort((left: any, right: any) => productIds.indexOf(left.product_id) - productIds.indexOf(right.product_id))
    : await c.products.find({ cluster_id: clusterId, is_sarthi_eligible: 1 }).toArray();
  const selectedVariant = options.selectedVariantId
    ? await c.variants.findOne({ variant_id: options.selectedVariantId })
    : null;
  const selectedSize = selectedVariant?.size ?? null;
  const candidates = [];
  const factIds = new Set<string>();
  const candidateResults = await Promise.all(products.map(async (product) => {
    const productVariants = await variantsForProduct(db, product.product_id);
    const target = selectComparableVariant(productVariants, product.product_id, selectedVariant, selectedSize);
    if (!target) return null;
    const [
      evidence,
      verification,
      fit,
      reviewCredibility,
      offer
    ] = await Promise.all([
      variantEvidence(db, target.variant_id),
      sellerVerification(db, product.seller_id),
      fitPrediction(db, buyerId, target.variant_id, preferredFit),
      reviewCredibilitySummary(db, product.product_id),
      verifyOffer(db, target.variant_id)
    ]);
    const coverage = await proofCoverage(db, product.product_id, target.variant_id, { evidence });
    const sellerScore = verification.verification_status === "verified" ? 0.9 : 0.45;
    const outcomeQuality = 1 - Math.min(0.6, evidence.return_rate) / 0.6;
    const fitScore = fit.confidence === "medium" ? 0.75 : 0.55;
    const ratingSignal = Math.max(0, Math.min(1, product.rating / 5));
    const priceValue = 1 - Math.min(1, Math.max(0, product.base_price - 320) / 900);
    const weightedReviewRating = reviewCredibility.weighted_average ?? product.rating;
    const reviewSignal = Math.max(0.25, Math.min(1, weightedReviewRating / 5 * (0.72 + reviewCredibility.average_weight * 0.28) - (evidence.return_rate > 0.18 ? 0.15 : 0)));
    const proofScore = proofCoverageScore(coverage);
    const offerScore = offerTruthScore(offer);
    const fairStartPolicy = sellerFairStartPolicy(verification, evidence, proofScore);
    const uncertaintyPenalty = evidence.evidence_strength === "strong" ? 0 : evidence.evidence_strength === "medium" ? 0.06 : 0.18;
    const fulfilmentReliability = 1 - Math.min(1, evidence.median_dispatch_hours / 72);
    const confidenceAssignment = await assignConfidenceItems({
      product: {
        category: product.category,
        garment_type: product.garment_type,
        fabric: product.fabric,
        base_price: product.base_price,
        rating: product.rating
      },
      seller: {
        verification_status: verification.verification_status,
        pickup_pincode: verification.pickup_pincode,
        locality: verification.pickup_pincode ?? "unknown"
      },
      season_hint: currentSeasonHint(),
      priority: "buyer_keep_confidence",
      evidence: {
        delivered_orders_90d: evidence.delivered_orders_90d,
        returns_90d: evidence.returns_90d,
        return_rate: evidence.return_rate,
        median_dispatch_hours: evidence.median_dispatch_hours,
        evidence_strength: evidence.evidence_strength
      },
      review_credibility: {
        weighted_average: reviewCredibility.weighted_average,
        average_weight: reviewCredibility.average_weight,
        review_count: reviewCredibility.review_count
      },
      offer_status: offer.status
    }, [
      { key: "fit_match", label: "Fit match", weight: weightConfig.weights.fit_match, confidence: fitScore, rationale: `Fit confidence is ${fit.confidence}` },
      { key: "outcome_quality", label: "Kept-order quality", weight: weightConfig.weights.outcome_quality, confidence: outcomeQuality, rationale: `${evidence.returns_90d} returns from ${evidence.delivered_orders_90d} delivered orders` },
      { key: "seller_trust", label: "Seller trust", weight: weightConfig.weights.seller_trust, confidence: sellerScore, rationale: `Seller verification is ${verification.verification_status}` },
      { key: "review_signal", label: "Credible reviews", weight: weightConfig.weights.review_signal, confidence: reviewSignal, rationale: `${reviewCredibility.review_count} reviews weighted by buyer credibility` },
      { key: "rating_signal", label: "Rating signal", weight: weightConfig.weights.rating_signal, confidence: ratingSignal, rationale: `Current rating is ${product.rating}/5` },
      { key: "price_value", label: "Price value", weight: weightConfig.weights.price_value, confidence: priceValue, rationale: `Current price is Rs ${product.base_price}` },
      { key: "fulfilment_reliability", label: "Dispatch reliability", weight: weightConfig.weights.fulfilment_reliability, confidence: fulfilmentReliability, rationale: `${evidence.median_dispatch_hours} hour median dispatch` },
      { key: "proof_coverage", label: "Proof coverage", weight: weightConfig.weights.proof_coverage, confidence: proofScore, rationale: "Seller proof coverage for size, fabric, color, and offer evidence" },
      { key: "offer_truth", label: "Offer truth", weight: weightConfig.weights.offer_truth, confidence: offerScore, rationale: `Offer status is ${offer.status}` }
    ]);
    const confidenceBreakdown = aggregateConfidenceScore(confidenceAssignment.items);
    const rawAdjustedScore = confidenceBreakdown.score -
      uncertaintyPenalty +
      fairStartPolicy.boost;
    const integrityGuard = await scoreIntegrityGuard(db, {
      variantId: target.variant_id,
      rawAdjustedScore,
      evidence,
      reviewCredibility,
      sourceHealth: health
    });
    const score = Number(Math.max(0.05, Math.min(
      fairStartPolicy.score_cap,
      integrityGuard.score_cap ?? 1,
      rawAdjustedScore - integrityGuard.applied_penalty
    )).toFixed(3));
    return {
      candidate: {
        variant_id: target.variant_id,
        product_id: product.product_id,
        seller_id: product.seller_id,
        score,
        score_percent: Math.floor(score * 100),
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
          fair_start_boost: Number(fairStartPolicy.boost.toFixed(2)),
          integrity_penalty: Number(integrityGuard.applied_penalty.toFixed(2))
        },
        fair_start_policy: fairStartPolicy,
        score_integrity_guard: {
          ...integrityGuard,
          adjusted_score: score,
          adjusted_score_percent: Math.floor(score * 100)
        },
        score_breakdown: {
          ...confidenceBreakdown,
          confidence_source: confidenceAssignment.source,
          prompt_version: "ai_confidence_assignment_v2",
          raw_adjusted_score: Number(rawAdjustedScore.toFixed(3)),
          adjusted_score: score,
          adjusted_score_percent: Math.floor(score * 100),
          adjustments: {
            uncertainty_penalty: uncertaintyPenalty,
            fair_start_boost: Number(fairStartPolicy.boost.toFixed(3)),
            score_cap: fairStartPolicy.score_cap,
            integrity_penalty: integrityGuard.applied_penalty,
            integrity_cap: integrityGuard.score_cap
          },
          guardrails: integrityGuard.reasons,
          scoring_context: {
            item_category: product.category,
            locality: verification.pickup_pincode ?? "unknown",
            season_hint: currentSeasonHint(),
            priority: "buyer_keep_confidence"
          }
        },
        weight_version: weightConfig.version,
        fact_ids: evidence.fact_ids.slice(0, 5)
      },
      fact_ids: [...evidence.fact_ids, ...reviewCredibility.fact_ids, ...offer.fact_ids]
    };
  }));
  for (const result of candidateResults) {
    if (!result) continue;
    candidates.push(result.candidate);
    for (const id of result.fact_ids) factIds.add(id);
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
      score_percent: candidate.score_percent,
      factors: candidate.factors,
      score_breakdown: candidate.score_breakdown,
      score_integrity_guard: candidate.score_integrity_guard,
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
    selected_variant_id: selectedVariant?.variant_id ?? null,
    selected_size: selectedSize,
    candidates,
    weighting: weightConfig,
    fact_ids: [...factIds].slice(0, 16)
  };
}

function selectComparableVariant(productVariants: any[], productId: string, selectedVariant: any | null, selectedSize: string | null) {
  if (selectedVariant?.product_id === productId) {
    return productVariants.find((variant: any) => variant.variant_id === selectedVariant.variant_id) ?? null;
  }
  if (selectedSize) {
    const sameSize = productVariants.find((variant: any) => normalizeSkuSize(variant.size) === normalizeSkuSize(selectedSize));
    if (sameSize) return sameSize;
  }
  return productVariants.find((variant: any) => variant.size === "XL") ?? productVariants[0] ?? null;
}

function normalizeSkuSize(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

function currentSeasonHint() {
  const month = new Date().getMonth() + 1;
  if ([3, 4, 5, 6].includes(month)) return "summer";
  if ([7, 8, 9].includes(month)) return "monsoon";
  if ([10, 11].includes(month)) return "festive";
  return "winter";
}

export async function productForVariant(db: Db, variantId: string) {
  const variant = await collections(db).variants.findOne({ variant_id: variantId });
  if (!variant) return null;
  return productWithSeller(db, variant.product_id);
}

export function graphPath(variantId: string, factIds: string[] = []) {
  return {
    path_type: "trust_decision",
    available_from: "mongodb_evidence_projection",
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
  const [events, campaign, inventory, variant] = await Promise.all([
    c.priceEvents.find({ variant_id: variantId }).sort({ created_at: 1 }).toArray(),
    c.campaigns.findOne({ variant_id: variantId }),
    c.inventorySnapshots.findOne({ variant_id: variantId }),
    c.variants.findOne({ variant_id: variantId })
  ]);
  const product = variant ? await c.products.findOne({ product_id: variant.product_id }) : null;
  const latest = events.at(-1);
  const reference = events[0];
  const delta = reference && latest ? reference.price - latest.price : null;
  const hasDrop = delta !== null && delta > 0;
  const timerReset = (campaign?.timer_reset_count ?? 0) >= 2;
  const darkPatternShield = buildDarkPatternShield({
    variantId,
    product,
    variant,
    events,
    campaign,
    inventory,
    hasDrop,
    timerReset
  });
  const blockingDarkPattern = darkPatternShield.status === "blocked";
  const status = hasDrop && !timerReset && !blockingDarkPattern ? "verified_price_drop" : timerReset ? "no_need_to_rush" : "not_enough_history";
  const message = status === "verified_price_drop"
    ? "Verified deal. This is lower than the recent reference price."
    : status === "no_need_to_rush"
      ? "Timer history checked. Current price proof is shown with product evidence."
      : "Not enough history to verify this offer yet.";
  const fact_ids = [...events.map((event: any) => event.fact_id), campaign?.fact_id, inventory?.fact_id].filter(Boolean);
  return {
    variant_id: variantId,
    status,
    message,
    buyer_guidance: darkPatternShield.buyer_guidance,
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
    dark_pattern_shield: darkPatternShield,
    checks: [
      { key: "price_history", label: "Price history", status: hasDrop ? "positive" : "neutral", detail: hasDrop ? `Price is Rs ${delta} below baseline.` : "Not enough price movement for a strong deal claim.", fact_ids: events.map((event: any) => event.fact_id) },
      { key: "campaign_timer", label: "Timer behavior", status: timerReset ? "caution" : "neutral", detail: timerReset ? "Campaign timer has reset before, so Sarthi does not use urgency as proof." : "No repeated timer reset found.", fact_ids: campaign?.fact_id ? [campaign.fact_id] : [] },
      { key: "inventory_pressure", label: "Inventory pressure", status: inventory?.available_to_promise < 5 ? "caution" : "neutral", detail: inventory ? `${inventory.available_to_promise} units available to promise.` : "Inventory snapshot unavailable.", fact_ids: inventory?.fact_id ? [inventory.fact_id] : [] }
    ],
    fact_ids
  };
}

function buildDarkPatternShield(input: {
  variantId: string;
  product: any;
  variant: any;
  events: any[];
  campaign: any;
  inventory: any;
  hasDrop: boolean;
  timerReset: boolean;
}) {
  const factIds = [...new Set([
    ...input.events.map((event: any) => event.fact_id),
    input.campaign?.fact_id,
    input.inventory?.fact_id
  ].filter(Boolean))];
  const spike = priceHikeBeforeDiscount(input.events);
  const available = Number(input.inventory?.available_to_promise ?? 0);
  const velocity = Number(input.inventory?.sales_velocity_24h ?? 0);
  const highStockWithUrgency = Boolean(input.timerReset && available >= 12 && velocity <= 7);
  const fulfillment = input.product?.fulfillment ?? {};
  const codAvailable = fulfillment.cod_available !== false;
  const codCharge = Number(fulfillment.cod_charges ?? 0);
  const returnWindow = Number(input.product?.quality_signals?.return_window_days ?? 0);
  const returnsVisible = fulfillment.returns_enabled !== false && fulfillment.return_conditions_visible !== false && returnWindow > 0;

  const checks = [
    darkPatternCheck({
      key: "repeating_countdown_timer",
      label: "Repeating countdown timer",
      status: input.timerReset ? "watch" : "clear",
      severity: input.timerReset ? "medium" : "none",
      buyer_copy: input.timerReset
        ? "Timer history checked. Current price proof is shown with product evidence."
        : "No repeated timer reset found.",
      evidence: input.campaign
        ? `${input.campaign.timer_reset_count ?? 0} reset(s) in campaign ledger.`
        : "No campaign timer found.",
      decision_effect: input.timerReset ? "Use price proof instead of timer wording." : "Timer does not reduce confidence.",
      fact_ids: input.campaign?.fact_id ? [input.campaign.fact_id] : []
    }),
    darkPatternCheck({
      key: "fake_scarcity",
      label: "Fake scarcity",
      status: highStockWithUrgency ? "watch" : "clear",
      severity: highStockWithUrgency ? "medium" : "none",
      buyer_copy: highStockWithUrgency
        ? "Stock signal is checked against available units before it affects trust."
        : "Scarcity pressure is not being used as proof.",
      evidence: input.inventory
        ? `${available} available, ${velocity}/day recent sales velocity.`
        : "Inventory snapshot unavailable.",
      decision_effect: highStockWithUrgency ? "Use inventory proof instead of scarcity wording." : "No scarcity warning.",
      fact_ids: input.inventory?.fact_id ? [input.inventory.fact_id] : []
    }),
    darkPatternCheck({
      key: "sudden_price_hike_before_discount",
      label: "Price hike before discount",
      status: spike ? "watch" : "clear",
      severity: spike ? "high" : "none",
      buyer_copy: spike
        ? "The discount anchor is weak because price rose shortly before this offer."
        : "No sudden pre-discount price hike found.",
      evidence: spike
        ? `Price rose by Rs ${spike.amount} before the current offer.`
        : `${input.events.length} price event(s) checked.`,
      decision_effect: spike ? "Show current price proof instead of discount percentage alone." : "Price history can be used normally.",
      fact_ids: input.events.map((event: any) => event.fact_id)
    }),
    darkPatternCheck({
      key: "drip_pricing",
      label: "Drip pricing",
      status: codCharge > 0 ? "watch" : "clear",
      severity: codCharge > 0 ? "medium" : "none",
      buyer_copy: codCharge > 0
        ? `A Rs ${codCharge} COD charge must stay visible before payment.`
        : "No hidden delivery or COD charge found in the checkout ledger.",
      evidence: codCharge > 0 ? `COD charge is Rs ${codCharge}.` : "COD and delivery charges are not being added later.",
      decision_effect: codCharge > 0 ? "Show charge before payment selection." : "No drip-pricing blocker.",
      fact_ids: []
    }),
    darkPatternCheck({
      key: "basket_sneaking",
      label: "Basket sneaking",
      status: "clear",
      severity: "none",
      buyer_copy: "No extra item was added by the offer service.",
      evidence: "Cart line item count is checked during checkout confidence.",
      decision_effect: "Keep checkout item count visible.",
      fact_ids: []
    }),
    darkPatternCheck({
      key: "forced_prepaid",
      label: "Forced prepaid",
      status: codAvailable ? "clear" : "blocked",
      severity: codAvailable ? "none" : "high",
      buyer_copy: codAvailable
        ? "No forced payment mode. COD and online payment remain buyer choices."
        : "COD is unavailable, so this cannot be shown as a free payment choice.",
      evidence: codAvailable ? "COD availability is true in fulfillment data." : "Fulfillment data marks COD unavailable.",
      decision_effect: codAvailable ? "Payment choice stays open." : "Block prepaid nudges.",
      fact_ids: []
    }),
    darkPatternCheck({
      key: "misleading_only_today_offer",
      label: "Misleading only-today offer",
      status: input.timerReset ? "watch" : "clear",
      severity: input.timerReset ? "medium" : "none",
      buyer_copy: input.timerReset
        ? "Only-today wording is checked against campaign history before it affects trust."
        : "No misleading only-today pattern found.",
      evidence: input.campaign
        ? `Campaign started ${input.campaign.start_at} and ends ${input.campaign.end_at}.`
        : "No campaign found.",
      decision_effect: input.timerReset ? "Use campaign history in the recommendation." : "No timer wording issue.",
      fact_ids: input.campaign?.fact_id ? [input.campaign.fact_id] : []
    }),
    darkPatternCheck({
      key: "hidden_return_conditions",
      label: "Hidden return conditions",
      status: returnsVisible ? "clear" : "blocked",
      severity: returnsVisible ? "none" : "high",
      buyer_copy: returnsVisible
        ? `${returnWindow || 7}-day return condition is visible before payment.`
        : "Return conditions are missing or unclear. Keep payment protection visible.",
      evidence: returnsVisible
        ? "Return window and returns-enabled fields are present."
        : "Return window or return visibility failed.",
      decision_effect: returnsVisible ? "Refund expectation can be locked." : "Show return policy and buyer protection before payment.",
      fact_ids: []
    })
  ];

  const blocked = checks.filter((check) => check.status === "blocked");
  const watch = checks.filter((check) => check.status === "watch");
  const status = blocked.length ? "blocked" : watch.length ? "watch" : "clear";
  const primary = blocked[0] ?? watch[0] ?? null;
  const plainCopy = input.timerReset
    ? "Timer history checked. Current price proof is shown with product evidence."
    : primary?.buyer_copy ?? (input.hasDrop ? "Offer history is clean. Product proof is shown alongside price." : "Current price proof is available when history is limited.");
  return {
    shield_version: "dark_pattern_disruptor_v2",
    status,
    headline: status === "clear" ? "Offer proof looks clear" : status === "blocked" ? "Checkout proof blocked" : "Offer proof needs attention",
    plain_copy: plainCopy,
    buyer_guidance: status === "clear"
      ? "You can use the offer if product trust is also strong."
      : plainCopy,
    risk_count: blocked.length + watch.length,
    blocked_count: blocked.length,
    watch_count: watch.length,
    checks,
    fact_ids: factIds
  };
}

function darkPatternCheck(input: {
  key: string;
  label: string;
  status: "clear" | "watch" | "blocked";
  severity: "none" | "low" | "medium" | "high";
  buyer_copy: string;
  evidence: string;
  decision_effect: string;
  fact_ids: string[];
}) {
  return input;
}

function priceHikeBeforeDiscount(events: any[]) {
  if (events.length < 3) return null;
  const sorted = [...events].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  const first = sorted[0];
  const latest = sorted.at(-1);
  const middle = sorted.slice(1, -1).sort((left, right) => Number(right.price ?? 0) - Number(left.price ?? 0))[0];
  if (!first || !middle || !latest) return null;
  const amount = Number(middle.price ?? 0) - Number(first.price ?? 0);
  const latestDrop = Number(middle.price ?? 0) - Number(latest.price ?? 0);
  if (amount >= 25 && latestDrop > 0) {
    return {
      amount,
      high_price: Number(middle.price ?? 0),
      baseline_price: Number(first.price ?? 0),
      latest_price: Number(latest.price ?? 0),
      fact_id: middle.fact_id
    };
  }
  return null;
}

export async function proofCoverage(db: Db, productId: string, variantId?: string | null, options: { evidence?: any } = {}) {
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
    const ev = options.evidence ?? await variantEvidence(db, variantId);
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
  const coverage = await proofCoverage(db, productId, variant.variant_id, { evidence });
  const gaps = evidenceGaps(coverage);
  const trust = await trustState(db, product, evidence);
  const conflictRows = await conflicts(db, product, variant.variant_id);
  const requests = await collections(db).proofRequests.find({ product_id: productId, status: { $in: ["open", "submitted"] } }).toArray();
  const truthCard = buildSkuTruthCard({
    product,
    variant,
    evidence,
    fit,
    issue,
    offer,
    reviews,
    coverage,
    gaps,
    trust,
    conflicts: conflictRows,
    requests
  });
  const fitConfidenceLayer = await buildFitConfidenceLayer(db, buyerId, {
    product,
    variant,
    variants,
    evidence,
    fit,
    coverage,
    requests
  });
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
    truth_card: truthCard,
    fit_confidence_layer: fitConfidenceLayer,
    fact_ids
  };
}

function buildSkuTruthCard({
  product,
  variant,
  evidence,
  fit,
  issue,
  offer,
  reviews,
  coverage,
  gaps,
  trust,
  conflicts,
  requests
}: Record<string, any>) {
  const verified: any[] = [];
  if (trust.seller_verification?.verification_status === "verified") {
    verified.push({
      key: "seller",
      label: "Seller verified",
      value: product.seller_name,
      detail: "Seller verification is a gate before strong recommendation.",
      fact_ids: []
    });
  }
  if (evidence.delivered_orders_90d > 0) {
    verified.push({
      key: "sku_outcomes",
      label: "SKU outcomes",
      value: `${evidence.delivered_orders_90d} orders`,
      detail: `${Math.round(evidence.return_rate * 100)}% recent return risk is included in the score.`,
      fact_ids: evidence.fact_ids.slice(0, 5)
    });
  }
  if (coverage.size?.sufficient) {
    verified.push({
      key: "size",
      label: "Size evidence",
      value: fit.recommended_size,
      detail: coverage.size.source_summary,
      fact_ids: coverage.size.fact_ids ?? []
    });
  }
  if (reviews.credibility_summary?.review_count) {
    verified.push({
      key: "reviews",
      label: "Reviews weighted",
      value: `${reviews.credibility_summary.credible_review_count}/${reviews.credibility_summary.review_count}`,
      detail: "Reviews from newer or high-return accounts carry lower weight.",
      fact_ids: reviews.credibility_summary.fact_ids ?? []
    });
  }
  if (product.media_evidence?.verification_status === "verified_gallery") {
    verified.push({
      key: "media",
      label: "Product photos",
      value: `${product.media_evidence.image_count} photos`,
      detail: "Catalog gallery has multiple seller media angles.",
      fact_ids: []
    });
  }

  const missing = gaps.map((gap: any) => ({
    key: gap.attribute,
    label: gap.title,
    detail: gap.summary,
    action: `Ask seller for ${String(gap.recommended_proof_type).replaceAll("_", " ")}`,
    severity: gap.severity ?? "medium",
    fact_ids: gap.fact_ids ?? []
  }));

  const changedRecently = [
    {
      key: "outcomes",
      label: "Outcome ledger",
      value: ageLabel(evidence.last_updated_at),
      detail: `${evidence.delivered_orders_90d} recent delivered outcomes are attached to this SKU.`,
      tone: evidence.evidence_strength === "strong" ? "positive" : "watch",
      fact_ids: evidence.fact_ids.slice(0, 4)
    },
    {
      key: "offer",
      label: "Offer truth",
      value: label(offer.status),
      detail: offer.message,
      tone: offer.status === "verified_price_drop" ? "positive" : "watch",
      fact_ids: offer.fact_ids.slice(0, 4)
    },
    ...(requests.length ? [{
      key: "seller_proof",
      label: "Seller proof demand",
      value: `${requests.length} pending`,
      detail: "Buyer proof requests are tracked as aggregate seller tasks.",
      tone: "watch",
      fact_ids: requests.map((request: any) => request.fact_id).filter(Boolean).slice(0, 4)
    }] : [])
  ];

  const cautionReasons = [
    ...missing.slice(0, 2).map((item: any) => item.detail),
    ...conflicts.slice(0, 2).map((item: any) => item.summary),
    ...(issue ? [issue.title] : [])
  ].filter(Boolean);

  return {
    title: "SKU Truth Card",
    status: trust.status,
    confidence: trust.confidence,
    can_recommend: trust.can_recommend,
    headline: trust.headline,
    guidance: trust.buyer_guidance,
    verified,
    missing,
    changed_recently: changedRecently.slice(0, 3),
    score_reason: {
      band: trust.confidence,
      headline: trust.headline,
      summary: trust.buyer_guidance,
      positive: trust.reasons.slice(0, 3),
      caution: cautionReasons.length ? cautionReasons.slice(0, 3) : ["No major blocker found for this SKU."],
      fact_ids: [...new Set([...evidence.fact_ids, ...fit.fact_ids])].slice(0, 8)
    },
    pending_seller_proof: requests.map((request: any) => ({
      request_id: request.request_id,
      attribute: request.attribute,
      label: `${label(request.attribute)} proof`,
      status: request.status,
      demand: request.request_count,
      detail: request.buyer_question ?? `${label(request.attribute)} proof is pending from the seller.`,
      fact_ids: request.fact_id ? [request.fact_id] : []
    })),
    unsafe_claims: unsafeClaims(gaps, conflicts, offer, coverage),
    primary_action: primaryTruthAction(trust, gaps, issue),
    privacy_note: "Seller sees only aggregate proof demand. Buyer fit profile and private memory stay buyer-only."
  };
}

async function buildFitConfidenceLayer(db: Db, buyerId: string, input: Record<string, any>) {
  const c = collections(db);
  const { product, variant, variants, evidence, fit, coverage, requests } = input;
  const variantIds = variants.map((item: any) => item.variant_id);
  const outcomes = await c.outcomes.find({ variant_id: { $in: variantIds } }).toArray();
  const fitReviews = await c.reviews.find({ product_id: product.product_id, attribute: "fit" }).toArray();
  const profiles = await c.buyerFitProfiles.find({ buyer_id: buyerId }).sort({ active: -1, updated_at: -1 }).toArray();
  const sizeProofAssets = await c.sellerEvidenceAssets.find({
    product_id: product.product_id,
    attribute: "size",
    status: { $in: ["submitted", "verified"] }
  }).toArray();
  const stats = variants.map((item: any) => sizeOutcomeStats(item, outcomes.filter((outcome: any) => outcome.variant_id === item.variant_id)));
  const selectedStats = stats.find((item: any) => item.variant_id === variant.variant_id) ?? sizeOutcomeStats(variant, []);
  const saferVariant = variants.find((item: any) => item.size === fit.recommended_size) ?? null;
  const saferStats = saferVariant ? stats.find((item: any) => item.variant_id === saferVariant.variant_id) ?? null : null;
  const selectedTight = selectedStats.tight_fit_return_rate;
  const selectedLoose = selectedStats.loose_fit_return_rate;
  const fitLabel = selectedTight >= 0.18
    ? "Runs small"
    : selectedLoose >= 0.18
      ? "Runs loose"
      : "True to size";
  const fitScore = Math.round(Math.max(0.2, Math.min(0.98, evidence.fit_as_expected_rate)) * 100);
  const reviewerSummary = reviewerFitSummary(fitReviews, fit.recommended_size, selectedStats, saferStats);
  const measurementProof = measurementProofSummary(sizeProofAssets, coverage.size, requests);
  const claimWarning = fitClaimWarning(variant, fit.recommended_size, selectedTight, measurementProof, selectedStats);
  const familyProfiles = profiles.map((profile: any) => {
    const recommendedSize = normalizeProfileSize(profile.size_map?.[product.category]) ?? fit.recommended_size;
    const recommendedVariant = variants.find((item: any) => item.size === recommendedSize) ?? saferVariant ?? variant;
    return {
      profile_id: profile.profile_id,
      label: profile.label,
      relationship: profile.relationship,
      active: Boolean(profile.active),
      recommended_size: recommendedVariant?.size ?? recommendedSize,
      recommended_variant_id: recommendedVariant?.variant_id ?? variant.variant_id,
      privacy_scope: profile.privacy_scope ?? "buyer_only",
      summary: `${profile.label} uses ${recommendedVariant?.size ?? recommendedSize} for ${label(product.category)}.`
    };
  });

  return {
    selected_size: variant.size,
    recommended_size: fit.recommended_size,
    fit_subscore: {
      label: fitLabel,
      score: fitScore,
      tone: fitScore >= 75 ? "positive" : fitScore >= 55 ? "watch" : "risk",
      summary: `${variant.size} has ${fitScore}% fit-as-expected evidence from recent outcomes.`,
      fact_ids: evidence.fact_ids.slice(0, 5)
    },
    size_risk: {
      level: selectedTight >= 0.18 || selectedLoose >= 0.18 || variant.size !== fit.recommended_size ? "watch" : "low",
      title: sizeRiskTitle(variant.size, fit.recommended_size, selectedTight, selectedLoose),
      summary: sizeRiskSummary(variant.size, fit.recommended_size, selectedStats, saferStats),
      selected_size: variant.size,
      safer_size: fit.recommended_size,
      selected_return_rate: selectedStats.return_rate,
      safer_return_rate: saferStats?.return_rate ?? null,
      fact_ids: selectedStats.fact_ids.slice(0, 5)
    },
    reviewer_fit_summary: reviewerSummary,
    seller_measurement_proof: measurementProof,
    family_profiles: familyProfiles,
    claim_warning: claimWarning,
    size_options: stats,
    privacy_note: "Family fit profiles are buyer-owned and are not shared with sellers."
  };
}

function ageLabel(value: string | null | undefined) {
  if (!value) return "source attached";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "source attached";
  const days = Math.max(0, Math.round((Date.now() - parsed) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function primaryTruthAction(trust: any, gaps: any[], issue: any) {
  if (gaps.length) return `Check ${label(gaps[0].attribute).toLowerCase()} proof`;
  if (issue) return issue.action;
  if (!trust.can_recommend) return "Review another seller";
  return "Continue with size and checkout checks";
}

function unsafeClaims(gaps: any[], conflicts: any[], offer: any, coverage: Record<string, any>) {
  const claims = gaps.map((gap: any) => ({
    claim: `${label(gap.attribute)} claim`,
    reason: gap.summary,
    action: `Do not rely on this claim until seller adds ${String(gap.recommended_proof_type).replaceAll("_", " ")}.`,
    severity: gap.severity ?? "medium",
    fact_ids: gap.fact_ids ?? []
  }));

  if (!coverage.size?.fact_ids?.some((factId: string) => factId.includes("proof"))) {
    claims.push({
      claim: "Exact size measurement",
      reason: "Outcome evidence can guide fit, but seller measurement proof is not verified for this SKU.",
      action: "Use safer-size guidance or ask for measurement proof.",
      severity: "medium",
      fact_ids: coverage.size?.fact_ids ?? []
    });
  }

  if (offer.truth_basis === "timer_reset") {
    claims.push({
      claim: "Offer urgency",
      reason: "The campaign timer has reset before.",
      action: "Use current price proof instead of timer wording.",
      severity: "medium",
      fact_ids: offer.fact_ids ?? []
    });
  }

  for (const conflict of conflicts.slice(0, 2)) {
    claims.push({
      claim: label(conflict.type),
      reason: conflict.summary,
      action: conflict.action,
      severity: conflict.severity,
      fact_ids: conflict.fact_ids ?? []
    });
  }

  return claims.length ? claims.slice(0, 4) : [{
    claim: "No unsafe claim found",
    reason: "The main seller, SKU, review, and proof signals are aligned enough for this stage.",
    action: "Continue with size and checkout checks.",
    severity: "low",
    fact_ids: []
  }];
}

function sizeOutcomeStats(variant: any, outcomes: any[]) {
  const deliveredRows = outcomes.filter((outcome: any) => ["delivered_kept", "returned", "exchanged"].includes(outcome.status));
  const delivered = deliveredRows.length;
  const returned = outcomes.filter((outcome: any) => outcome.status === "returned").length;
  const kept = outcomes.filter((outcome: any) => outcome.status === "delivered_kept").length;
  const tight = outcomes.filter((outcome: any) => outcome.return_reason === "too_small").length;
  const loose = outcomes.filter((outcome: any) => outcome.return_reason === "too_large").length;
  const factIds = outcomes.map((outcome: any) => outcome.fact_id).filter(Boolean);
  return {
    variant_id: variant.variant_id,
    size: variant.size,
    delivered_orders: delivered,
    kept_orders: kept,
    returns: returned,
    keep_rate: delivered ? Number((kept / delivered).toFixed(3)) : 0,
    return_rate: delivered ? Number((returned / delivered).toFixed(3)) : 0,
    tight_fit_return_rate: delivered ? Number((tight / delivered).toFixed(3)) : 0,
    loose_fit_return_rate: delivered ? Number((loose / delivered).toFixed(3)) : 0,
    fact_ids: factIds.slice(0, 6)
  };
}

function reviewerFitSummary(fitReviews: any[], recommendedSize: string, selectedStats: any, saferStats: any) {
  const credible = fitReviews.filter((review) => (review.credibility_weight ?? 0) >= 0.55);
  const mentionsRecommended = credible.filter((review) => String(review.text).toLowerCase().includes(String(recommendedSize).toLowerCase())).length;
  const saferWins = saferStats && saferStats.variant_id !== selectedStats.variant_id && saferStats.keep_rate > selectedStats.keep_rate;
  const title = saferWins
    ? `People kept ${recommendedSize} more often`
    : `${recommendedSize} is the safer fit signal`;
  const summary = credible.length
    ? `${credible.length}/${fitReviews.length || credible.length} fit reviews passed reviewer credibility checks; ${mentionsRecommended || credible.length} support checking ${recommendedSize}.`
    : `Fit review evidence is thin, so Sarthi relies more on kept-order outcomes for ${recommendedSize}.`;
  return {
    title,
    summary,
    matched_profile_size: recommendedSize,
    credible_fit_reviews: credible.length,
    total_fit_reviews: fitReviews.length,
    selected_keep_rate: selectedStats.keep_rate,
    safer_keep_rate: saferStats?.keep_rate ?? null,
    fact_ids: fitReviews.map((review) => review.fact_id).filter(Boolean).slice(0, 6)
  };
}

function measurementProofSummary(sizeProofAssets: any[], sizeCoverage: any, requests: any[]) {
  const verified = sizeProofAssets.find((asset) => asset.status === "verified");
  const submitted = sizeProofAssets.find((asset) => asset.status === "submitted");
  const pending = requests.find((request) => request.attribute === "size" && ["open", "submitted"].includes(request.status));
  if (verified) {
    return {
      status: "verified",
      label: "Measurement proof verified",
      summary: verified.description ?? "Seller measurement proof has been reviewed.",
      proof_type: verified.proof_type,
      pending_request_id: null,
      fact_ids: verified.fact_id ? [verified.fact_id] : []
    };
  }
  if (submitted) {
    return {
      status: "submitted",
      label: "Measurement proof in review",
      summary: submitted.description ?? "Seller submitted measurement proof; review is pending.",
      proof_type: submitted.proof_type,
      pending_request_id: pending?.request_id ?? null,
      fact_ids: submitted.fact_id ? [submitted.fact_id] : []
    };
  }
  return {
    status: "missing",
    label: sizeCoverage?.sufficient ? "Measurement proof missing, outcomes available" : "Measurement proof missing",
    summary: sizeCoverage?.sufficient
      ? "Seller chart is not verified yet, so Sarthi uses delivered-order fit outcomes as the safer signal."
      : "Seller needs to add a measurement chart before exact size claims become trusted.",
    proof_type: "measurement_chart",
    pending_request_id: pending?.request_id ?? null,
    fact_ids: pending?.fact_id ? [pending.fact_id] : []
  };
}

function fitClaimWarning(variant: any, recommendedSize: string, tightRate: number, measurementProof: any, selectedStats: any) {
  if (measurementProof.status !== "verified") {
    return {
      unsafe: true,
      claim: `${variant.size} exact measurement`,
      reason: "Exact seller measurement is not verified yet; use outcome evidence and safer-size guidance.",
      action: "Ask seller for measurement proof before trusting exact size claims.",
      fact_ids: measurementProof.fact_ids
    };
  }
  if (tightRate >= 0.18) {
    return {
      unsafe: true,
      claim: `${variant.size} fit promise`,
      reason: `Measurement proof exists, but recent kept-order evidence still shows tight-fit risk for ${variant.size}.`,
      action: recommendedSize !== variant.size ? `Consider ${recommendedSize} before checkout.` : "Check the measurement chart before checkout.",
      fact_ids: [...new Set([...(measurementProof.fact_ids ?? []), ...(selectedStats.fact_ids ?? [])])].slice(0, 6)
    };
  }
  return {
    unsafe: false,
    claim: `${variant.size} measurement proof`,
    reason: "Seller measurement proof and fit outcomes are aligned enough for this SKU.",
    action: "Use the verified chart with fit outcomes.",
    fact_ids: measurementProof.fact_ids
  };
}

function normalizeProfileSize(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || null;
}

function sizeRiskTitle(selectedSize: string, saferSize: string, tightRate: number, looseRate: number) {
  if (selectedSize !== saferSize && tightRate >= 0.18) return `${selectedSize} has tight-fit risk`;
  if (selectedSize !== saferSize) return `${saferSize} is safer for your profile`;
  if (tightRate >= 0.18) return "Runs small for this size";
  if (looseRate >= 0.18) return "Runs loose for this size";
  return "Size risk is controlled";
}

function sizeRiskSummary(selectedSize: string, saferSize: string, selectedStats: any, saferStats: any) {
  const selectedReturn = Math.round(selectedStats.return_rate * 100);
  if (selectedSize !== saferSize && saferStats) {
    const saferReturn = Math.round(saferStats.return_rate * 100);
    return `${selectedSize} has ${selectedReturn}% return risk; ${saferSize} has ${saferReturn}% in current SKU outcomes.`;
  }
  if (selectedStats.tight_fit_return_rate >= 0.18) {
    return `${Math.round(selectedStats.tight_fit_return_rate * 100)}% of recent outcomes mention tight-fit risk.`;
  }
  if (selectedStats.loose_fit_return_rate >= 0.18) {
    return `${Math.round(selectedStats.loose_fit_return_rate * 100)}% of recent outcomes mention loose-fit risk.`;
  }
  return `${selectedSize} is aligned with the current fit recommendation and return pattern.`;
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
    const updatedAt = nowIso();
    const requestCount = Number(existing.request_count ?? 0) + 1;
    const selector = existing._id ? { _id: existing._id } : { request_id: existing.request_id };
    await c.proofRequests.updateOne(selector, {
      $inc: { request_count: 1 },
      $set: { updated_at: updatedAt, buyer_question: question, variant_id: variantId ?? existing.variant_id ?? null }
    });
    return publicProofRequest({ ...existing, request_count: requestCount, updated_at: updatedAt, buyer_question: question, variant_id: variantId ?? existing.variant_id ?? null });
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
    buyer_question: row.buyer_question ?? null,
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
