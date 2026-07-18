import { CheckCircle2, HelpCircle, Info, Send, ShieldCheck } from "lucide-react";
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
            <span className="eyebrow">Saved radar</span>
            <h2>Save a product when you want help deciding</h2>
            <p>
              {possibleComparableCount > 0
                ? `${possibleComparableCount} comparable product groups are available in these results.`
                : "These results are browsable, but comparison starts only for products with enough mapped evidence."}
              {" "}The recommendation starts only after you save one product.
            </p>
          </div>
        </div>
        <div className="lens-guard-row">
          <span>No hidden auto-buy pressure</span>
          <span>No seller ads used</span>
          <span>Buyer memory stays private</span>
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
          <span className="eyebrow">Saved radar</span>
          <h2>
            {result
              ? "Radar decision ready"
              : autoScan.status === "error"
                ? "Radar could not complete"
                : `Checking ${similarProducts.length || scanCount} mapped seller options`}
          </h2>
          <p>
            {result
              ? `${scanSubject} was ranked using fit, returns, seller reliability, price facts, reviews, and buyer-owned fit context.`
              : autoScan.status === "error"
                ? autoScan.message
                : `You saved ${savedProduct.title.split("-")[0].trim()}. Only mapped seller alternatives for this product are being compared.`}
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
          <span>{result ? "Recommended option" : "Saved by you"}</span>
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
      />

      {result && (
        <LensSellerOptionList
          result={result}
          similarProducts={similarProducts}
          graph={knowledgeGraph}
        />
      )}

      <DecisionQuestionBox
        value={decisionQuestion}
        loading={decisionLoading}
        decision={regretDecision}
        onChange={onDecisionQuestionChange}
        onAsk={onAskDecision}
      />

      {result && (
        <div className="lens-action-row">
          <button className="lens-primary-action" onClick={() => onOpenResult(result)}>
            <CheckCircle2 size={14} />
            <span>View best option</span>
          </button>
          <button className="lens-secondary-action" onClick={() => onOpenProof(result.trace_id)}>
            <HelpCircle size={14} />
            <span>Proof</span>
          </button>
          {!hideGraphButton && (
            <button
              className="lens-secondary-action"
              onClick={onOpenGraph}
              disabled={graphLoading || (!knowledgeGraph && !graphError)}
            >
              <Info size={14} />
              <span>{graphLoading ? "Preparing evidence" : graphError ? "Evidence status" : "Ask proof map"}</span>
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
  regretDecision
}: {
  result: CompareResponse | null;
  savedProduct: Product;
  winnerProduct: Product | null;
  alternativeProduct: Product | null;
  graph: ClusterKnowledgeGraph | null;
  scanCount: number;
  isScanning: boolean;
  regretDecision: RegretDecisionResponse | null;
}) {
  if (!result) {
    return (
      <div className="lens-clean-summary scanning-state">
        <div>
          <span className="eyebrow">Evidence check running</span>
          <h3>{isScanning ? "Ranking mapped seller options" : "Ready to check this product"}</h3>
          <p>
            Checking seller trust, SKU returns, fit, reviews, price facts, and buyer-owned fit context.
          </p>
        </div>
        <div className="lens-progress-row">
          <span className={graph ? "complete" : ""}>Evidence map</span>
          <span className={isScanning ? "active" : ""}>Risk score</span>
          <span>Fit check</span>
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
          <span className="eyebrow">Radar decision</span>
          <h3>{decision?.label ?? winner.seller_name}</h3>
          <p>
            {decision?.summary ?? `Best among ${scanCount} mapped seller options for ${winner.title.split("-")[0].trim()}.`}
          </p>
        </div>
        <div className="lens-score-badge">
          <strong>{score ?? "--"}</strong>
          <span>trust score</span>
        </div>
      </div>

      <div className="lens-evidence-chips">
        <span>Size {passport?.fit.recommended_size ?? result.fit.recommended_size}</span>
        <span>{returnRate === null ? "Returns checked" : `${returnRate}% return rate`}</span>
        <span>{labelize(sellerStatus)} seller</span>
        <span>{passport?.proof_coverage ? evidenceGapLabel(passport.evidence_gaps.length) : `${proofCountValue} facts`}</span>
      </div>

      <div className="lens-reason-line">
        <CheckCircle2 size={15} />
        <span>{decision ? decision.primary_action.replace(/_/g, " ") : result.ranking.top_factors.slice(0, 2).join(" + ")}</span>
      </div>

      {alternativeProduct && alternativeProduct.product_id !== winner.product_id && (
        <div className="lens-backup-line">
          <span>Backup option</span>
          <strong>{alternativeProduct.seller_name}</strong>
        </div>
      )}
    </div>
  );
}

function LensSellerOptionList({
  result,
  similarProducts,
  graph
}: {
  result: CompareResponse;
  similarProducts: Product[];
  graph: ClusterKnowledgeGraph | null;
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
          <span className="eyebrow">Seller options checked</span>
          <strong>{ranked.length} ranked from live SKU evidence</strong>
        </div>
        <span>No ads used</span>
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
                <span>{topCandidateFactor(candidate)} | {returnRate === null ? "returns checked" : `${returnRate}% returns`}</span>
              </div>
              <div className="seller-row-score">
                <strong>{score}</strong>
                <span>{isWinner ? "Recommended" : "Backup"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function topCandidateFactor(candidate: CompareResponse["ranking"]["candidates"][number]) {
  const labels: Record<string, string> = {
    fit_match: "fit match",
    outcome_quality: "kept-order history",
    expectation_match: "claim match",
    fulfilment_reliability: "dispatch reliability",
    seller_trust: "seller trust",
    review_signal: "review signal",
    review_credibility: "credible reviews",
    rating_signal: "rating signal",
    price_value: "price value",
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
  onChange,
  onAsk
}: {
  value: string;
  loading: boolean;
  decision: RegretDecisionResponse | null;
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
        <span className="eyebrow">Ask one doubt</span>
        <p>
          If proof is missing, the system creates an aggregate seller proof request instead of guessing.
        </p>
      </div>
      <div className="decision-question-input">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Kapda transparent toh nahi hai?"
        />
        <button type="submit" disabled={loading || !value.trim()}>
          <Send size={14} />
          <span>{loading ? "Checking" : "Check"}</span>
        </button>
      </div>
      {decision?.proof_request && (
        <div className="decision-proof-requested">
          <Info size={14} />
          <span>
            Seller proof requested for {decision.proof_request.attribute}. Demand count: {decision.proof_request.request_count}
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

function evidenceGapLabel(count: number) {
  if (count === 0) return "Proof complete";
  if (count === 1) return "1 proof gap";
  return `${count} proof gaps`;
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
