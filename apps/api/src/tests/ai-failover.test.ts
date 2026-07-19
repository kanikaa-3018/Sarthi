import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createGeminiGenerationAdapter,
  runGenerationChain,
  type GenerationAdapter
} from "../services/ai.js";
import type {
  AiProvider,
  GeneratedJson,
  StructuredGenerationInput
} from "../services/aiTypes.js";
import { AiProviderError } from "../services/aiTypes.js";
import { env } from "../config/env.js";
import {
  embedText,
  geminiConfigured,
  geminiSafetyReason,
  generateGeminiJson
} from "../services/gemini.js";

const input: StructuredGenerationInput = {
  capability: "text",
  systemInstruction: "Use evidence only.",
  userText: "Answer",
  schemaName: "answer",
  schemaDescription: "Grounded answer",
  schema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"]
  },
  maxTokens: 300
};

const generated = (provider: AiProvider): GeneratedJson => ({
  provider,
  model: `${provider}-model`,
  value: { title: provider }
});

const adapter = (
  provider: AiProvider,
  generateStructured: () => Promise<GeneratedJson>,
  configured = true
): GenerationAdapter => ({
  provider,
  configured: () => configured,
  generateStructured
});

describe("AI generation failover", () => {
  it("keeps Gemini eligible while Bedrock is primary", () => {
    const previousOrder = env.providerOrder;
    const previousProvider = env.llmProvider;
    const previousKey = env.geminiApiKey;
    env.providerOrder = ["bedrock", "gemini"];
    env.llmProvider = "bedrock";
    env.geminiApiKey = "test-key";

    try {
      assert.equal(geminiConfigured(), true);
    } finally {
      env.providerOrder = previousOrder;
      env.llmProvider = previousProvider;
      env.geminiApiKey = previousKey;
    }
  });

  it("parses Gemini JSON inside the provider adapter", async () => {
    const gemini = createGeminiGenerationAdapter({
      configured: () => true,
      model: () => "gemini-test",
      generate: async () => "```json\n{\"title\":\"Gemini fallback\"}\n```"
    });

    const result = await gemini.generateStructured(input);

    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-test");
    assert.deepEqual(result.value, { title: "Gemini fallback" });
  });

  it("forwards the bounded output token budget to Gemini", async () => {
    let received: { maxTokens?: number } | undefined;
    const gemini = createGeminiGenerationAdapter({
      configured: () => true,
      model: () => "gemini-test",
      generate: async (value) => {
        received = value;
        return "{\"title\":\"bounded\"}";
      }
    });

    await gemini.generateStructured(input);

    assert.equal(received?.maxTokens, 300);
  });

  it("returns Bedrock output without invoking Gemini", async () => {
    let geminiCalls = 0;

    const result = await runGenerationChain(input, [
      adapter("bedrock", async () => generated("bedrock")),
      adapter("gemini", async () => {
        geminiCalls += 1;
        return generated("gemini");
      })
    ]);

    assert.equal(result?.provider, "bedrock");
    assert.equal(geminiCalls, 0);
  });

  it("uses Gemini after an eligible Bedrock error", async () => {
    const result = await runGenerationChain(input, [
      adapter("bedrock", async () => {
        throw new AiProviderError("availability", "unavailable");
      }),
      adapter("gemini", async () => generated("gemini"))
    ]);

    assert.equal(result?.provider, "gemini");
  });

  it("uses Gemini after Bedrock returns invalid structured output", async () => {
    const result = await runGenerationChain(input, [
      adapter("bedrock", async () => {
        throw new AiProviderError("invalid_output", "invalid");
      }),
      adapter("gemini", async () => generated("gemini"))
    ]);

    assert.equal(result?.provider, "gemini");
  });

  it("does not use Gemini after a Bedrock safety stop", async () => {
    let geminiCalls = 0;

    const result = await runGenerationChain(input, [
      adapter("bedrock", async () => {
        throw new AiProviderError("safety", "filtered");
      }),
      adapter("gemini", async () => {
        geminiCalls += 1;
        return generated("gemini");
      })
    ]);

    assert.equal(result, null);
    assert.equal(geminiCalls, 0);
  });

  it("treats Gemini block metadata as terminal safety", async () => {
    assert.equal(
      geminiSafetyReason({ promptFeedback: { blockReason: "SAFETY" } }),
      "SAFETY"
    );
    assert.equal(
      geminiSafetyReason({ candidates: [{ finishReason: "PROHIBITED_CONTENT" }] }),
      "PROHIBITED_CONTENT"
    );

    let bedrockCalls = 0;
    const result = await runGenerationChain(input, [
      adapter("gemini", async () => {
        throw new AiProviderError("safety", "blocked");
      }),
      adapter("bedrock", async () => {
        bedrockCalls += 1;
        return generated("bedrock");
      })
    ]);

    assert.equal(result, null);
    assert.equal(bedrockCalls, 0);
  });

  it("keeps Gemini generation and embedding circuits independent", async () => {
    const previousOrder = env.providerOrder;
    const previousKey = env.geminiApiKey;
    const previousFetch = globalThis.fetch;
    let embeddingCalls = 0;
    env.providerOrder = ["gemini"];
    env.geminiApiKey = "test-key";
    globalThis.fetch = async (url) => {
      if (String(url).includes(":embedContent")) {
        embeddingCalls += 1;
        return new Response(JSON.stringify({ embedding: { values: Array(768).fill(0.01) } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("temporary generation error", { status: 500 });
    };

    try {
      await assert.rejects(() => generateGeminiJson({
        systemInstruction: "test",
        userText: "test",
        maxTokens: 10
      }));
      const embedding = await embedText("seller proof", "RETRIEVAL_QUERY");

      assert.equal(embedding?.length, 768);
      assert.equal(embeddingCalls, 1);
    } finally {
      env.providerOrder = previousOrder;
      env.geminiApiKey = previousKey;
      globalThis.fetch = previousFetch;
    }
  });

  it("returns null without invoking providers when none are configured", async () => {
    let calls = 0;
    const result = await runGenerationChain(input, [
      adapter("bedrock", async () => {
        calls += 1;
        return generated("bedrock");
      }, false),
      adapter("gemini", async () => {
        calls += 1;
        return generated("gemini");
      }, false)
    ]);

    assert.equal(result, null);
    assert.equal(calls, 0);
  });
});
