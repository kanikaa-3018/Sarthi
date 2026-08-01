import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Info,
  Layers,
  Palette,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Star,
  Tag,
  Truck
} from "lucide-react";
import { t, type LanguageCode } from "../i18n";
import type { CompareResponse, Product, RegretDecisionResponse, TrustRunResponse } from "../types/api";

type Props = {
  comparison: CompareResponse;
  productCatalog: Product[];
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  decision?: RegretDecisionResponse | null;
  trustRun?: TrustRunResponse | null;
  onContinue: () => void;
  onOpenAudit: () => void;
  onSelectProduct?: (productId: string, variantId?: string | null) => void;
};

type CandidateScore = CompareResponse["ranking"]["candidates"][number];

export function CompareSheet({
  comparison,
  productCatalog,
  language,
  experienceMode,
  decision,
  trustRun,
  onContinue,
  onOpenAudit,
  onSelectProduct
}: Props) {
  const [alternativeOpen, setAlternativeOpen] = useState(false);
  const ranking = comparison.ranking;
  const fit = comparison.fit;
  const isSimple = experienceMode === "simple";
  const visibleFactors = isSimple ? ranking.top_factors.slice(0, 2) : ranking.top_factors;
  const winnerDetails = getProductDetailsForVariant(ranking.winner, productCatalog);
  const winnerCandidate = ranking.candidates.find((candidate) => candidate.variant_id === ranking.winner) ?? null;
  const winnerTrust = winnerDetails.product?.buyer_trust ?? null;
  const canRecommendWinner = winnerTrust?.can_recommend ?? (winnerCandidate ? trustScorePercent(winnerCandidate) >= 75 : false);
  const alternativeDetails = ranking.alternative
    ? getProductDetailsForVariant(ranking.alternative, productCatalog)
    : null;
  const candidateRows = ranking.candidates.map((candidate, index) => ({
    candidate,
    details: getProductDetailsForVariant(candidate.variant_id, productCatalog),
    index,
    isWinner: candidate.variant_id === ranking.winner,
    isAlternative: candidate.variant_id === ranking.alternative
  }));
  const sellerOptionRows = uniqueSellerCandidateRows(candidateRows);
  const sellerListingRows = sellerListingOptions(comparison, productCatalog, candidateRows, fit.recommended_size);

  return (
    <div className="compare-sheet">
      <section className="compare-best-card interactive-lift">
        <div className="compare-card-header">
          <div className="compare-title-row">
            <span className={`compare-icon-badge ${canRecommendWinner ? "positive" : "watch"}`}>
              {canRecommendWinner ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            </span>
            <div>
              <span className="eyebrow">{canRecommendWinner ? t(language, "bestMatchForYou") : t(language, "checkOnce")}</span>
              <h3>{winnerDetails.sellerName}</h3>
            </div>
          </div>
          <div className="compare-score-ring">
            <strong>{winnerCandidate ? trustScorePercent(winnerCandidate) : "--"}</strong>
            <span>/100</span>
          </div>
        </div>

        <div className="compare-kv-panel">
          <div className="kv-row">
            <span>{t(language, "product")}</span>
            <strong>{winnerDetails.title}</strong>
          </div>
          <div className="kv-row">
            <span>{t(language, "price")}</span>
            <strong className="compare-price">Rs {winnerDetails.price}</strong>
          </div>
          <div className="kv-row">
            <span>{t(language, "size")}</span>
            <strong>
              <span className="ui-badge neutral">{fit.recommended_size}</span>
            </strong>
          </div>
        </div>

        {comparison.similarity && (
          <div className="compare-match-strip">
            <Layers size={14} />
            <strong>{comparison.similarity.distinct_seller_count} {t(language, "similarSellers")}</strong>
            <span>{matchReasons(comparison.similarity.candidates, language)}</span>
          </div>
        )}

        {winnerTrust && !winnerTrust.can_recommend && (
          <div className="compare-simple-note">
            <AlertTriangle size={14} />
            <span>{winnerTrust.buyer_guidance}</span>
          </div>
        )}

        <TrustRunSummary
          comparison={comparison}
          decision={decision}
          trustRun={trustRun}
          winner={winnerCandidate}
          language={language}
        />

        <div className="compare-similar-strip">
          <span className="compare-section-label">Same item options</span>
          <div className="compare-similar-list">
            {sellerListingRows.slice(0, isSimple ? 3 : 4).map((option) => (
              <button
                key={`${option.product.product_id}-${option.variantId}`}
                type="button"
                className={`compare-similar-card ${option.isRecommended ? "winner" : ""} ${option.isCurrent ? "current" : ""}`}
                data-product-id={option.product.product_id}
                data-variant-id={option.variantId}
                onClick={() => {
                  if (onSelectProduct) {
                    onSelectProduct(option.product.product_id, option.variantId);
                  }
                }}
              >
                <img
                  src={option.imageUrl}
                  alt={option.title}
                  onError={(event) => { event.currentTarget.src = "/product-blue.svg"; }}
                />
                <div>
                  <strong>{option.product.seller_name}</strong>
                  <span>{option.title} · Rs {option.price}</span>
                </div>
                <small>{option.score === null ? "--" : option.score}/100</small>
                <em>{option.isCurrent ? "Current" : option.isRecommended ? "Best score" : "Open"}</em>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <div className="compare-reason-list">
          <span className="compare-section-label">{t(language, "whyThisOne")}</span>
          {visibleFactors.map((factor) => (
            <div className="reason-row" key={factor}>
              <FactorIcon factor={factor} />
              <span>{humanFactorLabel(factor, language)}</span>
            </div>
          ))}
        </div>

        {winnerCandidate && (
          <div className="compare-factor-meter-list">
            {factorRowsForCandidate(winnerCandidate, language).map((factor) => (
              <div className="compare-factor-meter" key={factor.key}>
                <div>
                  <span>{factor.label}</span>
                  <strong>{factor.value}%</strong>
                </div>
                <i>
                  <b style={{ width: `${factor.value}%` }} />
                </i>
              </div>
            ))}
          </div>
        )}
      </section>

      {!isSimple && ranking.alternative && alternativeDetails && (
        <section className={`compare-alternative-card ${alternativeOpen ? "open" : ""}`}>
          <button
            type="button"
            className="compare-alternative-toggle"
            onClick={() => setAlternativeOpen((open) => !open)}
            aria-expanded={alternativeOpen}
          >
            <div>
              <span className="eyebrow">{t(language, "alsoConsider")}</span>
              <strong>{alternativeDetails.sellerName}</strong>
              <small>Rs {alternativeDetails.price} | {t(language, "size")} {fit.recommended_size}</small>
            </div>
            <ChevronDown size={16} />
          </button>
          {alternativeOpen && (
            <div className="compare-alternative-body">
              <div className="reason-row">
                <Tag size={16} />
                <span>{t(language, "usefulIfPricePriority")}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {!isSimple && (
        <div className="compare-engine-card">
          <div className="compare-engine-header">
            <div>
            <span className="eyebrow">{t(language, "trustRanking")}</span>
              <h4>{t(language, "sellerOptionsChecked")}</h4>
            </div>
            <span className="ui-badge neutral">{sellerOptionRows.length} {t(language, "checked")}</span>
          </div>
          <p>{t(language, "rankingExplainer")}</p>
          {ranking.weighting && (
            <div className="compare-weight-note">
              <span>{t(language, "weightPolicy")}</span>
              <strong>{formatPolicyLabel(ranking.weighting.version)}</strong>
            </div>
          )}
          <div className="compare-candidate-list">
            {sellerOptionRows.map(({ candidate, details, isWinner, isAlternative }, index) => (
              <div
                key={candidate.variant_id}
                className={`compare-candidate-row ${isWinner ? "winner" : ""} ${isAlternative ? "alternative" : ""}`}
                role={onSelectProduct && details.product ? "button" : undefined}
                tabIndex={onSelectProduct && details.product ? 0 : undefined}
                onClick={() => {
                  if (onSelectProduct && details.product) {
                    onSelectProduct(details.product.product_id, candidate.variant_id);
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && onSelectProduct && details.product) {
                    e.preventDefault();
                    onSelectProduct(details.product.product_id, candidate.variant_id);
                  }
                }}
              >
                <div className="compare-rank-pill">
                  {isWinner ? <CheckCircle2 size={13} /> : <span>{index + 1}</span>}
                </div>
                <div className="compare-candidate-main">
                  <strong>{details.sellerName}</strong>
                  <small>{details.title} | Rs {details.price}</small>
                  <div className="compare-factor-chips">
                    <span><Ruler size={12} /> {t(language, "fit")} {factorPercent(candidate, "fit_match")}</span>
                    <span><RotateCcw size={12} /> {t(language, "returnsChecked")} {factorPercent(candidate, "outcome_quality")}</span>
                    <span><ShieldCheck size={12} /> {t(language, "trust")} {factorPercent(candidate, "seller_trust")}</span>
                    <span><Truck size={12} /> {t(language, "dispatch")} {factorPercent(candidate, "fulfilment_reliability")}</span>
                    <span><Info size={12} /> {t(language, "proof")} {factorPercent(candidate, "proof_coverage")}</span>
                  </div>
                </div>
                <div className="compare-score-cell">
                  <strong>{trustScorePercent(candidate)}</strong>
                  <span>/100</span>
                  <i style={{ width: `${trustScorePercent(candidate)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="compare-sheet-footer">
        <span>
          <Info size={12} />
          {isSimple ? t(language, "proofAvailable") : `${comparison.graph_path.relationships.length} ${t(language, "evidenceLinksChecked")}`}
        </span>
        <button type="button" onClick={onOpenAudit}>
          <HelpCircle size={12} />
          {isSimple ? t(language, "proof") : t(language, "whyThisOptionWon")}
        </button>
      </div>

      <button className="compare-primary-cta" type="button" onClick={onContinue}>
        {t(language, "chooseThisOption")}
      </button>
    </div>
  );
}

function FactorIcon({ factor }: { factor: string }) {
  const normalized = factor.toLowerCase();
  if (normalized.includes("fit") || normalized.includes("size")) return <Ruler size={16} />;
  if (normalized.includes("return") || normalized.includes("outcome")) return <RotateCcw size={16} />;
  if (normalized.includes("dispatch") || normalized.includes("fulfil")) return <Truck size={16} />;
  if (normalized.includes("review") || normalized.includes("rating")) return <Star size={16} />;
  if (normalized.includes("price") || normalized.includes("value")) return <Tag size={16} />;
  if (normalized.includes("color")) return <Palette size={16} />;
  if (normalized.includes("fabric")) return <Layers size={16} />;
  return <ShieldCheck size={16} />;
}

function TrustRunSummary({
  comparison,
  decision,
  trustRun,
  winner,
  language
}: {
  comparison: CompareResponse;
  decision?: RegretDecisionResponse | null;
  trustRun?: TrustRunResponse | null;
  winner: CandidateScore | null;
  language: LanguageCode;
}) {
  const factCount = trustRun?.summary.fact_count ?? new Set([
    ...(decision?.fact_ids ?? []),
    ...(comparison.graph_path.fact_ids ?? []),
    ...(winner?.fact_ids ?? [])
  ]).size;
  const sellerCount = trustRun?.summary.seller_count ?? comparison.similarity?.distinct_seller_count ?? comparison.ranking.candidates.length;
  const proofItems = decision ? Object.values(decision.sku_truth_passport.proof_coverage) : [];
  const sufficientProofCount = proofItems.filter((item) => item.sufficient).length;
  const reviewSummary = decision?.sku_truth_passport.review_evidence.credibility_summary;
  const scoreItems = winner?.score_breakdown?.items ?? [];
  const policyVersion = winner?.weight_version ?? comparison.ranking.weighting?.version ?? "trust-policy-v1";
  const agentMode = trustRun ? formatAgentMode(trustRun.agent.mode) : trustRunAgentMode(comparison, decision);
  const missingProof = decision?.missing_proof;

  const fallbackSteps = [
    {
      label: "Similar listings",
      value: `${sellerCount} sellers`,
      detail: comparison.similarity?.summary ?? "Mapped by product cluster, catalog facts, and seller context.",
      status: sellerCount > 1 ? "done" : "watch"
    },
    {
      label: "Seller gate",
      value: scoreValue(winner, "seller_trust"),
      detail: "Verification, dispatch, and seller reliability are checked before recommendation.",
      status: scoreStatus(winner, "seller_trust", 0.62)
    },
    {
      label: "SKU outcomes",
      value: scoreValue(winner, "outcome_quality"),
      detail: decision
        ? `${decision.sku_truth_passport.outcome_evidence.delivered_orders_90d} recent deliveries and return rate were used.`
        : "Delivered orders and return outcomes were used.",
      status: scoreStatus(winner, "outcome_quality", 0.62)
    },
    {
      label: "Review credibility",
      value: reviewSummary
        ? `${reviewSummary.credible_review_count}/${reviewSummary.review_count}`
        : scoreValue(winner, "review_signal"),
      detail: reviewSummary
        ? `${reviewSummary.reliability} reliability. Low-weight reviews do not dominate the score.`
        : "Review score is weighted instead of trusting every rating equally.",
      status: reviewSummary && reviewSummary.reliability !== "weak" ? "done" : scoreStatus(winner, "review_signal", 0.58)
    },
    {
      label: "Proof and offer",
      value: `${sufficientProofCount}/${Math.max(proofItems.length, 1)} proofs`,
      detail: missingProof
        ? `${missingProof.title}. The seller can be asked for this proof.`
        : "No major proof gap blocked this choice.",
      status: missingProof ? "watch" : "done"
    }
  ] as const;
  const steps = trustRun?.steps.length
    ? trustRun.steps.map((step) => ({
      label: step.label,
      value: step.value,
      detail: step.summary,
      status: normalizeTrustRunStatus(step.status)
    }))
    : fallbackSteps;
  const displayScore = trustRun?.summary.score_percent ?? (winner ? trustScorePercent(winner) : null);
  const headline = trustRun?.summary.headline ?? "Sarthi checked this like a kept-order decision.";
  const summary = trustRun?.summary.body;
  const checkCount = trustRun?.agent.tools_used.length ?? (scoreItems.length || 6);

  return (
    <section className="trust-run-card" aria-label="Sarthi trust run">
      <div className="trust-run-card-header">
        <div>
          <span className="eyebrow">Trust run</span>
          <h4>{headline}</h4>
          {summary && <p>{summary}</p>}
        </div>
        <span className={`trust-run-score ${displayScore !== null && displayScore >= 72 ? "strong" : "watch"}`}>
          {displayScore ?? "--"}/100
        </span>
      </div>

      <div className="trust-run-meta" aria-label="Trust run source details">
        <span>{agentMode}</span>
        <span>{formatPolicyLabel(policyVersion)}</span>
        <span>{factCount || comparison.ranking.fact_ids.length} facts</span>
        <span>{checkCount} checks</span>
        {scoreItems.length > 0 && <span>{scoreItems.length} weighted signals</span>}
      </div>

      <ol className="trust-run-timeline">
        {steps.map((step, index) => (
          <li key={step.label} className={`trust-run-step ${step.status}`}>
            <span className="trust-run-step-mark">{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
            <b>{step.value}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

function normalizeTrustRunStatus(status: string) {
  if (status === "done" || status === "blocked") return status;
  return "watch";
}

function formatAgentMode(mode: string) {
  if (mode.includes("cached")) return "Cached AI visual match plus scoring";
  if (mode.includes("ai_visual_match")) return "AI visual match plus deterministic scoring";
  return "Deterministic evidence run";
}

function trustRunAgentMode(comparison: CompareResponse, decision?: RegretDecisionResponse | null) {
  const agent = decision?.context.similarity?.agent ?? comparison.similarity?.agent;
  if (!agent) return "Deterministic evidence run";
  if (agent.status === "cache_hit") return "AI visual match reused from cache";
  if (agent.used) return "AI visual match plus deterministic scoring";
  if (agent.status === "not_enough_candidates") return "Deterministic run with limited seller options";
  return "Deterministic evidence run";
}

function scoreValue(candidate: CandidateScore | null, factor: CandidateFactor) {
  if (!candidate) return "--";
  return `${Math.round((candidate.factors[factor] ?? 0) * 100)}%`;
}

function scoreStatus(candidate: CandidateScore | null, factor: CandidateFactor, threshold: number) {
  if (!candidate) return "watch";
  return (candidate.factors[factor] ?? 0) >= threshold ? "done" : "watch";
}

function humanFactorLabel(factor: string, language: LanguageCode) {
  const normalized = factor.toLowerCase();
  if (normalized.includes("outcome") || normalized.includes("return")) return t(language, "keptOrderSignal");
  if (normalized.includes("seller")) return t(language, "sellerTrust");
  if (normalized.includes("fit") || normalized.includes("size")) return t(language, "fitMatch");
  if (normalized.includes("review")) return t(language, "credibleReviews");
  if (normalized.includes("proof")) return t(language, "proofCoverage");
  if (normalized.includes("offer")) return t(language, "offerTruth");
  if (normalized.includes("price") || normalized.includes("value")) return t(language, "priceChecked");
  if (normalized.includes("color")) return t(language, "color");
  if (normalized.includes("fabric")) return t(language, "fabric");
  return factor
    .replace(/sku/gi, "SKU")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getProductDetailsForVariant(variantId: string, productCatalog: Product[]) {
  const product = [...productCatalog]
    .sort((a, b) => b.product_id.length - a.product_id.length)
    .find((item) => variantId === item.product_id || variantId.startsWith(`${item.product_id}_`));

  return {
    title: product ? marketplaceProductTitle(product) : "Selected product",
    sellerName: product?.seller_name ?? "Mapped seller",
    price: product?.base_price ?? 0,
    imageUrl: product?.image_url || fallbackProductImage(product?.color_family),
    product
  };
}

function sellerListingOptions(
  comparison: CompareResponse,
  productCatalog: Product[],
  candidateRows: Array<{
    candidate: CandidateScore;
    details: ReturnType<typeof getProductDetailsForVariant>;
    isWinner: boolean;
  }>,
  recommendedSize: string
) {
  const selectedProduct = productCatalog.find((product) => product.product_id === comparison.selected_product_id)
    ?? candidateRows.find((row) => row.isWinner)?.details.product
    ?? null;
  const clusterId = selectedProduct?.cluster_id;
  const products = clusterId
    ? productCatalog.filter((product) => product.cluster_id === clusterId)
    : productCatalog.filter((product) => product.product_id === comparison.selected_product_id);
  const candidateByProduct = new Map(
    candidateRows
      .filter((row) => row.details.product)
      .map((row) => [row.details.product!.product_id, row])
  );

  return products
    .map((product) => {
      const candidateRow = candidateByProduct.get(product.product_id) ?? null;
      const variantId = candidateRow?.candidate.variant_id ?? fallbackVariantId(product.product_id, recommendedSize);
      const score = candidateRow
        ? trustScorePercent(candidateRow.candidate)
        : typeof product.buyer_trust?.confidence === "number"
          ? Math.round(product.buyer_trust.confidence)
          : null;
      return {
        product,
        variantId,
        score,
        title: marketplaceProductTitle(product),
        price: product.base_price,
        imageUrl: product.image_url || product.image_urls?.[0] || fallbackProductImage(product.color_family),
        isCurrent: product.product_id === selectedProduct?.product_id,
        isRecommended: variantId === comparison.ranking.winner
      };
    })
    .sort((a, b) => {
      if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return (b.score ?? -1) - (a.score ?? -1);
    });
}

function marketplaceProductTitle(product: Product) {
  const title = product.title.split("-")[0].trim();
  const contexts = ["Everyday Wear", "Office Ready", "Festival Edit", "Comfort Fit"];
  const context = contexts.find((suffix) => title.toLowerCase().endsWith(suffix.toLowerCase())) ?? "";
  const base = context ? title.slice(0, -context.length).trim() : title;
  if (product.category === "women_kurtis" && /\bdress\b/i.test(base)) {
    return base.replace(/\bdress\b/gi, "Kurti");
  }
  return base;
}

function fallbackVariantId(productId: string, recommendedSize: string) {
  const normalized = recommendedSize.trim().toLowerCase().replace(/\s+/g, "_");
  return `${productId}_${normalized || "xl"}`;
}

function uniqueSellerCandidateRows<T extends { details: { product?: Product | null; sellerName: string } }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.details.product?.seller_id ?? row.details.sellerName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackProductImage(color?: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}

type CandidateFactor = Exclude<keyof CandidateScore["factors"], "uncertainty_penalty">;

function factorPercent(candidate: CandidateScore, factor: CandidateFactor) {
  return `${Math.round((candidate.factors[factor] ?? 0) * 100)}%`;
}

function factorRowsForCandidate(candidate: CandidateScore, language: LanguageCode) {
  const rows: Array<{ key: CandidateFactor; label: string }> = [
    { key: "outcome_quality", label: t(language, "keptOrderSignal") },
    { key: "seller_trust", label: t(language, "sellerTrust") },
    { key: "fit_match", label: t(language, "fitMatch") },
    { key: "review_signal", label: t(language, "credibleReviews") },
    { key: "proof_coverage", label: t(language, "proofCoverage") },
    { key: "offer_truth", label: t(language, "offerTruth") }
  ];
  return rows.map((row) => ({
    ...row,
    value: Math.round((candidate.factors[row.key] ?? 0) * 100)
  }));
}

function trustScorePercent(candidate: CandidateScore) {
  return candidate.score_percent ?? Math.floor(candidate.score * 100);
}

function formatPolicyLabel(version: string) {
  if (version.toLowerCase().includes("apparel")) return "Sarthi Apparel Trust Policy v1";
  return "Sarthi Trust Policy v1";
}

function matchReasons(candidates: NonNullable<CompareResponse["similarity"]>["candidates"] = [], language: LanguageCode) {
  const reasons = new Set(candidates.flatMap((candidate) => candidate.reasons));
  return [...reasons].slice(0, 3).join(" + ") || t(language, "matchedByProductFacts");
}
