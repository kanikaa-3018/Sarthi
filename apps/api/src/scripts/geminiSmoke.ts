import { geminiRuntimeStatus } from "../services/gemini.js";
import { generateGroundedAgentAnswer } from "../services/agent.js";

const status = geminiRuntimeStatus();
if (!status.enabled || !status.key_present) {
  console.error(JSON.stringify({
    ok: false,
    reason: "Gemini API key is not visible to the API process.",
    status
  }, null, 2));
  process.exit(1);
}

const answer = await generateGroundedAgentAnswer({
  task: "admin_automation",
  query: "Smoke test Gemini with a reviewer-safe answer.",
  context: {
    source_health: "operational",
    reviewer_policy: [
      "Use only provided evidence.",
      "Do not approve anything automatically.",
      "Return concise JSON."
    ]
  },
  fallback: {
    title: "Gemini smoke fallback",
    summary: "Fallback response should not be used when Gemini is configured.",
    reasons: ["The smoke test expects Gemini as provider."],
    caution: null
  }
});

const ok = answer.source === "gemini";
console.log(JSON.stringify({
  ok,
  provider: answer.source,
  active_model: geminiRuntimeStatus().active_model,
  title: answer.title,
  reasons: answer.reasons.length
}, null, 2));

if (!ok) process.exit(1);
