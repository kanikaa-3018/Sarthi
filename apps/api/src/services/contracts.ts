import { id } from "./crypto.js";
import { nowIso } from "./time.js";

export function expectationContract(buyerId: string, productId: string, variantId: string, passport: any) {
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
