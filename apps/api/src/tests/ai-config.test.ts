import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAiConfig } from "../config/env.js";

describe("AI configuration", () => {
  it("defaults new configuration to Bedrock then Gemini", () => {
    const config = parseAiConfig({});

    assert.deepEqual(config.providerOrder, ["bedrock", "gemini"]);
    assert.deepEqual(config.bedrockTextModels, [
      "apac.amazon.nova-micro-v1:0",
      "apac.amazon.nova-lite-v1:0"
    ]);
    assert.deepEqual(config.bedrockVisionModels, ["apac.amazon.nova-lite-v1:0"]);
    assert.equal(config.bedrockEmbeddingModel, "amazon.titan-embed-text-v2:0");
    assert.equal(config.bedrockEmbeddingDimensions, 512);
    assert.equal(config.bedrockEnabled, false);
  });

  it("requires explicit Bedrock enablement before runtime calls", () => {
    const config = parseAiConfig({ BEDROCK_ENABLED: "true" });

    assert.equal(config.bedrockEnabled, true);
  });

  it("preserves legacy Gemini-only provider configuration", () => {
    const config = parseAiConfig({
      LLM_PROVIDER: "gemini",
      LLM_MODEL: "legacy-model",
      EMBEDDING_MODEL: "legacy-embedding",
      EMBEDDING_DIMENSIONS: "768"
    });

    assert.deepEqual(config.providerOrder, ["gemini"]);
    assert.equal(config.geminiModel, "legacy-model");
    assert.equal(config.geminiEmbeddingModel, "legacy-embedding");
    assert.equal(config.geminiEmbeddingDimensions, 768);
  });

  it("lets the explicit provider order override legacy selection", () => {
    const config = parseAiConfig({
      AI_PROVIDER_ORDER: "bedrock,gemini",
      LLM_PROVIDER: "gemini"
    });

    assert.deepEqual(config.providerOrder, ["bedrock", "gemini"]);
  });
});
