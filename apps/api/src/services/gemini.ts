import { env } from "../config/env.js";
import { AiProviderError } from "./aiTypes.js";

export type GeminiJsonInput = {
  systemInstruction: string;
  userText: string;
  userParts?: GeminiUserPart[];
  capability?: "text" | "vision";
  schema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
};

export type GeminiUserPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

const geminiCircuits = {
  generation: { disabledUntil: 0, lastError: null as string | null },
  embedding: { disabledUntil: 0, lastError: null as string | null }
};
let lastGenerateModel: string | null = null;
let lastEmbeddingModel: string | null = null;

const GENERATE_MODEL_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];
const VISION_MODEL_FALLBACKS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash"
];
const EMBEDDING_MODEL_FALLBACKS = ["gemini-embedding-001"];
const MODEL_ALIASES: Record<string, string> = {
  "gemini-flash-lite-latest": "gemini-3.1-flash-lite"
};

export function geminiConfigured() {
  return env.providerOrder.includes("gemini") && Boolean(env.geminiApiKey);
}

export function geminiRuntimeStatus() {
  const configured = geminiConfigured();
  return {
    enabled: configured,
    provider: "gemini",
    model: env.geminiModel,
    active_model: lastGenerateModel,
    embedding_model: env.embeddingModel,
    active_embedding_model: lastEmbeddingModel,
    key_present: Boolean(env.geminiApiKey),
    status: configured
      ? geminiCircuitOpen("generation")
        ? "temporarily_unavailable"
        : "configured"
      : "disabled",
    last_error: geminiCircuitOpen("generation") ? geminiCircuits.generation.lastError : null,
    capabilities: {
      text: {
        status: configured
          ? geminiCircuitOpen("generation") ? "temporarily_unavailable" : "configured"
          : "disabled",
        last_error: geminiCircuitOpen("generation") ? geminiCircuits.generation.lastError : null
      },
      vision: {
        status: configured
          ? geminiCircuitOpen("generation") ? "temporarily_unavailable" : "configured"
          : "disabled",
        last_error: geminiCircuitOpen("generation") ? geminiCircuits.generation.lastError : null
      },
      embedding: {
        status: configured
          ? geminiCircuitOpen("embedding") ? "temporarily_unavailable" : "configured"
          : "disabled",
        last_error: geminiCircuitOpen("embedding") ? geminiCircuits.embedding.lastError : null
      }
    }
  };
}

export async function generateGeminiJson(input: GeminiJsonInput) {
  if (!geminiConfigured()) return null;
  if (geminiCircuitOpen("generation")) return null;
  let lastError: unknown = null;
  try {
    const fallbacks = input.capability === "vision" ? VISION_MODEL_FALLBACKS : GENERATE_MODEL_FALLBACKS;
    for (const model of modelCandidates(env.llmModel, fallbacks)) {
      try {
        const payload = await postGenerateContent(model, input);
        const safetyReason = geminiSafetyReason(payload);
        if (safetyReason) {
          throw new AiProviderError("safety", "Gemini safety policy stopped the response");
        }
        const text = payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text).filter(Boolean).join("") ?? "";
        if (!text.trim()) {
          const error = new Error(`Gemini returned empty content (${model})`);
          (error as any).status = payload.candidates?.[0]?.finishReason === "MAX_TOKENS" ? 429 : 502;
          throw error;
        }
        lastGenerateModel = model;
        return text;
      } catch (error) {
        lastError = error;
        if (!shouldTryNextModel(error)) break;
      }
    }
    throw lastError ?? new Error("Gemini generation failed");
  } catch (error) {
    if (error instanceof AiProviderError && error.kind === "safety") throw error;
    tripGeminiCircuit("generation", error);
    throw error;
  }
}

export async function embedText(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT", title?: string) {
  if (!geminiConfigured()) return null;
  if (geminiCircuitOpen("embedding")) return null;
  let lastError: unknown = null;
  try {
    for (const model of modelCandidates(env.embeddingModel, EMBEDDING_MODEL_FALLBACKS)) {
      try {
        const payload = await postEmbedContent(model, text, taskType, title);
        lastEmbeddingModel = model;
        const values = payload.embedding?.values;
        return Array.isArray(values) ? values.map((value: unknown) => Number(value)).filter(Number.isFinite) : null;
      } catch (error) {
        lastError = error;
        if (!shouldTryNextModel(error)) break;
      }
    }
    throw lastError ?? new Error("Gemini embedding failed");
  } catch (error) {
    tripGeminiCircuit("embedding", error);
    throw error;
  }
}

export function parseJsonObject(text: string) {
  if (!text.trim()) return null;
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function geminiSafetyReason(payload: unknown) {
  const promptReason = String((payload as any)?.promptFeedback?.blockReason ?? "").trim().toUpperCase();
  if (promptReason && promptReason !== "BLOCK_REASON_UNSPECIFIED") return promptReason;
  const terminalReasons = new Set([
    "SAFETY",
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "SPII",
    "RECITATION",
    "IMAGE_SAFETY",
    "IMAGE_PROHIBITED_CONTENT"
  ]);
  const candidate = Array.isArray((payload as any)?.candidates)
    ? (payload as any).candidates.find((item: any) => terminalReasons.has(String(item?.finishReason ?? "").toUpperCase()))
    : null;
  return candidate ? String(candidate.finishReason).toUpperCase() : null;
}

export function geminiActiveModel() {
  return lastGenerateModel ?? env.geminiModel;
}

function modelName(value: string) {
  const model = value.replace(/^models\//, "");
  return MODEL_ALIASES[model] ?? model;
}

function modelCandidates(primary: string, fallbacks: string[]) {
  return [modelName(primary), ...fallbacks.map(modelName)].filter((model, index, models) => model && models.indexOf(model) === index);
}

async function postGenerateContent(model: string, input: GeminiJsonInput) {
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.geminiApiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: input.systemInstruction }]
      },
      contents: [{
        role: "user",
        parts: input.userParts?.length ? input.userParts : [{ text: input.userText }]
      }],
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxTokens,
        responseMimeType: "application/json",
        responseSchema: input.schema
      }
    })
  });
  if (!response.ok) throw await geminiHttpError(response, "Gemini", model);
  return await response.json() as any;
}

async function postEmbedContent(
  model: string,
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  title?: string
) {
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.geminiApiKey
    },
    body: JSON.stringify({
      model: `models/${model}`,
      content: {
        parts: [{ text: text.slice(0, 6000) }]
      },
      taskType,
      ...(title && taskType === "RETRIEVAL_DOCUMENT" ? { title } : {}),
      outputDimensionality: env.embeddingDimensions,
      embedContentConfig: {
        taskType,
        ...(title && taskType === "RETRIEVAL_DOCUMENT" ? { title } : {}),
        outputDimensionality: env.embeddingDimensions,
        autoTruncate: true
      }
    })
  });
  if (!response.ok) throw await geminiHttpError(response, "Gemini embedding", model);
  return await response.json() as any;
}

async function geminiHttpError(response: Response, label: string, model: string) {
  const detail = (await safeErrorText(response)).slice(0, 220);
  const error = new Error(`${label} ${response.status} (${model})${detail ? `: ${detail}` : ""}`);
  (error as any).status = response.status;
  return error;
}

async function safeErrorText(response: Response) {
  try {
    const body = await response.text();
    return body.replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function shouldTryNextModel(error: unknown) {
  const status = typeof (error as any)?.status === "number" ? (error as any).status : null;
  return status === 400 || status === 404 || status === 429 || status === 502 || status === 503;
}

function geminiCircuitOpen(capability: keyof typeof geminiCircuits) {
  return Date.now() < geminiCircuits[capability].disabledUntil;
}

function tripGeminiCircuit(capability: keyof typeof geminiCircuits, error: unknown) {
  const detail = error instanceof Error ? error.message.slice(0, 180) : "Gemini request failed";
  geminiCircuits[capability].lastError = `${detail}; using fallback for 60 seconds`;
  geminiCircuits[capability].disabledUntil = Date.now() + 60_000;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.externalServiceTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
