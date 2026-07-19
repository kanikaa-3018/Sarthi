import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBedrockProvider } from "../services/bedrock.js";
import type { StructuredGenerationInput } from "../services/aiTypes.js";

const structuredInput = (capability: "text" | "vision"): StructuredGenerationInput => ({
  capability,
  systemInstruction: "Use evidence only.",
  userText: "Answer from evidence.",
  schemaName: "answer",
  schemaDescription: "Grounded answer",
  schema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"]
  },
  maxTokens: 300
});

const createProvider = (client: { send: (command: any, options?: any) => Promise<any> }) =>
  createBedrockProvider({
    client: client as any,
    textModels: ["apac.amazon.nova-micro-v1:0", "apac.amazon.nova-lite-v1:0"],
    visionModels: ["apac.amazon.nova-lite-v1:0"],
    embeddingModel: "amazon.titan-embed-text-v2:0",
    embeddingDimensions: 512,
    timeoutMs: 8000
  });

describe("Bedrock provider", () => {
  it("forces the named Nova output tool and sets explicit limits", async () => {
    const calls: Array<{ input: any; options: any }> = [];
    const provider = createProvider({
      send: async (command, options) => {
        calls.push({ input: command.input, options });
        return {
          stopReason: "tool_use",
          output: {
            message: {
              content: [{ toolUse: { name: "answer", input: { title: "Grounded" } } }]
            }
          },
          usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }
        };
      }
    });

    const result = await provider.generateStructured(structuredInput("text"));

    assert.equal(result.value.title, "Grounded");
    assert.equal(result.provider, "bedrock");
    assert.equal(result.model, "apac.amazon.nova-micro-v1:0");
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 4, totalTokens: 14 });
    assert.equal(calls[0].input.inferenceConfig.maxTokens, 300);
    assert.equal(calls[0].input.inferenceConfig.temperature, 0);
    assert.deepEqual(calls[0].input.toolConfig.toolChoice, { tool: { name: "answer" } });
    assert.equal(calls[0].input.toolConfig.tools[0].toolSpec.name, "answer");
    assert.deepEqual(calls[0].input.toolConfig.tools[0].toolSpec.inputSchema.json, structuredInput("text").schema);
    assert.ok(calls[0].options.abortSignal);
  });

  it("maps neutral PNG bytes to a Converse image block", async () => {
    let request: any;
    const provider = createProvider({
      send: async (command) => {
        request = command.input;
        return {
          stopReason: "tool_use",
          output: {
            message: {
              content: [{ toolUse: { name: "answer", input: { title: "Image" } } }]
            }
          }
        };
      }
    });

    await provider.generateStructured({
      ...structuredInput("vision"),
      userParts: [{ image: { format: "png", bytes: new Uint8Array([137, 80, 78, 71]) } }]
    });

    const block = request.messages[0].content[0].image;
    assert.equal(block.format, "png");
    assert.deepEqual(block.source.bytes, new Uint8Array([137, 80, 78, 71]));
  });

  it("tries Nova Lite after Nova Micro availability failure", async () => {
    const modelIds: string[] = [];
    const provider = createProvider({
      send: async (command) => {
        modelIds.push(command.input.modelId);
        if (modelIds.length === 1) {
          throw Object.assign(new Error("denied"), { name: "AccessDeniedException" });
        }
        return {
          stopReason: "tool_use",
          output: {
            message: {
              content: [{ toolUse: { name: "answer", input: { title: "Fallback" } } }]
            }
          }
        };
      }
    });

    const result = await provider.generateStructured(structuredInput("text"));

    assert.equal(result.model, "apac.amazon.nova-lite-v1:0");
    assert.deepEqual(modelIds, [
      "apac.amazon.nova-micro-v1:0",
      "apac.amazon.nova-lite-v1:0"
    ]);
  });

  it("marks a content filter stop as terminal safety", async () => {
    let calls = 0;
    const provider = createProvider({
      send: async () => {
        calls += 1;
        return { stopReason: "content_filtered" };
      }
    });

    await assert.rejects(
      () => provider.generateStructured(structuredInput("text")),
      (error: any) => error?.name === "AiProviderError" && error?.kind === "safety"
    );
    assert.equal(calls, 1);
  });

  it("stores a sanitized error without prompt or credentials", async () => {
    const secretPrompt = "private-prompt-value";
    const provider = createProvider({
      send: async () => {
        throw new Error(`failure ${secretPrompt}`);
      }
    });

    await assert.rejects(() => provider.generateStructured({
      ...structuredInput("text"),
      userText: secretPrompt
    }));

    const status = provider.status();
    assert.equal(JSON.stringify(status).includes(secretPrompt), false);
    assert.equal("credentials" in status, false);
    assert.equal(status.status, "temporarily_unavailable");
  });

  it("requests and validates a 512-dimensional Titan embedding", async () => {
    const values = Array.from({ length: 512 }, (_, index) => index / 512);
    const provider = createProvider({
      send: async (command) => {
        assert.equal(command.input.modelId, "amazon.titan-embed-text-v2:0");
        assert.equal(command.input.contentType, "application/json");
        assert.equal(command.input.accept, "application/json");
        assert.deepEqual(JSON.parse(new TextDecoder().decode(command.input.body)), {
          inputText: "seller proof",
          dimensions: 512,
          normalize: true,
          embeddingTypes: ["float"]
        });
        return {
          body: new TextEncoder().encode(JSON.stringify({ embedding: values }))
        };
      }
    });

    const result = await provider.embedText("seller proof", "RETRIEVAL_QUERY");

    assert.equal(result.provider, "bedrock");
    assert.equal(result.model, "amazon.titan-embed-text-v2:0");
    assert.equal(result.dimensions, 512);
    assert.equal(result.values.length, 512);
  });

  it("rejects a Titan vector with the wrong dimensions", async () => {
    const provider = createProvider({
      send: async () => ({
        body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1] }))
      })
    });

    await assert.rejects(
      () => provider.embedText("seller proof", "RETRIEVAL_QUERY"),
      (error: any) => error?.name === "AiProviderError"
        && error?.kind === "invalid_output"
        && /512 dimensions/.test(error.message)
    );
  });
});
