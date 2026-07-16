import { env } from "../config/env.js";

type AgentAnswer = {
  title: string;
  summary: string;
  reasons: string[];
  caution: string | null;
  source: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
};

type AgentInput = {
  query: string;
  task: "graph_chat" | "product_advice";
  context: Record<string, unknown>;
  fallback: Omit<AgentAnswer, "source">;
};

export async function generateGroundedAgentAnswer(input: AgentInput): Promise<AgentAnswer> {
  if (env.llmProvider !== "gemini" || !env.geminiApiKey) {
    return { ...input.fallback, source: "deterministic_fallback" };
  }

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.geminiApiKey
      },
      body: JSON.stringify({
        model: env.llmModel,
        system_instruction: [
          "You are Sarthi, a grounded shopping trust advisor.",
          "Answer only from the provided JSON context.",
          "Do not invent seller data, product data, discounts, policies, or guarantees.",
          "Use simple language suitable for tier 2 and tier 3 commerce users.",
          "If evidence is missing, say what is missing and what action should happen next.",
          "Return JSON only with keys: title, summary, reasons, caution."
        ].join(" "),
        input: JSON.stringify({
          task: input.task,
          buyer_question: input.query,
          evidence_context: input.context
        }),
        generation_config: {
          temperature: 0.2,
          thinking_level: "low"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini ${response.status}`);
    }

    const payload = await response.json() as any;
    const text = payload.output_text
      ?? payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join("")
      ?? "";
    const parsed = parseAgentJson(text);
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

function parseAgentJson(text: string) {
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
