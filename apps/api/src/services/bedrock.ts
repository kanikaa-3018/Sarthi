import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";
import { env } from "../config/env.js";
import {
  AiProviderError,
  type EmbeddedText,
  type GeneratedJson,
  type JsonObject,
  type StructuredGenerationInput
} from "./aiTypes.js";

type BedrockClientLike = {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<any>;
};

type BedrockProviderOptions = {
  client?: BedrockClientLike;
  region?: string;
  textModels: string[];
  visionModels: string[];
  embeddingModel: string;
  embeddingDimensions: number;
  timeoutMs: number;
};

export function createBedrockProvider(options: BedrockProviderOptions) {
  const client = options.client ?? new BedrockRuntimeClient({
    region: options.region ?? env.awsRegion,
    maxAttempts: 5,
    retryMode: "adaptive"
  });
  let disabledUntil = 0;
  let lastPublicError: string | null = null;
  let activeModel: string | null = null;
  let lastUsage: GeneratedJson["usage"] = undefined;

  return {
    async generateStructured(input: StructuredGenerationInput): Promise<GeneratedJson> {
      if (Date.now() < disabledUntil) {
        throw new AiProviderError("availability", "Bedrock is temporarily unavailable");
      }
      const models = modelCandidates(input, options);
      if (!models.length) throw new AiProviderError("availability", `No Bedrock ${input.capability} model is configured`);
      let lastAttemptError: unknown = null;

      for (const model of models) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
        try {
          const response = await client.send(new ConverseCommand({
            modelId: model,
            system: [{ text: input.systemInstruction }],
            messages: [{
              role: "user",
              content: (input.userParts?.length
                ? input.userParts.map((part) => "text" in part
                  ? { text: part.text }
                  : {
                      image: {
                        format: part.image.format,
                        source: { bytes: part.image.bytes }
                      }
                    })
                : [{ text: input.userText }]) as any
            }],
            inferenceConfig: {
              maxTokens: input.maxTokens,
              temperature: 0
            },
            toolConfig: {
              tools: [{
                toolSpec: {
                  name: input.schemaName,
                  description: input.schemaDescription,
                  inputSchema: { json: input.schema as any }
                }
              }],
              toolChoice: { tool: { name: input.schemaName } }
            }
          }), { abortSignal: controller.signal });

          if (response.stopReason === "content_filtered" || response.stopReason === "guardrail_intervened") {
            throw new AiProviderError("safety", "Bedrock safety policy stopped the response");
          }
          const toolUse = response.output?.message?.content?.find(
            (block: any) => block.toolUse?.name === input.schemaName
          )?.toolUse;
          if (!isJsonObject(toolUse?.input)) {
            throw new AiProviderError("invalid_output", "Bedrock returned no valid structured output");
          }
          activeModel = model;
          lastPublicError = null;
          disabledUntil = 0;
          lastUsage = response.usage;
          return {
            value: toolUse.input,
            provider: "bedrock",
            model,
            usage: response.usage
          };
        } catch (error) {
          if (error instanceof AiProviderError && error.kind === "safety") throw error;
          lastAttemptError = error;
        } finally {
          clearTimeout(timeout);
        }
      }

      disabledUntil = Date.now() + 60_000;
      lastPublicError = publicBedrockError(lastAttemptError);
      if (lastAttemptError instanceof AiProviderError) throw lastAttemptError;
      throw new AiProviderError("availability", "Configured Bedrock models are unavailable");
    },
    async embedText(
      text: string,
      _taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"
    ): Promise<EmbeddedText> {
      if (!options.embeddingModel) {
        throw new AiProviderError("availability", "No Bedrock embedding model is configured");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await client.send(new InvokeModelCommand({
          modelId: options.embeddingModel,
          contentType: "application/json",
          accept: "application/json",
          body: new TextEncoder().encode(JSON.stringify({
            inputText: text,
            dimensions: options.embeddingDimensions,
            normalize: true,
            embeddingTypes: ["float"]
          }))
        }), { abortSignal: controller.signal });
        const payload = JSON.parse(new TextDecoder().decode(response.body));
        const values = Array.isArray(payload.embedding) ? payload.embedding.map(Number) : [];
        if (values.length !== options.embeddingDimensions || values.some((value: number) => !Number.isFinite(value))) {
          throw new AiProviderError(
            "invalid_output",
            `Bedrock embedding must contain exactly ${options.embeddingDimensions} dimensions`
          );
        }
        return {
          values,
          provider: "bedrock",
          model: options.embeddingModel,
          dimensions: options.embeddingDimensions
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    status() {
      return {
        enabled: options.textModels.length > 0 || options.visionModels.length > 0,
        provider: "bedrock" as const,
        region: options.region ?? env.awsRegion,
        text_models: options.textModels,
        vision_models: options.visionModels,
        embedding_model: options.embeddingModel,
        embedding_dimensions: options.embeddingDimensions,
        active_model: activeModel,
        status: Date.now() < disabledUntil ? "temporarily_unavailable" : "configured",
        last_error: lastPublicError,
        last_usage: lastUsage
      };
    }
  };
}

function modelCandidates(input: StructuredGenerationInput, options: BedrockProviderOptions) {
  return input.capability === "vision" ? options.visionModels : options.textModels;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function publicBedrockError(error: unknown) {
  if (error instanceof AiProviderError) return error.message.slice(0, 180);
  const name = typeof (error as any)?.name === "string" ? (error as any).name : "BedrockError";
  const status = Number((error as any)?.$metadata?.httpStatusCode);
  return Number.isFinite(status) ? `${name} (${status})` : name;
}
