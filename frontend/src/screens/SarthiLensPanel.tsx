import { CheckCircle2, HelpCircle, Info, Send, ShieldCheck } from "lucide-react";
import { t, type LanguageCode } from "../i18n";
import type { ClusterKnowledgeGraph, CompareResponse, Product, RegretDecisionResponse } from "../types/api";

type AutoScanState =
  | { status: "idle" }
  | { status: "scanning"; clusterId: string; title: string; listingCount: number }
  | { status: "ready"; clusterId: string; title: string; listingCount: number; result: CompareResponse }
  | { status: "error"; clusterId: string; title: string; message: string };

export function SarthiLensPanel({
  autoScan,
  savedProduct,
  similarProducts,
  knowledgeGraph,
  graphLoading,
  graphError,
  regretDecision,
  decisionQuestion,
  decisionLoading,
  language,
  possibleComparableCount,
  onOpenResult,
  onOpenProof,
  onOpenGraph,
  onDecisionQuestionChange,
  onAskDecision,
  hideGraphButton = false
}: {
  autoScan: AutoScanState;
  savedProduct: Product | null;
  similarProducts: Product[];
  knowledgeGraph: ClusterKnowledgeGraph | null;
  graphLoading: boolean;
  graphError: string | null;
  regretDecision: RegretDecisionResponse | null;
  decisionQuestion: string;
  decisionLoading: boolean;
  language: LanguageCode;
  possibleComparableCount: number;
  onOpenResult: (result: CompareResponse) => void;
  onOpenProof: (traceId: string) => void;
  onOpenGraph: () => void;
  onDecisionQuestionChange: (value: string) => void;
  onAskDecision: (question: string) => void;
  hideGraphButton?: boolean;
}) {
  const result = autoScan.status === "ready" ? autoScan.result : null;
  const isScanning = autoScan.status === "scanning";
  const isReady = autoScan.status === "ready";
  const scanCount = autoScan.status === "scanning" || autoScan.status === "ready"
    ? autoScan.listingCount
    : similarProducts.length;
  const scanSubject = autoScan.status === "idle"
    ? savedProduct?.title.split("-")[0].trim() ?? "this product"
    : autoScan.title;
  const winnerProduct = result ? productForVariant(result.ranking.winner, similarProducts) : null;
  const alternativeProduct = result?.ranking.alternative
    ? productForVariant(result.ranking.alternative, similarProducts)
    : null;

  if (!savedProduct) {
    return (
      <section className="sarthi-lens-panel waiting">
        <div className="lens-header">
          <div className="lens-icon">
            <ShieldCheck size={16} />
          </div>
          <div>
            <span className="eyebrow">{t(language, "trustCheckReady")}</span>
            <h2>{t(language, "saveToCheckTrust")}</h2>
            <p>
              {possibleComparableCount > 0
                ? `${possibleComparableCount} ${t(language, "groups")} ${t(language, "checkable")}.`
                : t(language, "catalogOnly")}
              {" "}{t(language, "saveToCheckTrust")}.
            </p>
          </div>
        </div>
        <div className="lens-guard-row">
          <span>{t(language, "noPaymentForced")}</span>
          <span>{t(language, "sellerPrivacyLine")}</span>
          <span>{t(language, "privateMemoryBuyerOnly")}</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`sarthi-lens-panel ${isScanning ? "scanning" : ""} ${isReady ? "ready" : ""}`}>
      <div className="lens-header">
        <div className="lens-icon">
          <ShieldCheck size={16} />
        </div>
        <div>
          <span className="eyebrow">{t(language, "trustCheckReady")}</span>
          <h2>
            {result
              ? t(language, "recommendationReady")
              : autoScan.status === "error"
                ? t(language, "sellerCheckFailed")
                : `${t(language, "checkingEllipsis")} ${similarProducts.length || scanCount} ${t(language, "similarSellers")}`}
          </h2>
          <p>
            {result
              ? `${scanSubject}: ${t(language, "sellerChecked")}, ${t(language, "returnsChecked")}, ${t(language, "priceChecked")}.`
              : autoScan.status === "error"
                ? autoScan.message
                : `${savedProduct.title.split("-")[0].trim()} ${t(language, "saved").toLowerCase()}.`}
          </p>
        </div>
      </div>

      <div className="lens-selected-strip">
        <img
          src={(winnerProduct ?? savedProduct).image_url || fallbackProductImage((winnerProduct ?? savedProduct).color_family)}
          alt={(winnerProduct ?? savedProduct).title}
          onError={(event) => { event.currentTarget.src = fallbackProductImage((winnerProduct ?? savedProduct).color_family); }}
        />
        <div>
          <span>{result ? t(language, "bestMatchForYou") : t(language, "saved")}</span>
          <strong>{(winnerProduct ?? savedProduct).title.split("-")[0].trim()}</strong>
          <small>
            {(winnerProduct ?? savedProduct).seller_name} | Rs {(winnerProduct ?? savedProduct).base_price}
          </small>
        </div>
      </div>

      <LensDecisionSummary
        result={result}
        savedProduct={savedProduct}
        winnerProduct={winnerProduct}
        alternativeProduct={alternativeProduct}
        graph={knowledgeGraph}
        scanCount={similarProducts.length || scanCount}
        isScanning={isScanning}
        regretDecision={regretDecision}
        language={language}
      />

      {result && (
        <LensSellerOptionList
          result={result}
          similarProducts={similarProducts}
          graph={knowledgeGraph}
          language={language}
        />
      )}

      <DecisionQuestionBox
        value={decisionQuestion}
        loading={decisionLoading}
        decision={regretDecision}
        language={language}
        onChange={onDecisionQuestionChange}
        onAsk={onAskDecision}
      />

      {result && (
        <div className="lens-action-row">
          <button className="lens-primary-action" onClick={() => onOpenResult(result)}>
            <CheckCircle2 size={14} />
            <span>{t(language, "viewItem")}</span>
          </button>
          <button className="lens-secondary-action" onClick={() => onOpenProof(result.trace_id)}>
            <HelpCircle size={14} />
            <span>{t(language, "proof")}</span>
          </button>
          {!hideGraphButton && (
            <button
              className="lens-secondary-action"
              onClick={onOpenGraph}
              disabled={graphLoading || (!knowledgeGraph && !graphError)}
            >
              <Info size={14} />
              <span>{graphLoading ? t(language, "checkingProof") : graphError ? t(language, "proof") : t(language, "seeProof")}</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function LensDecisionSummary({
  result,
  savedProduct,
  winnerProduct,
  alternativeProduct,
  graph,
  scanCount,
  isScanning,
  regretDecision,
  language
}: {
  result: CompareResponse | null;
  savedProduct: Product;
  winnerProduct: Product | null;
  alternativeProduct: Product | null;
  graph: ClusterKnowledgeGraph | null;
  scanCount: number;
  isScanning: boolean;
  regretDecision: RegretDecisionResponse | null;
  language: LanguageCode;
}) {
  if (!result) {
    return (
      <div className="lens-clean-summary scanning-state">
        <div>
          <span className="eyebrow">{t(language, "agentChecks")}</span>
          <h3>{isScanning ? t(language, "checkingEllipsis") : t(language, "checkTrust")}</h3>
          <p>
            {t(language, "sellerChecked")}, {t(language, "returnsChecked")}, {t(language, "sizeChecked")}, {t(language, "priceChecked")}.
          </p>
        </div>
        <div className="lens-progress-row">
          <span className={graph ? "complete" : ""}>{t(language, "proof")}</span>
          <span className={isScanning ? "active" : ""}>{t(language, "trustReceipt")}</span>
          <span>{t(language, "sizeChecked")}</span>
        </div>
      </div>
    );
  }

  const winner = winnerProduct ?? savedProduct;
  const winnerCandidate = candidateForProduct(result, winner);
  const score = winnerCandidate ? trustScorePercent(winnerCandidate) : null;
  const graphContext = graph?.seller_context.find((context) => context.product.product_id === winner.product_id);
  const returnRate = graphContext ? Math.round(graphContext.evidence.return_rate * 100) : null;
  const sellerStatus = graphContext?.seller.verification.verification_status ?? "checked";
  const proofCountValue = proofCount(result);
  const decision = regretDecision?.decision;
  const passport = regretDecision?.sku_truth_passport;

  return (
    <div className="lens-clean-summary ready-state">
      <div className="lens-decision-top">
        <div>
          <span className="eyebrow">{t(language, "nextStep")}</span>
          <h3>{decision?.label ?? winner.seller_name}</h3>
          <p>
            {decision?.summary ?? `${scanCount} ${t(language, "similarSellers")} ${t(language, "checked").toLowerCase()}.`}
          </p>
        </div>
        <div className="lens-score-badge">
          <strong>{score ?? "--"}</strong>
          <span>{t(language, "trustReceipt")}</span>
        </div>
      </div>

      <div className="lens-evidence-chips">
        <span>{t(language, "size")} {passport?.fit.recommended_size ?? result.fit.recommended_size}</span>
        <span>{returnRate === null ? t(language, "returnsChecked") : `${returnRate}% ${t(language, "returnRisk").toLowerCase()}`}</span>
        <span>{labelize(sellerStatus)} {t(language, "seller").toLowerCase()}</span>
        <span>{passport?.proof_coverage ? evidenceGapLabel(passport.evidence_gaps.length, language) : `${proofCountValue} ${t(language, "facts")}`}</span>
      </div>

      <div className="lens-reason-line">
        <CheckCircle2 size={15} />
        <span>{decision ? decision.primary_action.replace(/_/g, " ") : result.ranking.top_factors.slice(0, 2).join(" + ")}</span>
      </div>

      {alternativeProduct && alternativeProduct.product_id !== winner.product_id && (
        <div className="lens-backup-line">
          <span>{t(language, "alsoConsider")}</span>
          <strong>{alternativeProduct.seller_name}</strong>
        </div>
      )}
    </div>
  );
}

function LensSellerOptionList({
  result,
  similarProducts,
  graph,
  language
}: {
  result: CompareResponse;
  similarProducts: Product[];
  graph: ClusterKnowledgeGraph | null;
  language: LanguageCode;
}) {
  const ranked = [...result.ranking.candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((candidate) => {
      const product = productForVariant(candidate.variant_id, similarProducts);
      const context = product
        ? graph?.seller_context.find((item) => item.product.product_id === product.product_id)
        : null;
      return { candidate, product, context };
    })
    .filter((item) => item.product);

  if (ranked.length === 0) return null;

  return (
    <div className="lens-seller-list">
      <div className="lens-seller-list-header">
        <div>
          <span className="eyebrow">{t(language, "sellerChecked")}</span>
          <strong>{ranked.length} {t(language, "similarSellers")}</strong>
        </div>
        <span>{t(language, "rankingExplainer").split(".")[1]?.trim() || t(language, "sellerPrivacyLine")}</span>
      </div>

      <div className="lens-seller-rows">
        {ranked.map(({ candidate, product, context }, index) => {
          if (!product) return null;
          const isWinner = candidate.variant_id === result.ranking.winner;
          const returnRate = context ? Math.round(context.evidence.return_rate * 100) : null;
          const score = trustScorePercent(candidate);
          return (
            <div key={candidate.variant_id} className={`lens-seller-row ${isWinner ? "winner" : ""}`}>
              <div className="seller-row-rank">{index + 1}</div>
              <img
                src={product.image_url || fallbackProductImage(product.color_family)}
                alt={product.title}
                onError={(event) => { event.currentTarget.src = fallbackProductImage(product.color_family); }}
              />
              <div className="seller-row-main">
                <strong>{product.seller_name}</strong>
                <span>{topCandidateFactor(candidate, language)} | {returnRate === null ? t(language, "returnsChecked") : `${returnRate}% ${t(language, "returnsChecked").toLowerCase()}`}</span>
              </div>
              <div className="seller-row-score">
                <strong>{score}</strong>
                <span>{isWinner ? t(language, "bestMatchForYou") : t(language, "alsoConsider")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function topCandidateFactor(candidate: CompareResponse["ranking"]["candidates"][number], language: LanguageCode) {
  const labels: Record<string, string> = {
    fit_match: t(language, "fitMatch"),
    outcome_quality: t(language, "keptOrderSignal"),
    expectation_match: t(language, "meaning"),
    fulfilment_reliability: t(language, "dispatch"),
    seller_trust: t(language, "sellerTrust"),
    review_signal: t(language, "reviews"),
    review_credibility: t(language, "credibleReviews"),
    rating_signal: t(language, "reviews"),
    price_value: t(language, "price"),
    fair_start_boost: "fair-start boost"
  };
  const [key] = Object.entries(candidate.factors)
    .filter(([factor]) => factor !== "uncertainty_penalty")
    .sort((left, right) => Number(right[1]) - Number(left[1]))[0] ?? ["seller_trust"];
  return labels[key] ?? key.replace(/_/g, " ");
}

function DecisionQuestionBox({
  value,
  loading,
  decision,
  language,
  onChange,
  onAsk
}: {
  value: string;
  loading: boolean;
  decision: RegretDecisionResponse | null;
  language: LanguageCode;
  onChange: (value: string) => void;
  onAsk: (question: string) => void;
}) {
  return (
    <form
      className="decision-question-box"
      onSubmit={(event) => {
        event.preventDefault();
        onAsk(value);
      }}
    >
      <div>
        <span className="eyebrow">{t(language, "askFromVerifiedFacts")}</span>
        <p>
          {t(language, "askSimpleQuestion")}
        </p>
      </div>
      <div className="decision-question-input">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t(language, "samvaadPlaceholder")}
        />
        <button type="submit" disabled={loading || !value.trim()}>
          <Send size={14} />
          <span>{loading ? t(language, "checkingEllipsis") : t(language, "check")}</span>
        </button>
      </div>
      {decision?.proof_request && (
        <div className="decision-proof-requested">
          <Info size={14} />
          <span>
            {t(language, "sellerProofAsked")}: {labelize(decision.proof_request.attribute)}. {t(language, "checkingProof")}
          </span>
        </div>
      )}
    </form>
  );
}

function proofCount(result: CompareResponse) {
  return new Set([
    ...result.ranking.fact_ids,
    ...result.fit.fact_ids,
    ...result.graph_path.fact_ids
  ]).size;
}

function evidenceGapLabel(count: number, language: LanguageCode) {
  if (count === 0) return t(language, "proofAvailable");
  if (count === 1) return `1 ${t(language, "missingProof").toLowerCase()}`;
  return `${count} ${t(language, "missingProof").toLowerCase()}`;
}

function productForVariant(variantId: string, products: Product[]) {
  const productId = variantProductId(variantId);
  return products.find((product) => product.product_id === productId) ?? null;
}

function candidateForProduct(result: CompareResponse, product: Product) {
  return result.ranking.candidates.find((candidate) => variantProductId(candidate.variant_id) === product.product_id) ?? null;
}

function variantProductId(variantId: string) {
  return variantId.replace(/_(xs|s|m|l|xl|xxl|free)$/i, "");
}

function trustScorePercent(candidate: CompareResponse["ranking"]["candidates"][number]) {
  return candidate.score_percent ?? Math.floor(candidate.score * 100);
}

function fallbackProductImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
