import { geminiConfigured, generateGeminiJson, parseJsonObject } from "./gemini.js";

type AgentAnswer = {
  title: string;
  summary: string;
  reasons: string[];
  caution: string | null;
  source: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
};

type AgentInput = {
  query: string;
  task: "graph_chat" | "product_advice" | "return_assistant" | "admin_prescreen" | "admin_automation";
  context: Record<string, unknown>;
  fallback: Omit<AgentAnswer, "source">;
};

export async function generateGroundedAgentAnswer(input: AgentInput): Promise<AgentAnswer> {
  if (!geminiConfigured()) {
    return { ...input.fallback, source: "deterministic_fallback" };
  }

  try {
    const text = await generateGeminiJson({
      systemInstruction: [
        "You are Sarthi, a grounded shopping trust advisor.",
        "Answer only from the provided JSON context.",
        "Do not invent seller data, product data, discounts, policies, or guarantees.",
        "Use simple language suitable for tier 2 and tier 3 commerce users.",
        "If evidence is missing, say what is missing and what action should happen next.",
        "Return JSON only with keys: title, summary, reasons, caution."
      ].join(" "),
      userText: JSON.stringify({
        task: input.task,
        buyer_question: input.query,
        evidence_context: input.context
      }),
      temperature: 0.2
    });
    const parsed = text ? parseJsonObject(text) : null;
    if (!parsed) return { ...input.fallback, source: "fallback_after_llm_error" };
    return {
      title: parsed.title || input.fallback.title,
      summary: parsed.summary || input.fallback.summary,
      reasons: Array.isArray(parsed.reasons) && parsed.reasons.length ? parsed.reasons.slice(0, 4) : input.fallback.reasons,
      caution: typeof parsed.caution === "string" ? parsed.caution : input.fallback.caution,
      source: "gemini"
    };
  } catch {
    return { ...input.fallback, source: "fallback_after_llm_error" };
  }
}
