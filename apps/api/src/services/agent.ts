import { aiConfigured, generateStructuredJson } from "./ai.js";
import type { GeneratedJson, StructuredGenerationInput } from "./aiTypes.js";

type AgentAnswer = {
  title: string;
  summary: string;
  reasons: string[];
  caution: string | null;
  source: "bedrock" | "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
};

type AgentInput = {
  query: string;
  task: "graph_chat" | "product_advice" | "return_assistant" | "admin_prescreen" | "admin_automation";
  context: Record<string, unknown>;
  fallback: Omit<AgentAnswer, "source">;
};

type StructuredGenerator = (input: StructuredGenerationInput) => Promise<GeneratedJson | null>;

const AGENT_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
    caution: { type: "string" }
  },
  required: ["title", "summary", "reasons"]
};

export async function generateGroundedAgentAnswer(
  input: AgentInput,
  generate: StructuredGenerator = generateStructuredJson
): Promise<AgentAnswer> {
  const configured = aiConfigured("text");
  try {
    const generated = await generate({
      capability: "text",
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
      schemaName: "sarthi_grounded_answer",
      schemaDescription: "A grounded Sarthi answer using only supplied evidence",
      schema: AGENT_ANSWER_SCHEMA,
      maxTokens: 700
    });
    if (!generated) {
      return { ...input.fallback, source: configured ? "fallback_after_llm_error" : "deterministic_fallback" };
    }
    const parsed = generated.value;
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : input.fallback.title,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary : input.fallback.summary,
      reasons: Array.isArray(parsed.reasons) && parsed.reasons.length
        ? parsed.reasons.map(String).filter(Boolean).slice(0, 4)
        : input.fallback.reasons,
      caution: parsed.caution === null
        ? null
        : typeof parsed.caution === "string"
          ? parsed.caution
          : input.fallback.caution,
      source: generated.provider
    };
  } catch {
    return { ...input.fallback, source: "fallback_after_llm_error" };
  }
}
