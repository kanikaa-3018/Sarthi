export type AiProvider = "bedrock" | "gemini";
export type AiCapability = "text" | "vision" | "embedding";
export type AiImageFormat = "jpeg" | "png" | "gif" | "webp";

export type AiUserPart =
  | { text: string }
  | { image: { format: AiImageFormat; bytes: Uint8Array } };

export type JsonObject = Record<string, unknown>;

export type StructuredGenerationInput = {
  capability: "text" | "vision";
  systemInstruction: string;
  userText: string;
  userParts?: AiUserPart[];
  schemaName: string;
  schemaDescription: string;
  schema: JsonObject;
  maxTokens: number;
};

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type GeneratedJson = {
  value: JsonObject;
  provider: AiProvider;
  model: string;
  usage?: AiUsage;
};

export type EmbeddedText = {
  values: number[];
  provider: AiProvider;
  model: string;
  dimensions: number;
};

export type AiProviderErrorKind = "availability" | "invalid_output" | "safety";

export class AiProviderError extends Error {
  constructor(public readonly kind: AiProviderErrorKind, message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
