import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
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

  return (
    <div className="compare-sheet">
      <section className="compare-best-card interactive-lift">
        <div className="compare-card-header">
          <div className="compare-title-row">
            <span className="compare-icon-badge positive">
              <CheckCircle2 size={15} />
            </span>
            <div>
              <span className="eyebrow">Best match for you</span>
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
            <span>Product</span>
            <strong>{winnerDetails.title}</strong>
          </div>
          <div className="kv-row">
            <span>Price</span>
            <strong className="compare-price">Rs {winnerDetails.price}</strong>
          </div>
          <div className="kv-row">
            <span>Size</span>
            <strong>
              <span className="ui-badge neutral">{fit.recommended_size}</span>
            </strong>
          </div>
        </div>

        <div className="compare-reason-list">
          <span className="compare-section-label">Why this one</span>
          {visibleFactors.map((factor) => (
            <div className="reason-row" key={factor}>
              <FactorIcon factor={factor} />
              <span>{humanFactorLabel(factor)}</span>
            </div>
          ))}
        </div>

        {winnerCandidate && (
          <div className="compare-factor-meter-list">
            {factorRowsForCandidate(winnerCandidate).map((factor) => (
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
              <span className="eyebrow">Also consider</span>
              <strong>{alternativeDetails.sellerName}</strong>
              <small>Rs {alternativeDetails.price} | Size {fit.recommended_size}</small>
            </div>
            <ChevronDown size={16} />
          </button>
          {alternativeOpen && (
            <div className="compare-alternative-body">
              <div className="reason-row">
                <Tag size={16} />
                <span>Useful if price is the priority, but it scored lower after return, color, dispatch, and fit checks.</span>
              </div>
            </div>
          )}
        </section>
      )}

      {!isSimple && (
        <div className="compare-engine-card">
          <div className="compare-engine-header">
            <div>
              <span className="eyebrow">Trust ranking</span>
              <h4>Seller options checked</h4>
            </div>
            <span className="ui-badge neutral">{candidateRows.length} checked</span>
          </div>
          <p>
            Ranked using seller reliability, kept-order history, fit signals, reviews, price facts, proof, and offer truth.
            Ads or paid position are not used.
          </p>
          {ranking.weighting && (
            <div className="compare-weight-note">
              <span>Weight policy</span>
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
                    <span><Ruler size={12} /> Fit {factorPercent(candidate, "fit_match")}</span>
                    <span><RotateCcw size={12} /> Returns {factorPercent(candidate, "outcome_quality")}</span>
                    <span><ShieldCheck size={12} /> Trust {factorPercent(candidate, "seller_trust")}</span>
                    <span><Truck size={12} /> Dispatch {factorPercent(candidate, "fulfilment_reliability")}</span>
                    <span><Info size={12} /> Proof {factorPercent(candidate, "proof_coverage")}</span>
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
          {isSimple ? t(language, "proofAvailable") : `Checked ${comparison.graph_path.relationships.length} evidence links`}
        </span>
        <button type="button" onClick={onOpenAudit}>
          <HelpCircle size={12} />
          {isSimple ? "Proof" : "Why this option won"}
        </button>
      </div>

      <button className="compare-primary-cta" type="button" onClick={onContinue}>
        Choose this option
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

function humanFactorLabel(factor: string) {
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
    price: product?.base_price ?? 0
  };
}

type CandidateFactor = Exclude<keyof CandidateScore["factors"], "uncertainty_penalty">;

function factorPercent(candidate: CandidateScore, factor: CandidateFactor) {
  return `${Math.round((candidate.factors[factor] ?? 0) * 100)}%`;
}

function factorRowsForCandidate(candidate: CandidateScore) {
  const rows: Array<{ key: CandidateFactor; label: string }> = [
    { key: "outcome_quality", label: "Kept-order signal" },
    { key: "seller_trust", label: "Seller trust" },
    { key: "fit_match", label: "Fit match" },
    { key: "review_signal", label: "Credible reviews" },
    { key: "proof_coverage", label: "Proof coverage" },
    { key: "offer_truth", label: "Offer truth" }
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
