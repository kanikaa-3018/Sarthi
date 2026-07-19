import { aiRuntimeStatus, embedTextWithProvider, generateStructuredJson } from "../services/ai.js";

if (!process.argv.includes("--live")) {
  console.log(JSON.stringify({
    ok: false,
    live_call: false,
    reason: "No model was invoked. Re-run with --live to make three bounded probes (text, vision, embedding); text may try its secondary model.",
    status: aiRuntimeStatus()
  }, null, 2));
  process.exit(0);
}

const results: Record<string, unknown> = {};
let ok = true;

try {
  const text = await generateStructuredJson({
    capability: "text",
    systemInstruction: "Return the requested health result using only the supplied text.",
    userText: "Set status to ok and message to Bedrock text invocation succeeded.",
    schemaName: "sarthi_text_smoke",
    schemaDescription: "Minimal Bedrock text health result",
    schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        message: { type: "string" }
      },
      required: ["status", "message"]
    },
    maxTokens: 120
  });
  const passed = text?.provider === "bedrock" && text.value.status === "ok";
  ok = ok && passed;
  results.text = {
    ok: passed,
    provider: text?.provider ?? null,
    model: text?.model ?? null,
    usage: text?.usage ?? null
  };
} catch (error) {
  ok = false;
  results.text = { ok: false, error: publicSmokeError(error) };
}

try {
  const image = await fetchSmokeImage();
  const vision = await generateStructuredJson({
    capability: "vision",
    systemInstruction: "Inspect the supplied image and return a short, literal description. Do not infer identity or private traits.",
    userText: "Describe the image in five words or fewer.",
    userParts: [
      { text: "Describe this marketplace catalog image." },
      { image: { format: image.format, bytes: image.bytes } }
    ],
    schemaName: "sarthi_vision_smoke",
    schemaDescription: "Minimal Bedrock vision health result",
    schema: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"]
    },
    maxTokens: 120
  });
  const passed = vision?.provider === "bedrock" && typeof vision.value.description === "string";
  ok = ok && passed;
  results.vision = {
    ok: passed,
    provider: vision?.provider ?? null,
    model: vision?.model ?? null,
    usage: vision?.usage ?? null
  };
} catch (error) {
  ok = false;
  results.vision = { ok: false, error: publicSmokeError(error) };
}

try {
  const embedding = await embedTextWithProvider(
    "bedrock",
    "Sarthi marketplace trust evidence smoke test",
    "RETRIEVAL_QUERY"
  );
  const passed = embedding.provider === "bedrock" && embedding.values.length === 512;
  ok = ok && passed;
  results.embedding = {
    ok: passed,
    provider: embedding.provider,
    model: embedding.model,
    dimensions: embedding.values.length
  };
} catch (error) {
  ok = false;
  results.embedding = { ok: false, error: publicSmokeError(error) };
}

console.log(JSON.stringify({
  ok,
  live_call: true,
  region: aiRuntimeStatus().bedrock.region,
  results,
  status: aiRuntimeStatus()
}, null, 2));

if (!ok) process.exit(1);

async function fetchSmokeImage() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      "https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=160&q=55",
      { signal: controller.signal, headers: { Accept: "image/jpeg" } }
    );
    if (!response.ok) throw new Error(`Smoke image returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1_800_000) throw new Error("Smoke image size is invalid");
    return { format: "jpeg" as const, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

function publicSmokeError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown smoke failure";
  return `${error.name}: ${error.message}`.replace(/\s+/g, " ").slice(0, 240);
}
