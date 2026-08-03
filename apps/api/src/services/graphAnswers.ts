type GraphAnswer = {
  title: string;
  summary: string;
  reasons: string[];
  caution: string | null;
  unsupported?: boolean;
  support_reason?: string;
  matched_node_ids?: string[];
  highlighted_edge_ids?: string[];
  matched_path_ids?: string[];
  fact_ids?: string[];
  follow_up_questions?: string[];
};

type ProofGap = {
  attribute?: string;
  source_summary?: string;
  summary?: string;
  recommended_proof_type?: string;
  evidence_count?: number;
  sufficient?: boolean;
  fact_ids?: string[];
};

export function deterministicGraphChatAnswer(graph: any, query: string): GraphAnswer {
  const normalized = String(query ?? "").toLowerCase();
  const context = selectedContext(graph);
  if (!context) {
    return {
      title: "Evidence answer",
      summary: "Sarthi could not find a selected listing in this graph, so it cannot make a product-specific recommendation.",
      reasons: ["Open one product and run the trust check again.", "Seller, return, proof, and price records are needed for a grounded answer."],
      caution: "Do not treat this as a buy recommendation until product evidence loads."
    };
  }

  const product = context.product ?? {};
  const seller = context.seller ?? {};
  const verification = seller.verification?.verification_status ?? "unknown";
  const evidence = context.evidence ?? {};
  const candidate = context.candidate ?? {};
  const fit = context.fit ?? {};
  const proofGaps = proofCoverageGaps(context.proof_coverage);
  const proofGapDetails = proofGapMessages(proofGaps);
  const scorePercent = scoreFromCandidate(candidate);
  const returnRate = percent(evidence.return_rate ?? 0);
  const delivered = Number(evidence.delivered_orders_90d ?? 0);
  const sellerName = product.seller_name ?? seller.name ?? "this seller";
  const productName = shortTitle(product.title);
  const price = context.price_context?.latest_price ?? product.base_price;
  const weakEvidence = ["unknown", "weak"].includes(evidence.evidence_strength);
  const highReturn = Number(evidence.return_rate ?? 0) >= 0.18;
  const proofGapText = proofGapDetails.length
    ? proofGapDetails.map((gap) => gap.attribute).join(", ")
    : "no major proof gap";
  const commonReason = scorePercent !== null
    ? `Trust score is ${scorePercent}/100 after seller, returns, reviews, proof, and price checks.`
    : "Trust score is built from seller, returns, reviews, proof, and price checks.";

  if (matches(normalized, ["size", "fit", "xl", "large", "small", "tight", "loose", "chest"])) {
    return {
      title: "Size and fit answer",
      summary: `For ${productName}, Sarthi recommends ${fit.recommended_size ?? context.variant?.size ?? "the shown size"} with ${fit.confidence ?? "available"} confidence.`,
      reasons: cleanReasons([
        ...(fit.reasons ?? []).slice(0, 2),
        `${delivered} delivered order(s) and ${returnRate} return rate are connected to this SKU.`,
        commonReason
      ]),
      caution: highReturn ? "Returns are not low, so check measurements or choose COD if fit is uncertain." : null
    };
  }

  if (matches(normalized, ["similar", "compare", "alternative", "better", "which seller", "other seller"])) {
    const alternative = graph.ranking?.alternative;
    const altContext = graph.seller_context?.find((item: any) => item.variant?.variant_id === alternative);
    const altName = altContext?.product?.seller_name ?? altContext?.seller?.name ?? "another seller";
    return {
      title: "Comparison answer",
      summary: alternative
        ? `Sarthi compared similar listings and keeps ${sellerName} ahead unless ${altName} has a stronger score for your concern.`
        : `Sarthi compared the available similar listings and did not find a clearly stronger alternate seller.`,
      reasons: cleanReasons([
        graph.summary?.similarity?.summary ?? "Similarity is resolved before seller ranking.",
        commonReason,
        proofGaps.length ? `Proof gap to check: ${proofGapText}.` : "Proof coverage is not the main blocker."
      ]),
      caution: graph.ranking?.uncertainty === "high" ? "Ranking uncertainty is high, so inspect proof before checkout." : null
    };
  }

  if (matches(normalized, ["seller", "trust", "reliable", "rating", "shop", "safe"])) {
    return {
      title: "Seller trust answer",
      summary: `${sellerName} is ${verification === "verified" ? "verified" : `currently ${labelize(verification)}`}; Sarthi also checks dispatch, returns, and review credibility before recommending.`,
      reasons: cleanReasons([
        `Seller verification status is ${labelize(verification)}.`,
        `${delivered} delivered order(s), ${returnRate} return rate, and ${evidence.median_dispatch_hours ?? "unknown"} hour median dispatch are in the graph.`,
        commonReason
      ]),
      caution: verification !== "verified" ? "Seller verification is not complete, so avoid a strong buy decision until review clears." : null
    };
  }

  if (matches(normalized, ["proof", "evidence", "photo", "fabric", "color", "real", "authentic", "genuine"])) {
    const firstGap = proofGapDetails[0];
    return {
      title: proofGaps.length ? `Ask for ${firstGap?.attribute ?? "seller"} proof` : "Proof coverage answer",
      summary: proofGaps.length
        ? `${productName} is missing ${proofGapText}. These are seller-side proofs, so Sarthi should not mark this as high confidence until they are uploaded and reviewed.`
        : `The graph has usable proof coverage for ${productName}; still review the proof before checkout.`,
      reasons: cleanReasons([
        ...(proofGapDetails.length
          ? proofGapDetails.map((gap) => `${capitalize(gap.attribute)}: ${gap.buyerRisk} Ask for ${gap.proofType}.`)
          : ["No major proof coverage gap is flagged for this listing."]),
        `${delivered} delivered order(s) and review evidence are used to cross-check seller claims.`,
        commonReason
      ]),
      caution: proofGaps.length
        ? `Do not rely only on rating until ${proofGapText} proof is reviewed by admin.`
        : null
    };
  }

  if (matches(normalized, ["return", "exchange", "refund", "risk", "problem", "rto"])) {
    return {
      title: "Return risk answer",
      summary: `${productName} shows a ${returnRate} return rate across ${delivered} delivered order(s) in the current evidence graph.`,
      reasons: cleanReasons([
        `Evidence strength is ${labelize(evidence.evidence_strength ?? "unknown")}.`,
        context.top_return_reason ? `Top return reason is ${labelize(context.top_return_reason.return_reason)} from ${context.top_return_reason.count} case(s).` : "No dominant return reason is available.",
        commonReason
      ]),
      caution: highReturn || weakEvidence ? "Use caution because return evidence is either high or still thin." : null
    };
  }

  if (matches(normalized, ["price", "offer", "discount", "deal", "cheap", "cost"])) {
    return {
      title: "Price and offer answer",
      summary: `Latest checked price is Rs ${price ?? product.base_price ?? "unknown"} for ${productName}. Sarthi treats price as one factor, not the whole decision.`,
      reasons: cleanReasons([
        context.price_context?.offer?.message ?? "Offer truth is checked against price and campaign records when available.",
        `Price-value signal is ${Math.round(Number(candidate.factors?.price_value ?? 0) * 100) || "not enough data"}.`,
        commonReason
      ]),
      caution: context.price_context?.offer?.status === "no_prior_price" ? "There is not enough prior price history to prove a real discount." : null
    };
  }

  return {
    title: "Buying decision answer",
    summary: scorePercent !== null && scorePercent >= 72 && !proofGaps.length && verification === "verified"
      ? `${productName} is reasonable to buy from ${sellerName} if the price and size work for you.`
      : `${productName} still needs one careful check before a strong buy decision.`,
    reasons: cleanReasons([
      commonReason,
      `${delivered} delivered order(s), ${returnRate} return rate, and seller verification ${labelize(verification)} are connected.`,
      proofGaps.length ? `Missing or weak proof: ${proofGapText}.` : "No major proof gap is currently flagged."
    ]),
    caution: proofGaps.length || highReturn || weakEvidence
      ? "Review proof, fit, and return risk before checkout."
      : null
  };
}

export function graphQuestionSupport(query: string) {
  const normalized = String(query ?? "").toLowerCase().trim();
  if (!normalized) {
    return {
      supported: false,
      reason: "Ask about seller trust, fit, returns, reviews, proof, price, offer, or checkout risk."
    };
  }
  const supportedTerms = [
    "buy", "good", "safe", "risk", "trust", "score", "seller", "shop", "rating",
    "review", "return", "refund", "rto", "exchange", "proof", "evidence", "photo",
    "fabric", "cloth", "material", "color", "colour", "transparent", "genuine",
    "real", "authentic", "size", "fit", "xl", "large", "small", "tight", "loose",
    "chest", "measurement", "price", "offer", "discount", "timer", "deal",
    "prepaid", "cod", "delivery", "dispatch", "compare", "similar", "alternative"
  ];
  const unsupportedTerms = [
    "owner", "address", "phone", "bank account", "religion", "caste", "income",
    "medical", "disease", "legal case", "political", "employee", "private"
  ];
  if (unsupportedTerms.some((term) => normalized.includes(term))) {
    return {
      supported: false,
      reason: "That asks for private or off-platform information that is not in the product evidence graph."
    };
  }
  if (supportedTerms.some((term) => normalized.includes(term))) {
    return { supported: true, reason: "Question maps to connected product evidence." };
  }
  return {
    supported: false,
    reason: "No evidence path matched this claim. The graph only covers product, seller, SKU, returns, reviews, proof, price, offer, and checkout signals."
  };
}

export function unsupportedGraphAnswer(query: string, reason: string): GraphAnswer {
  return {
    title: "No evidence found for this claim",
    summary: `Sarthi could not ground "${String(query ?? "").trim() || "this question"}" in the current product graph.`,
    reasons: [
      reason,
      "No seller, SKU, return, review, proof, offer, or price node supports this claim.",
      "The trust score is not changed by unsupported questions."
    ],
    caution: "Do not infer private or unsupported claims from product evidence.",
    unsupported: true,
    support_reason: reason,
    matched_node_ids: [],
    highlighted_edge_ids: [],
    matched_path_ids: [],
    fact_ids: [],
    follow_up_questions: []
  };
}

function selectedContext(graph: any) {
  return graph?.seller_context?.find((context: any) => context.product?.product_id === graph.selected_product_id) ??
    graph?.seller_context?.[0] ??
    null;
}

function proofCoverageGaps(coverage: Record<string, any> | undefined) {
  return Object.values(coverage ?? {}).filter((item: any) => item && item.sufficient === false);
}

function proofGapMessages(gaps: ProofGap[]) {
  return gaps.slice(0, 4).map((gap) => {
    const attribute = labelize(gap.attribute || "seller proof");
    const summary = cleanSentence(gap.source_summary ?? gap.summary ?? "");
    return {
      attribute,
      proofType: proofRequirementLabel(gap.recommended_proof_type, gap.attribute),
      buyerRisk: proofBuyerRisk(gap.attribute, summary),
      summary
    };
  });
}

function proofRequirementLabel(proofType: string | undefined, attribute: string | undefined) {
  const normalized = String(proofType || attribute || "").toLowerCase();
  if (normalized.includes("fabric")) return "a clear fabric close-up";
  if (normalized.includes("measurement") || normalized.includes("size")) return "a readable measurement chart";
  if (normalized.includes("daylight") || normalized.includes("color") || normalized.includes("colour")) return "a daylight color photo";
  if (normalized.includes("packaging")) return "packaging and dispatch proof";
  if (normalized.includes("offer")) return "offer or price proof";
  return "seller proof";
}

function proofBuyerRisk(attribute: string | undefined, summary: string) {
  const normalized = `${attribute ?? ""} ${summary}`.toLowerCase();
  if (normalized.includes("transparent")) return "transparency is not proven yet.";
  if (normalized.includes("fabric") || normalized.includes("cloth") || normalized.includes("material")) {
    return "material claim is not proven yet.";
  }
  if (normalized.includes("measurement") || normalized.includes("size")) return "fit can still go wrong.";
  if (normalized.includes("color") || normalized.includes("colour")) return "real color may differ from photos.";
  if (normalized.includes("packaging")) return "dispatch condition is not proven yet.";
  if (normalized.includes("offer") || normalized.includes("price")) return "offer claim is not proven yet.";
  return "buyer expectation is not fully proven.";
}

function cleanSentence(value: string) {
  return value.trim().replace(/\.$/, "");
}

function scoreFromCandidate(candidate: any) {
  if (typeof candidate?.score_percent === "number") return Math.round(candidate.score_percent);
  if (typeof candidate?.score === "number") return Math.round(candidate.score * 100);
  return null;
}

function percent(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function shortTitle(value: unknown) {
  const text = String(value ?? "this product").split("-")[0].trim();
  return text || "this product";
}

function labelize(value: unknown) {
  return String(value ?? "unknown").replace(/_/g, " ");
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function matches(query: string, words: string[]) {
  return words.some((word) => query.includes(word));
}

function cleanReasons(reasons: Array<string | null | undefined>) {
  return reasons
    .map((reason) => String(reason ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);
}
