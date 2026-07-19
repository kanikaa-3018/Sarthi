import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deterministicGraphChatAnswer } from "../services/graphAnswers.js";

const graph = {
  selected_product_id: "product_a",
  summary: {
    similarity: {
      summary: "3 comparable sellers matched by product family and image signals."
    }
  },
  ranking: {
    alternative: "variant_b",
    uncertainty: "medium"
  },
  seller_context: [{
    product: {
      product_id: "product_a",
      title: "Blue cotton kurti - Seller A",
      seller_name: "NayiDisha Fashions",
      base_price: 459
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
      median_dispatch_hours: 30
    },
    fit: {
      recommended_size: "XL",
      confidence: "medium",
      reasons: ["Buyer fit memory points to XL.", "XL has lower fit-return risk."]
    },
    proof_coverage: {
      fabric: {
        attribute: "fabric",
        sufficient: false,
        source_summary: "Fabric proof missing.",
        recommended_proof_type: "fabric_closeup",
        evidence_count: 0,
        fact_ids: []
      },
      color: {
        attribute: "color",
        sufficient: true,
        source_summary: "Daylight color proof exists.",
        recommended_proof_type: "daylight_photo",
        evidence_count: 1,
        fact_ids: ["fact_color"]
      }
    },
    candidate: {
      score: 0.78,
      score_percent: 78,
      factors: {
        price_value: 0.73
      }
    },
    price_context: {
      latest_price: 459,
      offer: { status: "verified_price_drop", message: "Recent price drop is supported by price history." }
    }
  }, {
    product: {
      product_id: "product_b",
      seller_name: "Saheli Styles"
    },
    seller: { name: "Saheli Styles", verification: { verification_status: "verified" } },
    variant: { variant_id: "variant_b" }
  }]
};

describe("deterministic graph chat answers", () => {
  it("answers fit questions with size-specific evidence", () => {
    const answer = deterministicGraphChatAnswer(graph, "Will XL fit me?");

    assert.equal(answer.title, "Size and fit answer");
    assert.match(answer.summary, /XL/);
    assert.ok(answer.reasons.some((reason) => /fit memory|XL/i.test(reason)));
    assert.ok(answer.reasons.some((reason) => /42 delivered/i.test(reason)));
  });

  it("answers proof questions with the missing proof attribute", () => {
    const answer = deterministicGraphChatAnswer(graph, "Is there fabric proof?");

    assert.equal(answer.title, "Proof still needed");
    assert.match(answer.summary, /fabric/i);
    assert.match(answer.caution ?? "", /missing proof|seller proof/i);
    assert.ok(answer.reasons.some((reason) => /fabric/i.test(reason)));
  });

  it("answers comparison questions with similar-seller context", () => {
    const answer = deterministicGraphChatAnswer(graph, "Which similar seller is better?");

    assert.equal(answer.title, "Comparison answer");
    assert.match(answer.summary, /similar listings|compared/i);
    assert.ok(answer.reasons.some((reason) => /comparable sellers/i.test(reason)));
  });
});
