import type {
  AiProvider,
  EmbeddedText,
  GeneratedJson,
  StructuredGenerationInput
} from "./aiTypes.js";
import { AiProviderError } from "./aiTypes.js";
import { env } from "../config/env.js";
import { createBedrockProvider } from "./bedrock.js";
import {
  geminiConfigured,
  geminiRuntimeStatus,
  embedText as embedGeminiText,
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
  const enabled = env.bedrockEnabled && env.providerOrder.includes("bedrock");
  const status = bedrockProvider.status();
  return {
    ...status,
    enabled,
    status: enabled ? status.status : "disabled"
  };
}

export function aiRuntimeStatus() {
  const bedrock = bedrockRuntimeStatus();
  const gemini = geminiRuntimeStatus();
  const generationCapability = (capability: "text" | "vision") => {
    const configuredProviders = env.providerOrder.filter((provider) => productionAdapters[provider].configured(capability));
    const availableProviders = configuredProviders.filter((provider) => {
      const status = provider === "bedrock" ? bedrock : gemini;
      return status.capabilities?.[capability]?.status === "configured";
    });
    return {
      configured: configuredProviders.length > 0,
      available: availableProviders.length > 0,
      provider_order: configuredProviders,
      primary_provider: availableProviders[0] ?? configuredProviders[0] ?? null
    };
  };
  const embeddingProviders = configuredEmbeddingProviders();
  const availableEmbeddingProviders = embeddingProviders.filter((provider) => {
    const status = provider === "bedrock" ? bedrock : gemini;
    return status.capabilities?.embedding?.status === "configured";
  });
  const capabilities = {
    text: generationCapability("text"),
    vision: generationCapability("vision"),
    embedding: {
      configured: embeddingProviders.length > 0,
      available: availableEmbeddingProviders.length > 0,
      provider_order: embeddingProviders,
      primary_provider: availableEmbeddingProviders[0] ?? embeddingProviders[0] ?? null
    }
  };
  return {
    provider_order: env.providerOrder,
    primary_provider: capabilities.text.primary_provider,
    configured: capabilities.text.configured,
    available: capabilities.text.available,
    capabilities,
    bedrock,
    gemini
  };
}

export function aiCacheFingerprint() {
  return {
    provider_order: env.providerOrder,
    bedrock: {
      enabled: env.bedrockEnabled,
      text_models: env.bedrockTextModels,
      vision_models: env.bedrockVisionModels,
      embedding_model: env.bedrockEmbeddingModel,
      embedding_dimensions: env.bedrockEmbeddingDimensions
    },
    gemini: {
      enabled: geminiConfigured(),
      text_model: env.geminiModel,
      embedding_model: env.geminiEmbeddingModel,
      embedding_dimensions: env.geminiEmbeddingDimensions
    }
  };
}

export function embedWithBedrock(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"
) {
  return bedrockProvider.embedText(text, taskType);
}

type EmbeddingAdapter = {
  provider: AiProvider;
  configured(): boolean;
  embedText(
    text: string,
    taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
    title?: string
  ): Promise<EmbeddedText>;
};

const embeddingAdapters: Record<AiProvider, EmbeddingAdapter> = {
  bedrock: {
    provider: "bedrock",
    configured: () => env.bedrockEnabled
      && env.providerOrder.includes("bedrock")
      && Boolean(env.bedrockEmbeddingModel),
    embedText: (text, taskType) => bedrockProvider.embedText(text, taskType)
  },
  gemini: {
    provider: "gemini",
    configured: geminiConfigured,
    async embedText(text, taskType, title) {
      const values = await embedGeminiText(text, taskType, title);
      if (!values || values.length !== env.geminiEmbeddingDimensions) {
        throw new AiProviderError(
          "invalid_output",
          `Gemini embedding must contain exactly ${env.geminiEmbeddingDimensions} dimensions`
        );
      }
      return {
        values,
        provider: "gemini",
        model: env.geminiEmbeddingModel,
        dimensions: env.geminiEmbeddingDimensions
      };
    }
  }
};

export function configuredEmbeddingProviders() {
  return env.providerOrder.filter((provider) => embeddingAdapters[provider].configured());
}

export function embedTextWithProvider(
  provider: AiProvider,
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  title?: string
) {
  const adapter = embeddingAdapters[provider];
  if (!adapter.configured()) {
    throw new AiProviderError("availability", `${provider} embeddings are not configured`);
  }
  return adapter.embedText(text, taskType, title);
}
