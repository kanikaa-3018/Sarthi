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
  status: "passed" | "watch";
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
  const nudge = checkoutNudge(overallScore, bracketAlerts, input.payment_mode ?? "cod", paymentAssist.recommended_mode === "prepaid");
  const trace = await createTrace(db, {
    buyer_id: buyerId,
    variant_id: lineItems[0]?.variant.variant_id ?? null,
    intent: ["cart_confidence", "checkout_nudge", "bracketing_guard"],
    tools_used: ["computeKeepConfidence", "verifyOffer", "detectBracketing", "buyerFitProfile"],
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
  chips.push({ type: "offer_truth", label: offer.status === "verified_price_drop" ? "Verified offer" : "Timer not trusted", sentiment: offer.status === "verified_price_drop" ? "positive" : "neutral" });
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
  if (offer.status !== "verified_price_drop") {
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

function checkoutNudge(score: number, bracketAlerts: any[], paymentMode: string, prepaidAllowed: boolean) {
  const highBracket = bracketAlerts.some((alert) => alert.severity === "high");
  if (prepaidAllowed) {
    return {
      code: "prepaid_safe_to_nudge",
      prepaid_recommended: true,
      title: paymentMode === "prepaid" ? "Pay online choice is backed by evidence" : "Pay online is safe to consider",
      message: "Sarthi checked product trust, return risk, offer truth, and available rewards before recommending Pay online.",
      trust_condition: "Only suggest Pay online when product confidence, offer truth, and return risk are acceptable.",
      company_benefit: "Lower RTO risk, fewer failed delivery attempts, and better delivery partner utilization."
    };
  }
  if (score >= 0.58 && !highBracket) {
    return {
      code: "prepaid_after_one_check",
      prepaid_recommended: false,
      title: "Complete one check before Pay online",
      message: "Sarthi should first resolve the size/proof signal, then Pay online rewards can be shown.",
      trust_condition: "Do not trade buyer trust for payment conversion.",
      company_benefit: "Balanced conversion with lower avoidable returns."
    };
  }
  return {
    code: "cod_or_review_first",
    prepaid_recommended: false,
    title: "Keep checkout cautious",
    message: highBracket
      ? "Remove bracketed sizes before payment nudges."
      : "Confidence is low, so the buyer needs proof or size correction before Pay online rewards.",
    trust_condition: "Payment nudges pause when product confidence is not strong.",
    company_benefit: "Prevents prepaid pushback, cancellations, and support tickets."
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
  const productTrustPassed = score >= 0.66 && lineItems.every((line: any) => {
    const lineScore = Number(line.keep_confidence?.score ?? 0);
    return lineScore >= 0.64 && line.confidence_band !== "low";
  });
  const offerTruthPassed = lineItems.every((line: any) => line.offer?.status === "verified_price_drop" || line.offer?.status === "no_need_to_rush");
  const returnRiskPassed = !anyBracket && !highBracket;
  const prepaidAllowed = productTrustPassed && offerTruthPassed && returnRiskPassed;
  const recommendedMode = prepaidAllowed ? "prepaid" : "cod";
  const rewardPoints = prepaidAllowed ? Math.max(20, Math.round(cartValue * 0.06)) : 0;
  const rewardValue = prepaidAllowed ? Math.max(5, Math.round(rewardPoints * 0.25)) : 0;
  const upiReward = prepaidAllowed ? Math.min(30, Math.max(10, Math.round(cartValue * 0.03))) : 0;
  const bankRewardEligible = prepaidAllowed && cartValue >= 399;
  const bankReward = bankRewardEligible ? Math.min(45, Math.max(15, Math.round(cartValue * 0.05))) : 0;
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
        ? "Offer was checked against saved price/timer records."
        : "Offer history is thin, so Pay online reward is not pushed."
    }
  ];

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
    best_offer: bestOffer,
    offers,
    safety_checks: checks,
    buyer_next_step: prepaidAllowed
      ? "Use Pay online to claim rewards, or keep COD if you prefer cash."
      : "Use COD now, or fix the highlighted checks before Pay online.",
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
        detail: prepaidAllowed
          ? "COD stays available if buyer prefers cash"
          : paymentMode === "prepaid"
            ? "COD stays available if buyer changes mind"
            : "COD remains selected",
        done: true
      }
    ]
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
