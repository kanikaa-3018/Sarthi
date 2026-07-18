import { env } from "../config/env.js";

type GeminiJsonInput = {
  systemInstruction: string;
  userText: string;
  temperature?: number;
};

let geminiDisabledUntil = 0;
let lastGeminiError: string | null = null;
let lastGenerateModel: string | null = null;
let lastEmbeddingModel: string | null = null;

const GENERATE_MODEL_FALLBACKS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview"
];
const EMBEDDING_MODEL_FALLBACKS = ["gemini-embedding-001"];

export function geminiConfigured() {
  return env.llmProvider === "gemini" && Boolean(env.geminiApiKey);
}

export function geminiRuntimeStatus() {
  const configured = geminiConfigured();
  return {
    enabled: configured,
    provider: env.llmProvider,
    model: env.llmModel,
    active_model: lastGenerateModel,
    embedding_model: env.embeddingModel,
    active_embedding_model: lastEmbeddingModel,
    status: configured
      ? geminiCircuitOpen()
        ? "temporarily_unavailable"
        : "configured"
      : "disabled",
    last_error: geminiCircuitOpen() ? lastGeminiError : null
  };
}

export async function generateGeminiJson(input: GeminiJsonInput) {
  if (!geminiConfigured()) return null;
  if (geminiCircuitOpen()) return null;
  let lastError: unknown = null;
  try {
    for (const model of modelCandidates(env.llmModel, GENERATE_MODEL_FALLBACKS)) {
      try {
        const payload = await postGenerateContent(model, input);
        lastGenerateModel = model;
        return payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join("") ?? "";
      } catch (error) {
        lastError = error;
        if (!shouldTryNextModel(error)) break;
      }
    }
    throw lastError ?? new Error("Gemini generation failed");
  } catch (error) {
    tripGeminiCircuit(error);
    throw error;
  }
}

export async function embedText(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT", title?: string) {
  if (!geminiConfigured()) return null;
  if (geminiCircuitOpen()) return null;
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
    tripGeminiCircuit(error);
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

function modelName(value: string) {
  return value.replace(/^models\//, "");
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
        parts: [{ text: input.userText }]
      }],
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        responseMimeType: "application/json"
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
      embedContentConfig: {
        taskType,
        title,
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
  return status === 404 || status === 429;
}

function geminiCircuitOpen() {
  return Date.now() < geminiDisabledUntil;
}

function tripGeminiCircuit(error: unknown) {
  const detail = error instanceof Error ? error.message.slice(0, 180) : "Gemini request failed";
  lastGeminiError = `${detail}; using deterministic fallback for 60 seconds`;
  geminiDisabledUntil = Date.now() + 60_000;
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
