import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { assertBuyer, requireRole } from "../middleware/auth.js";
import { generateGroundedAgentAnswer } from "../services/agent.js";
import { isGeneratedProvider } from "../services/ai.js";
import { placeCheckoutOrder, recordOrderOutcome, returnAlternativeAssistant } from "../services/buyerOperations.js";
import { expectationContract } from "../services/contracts.js";
import { computeCartConfidence } from "../services/decisionEngine.js";
import {
  createOrIncrementProofRequest,
  createTrace,
  graphPath,
  productForVariant,
  productWithSeller,
  publicProduct,
  rankCluster,
  skuPassport,
  fitPrediction,
  variantsForProduct
} from "../services/domain.js";
import { deterministicGraphChatAnswer } from "../services/graphAnswers.js";
import { inferAttribute, label, withoutId } from "../services/format.js";
import { clusterKnowledgeGraph } from "../services/knowledgeGraph.js";
import { llmCacheKey, readLlmCache, writeLlmCache } from "../services/llmCache.js";
import { resolveSimilarListingSet } from "../services/similarListings.js";
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
      productIds: similarity?.comparable_product_ids
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

  app.get("/knowledge-graph/clusters/:cluster_id", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const buyerId = (request.query as any).buyer_id;
    assertBuyer(account, buyerId);
    return clusterKnowledgeGraph(db, buyerId, (request.params as any).cluster_id, (request.query as any).product_id);
  });

  app.post("/knowledge-graph/chat", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const cacheKey = llmCacheKey("knowledge_graph_chat", {
      buyer_id: body.buyer_id,
      cluster_id: body.cluster_id,
      product_id: body.product_id,
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

    const graph = await clusterKnowledgeGraph(db, body.buyer_id, body.cluster_id, body.product_id);
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
    const retrievalFactIds = retrieval.results.flatMap((result) => result.fact_ids ?? []);
    const factIds = [...new Set([...retrievalFactIds, ...graph.fact_ids])].slice(0, 10);
    const fallback = deterministicGraphChatAnswer(graph, body.query ?? "");
    const grounded = await generateGroundedAgentAnswer({
      task: "graph_chat",
      query: body.query ?? "",
      context: {
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
          candidate_score: context.candidate?.score ?? null
        })),
        fact_ids: factIds
      },
      fallback
    });
    const matchedNodeIds = retrievedNodeIds.size
      ? [...retrievedNodeIds]
      : graph.nodes.slice(0, 4).map((node: any) => node.id);
    const highlightedEdgeIds = [...new Set([
      ...retrievedEdgeIds,
      ...graph.edges
        .filter((edge: any) => matchedNodeIds.includes(edge.source) || matchedNodeIds.includes(edge.target))
        .slice(0, 5)
        .map((edge: any) => edge.id)
    ])].slice(0, 8);
    const answer = {
      query: body.query,
      title: grounded.title,
      summary: grounded.summary,
      reasons: grounded.reasons,
      caution: grounded.caution,
      matched_node_ids: matchedNodeIds,
      highlighted_edge_ids: highlightedEdgeIds,
      fact_ids: factIds,
      follow_up_questions: graph.chat_suggestions
    };
    const trace = await createTrace(db, {
      buyer_id: body.buyer_id,
      intent: ["knowledge_graph_chat"],
      tools_used: ["clusterKnowledgeGraph", body.product_id ? "resolveSimilarListings" : "clusterFilter", retrieval.source, "answerGraphQuestion"],
      fact_ids: factIds,
      graph_paths: [graphPath(graph.ranking?.winner ?? "", factIds)]
    });
    const response = {
      trace_id: trace.trace_id,
      answer,
      graph_path: graphPath(graph.ranking?.winner ?? "", factIds),
      agent: { provider: grounded.source },
      retrieval: {
        source: retrieval.source,
        result_count: retrieval.results.length,
        error: retrieval.error
      },
      cache: { hit: false, cache_key: cacheKey }
    };
    if (isGeneratedProvider(grounded.source)) {
      await writeLlmCache(db, cacheKey, "knowledge_graph_chat", response);
    }
    return response;
  });

  app.post("/decision/regret-firewall", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const contextProduct = body.product_id
      ? await productWithSeller(db, body.product_id)
      : await collections(db).products.findOne({ cluster_id: body.cluster_id, is_sarthi_eligible: 1 });
    const product = contextProduct?.product_id ? contextProduct : publicProduct(contextProduct);
    if (!product) return reply.code(404).send({ detail: "Product context not found" });
    const variants = await variantsForProduct(db, product.product_id);
    const variant = variants.find((item: any) => item.size === "XL") ?? variants[0];
    const similarity = await resolveSimilarListingSet(db, product.product_id);
    const passport = await skuPassport(db, body.buyer_id, product.product_id, variant.variant_id);
    const attribute = inferAttribute(body.query);
    const missing = passport.evidence_gaps.find((gap: any) => gap.attribute === attribute)
      ?? passport.evidence_gaps[0]
      ?? null;
    const proofRequest = missing && body.create_missing_proof_request !== false
      ? await createOrIncrementProofRequest(db, body.buyer_id, product, variant.variant_id, missing.attribute, body.query ?? "")
      : null;
    const ranking = await rankCluster(db, body.buyer_id, product.cluster_id, body.preferred_fit, {
      recordSnapshot: true,
      intent: "regret_firewall",
      productIds: similarity.comparable_product_ids
    });
    const trace = await createTrace(db, {
      buyer_id: body.buyer_id,
      product_id: product.product_id,
      variant_id: variant.variant_id,
      intent: ["regret_firewall"],
      tools_used: ["resolveSimilarListings", "skuPassport", "proofCoverage", "createProofRequest"],
      fact_ids: passport.fact_ids,
      graph_paths: [graphPath(variant.variant_id, passport.fact_ids)]
    });
    return {
      trace_id: trace.trace_id,
      buyer_id: body.buyer_id,
      context: {
        product_id: product.product_id,
        cluster_id: product.cluster_id,
        category: product.category,
        garment_type: product.garment_type,
        similarity: {
          method: similarity.method,
          summary: similarity.summary,
          distinct_seller_count: similarity.distinct_seller_count,
          comparable_product_ids: similarity.comparable_product_ids,
          candidates: similarity.candidates.slice(0, 4),
          agent: similarity.agent
        }
      },
      decision: missing
        ? { code: "ask_seller_proof", label: "Ask seller proof", summary: missing.summary, primary_action: missing.title, confidence: "medium" }
        : { code: "buy_without_rush", label: "Safe to consider", summary: "No major proof gap detected.", primary_action: "Continue to product detail", confidence: "medium" },
      selected: { product, variant, recommended_size: passport.fit.recommended_size },
      ranking,
      sku_truth_passport: passport,
      missing_proof: missing,
      proof_request: proofRequest,
      graph_paths: [graphPath(variant.variant_id, passport.fact_ids)],
      fact_ids: passport.fact_ids
    };
  });

  app.post("/agent/query", async (request, reply) => {
    const account = await requireRole(db, request, reply, "buyer");
    const body: any = request.body;
    assertBuyer(account, body.buyer_id);
    const cacheKey = llmCacheKey("agent_query", {
      answer_version: "sku_proof_v3",
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
    const fact_ids: string[] = passport?.fact_ids?.slice(0, 12) ?? [];
    const attribute = inferAttribute(body.query);
    const fallback = product && passport
      ? productAdviceFallback(body.query ?? "", attribute, product, passport)
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
    const trace = await createTrace(db, {
      buyer_id: body.buyer_id,
      product_id: product?.product_id,
      variant_id: body.selected_variant_id,
      intent: ["samvaad"],
      tools_used: ["intentDetection", "groundedAnswer", grounded.source],
      fact_ids
    });
    const weakGeneratedAnswer = shouldUseFallbackProductAdvice(grounded.title, grounded.summary, grounded.reasons, body.query ?? "", passport, attribute);
    const response = {
      trace_id: trace.trace_id,
      intent: [attribute, "trust_question"],
      answer: {
        title: weakGeneratedAnswer ? fallback.title : grounded.title,
        summary: weakGeneratedAnswer ? fallback.summary : grounded.summary,
        reasons: weakGeneratedAnswer ? fallback.reasons : normalizeAgentReasons(grounded.reasons, fallback.reasons),
        caution: weakGeneratedAnswer ? fallback.caution : grounded.caution ?? fallback.caution,
        primary_action: body.selected_variant_id
          ? { type: "open_variant", variant_id: body.selected_variant_id, label: "Inspect SKU proof" }
          : null
      },
      agent: { provider: grounded.source },
      fact_ids
    };
    if (isGeneratedProvider(grounded.source)) {
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

function productAdviceFallback(query: string, attribute: string, product: any, passport: any) {
  const evidence = passport.outcome_evidence ?? {};
  const fit = passport.fit ?? {};
  const selectedSize = passport.variant?.size ? `size ${passport.variant.size}` : "this size";
  const returnRate = Number(evidence.return_rate ?? 0);
  const fitRate = Number(evidence.fit_as_expected_rate ?? 0);
  const delivered = Number(evidence.delivered_orders_90d ?? 0);
  const relevantGap = passport.evidence_gaps?.find((gap: any) => gap.attribute === attribute)
    ?? passport.evidence_gaps?.[0]
    ?? null;
  const hasIssue = Boolean(passport.avoidable_issue);
  const issueTitle = passport.avoidable_issue?.title ? String(passport.avoidable_issue.title) : null;
  const issueAction = passport.avoidable_issue?.action ? String(passport.avoidable_issue.action) : null;
  const reasons = [
    delivered > 0
      ? `${delivered} recent delivered orders were checked for this SKU.`
      : "This SKU has limited delivered-order evidence.",
    Number.isFinite(fitRate) && fitRate > 0
      ? `${Math.round(fitRate * 100)}% of recent buyers kept this SKU without fit-related return feedback.`
      : `Sarthi checked fit guidance for ${selectedSize}.`,
    Number.isFinite(returnRate)
      ? `${Math.round(returnRate * 100)}% recent return rate is included in the trust check.`
      : "Return outcome evidence is included when available."
  ];

  if (fit.recommended_size) {
    reasons.unshift(`Your safer size is ${fit.recommended_size}; selected ${selectedSize} is checked against fit memory and outcomes.`);
  }

  const missingLine = relevantGap
    ? `The main missing proof is ${label(String(relevantGap.attribute)).toLowerCase()}: ${String(relevantGap.summary).replace(/\.$/, "")}.`
    : "No major proof gap was found for the selected SKU.";
  if (relevantGap) {
    reasons.splice(fit.recommended_size ? 1 : 0, 0, `Seller proof still needs ${label(String(relevantGap.attribute)).toLowerCase()}: ${String(relevantGap.summary).replace(/\.$/, "")}.`);
  }
  const issueSentence = issueTitle
    ? `Main risk: ${issueTitle.toLowerCase()}.`
    : "One risk still needs a check before payment.";
  const summary = hasIssue
    ? `${product.seller_name} has evidence for ${product.title}. ${issueSentence} ${missingLine}`
    : `${product.seller_name} has SKU evidence for ${product.title}. ${missingLine}`;
  const caution = issueAction
    ?? (relevantGap ? `Do not treat this as a strong recommendation until ${label(String(relevantGap.attribute)).toLowerCase()} proof is reviewed.` : null);

  return {
    title: relevantGap ? "Check this proof before buying" : "Evidence is usable",
    summary,
    reasons: reasons.slice(0, 4),
    caution
  };
}

function normalizeAgentReasons(generatedReasons: string[], fallbackReasons: string[]) {
  const useful = generatedReasons
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0)
    .filter((reason) => !/^missing\s+/i.test(reason))
    .filter((reason) => !/proof is missing$/i.test(reason));
  return (useful.length >= 2 ? useful : fallbackReasons).slice(0, 4);
}

function shouldUseFallbackProductAdvice(title: string, summary: string, reasons: string[], query: string, passport: any, attribute: string) {
  const haystack = [title, summary, ...reasons].join(" ").toLowerCase();
  const normalizedSummary = normalizeText(summary);
  const normalizedQuery = normalizeText(query);
  const questionEcho = normalizedSummary.length > 12 && (
    summary.trim().endsWith("?") ||
    normalizedQuery.startsWith(normalizedSummary) ||
    normalizedSummary.startsWith(normalizedQuery)
  );
  const vague = [
    "lacks some details",
    "some details for a stronger recommendation",
    "product evidence is available",
    "missing daylight photo missing fabric",
    "missing fabric closeup",
    "missing packaging photo"
  ].some((phrase) => haystack.includes(phrase));
  const relevantGap = passport?.evidence_gaps?.some((gap: any) => gap.attribute === attribute || (attribute === "fabric" && gap.attribute === "transparency"));
  const overclaimsMissingProof = Boolean(relevantGap) && (
    haystack.includes("no evidence of") ||
    haystack.includes("no proof of") ||
    haystack.includes("no issue") ||
    haystack.includes("no issues") ||
    haystack.includes("safe to buy") ||
    haystack.includes("safe to consider")
  );
  return questionEcho || vague || overclaimsMissingProof;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
