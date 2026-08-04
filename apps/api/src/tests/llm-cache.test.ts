import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { llmCacheKey, stableDataCacheKey } from "../services/llmCache.js";
import { aiRuntimeStatus } from "../services/ai.js";

describe("AI cache isolation", () => {
  it("changes the cache namespace when provider priority changes", () => {
    const previousOrder = env.providerOrder;
    try {
      env.providerOrder = ["bedrock", "gemini"];
      const bedrockFirst = llmCacheKey("answer", { query: "same" });
      env.providerOrder = ["gemini"];
      const geminiOnly = llmCacheKey("answer", { query: "same" });

      assert.notEqual(bedrockFirst, geminiOnly);
    } finally {
      env.providerOrder = previousOrder;
    }
  });

  it("remains stable when payload keys are reordered", () => {
    assert.equal(
      llmCacheKey("answer", { query: "same", product_id: "p1" }),
      llmCacheKey("answer", { product_id: "p1", query: "same" })
    );
  });

  it("keeps data cache keys independent from provider order", () => {
    const previousOrder = env.providerOrder;
    try {
      env.providerOrder = ["bedrock", "gemini"];
      const first = stableDataCacheKey("graph", { product_id: "p1", selected_variant_id: "p1_l" });
      env.providerOrder = ["gemini"];
      const second = stableDataCacheKey("graph", { selected_variant_id: "p1_l", product_id: "p1" });

      assert.equal(first, second);
    } finally {
      env.providerOrder = previousOrder;
    }
  });

  it("reports Bedrock and legacy Gemini health without exposing secrets", () => {
    const previousKey = env.geminiApiKey;
    const previousBedrock = env.bedrockEnabled;
    env.geminiApiKey = "do-not-leak-this-test-key";
    env.bedrockEnabled = false;
    try {
      const status = aiRuntimeStatus();
      const serialized = JSON.stringify(status);

      assert.equal(status.bedrock.provider, "bedrock");
      assert.equal(status.bedrock.status, "disabled");
      assert.equal(status.gemini.provider, "gemini");
      assert.deepEqual(status.provider_order, env.providerOrder);
      assert.equal(status.primary_provider, "gemini");
      assert.equal(status.available, true);
      assert.equal(status.capabilities.text.primary_provider, "gemini");
      assert.equal(serialized.includes("do-not-leak-this-test-key"), false);
    } finally {
      env.geminiApiKey = previousKey;
      env.bedrockEnabled = previousBedrock;
    }
  });
});
