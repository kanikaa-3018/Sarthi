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
  const states = {
    text: capabilityState(),
    vision: capabilityState(),
    embedding: capabilityState()
  };

  return {
    async generateStructured(input: StructuredGenerationInput): Promise<GeneratedJson> {
      const state = states[input.capability];
      if (circuitOpen(state)) {
        throw new AiProviderError("availability", `Bedrock ${input.capability} is temporarily unavailable`);
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
          if (response.stopReason === "max_tokens") {
            throw new AiProviderError("invalid_output", "Bedrock response reached the output token limit");
          }
          const toolUse = response.output?.message?.content?.find(
            (block: any) => block.toolUse?.name === input.schemaName
          )?.toolUse;
          if (!isJsonObject(toolUse?.input)) {
            throw new AiProviderError("invalid_output", "Bedrock returned no valid structured output");
          }
          state.activeModel = model;
          state.lastPublicError = null;
          state.disabledUntil = 0;
          state.lastUsage = response.usage;
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

      tripCircuit(state, lastAttemptError);
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
      const state = states.embedding;
      if (circuitOpen(state)) {
        throw new AiProviderError("availability", "Bedrock embedding is temporarily unavailable");
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
        const values = Array.isArray(payload.embedding) ? payload.embedding : [];
        if (values.length !== options.embeddingDimensions || values.some((value: unknown) => typeof value !== "number" || !Number.isFinite(value))) {
          throw new AiProviderError(
            "invalid_output",
            `Bedrock embedding must contain exactly ${options.embeddingDimensions} dimensions`
          );
        }
        state.activeModel = options.embeddingModel;
        state.lastPublicError = null;
        state.disabledUntil = 0;
        return {
          values: values as number[],
          provider: "bedrock",
          model: options.embeddingModel,
          dimensions: options.embeddingDimensions
        };
      } catch (error) {
        tripCircuit(state, error);
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError("availability", "Bedrock embedding is unavailable");
      } finally {
        clearTimeout(timeout);
      }
    },
    status() {
      const capabilityStatus = {
        text: publicCapabilityStatus(states.text),
        vision: publicCapabilityStatus(states.vision),
        embedding: publicCapabilityStatus(states.embedding)
      };
      const unavailable = Object.values(states).filter(circuitOpen);
      return {
        enabled: options.textModels.length > 0 || options.visionModels.length > 0,
        provider: "bedrock" as const,
        region: options.region ?? env.awsRegion,
        text_models: options.textModels,
        vision_models: options.visionModels,
        embedding_model: options.embeddingModel,
        embedding_dimensions: options.embeddingDimensions,
        active_model: states.text.activeModel ?? states.vision.activeModel,
        status: unavailable.length ? "temporarily_unavailable" : "configured",
        last_error: unavailable[0]?.lastPublicError ?? null,
        last_usage: states.text.lastUsage ?? states.vision.lastUsage,
        capabilities: capabilityStatus
      };
    }
  };
}

type CapabilityState = {
  disabledUntil: number;
  lastPublicError: string | null;
  activeModel: string | null;
  lastUsage: GeneratedJson["usage"];
};

function capabilityState(): CapabilityState {
  return {
    disabledUntil: 0,
    lastPublicError: null,
    activeModel: null,
    lastUsage: undefined
  };
}

function circuitOpen(state: CapabilityState) {
  return Date.now() < state.disabledUntil;
}

function tripCircuit(state: CapabilityState, error: unknown) {
  state.disabledUntil = Date.now() + 60_000;
  state.lastPublicError = publicBedrockError(error);
}

function publicCapabilityStatus(state: CapabilityState) {
  return {
    status: circuitOpen(state) ? "temporarily_unavailable" : "configured",
    active_model: state.activeModel,
    last_error: circuitOpen(state) ? state.lastPublicError : null,
    last_usage: state.lastUsage
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
