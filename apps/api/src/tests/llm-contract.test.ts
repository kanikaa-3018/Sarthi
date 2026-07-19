import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { generateGroundedAgentAnswer } from "../services/agent.js";
import { parseJsonObject } from "../services/gemini.js";

describe("LLM contract helpers", () => {
  it("parses fenced JSON responses from model output", () => {
    const parsed = parseJsonObject("```json\n{\"title\":\"Safe answer\",\"reasons\":[\"grounded\"]}\n```");
    assert.deepEqual(parsed, { title: "Safe answer", reasons: ["grounded"] });
  });

  it("keeps the grounded answer shape when Gemini is disabled", async () => {
    const previousProvider = env.llmProvider;
    const previousKey = env.geminiApiKey;
    env.llmProvider = "disabled";
    env.geminiApiKey = "";

    try {
      const answer = await generateGroundedAgentAnswer({
        task: "admin_automation",
        query: "Which reviewer action is safe?",
        context: {
          source_health: "operational",
          policy: "human approval required"
        },
        fallback: {
          title: "Reviewer fallback",
          summary: "Use deterministic queue ranking while Gemini is unavailable.",
          reasons: ["The fallback is evidence-bound.", "Reviewer approval is still required."],
          caution: null
        }
      });

      assert.equal(answer.source, "deterministic_fallback");
      assert.equal(typeof answer.title, "string");
      assert.equal(typeof answer.summary, "string");
      assert.ok(Array.isArray(answer.reasons));
      assert.ok(answer.reasons.length > 0);
      assert.equal(answer.caution, null);
    } finally {
      env.llmProvider = previousProvider;
      env.geminiApiKey = previousKey;
    }
  });

  it("preserves the grounded answer shape from Bedrock", async () => {
    const answer = await generateGroundedAgentAnswer({
      task: "admin_automation",
      query: "Which reviewer action is safe?",
      context: { source_health: "operational" },
      fallback: {
        title: "Fallback",
        summary: "Fallback summary",
        reasons: ["Fallback reason"],
        caution: null
      }
    }, async () => ({
      provider: "bedrock",
      model: "apac.amazon.nova-micro-v1:0",
      value: {
        title: "Safe action",
        summary: "Review the evidence.",
        reasons: ["Evidence is current."],
        caution: null
      }
    }));

    assert.deepEqual(answer, {
      title: "Safe action",
      summary: "Review the evidence.",
      reasons: ["Evidence is current."],
      caution: null,
      source: "bedrock"
    });
  });
});
