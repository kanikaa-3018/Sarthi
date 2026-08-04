import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { assertBuyer, requireRole } from "../middleware/auth.js";
import { generateGroundedAgentAnswer } from "../services/agent.js";
import { selectGroundedAnswer } from "../services/answerValidator.js";
import { isGeneratedProvider } from "../services/ai.js";
import { placeCheckoutOrder, recordOrderOutcome, returnAlternativeAssistant } from "../services/buyerOperations.js";
import { expectationContract } from "../services/contracts.js";
import { computeCartConfidence } from "../services/decisionEngine.js";
import {
  createTrace,
  graphPath,
  productForVariant,
  publicProduct,
  rankCluster,
  skuPassport,
  fitPrediction,
} from "../services/domain.js";
import {
  buildGraphEvidenceCapsule,
  buildProductAdviceEvidenceCapsule,
  deterministicEvidenceAnswer
} from "../services/evidenceCapsule.js";
import { graphQuestionSupport, unsupportedGraphAnswer } from "../services/graphAnswers.js";
import { inferAttribute, withoutId } from "../services/format.js";
import { clusterKnowledgeGraph, matchedEvidencePaths } from "../services/knowledgeGraph.js";
import { llmCacheKey, readLlmCache, writeLlmCache } from "../services/llmCache.js";
import { resolveSimilarListingSet } from "../services/similarListings.js";
import { runTrustRun } from "../services/trustRunAgent.js";
import { semanticEvidenceSearch } from "../services/vectorSearch.js";

export async function registerDecisionRoutes(app: FastifyInstance, db: Db) {
  app.post("/compare", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const similarity = body.product_id ? await resolveSimilarListingSet(db, body.product_id) : null;
    const ranking = await rankCluster(db, body.buyer_id, body.cluster_id, body.preferred_fit, {
      recordSnapshot: true,
      intent: "compare",
      productIds: similarity?.comparable_product_ids,
      selectedVariantId: body.selected_variant_id
    });
    const fit = await fitPrediction(db, body.buyer_id, ranking.winner, body.preferred_fit);
    const trace = await createTrace(db, {
      buyer_id: body.buyer_id,
      variant_id: ranking.winner,
      intent: ["compare"],
      tools_used: [similarity ? "resolveSimilarListings" : "clusterFilter", "rankCluster", "fitPrediction"],
      fact_ids: ranking.fact_ids,
      graph_paths: [graphPath(ranking.winner, ranking.fact_ids)]
    });
    const product = await productForVariant(db, ranking.winner);
    return {
      trace_id: trace.trace_id,
      selected_product_id: product?.product_id ?? "",
      ranking,
      similarity,
      fit,
      graph_path: graphPath(ranking.winner, ranking.fact_ids)
    };
  });

  app.post("/trust-runs", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    if (!body.product_id && !body.cluster_id) {
      return reply.code(400).send({ detail: "product_id or cluster_id is required" });
    }
    return runTrustRun(db, body.buyer_id, {
      product_id: body.product_id,
      cluster_id: body.cluster_id,
      selected_variant_id: body.selected_variant_id,
      profile_id: body.profile_id,
      query: body.query,
      preferred_fit: body.preferred_fit ?? "comfort",
      create_wishlist_intent: body.create_wishlist_intent !== false,
      create_seller_signal: body.create_seller_signal !== false,
      intent: "trust_run"
    });
  });

  app.get("/knowledge-graph/clusters/:cluster_id", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.query as any).buyer_id;
    assertBuyer(account, buyerId);
    return clusterKnowledgeGraph(
      db,
      buyerId,
      (request.params as any).cluster_id,
      (request.query as any).product_id,
      (request.query as any).selected_variant_id
    );
  });

  app.post("/knowledge-graph/chat", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const cacheKey = llmCacheKey("knowledge_graph_chat", {
      answer_version: "kg_v6_action_contract",
      buyer_id: body.buyer_id,
      cluster_id: body.cluster_id,
      product_id: body.product_id,
      selected_variant_id: body.selected_variant_id,
      query: body.query
    });
    const cached = await readLlmCache(db, cacheKey);
    if (cached) {
      const trace = await createTrace(db, {
        buyer_id: body.buyer_id,
        intent: ["knowledge_graph_chat"],
        tools_used: ["llmCache"],
        fact_ids: cached.answer?.fact_ids ?? [],
        graph_paths: cached.graph_path ? [cached.graph_path] : []
      });
      return { ...cached, trace_id: trace.trace_id, cache: { hit: true, cache_key: cacheKey } };
    }

    const graph = await clusterKnowledgeGraph(db, body.buyer_id, body.cluster_id, body.product_id, body.selected_variant_id);
    const support = graphQuestionSupport(body.query ?? "");
    if (!support.supported) {
      const fallback = unsupportedGraphAnswer(body.query ?? "", support.reason);
      const trace = await createTrace(db, {
        buyer_id: body.buyer_id,
        intent: ["knowledge_graph_chat", "unsupported_claim"],
        tools_used: ["clusterKnowledgeGraph", "graphQuestionSupport"],
        fact_ids: [],
        graph_paths: []
      });
      return {
        trace_id: trace.trace_id,
        answer: {
          query: body.query,
          title: fallback.title,
          summary: fallback.summary,
          reasons: fallback.reasons,
          caution: fallback.caution,
          unsupported: true,
          support_reason: support.reason,
          matched_node_ids: [],
          highlighted_edge_ids: [],
          matched_path_ids: [],
          fact_ids: [],
          follow_up_questions: graph.chat_suggestions
        },
        graph_path: {
          path_type: "unsupported_claim",
          nodes: [],
          relationships: [],
          fact_ids: [],
          summary: support.reason
        },
        evidence_paths: [],
        agent: { provider: "deterministic_fallback" },
        retrieval: {
          source: "lexical_fallback",
          result_count: 0
        },
        cache: { hit: false, cache_key: cacheKey }
      };
    }
    const retrieval = await semanticEvidenceSearch(db, graph, body.query ?? "");
    const nodesById = new Map(graph.nodes.map((node: any) => [node.id, node]));
    const edgesById = new Map(graph.edges.map((edge: any) => [edge.id, edge]));
    const retrievedNodeIds = new Set<string>();
    const retrievedEdgeIds = new Set<string>();
    for (const result of retrieval.results) {
      const relatedEdge: any = edgesById.get(result.node_id);
      if (relatedEdge) {
        retrievedEdgeIds.add(relatedEdge.id);
        retrievedNodeIds.add(relatedEdge.source);
        retrievedNodeIds.add(relatedEdge.target);
      } else {
        retrievedNodeIds.add(result.node_id);
      }
    }
    const selectedContext = graph.seller_context.find((context: any) => context.product.product_id === graph.selected_product_id) ??
      graph.seller_context[0];
    const selectedNodeIds = new Set(Object.values(selectedContext?.node_ids ?? {}));
    const graphRelationships = graph.edges
      .filter((edge: any) => retrievedEdgeIds.has(edge.id) || selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target))
      .slice(0, 28)
      .map((edge: any) => ({
        edge_id: edge.id,
        relationship: edge.label,
        weight: edge.weight,
        source: {
          id: edge.source,
          type: (nodesById.get(edge.source) as any)?.type,
          label: (nodesById.get(edge.source) as any)?.label
        },
        target: {
          id: edge.target,
          type: (nodesById.get(edge.target) as any)?.type,
          label: (nodesById.get(edge.target) as any)?.label
        },
        fact_ids: edge.fact_ids ?? []
      }));
    const capsule = buildGraphEvidenceCapsule(graph, body.query ?? "", retrieval.results, selectedContext);
    const retrievalFactIds = retrieval.results.flatMap((result) => result.fact_ids ?? []);
    const factIds = [...new Set([...retrievalFactIds, ...capsule.fact_ids, ...graph.fact_ids])].slice(0, 16);
    const fallback = deterministicEvidenceAnswer(capsule);
    const grounded = await generateGroundedAgentAnswer({
      task: "graph_chat",
      query: body.query ?? "",
      context: {
        answer_contract: {
          intent: capsule.intent,
          verdict: capsule.verdict,
          confidence: capsule.confidence,
          must_answer_question: body.query ?? "",
          direct_facts: capsule.direct_facts,
          missing_facts: capsule.missing_facts,
          risk_flags: capsule.risk_flags,
          allowed_actions: capsule.allowed_actions,
          forbidden_topics: capsule.forbidden_topics
        },
        evidence_capsule: capsule,
        cluster: graph.cluster,
        selected_product_id: graph.selected_product_id,
        ranking: graph.ranking ? {
          winner: graph.ranking.winner,
          alternative: graph.ranking.alternative,
          top_factors: graph.ranking.top_factors,
          candidates: graph.ranking.candidates.slice(0, 4).map((candidate: any) => ({
            variant_id: candidate.variant_id,
            product_id: candidate.product_id,
            seller_id: candidate.seller_id,
            score: candidate.score,
            score_percent: candidate.score_percent,
            factors: candidate.factors
          }))
        } : null,
        retrieved_evidence: retrieval.results.map((result) => ({
          node_id: result.node_id,
          type: result.type,
          title: result.title,
          evidence: result.text,
          score: result.score,
          fact_ids: result.fact_ids
        })),
        graph_relationships: graphRelationships,
        retrieval_source: retrieval.source,
        seller_context: graph.seller_context.slice(0, 4).map((context: any) => ({
          product: {
            product_id: context.product.product_id,
            title: context.product.title,
            seller_name: context.product.seller_name,
            price: context.product.base_price,
            rating: context.product.rating,
            fabric: context.product.fabric
          },
          seller_verification: context.seller.verification.verification_status,
          sku_evidence: {
            delivered_orders_90d: context.evidence.delivered_orders_90d,
            return_rate: context.evidence.return_rate,
            evidence_strength: context.evidence.evidence_strength,
            median_dispatch_hours: context.evidence.median_dispatch_hours
          },
          proof_coverage: Object.values(context.proof_coverage ?? {}).map((item: any) => ({
            attribute: item.attribute,
            sufficient: item.sufficient,
            evidence_count: item.evidence_count,
            source_summary: item.source_summary,
            recommended_proof_type: item.recommended_proof_type,
            fact_ids: item.fact_ids
          })),
          fit: {
            recommended_size: context.fit?.recommended_size,
            confidence: context.fit?.confidence,
            reasons: context.fit?.reasons
          },
          offer: {
            status: context.price_context?.offer?.status,
            message: context.price_context?.offer?.message,
            latest_price: context.price_context?.latest_price
          },
          candidate_score: context.candidate?.score ?? null
        })),
        fact_ids: factIds
      },
      fallback
    });
    const selectedAnswer = selectGroundedAnswer(grounded, fallback, capsule);
    const finalGrounded = {
      ...selectedAnswer.answer,
      source: selectedAnswer.validation.used_fallback ? "deterministic_fallback" as const : grounded.source
    };
    const matchedNodeIds = capsule.matched_node_ids.length
      ? capsule.matched_node_ids
      : retrievedNodeIds.size
        ? [...retrievedNodeIds]
        : graphQueryMatchedNodeIds(graph, body.query ?? "", selectedContext);
    const highlightedEdgeIds = [...new Set([
      ...capsule.highlighted_edge_ids,
      ...retrievedEdgeIds,
      ...graph.edges
        .filter((edge: any) => matchedNodeIds.includes(edge.source) || matchedNodeIds.includes(edge.target))
        .slice(0, 5)
        .map((edge: any) => edge.id)
    ])].slice(0, 8);
    const paths = matchedEvidencePaths(graph, body.query ?? "", matchedNodeIds, highlightedEdgeIds);
    const pathFactIds = paths.flatMap((path: any) => path.fact_ids ?? []);
    const nextAction = await graphAnswerNextAction(
      db,
      capsule.allowed_actions[0] ?? null,
      graph,
      selectedContext,
      body.query ?? "",
      capsule
    );
    const answer = {
      query: body.query,
      title: finalGrounded.title,
      summary: finalGrounded.summary,
      reasons: finalGrounded.reasons,
      caution: finalGrounded.caution,
      matched_node_ids: matchedNodeIds,
      highlighted_edge_ids: highlightedEdgeIds,
      matched_path_ids: paths.map((path: any) => path.path_id),
      unsupported: false,
      support_reason: support.reason,
      intent: capsule.intent,
      verdict: capsule.verdict,
      confidence: capsule.confidence,
      evidence_used: capsule.direct_facts,
      missing_evidence: capsule.missing_facts,
      next_action: nextAction,
      fact_ids: [...new Set([...factIds, ...pathFactIds])].slice(0, 16),
      follow_up_questions: graph.chat_suggestions
    };
    const trace = await createTrace(db, {
      buyer_id: body.buyer_id,
      intent: ["knowledge_graph_chat"],
      tools_used: ["clusterKnowledgeGraph", "classifyQuestion", "buildEvidenceCapsule", body.product_id ? "resolveSimilarListings" : "clusterFilter", retrieval.source, "validateGroundedAnswer"],
      fact_ids: answer.fact_ids,
      graph_paths: [graphPath(graph.ranking?.winner ?? "", factIds)]
    });
    const response = {
      trace_id: trace.trace_id,
      answer,
      graph_path: graphPath(graph.ranking?.winner ?? "", factIds),
      evidence_paths: paths,
      agent: {
        provider: finalGrounded.source,
        mode: "evidence_capsule_v1",
        validated: !selectedAnswer.validation.used_fallback,
        validation_reasons: selectedAnswer.validation.reasons
      },
      retrieval: {
        source: retrieval.source,
        result_count: retrieval.results.length,
        error: retrieval.error
      },
      cache: { hit: false, cache_key: cacheKey }
    };
    if (isGeneratedProvider(finalGrounded.source) && answer.next_action?.type !== "ask_proof") {
      await writeLlmCache(db, cacheKey, "knowledge_graph_chat", response);
    }
    return response;
  });

  app.post("/decision/regret-firewall", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const trustRun = await runTrustRun(db, body.buyer_id, {
      product_id: body.product_id,
      cluster_id: body.cluster_id,
      query: body.query,
      preferred_fit: body.preferred_fit ?? "comfort",
      create_wishlist_intent: false,
      create_seller_signal: body.create_missing_proof_request !== false,
      intent: "regret_firewall"
    });
    return trustRun.decision;
  });

  app.post("/agent/query", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const cacheKey = llmCacheKey("agent_query", {
      answer_version: "sku_proof_v5_action_contract",
      buyer_id: body.buyer_id,
      cluster_id: body.cluster_id,
      selected_variant_id: body.selected_variant_id,
      query: body.query
    });
    const cached = await readLlmCache(db, cacheKey);
    if (cached) {
      const trace = await createTrace(db, {
        buyer_id: body.buyer_id,
        variant_id: body.selected_variant_id,
        intent: ["samvaad"],
        tools_used: ["llmCache"],
        fact_ids: cached.fact_ids ?? []
      });
      return { ...cached, trace_id: trace.trace_id, cache: { hit: true, cache_key: cacheKey } };
    }
    const product = body.selected_variant_id
      ? await productForVariant(db, body.selected_variant_id)
      : body.cluster_id
        ? publicProduct(await collections(db).products.findOne({ cluster_id: body.cluster_id }))
        : null;
    const passport = product && body.selected_variant_id
      ? await skuPassport(db, body.buyer_id, product.product_id, body.selected_variant_id)
      : null;
    const capsule = product && passport
      ? buildProductAdviceEvidenceCapsule(body.query ?? "", product, passport)
      : null;
    const fact_ids: string[] = [...new Set([...(passport?.fact_ids ?? []), ...(capsule?.fact_ids ?? [])])].slice(0, 16);
    const attribute = inferAttribute(body.query);
    const fallback = capsule
      ? deterministicEvidenceAnswer(capsule)
      : {
          title: "Sarthi answer",
          summary: "Sarthi needs a selected SKU before it can inspect seller, size, return, proof, and offer evidence.",
          reasons: ["Open a product and select a size so Sarthi can check SKU-specific facts."],
          caution: "This answer is not tied to a SKU yet."
        };
    const grounded = await generateGroundedAgentAnswer({
      task: "product_advice",
      query: body.query ?? "",
      context: {
        answer_contract: capsule ? {
          intent: capsule.intent,
          verdict: capsule.verdict,
          confidence: capsule.confidence,
          must_answer_question: body.query ?? "",
          direct_facts: capsule.direct_facts,
          missing_facts: capsule.missing_facts,
          risk_flags: capsule.risk_flags,
          allowed_actions: capsule.allowed_actions,
          forbidden_topics: capsule.forbidden_topics
        } : null,
        evidence_capsule: capsule,
        product: product ? {
          product_id: product.product_id,
          title: product.title,
          seller_name: product.seller_name,
          category: product.category,
          fabric: product.fabric,
          price: product.base_price,
          rating: product.rating
        } : null,
        passport: passport ? {
          truth_summary: passport.truth_summary,
          selected_size: passport.variant.size,
          fit: passport.fit,
          outcome_evidence: passport.outcome_evidence,
          avoidable_issue: passport.avoidable_issue,
          offer_truth: {
            status: passport.offer_truth.status,
            message: passport.offer_truth.message,
            truth_basis: passport.offer_truth.truth_basis
          },
          evidence_gaps: passport.evidence_gaps.map((gap: any) => ({
            attribute: gap.attribute,
            severity: gap.severity,
            summary: gap.summary,
            recommended_proof_type: gap.recommended_proof_type
          })),
          conflicts: passport.conflicts
        } : null,
        fact_ids
      },
      fallback
    });
    const selectedAnswer = capsule
      ? selectGroundedAnswer(grounded, fallback, capsule)
      : {
          answer: fallback,
          validation: {
            ok: false,
            reasons: ["missing_selected_sku"],
            used_fallback: true
          }
        };
    const finalGrounded = {
      ...selectedAnswer.answer,
      source: selectedAnswer.validation.used_fallback ? "deterministic_fallback" as const : grounded.source
    };
    const trace = await createTrace(db, {
      buyer_id: body.buyer_id,
      product_id: product?.product_id,
      variant_id: body.selected_variant_id,
      intent: ["samvaad"],
      tools_used: ["intentDetection", "buildEvidenceCapsule", "groundedAnswer", "validateGroundedAnswer", finalGrounded.source],
      fact_ids
    });
    const primaryAction = await productAdvicePrimaryAction(
      db,
      capsule?.allowed_actions[0] ?? null,
      product,
      body.selected_variant_id ?? null,
      body.query ?? "",
      capsule
    );
    const response = {
      trace_id: trace.trace_id,
      intent: [capsule?.intent ?? attribute, "trust_question"],
      answer: {
        query: body.query,
        title: finalGrounded.title,
        summary: finalGrounded.summary,
        reasons: finalGrounded.reasons,
        caution: finalGrounded.caution,
        verdict: capsule?.verdict ?? "cannot_answer",
        confidence: capsule?.confidence ?? "low",
        evidence_used: capsule?.direct_facts ?? [],
        missing_evidence: capsule?.missing_facts ?? [],
        primary_action: primaryAction
      },
      agent: {
        provider: finalGrounded.source,
        mode: "evidence_capsule_v1",
        validated: !selectedAnswer.validation.used_fallback,
        validation_reasons: selectedAnswer.validation.reasons
      },
      fact_ids
    };
    if (isGeneratedProvider(finalGrounded.source) && response.answer.primary_action?.type !== "ask_proof") {
      await writeLlmCache(db, cacheKey, "agent_query", response);
    }
    return response;
  });

  app.post("/checkout/verify-offer", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const cartConfidence = await computeCartConfidence(db, body.buyer_id, {
      payment_mode: body.payment_mode ?? "cod",
      items: [{
        variant_id: body.variant_id,
        quantity: body.quantity ?? 1
      }]
    });
    const line = cartConfidence.line_items[0];
    if (!line) return reply.code(404).send({ detail: "Checkout item not found" });

    return {
      trace_id: cartConfidence.trace_id,
      offer: line.offer,
      keep_confidence: { trace_id: cartConfidence.trace_id, ...line.keep_confidence },
      cart_confidence: cartConfidence,
      graph_path: cartConfidence.graph_path
    };
  });

  app.post("/expectation-contracts", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const product = await productForVariant(db, body.variant_id);
    if (!product) return reply.code(404).send({ detail: "Variant not found" });
    const passport = await skuPassport(db, body.buyer_id, product.product_id, body.variant_id);
    const contract = expectationContract(body.buyer_id, product.product_id, body.variant_id, passport);
    await collections(db).expectationContracts.insertOne(contract);
    return contract;
  });

  app.get("/expectation-contracts/:contract_id", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const contract = await collections(db).expectationContracts.findOne({
      contract_id: (request.params as any).contract_id
    });
    if (!contract) return reply.code(404).send({ detail: "Contract not found" });
    assertBuyer(account, contract.buyer_id);
    return withoutId(contract);
  });

  app.post("/orders/simulate", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    return recordOrderOutcome(db, body);
  });

  app.post("/orders/place", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    return placeCheckoutOrder(db, body);
  });

  app.post("/orders/return-assistant", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    return returnAlternativeAssistant(db, body);
  });
}

async function graphAnswerNextAction(db: Db, action: any, graph: any, selectedContext: any, query: string, capsule: any) {
  if (!action) return null;
  const product = selectedContext?.product ?? {};
  const variant = selectedContext?.variant ?? {};
  return answerActionContract(db, action, {
    productId: product.product_id ?? graph.selected_product_id ?? null,
    variantId: variant.variant_id ?? graph.selected_variant_id ?? null,
    sellerId: product.seller_id ?? selectedContext?.seller?.seller_id ?? null,
    query,
    capsule
  });
}

async function productAdvicePrimaryAction(db: Db, action: any, product: any, variantId: string | null, query: string, capsule: any) {
  if (action) {
    return answerActionContract(db, action, {
      productId: product?.product_id ?? null,
      variantId,
      sellerId: product?.seller_id ?? null,
      query,
      capsule
    });
  }
  if (!variantId) return null;
  return {
    type: "open_variant",
    label: "Inspect SKU proof",
    reason: "Open the SKU proof trail before deciding.",
    product_id: product?.product_id ?? null,
    variant_id: variantId,
    seller_id: product?.seller_id ?? null,
    attribute: normalizeProofActionAttribute(null, query),
    request_id: null,
    request_status: "not_applicable",
    request_count: 0,
    privacy_note: "No seller data is changed by this action."
  };
}

async function answerActionContract(
  db: Db,
  action: any,
  context: {
    productId: string | null;
    variantId: string | null;
    sellerId: string | null;
    query: string;
    capsule: any;
  }
) {
  const base = {
    ...action,
    product_id: context.productId,
    variant_id: context.variantId,
    seller_id: context.sellerId,
    attribute: normalizeProofActionAttribute(action.attribute ?? context.capsule?.classifier?.proof_attribute, context.query),
    request_id: null,
    request_status: "not_applicable",
    request_count: 0,
    privacy_note: "Seller sees aggregate proof demand only."
  };
  if (action.type !== "ask_proof") return base;
  if (!base.product_id || !base.seller_id || !base.attribute) {
    return {
      ...base,
      disabled: true,
      request_status: "missing_product_context",
      reason: "Sarthi needs product and seller context before creating a proof request."
    };
  }
  const existing = await collections(db).proofRequests.findOne({
    seller_id: base.seller_id,
    product_id: base.product_id,
    attribute: base.attribute,
    status: { $in: ["open", "submitted"] }
  });
  if (!existing) {
    return {
      ...base,
      request_status: "none",
      label: base.label || "Ask for proof",
      reason: base.reason || "Seller proof must be reviewed before confidence improves."
    };
  }
  return {
    ...base,
    label: existing.status === "submitted" ? "Proof under review" : "Proof already requested",
    reason: existing.status === "submitted"
      ? "Seller has responded; reviewer approval is needed before trust can improve."
      : "Your ask will be counted as aggregate demand without sharing identity.",
    request_id: existing.request_id,
    request_status: existing.status,
    request_count: Number(existing.request_count ?? 1)
  };
}

function normalizeProofActionAttribute(attribute: unknown, query: string) {
  const raw = String(attribute ?? inferAttribute(query) ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "measurement") return "size";
  if (raw === "thin" || raw === "see_through") return "transparency";
  return raw;
}

function graphQueryMatchedNodeIds(graph: any, query: string, selectedContext: any) {
  const nodeIds = selectedContext?.node_ids ?? {};
  const normalized = normalizeText(query);
  const matches = new Set<string>();

  const add = (...keys: string[]) => {
    for (const key of keys) {
      const nodeId = nodeIds[key];
      if (nodeId) matches.add(String(nodeId));
    }
  };

  if (/\b(size|fit|xl|large|small|tight|loose|chest|measurement)\b/.test(normalized)) {
    add("buyer_fit", "sku", "returns", "score");
  }
  if (/\b(review|rating|credibility|fake|false|buyer)\b/.test(normalized)) {
    add("reviews", "returns", "proof", "score");
  }
  if (/\b(seller|shop|verified|verification|trust|safe|risk|reliable)\b/.test(normalized)) {
    add("seller", "returns", "reviews", "proof", "score");
  }
  if (/\b(proof|evidence|photo|fabric|cloth|material|color|colour|transparent|genuine|real|authentic)\b/.test(normalized)) {
    add("product", "proof", "reviews", "returns", "score");
  }
  if (/\b(return|refund|rto|exchange|kept|problem)\b/.test(normalized)) {
    add("sku", "returns", "reviews", "score");
  }
  if (/\b(price|offer|discount|timer|deal|cheap|rush|campaign)\b/.test(normalized)) {
    add("offer", "price", "proof", "score");
  }
  if (/\b(compare|similar|alternative|better|same)\b/.test(normalized)) {
    add("product", "seller", "sku", "score");
  }

  if (!matches.size) {
    add("product", "seller", "sku", "score");
  }

  const graphNodeIds = new Set((graph.nodes ?? []).map((node: any) => node.id));
  return [...matches].filter((nodeId) => graphNodeIds.has(nodeId)).slice(0, 7);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
