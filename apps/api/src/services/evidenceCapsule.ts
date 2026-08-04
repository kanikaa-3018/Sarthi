import {
  classifyCommerceQuestion,
  nodeKeysForIntent,
  type ClassifiedCommerceQuestion,
  type CommerceQuestionIntent
} from "./questionIntent.js";

export type EvidenceActionType =
  | "ask_proof"
  | "switch_size"
  | "compare_seller"
  | "continue"
  | "use_cod"
  | "pay_online"
  | "inspect_proof"
  | "cannot_answer";

export type EvidenceAction = {
  type: EvidenceActionType;
  label: string;
  reason: string;
  attribute?: string | null;
};

export type EvidenceCapsule = {
  mode: "graph_chat" | "product_advice";
  question: string;
  intent: CommerceQuestionIntent;
  classifier: ClassifiedCommerceQuestion;
  selected: {
    product_id: string | null;
    product_title: string;
    seller_name: string;
    variant_id: string | null;
    selected_size: string | null;
    requested_size: string | null;
    recommended_size: string | null;
  };
  verdict: "safe" | "needs_check" | "avoid" | "cannot_answer";
  confidence: "low" | "medium" | "high";
  direct_facts: string[];
  missing_facts: string[];
  risk_flags: string[];
  allowed_actions: EvidenceAction[];
  required_terms: string[];
  forbidden_topics: string[];
  fact_ids: string[];
  matched_node_ids: string[];
  highlighted_edge_ids: string[];
  retrieved_evidence: Array<{
    title: string;
    text: string;
    type: string;
    score?: number;
    fact_ids: string[];
  }>;
};

type RetrievedEvidence = {
  node_id: string;
  type: string;
  title: string;
  text: string;
  score?: number;
  fact_ids?: string[];
};

export function buildGraphEvidenceCapsule(
  graph: any,
  query: string,
  retrieved: RetrievedEvidence[] = [],
  context = selectedGraphContext(graph)
): EvidenceCapsule {
  const classifier = classifyCommerceQuestion(query);
  if (!context || classifier.intent === "unsupported") {
    return unsupportedCapsule("graph_chat", query, classifier);
  }
  const facts = graphFactsForIntent(context, graph, classifier);
  const matchedNodeIds = matchedNodeIdsForIntent(graph, context, classifier, retrieved);
  const highlightedEdgeIds = highlightedEdgesForNodes(graph, matchedNodeIds, retrieved);
  return {
    mode: "graph_chat",
    question: query,
    intent: classifier.intent,
    classifier,
    selected: {
      ...selectedFromContext(context),
      requested_size: classifier.requested_size
    },
    ...facts,
    forbidden_topics: forbiddenTopicsForIntent(classifier.intent),
    fact_ids: unique([
      ...facts.fact_ids,
      ...retrieved.flatMap((item) => item.fact_ids ?? [])
    ]).slice(0, 16),
    matched_node_ids: matchedNodeIds,
    highlighted_edge_ids: highlightedEdgeIds,
    retrieved_evidence: retrieved.slice(0, 4).map((item) => ({
      title: item.title,
      text: item.text,
      type: item.type,
      score: item.score,
      fact_ids: item.fact_ids ?? []
    }))
  };
}

export function buildProductAdviceEvidenceCapsule(
  query: string,
  product: any,
  passport: any
): EvidenceCapsule {
  const classifier = classifyCommerceQuestion(query);
  if (!product || !passport || classifier.intent === "unsupported") {
    return unsupportedCapsule("product_advice", query, classifier);
  }
  const context = {
    product,
    seller: { name: product.seller_name, verification: passport.trust_state?.seller_verification ?? {} },
    variant: passport.variant,
    evidence: passport.outcome_evidence,
    fit: passport.fit,
    proof_coverage: passport.proof_coverage,
    candidate: {
      score: scoreFromPassport(passport),
      score_percent: Math.round(scoreFromPassport(passport) * 100)
    },
    price_context: {
      latest_price: passport.variant?.current_price ?? product.base_price,
      offer: passport.offer_truth
    },
    top_return_reason: passport.avoidable_issue
      ? { return_reason: passport.avoidable_issue.reason, count: passport.avoidable_issue.count }
      : null,
    node_ids: {}
  };
  const facts = graphFactsForIntent(context, { edges: [], nodes: [] }, classifier);
  return {
    mode: "product_advice",
    question: query,
    intent: classifier.intent,
    classifier,
    selected: {
      ...selectedFromContext(context),
      requested_size: classifier.requested_size
    },
    ...facts,
    forbidden_topics: forbiddenTopicsForIntent(classifier.intent),
    fact_ids: unique([...(passport.fact_ids ?? []), ...facts.fact_ids]).slice(0, 16),
    matched_node_ids: [],
    highlighted_edge_ids: [],
    retrieved_evidence: []
  };
}

export function deterministicEvidenceAnswer(capsule: EvidenceCapsule) {
  const action = capsule.allowed_actions[0] ?? { label: "Check proof", reason: "Evidence is still being verified." };
  const title = titleForCapsule(capsule);
  const summary = summaryForCapsule(capsule, action);
  const reasons = unique([
    ...capsule.direct_facts.slice(0, 2),
    ...capsule.missing_facts.slice(0, 1),
    ...capsule.risk_flags.slice(0, 1)
  ]).slice(0, 3);
  return {
    title,
    summary,
    reasons: reasons.length ? reasons : ["Sarthi could not find enough verified evidence for this exact question."],
    caution: capsule.verdict === "safe"
      ? null
      : capsule.missing_facts[0] ?? capsule.risk_flags[0] ?? action.reason
  };
}

function graphFactsForIntent(context: any, graph: any, classifier: ClassifiedCommerceQuestion) {
  const product = context.product ?? {};
  const seller = context.seller ?? {};
  const evidence = context.evidence ?? {};
  const fit = context.fit ?? {};
  const proofGaps = proofCoverageGaps(context.proof_coverage);
  const selectedSize = stringOrNull(context.variant?.size);
  const requestedSize = classifier.requested_size;
  const requestedAttribute = classifier.proof_attribute;
  const score = scorePercent(context.candidate);
  const returnRate = Number(evidence.return_rate ?? 0);
  const delivered = Number(evidence.delivered_orders_90d ?? 0);
  const verification = seller.verification?.verification_status ?? "unknown";
  const productTitle = shortTitle(product.title);
  const sellerName = product.seller_name ?? seller.name ?? "this seller";
  const proofGap = proofGapForAttribute(proofGaps, requestedAttribute);
  const facts: string[] = [];
  const missing: string[] = [];
  const risks: string[] = [];
  const actions: EvidenceAction[] = [];
  const requiredTerms = requiredTermsForIntent(classifier, context);
  const factIds = new Set<string>([
    ...(evidence.fact_ids ?? []),
    ...(fit.fact_ids ?? []),
    ...(context.candidate?.fact_ids ?? []),
    ...(context.price_context?.offer?.fact_ids ?? [])
  ]);

  if (score !== null) facts.push(`Trust score is ${score}/100 for ${sellerName}.`);

  if (classifier.intent === "fit_question") {
    if (requestedSize && selectedSize && requestedSize !== selectedSize) {
      facts.push(`You asked about size ${requestedSize}, but this evidence graph is currently checking size ${selectedSize}.`);
      missing.push(`Size ${requestedSize} SKU outcomes are not loaded in this answer.`);
      actions.push({ type: "switch_size", label: `Check size ${requestedSize}`, reason: "Exact fit advice needs the selected SKU size." });
    } else {
      facts.push(`Selected size is ${selectedSize ?? "unknown"}; safer size is ${fit.recommended_size ?? "not available"}.`);
      facts.push(`Fit confidence is ${fit.confidence ?? "unknown"} from ${delivered} delivered order(s).`);
      if (Array.isArray(fit.reasons)) facts.push(...fit.reasons.slice(0, 1));
      actions.push({ type: "continue", label: "Use this size only if fit proof is enough", reason: "Fit was checked against SKU outcomes." });
    }
    const measurementGap = proofGapForAttribute(proofGaps, "measurement");
    if (measurementGap) missing.push(`Measurement proof is missing or weak: ${proofSummary(measurementGap)}.`);
    if (returnRate >= 0.15) risks.push(`Return rate is ${percent(returnRate)}, so fit risk is not low.`);
  } else if (classifier.intent === "proof_missing") {
    const attribute = requestedAttribute ?? proofGap?.attribute ?? "seller";
    if (proofGap) {
      missing.push(`${labelize(proofGap.attribute)} proof is missing or weak: ${proofSummary(proofGap)}.`);
      actions.push({ type: "ask_proof", label: `Ask for ${proofTypeLabel(proofGap)} proof`, reason: "Seller proof must be reviewed before confidence improves.", attribute: proofGap.attribute });
    } else {
      facts.push(`${labelize(attribute)} proof has usable coverage for ${productTitle}.`);
      actions.push({ type: "inspect_proof", label: "Open proof trail", reason: "Proof exists and can be inspected." });
    }
    facts.push(`${delivered} delivered order(s) and review evidence are used to cross-check seller claims.`);
  } else if (classifier.intent === "compare_sellers") {
    const candidates = (graph.seller_context ?? []).slice(0, 4).map((item: any) => ({
      seller: item.product?.seller_name ?? item.seller?.name ?? "seller",
      score: scorePercent(item.candidate),
      returns: Number(item.evidence?.return_rate ?? 0)
    }));
    const best = candidates.filter((item: any) => item.score !== null).sort((a: any, b: any) => b.score - a.score)[0];
    facts.push(best ? `${best.seller} is currently strongest at ${best.score}/100.` : `${sellerName} is the selected seller for this check.`);
    facts.push(`${candidates.length || 1} comparable seller option(s) were checked for this item.`);
    actions.push({ type: "compare_seller", label: "Compare seller proof", reason: "Seller choice depends on score, returns, proof, and price." });
  } else if (classifier.intent === "seller_trust") {
    facts.push(`${sellerName} verification status is ${labelize(verification)}.`);
    facts.push(`${delivered} delivered order(s), ${percent(returnRate)} return rate, and ${evidence.median_dispatch_hours ?? "unknown"}h median dispatch are connected.`);
    if (verification !== "verified") risks.push("Seller verification is not complete.");
    actions.push({ type: "inspect_proof", label: "Check seller proof", reason: "Seller trust uses verification plus SKU outcomes." });
  } else if (classifier.intent === "review_credibility") {
    facts.push(`Reviews are weighted with return and proof signals, not used alone.`);
    facts.push(`Review signal contributes ${factorPercent(context.candidate, "review_signal")} to the score.`);
    if (context.top_return_reason) risks.push(`Top return reason is ${labelize(context.top_return_reason.return_reason)} from ${context.top_return_reason.count} case(s).`);
    actions.push({ type: "inspect_proof", label: "See trusted review basis", reason: "Raw reviews need proof and return cross-checks." });
  } else if (classifier.intent === "price_offer") {
    const offer = context.price_context?.offer ?? {};
    facts.push(`Latest checked price is Rs ${context.price_context?.latest_price ?? product.base_price ?? "unknown"}.`);
    facts.push(offer.message ?? `Offer status is ${labelize(offer.status ?? "unknown")}.`);
    if (offer.status === "no_prior_price") missing.push("Prior price history is not enough to prove a real discount.");
    actions.push({ type: "continue", label: "Use verified price", reason: "Price is checked with offer and campaign evidence." });
  } else if (classifier.intent === "return_risk") {
    facts.push(`${productTitle} has ${percent(returnRate)} return rate across ${delivered} delivered order(s).`);
    facts.push(`Evidence strength is ${labelize(evidence.evidence_strength ?? "unknown")}.`);
    if (context.top_return_reason) risks.push(`Main return reason: ${labelize(context.top_return_reason.return_reason)}.`);
    actions.push({ type: returnRate >= 0.18 ? "use_cod" : "continue", label: returnRate >= 0.18 ? "Prefer COD or ask proof" : "Return risk looks usable", reason: "Return outcomes are part of the trust score." });
  } else if (classifier.intent === "checkout_payment") {
    const proofWeak = proofGaps.length > 0;
    facts.push(`Payment advice uses trust score ${score ?? "unknown"}/100, proof state, return risk, and offer status.`);
    facts.push(`Return rate is ${percent(returnRate)} and proof gaps are ${proofGaps.length}.`);
    actions.push(score !== null && score >= 72 && !proofWeak && returnRate < 0.15
      ? { type: "pay_online", label: "Pay online if offer is verified", reason: "Trust, return, and proof signals are strong enough." }
      : { type: "use_cod", label: "Keep COD available", reason: "Proof or return risk still needs buyer control." });
  } else {
    facts.push(`${productTitle} from ${sellerName} is checked using seller, SKU, return, review, proof, price, and fit evidence.`);
    facts.push(`${delivered} delivered order(s), ${percent(returnRate)} return rate, and seller verification ${labelize(verification)} are connected.`);
    if (proofGaps.length) missing.push(`Missing or weak proof: ${proofGaps.map((gap) => labelize(gap.attribute)).join(", ")}.`);
    actions.push({ type: proofGaps.length ? "ask_proof" : "continue", label: proofGaps.length ? "Ask proof first" : "Continue with proof", reason: "Decision is based on connected evidence." });
  }

  for (const gap of proofGaps) {
    for (const factId of gap.fact_ids ?? []) factIds.add(factId);
  }
  const verdict = verdictFromFacts(score, missing, risks, returnRate, verification);
  return {
    verdict,
    confidence: confidenceFromFacts(score, missing, delivered),
    direct_facts: unique(facts).slice(0, 5),
    missing_facts: unique(missing).slice(0, 4),
    risk_flags: unique(risks).slice(0, 4),
    allowed_actions: actions.length
      ? actions.slice(0, 3)
      : [{
          type: "inspect_proof" as const,
          label: "Open proof trail",
          reason: "Evidence should be inspected before checkout."
        }],
    required_terms: requiredTerms,
    fact_ids: [...factIds].slice(0, 16)
  };
}

function unsupportedCapsule(mode: EvidenceCapsule["mode"], query: string, classifier: ClassifiedCommerceQuestion): EvidenceCapsule {
  return {
    mode,
    question: query,
    intent: "unsupported",
    classifier,
    selected: {
      product_id: null,
      product_title: "this product",
      seller_name: "this seller",
      variant_id: null,
      selected_size: null,
      requested_size: classifier.requested_size,
      recommended_size: null
    },
    verdict: "cannot_answer",
    confidence: "low",
    direct_facts: [],
    missing_facts: [classifier.unsupported_reason ?? "No supported evidence path matched this question."],
    risk_flags: [],
    allowed_actions: [{ type: "cannot_answer", label: "Ask about product proof", reason: "Sarthi only answers from marketplace evidence." }],
    required_terms: [],
    forbidden_topics: UNSAFE_FORBIDDEN_TOPICS,
    fact_ids: [],
    matched_node_ids: [],
    highlighted_edge_ids: [],
    retrieved_evidence: []
  };
}

function selectedGraphContext(graph: any) {
  return graph?.seller_context?.find((item: any) => item.product?.product_id === graph.selected_product_id)
    ?? graph?.seller_context?.[0]
    ?? null;
}

function selectedFromContext(context: any) {
  return {
    product_id: stringOrNull(context.product?.product_id),
    product_title: shortTitle(context.product?.title),
    seller_name: context.product?.seller_name ?? context.seller?.name ?? "this seller",
    variant_id: stringOrNull(context.variant?.variant_id),
    selected_size: stringOrNull(context.variant?.size),
    requested_size: null,
    recommended_size: stringOrNull(context.fit?.recommended_size)
  };
}

function matchedNodeIdsForIntent(graph: any, context: any, classifier: ClassifiedCommerceQuestion, retrieved: RetrievedEvidence[]) {
  const nodeIds = context?.node_ids ?? {};
  const keys = nodeKeysForIntent(classifier.intent);
  const fromIntent = keys.map((key) => nodeIds[key]).filter(Boolean).map(String);
  const graphNodeIds = new Set((graph.nodes ?? []).map((node: any) => node.id));
  const fromRetrieval = retrieved
    .map((item) => item.node_id)
    .filter((nodeId) => graphNodeIds.has(nodeId));
  return unique<string>([...fromIntent, ...fromRetrieval]).filter((nodeId) => graphNodeIds.has(nodeId)).slice(0, 8);
}

function highlightedEdgesForNodes(graph: any, nodeIds: string[], retrieved: RetrievedEvidence[]) {
  const nodeSet = new Set(nodeIds);
  const retrievedIds = new Set(retrieved.map((item) => item.node_id));
  return unique<string>((graph.edges ?? [])
    .filter((edge: any) => retrievedIds.has(edge.id) || nodeSet.has(edge.source) || nodeSet.has(edge.target))
    .slice(0, 8)
    .map((edge: any) => String(edge.id)));
}

function proofCoverageGaps(coverage: Record<string, any> | undefined) {
  return Object.values(coverage ?? {}).filter((item: any) => item && item.sufficient === false);
}

function proofGapForAttribute(gaps: any[], attribute: string | null | undefined) {
  if (!gaps.length) return null;
  if (!attribute) return gaps[0];
  const normalized = attribute === "transparency"
    ? ["transparency", "fabric"]
    : attribute === "measurement"
      ? ["measurement", "size"]
      : [attribute];
  return gaps.find((gap) => normalized.includes(String(gap.attribute ?? "").toLowerCase())) ?? gaps[0];
}

function proofSummary(gap: any) {
  return String(gap.source_summary ?? gap.summary ?? "seller proof is not sufficient").replace(/\.$/, "");
}

function proofTypeLabel(gap: any) {
  const type = String(gap.recommended_proof_type ?? gap.attribute ?? "seller proof").replace(/_/g, " ");
  if (type.includes("fabric")) return "fabric close-up";
  if (type.includes("measurement") || type.includes("size")) return "measurement chart";
  if (type.includes("daylight") || type.includes("color")) return "daylight color photo";
  if (type.includes("packaging")) return "packaging";
  if (type.includes("offer") || type.includes("price")) return "price";
  return type;
}

function requiredTermsForIntent(classifier: ClassifiedCommerceQuestion, context: any) {
  const terms = new Set<string>();
  if (classifier.requested_size) terms.add(classifier.requested_size.toLowerCase());
  if (context.variant?.size) terms.add(String(context.variant.size).toLowerCase());
  if (classifier.proof_attribute) terms.add(labelize(classifier.proof_attribute));
  if (classifier.intent === "fit_question") terms.add("size");
  if (classifier.intent === "proof_missing") terms.add("proof");
  if (classifier.intent === "seller_trust") terms.add("seller");
  if (classifier.intent === "review_credibility") terms.add("review");
  if (classifier.intent === "price_offer") terms.add("price");
  if (classifier.intent === "return_risk") terms.add("return");
  if (classifier.intent === "compare_sellers") terms.add("seller");
  if (classifier.intent === "checkout_payment") terms.add("payment");
  return [...terms].filter(Boolean);
}

function forbiddenTopicsForIntent(intent: CommerceQuestionIntent) {
  const irrelevantByIntent: Record<CommerceQuestionIntent, string[]> = {
    fit_question: ["daylight photo", "color photo", "fabric close-up", "timer reset"],
    seller_trust: ["chest size", "daylight photo"],
    proof_missing: [],
    review_credibility: ["chest size", "payment mode"],
    price_offer: ["chest size", "fabric close-up"],
    return_risk: ["bank offer", "timer reset"],
    compare_sellers: [],
    checkout_payment: ["daylight photo"],
    buying_decision: [],
    unsupported: UNSAFE_FORBIDDEN_TOPICS
  };
  return [...UNSAFE_FORBIDDEN_TOPICS, ...(irrelevantByIntent[intent] ?? [])];
}

const UNSAFE_FORBIDDEN_TOPICS = [
  "guaranteed",
  "official",
  "bank account",
  "phone number",
  "personal address",
  "religion",
  "caste"
];

function verdictFromFacts(score: number | null, missing: string[], risks: string[], returnRate: number, verification: string) {
  if (score !== null && score < 50) return "avoid" as const;
  if (missing.length || risks.length || returnRate >= 0.18 || verification !== "verified") return "needs_check" as const;
  if (score !== null && score >= 72) return "safe" as const;
  return "needs_check" as const;
}

function confidenceFromFacts(score: number | null, missing: string[], delivered: number) {
  if (missing.length || delivered < 8) return "low" as const;
  if (score !== null && score >= 72 && delivered >= 20) return "high" as const;
  return "medium" as const;
}

function titleForCapsule(capsule: EvidenceCapsule) {
  if (capsule.verdict === "cannot_answer") return "No verified answer found";
  if (capsule.intent === "fit_question") {
    if (capsule.selected.requested_size && capsule.selected.selected_size && capsule.selected.requested_size !== capsule.selected.selected_size) {
      return `Size ${capsule.selected.requested_size} is not verified here`;
    }
    return "Fit answer";
  }
  if (capsule.intent === "proof_missing") return capsule.missing_facts.length ? "Proof is still needed" : "Proof is usable";
  if (capsule.intent === "compare_sellers") return "Seller comparison answer";
  if (capsule.intent === "checkout_payment") return "Payment guidance";
  if (capsule.intent === "price_offer") return "Price proof answer";
  if (capsule.intent === "review_credibility") return "Review credibility answer";
  if (capsule.intent === "return_risk") return "Return risk answer";
  if (capsule.intent === "seller_trust") return "Seller trust answer";
  return "Buying decision answer";
}

function summaryForCapsule(capsule: EvidenceCapsule, action: Pick<EvidenceAction, "label" | "reason">) {
  const direct = capsule.direct_facts[0] ?? "Sarthi checked the available evidence.";
  if (capsule.verdict === "cannot_answer") return capsule.missing_facts[0] ?? "No supported evidence path matched this question.";
  if (capsule.missing_facts.length) return `${direct} ${action.label}: ${action.reason}`;
  return `${direct} ${action.reason}`;
}

function scorePercent(candidate: any) {
  if (typeof candidate?.score_percent === "number") return Math.round(candidate.score_percent);
  if (typeof candidate?.score === "number") return Math.round(candidate.score * 100);
  return null;
}

function scoreFromPassport(passport: any) {
  const score = passport.trust_state?.score ?? passport.truth_summary?.score ?? null;
  if (typeof score === "number") return score > 1 ? score / 100 : score;
  const status = passport.truth_summary?.status;
  if (status === "ready") return 0.76;
  if (status === "watch") return 0.62;
  return 0.55;
}

function factorPercent(candidate: any, key: string) {
  const value = Number(candidate?.factors?.[key] ?? 0);
  return Number.isFinite(value) && value > 0 ? `${Math.round(value * 100)}%` : "limited evidence";
}

function shortTitle(value: unknown) {
  return String(value ?? "this product").split("-")[0].trim() || "this product";
}

function labelize(value: unknown) {
  return String(value ?? "unknown").replace(/_/g, " ");
}

function percent(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function stringOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}
