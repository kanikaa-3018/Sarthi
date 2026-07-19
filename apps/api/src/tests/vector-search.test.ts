import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import {
  isValidEmbeddingVector,
  selectedVectorIndexProviders,
  semanticEvidenceSearch,
  vectorNamespaceForProvider
} from "../services/vectorSearch.js";

describe("provider-specific vector namespaces", () => {
  it("never mixes Titan 512 vectors with Gemini 768 vectors", () => {
    const bedrock = vectorNamespaceForProvider("bedrock");
    const gemini = vectorNamespaceForProvider("gemini");

    assert.equal(bedrock.dimensions, 512);
    assert.equal(gemini.dimensions, 768);
    assert.notEqual(bedrock.collection, gemini.collection);
    assert.notEqual(bedrock.index, gemini.index);
    assert.equal(bedrock.collection, env.bedrockVectorSearchCollection);
    assert.equal(gemini.collection, env.vectorSearchCollection);
  });

  it("rejects stored vectors with wrong dimensions or coerced values", () => {
    assert.equal(isValidEmbeddingVector([0.1, 0.2], 2), true);
    assert.equal(isValidEmbeddingVector([0.1], 2), false);
    assert.equal(isValidEmbeddingVector(["0.1", 0.2], 2), false);
    assert.equal(isValidEmbeddingVector([null, 0.2], 2), false);
    assert.equal(isValidEmbeddingVector([Number.NaN, 0.2], 2), false);
  });

  it("scopes vector index creation to one explicitly selected provider", () => {
    assert.deepEqual(
      selectedVectorIndexProviders(["--provider", "bedrock"], ["bedrock", "gemini"]),
      ["bedrock"]
    );
    assert.deepEqual(
      selectedVectorIndexProviders(["--provider=gemini"], ["bedrock", "gemini"]),
      ["gemini"]
    );
    assert.deepEqual(selectedVectorIndexProviders([], ["bedrock", "gemini"]), ["bedrock"]);
    assert.throws(
      () => selectedVectorIndexProviders(["--provider=unknown"], ["bedrock", "gemini"]),
      /Invalid vector provider/
    );
  });

  it("continues to lexical fallback when a ready vector index returns no rows", async () => {
    const previousEnabled = env.vectorSearchEnabled;
    const previousOrder = env.providerOrder;
    const previousKey = env.geminiApiKey;
    const previousFetch = globalThis.fetch;
    env.vectorSearchEnabled = true;
    env.providerOrder = ["gemini"];
    env.geminiApiKey = "test-key";
    globalThis.fetch = async () => new Response(JSON.stringify({
      embedding: { values: Array(env.embeddingDimensions).fill(0.01) }
    }), { status: 200, headers: { "content-type": "application/json" } });
    const collection = {
      findOne: async () => ({ _id: "existing" }),
      updateOne: async () => ({ acknowledged: true }),
      listSearchIndexes: () => ({ toArray: async () => [{ name: env.vectorSearchIndex }] }),
      aggregate: () => ({ toArray: async () => [] })
    };
    const db = { collection: () => collection } as any;
    const graph = {
      cluster: { cluster_id: "cluster_1" },
      nodes: [{
        id: "seller_1",
        type: "seller",
        label: "Trusted seller",
        subtitle: "Verified",
        status: "verified",
        data: {},
        fact_ids: ["fact_1"]
      }],
      edges: []
    };

    try {
      const result = await semanticEvidenceSearch(db, graph, "trusted seller", 3);

      assert.equal(result.source, "lexical_fallback_after_vector_error");
      assert.equal(result.results.length, 1);
    } finally {
      env.vectorSearchEnabled = previousEnabled;
      env.providerOrder = previousOrder;
      env.geminiApiKey = previousKey;
      globalThis.fetch = previousFetch;
    }
  });
});
