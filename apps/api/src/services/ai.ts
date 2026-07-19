import type {
  AiProvider,
  GeneratedJson,
  StructuredGenerationInput
} from "./aiTypes.js";
import { AiProviderError } from "./aiTypes.js";
import { parseJsonObject, type GeminiUserPart } from "./gemini.js";

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
          temperature: 0
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
