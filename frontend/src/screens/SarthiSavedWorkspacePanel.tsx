import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, FileSearch, MessageCircle, ShieldCheck, Store, TrendingDown, X } from "lucide-react";
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
  const [graphDrawerOpen, setGraphDrawerOpen] = useState(false);
  const [inspectedProductId, setInspectedProductId] = useState<string | null>(null);
  useEffect(() => {
    if (openProofDetails) setDetailsOpen(true);
  }, [openProofDetails, savedProduct.product_id]);
  useEffect(() => {
    setInspectedProductId(null);
  }, [savedProduct.product_id]);

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
  const sellerOptions = uniqueProducts([recommendedProduct, savedProduct, ...similarProducts]);
  const entryCopy = savedEntryCopy(language);
  const hasComparableSellers = sellerOptions.length > 1;
  const hasUsableEvidence = Boolean(result || radarPick || knowledgeGraph || regretDecision);
  const savedCheckRefreshing = autoScan.status === "scanning" && hasUsableEvidence;
  const sellerCountText = hasComparableSellers
    ? `${sellerOptions.length} ${t(language, "similarSellers")}`
    : entryCopy.oneSeller;
  const inspectedProduct = sellerOptions.find((product) => product.product_id === inspectedProductId) ?? recommendedProduct;
  const inspectedCandidate = result ? candidateForProduct(result, inspectedProduct) : null;
  const inspectedRadarCandidate = wishlistRadar?.candidates.find((candidate) => candidate.product.product_id === inspectedProduct.product_id) ?? null;
  const inspectedVariantId = inspectedCandidate?.variant_id ?? inspectedRadarCandidate?.variant?.variant_id ?? null;
  const inspectedScore = inspectedCandidate
    ? trustScorePercent(inspectedCandidate)
    : inspectedRadarCandidate
      ? Math.floor(inspectedRadarCandidate.score * 100)
      : null;
  const inspectedContext = knowledgeGraph?.seller_context.find((item) => item.product.product_id === inspectedProduct.product_id) ?? null;
  const returnSignal = inspectedContext
    ? returnSignalLabel(inspectedContext.evidence.delivered_orders_90d, inspectedContext.evidence.return_rate)
    : regretDecision
      ? returnSignalLabel(
          regretDecision.sku_truth_passport.outcome_evidence.delivered_orders_90d,
          regretDecision.sku_truth_passport.outcome_evidence.return_rate
        )
    : null;
  const sourceCount = knowledgeGraph?.summary.fact_count ?? result?.ranking.fact_ids.length ?? 0;
  const inspectedFactCount = inspectedRadarCandidate?.fact_ids.length ?? sourceCount;
  const inspectedProofCount = inspectedContext?.proof_coverage
    ? Object.values(inspectedContext.proof_coverage).filter((item) => item.sufficient).length
    : inspectedFactCount > 0
      ? Math.min(3, inspectedFactCount)
      : 0;
  const inspectedIsRecommended = inspectedProduct.product_id === recommendedProduct.product_id;
  const inspectedIsSaved = inspectedProduct.product_id === savedProduct.product_id;
  const decisionTitle = !hasComparableSellers
    ? entryCopy.singleSellerDecision
    : wishlistRadar?.status === "better_option_found"
    ? entryCopy.betterSeller
    : wishlistRadar?.status === "needs_one_check"
      ? entryCopy.askProofFirst
      : result
        ? entryCopy.readyToCompare
        : autoScan.status === "scanning"
          ? entryCopy.checking
          : entryCopy.saved;
  const decisionBody = !hasComparableSellers
    ? entryCopy.singleSellerBody.replace("{seller}", savedProduct.seller_name)
    : radarPick
    ? entryCopy.recommendReason.replace("{seller}", recommendedSeller)
    : `${t(language, "sellerChecked")}, ${t(language, "returnsChecked")}, ${t(language, "proof")}.`;
  const inspectedDecisionTitle = !hasComparableSellers
    ? entryCopy.singleSellerDecision
    : inspectedIsRecommended
    ? entryCopy.chooseSeller.replace("{seller}", inspectedProduct.seller_name)
    : inspectedIsSaved && recommendedProduct.product_id !== savedProduct.product_id
      ? entryCopy.savedSellerNeedsCheck
      : entryCopy.inspectSeller.replace("{seller}", inspectedProduct.seller_name);
  const inspectedDecisionBody = !hasComparableSellers
    ? entryCopy.singleSellerBody.replace("{seller}", inspectedProduct.seller_name)
    : inspectedIsRecommended
    ? decisionBody
    : inspectedScore !== null
      ? entryCopy.inspectReason
          .replace("{seller}", inspectedProduct.seller_name)
          .replace("{score}", String(inspectedScore))
      : entryCopy.inspectPending.replace("{seller}", inspectedProduct.seller_name);
  const proofChecklist = [
    {
      tone: inspectedCandidate || inspectedRadarCandidate ? "safe" : "watch",
      label: inspectedCandidate || inspectedRadarCandidate ? t(language, "sellerChecked") : t(language, "checkingEllipsis"),
      detail: inspectedCandidate
        ? `${inspectedProduct.seller_name} ${t(language, "sellerTrust").toLowerCase()}: ${Math.floor((inspectedCandidate.factors?.seller_trust ?? 0) * 100)}%.`
        : inspectedRadarCandidate
          ? `${inspectedProduct.seller_name} ${entryCopy.checked}.`
        : `${t(language, "sellerChecked")}, ${t(language, "returnsChecked")}, ${t(language, "proof")}.`
    },
    {
      tone: returnSignal && returnSignal !== "New data" ? "safe" : "watch",
      label: t(language, "returnsChecked"),
      detail: returnSignal ? returnSignal : `${t(language, "recentOrders")} ${t(language, "checkingEllipsis").toLowerCase()}`
    },
    {
      tone: inspectedFactCount > 0 ? "safe" : "watch",
      label: `${inspectedFactCount} ${t(language, "facts")} ${t(language, "checked")}`,
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
      detail: !hasComparableSellers
        ? entryCopy.onlySellerAvailable.replace("{seller}", inspectedProduct.seller_name)
        : `${inspectedProduct.seller_name} ${inspectedScore === null ? t(language, "checkingEllipsis").toLowerCase() : entryCopy.checked}`
    },
    {
      icon: <TrendingDown size={17} />,
      label: t(language, "returnsChecked"),
      detail: returnSignal
        ? `${returnSignal} ${t(language, "returnRisk").toLowerCase()}`
        : graphLoading
          ? t(language, "checkingEllipsis")
          : entryCopy.returnDataThin
    },
    {
      icon: <FileSearch size={17} />,
      label: t(language, "proof"),
      detail: inspectedProofCount > 0
        ? `${inspectedProofCount} ${t(language, "facts")} ${t(language, "checked")}`
        : graphLoading
          ? t(language, "checkingProof")
          : entryCopy.proofNotReady
    }
  ];

  function openProofFromGraph(traceId: string) {
    setGraphDrawerOpen(false);
    window.setTimeout(() => onOpenProof(traceId), 0);
  }

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
              <span>{sellerCountText}</span>
              {savedCheckRefreshing && <span>{entryCopy.refreshingQuietly}</span>}
            </p>
          </div>
        </div>

        <div className="buyer-simple-score" aria-label={t(language, "trustReceipt")}>
          <strong>{score ?? "--"}</strong>
          <span>{score === null ? entryCopy.proofCheck : t(language, "trustReceipt")}</span>
        </div>
      </header>

      <section className="buyer-seller-lane" aria-label="Same item seller options">
        <div className="buyer-seller-lane-head">
          <span className="eyebrow">{entryCopy.sameItemOptions}</span>
          <strong>
            {sellerOptions.length > 1
              ? entryCopy.tapSeller
              : entryCopy.singleSeller}
          </strong>
          <small>
            {hasComparableSellers
              ? `${sellerOptions.length} ${t(language, "similarSellers")} ${entryCopy.mappedByEvidence}`
              : entryCopy.onlySellerCheck}
          </small>
        </div>
        <div className={`buyer-seller-options ${sellerOptions.length === 1 ? "single" : ""}`}>
          {sellerOptions.map((product) => {
            const optionScore = scoreForProduct(product, result, wishlistRadar);
            const isActive = product.product_id === inspectedProduct.product_id;
            const isRecommended = product.product_id === recommendedProduct.product_id;
            const isSaved = product.product_id === savedProduct.product_id;
            return (
              <button
                type="button"
                key={product.product_id}
                className={`buyer-seller-option ${isActive ? "active" : ""} ${isRecommended ? "recommended" : ""}`}
                onClick={() => setInspectedProductId(product.product_id)}
                aria-pressed={isActive}
              >
                <img
                  src={productImageSource(product)}
                  alt={product.title}
                  onError={(event) => { event.currentTarget.src = fallbackProductImage(product.color_family); }}
                />
                <span>
                  <b>{product.seller_name}</b>
                  <small>{isRecommended ? entryCopy.recommendedSeller : isSaved ? entryCopy.savedSeller : entryCopy.otherSeller}</small>
                </span>
                <em className={optionScore === null ? "unknown" : scoreTone(optionScore)}>
                  {optionScore ?? (hasComparableSellers ? "--" : entryCopy.proofCheck)}
                </em>
              </button>
            );
          })}
        </div>
      </section>

      <main className="buyer-simple-main">
        <section className="buyer-simple-decision-card">
          <div className="buyer-simple-decision-copy">
            <span className="eyebrow">{t(language, "nextStep")}</span>
            <h2>{inspectedDecisionTitle}</h2>
            <p>{inspectedDecisionBody}</p>
          </div>

          <div className="buyer-simple-seller">
            <img
              src={productImageSource(inspectedProduct)}
              alt={inspectedProduct.title}
              onError={(event) => { event.currentTarget.src = fallbackProductImage(inspectedProduct.color_family); }}
            />
            <div>
              <span>{inspectedIsRecommended ? entryCopy.recommendedSeller : inspectedIsSaved ? entryCopy.savedSeller : entryCopy.inspectingSeller}</span>
              <strong>{inspectedProduct.seller_name}</strong>
              <small>Rs {inspectedProduct.base_price} - {inspectedProduct.delivery_text}</small>
            </div>
            {inspectedIsRecommended ? <CheckCircle2 size={19} /> : <ShieldCheck size={19} />}
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
              onClick={() => onOpenProduct(inspectedProduct, inspectedVariantId ?? recommendedVariantId)}
              disabled={!inspectedProduct}
            >
              {inspectedIsRecommended ? entryCopy.continueWithPick : entryCopy.viewSeller}
            </button>
            <button
              type="button"
              onClick={() => hasComparableSellers ? result && onOpenResult(result) : setDetailsOpen((open) => !open)}
              disabled={hasComparableSellers && !result}
            >
              {hasComparableSellers
                ? result ? entryCopy.compareSellers : entryCopy.preparingCompare
                : detailsOpen ? entryCopy.hideDetails : entryCopy.checkProof}
            </button>
            <button type="button" onClick={() => setGraphDrawerOpen(true)} disabled={!knowledgeGraph && graphLoading}>
              <FileSearch size={15} aria-hidden="true" />
              {!knowledgeGraph && graphLoading ? "Graph loading" : "Graph chat"}
            </button>
            {hasComparableSellers && (
              <button type="button" onClick={() => setDetailsOpen((open) => !open)}>
                {detailsOpen ? entryCopy.hideDetails : entryCopy.showDetails}
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </section>

        <form
          className="buyer-simple-question"
          aria-label="Ask from verified facts"
          onSubmit={(event) => {
            event.preventDefault();
            onAskDecision(decisionQuestion || entryCopy.defaultQuestion, inspectedProduct);
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
            requestLoading={decisionLoading}
            onRequestProof={(question, product) => onAskDecision(question, product)}
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
            <section className="workspace-proof-simple compact saved-evidence-receipt" aria-label={t(language, "agentChecks")}>
              <div className="workspace-proof-simple-head">
                <div>
                  <span>{t(language, "agentChecks")}</span>
                  <h3>{knowledgeGraph ? t(language, "proofAvailable") : t(language, "checkingProof")}</h3>
                  <p>
                    {knowledgeGraph
                      ? "Only seller proof, returns, reviews, and product records are used."
                      : "Sarthi is still reading verified evidence for this item."}
                  </p>
                </div>
                <span>{sourceCount} {t(language, "facts")}</span>
              </div>
              <ul className="workspace-proof-plain-list">
                {proofChecklist.slice(0, 3).map((item) => (
                  <li key={item.label} className={item.tone}>
                    {item.tone === "safe" ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        )}
      </main>

      {graphDrawerOpen && (
        <div className="bottom-sheet-overlay evidence-graph-drawer-overlay" onClick={() => setGraphDrawerOpen(false)}>
          <section
            className="bottom-sheet-content evidence-graph-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-graph-drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow">{entryCopy.evidenceGraph}</span>
                <h3 className="sheet-title" id="evidence-graph-drawer-title">Proof links</h3>
              </div>
              <button className="bottom-sheet-close" type="button" onClick={() => setGraphDrawerOpen(false)} aria-label="Close evidence graph">
                <X size={16} />
              </button>
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
              onOpenProof={openProofFromGraph}
              onRetry={onRetryGraph}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function DecisionAnswerPanel({
  decision,
  loading,
  language,
  requestLoading,
  onRequestProof,
  onOpenProof,
  onOpenProduct
}: {
  decision: RegretDecisionResponse | null;
  loading: boolean;
  language: LanguageCode;
  requestLoading: boolean;
  onRequestProof: (question: string, product: Product) => void;
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
  const proofAttribute = sentenceCase(labelize(proofRequest?.attribute ?? proofGap?.attribute ?? "proof"));
  const requestQuestion = proofGap
    ? `Please ask the seller for ${labelize(proofGap.attribute)} proof for this product.`
    : "Please ask the seller for proof for this product.";
  const answerTitle = proofRequest
    ? "Proof request sent"
    : proofGap
      ? `${proofAttribute} proof is missing`
      : decision.decision.label;
  const answerSummary = proofRequest
    ? `${proofAttribute} proof is now in the seller queue. Confidence improves only after seller upload and reviewer approval.`
    : proofGap
      ? "Sarthi will not treat this claim as fully trusted until the seller uploads proof and it is reviewed."
      : decision.decision.summary;
  const reasons = [
    `${passport.outcome_evidence.delivered_orders_90d} ${t(language, "recentOrders").toLowerCase()}, ${Math.round(passport.outcome_evidence.return_rate * 100)}% ${t(language, "returnRisk").toLowerCase()}.`,
    `Fit: ${passport.fit.recommended_size} (${passport.fit.confidence}).`,
    proofGap && !proofRequest ? proofGap.summary : null
  ].filter(Boolean).slice(0, 2);
  const tone = decision.decision.confidence === "high" ? "safe" : decision.decision.confidence === "blocked" ? "blocked" : "watch";
  const proofSteps = proofRequest
    ? [
        { label: "Buyer ask saved", done: true },
        { label: "Seller upload", done: proofRequest.status === "submitted" || proofRequest.status === "resolved" },
        { label: "Reviewer check", done: proofRequest.status === "resolved" },
        { label: "Buyer notified", done: proofRequest.status === "resolved" }
      ]
    : [
        { label: "Proof gap found", done: Boolean(proofGap) },
        { label: "Buyer asks", done: false },
        { label: "Seller uploads", done: false },
        { label: "Reviewer checks", done: false }
      ];

  return (
    <section className={`buyer-decision-answer ${tone}`} aria-live="polite">
      <div className="buyer-decision-answer-head">
        <div>
          <span className="eyebrow">Verified answer</span>
          <h3>{answerTitle}</h3>
          <p>{answerSummary}</p>
        </div>
        <div className="buyer-decision-score">
          <strong>{score ?? "--"}</strong>
          <span>{decision.decision.confidence}</span>
        </div>
      </div>

      {(proofRequest || proofGap) ? (
        <div className={`buyer-proof-request-card ${proofRequest ? "sent" : "needed"}`}>
          <div className="buyer-proof-request-main">
            {proofRequest ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
            <div>
              <strong>{proofRequest ? `${proofAttribute} proof request is live` : "Ask once, seller gets one clear task"}</strong>
              <span>
                {proofRequest
                  ? `${proofRequest.request_count} buyer${proofRequest.request_count === 1 ? "" : "s"} waiting. Status: ${labelize(proofRequest.status)}.`
                  : `${proofAttribute} proof is the missing evidence for this answer.`}
              </span>
            </div>
          </div>
          <ol className="buyer-proof-request-steps" aria-label="Proof request progress">
            {proofSteps.map((step) => (
              <li key={step.label} className={step.done ? "done" : ""}>
                <span />
                {step.label}
              </li>
            ))}
          </ol>
          <p className="buyer-proof-request-note">
            Seller sees aggregate demand only. Reviewer approval is required before confidence improves.
          </p>
        </div>
      ) : (
        <div className="buyer-decision-proof-status">
          <ShieldCheck size={16} />
          <div>
            <strong>Proof is usable for this answer</strong>
            <span>{passport.fact_ids.length} facts checked before recommending.</span>
          </div>
        </div>
      )}

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
          {proofGap ? "View safer option" : decision.decision.primary_action || "View product"}
        </button>
        {proofGap && !proofRequest && (
          <button type="button" onClick={() => onRequestProof(requestQuestion, decision.selected.product)} disabled={requestLoading}>
            {requestLoading && <span className="buyer-inline-spinner" aria-hidden="true" />}
            {requestLoading ? "Requesting..." : "Request seller proof"}
          </button>
        )}
        {!proofGap && (
          <button type="button" onClick={() => onOpenProof(decision.trace_id)}>
            Open proof trail
          </button>
        )}
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
  const firstAlert = radar.alerts[0] ?? null;
  const mappedSellerCount = similarity?.distinct_seller_count ?? radar.candidates.length;
  const factCount = radar.fact_ids.length || recommended?.fact_ids.length || 0;
  const sellerName = recommended?.product.seller_name ?? copy.savedOption;
  const returnRisk = recommended ? `${Math.round(recommended.evidence.return_rate * 100)}%` : "--";
  const sellerVerification = recommended
    ? `${labelize(recommended.evidence.seller_verification)} ${t(language, "seller").toLowerCase()}`
    : copy.similarityChecked;

  return (
    <section className={`trust-radar-card trust-radar-receipt ${radar.status}`}>
      <div className="trust-radar-header">
        <div>
          <span className="saved-radar-kicker">{copy.savedProductRadar}</span>
          <h3>{headline}</h3>
          <p>{summary}</p>
        </div>
        <div className="radar-score">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>

      <dl className="radar-receipt-facts" aria-label="Trust evidence summary">
        <div>
          <dt>{t(language, "seller")}</dt>
          <dd>{sellerName}</dd>
        </div>
        <div>
          <dt>{t(language, "returnsChecked")}</dt>
          <dd>{returnRisk}</dd>
        </div>
        <div>
          <dt>{t(language, "similarSellers")}</dt>
          <dd>{mappedSellerCount}</dd>
        </div>
        <div>
          <dt>{activeFitProfile ? copy.profile : t(language, "proof")}</dt>
          <dd>{activeFitProfile ? activeFitProfile.label : `${factCount} ${t(language, "facts")}`}</dd>
        </div>
      </dl>

      {firstAlert ? (
        <div className={`radar-evidence-alert ${firstAlert.severity}`}>
          <AlertTriangle size={14} />
          <span>{firstAlert.title}</span>
        </div>
      ) : (
        <div className="radar-evidence-alert safe">
          <ShieldCheck size={14} />
          <span>{sellerVerification}</span>
        </div>
      )}

      <div className="radar-action-row radar-next-row">
        <div>
          <span>{t(language, "nextStep")}</span>
          <strong>{radar.next_best_action.label}</strong>
          <small>{radar.next_best_action.reason}</small>
        </div>
        <button type="button" onClick={() => onOpenProof(radar.trace_id)}>
          Open trail
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
  | "oneSeller"
  | "proofCheck"
  | "refreshingQuietly"
  | "recommendReason"
  | "chooseSeller"
  | "checked"
  | "recommendedSeller"
  | "savedSeller"
  | "otherSeller"
  | "inspectingSeller"
  | "continueWithPick"
  | "viewSeller"
  | "compareSellers"
  | "preparingCompare"
  | "checkProof"
  | "showDetails"
  | "hideDetails"
  | "sameItemOptions"
  | "tapSeller"
  | "singleSeller"
  | "mappedByEvidence"
  | "onlySellerCheck"
  | "onlySellerAvailable"
  | "singleSellerDecision"
  | "singleSellerBody"
  | "returnDataThin"
  | "proofNotReady"
  | "savedSellerNeedsCheck"
  | "inspectSeller"
  | "inspectReason"
  | "inspectPending"
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
    oneSeller: "1 seller",
    proofCheck: "Proof check",
    refreshingQuietly: "Refreshing proof quietly",
    recommendReason: "{seller} looks stronger on returns, proof, and price.",
    chooseSeller: "Choose {seller}",
    checked: "checked",
    recommendedSeller: "Sarthi pick",
    savedSeller: "Saved seller",
    otherSeller: "Other seller",
    inspectingSeller: "Inspecting seller",
    continueWithPick: "Continue with pick",
    viewSeller: "View this seller",
    compareSellers: "Compare sellers",
    preparingCompare: "Preparing comparison",
    checkProof: "Check proof",
    showDetails: "Show proof details",
    hideDetails: "Hide details",
    sameItemOptions: "Same item options",
    tapSeller: "Tap a seller to inspect proof",
    singleSeller: "Only one seller found",
    mappedByEvidence: "mapped by catalog and proof evidence.",
    onlySellerCheck: "No comparable seller is available yet. Sarthi will focus on proof and returns.",
    onlySellerAvailable: "{seller} is the only mapped seller for this catalog match.",
    singleSellerDecision: "Check proof for this seller",
    singleSellerBody: "{seller} is the only mapped seller right now, so Sarthi checks proof, returns, reviews, and fit risk instead of comparing sellers.",
    returnDataThin: "Return history is still thin for this exact listing.",
    proofNotReady: "Seller proof can be requested if a claim is unclear.",
    savedSellerNeedsCheck: "Saved seller needs one check",
    inspectSeller: "Inspect {seller}",
    inspectReason: "{seller} is scoring {score}/100. Check proof before you continue.",
    inspectPending: "{seller} is still being checked. Wait for proof and return signals before buying.",
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
    oneSeller: "1 seller",
    proofCheck: "Proof check",
    refreshingQuietly: "Proof quietly refresh ho raha hai",
    recommendReason: "{seller} returns, proof, aur price me stronger lagta hai.",
    chooseSeller: "{seller} choose karo",
    checked: "checked",
    recommendedSeller: "Sarthi pick",
    savedSeller: "Saved seller",
    otherSeller: "Other seller",
    inspectingSeller: "Seller inspect ho raha hai",
    continueWithPick: "Pick continue karo",
    viewSeller: "Is seller ko dekho",
    compareSellers: "Sellers compare karo",
    preparingCompare: "Comparison ready ho raha hai",
    checkProof: "Proof check karo",
    showDetails: "Proof details dekho",
    hideDetails: "Details hide karo",
    sameItemOptions: "Same item options",
    tapSeller: "Seller tap karke proof dekho",
    singleSeller: "Sirf ek seller mila",
    mappedByEvidence: "catalog aur proof evidence se mapped.",
    onlySellerCheck: "Abhi comparable seller nahi hai. Sarthi proof aur returns check karega.",
    onlySellerAvailable: "{seller} is catalog match ka only mapped seller hai.",
    singleSellerDecision: "Is seller ka proof check karo",
    singleSellerBody: "{seller} abhi only mapped seller hai, isliye Sarthi seller compare karne ke bajay proof, returns, reviews, aur fit risk check karta hai.",
    returnDataThin: "Is listing ke liye return history abhi thin hai.",
    proofNotReady: "Claim unclear ho to seller proof request kar sakte ho.",
    savedSellerNeedsCheck: "Saved seller ko ek check chahiye",
    inspectSeller: "{seller} inspect karo",
    inspectReason: "{seller} ka score {score}/100 hai. Continue se pehle proof check karo.",
    inspectPending: "{seller} abhi check ho raha hai. Buy se pehle proof aur return signals ka wait karo.",
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
    oneSeller: "1 seller",
    proofCheck: "Proof check",
    refreshingQuietly: "Proof quietly refresh ho raha hai",
    recommendReason: "{seller} returns, proof, aur price me stronger lagta hai.",
    chooseSeller: "Choose {seller}",
    checked: "checked",
    recommendedSeller: "Sarthi pick",
    savedSeller: "Saved seller",
    otherSeller: "Other seller",
    inspectingSeller: "Inspecting seller",
    continueWithPick: "Continue with pick",
    viewSeller: "View this seller",
    compareSellers: "Compare sellers",
    preparingCompare: "Preparing comparison",
    checkProof: "Check proof",
    showDetails: "Proof details dekho",
    hideDetails: "Hide details",
    sameItemOptions: "Same item options",
    tapSeller: "Tap seller to inspect proof",
    singleSeller: "Only one seller found",
    mappedByEvidence: "catalog aur proof evidence se mapped.",
    onlySellerCheck: "Comparable seller nahi mila. Sarthi proof aur returns pe focus karega.",
    onlySellerAvailable: "{seller} is catalog match ka only mapped seller hai.",
    singleSellerDecision: "Check proof for this seller",
    singleSellerBody: "{seller} abhi only mapped seller hai, so Sarthi seller compare ke bajay proof, returns, reviews, aur fit risk check karta hai.",
    returnDataThin: "Return history is still thin for this listing.",
    proofNotReady: "Claim unclear ho to seller proof request kar sakte ho.",
    savedSellerNeedsCheck: "Saved seller needs one check",
    inspectSeller: "Inspect {seller}",
    inspectReason: "{seller} score {score}/100 hai. Continue se pehle proof check karo.",
    inspectPending: "{seller} check ho raha hai. Buy se pehle proof aur returns ka wait karo.",
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

function uniqueProducts(products: Product[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.product_id)) return false;
    seen.add(product.product_id);
    return true;
  });
}

function scoreForProduct(product: Product, result: CompareResponse | null, radar: WishlistRadarEvent | null) {
  const compareCandidate = result ? candidateForProduct(result, product) : null;
  if (compareCandidate) return trustScorePercent(compareCandidate);
  const radarCandidate = radar?.candidates.find((candidate) => candidate.product.product_id === product.product_id) ?? null;
  return radarCandidate ? Math.floor(radarCandidate.score * 100) : null;
}

function scoreTone(score: number) {
  if (score >= 72) return "safe";
  if (score >= 58) return "watch";
  return "danger";
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}
