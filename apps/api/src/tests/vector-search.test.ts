import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { vectorNamespaceForProvider } from "../services/vectorSearch.js";

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
});
