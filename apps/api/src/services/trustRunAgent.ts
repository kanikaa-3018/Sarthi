import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { computeCartConfidence, createWishlistIntent } from "./decisionEngine.js";
import {
  createOrIncrementProofRequest,
  createTrace,
  fitPrediction,
  graphPath,
  productForVariant,
  productWithSeller,
  rankCluster,
  skuPassport,
  variantsForProduct
} from "./domain.js";
import { id } from "./crypto.js";
import { inferAttribute } from "./format.js";
import { resolveSimilarListingSet } from "./similarListings.js";
import { nowIso } from "./time.js";

type TrustRunInput = {
  product_id?: string;
  cluster_id?: string;
  selected_variant_id?: string;
  profile_id?: string;
  query?: string;
  preferred_fit?: "comfort" | "regular";
  create_wishlist_intent?: boolean;
  create_seller_signal?: boolean;
  intent?: string;
};

export async function runTrustRun(db: Db, buyerId: string, input: TrustRunInput) {
  const c = collections(db);
  const clusterProduct = input.product_id
    ? null
    : await c.products.findOne({ cluster_id: input.cluster_id, is_sarthi_eligible: 1 });
  const baseProduct = input.product_id
    ? await productWithSeller(db, input.product_id)
    : clusterProduct
      ? await productWithSeller(db, clusterProduct.product_id)
      : null;
  if (!baseProduct) throw new Error("Product context not found");

  const preferredFit = input.preferred_fit ?? "comfort";
  const similarity = await resolveSimilarListingSet(db, baseProduct.product_id);
  const ranking = await rankCluster(db, buyerId, baseProduct.cluster_id, preferredFit, {
    recordSnapshot: true,
    intent: input.intent ?? "trust_run",
    productIds: similarity.comparable_product_ids,
    selectedVariantId: input.selected_variant_id
  });
  const recommendedProduct = await productForVariant(db, ranking.winner);
  if (!recommendedProduct) throw new Error("Trust run could not resolve the recommended product");
  const recommendedVariants = await variantsForProduct(db, recommendedProduct.product_id);
  const recommendedVariant = recommendedVariants.find((variant: any) => variant.variant_id === ranking.winner) ?? recommendedVariants[0];
  if (!recommendedVariant) throw new Error("Trust run could not resolve the recommended SKU");

  const passport = await skuPassport(db, buyerId, recommendedProduct.product_id, recommendedVariant.variant_id);
  const attribute = inferAttribute(input.query ?? "");
  const missingProof = passport.evidence_gaps.find((gap: any) => gap.attribute === attribute)
    ?? passport.evidence_gaps[0]
    ?? null;
  const proofRequest = missingProof && input.create_seller_signal !== false
    ? await createOrIncrementProofRequest(
      db,
      buyerId,
      recommendedProduct,
      recommendedVariant.variant_id,
      missingProof.attribute,
      input.query ?? `Trust run needs ${missingProof.attribute} proof before confidence can improve.`
    )
    : null;

  const wishlist = input.create_wishlist_intent === false
    ? null
    : await createWishlistIntent(db, buyerId, {
      product_id: baseProduct.product_id,
      selected_variant_id: input.selected_variant_id,
      profile_id: input.profile_id,
      create_seller_signal: false
    });
  const fit = await fitPrediction(db, buyerId, recommendedVariant.variant_id, preferredFit);
  const cartConfidence = await computeCartConfidence(db, buyerId, {
    profile_id: input.profile_id,
    payment_mode: "cod",
    items: [{ variant_id: recommendedVariant.variant_id, quantity: 1 }]
  });

  const graph = graphPath(recommendedVariant.variant_id, ranking.fact_ids);
  const winner = ranking.candidates.find((candidate: any) => candidate.variant_id === recommendedVariant.variant_id) ?? ranking.candidates[0] ?? null;
  const factIds = [...new Set([
    ...ranking.fact_ids,
    ...passport.fact_ids,
    ...cartConfidence.fact_ids,
    ...(proofRequest?.fact_id ? [proofRequest.fact_id] : [])
  ])].slice(0, 32);
  const steps = trustRunSteps({
    similarity,
    ranking,
    winner,
    passport,
    missingProof,
    cartConfidence,
    proofRequest
  });
  const decision = trustRunDecision(winner, passport, missingProof, cartConfidence, proofRequest);
  const trace = await createTrace(db, {
    buyer_id: buyerId,
    product_id: recommendedProduct.product_id,
    variant_id: recommendedVariant.variant_id,
    intent: [input.intent ?? "trust_run", "similar_listing_resolution", "sku_passport", "checkout_confidence"],
    tools_used: [
      "resolveSimilarListings",
      "rankCluster",
      "skuPassport",
      "reviewCredibilitySummary",
      "proofCoverage",
      "computeCartConfidence",
      proofRequest ? "createProofRequest" : "proofRequestSkipped"
    ],
    fact_ids: factIds,
    graph_paths: [graph]
  });

  const comparison = {
    trace_id: trace.trace_id,
    selected_product_id: recommendedProduct.product_id,
    ranking,
    similarity: {
      method: similarity.method,
      summary: similarity.summary,
      distinct_seller_count: similarity.distinct_seller_count,
      comparable_product_ids: similarity.comparable_product_ids,
      candidates: similarity.candidates.slice(0, 4),
      agent: similarity.agent
    },
    fit,
    graph_path: graph
  };

  return {
    run_id: id("trust_run"),
    trace_id: trace.trace_id,
    workflow_version: "trust_run_v1",
    buyer_id: buyerId,
    created_at: nowIso(),
    input_product: baseProduct,
    recommended_product: recommendedProduct,
    recommended_variant: recommendedVariant,
    summary: {
      headline: decision.label,
      body: decision.summary,
      confidence: decision.confidence,
      score_percent: winner?.score_percent ?? Math.floor((winner?.score ?? 0) * 100),
      fact_count: factIds.length,
      seller_count: similarity.distinct_seller_count,
      next_step: decision.primary_action
    },
    steps,
    comparison,
    decision: {
      trace_id: trace.trace_id,
      buyer_id: buyerId,
      context: {
        product_id: baseProduct.product_id,
        cluster_id: baseProduct.cluster_id,
        category: baseProduct.category,
        garment_type: baseProduct.garment_type,
        similarity: comparison.similarity
      },
      decision,
      selected: {
        product: recommendedProduct,
        variant: recommendedVariant,
        recommended_size: passport.fit.recommended_size
      },
      ranking,
      sku_truth_passport: passport,
      missing_proof: missingProof,
      proof_request: proofRequest,
      graph_paths: [graph],
      fact_ids: factIds
    },
    sku_truth_passport: passport,
    checkout_confidence: cartConfidence,
    wishlist,
    seller_signal: proofRequest,
    agent: {
      mode: similarity.agent?.used
        ? "ai_visual_match_plus_deterministic_policy"
        : similarity.agent?.status === "cache_hit"
          ? "cached_ai_visual_match_plus_deterministic_policy"
          : "deterministic_evidence_policy",
      tools_used: [
        "resolveSimilarListings",
        "rankCluster",
        "skuPassport",
        "reviewCredibilitySummary",
        "proofCoverage",
        "computeCartConfidence"
      ],
      deterministic_fallback: true
    },
    privacy: {
      buyer_profile_shared_with_seller: false,
      seller_receives: proofRequest ? "aggregate proof demand only" : "no buyer identity shared",
      private_fit_scope: "buyer_only"
    },
    graph_path: graph,
    fact_ids: factIds
  };
}

function trustRunDecision(winner: any, passport: any, missingProof: any, cartConfidence: any, proofRequest: any) {
  const score = winner?.score ?? 0;
  if (missingProof) {
    return {
      code: "ask_seller_proof",
      label: proofRequest ? "Seller proof requested" : "Ask seller proof",
      summary: missingProof.summary,
      primary_action: missingProof.title,
      confidence: "medium" as const
    };
  }
  if (score >= 0.75 && cartConfidence.confidence_band === "high") {
    return {
      code: "buy_without_rush",
      label: "Safe to consider",
      summary: "Seller, SKU outcomes, reviews, proof, offer, and checkout checks are aligned enough to proceed.",
      primary_action: "Continue to product detail",
      confidence: "high" as const
    };
  }
  if (score >= 0.58) {
    return {
      code: "buy_with_one_check",
      label: "One check before buying",
      summary: passport.truth_summary.buyer_guidance,
      primary_action: "Review proof before checkout",
      confidence: "medium" as const
    };
  }
  return {
    code: "low_evidence",
    label: "Confidence is low",
    summary: "Sarthi found limited or conflicting evidence, so this item should not be treated as a strong recommendation yet.",
    primary_action: "Check another seller",
    confidence: "low" as const
  };
}

function trustRunSteps({
  similarity,
  ranking,
  winner,
  passport,
  missingProof,
  cartConfidence,
  proofRequest
}: {
  similarity: any;
  ranking: any;
  winner: any;
  passport: any;
  missingProof: any;
  cartConfidence: any;
  proofRequest: any;
}) {
  const coverageItems = Object.values(passport.proof_coverage ?? {}) as any[];
  const sufficientProofs = coverageItems.filter((item) => item.sufficient).length;
  const reviewSummary = passport.review_evidence?.credibility_summary;
  return [
    {
      key: "similar_listings",
      label: "Similar sellers",
      status: similarity.distinct_seller_count > 1 ? "done" : "watch",
      value: `${similarity.distinct_seller_count} sellers`,
      summary: similarity.summary,
      tools: ["resolveSimilarListings"],
      fact_ids: ranking.fact_ids.slice(0, 4)
    },
    {
      key: "seller_gate",
      label: "Seller gate",
      status: factorStatus(winner, "seller_trust", 0.62),
      value: factorValue(winner, "seller_trust"),
      summary: "Seller verification, dispatch reliability, and marketplace reliability were checked before recommending.",
      tools: ["sellerVerification", "rankCluster"],
      fact_ids: winner?.fact_ids ?? []
    },
    {
      key: "sku_outcomes",
      label: "SKU outcomes",
      status: passport.outcome_evidence.evidence_strength === "strong" ? "done" : "watch",
      value: `${passport.outcome_evidence.delivered_orders_90d} orders`,
      summary: `${Math.round(passport.outcome_evidence.return_rate * 100)}% recent return risk for this SKU was used in the score.`,
      tools: ["variantEvidence"],
      fact_ids: passport.outcome_evidence.fact_ids
    },
    {
      key: "review_credibility",
      label: "Review credibility",
      status: reviewSummary?.reliability === "weak" ? "watch" : "done",
      value: reviewSummary ? `${reviewSummary.credible_review_count}/${reviewSummary.review_count}` : factorValue(winner, "review_signal"),
      summary: reviewSummary
        ? `Raw reviews were weighted by buyer credibility; reliability is ${reviewSummary.reliability}.`
        : "Reviews were weighted instead of trusting every rating equally.",
      tools: ["reviewCredibilitySummary"],
      fact_ids: reviewSummary?.fact_ids ?? []
    },
    {
      key: "proof_gap",
      label: "Proof check",
      status: missingProof ? "watch" : "done",
      value: `${sufficientProofs}/${Math.max(coverageItems.length, 1)}`,
      summary: missingProof
        ? `${missingProof.title}${proofRequest ? " and a seller task was created." : "."}`
        : "Proof coverage is usable for the current recommendation.",
      tools: ["proofCoverage", proofRequest ? "createProofRequest" : "proofRequestSkipped"],
      fact_ids: missingProof?.fact_ids ?? []
    },
    {
      key: "checkout_readiness",
      label: "Checkout readiness",
      status: cartConfidence.confidence_band === "high" ? "done" : "watch",
      value: `${Math.floor(cartConfidence.overall_score * 100)}/100`,
      summary: cartConfidence.checkout_nudge.message,
      tools: ["computeCartConfidence"],
      fact_ids: cartConfidence.fact_ids.slice(0, 6)
    }
  ];
}

function factorValue(candidate: any, key: string) {
  if (!candidate) return "--";
  return `${Math.round((candidate.factors?.[key] ?? 0) * 100)}%`;
}

function factorStatus(candidate: any, key: string, threshold: number) {
  if (!candidate) return "watch";
  return (candidate.factors?.[key] ?? 0) >= threshold ? "done" : "watch";
}
