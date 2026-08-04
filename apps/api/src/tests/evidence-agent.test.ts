import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectGroundedAnswer, validateAgentAnswer } from "../services/answerValidator.js";
import {
  buildGraphEvidenceCapsule,
  buildProductAdviceEvidenceCapsule,
  deterministicEvidenceAnswer
} from "../services/evidenceCapsule.js";
import { classifyCommerceQuestion } from "../services/questionIntent.js";

const graph = {
  selected_product_id: "product_a",
  nodes: [
    { id: "product_a_node", type: "product", label: "Blue cotton kurti" },
    { id: "seller_a_node", type: "seller", label: "NayiDisha Fashions" },
    { id: "sku_a_node", type: "sku", label: "XL SKU" },
    { id: "returns_a_node", type: "returns", label: "Return outcomes" },
    { id: "reviews_a_node", type: "reviews", label: "Trusted reviews" },
    { id: "proof_a_node", type: "proof", label: "Seller proof" },
    { id: "score_a_node", type: "score", label: "78/100 trust" },
    { id: "fit_a_node", type: "buyer_fit", label: "Private fit memory" },
    { id: "offer_a_node", type: "offer", label: "Verified offer" },
    { id: "price_a_node", type: "price", label: "Price history" }
  ],
  edges: [
    { id: "edge_sku_returns", source: "sku_a_node", target: "returns_a_node", label: "SKU returns", fact_ids: ["fact_returns"] },
    { id: "edge_returns_score", source: "returns_a_node", target: "score_a_node", label: "returns affect score", fact_ids: ["fact_returns"] },
    { id: "edge_proof_score", source: "proof_a_node", target: "score_a_node", label: "proof affects score", fact_ids: ["fact_fabric"] },
    { id: "edge_fit_sku", source: "fit_a_node", target: "sku_a_node", label: "private fit check", fact_ids: ["fact_fit"] },
    { id: "edge_seller_score", source: "seller_a_node", target: "score_a_node", label: "seller trust affects score", fact_ids: ["fact_seller"] }
  ],
  fact_ids: ["fact_returns", "fact_fit", "fact_fabric", "fact_seller"],
  seller_context: [{
    product: {
      product_id: "product_a",
      title: "Blue cotton kurti - Seller A",
      seller_name: "NayiDisha Fashions",
      base_price: 459,
      fabric: "cotton"
    },
    seller: {
      name: "NayiDisha Fashions",
      verification: { verification_status: "verified" }
    },
    variant: { variant_id: "variant_a", size: "XL" },
    evidence: {
      delivered_orders_90d: 42,
      return_rate: 0.08,
      evidence_strength: "strong",
      median_dispatch_hours: 30,
      fact_ids: ["fact_returns"]
    },
    fit: {
      recommended_size: "XL",
      confidence: "medium",
      reasons: ["XL has lower fit-return risk."],
      fact_ids: ["fact_fit"]
    },
    proof_coverage: {
      fabric: {
        attribute: "fabric",
        sufficient: false,
        source_summary: "Fabric close-up proof is missing.",
        recommended_proof_type: "fabric_closeup",
        fact_ids: ["fact_fabric"]
      },
      measurement: {
        attribute: "measurement",
        sufficient: false,
        source_summary: "Readable chest measurement chart is missing.",
        recommended_proof_type: "measurement_chart",
        fact_ids: ["fact_measurement"]
      }
    },
    candidate: {
      score: 0.78,
      score_percent: 78,
      factors: { review_signal: 0.46, price_value: 0.73 },
      fact_ids: ["fact_seller", "fact_returns"]
    },
    price_context: {
      latest_price: 459,
      offer: { status: "verified_price_drop", message: "Recent price drop is supported by price history.", fact_ids: ["fact_offer"] }
    },
    node_ids: {
      product: "product_a_node",
      seller: "seller_a_node",
      sku: "sku_a_node",
      returns: "returns_a_node",
      reviews: "reviews_a_node",
      proof: "proof_a_node",
      score: "score_a_node",
      buyer_fit: "fit_a_node",
      offer: "offer_a_node",
      price: "price_a_node"
    }
  }]
};

describe("commerce question intent", () => {
  it("classifies fit, proof, and unsupported questions", () => {
    assert.deepEqual(
      pick(classifyCommerceQuestion("Will size L fit me?"), ["intent", "requested_size", "proof_attribute"]),
      { intent: "fit_question", requested_size: "L", proof_attribute: null }
    );
    assert.deepEqual(
      pick(classifyCommerceQuestion("Is fabric thin or transparent?"), ["intent", "requested_size", "proof_attribute"]),
      { intent: "proof_missing", requested_size: null, proof_attribute: "transparency" }
    );
    assert.equal(classifyCommerceQuestion("What is the seller bank account?").intent, "unsupported");
  });
});

describe("evidence capsule grounded answers", () => {
  it("keeps a size L question on size evidence instead of proof-photo advice", () => {
    const capsule = buildGraphEvidenceCapsule(graph, "Will size L fit me?");

    assert.equal(capsule.intent, "fit_question");
    assert.equal(capsule.selected.requested_size, "L");
    assert.equal(capsule.allowed_actions[0]?.type, "switch_size");
    assert.ok(capsule.missing_facts.some((fact) => /Size L/i.test(fact)));

    const fallback = deterministicEvidenceAnswer(capsule);
    assert.match(fallback.summary, /size L|size XL/i);
    assert.doesNotMatch(fallback.summary, /daylight photo|color photo/i);
  });

  it("names the exact missing proof for fabric or transparency questions", () => {
    const capsule = buildGraphEvidenceCapsule(graph, "Is fabric thin?");
    const fallback = deterministicEvidenceAnswer(capsule);

    assert.equal(capsule.intent, "proof_missing");
    assert.equal(capsule.allowed_actions[0]?.type, "ask_proof");
    assert.ok(capsule.missing_facts.some((fact) => /fabric/i.test(fact)));
    assert.match(fallback.summary, /fabric|proof/i);
  });

  it("maps measurement questions to the SKU size proof bucket", () => {
    const graphWithSizeProof = JSON.parse(JSON.stringify(graph));
    const context = graphWithSizeProof.seller_context[0];
    context.proof_coverage = {
      size: {
        attribute: "size",
        sufficient: false,
        source_summary: "Readable chest measurement chart is missing.",
        recommended_proof_type: "measurement_chart",
        fact_ids: ["fact_size"]
      }
    };
    const capsule = buildGraphEvidenceCapsule(graphWithSizeProof, "Is the chest measurement proof available?");

    assert.equal(capsule.intent, "proof_missing");
    assert.equal(capsule.classifier.proof_attribute, "measurement");
    assert.equal(capsule.allowed_actions[0]?.type, "ask_proof");
    assert.equal(capsule.allowed_actions[0]?.attribute, "size");
    assert.ok(capsule.missing_facts.some((fact) => /measurement|size/i.test(fact)));
  });

  it("rejects generic or irrelevant model answers before returning them", () => {
    const capsule = buildGraphEvidenceCapsule(graph, "Will size L fit me?");
    const fallback = deterministicEvidenceAnswer(capsule);
    const generated = {
      title: "Check proof",
      summary: "A daylight photo can help you make an informed decision.",
      reasons: ["Some proof gaps could affect your decision."],
      caution: null
    };

    const validation = validateAgentAnswer(generated, capsule);
    const selected = selectGroundedAnswer(generated, fallback, capsule);

    assert.equal(validation.ok, false);
    assert.equal(selected.validation.used_fallback, true);
    assert.equal(selected.answer.title, fallback.title);
  });

  it("accepts a concise answer that follows the capsule", () => {
    const capsule = buildGraphEvidenceCapsule(graph, "Will size L fit me?");
    const generated = {
      title: "Size L is not verified here",
      summary: "You asked about size L, but this graph is checking size XL. Load size L outcomes before deciding fit.",
      reasons: [
        "Selected SKU evidence is for XL.",
        "Size L outcomes are not loaded here."
      ],
      caution: "Do not assume L fit from XL evidence."
    };

    assert.equal(validateAgentAnswer(generated, capsule).ok, true);
  });

  it("reads seller verification from the SKU passport trust state", () => {
    const capsule = buildProductAdviceEvidenceCapsule(
      "Can I trust this seller?",
      {
        product_id: "product_a",
        title: "Blue cotton kurti",
        seller_name: "NayiDisha Fashions",
        base_price: 459
      },
      {
        variant: { variant_id: "variant_a", size: "XL", current_price: 459 },
        truth_summary: { status: "ready" },
        trust_state: {
          seller_verification: { verification_status: "verified" }
        },
        outcome_evidence: {
          delivered_orders_90d: 42,
          return_rate: 0.08,
          evidence_strength: "strong",
          median_dispatch_hours: 30,
          fact_ids: ["fact_returns"]
        },
        fit: { recommended_size: "XL", confidence: "medium", fact_ids: ["fact_fit"] },
        proof_coverage: {},
        offer_truth: { status: "verified_price_drop", message: "Recent price drop is supported.", fact_ids: ["fact_offer"] },
        fact_ids: ["fact_returns", "fact_fit", "fact_offer"]
      }
    );

    assert.equal(capsule.intent, "seller_trust");
    assert.ok(capsule.direct_facts.some((fact) => /verification status is verified/i.test(fact)));
    assert.equal(capsule.risk_flags.some((flag) => /verification is not complete/i.test(flag)), false);
  });

  it("returns exact ask-proof actions for product-level advice", () => {
    const capsule = buildProductAdviceEvidenceCapsule(
      "Is the fabric thin?",
      {
        product_id: "product_a",
        title: "Blue cotton kurti",
        seller_name: "NayiDisha Fashions",
        base_price: 459
      },
      {
        variant: { variant_id: "variant_a", size: "XL", current_price: 459 },
        truth_summary: { status: "needs_check" },
        trust_state: {
          seller_verification: { verification_status: "verified" }
        },
        outcome_evidence: {
          delivered_orders_90d: 42,
          return_rate: 0.08,
          evidence_strength: "strong",
          median_dispatch_hours: 30,
          fact_ids: ["fact_returns"]
        },
        fit: { recommended_size: "XL", confidence: "medium", fact_ids: ["fact_fit"] },
        proof_coverage: {
          fabric: {
            attribute: "fabric",
            sufficient: false,
            source_summary: "Fabric close-up proof is missing.",
            recommended_proof_type: "fabric_closeup",
            fact_ids: ["fact_fabric"]
          }
        },
        offer_truth: { status: "verified_price_drop", message: "Recent price drop is supported.", fact_ids: ["fact_offer"] },
        fact_ids: ["fact_returns", "fact_fit", "fact_offer"]
      }
    );

    assert.equal(capsule.intent, "proof_missing");
    assert.equal(capsule.allowed_actions[0]?.type, "ask_proof");
    assert.equal(capsule.allowed_actions[0]?.attribute, "fabric");
    assert.ok(capsule.missing_facts.some((fact) => /fabric/i.test(fact)));
  });
});

function pick<T extends Record<string, unknown>, K extends keyof T>(value: T, keys: K[]) {
  return keys.reduce((result, key) => {
    result[key] = value[key];
    return result;
  }, {} as Pick<T, K>);
}
