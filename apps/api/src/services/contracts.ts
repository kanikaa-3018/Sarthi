import { id } from "./crypto.js";
import { nowIso } from "./time.js";

export function expectationContract(buyerId: string, productId: string, variantId: string, passport: any) {
  const contract_id = id("contract");
  const fact_id = id("fact_contract");
  const product = passport.product ?? {};
  const variant = passport.variant ?? {};
  const evidence = passport.outcome_evidence ?? {};
  const fit = passport.fit ?? {};
  const offer = passport.offer_truth ?? {};
  const fulfillment = product.fulfillment ?? {};
  const quality = product.quality_signals ?? {};
  const priceEvidence = offer.price_evidence ?? {};
  const returnDays = Number(quality.return_window_days ?? 7);
  const returnsEnabled = fulfillment.returns_enabled !== false;
  const proofCoverage = passport.proof_coverage ?? {};
  const lockedScorePercent = lockedContractScore(evidence, passport.trust_state);
  const createdAt = nowIso();
  const items = [
    contractItem({
      dimension: "fit",
      claim: `Expected size ${variant.size ?? fit.recommended_size ?? "selected"}; Sarthi recommended ${fit.recommended_size ?? "selected size"}.`,
      confidence: fit.confidence ?? "low",
      buyer_action: "Use this size expectation while checking delivery outcome.",
      fact_ids: fit.fact_ids ?? [],
      source: "fit prediction + SKU outcomes",
      status: "locked"
    }),
    contractItem({
      dimension: "fabric",
      claim: `Expected fabric: ${product.fabric ?? "catalog fabric not available"}.`,
      confidence: proofCoverage.fabric?.sufficient ? "medium" : "weak",
      buyer_action: proofCoverage.fabric?.sufficient ? "Compare received fabric with approved proof." : "Treat fabric as pending proof if it matters.",
      fact_ids: proofCoverage.fabric?.fact_ids ?? [],
      source: "catalog fabric + seller proof",
      status: proofCoverage.fabric?.sufficient ? "locked" : "proof_pending"
    }),
    contractItem({
      dimension: "color",
      claim: `Expected color family: ${product.color_family ?? "catalog color not available"}.`,
      confidence: proofCoverage.color?.sufficient ? "medium" : "weak",
      buyer_action: proofCoverage.color?.sufficient ? "Use daylight proof while checking color." : "Check received color before removing tags.",
      fact_ids: proofCoverage.color?.fact_ids ?? passport.review_evidence?.color?.fact_ids ?? [],
      source: "catalog color + review/proof signals",
      status: proofCoverage.color?.sufficient ? "locked" : "watch"
    }),
    contractItem({
      dimension: "delivery",
      claim: `Delivery promise: ${product.delivery_text ?? "standard delivery"}; COD ${fulfillment.cod_available === false ? "not available" : "available"}.`,
      confidence: "medium",
      buyer_action: "Confirm address and dispatch status before COD handoff.",
      fact_ids: evidence.fact_ids ?? [],
      source: "fulfilment policy + SKU dispatch history",
      status: "locked"
    }),
    contractItem({
      dimension: "return",
      claim: returnsEnabled ? `Return eligible for ${returnDays} days if product promise is not met.` : "Return eligibility is not available for this listing.",
      confidence: returnsEnabled ? "medium" : "weak",
      buyer_action: returnsEnabled ? "Return reason will be linked to the promise that failed." : "Prefer COD or review policy before payment.",
      fact_ids: [],
      source: "return policy",
      status: returnsEnabled ? "locked" : "watch"
    }),
    contractItem({
      dimension: "offer",
      claim: offer.status === "verified_price_drop"
        ? `Offer price proof: Rs ${priceEvidence.latest_price ?? "current"} is lower than reference Rs ${priceEvidence.reference_price ?? "unknown"}.`
        : `Offer proof: ${offer.message ?? "price history is not strong enough yet"}.`,
      confidence: offer.status === "verified_price_drop" ? "high" : "medium",
      buyer_action: offer.buyer_guidance ?? "Do not rush; decide using product proof.",
      fact_ids: offer.fact_ids ?? [],
      source: "price ledger + campaign behavior",
      status: offer.status === "verified_price_drop" ? "locked" : "watch"
    })
  ];
  return {
    contract_id,
    buyer_id: buyerId,
    product_id: productId,
    variant_id: variantId,
    status: "active",
    contract: {
      title: "Sarthi expectation contract",
      summary: "Size, fabric, color, delivery, return, and price expectations locked before checkout.",
      items,
      fact_ids: passport.fact_ids,
      privacy: { buyer_visible: true, seller_visible_as_aggregate_only: true, raw_private_memory_exposed: false }
    },
    locked_expectations: {
      expected_size: variant.size ?? fit.recommended_size ?? null,
      recommended_size: fit.recommended_size ?? null,
      expected_fabric: product.fabric ?? null,
      expected_color: product.color_family ?? null,
      delivery_promise: product.delivery_text ?? null,
      return_eligibility: {
        enabled: returnsEnabled,
        window_days: returnsEnabled ? returnDays : 0,
        buyer_copy: returnsEnabled ? `${returnDays}-day return available for promise mismatch.` : "Return eligibility is not visible enough."
      },
      offer_price_proof: {
        status: offer.status ?? "unknown",
        latest_price: priceEvidence.latest_price ?? null,
        reference_price: priceEvidence.reference_price ?? null,
        price_delta: priceEvidence.price_delta ?? null,
        buyer_copy: offer.message ?? "Offer history unavailable."
      }
    },
    score_state: {
      locked_score_percent: lockedScorePercent,
      evidence_strength: evidence.evidence_strength ?? "unknown",
      delivered_orders_90d: Number(evidence.delivered_orders_90d ?? 0),
      update_rule: "Kept orders strengthen SKU confidence; returns create aggregate root-cause work for sellers."
    },
    post_delivery_loop: {
      buyer_action: "Mark kept, returned, or exchanged after delivery.",
      kept_effect: "Outcome improves future SKU confidence when quality checks pass.",
      return_effect: "Reason is mapped to the failed expectation and sent to seller as aggregate action.",
      seller_visibility: "Seller sees aggregate root-cause tasks only, never buyer identity or private memory."
    },
    created_at: createdAt,
    completed_at: null,
    outcome_order_id: null,
    broken_dimension: null,
    fact_id
  };
}

function contractItem(input: {
  dimension: string;
  claim: string;
  confidence: string;
  buyer_action: string;
  fact_ids: string[];
  source: string;
  status: "locked" | "watch" | "proof_pending";
}) {
  return input;
}

function lockedContractScore(evidence: any, trustState: any) {
  const delivered = Number(evidence?.delivered_orders_90d ?? 0);
  const returnRate = Number(evidence?.return_rate ?? 0);
  const evidenceBonus = evidence?.evidence_strength === "strong" ? 10 : evidence?.evidence_strength === "medium" ? 6 : delivered >= 8 ? 3 : 0;
  const trustBonus = trustState?.can_recommend ? 5 : 0;
  const score = 55 + evidenceBonus + trustBonus - Math.round(Math.min(0.45, Math.max(0, returnRate)) * 80);
  return Math.max(35, Math.min(92, score));
}
