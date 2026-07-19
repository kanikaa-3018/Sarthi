# Bedrock Primary With Gemini Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Amazon Bedrock the primary AI runtime for Sarthi while retaining Gemini and all deterministic fallbacks, then prove the configured text, vision, and embedding routes with bounded live calls in `ap-south-1`.

**Architecture:** Add a provider-neutral structured-generation and embedding gateway over a Bedrock adapter and the existing Gemini adapter. Route text to APAC Nova Micro with Nova Lite as a Bedrock secondary, route vision to APAC Nova Lite, isolate Titan 512-dimensional vectors from Gemini 768-dimensional vectors, and preserve all existing public response shapes and fallback gates.

**Tech Stack:** TypeScript 5, Node.js 22 test runner, Fastify 5, MongoDB 6, Zod 3, AWS SDK for JavaScript v3 Bedrock Runtime client, Gemini REST API.

---

## File Map

- Create `apps/api/src/services/aiTypes.ts`: provider-neutral content, schemas, result metadata, capabilities, and adapter interfaces.
- Create `apps/api/src/services/bedrock.ts`: Bedrock Converse/InvokeModel mapping, circuit state, error classification, and runtime status.
- Create `apps/api/src/services/ai.ts`: ordered provider orchestration, Gemini adaptation, fallback decisions, and aggregate health.
- Modify `apps/api/src/services/gemini.ts`: decouple eligibility from primary-provider selection, accept provider-neutral image parts, and expose sanitized circuit state.
- Modify `apps/api/src/config/env.ts`: parse new provider/model/vector settings while retaining legacy Gemini settings.
- Create `apps/api/src/tests/bedrock.test.ts`: request mapping, structured extraction, embedding dimensions, safety, timeout, and sanitized errors.
- Create `apps/api/src/tests/ai-failover.test.ts`: provider order, secondary model, Gemini fallback, deterministic fallback, and circuit independence.
- Modify `apps/api/src/tests/llm-contract.test.ts`: grounded answer compatibility through the new gateway.
- Modify `apps/api/src/services/agent.ts`: use structured AI gateway and report the actual provider.
- Modify `apps/api/src/services/confidenceScoring.ts`: use a forced confidence schema and preserve bounded fallback behavior.
- Modify `apps/api/src/services/sellerOperations.ts`: use a seller-coach schema and preserve current normalized output.
- Modify `apps/api/src/services/similarListings.ts`: build neutral image parts, use the vision route, and keep existing response fields and legacy source literals readable.
- Modify `apps/api/src/services/vectorSearch.ts`: use independent Bedrock/Gemini vector namespaces and ordered embedding fallback.
- Modify `apps/api/src/scripts/createVectorIndex.ts`: create a selected provider's Atlas vector index.
- Modify `apps/api/src/services/llmCache.ts`: fingerprint provider order and all active model candidates.
- Modify `apps/api/src/routes/decision.ts`: use provider-neutral cache eligibility and persist either generated provider.
- Modify `apps/api/src/services/adminOperations.ts`: persist trusted Bedrock or Gemini generated output.
- Modify `apps/api/src/routes/system.ts`: add `ai` and `bedrock` health while retaining `gemini`.
- Modify `apps/api/src/routes/admin.ts`: report the actual failover chain while retaining the existing Gemini object.
- Create `apps/api/src/scripts/aiSmoke.ts`: explicit bounded live text, vision, and embedding probes.
- Modify `apps/api/src/scripts/geminiSmoke.ts`: retain the legacy Gemini-only smoke command.
- Create `scripts/setup-bedrock-env.ps1`: write only non-secret local Bedrock settings and preserve existing `.env` values.
- Modify `apps/api/package.json`, `package.json`, `apps/api/package-lock.json`: add the Bedrock SDK and scripts.
- Modify `.env.example`, `README.md`: document local profile, production role, model IDs, vector migration, Free Tier behavior, and smoke commands.

### Task 1: Configuration and Provider-Neutral Contracts

**Files:**
- Create: `apps/api/src/tests/ai-config.test.ts`
- Create: `apps/api/src/services/aiTypes.ts`
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Write failing configuration tests**

Test the wished-for parser without mutating process-global module initialization:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAiConfig } from "../config/env.js";

describe("AI configuration", () => {
  it("defaults new configuration to Bedrock then Gemini", () => {
    const config = parseAiConfig({});
    assert.deepEqual(config.providerOrder, ["bedrock", "gemini"]);
    assert.deepEqual(config.bedrockTextModels, [
      "apac.amazon.nova-micro-v1:0",
      "apac.amazon.nova-lite-v1:0"
    ]);
    assert.equal(config.bedrockEmbeddingDimensions, 512);
  });

  it("preserves legacy Gemini-only provider configuration", () => {
    const config = parseAiConfig({ LLM_PROVIDER: "gemini", LLM_MODEL: "legacy-model" });
    assert.deepEqual(config.providerOrder, ["gemini"]);
    assert.equal(config.geminiModel, "legacy-model");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix apps/api test -- --test-name-pattern="AI configuration"`

Expected: FAIL because `parseAiConfig` does not exist.

- [ ] **Step 3: Add the minimal contracts and parser**

Define these stable interfaces in `aiTypes.ts`:

```typescript
export type AiProvider = "bedrock" | "gemini";
export type AiCapability = "text" | "vision" | "embedding";
export type AiImageFormat = "jpeg" | "png" | "gif" | "webp";
export type AiUserPart = { text: string } | {
  image: { format: AiImageFormat; bytes: Uint8Array };
};
export type JsonObject = Record<string, unknown>;
export type StructuredGenerationInput = {
  capability: "text" | "vision";
  systemInstruction: string;
  userText: string;
  userParts?: AiUserPart[];
  schemaName: string;
  schemaDescription: string;
  schema: JsonObject;
  maxTokens: number;
};
export type GeneratedJson = {
  value: JsonObject;
  provider: AiProvider;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};
export type EmbeddedText = {
  values: number[];
  provider: AiProvider;
  model: string;
  dimensions: number;
};
export type AiProviderErrorKind = "availability" | "invalid_output" | "safety";
export class AiProviderError extends Error {
  constructor(public readonly kind: AiProviderErrorKind, message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
```

Export `parseAiConfig(source: NodeJS.ProcessEnv | Record<string, string | undefined>)`, then spread its result into `env`. `AI_PROVIDER_ORDER` is authoritative. Only when that variable is absent should a supplied legacy `LLM_PROVIDER` select Gemini-only behavior.

- [ ] **Step 4: Run configuration tests and the existing suite**

Run: `npm --prefix apps/api test -- --test-name-pattern="AI configuration"`

Expected: PASS.

Run: `npm --prefix apps/api run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/tests/ai-config.test.ts apps/api/src/services/aiTypes.ts apps/api/src/config/env.ts
git commit -m "feat: add provider-neutral AI configuration"
```

### Task 2: Bedrock Structured Generation Adapter

**Files:**
- Create: `apps/api/src/tests/bedrock.test.ts`
- Create: `apps/api/src/services/bedrock.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/package-lock.json`

- [ ] **Step 1: Install the bare Bedrock Runtime client**

Run: `npm --prefix apps/api install @aws-sdk/client-bedrock-runtime`

Expected: package and lockfile contain `@aws-sdk/client-bedrock-runtime`; no unrelated dependency changes.

- [ ] **Step 2: Write a failing Converse request test**

Inject a client with a `send(command, options)` method and capture `command.input`:

```typescript
it("forces the named Nova output tool and sets explicit limits", async () => {
  const calls: any[] = [];
  const provider = createBedrockProvider({
    client: { send: async (command: any, options: any) => {
      calls.push({ input: command.input, options });
      return {
        stopReason: "tool_use",
        output: { message: { content: [{ toolUse: { name: "answer", input: { title: "Grounded" } } }] } },
        usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }
      };
    } } as any,
    textModels: ["apac.amazon.nova-micro-v1:0"],
    visionModels: ["apac.amazon.nova-lite-v1:0"],
    embeddingModel: "amazon.titan-embed-text-v2:0",
    embeddingDimensions: 512,
    timeoutMs: 8000
  });

  const result = await provider.generateStructured({
    capability: "text",
    systemInstruction: "Use evidence only.",
    userText: "Answer",
    schemaName: "answer",
    schemaDescription: "Grounded answer",
    schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    maxTokens: 300
  });

  assert.equal(result?.value.title, "Grounded");
  assert.equal(calls[0].input.inferenceConfig.maxTokens, 300);
  assert.equal(calls[0].input.inferenceConfig.temperature, 0);
  assert.deepEqual(calls[0].input.toolConfig.toolChoice, { tool: { name: "answer" } });
  assert.ok(calls[0].options.abortSignal);
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm --prefix apps/api test -- --test-name-pattern="forces the named Nova output tool"`

Expected: FAIL because `createBedrockProvider` does not exist.

- [ ] **Step 4: Implement minimal Converse mapping**

Use `BedrockRuntimeClient({ region, maxAttempts: 5, retryMode: "adaptive" })`, `ConverseCommand`, and a per-request `AbortController`. Convert neutral image parts to SDK image blocks with `source.bytes`. Accept only the named `toolUse` object. Store only sanitized error text and token counts in runtime state.

- [ ] **Step 5: Add RED/GREEN tests for image mapping, model candidates, safety, and errors**

Add one test at a time and run it before implementation:

```typescript
it("maps neutral PNG bytes to a Converse image block", async () => {
  let request: any;
  const provider = createProvider({ send: async (command: any) => {
    request = command.input;
    return { stopReason: "tool_use", output: { message: { content: [
      { toolUse: { name: "answer", input: { title: "Image" } } }
    ] } } };
  } } as any);
  await provider.generateStructured({
    ...structuredInput("vision"),
    userParts: [{ image: { format: "png", bytes: new Uint8Array([137, 80, 78, 71]) } }]
  });
  const block = request.messages[0].content[0].image;
  assert.equal(block.format, "png");
  assert.deepEqual(block.source.bytes, new Uint8Array([137, 80, 78, 71]));
});

it("tries Nova Lite after Nova Micro availability failure", async () => {
  const modelIds: string[] = [];
  const provider = createProvider({ send: async (command: any) => {
    modelIds.push(command.input.modelId);
    if (modelIds.length === 1) {
      throw Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    }
    return { stopReason: "tool_use", output: { message: { content: [
      { toolUse: { name: "answer", input: { title: "Fallback" } } }
    ] } } };
  } } as any);
  const result = await provider.generateStructured(structuredInput("text"));
  assert.equal(result.model, "apac.amazon.nova-lite-v1:0");
  assert.deepEqual(modelIds, [
    "apac.amazon.nova-micro-v1:0",
    "apac.amazon.nova-lite-v1:0"
  ]);
});

it("marks content_filtered as a terminal safety result", async () => {
  const provider = createProvider({ send: async () => ({ stopReason: "content_filtered" }) } as any);
  await assert.rejects(
    () => provider.generateStructured(structuredInput("text")),
    (error: any) => error?.name === "AiProviderError" && error?.kind === "safety"
  );
});

it("returns a sanitized error without prompt or credentials", async () => {
  const secretPrompt = "private-prompt-value";
  const provider = createProvider({ send: async () => {
    throw new Error(`failure ${secretPrompt}`);
  } } as any);
  await assert.rejects(() => provider.generateStructured({
    ...structuredInput("text"), userText: secretPrompt
  }));
  const status = provider.status();
  assert.equal(JSON.stringify(status).includes(secretPrompt), false);
  assert.equal("credentials" in status, false);
});
```

Define these ordinary fixtures at the top of the test file; they do not add test-only production APIs:

```typescript
const structuredInput = (capability: "text" | "vision"): StructuredGenerationInput => ({
  capability,
  systemInstruction: "Use evidence only.",
  userText: "Answer",
  schemaName: "answer",
  schemaDescription: "Grounded answer",
  schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
  maxTokens: 300
});

const createProvider = (client: { send: (command: unknown, options?: unknown) => Promise<any> }) =>
  createBedrockProvider({
    client: client as any,
    textModels: ["apac.amazon.nova-micro-v1:0", "apac.amazon.nova-lite-v1:0"],
    visionModels: ["apac.amazon.nova-lite-v1:0"],
    embeddingModel: "amazon.titan-embed-text-v2:0",
    embeddingDimensions: 512,
    timeoutMs: 8000
  });
```

Run after each addition: `npm --prefix apps/api test -- --test-name-pattern="<exact test name>"`

Expected: RED before the behavior, then PASS after minimal implementation.

- [ ] **Step 6: Run adapter tests and typecheck**

Run: `npm --prefix apps/api test -- --test-name-pattern="Bedrock"`

Expected: all Bedrock tests PASS.

Run: `npm --prefix apps/api run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/package.json apps/api/package-lock.json apps/api/src/services/bedrock.ts apps/api/src/tests/bedrock.test.ts
git commit -m "feat: add bounded Bedrock runtime adapter"
```

### Task 3: Titan Embedding Adapter

**Files:**
- Modify: `apps/api/src/tests/bedrock.test.ts`
- Modify: `apps/api/src/services/bedrock.ts`

- [ ] **Step 1: Write a failing Titan request test**

```typescript
it("requests and validates a 512-dimensional Titan embedding", async () => {
  const values = Array.from({ length: 512 }, (_, index) => index / 512);
  const client = { send: async (command: any) => {
    assert.equal(command.input.modelId, "amazon.titan-embed-text-v2:0");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(command.input.body)), {
      inputText: "seller proof",
      dimensions: 512,
      normalize: true,
      embeddingTypes: ["float"]
    });
    return { body: new TextEncoder().encode(JSON.stringify({ embedding: values })) };
  } };
  const result = await createProvider(client).embedText("seller proof", "RETRIEVAL_QUERY");
  assert.equal(result?.values.length, 512);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix apps/api test -- --test-name-pattern="512-dimensional Titan"`

Expected: FAIL because embedding is not implemented.

- [ ] **Step 3: Implement InvokeModel and exact validation**

Use `InvokeModelCommand` with `contentType` and `accept` set to `application/json`. Reject any response that is not exactly the configured number of finite numeric values.

- [ ] **Step 4: Add a failing wrong-dimension test, then make it pass**

```typescript
it("rejects a Titan vector with the wrong dimensions", async () => {
  const provider = createProvider({ send: async () => ({
    body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1] }))
  }) } as any);
  await assert.rejects(() => provider.embedText("x", "RETRIEVAL_QUERY"), /512 dimensions/);
});
```

Run: `npm --prefix apps/api test -- --test-name-pattern="Titan"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/services/bedrock.ts apps/api/src/tests/bedrock.test.ts
git commit -m "feat: add Titan embedding support"
```

### Task 4: Provider Failover Gateway and Gemini Compatibility

**Files:**
- Create: `apps/api/src/tests/ai-failover.test.ts`
- Create: `apps/api/src/services/ai.ts`
- Modify: `apps/api/src/services/gemini.ts`

- [ ] **Step 1: Write a failing Bedrock-first chain test**

```typescript
it("returns Bedrock output without invoking Gemini", async () => {
  const input: StructuredGenerationInput = {
    capability: "text",
    systemInstruction: "Use evidence only.",
    userText: "Answer",
    schemaName: "answer",
    schemaDescription: "Grounded answer",
    schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    maxTokens: 300
  };
  const generated = (provider: "bedrock" | "gemini") => ({
    provider,
    model: `${provider}-model`,
    value: { title: provider }
  });
  const adapter = (provider: "bedrock" | "gemini", generate: () => Promise<any>) => ({
    provider,
    configured: () => true,
    generateStructured: generate
  });
  let geminiCalls = 0;
  const result = await runGenerationChain(input, [
    adapter("bedrock", async () => generated("bedrock")),
    adapter("gemini", async () => { geminiCalls += 1; return generated("gemini"); })
  ]);
  assert.equal(result?.provider, "bedrock");
  assert.equal(geminiCalls, 0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix apps/api test -- --test-name-pattern="without invoking Gemini"`

Expected: FAIL because the gateway does not exist.

- [ ] **Step 3: Implement the minimal ordered chain**

Expose `runGenerationChain(input, adapters)` for pure tests and `generateStructuredJson(input)` for production. Adapt the current Gemini text response into a parsed object with provider/model metadata. Change `geminiConfigured()` to require the key and provider eligibility, not `env.llmProvider === "gemini"`.

- [ ] **Step 4: Add failover tests one at a time**

```typescript
it("uses Gemini after an eligible Bedrock error", async () => {
  const result = await runGenerationChain(input, [
    adapter("bedrock", async () => { throw new AiProviderError("availability", "unavailable"); }),
    adapter("gemini", async () => generated("gemini"))
  ]);
  assert.equal(result?.provider, "gemini");
});

it("uses Gemini after Bedrock returns no valid object", async () => {
  const result = await runGenerationChain(input, [
    adapter("bedrock", async () => { throw new AiProviderError("invalid_output", "invalid"); }),
    adapter("gemini", async () => generated("gemini"))
  ]);
  assert.equal(result?.provider, "gemini");
});

it("does not use Gemini after a Bedrock safety stop", async () => {
  let geminiCalls = 0;
  const result = await runGenerationChain(input, [
    adapter("bedrock", async () => { throw new AiProviderError("safety", "filtered"); }),
    adapter("gemini", async () => { geminiCalls += 1; return generated("gemini"); })
  ]);
  assert.equal(result, null);
  assert.equal(geminiCalls, 0);
});

it("keeps Bedrock and Gemini circuit state independent", async () => {
  const bedrock = circuitAdapter("bedrock", async () => {
    throw new AiProviderError("availability", "down");
  });
  const gemini = circuitAdapter("gemini", async () => generated("gemini"));
  const result = await runGenerationChain(input, [bedrock, gemini]);
  assert.equal(bedrock.status().circuit_open, true);
  assert.equal(gemini.status().circuit_open, false);
  assert.equal(result?.provider, "gemini");
});

it("returns null when no provider is configured", async () => {
  const result = await runGenerationChain(input, [
    { ...adapter("bedrock", async () => generated("bedrock")), configured: () => false },
    { ...adapter("gemini", async () => generated("gemini")), configured: () => false }
  ]);
  assert.equal(result, null);
});
```

Add `circuitAdapter` as a reusable production wrapper in `ai.ts`; its state belongs to runtime behavior, not to tests. It has this interface and the test imports the real wrapper:

```typescript
export function circuitAdapter(adapter: GenerationAdapter, cooldownMs = 60_000): GenerationAdapter & {
  status(): { circuit_open: boolean; last_error: string | null };
} {
  let disabledUntil = 0;
  let lastError: string | null = null;
  return {
    ...adapter,
    configured: (capability) => Date.now() >= disabledUntil && adapter.configured(capability),
    async generateStructured(input) {
      try {
        return await adapter.generateStructured(input);
      } catch (error) {
        if (error instanceof AiProviderError && error.kind !== "safety") {
          disabledUntil = Date.now() + cooldownMs;
          lastError = error.message.slice(0, 180);
        }
        throw error;
      }
    },
    status: () => ({ circuit_open: Date.now() < disabledUntil, last_error: lastError })
  };
}
```

Run each named test before and after its minimal implementation.

- [ ] **Step 5: Run gateway and legacy parsing tests**

Run: `npm --prefix apps/api test -- --test-name-pattern="AI failover|LLM contract helpers"`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/services/ai.ts apps/api/src/services/gemini.ts apps/api/src/tests/ai-failover.test.ts
git commit -m "feat: add Bedrock first AI failover gateway"
```

### Task 5: Migrate Structured Generation Callers

**Files:**
- Modify: `apps/api/src/tests/llm-contract.test.ts`
- Create: `apps/api/src/tests/ai-callers.test.ts`
- Modify: `apps/api/src/services/agent.ts`
- Modify: `apps/api/src/services/confidenceScoring.ts`
- Modify: `apps/api/src/services/sellerOperations.ts`
- Modify: `apps/api/src/services/adminOperations.ts`
- Modify: `apps/api/src/services/domain.ts`

- [ ] **Step 1: Write a failing grounded-answer Bedrock source test**

Use dependency injection through an optional `generate` argument or a small exported pure normalizer, not a test-only global setter:

```typescript
it("preserves the grounded answer shape from Bedrock", async () => {
  const answer = await generateGroundedAgentAnswer(input, async () => ({
    provider: "bedrock",
    model: "apac.amazon.nova-micro-v1:0",
    value: { title: "Safe", summary: "Grounded", reasons: ["evidence"], caution: null }
  }));
  assert.deepEqual(answer, {
    title: "Safe", summary: "Grounded", reasons: ["evidence"], caution: null, source: "bedrock"
  });
});
```

- [ ] **Step 2: Run and verify RED, then migrate `agent.ts`**

Run: `npm --prefix apps/api test -- --test-name-pattern="grounded answer shape from Bedrock"`

Expected: RED before migration, PASS after `generateStructuredJson` and an explicit answer schema are used.

- [ ] **Step 3: Add RED/GREEN tests for confidence scoring**

Assert that unknown keys are ignored, values are clamped, fallback items are retained, and the source becomes `bedrock` or `gemini` without changing the aggregate score formula.

Run: `npm --prefix apps/api test -- --test-name-pattern="confidence.*AI|weighted confidence"`

Expected: PASS.

- [ ] **Step 4: Add RED/GREEN tests for seller coaching**

Extract and export a seller-coach normalizer if necessary. Assert bounded lists, known product IDs only, fallback card preservation, and actual provider metadata.

Run: `npm --prefix apps/api test -- --test-name-pattern="seller coach"`

Expected: PASS.

- [ ] **Step 5: Update persistence gates and prompt version labels**

Add `isGeneratedProvider(value): value is "bedrock" | "gemini"` and replace literal Gemini-only persistence gates. Preserve stored literal provider values. Rename new prompt versions to provider-neutral names while leaving old stored strings readable.

- [ ] **Step 6: Run all API tests and typecheck**

Run: `npm --prefix apps/api run test`

Expected: all tests PASS.

Run: `npm --prefix apps/api run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/tests/llm-contract.test.ts apps/api/src/tests/ai-callers.test.ts apps/api/src/services/agent.ts apps/api/src/services/confidenceScoring.ts apps/api/src/services/sellerOperations.ts apps/api/src/services/adminOperations.ts apps/api/src/services/domain.ts
git commit -m "feat: route structured AI tasks through Bedrock"
```

### Task 6: Migrate Visual Similarity Without Changing Public Shapes

**Files:**
- Create: `apps/api/src/tests/similar-listings-ai.test.ts`
- Modify: `apps/api/src/services/similarListings.ts`
- Modify: `apps/api/src/services/gemini.ts`

- [ ] **Step 1: Write a failing neutral-image conversion test**

```typescript
it("keeps supported image bytes provider neutral", async () => {
  const parts = await buildAiImagePartsForTest([
    response("image/png", new Uint8Array([137, 80, 78, 71]))
  ]);
  assert.deepEqual(parts[0], {
    image: { format: "png", bytes: new Uint8Array([137, 80, 78, 71]) }
  });
});
```

- [ ] **Step 2: Run and verify RED, then implement neutral parts**

Run: `npm --prefix apps/api test -- --test-name-pattern="provider neutral"`

Expected: RED before implementation, PASS after supported MIME mapping and existing byte limits are preserved.

- [ ] **Step 3: Write a failing Bedrock visual-rerank normalization test**

Assert that known product IDs, confidence clamping, match enums, 52/48 blending, different-item cap, cache write, and all existing response fields remain identical except for additive Bedrock source values.

- [ ] **Step 4: Migrate the reranker through `generateStructuredJson`**

Use capability `vision`, schema name `listing_matches`, and a schema with `matches[]`. Generalize internal names from `GeminiMatch` to `AiMatch`, while retaining legacy public source literals in their unions.

- [ ] **Step 5: Run visual tests and typecheck**

Run: `npm --prefix apps/api test -- --test-name-pattern="visual|similar listing"`

Expected: PASS.

Run: `npm --prefix apps/api run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/tests/similar-listings-ai.test.ts apps/api/src/services/similarListings.ts apps/api/src/services/gemini.ts
git commit -m "feat: use Bedrock for visual listing resolution"
```

### Task 7: Provider-Isolated Vector Search

**Files:**
- Create: `apps/api/src/tests/vector-provider-fallback.test.ts`
- Modify: `apps/api/src/services/vectorSearch.ts`
- Modify: `apps/api/src/scripts/createVectorIndex.ts`

- [ ] **Step 1: Write a failing namespace test**

```typescript
it("never queries Titan and Gemini vectors from the same namespace", () => {
  assert.deepEqual(vectorNamespace("bedrock"), {
    provider: "bedrock",
    collection: "evidence_embeddings_bedrock",
    index: "sarthi_evidence_vector_bedrock_512",
    model: "amazon.titan-embed-text-v2:0",
    dimensions: 512
  });
  assert.equal(vectorNamespace("gemini").dimensions, 768);
  assert.notEqual(vectorNamespace("bedrock").collection, vectorNamespace("gemini").collection);
});
```

- [ ] **Step 2: Run and verify RED, then add namespace selection**

Run: `npm --prefix apps/api test -- --test-name-pattern="same namespace"`

Expected: RED before implementation, PASS after provider-specific namespace configuration exists.

- [ ] **Step 3: Add fallback behavior tests one at a time**

```typescript
it("uses Titan results before Gemini", async () => {
  let geminiCalls = 0;
  const result = await firstSuccessfulVectorResult([
    async () => ({ source: "local_embedding_fallback", query: "q", results: [evidence("titan")] }),
    async () => { geminiCalls += 1; return null; }
  ], () => lexical("q"));
  assert.equal(result.results[0].doc_id, "titan");
  assert.equal(geminiCalls, 0);
});

it("uses the legacy Gemini namespace after Titan failure", async () => {
  const attempted: string[] = [];
  const result = await firstSuccessfulVectorResult([
    async () => { attempted.push("bedrock"); throw new Error("Titan unavailable"); },
    async () => { attempted.push("gemini"); return {
      source: "local_embedding_fallback", query: "q", results: [evidence("gemini")]
    }; }
  ], () => lexical("q"));
  assert.deepEqual(attempted, ["bedrock", "gemini"]);
  assert.equal(result.results[0].doc_id, "gemini");
  assert.equal(vectorNamespace("gemini").dimensions, 768);
});

it("uses lexical retrieval after both embedding providers fail", async () => {
  const result = await firstSuccessfulVectorResult([
    async () => { throw new Error("Titan unavailable"); },
    async () => { throw new Error("Gemini unavailable"); }
  ], () => lexical("q"));
  assert.equal(result.source, "lexical_fallback_after_vector_error");
});

it("rejects stored vectors whose dimensions do not exactly match", () => {
  assert.equal(validEmbedding([0.1], 512), false);
  assert.equal(validEmbedding(Array.from({ length: 512 }, () => 0.1), 512), true);
});
```

Use these complete fixtures:

```typescript
const evidence = (docId: string) => ({
  doc_id: docId,
  node_id: `node:${docId}`,
  type: "proof",
  title: docId,
  text: `${docId} evidence`,
  fact_ids: [`fact:${docId}`],
  score: 0.9
});

const lexical = (query: string): SemanticEvidenceResult => ({
  source: "lexical_fallback_after_vector_error",
  query,
  results: [evidence("lexical")]
});
```

Export `firstSuccessfulVectorResult` and `validEmbedding` as pure production helpers used by `semanticEvidenceSearch`, so these tests exercise the real fallback and dimension rules. `firstSuccessfulVectorResult` catches a namespace failure, accepts only a non-empty result, and otherwise returns the supplied lexical function. `validEmbedding(values, dimensions)` returns true only for an array of exactly `dimensions` finite numbers.

Refactor `semanticEvidenceSearch` into a provider-namespace loop only after each test has failed for the expected reason.

- [ ] **Step 4: Make index creation provider-selectable**

Parse `--provider bedrock|gemini`, default to the first configured embedding provider, and use that namespace's collection, index, and dimensions. Keep unsupported local MongoDB behavior non-blocking.

- [ ] **Step 5: Run vector tests and full API suite**

Run: `npm --prefix apps/api test -- --test-name-pattern="vector|namespace|embedding"`

Expected: PASS.

Run: `npm --prefix apps/api run test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/tests/vector-provider-fallback.test.ts apps/api/src/services/vectorSearch.ts apps/api/src/scripts/createVectorIndex.ts
git commit -m "feat: isolate Bedrock and Gemini vector search"
```

### Task 8: Cache, Health, Setup, and Live Smoke Tooling

**Files:**
- Create: `apps/api/src/tests/ai-health-cache.test.ts`
- Modify: `apps/api/src/services/llmCache.ts`
- Modify: `apps/api/src/routes/decision.ts`
- Modify: `apps/api/src/routes/system.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/scripts/aiSmoke.ts`
- Create: `scripts/setup-bedrock-env.ps1`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Write failing cache fingerprint tests**

```typescript
it("changes the cache key when provider order or a Bedrock model changes", () => {
  const first = aiCacheFingerprint(config({ providerOrder: ["bedrock", "gemini"] }));
  const second = aiCacheFingerprint(config({ providerOrder: ["gemini", "bedrock"] }));
  assert.notEqual(first, second);
});
```

- [ ] **Step 2: Run and verify RED, then implement fingerprinting**

Run: `npm --prefix apps/api test -- --test-name-pattern="cache key when provider order"`

Expected: RED before implementation, PASS after all provider/model candidates and prompt version are included.

- [ ] **Step 3: Write failing additive health tests**

Assert that runtime health contains `ai`, `bedrock`, and the legacy `gemini` object, that no key value or credential appears, and that the admin route describes Bedrock, Gemini, then deterministic behavior.

- [ ] **Step 4: Update health and cache gates**

Use `aiConfigured()`, `isGeneratedProvider()`, and the aggregate runtime status. A cached generated response remains eligible when its cache key matches the current configuration fingerprint.

- [ ] **Step 5: Add an explicit live smoke script**

Require `--live`:

```typescript
if (!process.argv.includes("--live")) {
  console.error("Live Bedrock inference is disabled. Re-run with --live.");
  process.exitCode = 2;
} else {
  await runTextProbe();
  await runVisionProbe();
  await runEmbeddingProbe();
}
```

Use a tiny embedded PNG, `maxTokens` no greater than 120 for probes, and sanitized output. Add `ai:smoke` scripts at API and root levels. Keep `gemini:smoke` unchanged.

- [ ] **Step 6: Add non-secret setup and documentation**

The PowerShell script writes provider order, region, profile, model IDs, dimensions, and vector namespace only. It must never request, print, or overwrite AWS keys or `GEMINI_API_KEY`. Document that production should omit `AWS_PROFILE` and use an IAM role.

- [ ] **Step 7: Run health/cache tests and build**

Run: `npm --prefix apps/api test -- --test-name-pattern="health|cache"`

Expected: PASS.

Run: `npm --prefix apps/api run build`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/api/src/tests/ai-health-cache.test.ts apps/api/src/services/llmCache.ts apps/api/src/routes/decision.ts apps/api/src/routes/system.ts apps/api/src/routes/admin.ts apps/api/src/scripts/aiSmoke.ts scripts/setup-bedrock-env.ps1 apps/api/package.json apps/api/package-lock.json package.json .env.example README.md
git commit -m "feat: add AI health setup and smoke verification"
```

### Task 9: Offline End-to-End Verification

**Files:**
- Modify only files implicated by a failing test, with a new regression test first.

- [ ] **Step 1: Run formatting and repository status checks**

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: only intentional implementation files if the last task has not yet committed.

- [ ] **Step 2: Run the complete offline verification**

Run: `npm run build:test`

Expected: API build passes, all old and new API tests pass, and the frontend production build passes.

- [ ] **Step 3: Verify normal tests made no live calls**

Confirm tests use injected clients and that `aiSmoke.ts` requires `--live`. Search:

Run: `rg -n "ai:smoke|--live|BedrockRuntimeClient" apps/api/src/tests apps/api/src/scripts apps/api/package.json`

Expected: no test directly constructs a live Bedrock client.

- [ ] **Step 4: Commit any regression fixes**

For every failure, first add or isolate the failing test, observe RED, apply the minimal fix, observe GREEN, then commit with a focused message.

### Task 10: Bounded Live Access Verification

**Files:**
- Modify: local ignored `apps/api/.env` only through `scripts/setup-bedrock-env.ps1` if needed.
- Modify tracked defaults only when observed access requires a different already-discovered model.

- [ ] **Step 1: Refresh browser credentials only if required**

Run first: `aws sts get-caller-identity --profile agent-toolkit --region ap-south-1`

Expected: success. If credentials expired, run the existing browser login for profile `agent-toolkit`; do not create access keys.

- [ ] **Step 2: Apply non-secret local Bedrock settings**

Run: `powershell -ExecutionPolicy Bypass -File scripts/setup-bedrock-env.ps1 -Profile agent-toolkit -Region ap-south-1`

Expected: settings updated without printing or changing secrets.

- [ ] **Step 3: Run the explicit live smoke command once**

Run: `npm run ai:smoke -- --live`

Expected:

- Text: Nova Micro succeeds, or Nova Lite succeeds and is reported as the selected Bedrock text model.
- Vision: Nova Lite succeeds, otherwise Gemini eligibility is reported and deterministic visual fallback remains available.
- Embedding: Titan V2 returns exactly 512 finite values, otherwise Gemini embedding eligibility and lexical fallback are reported.

- [ ] **Step 4: Adjust only from observed access results**

If a listed model rejects invocation, remove it from the local candidate order or move the verified working candidate first. Do not add an unverified or more expensive model. Add a regression test when code behavior, rather than account access, caused the failure.

- [ ] **Step 5: Re-run the complete offline verification**

Run: `npm run build:test`

Expected: PASS after live configuration changes.

### Task 11: Final Compatibility and Security Review

**Files:**
- Review all branch changes.

- [ ] **Step 1: Inspect the complete branch diff**

Run: `git diff main...HEAD --stat`

Run: `git diff main...HEAD -- apps/api/src .env.example README.md scripts package.json apps/api/package.json`

Expected: no frontend feature changes, no deleted deterministic fallbacks, no unrelated files.

- [ ] **Step 2: Scan for credentials and dangerous IAM scope**

Run: `rg -n "AKIA|ASIA|aws_secret_access_key|aws_session_token|bedrock:\*|GEMINI_API_KEY=.+" . -g '!**/node_modules/**' -g '!**/dist/**'`

Expected: no credential values and no `bedrock:*` policy.

- [ ] **Step 3: Verify legacy compatibility literals remain supported**

Run: `rg -n "gemini_cache|deterministic_after_gemini_error|LLM_PROVIDER|geminiRuntimeStatus|gemini:smoke" apps/api/src apps/api/package.json package.json`

Expected: compatibility paths remain or have explicit parsing/migration coverage.

- [ ] **Step 4: Run final verification evidence**

Run: `git diff --check`

Run: `npm run build:test`

Expected: both PASS.

- [ ] **Step 5: Commit final review fixes, if any**

Use a focused commit only if the review produced changes. Leave the worktree clean and report the branch, commits, offline results, live model results, fallback results, and any account limitation.
