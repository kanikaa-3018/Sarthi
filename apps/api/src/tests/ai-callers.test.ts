import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignConfidenceItems } from "../services/confidenceScoring.js";
import { generateSellerCoach } from "../services/sellerOperations.js";

describe("provider-neutral AI callers", () => {
  it("normalizes Bedrock confidence output without accepting unknown keys", async () => {
    const result = await assignConfidenceItems(
      { product_id: "product_1" },
      [
        { key: "fit_match", label: "Fit", weight: 2, confidence: 0.4, rationale: "fallback" },
        { key: "seller_trust", label: "Trust", weight: 1, confidence: 0.6, rationale: "fallback" }
      ],
      async () => ({
        provider: "bedrock" as const,
        model: "nova-test",
        value: {
          confidences: {
            fit_match: 1.4,
            unknown: 0.9
          }
        }
      })
    );

    assert.equal(result.source, "bedrock");
    assert.deepEqual(result.items.map((item) => [item.key, item.confidence]), [
      ["fit_match", 1],
      ["seller_trust", 0.6]
    ]);
  });

  it("accepts Bedrock seller coaching only for supplied product ids", async () => {
    const cards = [{
      product_id: "product_1",
      product_title: "Blue kurta",
      priority: "high",
      issue: "Fit doubt",
      action: "Add size chart",
      metric: "4 returns",
      score: 42,
      proof_type: "measurement_chart",
      why: "Buyers need fit proof"
    }];

    const result = await generateSellerCoach(cards, 1, async () => ({
      provider: "bedrock" as const,
      model: "nova-test",
      value: {
        headline: "Fix fit proof first",
        summary: "A chart can reduce doubt.",
        reasons: ["Fit proof is missing"],
        product_coaching: [
          {
            product_id: "product_1",
            issue_summary: "Fit proof is unclear.",
            buyer_impact: "Buyers hesitate.",
            next_step: "Upload a chart.",
            rating_lift: "Improves trust.",
            trust_steps: ["Measure each size"]
          },
          {
            product_id: "invented_product",
            issue_summary: "Invented",
            buyer_impact: "Invented",
            next_step: "Invented",
            rating_lift: "Invented",
            trust_steps: []
          }
        ],
        rating_plan: {
          title: "Build trust",
          summary: "Publish accurate proof.",
          steps: ["Add the chart"]
        }
      }
    }));

    assert.equal(result.provider, "bedrock");
    assert.equal(result.headline, "Fix fit proof first");
    assert.deepEqual(result.cards.map((card: any) => card.product_id), ["product_1"]);
  });
});
