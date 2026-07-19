import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignConfidenceItems } from "../services/confidenceScoring.js";
import { generateSellerCoach } from "../services/sellerOperations.js";
import { buildVisualAiRequest } from "../services/similarListings.js";

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

  it("builds one provider-neutral image payload for Bedrock and Gemini", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "content-type": "image/png" }
    });

    try {
      const request = await buildVisualAiRequest(
        { product_id: "seed", image_url: "https://example.com/seed.png" },
        [{ product_id: "candidate", image_url: "https://example.com/candidate.png" } as any]
      );

      assert.equal(request.imageInputs, 2);
      const images = request.userParts?.filter((part) => "image" in part) ?? [];
      assert.equal(images.length, 2);
      assert.equal(images[0] && "image" in images[0] ? images[0].image.format : null, "png");
      assert.deepEqual(
        images[0] && "image" in images[0] ? [...images[0].image.bytes] : [],
        [137, 80, 78, 71]
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
