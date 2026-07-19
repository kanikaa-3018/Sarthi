type GraphAnswer = {
  title: string;
  summary: string;
  reasons: string[];
  caution: string | null;
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
  const scorePercent = scoreFromCandidate(candidate);
  const returnRate = percent(evidence.return_rate ?? 0);
  const delivered = Number(evidence.delivered_orders_90d ?? 0);
  const sellerName = product.seller_name ?? seller.name ?? "this seller";
  const productName = shortTitle(product.title);
  const price = context.price_context?.latest_price ?? product.base_price;
  const weakEvidence = ["unknown", "weak"].includes(evidence.evidence_strength);
  const highReturn = Number(evidence.return_rate ?? 0) >= 0.18;
  const proofGapText = proofGaps.length ? proofGaps.map((gap) => labelize(gap.attribute)).join(", ") : "no major proof gap";
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
    return {
      title: proofGaps.length ? "Proof still needed" : "Proof coverage answer",
      summary: proofGaps.length
        ? `The graph is missing stronger proof for ${proofGapText}. Ask for that before relying on the claim.`
        : `The graph has usable proof coverage for ${productName}; still review the proof before checkout.`,
      reasons: cleanReasons([
        proofGaps.length
          ? `${proofGaps.length} proof gap(s) remain: ${proofGapText}.`
          : "No major proof coverage gap is flagged for this listing.",
        `${delivered} delivered order(s) and review evidence are used to cross-check seller claims.`,
        commonReason
      ]),
      caution: proofGaps.length ? "Buy only if the missing proof is not important to you, or wait for seller proof." : null
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
      ? "Do not rush checkout; review proof, fit, and return risk first."
      : null
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

function matches(query: string, words: string[]) {
  return words.some((word) => query.includes(word));
}

function cleanReasons(reasons: Array<string | null | undefined>) {
  return reasons
    .map((reason) => String(reason ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);
}
