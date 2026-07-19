import type {
  AiProvider,
  GeneratedJson,
  StructuredGenerationInput
} from "./aiTypes.js";
import { AiProviderError } from "./aiTypes.js";
import { env } from "../config/env.js";
import { createBedrockProvider } from "./bedrock.js";
import {
  geminiConfigured,
  geminiRuntimeStatus,
  generateGeminiJson,
  parseJsonObject,
  type GeminiUserPart
} from "./gemini.js";

export type GenerationAdapter = {
  provider: AiProvider;
  configured(capability: StructuredGenerationInput["capability"]): boolean;
  generateStructured(input: StructuredGenerationInput): Promise<GeneratedJson>;
};

type GeminiGenerationAdapterOptions = {
  configured(): boolean;
  model(): string;
  generate(input: {
    systemInstruction: string;
    userText: string;
    userParts?: GeminiUserPart[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string | null>;
};

export function createGeminiGenerationAdapter(options: GeminiGenerationAdapterOptions): GenerationAdapter {
  return {
    provider: "gemini",
    configured: () => options.configured(),
    async generateStructured(input) {
      try {
        const text = await options.generate({
          systemInstruction: input.systemInstruction,
          userText: input.userText,
          userParts: input.userParts?.map((part): GeminiUserPart => "text" in part
            ? { text: part.text }
            : {
                inlineData: {
                  mimeType: `image/${part.image.format}`,
                  data: Buffer.from(part.image.bytes).toString("base64")
                }
              }),
          temperature: 0,
          maxTokens: input.maxTokens
        });
        const value = text ? parseJsonObject(text) : null;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new AiProviderError("invalid_output", "Gemini returned no valid structured output");
        }
        return {
          value,
          provider: "gemini",
          model: options.model()
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError("availability", "Gemini is unavailable");
      }
    }
  };
}

export async function runGenerationChain(
  input: StructuredGenerationInput,
  adapters: GenerationAdapter[]
) {
  for (const adapter of adapters) {
    if (!adapter.configured(input.capability)) continue;
    try {
      return await adapter.generateStructured(input);
    } catch (error) {
      if (error instanceof AiProviderError && error.kind === "safety") return null;
      if (error instanceof AiProviderError && ["availability", "invalid_output"].includes(error.kind)) continue;
      throw error;
    }
  }
  return null;
}

const bedrockProvider = createBedrockProvider({
  region: env.awsRegion,
  textModels: env.bedrockTextModels,
  visionModels: env.bedrockVisionModels,
  embeddingModel: env.bedrockEmbeddingModel,
  embeddingDimensions: env.bedrockEmbeddingDimensions,
  timeoutMs: env.externalServiceTimeoutMs
});

const productionAdapters: Record<AiProvider, GenerationAdapter> = {
  bedrock: {
    provider: "bedrock",
    configured: (capability) => env.bedrockEnabled
      && env.providerOrder.includes("bedrock")
      && (capability === "vision" ? env.bedrockVisionModels.length > 0 : env.bedrockTextModels.length > 0),
    generateStructured: (input) => bedrockProvider.generateStructured(input)
  },
  gemini: createGeminiGenerationAdapter({
    configured: geminiConfigured,
    model: () => env.geminiModel,
    generate: generateGeminiJson
  })
};

export function aiConfigured(capability: StructuredGenerationInput["capability"] = "text") {
  return env.providerOrder.some((provider) => productionAdapters[provider]?.configured(capability));
}

export function generateStructuredJson(input: StructuredGenerationInput) {
  return runGenerationChain(
    input,
    env.providerOrder.map((provider) => productionAdapters[provider]).filter(Boolean)
  );
}

export function isGeneratedProvider(value: unknown): value is AiProvider {
  return value === "bedrock" || value === "gemini";
}

export function bedrockRuntimeStatus() {
  return {
    ...bedrockProvider.status(),
    enabled: env.bedrockEnabled && env.providerOrder.includes("bedrock")
  };
}

export function aiRuntimeStatus() {
  return {
    provider_order: env.providerOrder,
    primary_provider: env.providerOrder[0] ?? null,
    configured: aiConfigured(),
    bedrock: bedrockRuntimeStatus(),
    gemini: geminiRuntimeStatus()
  };
}

export function embedWithBedrock(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"
) {
  return bedrockProvider.embedText(text, taskType);
}
