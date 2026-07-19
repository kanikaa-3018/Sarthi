import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Info,
  Layers,
  ListChecks,
  Palette,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Star,
  Tag,
  Truck
} from "lucide-react";
import { t, type LanguageCode } from "../i18n";
import type { CompareResponse, Product } from "../types/api";

type Props = {
  comparison: CompareResponse;
  productCatalog: Product[];
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  onContinue: () => void;
  onOpenAudit: () => void;
};

type CandidateScore = CompareResponse["ranking"]["candidates"][number];

export function CompareSheet({
  comparison,
  productCatalog,
  language,
  experienceMode,
  onContinue,
  onOpenAudit
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
  const agentReason = winnerCandidate ? compareAgentReason(winnerCandidate, ranking.candidates, language) : null;

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

        {agentReason && (
          <div className="compare-agent-reason">
            <ListChecks size={15} />
            <div>
              <span>{t(language, "agentChecks")}</span>
              <strong>{agentReason.title}</strong>
              <small>{agentReason.summary}</small>
            </div>
          </div>
        )}

        <div className="compare-similar-strip">
          <span className="compare-section-label">{t(language, "similarSellers")}</span>
          <div className="compare-similar-list">
            {candidateRows.slice(0, isSimple ? 3 : 4).map(({ candidate, details, isWinner }) => (
              <div
                key={candidate.variant_id}
                className={`compare-similar-card ${isWinner ? "winner" : ""}`}
              >
                <img
                  src={details.imageUrl}
                  alt={details.title}
                  onError={(event) => { event.currentTarget.src = "/product-blue.svg"; }}
                />
                <div>
                  <strong>{details.sellerName}</strong>
                  <span>Rs {details.price}</span>
                </div>
                <small>{trustScorePercent(candidate)}/100</small>
              </div>
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
            <span className="ui-badge neutral">{candidateRows.length} {t(language, "checked")}</span>
          </div>
          <p>{t(language, "rankingExplainer")}</p>
          {ranking.weighting && (
            <div className="compare-weight-note">
              <span>{t(language, "weightPolicy")}</span>
              <strong>{formatPolicyLabel(ranking.weighting.version)}</strong>
            </div>
          )}
          <div className="compare-candidate-list">
            {candidateRows.map(({ candidate, details, index, isWinner, isAlternative }) => (
              <div
                key={candidate.variant_id}
                className={`compare-candidate-row ${isWinner ? "winner" : ""} ${isAlternative ? "alternative" : ""}`}
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
    title: product?.title.split("-")[0].trim() ?? "Selected product",
    sellerName: product?.seller_name ?? "Mapped seller",
    price: product?.base_price ?? 0,
    imageUrl: product?.image_url || fallbackProductImage(product?.color_family),
    product
  };
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

function compareAgentReason(winner: CandidateScore, candidates: CandidateScore[], language: LanguageCode) {
  const factors = factorRowsForCandidate(winner, language);
  const strongFactors = factors.filter((factor) => factor.value >= 70).slice(0, 3);
  const compared = Math.max(1, candidates.length);
  return {
    title: `${compared} sellers checked. ${strongFactors.length || 1} strong signal(s) found.`,
    summary: strongFactors.length
      ? `Wins on ${strongFactors.map((factor) => factor.label.toLowerCase()).join(", ")}.`
      : t(language, "checkOnce")
  };
}
