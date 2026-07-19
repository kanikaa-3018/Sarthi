import { aiConfigured, generateStructuredJson } from "./ai.js";
import type { GeneratedJson, StructuredGenerationInput } from "./aiTypes.js";

export type ConfidenceItem<Key extends string = string> = {
  key: Key;
  label: string;
  weight: number;
  confidence: number;
  rationale: string;
};

export function aggregateConfidenceScore<Key extends string>(items: ConfidenceItem<Key>[]) {
  const safeItems = items.map((item) => ({
    ...item,
    weight: Math.max(1, Math.round(item.weight)),
    confidence: Math.max(0, Math.min(1, item.confidence))
  }));
  const weightSum = safeItems.reduce((sum, item) => sum + item.weight, 0) || 1;
  const weightedConfidence = safeItems.reduce((sum, item) => sum + item.weight * item.confidence, 0);
  const confidence = weightedConfidence / weightSum;
  return {
    formula: "sum(w_i * c_i) / sum(w_i)",
    score: Number(confidence.toFixed(3)),
    score_percent: Math.floor(confidence * 100),
    weight_sum: weightSum,
    items: safeItems.map((item) => ({
      ...item,
      confidence: Number(item.confidence.toFixed(3)),
      contribution: Number(((item.weight * item.confidence) / weightSum).toFixed(3))
    }))
  };
}

export async function assignConfidenceItems<Key extends string>(
  context: Record<string, unknown>,
  fallbackItems: ConfidenceItem<Key>[],
  generate: (input: StructuredGenerationInput) => Promise<GeneratedJson | null> = generateStructuredJson
) {
  const prompt = [
    "You are scoring one marketplace listing for Sarthi.",
    "Assign confidence scores from 0.0 to 1.0 for each key.",
    "Use only the JSON context: item, time of year, seller locality, evidence priority, returns, reviews, price, proof, offer, and dispatch.",
    "Return JSON only with a confidences object containing the requested keys."
  ].join(" ");

  try {
    const generated = await generate({
      capability: "text",
      systemInstruction: prompt,
      userText: JSON.stringify({
        context,
        fallback_confidences: Object.fromEntries(fallbackItems.map((item) => [item.key, item.confidence]))
      }),
      schemaName: "sarthi_confidence_assignment",
      schemaDescription: "Confidence values for the requested marketplace evidence keys",
      schema: {
        type: "object",
        properties: {
          confidences: {
            type: "object",
            properties: Object.fromEntries(fallbackItems.map((item) => [item.key, { type: "number" }]))
          }
        },
        required: ["confidences"]
      },
      maxTokens: 400
    });
    const parsed = generated?.value.confidences;
    if (!generated || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        source: aiConfigured("text") ? "fallback_after_llm_error" as const : "deterministic_fallback" as const,
        prompt,
        items: fallbackItems
      };
    }
    const confidences = parsed as Record<string, unknown>;
    return {
      source: generated.provider,
      prompt,
      items: fallbackItems.map((item) => {
        const value = confidences[item.key];
        return {
          ...item,
          confidence: typeof value === "number"
            ? Math.max(0, Math.min(1, value))
            : item.confidence
        };
      })
    };
  } catch {
    return { source: "fallback_after_llm_error" as const, prompt, items: fallbackItems };
  }
}
