# Bedrock Primary With Gemini Fallback Design

Date: 2026-07-19
Status: Approved for implementation
Branch: `codex/bedrock-primary-fallback`

## Context

Sarthi is a trust-oriented commerce decision layer. Its AI features explain evidence, assign bounded confidence metadata, coach sellers, compare listing images, and retrieve graph evidence. MongoDB evidence, deterministic scoring, human review gates, and abstention rules remain authoritative. Model output must never create facts, approve sellers or listings, or override evidence gates.

The current backend sends every model task to Gemini. Gemini must remain available as a fallback, while Amazon Bedrock becomes the primary provider. The migration must preserve all existing API shapes, deterministic behavior, stored Gemini data, and non-AI operation.

The account uses `ap-south-1` and AWS Free Tier credits. The design therefore avoids provisioned capacity and other always-on AWS resources. Bedrock on-demand inference consumes credits and may become billable depending on the AWS account plan after credits are depleted.

## Goals

- Make Bedrock the primary provider for every existing AI capability.
- Keep Gemini as an automatic provider fallback.
- Keep deterministic and lexical fallbacks as the final safety layer.
- Select only models discovered in the actual account and prove invocation access with a live smoke test.
- Preserve current request and response contracts, cache compatibility, and stored Gemini embeddings.
- Minimize inference cost and bound request latency, tokens, retries, and image inputs.
- Use the AWS SDK default credential chain so local development uses the `agent-toolkit` profile and deployed workloads can use IAM roles without code changes.
- Expose truthful provider, model, circuit, and fallback health without exposing credentials or full provider errors.

## Non-goals

- Replacing MongoDB, Neo4j, Atlas Vector Search, or the deterministic decision engine.
- Introducing Bedrock Agents, Knowledge Bases, Guardrails, provisioned throughput, or application inference profiles.
- Moving Gemini secrets into a different secret store in this change.
- Automatically approving administrative or seller actions.
- Deleting or rewriting existing Gemini cache or embedding records.
- Adding streaming responses or changing frontend UX.

## Verified Account Discovery

Read-only AWS control-plane checks were run with AWS CLI 2.36.2, profile `agent-toolkit`, and region `ap-south-1`. Credentials were valid at the time of discovery.

The following system-defined inference profiles were active:

- `apac.amazon.nova-micro-v1:0`
- `apac.amazon.nova-lite-v1:0`

Both profiles include `ap-south-1` and other APAC destination regions. The following in-region embedding model was listed with on-demand support:

- `amazon.titan-embed-text-v2:0`

Catalog visibility and an active inference profile do not prove that the caller can invoke a model. IAM, account state, quota, Marketplace terms, or provider onboarding can still reject an inference request. The implementation must therefore run small, explicitly bounded live invocations and report each capability independently.

## Considered Approaches

### 1. Capability-routed Amazon models, then Gemini

Use Nova Micro for text-only structured tasks, Nova Lite for multimodal comparison, and Titan Text Embeddings V2 for retrieval. Fall back to Gemini per capability, then to existing deterministic behavior.

Benefits:

- Lowest expected Bedrock cost for the current task mix.
- APAC inference profiles for text and vision.
- No Anthropic usage-form or third-party Marketplace dependency.
- Each model is selected for the modality it actually supports.

Costs:

- More configuration than a single model.
- Nova 1 does not support Bedrock strict structured outputs, so structured data must use forced client-side tool choice plus application validation.

### 2. One Nova Lite model for all generation, then Gemini

Use Nova Lite for both text and image tasks, and Titan V2 for embeddings.

Benefits:

- Simpler generation configuration.
- APAC routing and AWS-native models.

Costs:

- Text-only tasks use a more expensive multimodal model unnecessarily.
- It retains the same structured-output limitation as approach 1.

### 3. Claude Haiku 4.5 for generation, then Gemini

Use Claude Haiku 4.5 for text and vision, with Titan V2 for embeddings.

Benefits:

- Bedrock strict structured outputs are supported.
- Strong instruction following and multimodal support.

Costs:

- The account exposes only a global inference profile from Mumbai, so prompts may leave APAC.
- Anthropic requires additional model-access onboarding and may introduce Marketplace or billing constraints.
- Higher cost and more access risk for a Free Tier project.

## Decision

Use approach 1.

The ordered capability routes are:

| Capability | Bedrock primary | Bedrock secondary | Provider fallback | Final fallback |
| --- | --- | --- | --- | --- |
| Structured text | APAC Nova Micro | APAC Nova Lite | Gemini text model candidates | Existing deterministic result |
| Visual comparison | APAC Nova Lite | None | Gemini multimodal model candidates | Existing deterministic catalog similarity |
| Embeddings | Titan Text Embeddings V2 at 512 dimensions | None | Gemini embeddings at the existing 768 dimensions | Existing lexical retrieval |

Nova Lite is a Bedrock secondary only for text tasks. It is not called after a Nova Micro safety refusal. It is used when Micro is unavailable, unauthorized, throttled after SDK retries, times out, or returns an invalid contract.

## Provider Architecture

Introduce a provider-neutral AI gateway. Callers request a capability and receive a result carrying provider and model metadata. They no longer call Gemini directly.

The gateway owns:

- Provider ordering.
- Capability-specific model selection.
- Per-provider and per-capability circuit breakers.
- Timeout and abort handling.
- Structured-response extraction.
- Provider-safe public errors.
- Invocation usage metadata.
- Fallback decisions.

Provider adapters remain independently testable:

- Bedrock adapter: Converse for structured text and image input; InvokeModel for Titan embeddings.
- Gemini adapter: retain current REST implementation, model candidates, JSON parsing, image support, and embedding support.

Gemini configuration must no longer depend on Gemini being the primary provider. A non-empty Gemini API key makes the adapter eligible wherever it appears in the configured provider order.

## Structured Output Contract

Every generation call site will supply a small JSON-schema-compatible tool definition matching its existing output contract. Bedrock Nova requests will:

- Use `ConverseCommand` through `BedrockRuntimeClient`.
- Set `toolChoice.tool` to the single named output tool.
- Set temperature to `0` for greedy decoding.
- Set `maxTokens` explicitly for every request.
- Accept only a matching `toolUse` block with an object input.
- Reject truncated, missing, mismatched, or malformed tool output.
- Run the existing caller normalization and validation before accepting the result.

Gemini continues to request JSON output. Its parsed object passes through the same caller validation as Bedrock output.

The current caller contracts remain unchanged:

- Grounded agent answer: `title`, `summary`, `reasons[]`, `caution`.
- Confidence assignment: bounded confidence entries and reasons for known signal IDs only.
- Seller coach: current headline, action, and evidence fields.
- Visual similarity: known product IDs, bounded confidence, allowed visual-match enum, reasons, and risks.

Model output remains untrusted. Unknown IDs, extra decisions, non-finite numbers, overlong strings, unsupported enum values, and missing required fields are rejected or normalized exactly as the caller contract permits.

## Failover State Machine

For a normal transient or availability failure:

1. Try the configured Bedrock model with AWS SDK adaptive retries.
2. For text only, try the configured Bedrock secondary model when the primary is unavailable.
3. Try Gemini when it is configured and its circuit is closed.
4. Return the existing deterministic fallback.

Fallback-eligible failures include:

- Timeout or abort.
- Throttling after SDK retries.
- Service unavailable, internal service failure, or model timeout.
- Access denied, model unavailable, or unsupported on-demand invocation.
- Empty, truncated, malformed, or contract-invalid output.

Safety and policy stops are terminal for model providers. A Bedrock guardrail intervention, content filter, or explicit safety refusal goes directly to the deterministic fallback. The gateway must not send the same request to another model to evade a safety decision.

Each provider/capability circuit opens for 60 seconds after a terminal availability failure. One provider's circuit never disables the other provider. Successful calls close the relevant circuit and record the active model.

## Model Access Verification

Automated unit and integration tests must mock provider clients and incur no AWS cost.

An explicit `ai:smoke` command will perform three small live checks:

1. Text: invoke Nova Micro with a minimal forced-tool response. If it fails, probe Nova Lite and report the selected working text model.
2. Vision: invoke Nova Lite with a tiny embedded supported-format image and a minimal forced-tool response.
3. Embedding: invoke Titan V2 with a short input and verify exactly 512 finite values.

The smoke command will:

- Require an explicit live flag so normal tests never invoke paid services.
- Set small `maxTokens` values.
- Print provider/model/status and sanitized errors, never credentials or complete prompts.
- Exit non-zero only when no safe route exists for a required capability.
- Report Gemini fallback eligibility separately without printing or validating the key value.

Runtime operation remains fail-safe even when the smoke test identifies an unavailable model.

## Embeddings and Atlas Vector Search

Titan Text Embeddings V2 supports 1024, 512, or 256 dimensions, not Gemini's current 768 dimensions. Vectors from different models or dimensions must never be compared or indexed together.

Use two independent vector namespaces:

- Bedrock: new collection `evidence_embeddings_bedrock`, model `amazon.titan-embed-text-v2:0`, 512 dimensions, and index `sarthi_evidence_vector_bedrock_512`.
- Gemini: preserve the existing collection, model, 768-dimensional records, and configured Atlas index.

Semantic retrieval will try namespaces in provider order. Each namespace performs its own query embedding, document materialization, Atlas index health check, and local cosine fallback. If a namespace fails, the next provider namespace is tried. If both fail, lexical retrieval remains active.

The vector-index creation script will accept a provider selector and create only the requested index definition. Application startup will not create billable AWS resources or delete any MongoDB search index.

## Configuration

New configuration:

| Variable | Default or local value | Purpose |
| --- | --- | --- |
| `AI_PROVIDER_ORDER` | `bedrock,gemini` | Ordered eligible providers |
| `BEDROCK_ENABLED` | `false` by default; setup writes `true` | Explicit cost-safety gate for live AWS calls |
| `AWS_REGION` | `ap-south-1` | Bedrock Runtime source region |
| `AWS_PROFILE` | `agent-toolkit` locally only | Local credential-chain profile |
| `BEDROCK_TEXT_MODELS` | `apac.amazon.nova-micro-v1:0,apac.amazon.nova-lite-v1:0` | Ordered text candidates |
| `BEDROCK_VISION_MODELS` | `apac.amazon.nova-lite-v1:0` | Ordered vision candidates |
| `BEDROCK_EMBEDDING_MODEL` | `amazon.titan-embed-text-v2:0` | Embedding model |
| `BEDROCK_EMBEDDING_DIMENSIONS` | `512` | Titan vector dimensions |
| `BEDROCK_VECTOR_SEARCH_COLLECTION` | `evidence_embeddings_bedrock` | Titan vector namespace |
| `BEDROCK_VECTOR_SEARCH_INDEX` | `sarthi_evidence_vector_bedrock_512` | Titan Atlas vector index |

Existing Gemini variables remain supported. Existing `LLM_PROVIDER`, `LLM_MODEL`, `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSIONS` are treated as legacy Gemini configuration when the new provider order is absent. This prevents an existing deployment from unexpectedly switching providers merely by upgrading code.

The checked-in environment example will show Bedrock-first configuration without real credentials. A PowerShell setup helper may write non-secret Bedrock settings to the ignored local `.env`; it must preserve any existing Gemini key without printing it. AWS access keys are never written to `.env`.

## Credentials and IAM

The Bedrock SDK client uses the standard Node credential provider chain.

- Local development: `AWS_PROFILE=agent-toolkit` uses the browser-login profile already configured by Agent Toolkit.
- Deployed runtime: omit `AWS_PROFILE` and attach an IAM role to the compute workload.
- Never hardcode AWS access keys, session tokens, or account IDs.

Production IAM should grant only the inference actions and resources required by the configured models. Cross-region inference permissions must cover both the inference-profile resource and its destination foundation-model resources. Titan permissions must cover only its foundation-model ARN. No `bedrock:*` policy is required.

## Timeouts, Retries, and Cost Controls

- Use `BedrockRuntimeClient` with adaptive retry mode and at most five attempts for retryable SDK failures.
- Pass the existing external-service abort signal to every Bedrock command.
- Set explicit per-task `maxTokens`; never rely on a model maximum.
- Keep reasoning disabled.
- Use temperature `0` for forced structured output.
- Retain the six-hour LLM cache and include provider order plus model IDs in new cache keys.
- Preserve existing prompt and image size limits. Do not add images to text-only requests.
- Record returned token counts in runtime status for observability without logging full prompts or responses.
- Do not enable Bedrock model invocation logging in this change.
- Do not create provisioned throughput, application inference profiles, Guardrails, Knowledge Bases, or other persistent AWS resources.

Free Tier credits are a spending balance, not an unlimited Bedrock inference quota. The implementation minimizes calls, but it cannot determine an exact real-time remaining-credit balance from an inference request. An AWS Budget alert is recommended separately when an alert email and desired threshold are provided.

## Cache and Stored-Data Compatibility

- Old Gemini cache documents remain readable and are not deleted.
- New cache keys include provider order, text model candidates, vision model candidates, and prompt version so a Gemini-only response is not mistaken for the current Bedrock-first configuration.
- Cached payloads retain their original provider metadata.
- Persistence gates that currently accept only `source === "gemini"` will accept either trusted generated source, while preserving the literal source for auditability.
- Public answer structures do not change. `bedrock` is an additive provider value.

## Health and Observability

Add a provider-neutral AI runtime status containing:

- Configured provider order.
- Primary provider.
- Per-capability configured and active model.
- Per-provider eligibility and circuit state.
- Last sanitized error.
- Last successful provider/model.
- Last Bedrock token usage when available.

Keep the existing `gemini` readiness object for compatibility. Add `bedrock` and `ai` objects rather than renaming the old field. Admin fallback copy will describe the actual chain instead of claiming Gemini is the only model provider.

## Test Strategy

Implementation follows test-driven development.

Required automated coverage:

- Bedrock configuration and credential-chain behavior without accessing credentials.
- Converse request mapping for text and image blocks.
- Forced tool schema, explicit `maxTokens`, temperature, and abort signal.
- Titan InvokeModel request and exact dimension validation.
- Bedrock success prevents a Gemini call.
- Bedrock transient failure invokes Gemini.
- Bedrock invalid contract invokes Gemini.
- Bedrock safety stop skips Gemini and uses deterministic fallback.
- Bedrock and Gemini circuit breakers are independent.
- Both provider failures preserve each existing deterministic result shape.
- Text secondary model is tried before crossing providers.
- Vision uses Nova Lite and retains current image limits.
- Titan and Gemini vectors use separate collections, dimensions, and Atlas index names.
- Titan failure can use the existing Gemini vector namespace.
- Both embedding providers failing returns lexical results.
- Cache fingerprint changes with provider order and model configuration.
- Existing legacy environment configuration remains valid.
- Readiness and admin health remain backward compatible.
- Existing 26 API tests continue to pass.
- API and frontend production builds continue to pass.

After automated verification, run the explicit live smoke command against `ap-south-1`. Any model that cannot be invoked will be reported and excluded or reordered in the final local configuration. Run a final full `npm run build:test` after smoke validation.

## Rollout

1. Add provider-neutral contracts and failing tests.
2. Add the Bedrock adapter and mocked unit tests.
3. Decouple and retain the Gemini adapter.
4. Route agent, confidence, seller, and visual tasks through the gateway.
5. Add dual embedding namespaces and vector-index tooling.
6. Update caches, persistence gates, readiness, and admin health additively.
7. Update environment examples and non-secret setup documentation.
8. Run the full offline test/build suite.
9. Run bounded live model probes in `ap-south-1`.
10. Update local model order only from observed invocation results.
11. Re-run the complete verification suite and review the final diff for unrelated changes.

## Acceptance Criteria

- Bedrock is attempted first for every AI capability when configured.
- Gemini is automatically attempted after eligible Bedrock failures.
- Existing deterministic and lexical behavior remains available when both providers fail.
- No existing response field is removed or repurposed.
- No existing Gemini cache or embedding data is deleted.
- Titan and Gemini vectors are never mixed.
- The selected Bedrock text, vision, and embedding routes have successful bounded live invocations, or the final configuration truthfully reports them unavailable and uses the next safe route.
- AWS credentials come from the standard provider chain and are not committed.
- Every Bedrock generation request has explicit output limits and an abort signal.
- Offline tests make zero paid model calls.
- The full repository build and test baseline remains green.
