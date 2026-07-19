import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, FileSearch, MessageCircle, ShieldCheck, Store, TrendingDown } from "lucide-react";
import type {
  ClusterKnowledgeGraph,
  CompareResponse,
  FitProfile,
  KnowledgeGraphChatResponse,
  Product,
  RegretDecisionResponse,
  WishlistRadarEvent
} from "../types/api";
import { t, type LanguageCode } from "../i18n";
import { KnowledgeGraphExplorer } from "./KnowledgeGraphExplorer";

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
  openProofDetails,
  language,
  onBack,
  onOpenProduct,
  onOpenResult,
  onOpenProof,
  onDecisionQuestionChange,
  onAskDecision,
  onQueryChange,
  onAskGraph,
  onRetryGraph
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
  openProofDetails: boolean;
  language: LanguageCode;
  onBack: () => void;
  onOpenProduct: (product: Product, variantId?: string | null) => void;
  onOpenResult: (res: CompareResponse) => void;
  onOpenProof: (traceId: string) => void;
  onDecisionQuestionChange: (value: string) => void;
  onAskDecision: (question: string, product?: Product) => void;
  onQueryChange: (value: string) => void;
  onAskGraph: (query: string) => void;
  onRetryGraph: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    if (openProofDetails) setDetailsOpen(true);
  }, [openProofDetails, savedProduct.product_id]);

  const resolvedMatchIds = (
    knowledgeGraph?.summary.similarity?.candidates ??
    wishlistRadar?.similarity?.candidates ??
    []
  ).map((candidate) => candidate.product_id);
  const resolvedProducts = resolvedMatchIds
    .map((productId) => products.find((product) => product.product_id === productId))
    .filter(Boolean) as Product[];
  const similarProducts = resolvedProducts.length
    ? resolvedProducts
    : products.filter((product) => product.cluster_id === savedProduct.cluster_id && product.is_sarthi_eligible);
  const similarSellerCount = knowledgeGraph?.summary.similarity?.distinct_seller_count ??
    wishlistRadar?.similarity?.distinct_seller_count ??
    new Set(similarProducts.map((product) => product.seller_id)).size;
  const result = autoScan.status === "ready" ? autoScan.result : null;
  const winnerProduct = result ? productForVariant(result.ranking.winner, similarProducts) : null;
  const winnerCandidate = result && winnerProduct ? candidateForProduct(result, winnerProduct) : null;
  const score = winnerCandidate ? trustScorePercent(winnerCandidate) : null;
  const radarPick = wishlistRadar?.candidates.find((candidate) => candidate.is_recommended) ?? wishlistRadar?.candidates[0] ?? null;
  const recommendedProduct = winnerProduct ?? radarPick?.product ?? savedProduct;
  const recommendedSeller = recommendedProduct.seller_name;
  const recommendedVariantId = winnerCandidate?.variant_id ?? wishlistRadar?.recommended_variant_id ?? radarPick?.variant?.variant_id ?? null;
  const graphContext = winnerProduct
    ? knowledgeGraph?.seller_context.find((item) => item.product.product_id === winnerProduct.product_id)
    : null;
  const returnSignal = graphContext
    ? returnSignalLabel(graphContext.evidence.delivered_orders_90d, graphContext.evidence.return_rate)
    : null;
  const sourceCount = knowledgeGraph?.summary.fact_count ?? result?.ranking.fact_ids.length ?? 0;
  const entryCopy = savedEntryCopy(language);
  const decisionTitle = wishlistRadar?.status === "better_option_found"
    ? entryCopy.betterSeller
    : wishlistRadar?.status === "needs_one_check"
      ? entryCopy.askProofFirst
      : result
        ? entryCopy.readyToCompare
        : autoScan.status === "scanning"
          ? entryCopy.checking
          : entryCopy.saved;
  const decisionBody = radarPick
    ? entryCopy.recommendReason.replace("{seller}", recommendedSeller)
    : `${t(language, "sellerChecked")}, ${t(language, "returnsChecked")}, ${t(language, "proof")}.`;
  const proofChecklist = [
    {
      tone: winnerProduct ? "safe" : "watch",
      label: winnerProduct ? t(language, "sellerChecked") : t(language, "checkingEllipsis"),
      detail: winnerCandidate
        ? `${winnerProduct?.seller_name ?? t(language, "seller")} ${t(language, "sellerTrust").toLowerCase()}: ${Math.floor((winnerCandidate.factors?.seller_trust ?? 0) * 100)}%.`
        : `${t(language, "sellerChecked")}, ${t(language, "returnsChecked")}, ${t(language, "proof")}.`
    },
    {
      tone: returnSignal && returnSignal !== "New data" ? "safe" : "watch",
      label: t(language, "returnsChecked"),
      detail: returnSignal ? returnSignal : `${t(language, "recentOrders")} ${t(language, "checkingEllipsis").toLowerCase()}`
    },
    {
      tone: sourceCount > 0 ? "safe" : "watch",
      label: `${sourceCount} ${t(language, "facts")} ${t(language, "checked")}`,
      detail: `${t(language, "reviews")}, ${t(language, "price")}, ${t(language, "returnsChecked")}, ${t(language, "size")}.`
    },
    {
      tone: knowledgeGraph ? "safe" : "watch",
      label: knowledgeGraph ? t(language, "proofAvailable") : graphLoading ? t(language, "checkingProof") : t(language, "checkProofFirst"),
      detail: t(language, "seeProof")
    }
  ] as const;
  const simpleChecks = [
    {
      icon: <Store size={17} />,
      label: t(language, "sellerChecked"),
      detail: `${recommendedSeller} ${score === null ? t(language, "checkingEllipsis").toLowerCase() : entryCopy.checked}`
    },
    {
      icon: <TrendingDown size={17} />,
      label: t(language, "returnsChecked"),
      detail: returnSignal ? `${returnSignal} ${t(language, "returnRisk").toLowerCase()}` : t(language, "checkingEllipsis")
    },
    {
      icon: <FileSearch size={17} />,
      label: t(language, "proof"),
      detail: sourceCount > 0 ? `${sourceCount} ${t(language, "facts")} ${t(language, "checked")}` : t(language, "checkingProof")
    }
  ];

  return (
    <div className="sarthi-saved-workspace buyer-shop-shell buyer-simple-entry">
      <header className="buyer-simple-hero">
        <button type="button" onClick={onBack} className="workspace-back-button buyer-simple-back">
          <ArrowLeft size={16} />
          <span>{t(language, "catalog")}</span>
        </button>

        <div className="buyer-simple-product">
          <img
            src={productImageSource(savedProduct)}
            alt={savedProduct.title}
            onError={(event) => { event.currentTarget.src = fallbackProductImage(savedProduct.color_family); }}
          />
          <div>
            <span className="eyebrow">{t(language, "trustCheckReady")}</span>
            <h1>{decisionTitle}</h1>
            <p>
              <strong>{savedProduct.title.split("-")[0].trim()}</strong>
              <span>Rs {savedProduct.base_price}</span>
              <span>{similarSellerCount} {t(language, "similarSellers")}</span>
            </p>
          </div>
        </div>

        <div className="buyer-simple-score" aria-label={t(language, "trustReceipt")}>
          <strong>{score ?? "--"}</strong>
          <span>{score === null ? t(language, "checkingEllipsis") : t(language, "trustReceipt")}</span>
        </div>
      </header>

      <nav className="buyer-check-steps" aria-label="Trust check steps">
        <span className="complete"><b>1.</b> Saved item</span>
        <span className={sourceCount > 0 ? "complete" : "active"}><b>2.</b> Evidence checked</span>
        <span className={result ? "active" : ""}><b>3.</b> Choose safely</span>
      </nav>

      <main className="buyer-simple-main">
        <section className="buyer-simple-decision-card">
          <div className="buyer-simple-decision-copy">
            <span className="eyebrow">{t(language, "nextStep")}</span>
            <h2>{entryCopy.chooseSeller.replace("{seller}", recommendedSeller)}</h2>
            <p>{decisionBody}</p>
          </div>

          <div className="buyer-simple-seller">
            <img
              src={productImageSource(recommendedProduct)}
              alt={recommendedProduct.title}
              onError={(event) => { event.currentTarget.src = fallbackProductImage(recommendedProduct.color_family); }}
            />
            <div>
              <span>{entryCopy.recommendedSeller}</span>
              <strong>{recommendedSeller}</strong>
              <small>Rs {recommendedProduct.base_price} - {recommendedProduct.delivery_text}</small>
            </div>
            <CheckCircle2 size={19} />
          </div>

          <div className="buyer-simple-checks compact" aria-label={t(language, "agentChecks")}>
            {simpleChecks.map((item) => (
              <div key={item.label}>
                {item.icon}
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="buyer-simple-actions">
            <button
              type="button"
              className="primary"
              onClick={() => onOpenProduct(recommendedProduct, recommendedVariantId)}
              disabled={!recommendedProduct}
            >
              {entryCopy.continueWithPick}
            </button>
            <button type="button" onClick={() => result && onOpenResult(result)} disabled={!result}>
              {result ? entryCopy.compareSellers : t(language, "checkingEllipsis")}
            </button>
            <button type="button" onClick={() => setDetailsOpen((open) => !open)}>
              {detailsOpen ? entryCopy.hideDetails : entryCopy.showDetails}
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
        </section>

        <form
          className="buyer-simple-question"
          aria-label="Ask from verified facts"
          onSubmit={(event) => {
            event.preventDefault();
            onAskDecision(decisionQuestion || entryCopy.defaultQuestion, savedProduct);
          }}
        >
          <MessageCircle size={18} />
          <div className="buyer-simple-question-copy">
            <strong>Ask from verified facts</strong>
            <span>Answers use verified product, seller, return, and proof records only.</span>
            <input
              value={decisionQuestion}
              onChange={(event) => onDecisionQuestionChange(event.target.value)}
              placeholder={entryCopy.questionPlaceholder}
            />
          </div>
          <button type="submit" disabled={decisionLoading}>
            {decisionLoading && <span className="buyer-inline-spinner" aria-hidden="true" />}
            {decisionLoading ? t(language, "checkingEllipsis") : t(language, "check")}
          </button>
        </form>

        {(decisionLoading || regretDecision) && (
          <DecisionAnswerPanel
            decision={regretDecision}
            loading={decisionLoading}
            language={language}
            onOpenProof={onOpenProof}
            onOpenProduct={onOpenProduct}
          />
        )}

        {detailsOpen && (
          <section className="buyer-simple-details" aria-label={t(language, "seeProof")}>
            <TrustRadarCard
              radar={wishlistRadar}
              loading={radarLoading}
              error={radarError}
              activeFitProfile={activeFitProfile}
              similarity={knowledgeGraph?.summary.similarity ?? wishlistRadar?.similarity ?? null}
              language={language}
              onOpenProof={onOpenProof}
            />
            <section className="workspace-proof-simple compact" aria-label={t(language, "agentChecks")}>
              <div className="workspace-proof-simple-head">
                <div>
                  <span className="eyebrow">{t(language, "agentChecks")}</span>
                  <h3>{knowledgeGraph ? t(language, "proofAvailable") : t(language, "checkingProof")}</h3>
                </div>
                <span>{sourceCount} {t(language, "facts")}</span>
              </div>
              <div className="workspace-proof-plain-list">
                {proofChecklist.slice(0, 3).map((item) => (
                  <span key={item.label} className={item.tone}>
                    {item.tone === "safe" ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                    {item.label}
                  </span>
                ))}
              </div>
              <button type="button" onClick={() => wishlistRadar && onOpenProof(wishlistRadar.trace_id)} disabled={!wishlistRadar}>
                {t(language, "seeProof")}
              </button>
            </section>
            <details className="buyer-graph-details">
              <summary>
                <span className="buyer-graph-summary-icon">
                  <FileSearch size={16} />
                </span>
                <span>
                  <strong>{entryCopy.evidenceGraph}</strong>
                  <small>{entryCopy.graphSubtitle}</small>
                </span>
                <em>
                  {knowledgeGraph
                    ? `${knowledgeGraph.summary.fact_count} ${t(language, "facts")}`
                    : graphLoading
                      ? t(language, "checkingProof")
                      : entryCopy.graphUnavailable}
                </em>
              </summary>
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
                onRetry={onRetryGraph}
              />
            </details>
          </section>
        )}
      </main>
    </div>
  );
}

function DecisionAnswerPanel({
  decision,
  loading,
  language,
  onOpenProof,
  onOpenProduct
}: {
  decision: RegretDecisionResponse | null;
  loading: boolean;
  language: LanguageCode;
  onOpenProof: (traceId: string) => void;
  onOpenProduct: (product: Product, variantId?: string | null) => void;
}) {
  if (loading && !decision) {
    return (
      <section className="buyer-decision-answer is-loading" aria-live="polite" aria-busy="true">
        <div className="buyer-decision-answer-head">
          <div>
            <span className="eyebrow">Verified answer</span>
            <h3>Checking verified records</h3>
            <p>Sarthi is checking seller, proof, returns, price, and fit records.</p>
          </div>
          <span className="buyer-answer-spinner" aria-hidden="true" />
        </div>
        <div className="buyer-answer-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (!decision) return null;

  const candidate = decision.ranking.candidates.find((item) => item.variant_id === decision.selected.variant.variant_id) ??
    decision.ranking.candidates[0] ??
    null;
  const score = candidate ? trustScorePercent(candidate) : null;
  const passport = decision.sku_truth_passport;
  const proofGap = decision.missing_proof;
  const proofRequest = decision.proof_request;
  const reasons = [
    passport.truth_summary.buyer_guidance,
    `${passport.outcome_evidence.delivered_orders_90d} ${t(language, "recentOrders").toLowerCase()}, ${Math.round(passport.outcome_evidence.return_rate * 100)}% ${t(language, "returnRisk").toLowerCase()}.`,
    `Fit: ${passport.fit.recommended_size} (${passport.fit.confidence}).`,
    proofGap ? `${labelize(proofGap.attribute)} proof: ${proofGap.summary}` : "No major proof gap is blocking this answer."
  ].filter(Boolean).slice(0, 3);
  const tone = decision.decision.confidence === "high" ? "safe" : decision.decision.confidence === "blocked" ? "blocked" : "watch";

  return (
    <section className={`buyer-decision-answer ${tone}`} aria-live="polite">
      <div className="buyer-decision-answer-head">
        <div>
          <span className="eyebrow">Verified answer</span>
          <h3>{decision.decision.label}</h3>
          <p>{decision.decision.summary}</p>
        </div>
        <div className="buyer-decision-score">
          <strong>{score ?? "--"}</strong>
          <span>{decision.decision.confidence}</span>
        </div>
      </div>

      <div className="buyer-decision-proof-status">
        {proofRequest ? (
          <>
            <FileSearch size={16} />
            <div>
              <strong>{labelize(proofRequest.attribute)} proof requested</strong>
              <span>{labelize(proofRequest.status)} / {proofRequest.request_count} buyer {proofRequest.request_count === 1 ? "ask" : "asks"}</span>
            </div>
          </>
        ) : proofGap ? (
          <>
            <AlertTriangle size={16} />
            <div>
              <strong>{labelize(proofGap.attribute)} proof is still weak</strong>
              <span>{proofGap.title}</span>
            </div>
          </>
        ) : (
          <>
            <ShieldCheck size={16} />
            <div>
              <strong>Proof is usable for this answer</strong>
              <span>{passport.fact_ids.length} facts checked before recommending.</span>
            </div>
          </>
        )}
      </div>

      <div className="buyer-decision-reasons">
        {reasons.map((reason) => (
          <span key={reason}>
            <CheckCircle2 size={13} />
            {reason}
          </span>
        ))}
      </div>

      <div className="buyer-decision-actions">
        <button type="button" className="primary" onClick={() => onOpenProduct(decision.selected.product, decision.selected.variant.variant_id)}>
          {decision.decision.primary_action || "View product"}
        </button>
        <button type="button" onClick={() => onOpenProof(decision.trace_id)}>
          {t(language, "seeProof")}
        </button>
      </div>
    </section>
  );
}

function TrustRadarCard({
  radar,
  loading,
  error,
  activeFitProfile,
  similarity,
  language,
  onOpenProof
}: {
  radar: WishlistRadarEvent | null;
  loading: boolean;
  error: string | null;
  activeFitProfile: FitProfile | null;
  similarity: ClusterKnowledgeGraph["summary"]["similarity"] | null;
  language: LanguageCode;
  onOpenProof: (traceId: string) => void;
}) {
  const copy = trustRadarCopy(language);

  if (error) {
    return (
      <section className="trust-radar-card attention">
        <div className="trust-radar-header">
          <div>
            <span className="eyebrow">{copy.savedProductRadar}</span>
            <h3>{copy.refreshFailed}</h3>
          </div>
          <AlertTriangle size={18} />
        </div>
        <p>{copy.refreshFailedBody}</p>
      </section>
    );
  }

  if (!radar) {
    return (
      <section className="trust-radar-card loading">
        <div className="trust-radar-header">
          <div>
            <span className="eyebrow">{copy.savedProductRadar}</span>
            <h3>{loading ? copy.watchingProduct : copy.waitingIntent}</h3>
          </div>
          <ShieldCheck size={18} />
        </div>
        <p>{copy.watchingBody}</p>
      </section>
    );
  }

  const recommended = radar.candidates.find((candidate) => candidate.is_recommended) ?? radar.candidates[0] ?? null;
  const score = Math.floor(radar.recommended_score * 100);
  const headline = radar.status === "better_option_found"
    ? copy.betterSellerFound
    : radar.status === "needs_one_check"
      ? copy.askProofFirst
      : copy.savedOptionChecked;
  const summary = recommended
    ? copy.recommendedSummary.replace("{seller}", recommended.product.seller_name)
    : copy.checkedSummary;

  return (
    <section className={`trust-radar-card ${radar.status}`}>
      <div className="trust-radar-header">
        <div>
          <span className="eyebrow">{copy.savedProductRadar}</span>
          <h3>{headline}</h3>
          <p>{summary}</p>
        </div>
        <div className="radar-score">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>

      {recommended && (
        <div className="radar-recommendation-row">
          <img
            src={productImageSource(recommended.product)}
            alt={recommended.product.title}
            onError={(event) => { event.currentTarget.src = fallbackProductImage(recommended.product.color_family); }}
          />
          <div>
            <span>{recommended.is_saved_product ? copy.savedOption : copy.recommendedOption}</span>
            <strong>{recommended.product.seller_name}</strong>
            <small>
              {Math.round(recommended.evidence.return_rate * 100)}% {t(language, "returnRisk").toLowerCase()} | {labelize(recommended.evidence.seller_verification)} {t(language, "seller").toLowerCase()}
            </small>
          </div>
        </div>
      )}

      <div className="radar-context-row compact">
        <span>{activeFitProfile ? `${activeFitProfile.label} ${copy.profile}` : copy.buyerProfile}</span>
        <span>{similarity ? `${similarity.distinct_seller_count} ${t(language, "similarSellers")}` : copy.similarityChecked}</span>
        <span>{radar.alerts.length ? `${radar.alerts.length} ${copy.alerts}` : copy.noBlockerAlert}</span>
      </div>

      {radar.alerts.length > 0 && (
        <div className="radar-alert-list compact">
          <AlertTriangle size={13} />
          <span>{radar.alerts[0].title}</span>
        </div>
      )}

      <div className="radar-action-row">
        <div>
          <span>{t(language, "nextStep")}</span>
          <strong>{radar.next_best_action.label}</strong>
          <small>{radar.next_best_action.reason}</small>
        </div>
        <button type="button" onClick={() => onOpenProof(radar.trace_id)}>
          {t(language, "seeProof")}
        </button>
      </div>
    </section>
  );
}

function returnSignalLabel(deliveredOrders: number, returnRate: number) {
  if (deliveredOrders < 8) return "New data";
  return `${Math.round(returnRate * 100)}%`;
}

type SavedEntryCopyKey =
  | "betterSeller"
  | "askProofFirst"
  | "readyToCompare"
  | "checking"
  | "saved"
  | "recommendReason"
  | "chooseSeller"
  | "checked"
  | "recommendedSeller"
  | "continueWithPick"
  | "compareSellers"
  | "showDetails"
  | "hideDetails"
  | "questionPlaceholder"
  | "defaultQuestion"
  | "evidenceGraph"
  | "graphSubtitle"
  | "graphUnavailable";

const SAVED_ENTRY_COPY: Record<LanguageCode, Record<SavedEntryCopyKey, string>> = {
  english: {
    betterSeller: "Sarthi found a safer seller",
    askProofFirst: "Ask for proof before buying",
    readyToCompare: "Best seller is ready",
    checking: "Checking this product",
    saved: "Saved for trust check",
    recommendReason: "{seller} looks stronger on returns, proof, and price.",
    chooseSeller: "Choose {seller}",
    checked: "checked",
    recommendedSeller: "Sarthi pick",
    continueWithPick: "Continue with pick",
    compareSellers: "Compare sellers",
    showDetails: "Show proof details",
    hideDetails: "Hide details",
    questionPlaceholder: "Ask: should I buy this?",
    defaultQuestion: "Should I buy this?",
    evidenceGraph: "Evidence graph",
    graphSubtitle: "Open the connected proof map",
    graphUnavailable: "Not ready"
  },
  hindi: {
    betterSeller: "Sarthi ne safer seller dhoonda",
    askProofFirst: "Buy se pehle proof maango",
    readyToCompare: "Best seller ready hai",
    checking: "Product check ho raha hai",
    saved: "Trust check ke liye saved",
    recommendReason: "{seller} returns, proof, aur price me stronger lagta hai.",
    chooseSeller: "{seller} choose karo",
    checked: "checked",
    recommendedSeller: "Sarthi pick",
    continueWithPick: "Pick continue karo",
    compareSellers: "Sellers compare karo",
    showDetails: "Proof details dekho",
    hideDetails: "Details hide karo",
    questionPlaceholder: "Poochho: buy karna safe hai?",
    defaultQuestion: "Kya mujhe ye buy karna chahiye?",
    evidenceGraph: "Evidence graph",
    graphSubtitle: "Connected proof map dekho",
    graphUnavailable: "Not ready"
  },
  hinglish: {
    betterSeller: "Sarthi found a safer seller",
    askProofFirst: "Buy se pehle proof maango",
    readyToCompare: "Best seller ready hai",
    checking: "Product check ho raha hai",
    saved: "Trust check ke liye saved",
    recommendReason: "{seller} returns, proof, aur price me stronger lagta hai.",
    chooseSeller: "Choose {seller}",
    checked: "checked",
    recommendedSeller: "Sarthi pick",
    continueWithPick: "Continue with pick",
    compareSellers: "Compare sellers",
    showDetails: "Proof details dekho",
    hideDetails: "Hide details",
    questionPlaceholder: "Ask: buy karna safe hai?",
    defaultQuestion: "Should I buy this?",
    evidenceGraph: "Evidence graph",
    graphSubtitle: "Connected proof map dekho",
    graphUnavailable: "Not ready"
  }
};

function savedEntryCopy(language: LanguageCode) {
  return SAVED_ENTRY_COPY[language] ?? SAVED_ENTRY_COPY.english;
}

type TrustRadarCopyKey =
  | "savedProductRadar"
  | "refreshFailed"
  | "refreshFailedBody"
  | "watchingProduct"
  | "waitingIntent"
  | "watchingBody"
  | "betterSellerFound"
  | "askProofFirst"
  | "savedOptionChecked"
  | "recommendedSummary"
  | "checkedSummary"
  | "profile"
  | "buyerProfile"
  | "similarityChecked"
  | "alerts"
  | "noBlockerAlert"
  | "scoreLift"
  | "savedOption"
  | "recommendedOption"
  | "savedSeller"
  | "recommended";

const TRUST_RADAR_COPY: Record<LanguageCode, Record<TrustRadarCopyKey, string>> = {
  english: {
    savedProductRadar: "Saved product radar",
    refreshFailed: "Radar could not refresh",
    refreshFailedBody: "Product comparison still works. Saved-product watch will retry when proof data refreshes.",
    watchingProduct: "Watching this product",
    waitingIntent: "Waiting for saved item",
    watchingBody: "Sarthi is watching seller options, proof gaps, fit profile, and checkout risk.",
    betterSellerFound: "Better seller found",
    askProofFirst: "Ask proof first",
    savedOptionChecked: "Saved option checked",
    recommendedSummary: "{seller} is strongest on returns, proof, and price.",
    checkedSummary: "Sarthi checked seller, SKU, reviews, proof, and price facts.",
    profile: "profile",
    buyerProfile: "Buyer profile",
    similarityChecked: "Similarity checked",
    alerts: "alerts",
    noBlockerAlert: "No blocker alert",
    scoreLift: "score lift",
    savedOption: "Saved option",
    recommendedOption: "Recommended option",
    savedSeller: "Saved seller",
    recommended: "Recommended"
  },
  hindi: {
    savedProductRadar: "Saved product radar",
    refreshFailed: "Radar refresh nahi hua",
    refreshFailedBody: "Product comparison chalega. Proof data refresh hote hi watch retry hoga.",
    watchingProduct: "Product watch ho raha hai",
    waitingIntent: "Saved item ka wait",
    watchingBody: "Sarthi seller options, proof gaps, fit profile, aur checkout risk watch kar raha hai.",
    betterSellerFound: "Better seller mila",
    askProofFirst: "Pehle proof maango",
    savedOptionChecked: "Saved option checked",
    recommendedSummary: "{seller} returns, proof, aur price me strongest hai.",
    checkedSummary: "Sarthi ne seller, SKU, reviews, proof, aur price facts check kiye.",
    profile: "profile",
    buyerProfile: "Buyer profile",
    similarityChecked: "Similarity checked",
    alerts: "alerts",
    noBlockerAlert: "Blocker alert nahi",
    scoreLift: "score lift",
    savedOption: "Saved option",
    recommendedOption: "Recommended option",
    savedSeller: "Saved seller",
    recommended: "Recommended"
  },
  hinglish: {
    savedProductRadar: "Saved product radar",
    refreshFailed: "Radar refresh nahi hua",
    refreshFailedBody: "Product comparison still works. Proof data refresh ke baad watch retry hoga.",
    watchingProduct: "Watching this product",
    waitingIntent: "Waiting for saved item",
    watchingBody: "Sarthi seller options, proof gaps, fit profile, aur checkout risk watch kar raha hai.",
    betterSellerFound: "Better seller found",
    askProofFirst: "Proof first",
    savedOptionChecked: "Saved option checked",
    recommendedSummary: "{seller} returns, proof, aur price me strongest hai.",
    checkedSummary: "Sarthi ne seller, SKU, reviews, proof, aur price facts check kiye.",
    profile: "profile",
    buyerProfile: "Buyer profile",
    similarityChecked: "Similarity checked",
    alerts: "alerts",
    noBlockerAlert: "No blocker alert",
    scoreLift: "score lift",
    savedOption: "Saved option",
    recommendedOption: "Recommended option",
    savedSeller: "Saved seller",
    recommended: "Recommended"
  }
};

function trustRadarCopy(language: LanguageCode) {
  return TRUST_RADAR_COPY[language] ?? TRUST_RADAR_COPY.english;
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

function productImageSource(product: Pick<Product, "image_url" | "color_family">) {
  const source = product.image_url?.trim() ?? "";
  if (!source || source.includes("placehold.co") || source.includes("text=")) {
    return fallbackProductImage(product.color_family);
  }
  return source;
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
