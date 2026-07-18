import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Database, FileSearch, Heart, ListChecks, MessageCircle, ShieldCheck, Store, TrendingDown } from "lucide-react";
import type {
  ClusterKnowledgeGraph,
  CompareResponse,
  FitProfile,
  KnowledgeGraphChatResponse,
  Product,
  RegretDecisionResponse,
  WishlistRadarEvent
} from "../types/api";
import { KnowledgeGraphExplorer } from "./KnowledgeGraphExplorer";
import { SarthiLensPanel } from "./SarthiLensPanel";

type AutoScanState =
  | { status: "idle" }
  | { status: "scanning"; clusterId: string; title: string; listingCount: number }
  | { status: "ready"; clusterId: string; title: string; listingCount: number; result: CompareResponse }
  | { status: "error"; clusterId: string; title: string; message: string };

export function SarthiSavedWorkspacePanel({
  buyerId,
  savedProduct,
  products,
  autoScan,
  knowledgeGraph,
  graphLoading,
  graphError,
  regretDecision,
  decisionQuestion,
  decisionLoading,
  graphAnswer,
  graphQuery,
  graphAsking,
  wishlistRadar,
  radarLoading,
  radarError,
  activeFitProfile,
  onBack,
  onOpenResult,
  onOpenProof,
  onDecisionQuestionChange,
  onAskDecision,
  onQueryChange,
  onAskGraph
}: {
  buyerId: string;
  savedProduct: Product;
  products: Product[];
  autoScan: AutoScanState;
  knowledgeGraph: ClusterKnowledgeGraph | null;
  graphLoading: boolean;
  graphError: string | null;
  regretDecision: RegretDecisionResponse | null;
  decisionQuestion: string;
  decisionLoading: boolean;
  graphAnswer: KnowledgeGraphChatResponse | null;
  graphQuery: string;
  graphAsking: boolean;
  wishlistRadar: WishlistRadarEvent | null;
  radarLoading: boolean;
  radarError: string | null;
  activeFitProfile: FitProfile | null;
  onBack: () => void;
  onOpenResult: (res: CompareResponse) => void;
  onOpenProof: (traceId: string) => void;
  onDecisionQuestionChange: (value: string) => void;
  onAskDecision: (question: string) => void;
  onQueryChange: (value: string) => void;
  onAskGraph: (query: string) => void;
}) {
  const similarProducts = products.filter((product) => product.cluster_id === savedProduct.cluster_id && product.is_sarthi_eligible);
  const result = autoScan.status === "ready" ? autoScan.result : null;
  const winnerProduct = result ? productForVariant(result.ranking.winner, similarProducts) : null;
  const winnerCandidate = result && winnerProduct ? candidateForProduct(result, winnerProduct) : null;
  const score = winnerCandidate ? trustScorePercent(winnerCandidate) : null;
  const graphContext = winnerProduct
    ? knowledgeGraph?.seller_context.find((item) => item.product.product_id === winnerProduct.product_id)
    : null;
  const returnSignal = graphContext
    ? returnSignalLabel(graphContext.evidence.delivered_orders_90d, graphContext.evidence.return_rate)
    : null;
  const sourceCount = knowledgeGraph?.summary.fact_count ?? result?.ranking.fact_ids.length ?? 0;
  const statusLabel = result
    ? "Decision ready"
    : autoScan.status === "scanning"
      ? "Checking evidence"
      : autoScan.status === "error"
        ? "Needs retry"
        : "Saved";

  return (
    <div className="sarthi-saved-workspace buyer-shop-shell">
      <header className="workspace-hero">
        <div className="workspace-hero-left">
          <button
            type="button"
            onClick={onBack}
            className="workspace-back-button"
          >
            <ArrowLeft size={16} />
            <span>Catalog</span>
          </button>
          <img
            src={savedProduct.image_url || fallbackProductImage(savedProduct.color_family)}
            alt={savedProduct.title}
            onError={(event) => { event.currentTarget.src = fallbackProductImage(savedProduct.color_family); }}
          />
          <div className="workspace-product-copy">
            <span className="eyebrow">Saved check</span>
            <h2>Should you buy this?</h2>
            <p>
              <strong>{savedProduct.title.split("-")[0].trim()}</strong> | Rs {savedProduct.base_price} | {similarProducts.length} sellers
            </p>
          </div>
        </div>
        <div className="workspace-score-summary">
          <span>{statusLabel}</span>
          <strong>{score ?? "--"}</strong>
          <small>{score === null ? `${sourceCount} facts queued` : `trust score / 100`}</small>
        </div>
      </header>

      <div className="workspace-flow-strip" aria-label="Decision flow">
        <span className="complete"><Heart size={13} /> Saved</span>
        <span className={result ? "complete" : autoScan.status === "scanning" ? "active" : ""}><Store size={13} /> Sellers checked</span>
        <span className={knowledgeGraph ? "complete" : graphLoading ? "active" : ""}><FileSearch size={13} /> Proof ready</span>
        <span className={regretDecision ? "complete" : ""}><MessageCircle size={13} /> Doubt answered</span>
      </div>

      <div className="workspace-insight-row">
        <WorkspaceInsight icon={<Store size={16} />} label="Sellers" value={String(similarProducts.length)} detail="same item" />
        <WorkspaceInsight icon={<Database size={16} />} label="Facts" value={String(sourceCount)} detail="proof used" />
        <WorkspaceInsight icon={<TrendingDown size={16} />} label="Returns" value={returnSignal ?? "Checking"} detail="winner SKU" />
        <WorkspaceInsight icon={<ListChecks size={16} />} label="Rule" value={formatPolicyLabel(result?.ranking.weighting?.version)} detail="score weights" />
      </div>

      <div className="workspace-grid workspace-grid-upgraded">
        <div className="workspace-column workspace-primary-column">
          <TrustRadarCard
            radar={wishlistRadar}
            loading={radarLoading}
            error={radarError}
            activeFitProfile={activeFitProfile}
            onOpenProof={onOpenProof}
          />
          <SarthiLensPanel
            autoScan={autoScan}
            savedProduct={savedProduct}
            similarProducts={similarProducts}
            knowledgeGraph={knowledgeGraph}
            graphLoading={graphLoading}
            graphError={graphError}
            regretDecision={regretDecision}
            decisionQuestion={decisionQuestion}
            decisionLoading={decisionLoading}
            possibleComparableCount={new Set(products.filter((product) => product.is_sarthi_eligible).map((product) => product.cluster_id)).size}
            onOpenResult={onOpenResult}
            onOpenProof={onOpenProof}
            onOpenGraph={() => {}} // Unused since graph is inline next to it
            onDecisionQuestionChange={onDecisionQuestionChange}
            onAskDecision={onAskDecision}
            hideGraphButton={true}
          />
        </div>

        <div className="workspace-column workspace-evidence-column">
          <div className="kg-header-row">
            <h3>Proof path</h3>
            <span>{knowledgeGraph ? `${knowledgeGraph.summary.fact_count} facts` : "Preparing"}</span>
          </div>
          <KnowledgeGraphExplorer
            graph={knowledgeGraph}
            answer={graphAnswer}
            query={graphQuery}
            loading={graphLoading}
            asking={graphAsking}
            error={graphError}
            onQueryChange={onQueryChange}
            onAsk={onAskGraph}
            onOpenProof={onOpenProof}
          />
        </div>
      </div>
    </div>
  );
}

function TrustRadarCard({
  radar,
  loading,
  error,
  activeFitProfile,
  onOpenProof
}: {
  radar: WishlistRadarEvent | null;
  loading: boolean;
  error: string | null;
  activeFitProfile: FitProfile | null;
  onOpenProof: (traceId: string) => void;
}) {
  if (error) {
    return (
      <section className="trust-radar-card attention">
        <div className="trust-radar-header">
          <div>
            <span className="eyebrow">Saved product radar</span>
            <h3>Radar could not refresh</h3>
          </div>
          <AlertTriangle size={18} />
        </div>
        <p>Product comparison still works, but the saved-product watch loop could not be stored right now.</p>
      </section>
    );
  }

  if (!radar) {
    return (
      <section className="trust-radar-card loading">
        <div className="trust-radar-header">
          <div>
            <span className="eyebrow">Saved product radar</span>
            <h3>{loading ? "Watching this product" : "Waiting for saved intent"}</h3>
          </div>
          <ShieldCheck size={18} />
        </div>
        <p>Sarthi is creating a closed-loop watch record for seller options, proof gaps, fit profile, and checkout risk.</p>
      </section>
    );
  }

  const recommended = radar.candidates.find((candidate) => candidate.is_recommended) ?? radar.candidates[0] ?? null;
  const saved = radar.candidates.find((candidate) => candidate.is_saved_product) ?? null;
  const score = Math.floor(radar.recommended_score * 100);
  const headline = radar.status === "better_option_found"
    ? "Better seller found"
    : radar.status === "needs_one_check"
      ? "Ask proof first"
      : "Saved option checked";
  const summary = recommended
    ? `${recommended.product.seller_name} is strongest on returns, proof, and price.`
    : "Sarthi checked seller, SKU, reviews, proof, and price facts.";

  return (
    <section className={`trust-radar-card ${radar.status}`}>
      <div className="trust-radar-header">
        <div>
          <span className="eyebrow">Saved radar</span>
          <h3>{headline}</h3>
          <p>{summary}</p>
        </div>
        <div className="radar-score">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>

      <div className="radar-context-row">
        <span>{activeFitProfile ? `${activeFitProfile.label} profile` : "Buyer profile"}</span>
        <span>{radar.alerts.length ? `${radar.alerts.length} alert${radar.alerts.length > 1 ? "s" : ""}` : "No blocker alert"}</span>
        <span>{radar.delta > 0 ? `+${Math.round(radar.delta * 100)} score lift` : "Saved option checked"}</span>
      </div>

      {recommended && (
        <div className="radar-recommendation-row">
          <img
            src={recommended.product.image_url || fallbackProductImage(recommended.product.color_family)}
            alt={recommended.product.title}
            onError={(event) => { event.currentTarget.src = fallbackProductImage(recommended.product.color_family); }}
          />
          <div>
            <span>{recommended.is_saved_product ? "Saved option" : "Recommended option"}</span>
            <strong>{recommended.product.seller_name}</strong>
            <small>
              {Math.round(recommended.evidence.return_rate * 100)}% returns | {labelize(recommended.evidence.seller_verification)} seller
            </small>
          </div>
        </div>
      )}

      <div className="radar-chip-row">
        {(recommended?.reason_chips ?? []).slice(0, 4).map((chip) => (
          <span key={`${chip.key ?? chip.type}-${chip.label}`} className={chip.sentiment}>
            {chip.label}
          </span>
        ))}
      </div>

      {radar.alerts.length > 0 && (
        <div className="radar-alert-list">
          {radar.alerts.slice(0, 2).map((alert) => (
            <div key={`${alert.type}-${alert.title}`} className={alert.severity}>
              <AlertTriangle size={13} />
              <span>{alert.title}</span>
            </div>
          ))}
        </div>
      )}

      <div className="radar-action-row">
        <div>
          <span>Do this next</span>
          <strong>{radar.next_best_action.label}</strong>
          <small>{radar.next_best_action.reason}</small>
        </div>
        <button type="button" onClick={() => onOpenProof(radar.trace_id)}>
          Proof
        </button>
      </div>

      {saved && recommended && saved.product.product_id !== recommended.product.product_id && (
        <p className="radar-compare-note">
          <strong>Saved seller:</strong> <b>{Math.floor(saved.score * 100)}</b>.{" "}
          <strong>Recommended:</strong> <b>{Math.floor(recommended.score * 100)}</b>.
        </p>
      )}
    </section>
  );
}

function WorkspaceInsight({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="workspace-insight-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function formatPolicyLabel(version?: string) {
  if (!version) return "Live policy";
  if (version.toLowerCase().includes("apparel")) return "Apparel policy";
  return "Trust policy";
}

function returnSignalLabel(deliveredOrders: number, returnRate: number) {
  if (deliveredOrders < 8) return "New data";
  return `${Math.round(returnRate * 100)}%`;
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
