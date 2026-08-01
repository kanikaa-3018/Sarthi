import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import {
  computeKeepConfidence,
  createOrIncrementProofRequest,
  createTrace,
  evidenceGaps,
  graphPath,
  productForVariant,
  productWithSeller,
  proofCoverage,
  rankCluster,
  reviewCredibilitySummary,
  sellerVerification,
  skuPassport,
  variantEvidence,
  variantsForProduct,
  verifyOffer
} from "./domain.js";
import { id } from "./crypto.js";
import { label, withoutId } from "./format.js";
import { resolveSimilarListingSet } from "./similarListings.js";
import { nowIso } from "./time.js";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "ONE_SIZE"];

type FitProfileInput = {
  profile_id?: string;
  label?: string;
  relationship?: string;
  preferred_fit?: string;
  active?: boolean;
  size_map?: Record<string, unknown>;
  notes?: unknown[];
};

type CartInputItem = {
  product_id?: string;
  variant_id?: string;
  size?: string;
  quantity?: number;
};

type NormalizedCartItem = {
  product: any;
  variant: any;
  quantity: number;
  selected_size: string;
};

type BracketAlert = {
  product_id: string;
  title: string;
  selected_sizes: string[];
  suggested_size: string;
  severity: "medium" | "high";
  message: string;
};

type PaymentAssistOffer = {
  offer_id: string;
  label: string;
  amount_rupees: number;
  eligible: boolean;
  reason: string;
  payment_method: "upi" | "card" | "wallet" | "prepaid";
};

type PaymentAssistCheck = {
  key: string;
  label: string;
  status: "passed" | "watch" | "blocked";
  detail: string;
};

export async function buyerFitProfileState(db: Db, buyerId: string) {
  const profiles = await ensureBuyerFitProfiles(db, buyerId);
  const activeProfile = profiles.find((profile: any) => profile.active) ?? profiles[0] ?? null;
  return {
    buyer_id: buyerId,
    active_profile: activeProfile ? publicFitProfile(activeProfile) : null,
    profiles: profiles.map(publicFitProfile),
    privacy: {
      buyer_visible: true,
      seller_visible: false,
      summary: "Fit profiles are buyer-owned. Sellers receive only aggregate issue demand, never wearer-level size data."
    }
  };
}
export async function upsertBuyerFitProfile(db: Db, buyerId: string, input: FitProfileInput) {
  const c = collections(db);
  if (input.profile_id) {
    const existing = await c.buyerFitProfiles.findOne({ profile_id: input.profile_id });
    if (existing && existing.buyer_id !== buyerId) throw new Error("Fit profile not found");
  }

  const profileId = input.profile_id ?? id("fit_profile");
  const now = nowIso();
  const active = input.active === false ? 0 : 1;
  if (active) {
    await c.buyerFitProfiles.updateMany({ buyer_id: buyerId }, { $set: { active: 0, updated_at: now } });
  }
  const payload = {
    buyer_id: buyerId,
    label: cleanText(input.label, "My profile"),
    relationship: cleanText(input.relationship, "self"),
    active,
    preferred_fit: normalizePreferredFit(input.preferred_fit),
    size_map: sanitizeSizeMap(input.size_map),
    notes: Array.isArray(input.notes) ? input.notes.map((note) => cleanText(String(note), "")).filter(Boolean).slice(0, 4) : [],
    source: "buyer_owned_profile",
    privacy_scope: "buyer_only",
    updated_at: now
  };
  await c.buyerFitProfiles.updateOne(
    { profile_id: profileId, buyer_id: buyerId },
    { $set: payload, $setOnInsert: { profile_id: profileId, created_at: now } },
    { upsert: true }
  );
  return buyerFitProfileState(db, buyerId);
}

export async function createWishlistIntent(db: Db, buyerId: string, input: {
  product_id: string;
  selected_variant_id?: string;
  profile_id?: string;
  target_price?: number;
  create_seller_signal?: boolean;
}) {
  const c = collections(db);
  const product = await productWithSeller(db, input.product_id);
  if (!product) throw new Error("Product not found");
  const similarListings = await resolveSimilarListingSet(db, product.product_id);
  const profile = await activeFitProfile(db, buyerId, input.profile_id);
  const variants = await variantsForProduct(db, product.product_id);
  const selectedVariant = variants.find((variant: any) => variant.variant_id === input.selected_variant_id)
    ?? variants.find((variant: any) => variant.size === suggestedSize(profile, product))
    ?? variants.find((variant: any) => variant.size === "XL")
    ?? variants[0];
  if (!selectedVariant) throw new Error("Variant not found");

  const now = nowIso();
  const existing = await c.wishlistIntents.findOne({
    buyer_id: buyerId,
    product_id: product.product_id,
    status: "watching"
  });
  const intent: any = existing ?? {
    intent_id: id("wish_intent"),
    buyer_id: buyerId,
    product_id: product.product_id,
    cluster_id: product.cluster_id,
    comparable_product_ids: similarListings.comparable_product_ids,
    similarity: similarListings,
    selected_variant_id: selectedVariant.variant_id,
    profile_id: profile?.profile_id ?? null,
    target_price: input.target_price ?? null,
    status: "watching",
    created_at: now,
    updated_at: now,
    last_radar_event_id: null
  };
  const updatedIntent: any = {
    ...intent,
    selected_variant_id: selectedVariant.variant_id,
    profile_id: profile?.profile_id ?? null,
    target_price: input.target_price ?? intent.target_price ?? null,
    comparable_product_ids: similarListings.comparable_product_ids,
    similarity: similarListings,
    updated_at: now
  };
  await c.wishlistIntents.updateOne(
    { intent_id: updatedIntent.intent_id },
    { $set: updatedIntent },
    { upsert: true }
  );

  const passport = await skuPassport(db, buyerId, product.product_id, selectedVariant.variant_id);
  const primaryGap = passport.evidence_gaps[0] ?? null;
  const proofRequest = primaryGap && input.create_seller_signal !== false
    ? await createOrIncrementProofRequest(db, buyerId, product, selectedVariant.variant_id, primaryGap.attribute, `Saved product needs ${label(primaryGap.attribute)} proof before checkout confidence can improve.`)
    : null;
  const radar = await buildTrustRadar(db, updatedIntent, profile, proofRequest);
  await c.wishlistIntents.updateOne(
    { intent_id: updatedIntent.intent_id },
    { $set: { last_radar_event_id: radar.event_id, updated_at: nowIso() } }
  );
  return {
    intent: withoutId({ ...updatedIntent, last_radar_event_id: radar.event_id }),
    radar,
    seller_signal: proofRequest,
    privacy: {
      seller_sees: proofRequest ? "aggregate proof demand only" : "no buyer identity shared",
      buyer_profile_shared_with_seller: false
    }
  };
}

export async function wishlistRadar(db: Db, buyerId: string) {
  const c = collections(db);
  const intents = await c.wishlistIntents.find({ buyer_id: buyerId, status: "watching" }).sort({ updated_at: -1 }).limit(8).toArray();
  const profile = await activeFitProfile(db, buyerId);
  const radar = [];
  for (const intent of intents) {
    radar.push(await buildTrustRadar(db, intent, profile, null));
  }
  return {
    buyer_id: buyerId,
    active_profile: profile ? publicFitProfile(profile) : null,
    count: radar.length,
    radar,
    privacy: {
      buyer_profile_shared_with_seller: false,
      seller_receives: "only aggregate proof requests and listing-quality tasks"
    }
  };
}

export async function computeCartConfidence(db: Db, buyerId: string, input: {
  items: CartInputItem[];
  profile_id?: string;
  payment_mode?: "cod" | "prepaid";
}) {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("Cart needs at least one item");
  const c = collections(db);
  const profile = await activeFitProfile(db, buyerId, input.profile_id);
  const items = await normalizeCartItems(db, input.items);
  const bracketAlerts = detectBracketing(items, profile);
  const bracketedProductIds = new Set(bracketAlerts.map((alert) => alert.product_id));
  const factIds = new Set<string>();
  const lineItems = [];

  for (const item of items) {
    const keep = await computeKeepConfidence(db, buyerId, item.variant.variant_id, profile?.preferred_fit ?? "comfort");
    const offer = await verifyOffer(db, item.variant.variant_id);
    const evidence = await variantEvidence(db, item.variant.variant_id);
    const profileSize = suggestedSize(profile, item.product);
    const selectedSize = normalizeSize(item.selected_size);
    const sizeMismatch = Boolean(profileSize && selectedSize !== "ONE_SIZE" && selectedSize !== profileSize);
    const bracketed = bracketedProductIds.has(item.product.product_id);
    const adjustedScore = clamp(
      keep.score
      - (sizeMismatch ? 0.06 : 0)
      - (bracketed ? 0.05 : 0)
      - darkPatternPenalty(offer.dark_pattern_shield)
      + (offer.status === "verified_price_drop" ? 0.02 : 0)
    );
    for (const factId of [...keep.fact_ids, ...offer.fact_ids, ...evidence.fact_ids]) factIds.add(factId);
    lineItems.push({
      product: item.product,
      variant: withoutId(item.variant),
      quantity: item.quantity,
      selected_size: item.selected_size,
      suggested_size: profileSize,
      keep_confidence: keep,
      offer,
      score: Number(adjustedScore.toFixed(3)),
      confidence_band: band(adjustedScore),
      reason_chips: cartReasonChips(keep, offer, evidence, sizeMismatch, bracketed),
      interventions: cartInterventions(keep, item, profileSize, sizeMismatch, bracketed, offer),
      fact_ids: [...new Set([...keep.fact_ids, ...offer.fact_ids, ...evidence.fact_ids])].slice(0, 12)
    });
  }

  const weightedTotal = lineItems.reduce((sum: number, line: any) => sum + line.score * line.quantity, 0);
  const quantityTotal = lineItems.reduce((sum: number, line: any) => sum + line.quantity, 0);
  const bracketPenalty = bracketAlerts.some((alert) => alert.severity === "high") ? 0.06 : bracketAlerts.length ? 0.03 : 0;
  const overallScore = clamp(weightedTotal / Math.max(1, quantityTotal) - bracketPenalty);
  const paymentAssist = buildPaymentAssist(overallScore, bracketAlerts, input.payment_mode ?? "cod", lineItems);
  const nudge = checkoutNudge(overallScore, bracketAlerts, input.payment_mode ?? "cod", paymentAssist);
  const trace = await createTrace(db, {
    buyer_id: buyerId,
    variant_id: lineItems[0]?.variant.variant_id ?? null,
    intent: ["cart_confidence", "checkout_nudge", "bracketing_guard"],
    tools_used: ["computeKeepConfidence", "verifyOffer", "darkPatternShield", "detectBracketing", "buyerFitProfile"],
    fact_ids: [...factIds].slice(0, 18),
    graph_paths: [graphPath(lineItems[0]?.variant.variant_id ?? "cart", [...factIds])]
  });
  for (const line of lineItems as any[]) {
    line.keep_confidence.trace_id = trace.trace_id;
  }
  const snapshot = {
    snapshot_id: id("cart_confidence"),
    trace_id: trace.trace_id,
    buyer_id: buyerId,
    profile_id: profile?.profile_id ?? null,
    payment_mode: input.payment_mode ?? "cod",
    item_count: lineItems.length,
    overall_score: Number(overallScore.toFixed(3)),
    confidence_band: band(overallScore),
    bracket_alerts: bracketAlerts,
    checkout_nudge: nudge,
    payment_assist: paymentAssist,
    line_items: lineItems.map((line: any) => ({
      product_id: line.product.product_id,
      variant_id: line.variant.variant_id,
      selected_size: line.selected_size,
      suggested_size: line.suggested_size,
      quantity: line.quantity,
      score: line.score,
      confidence_band: line.confidence_band,
      reason_chips: line.reason_chips
    })),
    fact_ids: [...factIds].slice(0, 24),
    created_at: nowIso()
  };
  await c.cartConfidenceSnapshots.insertOne(snapshot);
  return {
    trace_id: trace.trace_id,
    buyer_id: buyerId,
    active_profile: profile ? publicFitProfile(profile) : null,
    overall_score: snapshot.overall_score,
    confidence_band: snapshot.confidence_band,
    bracket_alerts: bracketAlerts,
    checkout_nudge: nudge,
    payment_assist: paymentAssist,
    line_items: lineItems,
    fact_ids: snapshot.fact_ids,
    graph_path: graphPath(lineItems[0]?.variant.variant_id ?? "cart", snapshot.fact_ids),
    snapshot_id: snapshot.snapshot_id
  };
}

async function ensureBuyerFitProfiles(db: Db, buyerId: string) {
  const c = collections(db);
  const existing = await c.buyerFitProfiles.find({ buyer_id: buyerId }).sort({ active: -1, updated_at: -1 }).toArray();
  if (existing.length) return existing;
  const buyer = await c.buyers.findOne({ buyer_id: buyerId });
  if (!buyer) throw new Error("Buyer not found");
  const now = nowIso();
  const profile = {
    profile_id: id("fit_profile"),
    buyer_id: buyerId,
    label: buyer.display_name ?? "My profile",
    relationship: "self",
    active: 1,
    preferred_fit: normalizePreferredFit(buyer.preferred_fit),
    size_map: defaultSizeMap(buyer.preferred_fit),
    notes: ["created automatically from account preference"],
    source: "buyer_owned_profile",
    privacy_scope: "buyer_only",
    created_at: now,
    updated_at: now
  };
  await c.buyerFitProfiles.insertOne(profile);
  return [profile];
}

async function activeFitProfile(db: Db, buyerId: string, profileId?: string) {
  const profiles = await ensureBuyerFitProfiles(db, buyerId);
  if (profileId) {
    const selected = profiles.find((profile: any) => profile.profile_id === profileId);
    if (!selected) throw new Error("Fit profile not found");
    return selected;
  }
  return profiles.find((profile: any) => profile.active) ?? profiles[0] ?? null;
}

function publicFitProfile(profile: any) {
  return withoutId({
    profile_id: profile.profile_id,
    buyer_id: profile.buyer_id,
    label: profile.label,
    relationship: profile.relationship,
    active: Boolean(profile.active),
    preferred_fit: profile.preferred_fit,
    size_map: profile.size_map ?? {},
    notes: profile.notes ?? [],
    privacy_scope: profile.privacy_scope ?? "buyer_only",
    updated_at: profile.updated_at
  });
}

async function normalizeCartItems(db: Db, items: CartInputItem[]): Promise<NormalizedCartItem[]> {
  const c = collections(db);
  const normalized = [];
  for (const raw of items.slice(0, 12)) {
    let variant = raw.variant_id ? await c.variants.findOne({ variant_id: raw.variant_id }) : null;
    let product = null;
    if (!variant && raw.product_id) {
      const variants = await variantsForProduct(db, raw.product_id);
      const requestedSize = raw.size ? normalizeSize(raw.size) : "";
      variant = variants.find((item: any) => normalizeSize(item.size) === requestedSize) ?? variants[0] ?? null;
    }
    if (variant) {
      product = await productWithSeller(db, variant.product_id);
    }
    if (!variant || !product) throw new Error("Cart contains an invalid product or variant");
    normalized.push({
      product,
      variant,
      quantity: Math.max(1, Math.min(5, Number(raw.quantity ?? 1) || 1)),
      selected_size: normalizeSize(variant.size)
    });
  }
  return normalized;
}

function detectBracketing(items: NormalizedCartItem[], profile: any): BracketAlert[] {
  const byProduct = new Map<string, NormalizedCartItem[]>();
  for (const item of items) {
    const rows = byProduct.get(item.product.product_id) ?? [];
    rows.push(item);
    byProduct.set(item.product.product_id, rows);
  }
  return [...byProduct.entries()]
    .map(([productId, rows]) => {
      const uniqueSizes = [...new Set(rows.map((row) => normalizeSize(row.selected_size)).filter((size) => size !== "ONE_SIZE"))];
      if (uniqueSizes.length < 2) return null;
      const product = rows[0].product;
      const suggested = suggestedSize(profile, product) || medianSize(uniqueSizes) || uniqueSizes[0];
      return {
        product_id: productId,
        title: product.title,
        selected_sizes: uniqueSizes,
        suggested_size: suggested,
        severity: uniqueSizes.length >= 3 ? "high" as const : "medium" as const,
        message: uniqueSizes.length >= 3
          ? "Multiple sizes of the same product are in cart. Keep only the best-fit size to avoid return/RTO risk."
          : "Two sizes of the same product are in cart. Sarthi can help keep the safer size."
      };
    })
    .filter((alert): alert is BracketAlert => Boolean(alert));
}

async function buildTrustRadar(db: Db, intent: any, profile: any, proofRequest: any) {
  const c = collections(db);
  const selectedProduct = await productWithSeller(db, intent.product_id);
  if (!selectedProduct) throw new Error("Wishlist product not found");
  const similarity = intent.similarity ?? await resolveSimilarListingSet(db, selectedProduct.product_id);
  const comparableProductIds = Array.isArray(intent.comparable_product_ids) && intent.comparable_product_ids.length
    ? intent.comparable_product_ids
    : similarity.comparable_product_ids;
  const ranking = await rankCluster(db, intent.buyer_id, intent.cluster_id, profile?.preferred_fit ?? "comfort", {
    recordSnapshot: true,
    intent: "wishlist_radar",
    productIds: comparableProductIds
  });
  const savedCandidate = ranking.candidates.find((candidate: any) => candidate.product_id === selectedProduct.product_id) ?? null;
  const winnerCandidate = ranking.candidates[0] ?? savedCandidate;
  const winnerProduct = winnerCandidate ? await productForVariant(db, winnerCandidate.variant_id) : selectedProduct;
  const selectedScore = savedCandidate?.score ?? 0;
  const winnerScore = winnerCandidate?.score ?? selectedScore;
  const betterOptionFound = Boolean(winnerProduct && winnerProduct.product_id !== selectedProduct.product_id && winnerScore - selectedScore >= 0.04);
  const candidateCards = [];
  const factIds = new Set<string>(ranking.fact_ids);
  for (const candidate of ranking.candidates.slice(0, 4)) {
    const product = await productForVariant(db, candidate.variant_id);
    if (!product) continue;
    const variant = await c.variants.findOne({ variant_id: candidate.variant_id });
    const evidence = await variantEvidence(db, candidate.variant_id);
    const offer = await verifyOffer(db, candidate.variant_id);
    const seller = await sellerVerification(db, product.seller_id);
    const reviews = await reviewCredibilitySummary(db, product.product_id);
    for (const factId of [...candidate.fact_ids, ...evidence.fact_ids, ...offer.fact_ids, ...reviews.fact_ids]) factIds.add(factId);
    candidateCards.push({
      product,
      variant: variant ? withoutId(variant) : null,
      score: candidate.score,
      rank: candidateCards.length + 1,
      is_saved_product: product.product_id === selectedProduct.product_id,
      is_recommended: candidate.variant_id === winnerCandidate?.variant_id,
      reason_chips: scoreReasonChips(candidate),
      evidence: {
        return_rate: evidence.return_rate,
        delivered_orders_90d: evidence.delivered_orders_90d,
        evidence_strength: evidence.evidence_strength,
        seller_verification: seller.verification_status,
        review_reliability: reviews.reliability,
        offer_status: offer.status
      },
      fact_ids: [...new Set([...candidate.fact_ids, ...evidence.fact_ids, ...offer.fact_ids, ...reviews.fact_ids])].slice(0, 12)
    });
  }
  const coverage = await proofCoverage(db, selectedProduct.product_id, intent.selected_variant_id);
  const gaps = evidenceGaps(coverage);
  const alerts = radarAlerts(selectedProduct, savedCandidate, winnerCandidate, gaps, proofRequest);
  const trace = await createTrace(db, {
    buyer_id: intent.buyer_id,
    product_id: selectedProduct.product_id,
    variant_id: winnerCandidate?.variant_id ?? intent.selected_variant_id,
    intent: ["wishlist_radar", "next_best_owner_match"],
    tools_used: ["resolveSimilarListings", "rankCluster", "scoreReasonChips", "proofCoverage", "sellerVerification"],
    fact_ids: [...factIds].slice(0, 18),
    graph_paths: [graphPath(winnerCandidate?.variant_id ?? intent.selected_variant_id, [...factIds])]
  });
  const event = {
    event_id: id("radar_event"),
    trace_id: trace.trace_id,
    intent_id: intent.intent_id,
    buyer_id: intent.buyer_id,
    cluster_id: intent.cluster_id,
    selected_product_id: selectedProduct.product_id,
    recommended_product_id: winnerProduct?.product_id ?? selectedProduct.product_id,
    recommended_variant_id: winnerCandidate?.variant_id ?? intent.selected_variant_id,
    status: betterOptionFound ? "better_option_found" : winnerScore >= 0.72 ? "saved_option_strong" : "needs_one_check",
    headline: betterOptionFound
      ? "Sarthi found a safer seller option"
      : winnerScore >= 0.72
        ? "Saved product is strong enough to consider"
        : "Saved product needs one proof check",
    summary: betterOptionFound
      ? `${winnerProduct?.seller_name ?? "Another seller"} scores higher for this same product cluster, based on seller, return, review, proof, and offer evidence.`
      : winnerScore >= 0.72
        ? "The saved product aligns with the current evidence map. Sarthi will still check offer truth at checkout."
        : "Sarthi is not blocking the product, but it needs one confidence-improving step before checkout.",
    selected_score: Number(selectedScore.toFixed(3)),
    recommended_score: Number((winnerScore ?? 0).toFixed(3)),
    delta: Number(((winnerScore ?? 0) - selectedScore).toFixed(3)),
    alerts,
    candidates: candidateCards,
    similarity: {
      method: similarity.method,
      summary: similarity.summary,
      distinct_seller_count: similarity.distinct_seller_count,
      candidates: similarity.candidates.slice(0, 4),
      agent: similarity.agent
    },
    next_best_action: nextRadarAction(betterOptionFound, gaps, proofRequest, winnerCandidate),
    fact_ids: [...factIds].slice(0, 24),
    created_at: nowIso()
  };
  await c.trustRadarEvents.insertOne(event);
  return withoutId(event);
}

function radarAlerts(selectedProduct: any, savedCandidate: any, winnerCandidate: any, gaps: any[], proofRequest: any) {
  const alerts = [];
  if (winnerCandidate && savedCandidate && winnerCandidate.variant_id !== savedCandidate.variant_id && winnerCandidate.score - savedCandidate.score >= 0.04) {
    alerts.push({
      type: "better_option",
      severity: "medium",
      title: "Better mapped seller exists",
      detail: "The same product cluster has another seller with stronger trust evidence."
    });
  }
  if (!savedCandidate) {
    alerts.push({
      type: "limited_saved_evidence",
      severity: "medium",
      title: "Saved listing has limited mapped evidence",
      detail: "Sarthi ranked the closest eligible alternatives instead of guessing."
    });
  }
  if (gaps.length) {
    alerts.push({
      type: "proof_gap",
      severity: "high",
      title: `${label(gaps[0].attribute)} proof needed`,
      detail: proofRequest
        ? "A seller proof signal has been added without revealing buyer identity."
        : gaps[0].summary
    });
  }
  if (!selectedProduct.is_sarthi_eligible) {
    alerts.push({
      type: "catalog_only",
      severity: "medium",
      title: "Catalog-only listing",
      detail: "The listing is visible, but it cannot receive a strong recommendation until enough evidence exists."
    });
  }
  return alerts.slice(0, 4);
}

function nextRadarAction(betterOptionFound: boolean, gaps: any[], proofRequest: any, winnerCandidate: any) {
  if (betterOptionFound && winnerCandidate) {
    return {
      type: "open_recommended_listing",
      label: "Open safer seller option",
      variant_id: winnerCandidate.variant_id,
      reason: "This reduces manual comparison across similar listings."
    };
  }
  if (gaps.length) {
    return {
      type: proofRequest ? "wait_for_seller_proof" : "ask_seller_proof",
      label: proofRequest ? "Proof signal sent" : "Ask seller proof",
      variant_id: winnerCandidate?.variant_id ?? null,
      reason: "The next confidence gain should come from seller evidence, not buyer guesswork."
    };
  }
  return {
    type: "continue_to_detail",
    label: "Review size and checkout confidence",
    variant_id: winnerCandidate?.variant_id ?? null,
    reason: "Main evidence signals are aligned."
  };
}

function scoreReasonChips(candidate: any) {
  const labels: Record<string, string> = {
    fit_match: "Fit match",
    outcome_quality: "Kept-order quality",
    expectation_match: "Expectation match",
    fulfilment_reliability: "Dispatch reliability",
    seller_trust: "Seller trust",
    review_signal: "Credible reviews",
    rating_signal: "Rating signal",
    price_value: "Price value",
    proof_coverage: "Proof coverage",
    offer_truth: "Offer truth",
    fair_start_boost: "New seller fair-start"
  };
  const positives = Object.entries(candidate.factors ?? {})
    .filter(([key]) => !["uncertainty_penalty"].includes(key))
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, 3)
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? label(key),
      value: Number(value),
      sentiment: Number(value) >= 0.65 ? "positive" : "watch"
    }));
  const penalty = Number(candidate.factors?.uncertainty_penalty ?? 0);
  if (penalty > 0.08) {
    positives.push({
      key: "uncertainty_penalty",
      label: "Evidence still building",
      value: penalty,
      sentiment: "watch"
    });
  }
  return positives;
}

function cartReasonChips(keep: any, offer: any, evidence: any, sizeMismatch: boolean, bracketed: boolean) {
  const chips = [];
  chips.push({ type: "keep_confidence", label: `${Math.round(keep.score * 100)}/100 keep confidence`, sentiment: keep.score >= 0.72 ? "positive" : "watch" });
  chips.push({ type: "return_rate", label: `${Math.round(evidence.return_rate * 100)}% return rate`, sentiment: evidence.return_rate <= 0.16 ? "positive" : "watch" });
  chips.push({
    type: "offer_truth",
    label: offer.status === "verified_price_drop" ? "Verified offer" : "Do not rush offer",
    sentiment: offer.status === "verified_price_drop" && offer.dark_pattern_shield?.status === "clear" ? "positive" : "neutral"
  });
  if (offer.dark_pattern_shield?.status && offer.dark_pattern_shield.status !== "clear") {
    chips.push({
      type: "dark_pattern_shield",
      label: offer.dark_pattern_shield.headline,
      sentiment: offer.dark_pattern_shield.status === "blocked" ? "watch" : "neutral"
    });
  }
  if (sizeMismatch) chips.push({ type: "size_mismatch", label: "Size differs from profile", sentiment: "watch" });
  if (bracketed) chips.push({ type: "bracketing", label: "Multiple sizes in cart", sentiment: "watch" });
  return chips;
}

function cartInterventions(keep: any, item: NormalizedCartItem, profileSize: string | null, sizeMismatch: boolean, bracketed: boolean, offer: any) {
  const actions = [];
  if (sizeMismatch && profileSize) {
    actions.push({
      type: "switch_size",
      label: `Use ${profileSize}`,
      reason: "This matches the selected fit profile better than the current size."
    });
  }
  if (bracketed) {
    actions.push({
      type: "remove_bracket_sizes",
      label: "Keep one size only",
      reason: "Ordering multiple sizes increases return/RTO risk and manual follow-up."
    });
  }
  const darkPatternIssue = offer.dark_pattern_shield?.checks?.find((check: any) => check.status !== "clear");
  if (darkPatternIssue) {
    actions.push({
      type: "dark_pattern_shield",
      label: darkPatternIssue.key === "repeating_countdown_timer" ? "Do not rush" : darkPatternIssue.label,
      reason: darkPatternIssue.buyer_copy
    });
  } else if (offer.status !== "verified_price_drop") {
    actions.push({
      type: "ignore_fake_urgency",
      label: "Ignore timer pressure",
      reason: offer.message
    });
  }
  const primary = keep.interventions?.[0];
  if (primary) {
    actions.push({
      type: primary.action,
      label: primary.label,
      reason: primary.reason,
      variant_id: primary.target_variant_id ?? item.variant.variant_id
    });
  }
  return actions.slice(0, 3);
}

function checkoutNudge(score: number, bracketAlerts: any[], paymentMode: string, paymentAssist: any) {
  const highBracket = bracketAlerts.some((alert) => alert.severity === "high");
  const prepaidAllowed = paymentAssist.recommended_mode === "prepaid";
  if (prepaidAllowed) {
    return {
      code: "prepaid_safe_to_nudge",
      prepaid_recommended: true,
      title: paymentMode === "prepaid" ? "Pay online choice is backed by evidence" : "Pay online is safe to consider",
      message: paymentAssist.checkout_confidence.payment_reason,
      trust_condition: "Only suggest Pay online when product trust, return risk, offer truth, and checkout pressure checks pass.",
      company_benefit: "Lower RTO risk, fewer failed delivery attempts, and better delivery partner utilization."
    };
  }
  if (score >= 0.58 && !highBracket) {
    return {
      code: "prepaid_after_one_check",
      prepaid_recommended: false,
      title: "Complete one check before Pay online",
      message: paymentAssist.checkout_confidence.payment_reason,
      trust_condition: "Do not trade buyer trust for payment conversion.",
      company_benefit: "Balanced conversion with lower avoidable returns."
    };
  }
  return {
    code: "cod_or_review_first",
    prepaid_recommended: false,
    title: "Keep checkout cautious",
    message: paymentAssist.checkout_confidence.payment_reason || (highBracket
      ? "Remove bracketed sizes before payment nudges."
      : "Confidence is low, so the buyer needs proof or size correction before Pay online rewards."),
    trust_condition: "Payment nudges pause when product confidence is not strong.",
    company_benefit: "Prevents payment pushback, cancellations, and support tickets."
  };
}

export function buildPaymentAssist(score: number, bracketAlerts: BracketAlert[], paymentMode: "cod" | "prepaid", lineItems: any[]) {
  const cartValue = lineItems.reduce((sum: number, line: any) => {
    const price = Number(line.variant?.current_price ?? line.product?.base_price ?? 0);
    const quantity = Number(line.quantity ?? 1);
    return sum + price * Math.max(1, quantity);
  }, 0);
  const highBracket = bracketAlerts.some((alert) => alert.severity === "high");
  const anyBracket = bracketAlerts.length > 0;
  const darkPatternShield = cartDarkPatternShield(lineItems);
  const productTrustPassed = score >= 0.66 && lineItems.every((line: any) => {
    const lineScore = Number(line.keep_confidence?.score ?? 0);
    return lineScore >= 0.64 && line.confidence_band !== "low";
  });
  const offerTruthPassed = lineItems.every((line: any) =>
    line.offer?.status === "verified_price_drop" &&
    line.offer?.dark_pattern_shield?.status === "clear"
  );
  const returnRiskPassed = !anyBracket && !highBracket;
  const darkPatternPassed = darkPatternShield.status === "clear";
  const noForcedPayment = !darkPatternShield.checks.some((check: any) => check.key === "forced_prepaid" && check.status === "blocked");
  const prepaidAllowed = productTrustPassed && offerTruthPassed && returnRiskPassed && darkPatternPassed && noForcedPayment;
  const recommendedMode = prepaidAllowed ? "prepaid" : "cod";
  const rewardPoints = prepaidAllowed ? Math.max(20, Math.round(cartValue * 0.06)) : 0;
  const rewardValue = prepaidAllowed ? Math.max(5, Math.round(rewardPoints * 0.25)) : 0;
  const upiReward = prepaidAllowed ? Math.min(30, Math.max(10, Math.round(cartValue * 0.03))) : 0;
  const bankRewardEligible = prepaidAllowed && cartValue >= 399;
  const bankReward = bankRewardEligible ? Math.min(45, Math.max(15, Math.round(cartValue * 0.05))) : 0;
  const codExtraCharge = lineItems.reduce((sum: number, line: any) => {
    const charge = Number(line.product?.fulfillment?.cod_charges ?? 0);
    const quantity = Number(line.quantity ?? 1);
    return sum + charge * Math.max(1, quantity);
  }, 0);
  const codAvailable = lineItems.every((line: any) => line.product?.fulfillment?.cod_available !== false);
  const offers: PaymentAssistOffer[] = [
    {
      offer_id: "upi_prepaid_reward",
      label: "UPI Pay online reward",
      amount_rupees: upiReward,
      eligible: prepaidAllowed,
      reason: prepaidAllowed
        ? "Unlocked because trust and return checks passed."
        : "Paused until trust and return checks improve.",
      payment_method: "upi"
    },
    {
      offer_id: "bank_card_value",
      label: "Bank/card extra value",
      amount_rupees: bankReward,
      eligible: bankRewardEligible,
      reason: bankRewardEligible
        ? "Cart value is eligible and Sarthi marked Pay online safe."
        : cartValue < 399
          ? "Cart value is below the offer threshold."
          : "Paused because Pay online is not the safest choice yet.",
      payment_method: "card"
    },
    {
      offer_id: "sarthi_points_next_order",
      label: "Sarthi points for next order",
      amount_rupees: rewardValue,
      eligible: prepaidAllowed,
      reason: prepaidAllowed
        ? "Points unlock after delivery feedback is completed."
        : "Points unlock only when Pay online is safe to suggest.",
      payment_method: "wallet"
    }
  ];
  const eligibleOffers = offers.filter((offer) => offer.eligible && offer.amount_rupees > 0);
  const bestOffer = eligibleOffers.sort((left, right) => right.amount_rupees - left.amount_rupees)[0] ?? null;
  const totalBenefit = eligibleOffers.reduce((sum, offer) => sum + offer.amount_rupees, 0);
  const paymentEconomics = {
    online_savings_rupees: totalBenefit,
    instant_discount_rupees: upiReward + bankReward,
    reward_points: rewardPoints,
    reward_value_rupees: rewardValue,
    cod_extra_charge_rupees: codExtraCharge,
    cod_available: codAvailable,
    buyer_benefit_copy: prepaidAllowed
      ? `Pay online can unlock Rs ${totalBenefit} verified value on this order.`
      : "Pay online value stays paused until trust, offer, and return checks pass.",
    company_benefit_copy: prepaidAllowed
      ? "Pay online can reduce failed delivery attempts and RTO cost because buyer trust checks passed first."
      : "Sarthi does not push Pay online when it may create refund anxiety or avoidable support tickets.",
    cod_caution_copy: codAvailable
      ? codExtraCharge > 0
        ? `COD is available, but Rs ${codExtraCharge} COD charge is shown before dispatch.`
        : "COD remains available without hidden payment pressure."
      : "COD is unavailable for this listing, so Sarthi avoids calling Pay online a free choice."
  };
  const checks: PaymentAssistCheck[] = [
    {
      key: "product_trust",
      label: "Product trust",
      status: productTrustPassed ? "passed" : "watch",
      detail: productTrustPassed
        ? "Product confidence is strong enough for a Pay online nudge."
        : "Product confidence needs one more check before Pay online."
    },
    {
      key: "return_risk",
      label: "Return risk",
      status: returnRiskPassed ? "passed" : "watch",
      detail: returnRiskPassed
        ? "No size bracketing or high return-risk pattern found."
        : "Remove duplicate sizes or resolve return-risk warnings first."
    },
    {
      key: "offer_truth",
      label: "Offer truth",
      status: offerTruthPassed ? "passed" : "watch",
      detail: offerTruthPassed
        ? "Offer was checked against saved price, timer, and campaign records."
        : "Offer pressure is not clean enough for a Pay online nudge."
    },
    {
      key: "checkout_shield",
      label: "Checkout shield",
      status: darkPatternPassed ? "passed" : darkPatternShield.status === "blocked" ? "blocked" : "watch",
      detail: darkPatternPassed
        ? "No timer, scarcity, price, fee, payment, or return-condition pressure blocked checkout."
        : darkPatternShield.plain_copy
    },
    {
      key: "payment_choice",
      label: "No forced payment mode",
      status: noForcedPayment ? "passed" : "blocked",
      detail: noForcedPayment
        ? "Buyer can still choose COD or Pay online based on trust."
        : "COD is unavailable, so Sarthi will not call Pay online a free choice."
    }
  ];
  const checkoutConfidence = checkoutConfidenceDecision({
    recommendedMode,
    prepaidAllowed,
    productTrustPassed,
    offerTruthPassed,
    returnRiskPassed,
    darkPatternShield,
    noForcedPayment,
    paymentMode,
    score
  });
  const paymentChoices = buildPaymentChoices({
    prepaidAllowed,
    recommendedMode,
    score,
    totalBenefit,
    rewardPoints,
    codExtraCharge,
    codAvailable,
    productTrustPassed,
    offerTruthPassed,
    returnRiskPassed,
    darkPatternPassed,
    noForcedPayment,
    checkoutConfidence
  });

  return {
    recommended_mode: recommendedMode,
    confidence_label: prepaidAllowed ? "Pay online safe to suggest" : "COD safer for now",
    title: prepaidAllowed ? "Sarthi recommends Pay online" : "Sarthi recommends COD for now",
    summary: prepaidAllowed
      ? "Pay online is suggested because trust, return risk, and offer checks passed."
      : "Sarthi keeps COD as the safer choice until missing checks improve.",
    cart_value_rupees: Math.round(cartValue),
    total_prepaid_benefit_rupees: totalBenefit,
    reward_points: rewardPoints,
    reward_value_rupees: rewardValue,
    payment_economics: paymentEconomics,
    payment_choices: paymentChoices,
    best_offer: bestOffer,
    offers,
    safety_checks: checks,
    dark_pattern_shield: darkPatternShield,
    checkout_confidence: checkoutConfidence,
    buyer_next_step: prepaidAllowed
      ? "Use Pay online to claim rewards, or keep COD if you prefer cash."
      : checkoutConfidence.buyer_next_step,
    agent_actions: [
      {
        label: "Checked payment safety",
        detail: `${Math.round(score * 100)}/100 cart confidence`,
        done: true
      },
      {
        label: prepaidAllowed ? "Unlocked Pay online value" : "Paused Pay online push",
        detail: prepaidAllowed ? `Rs ${totalBenefit} estimated Pay online value` : "Buyer trust kept higher than payment conversion",
        done: true
      },
      {
        label: "Kept fallback open",
        detail: noForcedPayment
          ? prepaidAllowed
            ? "COD stays available if buyer prefers cash"
            : paymentMode === "prepaid"
              ? "COD stays available if buyer changes mind"
              : "COD remains selected"
          : "Payment choice is restricted by fulfillment data",
        done: noForcedPayment
      }
    ]
  };
}

function buildPaymentChoices(input: {
  prepaidAllowed: boolean;
  recommendedMode: "prepaid" | "cod";
  score: number;
  totalBenefit: number;
  rewardPoints: number;
  codExtraCharge: number;
  codAvailable: boolean;
  productTrustPassed: boolean;
  offerTruthPassed: boolean;
  returnRiskPassed: boolean;
  darkPatternPassed: boolean;
  noForcedPayment: boolean;
  checkoutConfidence: any;
}) {
  const payOnlineScore = Math.round(clamp(
    input.score
      + (input.prepaidAllowed ? 0.1 : -0.12)
      + (input.offerTruthPassed ? 0.03 : -0.08)
      + (input.darkPatternPassed ? 0.02 : -0.08)
  ) * 100);
  const codScore = Math.round(clamp(
    input.score
      + (input.prepaidAllowed ? -0.03 : 0.08)
      + (input.codAvailable ? 0.03 : -0.25)
      - (input.codExtraCharge > 0 ? 0.03 : 0)
  ) * 100);
  const payOnlineChecks = [
    choiceCheck("product_trust", "Product", input.productTrustPassed ? "passed" : "watch", input.productTrustPassed ? "Trust score is strong enough." : "Trust score needs proof or stronger outcomes."),
    choiceCheck("offer_truth", "Offer", input.offerTruthPassed ? "passed" : "watch", input.offerTruthPassed ? "Offer was verified against price and campaign history." : "Offer pressure is not clean enough yet."),
    choiceCheck("return_risk", "Returns", input.returnRiskPassed ? "passed" : "watch", input.returnRiskPassed ? "Return risk is controlled." : "Size or return signal needs caution."),
    choiceCheck("dark_pattern", "Pressure", input.darkPatternPassed ? "passed" : "watch", input.darkPatternPassed ? "No checkout pressure found." : "One checkout pressure signal needs attention.")
  ];
  const codChecks = [
    choiceCheck("cod_available", "COD", input.codAvailable ? "passed" : "blocked", input.codAvailable ? "COD remains available." : "COD is not available for this listing."),
    choiceCheck("address", "Address", input.recommendedMode === "cod" ? "watch" : "passed", input.recommendedMode === "cod" ? "Confirm address before dispatch." : "Address can still be edited before dispatch."),
    choiceCheck("refund_lock", "Protection", "passed", "Refund expectation is locked before payment."),
    choiceCheck("no_force", "Choice", input.noForcedPayment ? "passed" : "blocked", input.noForcedPayment ? "No forced payment mode." : "Payment choice is restricted.")
  ];
  const refundLocked = input.checkoutConfidence?.refund_expectation?.locked_before_payment !== false;
  const payOnlineFacts = [
    choiceFact(
      "saving",
      "Save",
      input.prepaidAllowed && input.totalBenefit > 0 ? `Rs ${input.totalBenefit}` : "Locked",
      input.prepaidAllowed ? "positive" : "warning",
      input.prepaidAllowed
        ? "The saving is shown only after offer and price-history checks pass."
        : "Sarthi will not push online payment until trust checks improve."
    ),
    choiceFact(
      "reward",
      "Reward",
      input.prepaidAllowed && input.rewardPoints > 0 ? `${input.rewardPoints} pts` : "Pending",
      input.prepaidAllowed ? "positive" : "neutral",
      input.prepaidAllowed
        ? "Reward points are estimated from the selected offer and order value."
        : "Rewards stay secondary until product proof is stronger."
    ),
    choiceFact(
      "refund",
      "Refund",
      refundLocked ? "Locked" : "Pending",
      refundLocked ? "positive" : "warning",
      refundLocked
        ? "Return and refund expectations are fixed before payment."
        : "Payment advice stays cautious until refund expectations are locked."
    ),
    choiceFact(
      "delivery",
      "Delivery",
      input.returnRiskPassed ? "Low risk" : "Check fit",
      input.returnRiskPassed ? "positive" : "warning",
      input.returnRiskPassed
        ? "Return and size signals are low enough to reduce failed-delivery risk."
        : "Size or return signals need one more check before nudging prepaid."
    )
  ];
  const codFacts = [
    choiceFact(
      "pay_later",
      "Pay",
      input.codAvailable ? "On delivery" : "Unavailable",
      input.codAvailable ? "neutral" : "blocked",
      input.codAvailable ? "Cash payment remains open for buyer comfort." : "COD is disabled by fulfillment data for this listing."
    ),
    choiceFact(
      "charge",
      "Charge",
      input.codExtraCharge > 0 ? `Rs ${input.codExtraCharge}` : "Rs 0",
      input.codExtraCharge > 0 ? "warning" : "positive",
      input.codExtraCharge > 0 ? "The COD charge is disclosed before placing the order." : "No COD charge is added for this order."
    ),
    choiceFact(
      "address",
      "Address",
      input.recommendedMode === "cod" ? "Confirm" : "Editable",
      input.recommendedMode === "cod" ? "warning" : "neutral",
      input.recommendedMode === "cod"
        ? "Sarthi asks for address confirmation to avoid failed delivery."
        : "Address can still be corrected before dispatch."
    ),
    choiceFact(
      "choice",
      "Choice",
      input.noForcedPayment ? "Not forced" : "Restricted",
      input.noForcedPayment ? "positive" : "blocked",
      input.noForcedPayment ? "Payment mode is a buyer choice, not a forced conversion." : "Payment options are restricted, so confidence stays lower."
    )
  ];

  return [
    {
      mode: "prepaid",
      label: "Pay online",
      recommended: input.recommendedMode === "prepaid",
      enabled: true,
      confidence_score: payOnlineScore,
      headline: input.prepaidAllowed ? "Best value unlocked" : "Keep as backup",
      one_line: input.prepaidAllowed
        ? `Save Rs ${input.totalBenefit} and earn ${input.rewardPoints} points.`
        : "Benefits stay locked until trust checks pass.",
      primary_benefit: input.prepaidAllowed ? `Rs ${input.totalBenefit} + ${input.rewardPoints} points` : "Locked",
      buyer_outcome: input.prepaidAllowed
        ? "Pay now with verified offer and locked return expectation."
        : "Use only after proof, offer, and return checks improve.",
      marketplace_outcome: input.prepaidAllowed
        ? "Lower failed delivery and RTO risk because trust checks passed first."
        : "Sarthi avoids pushing online payment when refund anxiety may rise.",
      risk_label: input.prepaidAllowed ? "Low payment risk" : "Proof risk",
      cta: input.prepaidAllowed ? "Choose Pay online" : "Keep as backup",
      quick_facts: payOnlineFacts,
      checks: payOnlineChecks,
      next_step: input.prepaidAllowed ? "Use Pay online for verified benefits." : input.checkoutConfidence.buyer_next_step
    },
    {
      mode: "cod",
      label: "Cash on delivery",
      recommended: input.recommendedMode === "cod",
      enabled: input.codAvailable,
      confidence_score: codScore,
      headline: input.recommendedMode === "cod" ? "Safer for now" : "Still available",
      one_line: input.codExtraCharge > 0
        ? `COD is open with Rs ${input.codExtraCharge} charge shown upfront.`
        : "COD stays open without hidden payment pressure.",
      primary_benefit: input.codExtraCharge > 0 ? `Rs ${input.codExtraCharge} charge shown` : "No hidden pressure",
      buyer_outcome: "Pay at delivery, but confirm address before dispatch.",
      marketplace_outcome: input.recommendedMode === "cod"
        ? "Cautious checkout protects buyers when proof is weak."
        : "Can raise delivery effort if buyers reject after dispatch.",
      risk_label: input.codAvailable ? "Address check needed" : "Not available",
      cta: input.codAvailable ? "Choose COD" : "COD unavailable",
      quick_facts: codFacts,
      checks: codChecks,
      next_step: input.recommendedMode === "cod" ? "Confirm address and place COD order." : "Choose COD only if you prefer cash."
    }
  ];
}

function choiceCheck(key: string, label: string, status: "passed" | "watch" | "blocked", detail: string) {
  return { key, label, status, detail };
}

function choiceFact(key: string, label: string, value: string, status: "positive" | "neutral" | "warning" | "blocked", detail: string) {
  return { key, label, value, status, detail };
}

function darkPatternPenalty(shield: any) {
  if (!shield) return 0;
  if (shield.status === "blocked") return 0.12;
  if (shield.status === "watch") return 0.05;
  return 0;
}

function cartDarkPatternShield(lineItems: any[]) {
  const checks = lineItems.flatMap((line: any) =>
    (line.offer?.dark_pattern_shield?.checks ?? []).map((check: any) => ({
      ...check,
      product_id: line.product?.product_id,
      variant_id: line.variant?.variant_id,
      product_title: line.product?.title
    }))
  );
  const factIds = [...new Set(lineItems.flatMap((line: any) => line.offer?.dark_pattern_shield?.fact_ids ?? []))];
  const blocked = checks.filter((check: any) => check.status === "blocked");
  const watch = checks.filter((check: any) => check.status === "watch");
  const status = blocked.length ? "blocked" : watch.length ? "watch" : "clear";
  const primary = blocked[0] ?? watch[0] ?? null;
  return {
    shield_version: "dark_pattern_disruptor_v2",
    status,
    headline: status === "clear" ? "Checkout pressure is clear" : status === "blocked" ? "Checkout pressure blocked" : "Do not rush checkout",
    plain_copy: primary?.buyer_copy ?? "No timer, fake scarcity, price hike, hidden fee, forced payment, or hidden return condition found.",
    risk_count: blocked.length + watch.length,
    blocked_count: blocked.length,
    watch_count: watch.length,
    checks,
    fact_ids: factIds
  };
}

function checkoutConfidenceDecision(input: {
  recommendedMode: "prepaid" | "cod";
  prepaidAllowed: boolean;
  productTrustPassed: boolean;
  offerTruthPassed: boolean;
  returnRiskPassed: boolean;
  darkPatternShield: any;
  noForcedPayment: boolean;
  paymentMode: "cod" | "prepaid";
  score: number;
}) {
  const factors = [
    {
      key: "product_trust",
      label: "Product trust",
      status: input.productTrustPassed ? "passed" : "watch",
      detail: input.productTrustPassed ? "Product trust is high enough for payment confidence." : "Product proof or fit confidence still needs one check."
    },
    {
      key: "seller_verified",
      label: "Seller verified",
      status: input.productTrustPassed ? "passed" : "watch",
      detail: input.productTrustPassed ? "Seller and SKU evidence are strong enough for checkout." : "Seller/SKU evidence is not strong enough for a payment push."
    },
    {
      key: "return_risk",
      label: "Return risk",
      status: input.returnRiskPassed ? "passed" : "watch",
      detail: input.returnRiskPassed ? "No bracketing or high-risk size pattern is present." : "Size or return-risk signal exists."
    },
    {
      key: "offer_verified",
      label: "Offer verified",
      status: input.offerTruthPassed ? "passed" : "watch",
      detail: input.offerTruthPassed ? "Offer passed price and dark-pattern checks." : "Offer pressure is not verified enough for Pay online nudging."
    },
    {
      key: "checkout_pressure",
      label: "Checkout pressure",
      status: input.darkPatternShield.status === "clear" ? "passed" : input.darkPatternShield.status,
      detail: input.darkPatternShield.plain_copy
    }
  ];

  const paymentReason = input.prepaidAllowed
    ? "Pay online is safe to consider here because product trust is high, seller evidence is verified, return risk is low, and the offer is verified."
    : !input.returnRiskPassed
      ? "COD is safer here because size or return risk exists. Confirm address before COD dispatch."
      : !input.offerTruthPassed || input.darkPatternShield.status !== "clear"
        ? "COD is safer here because offer pressure or checkout proof is not fully clean yet."
        : !input.noForcedPayment
          ? "No forced payment mode can be claimed here because COD is unavailable."
          : "COD is safer here because product confidence is not strong enough yet.";

  return {
    mode: input.recommendedMode === "prepaid" ? "prepaid_confident" : "cod_cautious",
    recommended_mode: input.recommendedMode,
    confidence: input.prepaidAllowed ? "high" : input.score >= 0.58 ? "medium" : "low",
    headline: input.prepaidAllowed ? "Pay online is safe to consider" : "COD is safer for now",
    payment_reason: paymentReason,
    prepaid_reason: "Pay online is shown only when product trust is high, seller evidence is verified, return risk is low, and offer pressure is clean.",
    cod_reason: "COD remains safer when proof is missing, size risk exists, offer pressure appears, or payment choice is restricted.",
    buyer_next_step: input.recommendedMode === "prepaid"
      ? "Use Pay online for verified benefits, or choose COD if you prefer cash."
      : "Use COD now, confirm address before dispatch, and resolve highlighted checks before Pay online.",
    address_prompt: input.recommendedMode === "cod" ? "Confirm address before COD dispatch." : "Address check stays available before dispatch.",
    refund_expectation: {
      locked_before_payment: true,
      message: "Refund expectation is locked before payment through the checkout contract."
    },
    payment_choice: {
      forced: !input.noForcedPayment,
      message: input.noForcedPayment ? "No forced payment mode." : "Payment choice is restricted for this listing."
    },
    safeguards: [
      {
        key: "address_before_cod",
        label: "Confirm address before COD dispatch",
        status: input.recommendedMode === "cod" ? "watch" : "passed",
        detail: input.recommendedMode === "cod" ? "COD orders can waste delivery attempts if address is not confirmed." : "Address remains editable before dispatch."
      },
      {
        key: "refund_lock",
        label: "Refund expectation locked",
        status: "passed",
        detail: "Return, refund, and proof expectations are captured before the order is placed."
      },
      {
        key: "no_forced_payment",
        label: "No forced payment mode",
        status: input.noForcedPayment ? "passed" : "blocked",
        detail: input.noForcedPayment ? "Both payment options stay buyer-controlled." : "COD unavailable; Sarthi avoids Pay online pressure copy."
      }
    ],
    factors
  };
}

function suggestedSize(profile: any, product: any) {
  if (!product) return null;
  const sizeMap = profile?.size_map ?? {};
  return normalizeSize(sizeMap[product.category] ?? sizeMap[product.garment_type] ?? "");
}

function medianSize(sizes: string[]) {
  const sorted = [...sizes].sort((left, right) => SIZE_ORDER.indexOf(left) - SIZE_ORDER.indexOf(right));
  return sorted[Math.floor(sorted.length / 2)] ?? sorted[0] ?? null;
}

function defaultSizeMap(preferredFit: string) {
  const base = normalizePreferredFit(preferredFit) === "regular" ? "M" : "XL";
  return {
    women_kurtis: base,
    women_kurta_sets: base,
    women_tops: base === "M" ? "M" : "L",
    women_bottomwear: base
  };
}

function sanitizeSizeMap(input?: Record<string, unknown>) {
  const fallback = defaultSizeMap("comfort");
  const out: Record<string, string> = {};
  const source = input && typeof input === "object" ? input : fallback;
  for (const [key, value] of Object.entries(source)) {
    const size = normalizeSize(String(value));
    if (key && size) out[key.slice(0, 48)] = size;
  }
  return Object.keys(out).length ? out : fallback;
}

function normalizeSize(value: unknown) {
  const size = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (!size) return "";
  if (size === "FREE") return "ONE_SIZE";
  return SIZE_ORDER.includes(size) ? size : size.slice(0, 12);
}

function normalizePreferredFit(value: unknown) {
  return String(value ?? "comfort").toLowerCase() === "regular" ? "regular" : "comfort";
}

function cleanText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 80) : fallback;
}

function band(score: number) {
  if (score >= 0.75) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

function clamp(score: number) {
  return Math.max(0.05, Math.min(0.98, score));
}
