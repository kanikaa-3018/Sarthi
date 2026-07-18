import { geminiConfigured, generateGeminiJson, parseJsonObject } from "./gemini.js";

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
  fallbackItems: ConfidenceItem<Key>[]
) {
  const prompt = [
    "You are scoring one marketplace listing for Sarthi.",
    "Assign confidence scores from 0.0 to 1.0 for each key.",
    "Use only the JSON context: item, time of year, seller locality, evidence priority, returns, reviews, price, proof, offer, and dispatch.",
    "Return JSON only: {\"confidences\":{\"fit_match\":0.0,\"outcome_quality\":0.0,\"seller_trust\":0.0,\"review_signal\":0.0,\"rating_signal\":0.0,\"price_value\":0.0,\"fulfilment_reliability\":0.0,\"proof_coverage\":0.0,\"offer_truth\":0.0}}"
  ].join(" ");

  if (!geminiConfigured()) {
    return { source: "deterministic_fallback" as const, prompt, items: fallbackItems };
  }

  try {
    const text = await generateGeminiJson({
      systemInstruction: prompt,
      userText: JSON.stringify({
        context,
        fallback_confidences: Object.fromEntries(fallbackItems.map((item) => [item.key, item.confidence]))
      }),
      temperature: 0.1
    });
    const parsed = text ? parseConfidenceJson(text) : null;
    if (!parsed) throw new Error("Invalid confidence JSON");
    return {
      source: "gemini" as const,
      prompt,
      items: fallbackItems.map((item) => ({
        ...item,
        confidence: typeof parsed[item.key] === "number"
          ? Math.max(0, Math.min(1, parsed[item.key]))
          : item.confidence
      }))
    };
  } catch {
    return { source: "fallback_after_llm_error" as const, prompt, items: fallbackItems };
  }
}

function parseConfidenceJson(text: string): Record<string, number> | null {
  const parsed = parseJsonObject(text) as { confidences?: Record<string, number> } | null;
  return parsed?.confidences && typeof parsed.confidences === "object" ? parsed.confidences : null;
}
