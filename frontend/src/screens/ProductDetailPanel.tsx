import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  HelpCircle,
  Info,
  Ruler,
  Send,
  Share2,
  ShieldCheck,
  Truck
} from "lucide-react";
import {
  askSarthi,
  createExpectationContract,
  createWishlistIntent,
  getCartConfidence,
  getKeepConfidence,
  getProductDetail
} from "../api/client";
import { simpleTrustMeaning, t, type LanguageCode } from "../i18n";
import type {
  AgentResponse,
  CartConfidenceResponse,
  ExpectationContract,
  KeepConfidenceResponse,
  Product,
  ProductDetailResponse,
  Variant
} from "../types/api";

// Screen 3: Responsive Split 2-Column Product Detail Panel
export function ProductDetailPanel({
  buyerId,
  productId,
  initialVariantId,
  clusterId,
  onBack,
  onOpenAudit,
  onOpenCheckout,
  language,
  experienceMode,
  comparisonTraceId
}: {
  buyerId: string;
  productId: string;
  initialVariantId: string | null;
  clusterId: string;
  onBack: () => void;
  onOpenAudit: (traceId: string) => void;
  onOpenCheckout: (variantId: string, contract: ExpectationContract, item: { product: Product; variant: Variant }) => void;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  comparisonTraceId?: string;
}) {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId ?? "");
  const [query, setQuery] = useState("Mera usual size L hai, chest tight toh nahi hoga?");
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [contractLocking, setContractLocking] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [proofRequesting, setProofRequesting] = useState(false);
  const [proofRequested, setProofRequested] = useState(false);
  const [proofRequestError, setProofRequestError] = useState<string | null>(null);
  const [keepConfidence, setKeepConfidence] = useState<KeepConfidenceResponse | null>(null);
  const [keepConfidenceLoading, setKeepConfidenceLoading] = useState(false);
  const [keepConfidenceError, setKeepConfidenceError] = useState<string | null>(null);
  const [cartConfidence, setCartConfidence] = useState<CartConfidenceResponse | null>(null);
  const [cartConfidenceLoading, setCartConfidenceLoading] = useState(false);
  const [cartConfidenceError, setCartConfidenceError] = useState<string | null>(null);
  const [scoreRefreshState, setScoreRefreshState] = useState<"idle" | "refreshing" | "updated">("idle");
  const [scoreRefreshReason, setScoreRefreshReason] = useState<"question" | "proof" | null>(null);
  const [receiptViewCount, setReceiptViewCount] = useState(1);
  const [activeSupportPanel, setActiveSupportPanel] = useState<"ask" | "proof" | null>(null);
  const scoreRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setContractError(null);
    setKeepConfidence(null);
    setCartConfidence(null);
    getProductDetail(buyerId, productId)
      .then((payload) => {
        setDetail(payload);
        setKeepConfidence(payload.keep_confidence);
        const initialVariant = initialVariantId
          ? payload.variants.find((variant) => variant.variant_id === initialVariantId)
          : null;
        setSelectedVariantId(initialVariant?.variant_id ?? payload.selected_variant.variant_id);
      });
  }, [buyerId, productId, initialVariantId]);

  useEffect(() => {
    if (!detail || !selectedVariantId) return;
    if (keepConfidence?.variant_id === selectedVariantId) return;
    let cancelled = false;
    setKeepConfidenceLoading(true);
    setKeepConfidenceError(null);
    getKeepConfidence(buyerId, productId, selectedVariantId)
      .then((payload) => {
        if (!cancelled) setKeepConfidence(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setKeepConfidenceError(err.message);
      })
      .finally(() => {
        if (!cancelled) setKeepConfidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerId, detail, keepConfidence?.variant_id, productId, selectedVariantId]);

  useEffect(() => {
    if (!detail || !selectedVariantId) return;
    let cancelled = false;
    setCartConfidenceLoading(true);
    setCartConfidenceError(null);
    getCartConfidence({
      buyer_id: buyerId,
      payment_mode: "cod",
      items: [{ variant_id: selectedVariantId, quantity: 1 }]
    })
      .then((payload) => {
        if (!cancelled) setCartConfidence(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setCartConfidenceError(err.message);
      })
      .finally(() => {
        if (!cancelled) setCartConfidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerId, detail, selectedVariantId]);

  useEffect(() => {
    const storageKey = `sarthi.trust-receipt.${buyerId}.${productId}`;
    const nextCount = Number(window.localStorage.getItem(storageKey) ?? "0") + 1;
    window.localStorage.setItem(storageKey, String(nextCount));
    setReceiptViewCount(nextCount);
    return () => {
      if (scoreRefreshTimerRef.current !== null) window.clearTimeout(scoreRefreshTimerRef.current);
    };
  }, [buyerId, productId]);

  useEffect(() => {
    setActiveSupportPanel(null);
  }, [productId]);

  useEffect(() => {
    setProofRequested(false);
    setProofRequestError(null);
  }, [productId, selectedVariantId]);

  if (!detail) {
    return (
      <div className="product-detail-shell loading-skeleton" aria-hidden="true">
        {/* Header Skeleton */}
        <div className="product-detail-header">
          <div className="skeleton-btn" />
          <div className="skeleton-title-group" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "12px", width: "180px" }}>
            <span className="skeleton-text short" style={{ height: "10px", margin: "2px 0" }} />
            <span className="skeleton-text medium" style={{ height: "16px", margin: 0 }} />
          </div>
        </div>

        {/* 2-Column Web Detail Layout */}
        <div className="web-detail-layout">
          {/* Left Column Skeleton */}
          <div className="detail-gallery-container">
            <div className="detail-product-card skeleton-card">
              <div className="detail-image-frame skeleton-image" style={{ height: "380px" }} />
              <div className="detail-product-summary" style={{ marginTop: "16px" }}>
                <span className="skeleton-text short" />
                <span className="skeleton-text long" />
                <span className="skeleton-text medium" style={{ height: "24px" }} />
              </div>
            </div>
            
            <div className="sku-evidence-card skeleton-card">
              <span className="skeleton-text short" />
              <div className="skeleton-grid-3">
                <div className="skeleton-grid-item" />
                <div className="skeleton-grid-item" />
                <div className="skeleton-grid-item" />
              </div>
              <span className="skeleton-text long" />
            </div>
          </div>

          {/* Right Column Skeleton */}
          <div className="detail-decision-container">
            {/* KeepConfidenceCard skeleton placeholder */}
            <div className="skeleton-card" style={{ height: "180px" }}>
              <span className="skeleton-text short" />
              <span className="skeleton-text long" />
              <span className="skeleton-text medium" />
            </div>
            
            {/* Size selector card skeleton placeholder */}
            <div className="skeleton-card" style={{ height: "140px" }}>
              <span className="skeleton-text short" />
              <div style={{ display: "flex", gap: "8px", margin: "12px 0" }}>
                <div className="skeleton-btn" style={{ borderRadius: "6px", width: "45px", height: "35px" }} />
                <div className="skeleton-btn" style={{ borderRadius: "6px", width: "45px", height: "35px" }} />
                <div className="skeleton-btn" style={{ borderRadius: "6px", width: "45px", height: "35px" }} />
                <div className="skeleton-btn" style={{ borderRadius: "6px", width: "45px", height: "35px" }} />
              </div>
              <span className="skeleton-text medium" />
            </div>

            {/* CartConfidenceCard skeleton placeholder */}
            <div className="skeleton-card" style={{ height: "150px" }}>
              <span className="skeleton-text short" />
              <span className="skeleton-text long" />
            </div>

            {/* Sticky buy button skeleton placeholder */}
            <div className="skeleton-card" style={{ height: "90px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ width: "30%" }}>
                <span className="skeleton-text short" />
                <span className="skeleton-text medium" />
              </div>
              <div className="skeleton-btn" style={{ width: "120px", height: "44px", borderRadius: "8px" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function submitQuestion() {
    setSubmitting(true);
    setAnswer(null);
    setQuestionError(null);
    try {
      const response = await askSarthi({
        buyer_id: buyerId,
        query,
        language,
        cluster_id: clusterId,
        selected_variant_id: selectedVariantId
      });
      setAnswer(response);
      if (response.answer.primary_action?.variant_id) {
        setSelectedVariantId(response.answer.primary_action.variant_id);
      }
      void refreshTrustScore("question");
    } catch (err) {
      setQuestionError(
        err instanceof Error
          ? err.message
          : t(language, "verifiedQuestionError")
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedVariant = detail.variants.find((v) => v.variant_id === selectedVariantId) || detail.selected_variant;
  const proofTraceId = comparisonTraceId ?? keepConfidence?.trace_id ?? detail.keep_confidence.trace_id;
  const displayTitle = detail.product.title.split("-")[0].trim();
  const strikePrice = Math.round(selectedVariant.current_price * 1.35);
  const sizeAccuracy = Math.round(detail.evidence.fit_as_expected_rate * 100);
  const colorMatch = detail.evidence.delivered_orders_90d
    ? Math.round((1 - detail.evidence.color_mismatch_returns / detail.evidence.delivered_orders_90d) * 100)
    : null;
  const showDetailedTrustReceipt = experienceMode === "standard";
  const trustBlocksCheckout = !detail.trust_state.can_recommend;
  const checkoutCopy = checkoutActionCopy(language, trustBlocksCheckout);
  const proofActionLabel = proofRequestActionLabel(language, proofRequested, proofRequesting);
  const shouldOfferProofRequest = detail.trust_state.missing_data.length > 0 || !detail.trust_state.can_recommend;

  async function refreshTrustScore(reason: "question" | "proof") {
    if (!selectedVariantId) return;
    setScoreRefreshReason(reason);
    setScoreRefreshState("refreshing");
    setKeepConfidenceError(null);
    try {
      const refreshed = await getKeepConfidence(buyerId, productId, selectedVariantId);
      setKeepConfidence(refreshed);
      setScoreRefreshState("updated");
      if (scoreRefreshTimerRef.current !== null) window.clearTimeout(scoreRefreshTimerRef.current);
      scoreRefreshTimerRef.current = window.setTimeout(() => setScoreRefreshState("idle"), 2400);
    } catch (err) {
      setKeepConfidenceError(err instanceof Error ? err.message : "Could not refresh trust score");
      setScoreRefreshState("idle");
    }
  }

  async function handleBuyWithContract() {
    if (!detail) return;
    setContractLocking(true);
    setContractError(null);
    try {
      const contract = await createExpectationContract({
        buyer_id: buyerId,
        variant_id: selectedVariant.variant_id,
        preferred_fit: "comfort"
      });
      onOpenCheckout(selectedVariant.variant_id, contract, {
        product: detail.product,
        variant: selectedVariant
      });
    } catch (err) {
      setContractError(err instanceof Error ? err.message : "Could not lock expectation contract");
    } finally {
      setContractLocking(false);
    }
  }

  async function handleAskSellerProof() {
    if (!detail || !selectedVariantId || proofRequesting) return;
    setProofRequesting(true);
    setProofRequestError(null);
    try {
      await createWishlistIntent({
        buyer_id: buyerId,
        product_id: detail.product.product_id,
        selected_variant_id: selectedVariantId,
        create_seller_signal: true
      });
      setProofRequested(true);
      setActiveSupportPanel("proof");
      await refreshTrustScore("proof");
    } catch (err) {
      setProofRequestError(err instanceof Error ? err.message : "Could not ask seller proof");
    } finally {
      setProofRequesting(false);
    }
  }

  return (
    <div className="product-detail-shell">
      <div className="product-detail-header">
        <button type="button" onClick={onBack} aria-label={t(language, "backToCatalog")}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="eyebrow">{t(language, "selectedListing")}</span>
          <strong>{t(language, "backToCatalog")}</strong>
        </div>
      </div>

      <div className="web-detail-layout">
        <div className="detail-gallery-container">
          <section className="detail-product-card">
            <div className="detail-image-frame">
              <img
                src={detail.product.image_url || fallbackProductImage(detail.product.color_family)}
                alt={detail.product.title}
                onError={(event) => { event.currentTarget.src = fallbackProductImage(detail.product.color_family); }}
              />
              <span>{detail.product.fabric}</span>
            </div>
            <div className="detail-product-summary">
              <span>{t(language, "soldBy")} {detail.product.seller_name}</span>
              <h1>{displayTitle}</h1>
              <div className="detail-price-row">
                <strong>Rs {selectedVariant.current_price}</strong>
                <span>Rs {strikePrice}</span>
                <small>{selectedVariant.stock} {t(language, "inStock")}</small>
              </div>
            </div>
          </section>

          <section className="sku-evidence-card">
            <span className="eyebrow">{t(language, "quickChecks")}</span>
            <div className="sku-evidence-grid">
              <div>
                <span><Ruler size={13} /> {t(language, "size")}</span>
                <strong>{sizeAccuracy}%</strong>
              </div>
              <div>
                <span><BadgeCheck size={13} /> {t(language, "color")}</span>
                <strong>{colorMatch === null ? t(language, "unknown") : `${colorMatch}%`}</strong>
              </div>
              <div>
                <span><Truck size={13} /> {t(language, "dispatch")}</span>
                <strong>{detail.evidence.median_dispatch_hours}h</strong>
              </div>
            </div>
            <p>
              {t(language, "checkedFrom")} <strong>{detail.evidence.delivered_orders_90d}</strong> {t(language, "recentOrders")}.
            </p>
          </section>
        </div>

        <aside className="detail-decision-container" aria-label="Listing decision">
          <KeepConfidenceCard
            confidence={keepConfidence}
            loading={keepConfidenceLoading}
            error={keepConfidenceError}
            refreshState={scoreRefreshState}
            onApplySize={(variantId) => setSelectedVariantId(variantId)}
            onOpenAudit={onOpenAudit}
            language={language}
          />

          <section className="size-selector-card detail-priority-card">
            <div className="section-heading-row compact">
              <div>
                <span className="eyebrow">{t(language, "beforeYouDecide")}</span>
                <h3>{t(language, "selectSize")}</h3>
              </div>
              <span className="ui-badge neutral">{detail.fit.confidence} {t(language, "confidence")}</span>
            </div>
            <div className="detail-size-options">
              {detail.variants.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  onClick={() => setSelectedVariantId(v.variant_id)}
                  className={v.variant_id === selectedVariantId ? "active" : ""}
                >
                  {v.size}
                </button>
              ))}
            </div>
            <p>
              {t(language, "recommendedSizeIs")} <strong>{detail.fit.recommended_size}</strong> {t(language, "recommendedSizeSuffix")}
            </p>
          </section>

          <section id="verified-facts" className="samvaad-card detail-samvaad-priority" aria-label="Ask from verified facts">
            <div className="samvaad-card-header">
              <ShieldCheck size={18} />
              <div>
                <span className="eyebrow">{t(language, "beforeYouDecide")}</span>
                <h3>{t(language, "askFromVerifiedFacts")}</h3>
              </div>
            </div>
            <p>{t(language, "askSimpleQuestion")}</p>

            <div className="samvaad-suggestion-list">
              <button type="button" onClick={() => setQuery("Mera usual size L hai, yahan kya size standard rahega?")}>
                {t(language, "sizeQuestionCta")}
              </button>
              <button type="button" onClick={() => setQuery("Kapde ka color print mismatch toh nahi hai? Fabric transparency?")}>
                {t(language, "fabricQuestionCta")}
              </button>
            </div>

            <div className="samvaad-input-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(language, "samvaadPlaceholder")}
              />
              <button
                type="button"
                onClick={submitQuestion}
                disabled={submitting || !query.trim()}
                aria-label={t(language, "askAboutListing")}
              >
                <Send size={15} />
              </button>
            </div>

            {questionError && <div className="notice error samvaad-error">{t(language, "verifiedQuestionError")}</div>}

            {answer && (
              <div className="samvaad-response-card">
                <div className="response-conclusion">
                  <strong>{t(language, "evidenceAnswer")}</strong>
                  <p>{answer.answer.summary}</p>
                </div>
                <div className="response-reasons">
                  {answer.answer.reasons.map((reason, index) => (
                    <div key={index} className="reason-bullet">
                      <CheckCircle2 size={14} />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
                {answer.answer.caution && (
                  <div className="response-caution">
                    <strong>{t(language, "caution")}</strong>
                    <span>{answer.answer.caution}</span>
                  </div>
                )}
                <div className="response-actions">
                  <button
                    className="btn-action-primary"
                    onClick={() => {
                      if (answer.answer.primary_action?.variant_id) setSelectedVariantId(answer.answer.primary_action.variant_id);
                    }}
                  >
                    {answer.answer.primary_action?.label || t(language, "applySizeSelection")}
                  </button>
                  <button className="btn-action-secondary" onClick={() => onOpenAudit(answer.trace_id)}>
                    {t(language, "seeProof")}
                  </button>
                </div>
                <AgentReasoningTrace state={scoreRefreshState} reason={scoreRefreshReason} />
              </div>
            )}
          </section>

          {detail.avoidable_issue && (
            <section className="avoidable-issue-card" aria-label="Important warning">
              <AlertTriangle size={18} />
              <div>
                <span>{t(language, "caution")}</span>
                <strong>{detail.avoidable_issue.title}</strong>
                <p>{detail.avoidable_issue.action}</p>
              </div>
            </section>
          )}

          {contractError && <div className="notice error">{contractError}</div>}

          <CartConfidenceCard
            confidence={cartConfidence}
            loading={cartConfidenceLoading}
            error={cartConfidenceError}
            onOpenAudit={onOpenAudit}
            language={language}
          />

          <section className="cod-action-card">
            <div>
              <span>{t(language, "size")} {selectedVariant.size} {t(language, "selected").toLowerCase()}</span>
              <strong>Rs {selectedVariant.current_price}</strong>
              <small className={trustBlocksCheckout ? "checkout-risk-note" : "checkout-ready-note"}>
                {checkoutCopy.helper}
              </small>
            </div>

            <button
              className="btn-sticky-buy"
              type="button"
              onClick={() => void handleBuyWithContract()}
              disabled={contractLocking}
            >
              <span>{contractLocking ? t(language, "checkingProof") : checkoutCopy.cta}</span>
              <ChevronRight size={18} />
            </button>
          </section>
        </aside>
      </div>

      <section className="detail-help-strip" aria-label="Extra help">
        <div>
          <span className="eyebrow">{t(language, "nextStep")}</span>
          <strong>{t(language, "askProofOrChangeSize")}</strong>
        </div>
        <div className="detail-help-actions">
          <button
            type="button"
            className="active"
            aria-expanded="true"
            onClick={() => document.getElementById("verified-facts")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            <ShieldCheck size={15} />
            {t(language, "askFromVerifiedFacts")}
          </button>
          {shouldOfferProofRequest && (
            <button
              type="button"
              className={proofRequested ? "active" : ""}
              onClick={() => void handleAskSellerProof()}
              disabled={proofRequesting}
            >
              <BadgeCheck size={15} />
              {proofActionLabel}
            </button>
          )}
          <button
            type="button"
            className={activeSupportPanel === "proof" ? "active" : ""}
            aria-expanded={activeSupportPanel === "proof"}
            onClick={() => setActiveSupportPanel((panel) => panel === "proof" ? null : "proof")}
          >
            <HelpCircle size={15} />
            {t(language, "seeProof")}
          </button>
        </div>
      </section>

      {proofRequestError && (
        <div className="notice error detail-proof-request-error">
          {proofRequestError}
        </div>
      )}

      {activeSupportPanel === "proof" && (
        <section className="detail-support-panel proof-panel" aria-label="Proof details">
          {showDetailedTrustReceipt ? (
            <TrustReceipt
              detail={detail}
              confidence={keepConfidence}
              language={language}
              experienceMode={experienceMode}
              comparisonTraceId={proofTraceId}
              refreshState={scoreRefreshState}
              viewCount={receiptViewCount}
              onExpandContributors={() => void refreshTrustScore("proof")}
              onOpenAudit={onOpenAudit}
            />
          ) : (
            <SimpleProofSummary
              detail={detail}
              confidence={keepConfidence}
              comparisonTraceId={proofTraceId}
              language={language}
              onOpenAudit={onOpenAudit}
              onRefreshProof={() => void refreshTrustScore("proof")}
            />
          )}

          {experienceMode === "standard" && (
            <details className="detail-standard-proof-more">
              <summary>{proofMoreLabel(language)}</summary>
              <div className="detail-standard-proof-grid">
                <AgentCheckTimeline detail={detail} language={language} />
                <ExpectationContractPreview
                  detail={detail}
                  selectedVariant={selectedVariant}
                  language={language}
                />
              </div>
            </details>
          )}
        </section>
      )}

    </div>
  );
}

function KeepConfidenceCard({
  confidence,
  loading,
  error,
  refreshState,
  onApplySize,
  onOpenAudit,
  language
}: {
  confidence: KeepConfidenceResponse | null;
  loading: boolean;
  error: string | null;
  refreshState: "idle" | "refreshing" | "updated";
  onApplySize: (variantId: string) => void;
  onOpenAudit: (traceId: string) => void;
  language: LanguageCode;
}) {
  if (error) {
    return (
      <section className="keep-confidence-card low simple-decision-card">
        <div className="simple-decision-top">
          <span className="simple-decision-icon danger"><AlertTriangle size={20} /></span>
          <div>
            <span className="eyebrow">{t(language, "beforeYouDecide")}</span>
            <strong>{t(language, "checkProofFirst")}</strong>
            <p>{t(language, "confidenceCouldNotRefresh")}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!confidence) {
    return (
      <section className="keep-confidence-card loading simple-decision-card">
        <div className="simple-decision-top">
          <span className="simple-decision-icon watch"><ShieldCheck size={20} /></span>
          <div>
            <span className="eyebrow">{t(language, "beforeYouDecide")}</span>
            <strong>{loading ? t(language, "checkingEllipsis") : t(language, "waitingForProof")}</strong>
            <p>{t(language, "sizeSellerReturnsChecking")}</p>
          </div>
        </div>
      </section>
    );
  }

  const score = Math.floor(confidence.score * 100);
  const primaryAction = confidence.interventions[0];
  const canApplySize = primaryAction?.type === "change_size" && Boolean(primaryAction.target_variant_id);
  const tone = confidence.confidence_band === "high" ? "safe" : confidence.confidence_band === "medium" ? "watch" : "danger";
  const decision = simpleBuyDecision(confidence.confidence_band, language);

  return (
    <section className={`keep-confidence-card ${confidence.confidence_band} simple-decision-card ${tone} score-${refreshState}`} aria-live="polite">
      <div className="simple-decision-top">
        <span className={`simple-decision-icon ${tone}`}>
          {tone === "safe" ? <CheckCircle2 size={20} /> : tone === "watch" ? <CircleAlert size={20} /> : <AlertTriangle size={20} />}
        </span>
        <div>
          <span className="eyebrow">{t(language, "beforeYouDecide")}</span>
          <strong>{decision.title}</strong>
          <p>{decision.line}</p>
        </div>
        <div className="keep-score-meter" aria-label={`Keep confidence ${score} out of 100`}>
          <span>{score}</span>
          <small>/100</small>
        </div>
      </div>

        <div className="keep-driver-list simple-signal-list">
        {confidence.drivers.slice(0, 3).map((driver) => (
          <span key={`${driver.type}-${driver.label}`} className={driver.positive ? "positive" : driver.severity}>
            {driver.positive ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {driver.label}
          </span>
        ))}
      </div>

      {refreshState !== "idle" && (
        <div className="score-refresh-note">
          <ShieldCheck size={13} />
          <span>{refreshState === "refreshing" ? "Checking the latest facts..." : "Trust score checked again"}</span>
        </div>
      )}

      {primaryAction && (
        <div className="keep-action-row">
          <div>
            <span>{t(language, "nextStep")}</span>
            <strong>{primaryAction.label}</strong>
          </div>
          {canApplySize ? (
            <button
              type="button"
              onClick={() => onApplySize(primaryAction.target_variant_id!)}
            >
              {t(language, "apply")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAudit(confidence.trace_id)}
            >
              {t(language, "proof")}
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        className="keep-proof-link"
        onClick={() => onOpenAudit(confidence.trace_id)}
      >
        <HelpCircle size={12} />
        <span>{t(language, "seeProof")}</span>
      </button>
    </section>
  );
}

function SimpleProofSummary({
  detail,
  confidence,
  comparisonTraceId,
  language,
  onOpenAudit,
  onRefreshProof
}: {
  detail: ProductDetailResponse;
  confidence: KeepConfidenceResponse | null;
  comparisonTraceId: string;
  language: LanguageCode;
  onOpenAudit: (traceId: string) => void;
  onRefreshProof: () => void;
}) {
  const score = confidence ? Math.floor(confidence.score * 100) : null;
  const firstGap = detail.trust_state.missing_data[0] ?? null;
  const keptPercent = Math.round(detail.evidence.fit_as_expected_rate * 100);
  const proofLine = firstGap
    ? `${t(language, "missingProof")}: ${labelize(firstGap)}`
    : `${detail.evidence.delivered_orders_90d} ${t(language, "recentOrders")} checked`;

  return (
    <section className="simple-proof-summary" aria-label="Simple proof summary">
      <div>
        <span className="eyebrow">{t(language, "beforeYouScrollFurther")}</span>
        <h3>{t(language, "checkSellerProof")}</h3>
        <p>
          {score === null
            ? t(language, "checkingProof")
            : `${score}/100. ${proofLine}.`}
        </p>
      </div>
      <div className="simple-proof-facts">
        <span>
          <CheckCircle2 size={13} />
          {detail.evidence.delivered_orders_90d} orders
        </span>
        <span>
          <Ruler size={13} />
          {detail.selected_variant.size} fit {keptPercent}%
        </span>
        {firstGap && (
          <span className="watch">
            <AlertTriangle size={13} />
            {labelize(firstGap)}
          </span>
        )}
      </div>
      <div className="simple-proof-actions">
        <button type="button" onClick={onRefreshProof}>
          {t(language, "seeScoreReasons")}
        </button>
        <button type="button" onClick={() => onOpenAudit(comparisonTraceId)}>
          {t(language, "seeProof")}
        </button>
      </div>
    </section>
  );
}

function CartConfidenceCard({
  confidence,
  loading,
  error,
  onOpenAudit,
  language
}: {
  confidence: CartConfidenceResponse | null;
  loading: boolean;
  error: string | null;
  onOpenAudit: (traceId: string) => void;
  language: LanguageCode;
}) {
  if (error) {
    return (
      <section className="cart-confidence-card attention">
        <span className="eyebrow">{t(language, "beforeYouPay")}</span>
        <strong>{t(language, "payWithCaution")}</strong>
        <p>{t(language, "cartCheckCouldNotRefresh")}</p>
      </section>
    );
  }

  if (!confidence) {
    return (
      <section className="cart-confidence-card loading">
        <span className="eyebrow">{t(language, "beforeYouPay")}</span>
        <strong>{loading ? t(language, "checkingEllipsis") : t(language, "waitingForSize")}</strong>
        <p>{t(language, "paymentSizeRiskChecking")}</p>
      </section>
    );
  }

  const score = Math.floor(confidence.overall_score * 100);
  const primaryLine = confidence.line_items[0];
  const firstAlert = confidence.bracket_alerts[0];
  const checkoutTone = confidence.confidence_band === "high" ? "safe" : confidence.confidence_band === "medium" ? "watch" : "danger";
  const checkoutTitle = confidence.checkout_nudge.prepaid_recommended
    ? t(language, "payOnlineOkay")
    : confidence.confidence_band === "low"
      ? t(language, "useCodForNow")
      : t(language, "codSafer");

  return (
    <section className={`cart-confidence-card ${confidence.confidence_band} simple-cart-card ${checkoutTone}`}>
      <div className="cart-confidence-header">
        <div>
          <span className="eyebrow">{t(language, "beforeYouPay")}</span>
          <strong>{checkoutTitle}</strong>
          <p>{firstAlert ? firstAlert.message : confidence.checkout_nudge.trust_condition}</p>
        </div>
        <div className="cart-score-pill">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>

      <div className="cart-confidence-chips">
        <span>{confidence.active_profile ? `${confidence.active_profile.label} ${t(language, "size")}` : t(language, "sizeChecked")}</span>
        <span>{confidence.checkout_nudge.prepaid_recommended ? t(language, "onlineOk") : t(language, "codOk")}</span>
        <span>{firstAlert ? t(language, "bracketingRisk") : t(language, "noSizeBracketing")}</span>
      </div>

      {primaryLine && (
        <div className="cart-line-summary simple">
          <div>
            <span>{t(language, "selected")}</span>
            <strong>{primaryLine.selected_size}</strong>
          </div>
          <div>
            <span>{t(language, "yourSize")}</span>
            <strong>{primaryLine.suggested_size ?? t(language, "learning")}</strong>
          </div>
        </div>
      )}

      {firstAlert && (
        <div className="cart-bracket-alert">
          <AlertTriangle size={14} />
          <span>{firstAlert.message}</span>
        </div>
      )}

      <button type="button" className="keep-proof-link" onClick={() => onOpenAudit(confidence.trace_id)}>
        <HelpCircle size={12} />
        <span>{t(language, "checkoutProof")}</span>
      </button>
    </section>
  );
}

function checkoutActionCopy(language: LanguageCode, proofLimited: boolean) {
  if (language === "hindi") {
    return proofLimited
      ? {
          cta: "Checkout kholo",
          helper: "Proof limited hai. Checkout me COD safe option rahega."
        }
      : {
          cta: "Checkout kholo",
          helper: "Proof checked. Payment se pehle final check dikhega."
        };
  }
  if (language === "hinglish") {
    return proofLimited
      ? {
          cta: "Open checkout",
          helper: "Proof limited hai. Checkout me COD safe option rahega."
        }
      : {
          cta: "Open checkout",
          helper: "Proof checked. Payment se pehle final check dikhega."
        };
  }
  return proofLimited
    ? {
        cta: "Open checkout",
        helper: "Proof is limited. Checkout will keep COD as the safer option."
      }
    : {
        cta: "Open checkout",
        helper: "Proof checked. Final payment guidance appears in checkout."
      };
}

function proofRequestActionLabel(language: LanguageCode, requested: boolean, requesting: boolean) {
  if (requesting) {
    if (language === "hindi") return "Proof pooch rahe hain";
    if (language === "hinglish") return "Proof pooch rahe hain";
    return "Asking proof";
  }
  if (requested) {
    if (language === "hindi") return "Proof asked";
    if (language === "hinglish") return "Proof asked";
    return "Proof asked";
  }
  if (language === "hindi") return "Ask proof";
  if (language === "hinglish") return "Ask proof";
  return "Ask proof";
}

function simpleBuyDecision(band: KeepConfidenceResponse["confidence_band"], language: LanguageCode) {
  if (band === "high") {
    return {
      title: t(language, "goodToBuy"),
      line: t(language, "sizeSellerSignalsOkay")
    };
  }
  if (band === "medium") {
    return {
      title: t(language, "recommendationPaused"),
      line: t(language, "oneProofAvoidReturn")
    };
  }
  return {
    title: t(language, "doNotRush"),
    line: t(language, "askProofOrChangeSize")
  };
}

function proofMoreLabel(language: LanguageCode) {
  if (language === "hindi") return "और जानकारी";
  if (language === "hinglish") return "Aur details";
  return "More details";
}

function AgentReasoningTrace({
  state,
  reason
}: {
  state: "idle" | "refreshing" | "updated";
  reason: "question" | "proof" | null;
}) {
  const status = state === "refreshing"
    ? "Sarthi is checking the latest connected facts."
    : state === "updated"
      ? "Your action refreshed the trust check."
      : "Sarthi used the listing facts for this answer.";

  return (
    <section className={`agent-reasoning-trace ${state}`} aria-live="polite">
      <div>
        <span>Observe</span>
        <strong>Listing facts</strong>
      </div>
      <div>
        <span>Reason</span>
        <strong>{reason === "question" ? "Your question" : "Evidence link"}</strong>
      </div>
      <div>
        <span>Act</span>
        <strong>Trust advice</strong>
      </div>
      <div>
        <span>Learn</span>
        <strong>Outcome later</strong>
      </div>
      <p>{status}</p>
    </section>
  );
}

function ExpectationContractPreview({
  detail,
  selectedVariant,
  language
}: {
  detail: ProductDetailResponse;
  selectedVariant: ProductDetailResponse["selected_variant"];
  language: LanguageCode;
}) {
  const colorMatch = detail.evidence.delivered_orders_90d
    ? Math.round((1 - detail.evidence.color_mismatch_returns / detail.evidence.delivered_orders_90d) * 100)
    : null;
  const checks = [
    {
      label: t(language, "fit"),
      value: `${t(language, "size")} ${selectedVariant.size}, ${t(language, "recommendedSizeIs")} ${detail.fit.recommended_size}`,
      status: detail.fit.confidence
    },
    {
      label: t(language, "fabric"),
      value: `${detail.product.fabric} ${t(language, "sellerProof").toLowerCase()}`,
      status: detail.trust_state.missing_data.includes("fabric") ? "low" : "medium"
    },
    {
      label: t(language, "color"),
      value: colorMatch === null ? t(language, "color") : `${colorMatch}%`,
      status: detail.avoidable_issue?.reason === "color_different" ? "low" : "medium"
    },
    {
      label: t(language, "offer"),
      value: t(language, "beforeYouPay"),
      status: "medium"
    }
  ];

  return (
    <div className="expectation-preview-card">
      <div className="expectation-preview-header">
        <div>
          <span className="eyebrow">{t(language, "beforeYouPay")}</span>
          <h3>{t(language, "whatWillBeHeldAccountable")}</h3>
          <p>
            {t(language, "expectationPreviewBody")}
          </p>
        </div>
        <span>{detail.evidence.delivered_orders_90d} {t(language, "factOrders")}</span>
      </div>
      <div className="expectation-preview-grid">
        {checks.map((check) => (
          <div key={check.label}>
            <span>{check.label}</span>
            <strong>{check.value}</strong>
            <small>{labelize(check.status)} {t(language, "confidence")}</small>
          </div>
        ))}
      </div>
      <div className="expectation-privacy-line">
        <ShieldCheck size={14} />
        <span>{t(language, "sellerPrivacyLine")}</span>
      </div>
    </div>
  );
}

function TrustReceipt({
  detail,
  confidence,
  language,
  experienceMode,
  comparisonTraceId,
  refreshState,
  viewCount,
  onExpandContributors,
  onOpenAudit
}: {
  detail: ProductDetailResponse;
  confidence: KeepConfidenceResponse | null;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  comparisonTraceId: string;
  refreshState: "idle" | "refreshing" | "updated";
  viewCount: number;
  onExpandContributors: () => void;
  onOpenAudit: (traceId: string) => void;
}) {
  const [contributorsOpen, setContributorsOpen] = useState(false);
  const trust = detail.trust_state;
  const allowed = trust.can_recommend;
  const score = confidence ? Math.floor(confidence.score * 100) : null;
  const simpleLine = simpleTrustMeaning(trust.status, trust.can_recommend, language);
  const cohortAvailable = detail.evidence.delivered_orders_90d >= 8 && detail.evidence.fit_as_expected_rate > 0;

  async function shareReceipt() {
    const title = `${detail.product.title.split("-")[0].trim()}: ${score ?? "--"}/100 trust check`;
    const text = `${title}. ${simpleLine}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: window.location.href });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${window.location.href}`)}`, "_blank", "noopener,noreferrer");
    } catch {
      // Closing a native share sheet is not an application error.
    }
  }

  return (
    <div className="trust-receipt-card simple">
      <div className={`trust-simple-verdict ${allowed ? "safe" : "watch"} ${refreshState}`} aria-live="polite">
        <div className="trust-simple-score">
          <strong>{score === null ? "--" : score}</strong>
          <span>/100</span>
        </div>
        <div>
          <span className="eyebrow">{t(language, "trustReceipt")}</span>
          <h3>{allowed ? t(language, "goodToBuy") : t(language, "checkProofFirst")}</h3>
          <p>{refreshState === "refreshing" ? t(language, "checkingProof") : simpleLine}</p>
        </div>
      </div>

      {trust.missing_data.length > 0 && (
        <div className="trust-simple-warning">
          <Info size={14} />
          <span>{t(language, "missingProof")}: {labelize(trust.missing_data[0])}</span>
        </div>
      )}

      <div className="trust-simple-facts" aria-label={t(language, "agentChecks")}>
        <span>
          <ShieldCheck size={14} />
          {trust.seller_verification.verification_status === "verified" ? t(language, "sellerChecked") : t(language, "sellerPendingShort")}
        </span>
        <span>
          <Ruler size={14} />
          {cohortAvailable
            ? `${detail.selected_variant.size}: ${Math.round(detail.evidence.fit_as_expected_rate * 100)}% ${t(language, "fitWorked")}`
            : t(language, "sizeChecked")}
        </span>
        <span>
          <CheckCircle2 size={14} />
          {detail.evidence.delivered_orders_90d} {t(language, "recentOrders")}
        </span>
      </div>

      <div className="trust-receipt-actions">
        <button
          type="button"
          className="trust-contributors-toggle"
          aria-expanded={contributorsOpen}
          onClick={() => {
            const nextOpen = !contributorsOpen;
            setContributorsOpen(nextOpen);
            if (nextOpen) onExpandContributors();
          }}
        >
          {contributorsOpen ? t(language, "hideScoreReasons") : t(language, "seeScoreReasons")}
        </button>
        {experienceMode === "standard" && (
          <button type="button" className="trust-share-button" onClick={() => void shareReceipt()}>
            <Share2 size={14} />
            {t(language, "shareTrustCheck")}
          </button>
        )}
        <button
          className="btn-action-secondary trust-proof-button"
          onClick={() => onOpenAudit(comparisonTraceId)}
        >
          {t(language, "seeProof")}
        </button>
      </div>

      {contributorsOpen && confidence && (
        <div className="trust-contributor-list">
          {confidence.drivers.slice(0, 4).map((driver) => (
            <div key={`${driver.type}-${driver.label}`} className={driver.positive ? "positive" : driver.severity}>
              {driver.positive ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{driver.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCheckTimeline({ detail, language }: { detail: ProductDetailResponse; language: LanguageCode }) {
  const trust = detail.trust_state;
  const sourceHealthy = !trust.data_freshness.blocking;
  const sellerVerified = trust.seller_verification.verification_status === "verified";
  const enoughEvidence = ["medium", "strong"].includes(detail.evidence.evidence_strength);
  const fitConfident = detail.fit.confidence !== "low";

  const checks = [
    {
      title: t(language, "sellerVerification"),
      passed: sellerVerified,
      body: sellerVerified
        ? `${detail.product.seller_name}: ${t(language, "verified")}`
        : `${t(language, "seller")}: ${labelize(trust.seller_verification.verification_status)}`
    },
    {
      title: t(language, "returnEvidence"),
      passed: enoughEvidence,
      body: `${detail.evidence.delivered_orders_90d} ${t(language, "recentDeliveredOrders")} | ${detail.evidence.returns_90d} ${t(language, "returnsChecked")}`
    },
    {
      title: t(language, "sizeFit"),
      passed: fitConfident,
      body: `${t(language, "recommendedSizeIs")} ${detail.fit.recommended_size} | ${detail.fit.confidence} ${t(language, "confidence")}`
    },
    {
      title: t(language, "sourceFreshness"),
      passed: sourceHealthy,
      body: `${t(language, "sources")}: ${labelize(trust.data_freshness.overall_status)}`
    },
    {
      title: t(language, "privacyBoundary"),
      passed: true,
      body: detail.privacy.fit_memory_enabled
        ? t(language, "privacyChecked")
        : `${t(language, "memory")}: ${t(language, "offStatus")}`
    }
  ];

  return (
    <div className="agent-check-card">
      <div className="agent-check-header">
        <div>
          <span className="eyebrow sheet-eyebrow-primary">{t(language, "agentChecks")}</span>
          <h3>{t(language, "checksCompleted")}</h3>
        </div>
        <ShieldCheck size={18} />
      </div>
      <div className="agent-check-list">
        {checks.map((check) => (
          <div key={check.title} className={`agent-check-row ${check.passed ? "passed" : "attention"}`}>
            <span className="agent-check-icon">
              {check.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            </span>
            <div>
              <strong>{check.title}</strong>
              <span>{check.body}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function fallbackProductImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}
