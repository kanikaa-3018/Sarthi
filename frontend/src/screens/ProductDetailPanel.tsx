import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  HelpCircle,
  Info,
  Layers,
  MessageCircle,
  RefreshCcw,
  Ruler,
  Send,
  Share2,
  ShieldCheck,
  Truck,
  X
} from "lucide-react";
import {
  askSarthi,
  createExpectationContract,
  createWishlistIntent,
  getCartConfidence,
  getKeepConfidence,
  getProductDetail,
  requestSellerProof
} from "../api/client";
import { simpleTrustMeaning, t, type LanguageCode } from "../i18n";
import type {
  AgentResponse,
  CartConfidenceResponse,
  CompareResponse,
  ExpectationContract,
  FitConfidenceLayer,
  KeepConfidenceResponse,
  Product,
  ProductDetailResponse,
  SkuTruthCard,
  Variant,
  EvidenceAnswerAction
} from "../types/api";
import { fallbackProductImage, productImageLabels, productImageSources } from "../utils/productMedia";
import { KnowledgeGraphExplorer } from "./KnowledgeGraphExplorer";

// Screen 3: Responsive Split 2-Column Product Detail Panel
export function ProductDetailPanel({
  buyerId,
  productId,
  initialVariantId,
  clusterId,
  productCatalog,
  onBack,
  onOpenAudit,
  onLoadSellerComparison,
  onOpenSellerComparison,
  onVariantChange,
  onOpenCheckout,
  language,
  experienceMode,
  comparisonTraceId,
  knowledgeGraph,
  graphLoading,
  graphError,
  graphAnswer,
  graphQuery,
  graphAsking,
  onQueryChange,
  onAskGraph,
  onRetryGraph
}: {
  buyerId: string;
  productId: string;
  initialVariantId: string | null;
  clusterId: string;
  productCatalog: Product[];
  onBack: () => void;
  onOpenAudit: (traceId: string) => void;
  onLoadSellerComparison: (product: Product, variantId?: string | null) => Promise<CompareResponse>;
  onOpenSellerComparison: (product: Product, variantId?: string | null) => Promise<void> | void;
  onVariantChange: (variantId: string) => void;
  onOpenCheckout: (variantId: string, contract: ExpectationContract, item: { product: Product; variant: Variant & { quantity?: number } }) => void;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  comparisonTraceId?: string;
  knowledgeGraph: any;
  graphLoading: boolean;
  graphError: string | null;
  graphAnswer: any;
  graphQuery: string;
  graphAsking: boolean;
  onQueryChange: (value: string) => void;
  onAskGraph: (query: string) => void;
  onRetryGraph: () => void;
}) {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId ?? "");
  const [query, setQuery] = useState("Mera usual size L hai, chest tight toh nahi hoga?");
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [graphDrawerOpen, setGraphDrawerOpen] = useState(false);
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
  const [sellerComparison, setSellerComparison] = useState<CompareResponse | null>(null);
  const [sellerComparisonLoading, setSellerComparisonLoading] = useState(false);
  const [sellerComparisonError, setSellerComparisonError] = useState<string | null>(null);
  const [scoreRefreshState, setScoreRefreshState] = useState<"idle" | "refreshing" | "updated">("idle");
  const [scoreRefreshReason, setScoreRefreshReason] = useState<"question" | "proof" | null>(null);
  const [receiptViewCount, setReceiptViewCount] = useState(1);
  const [activeSupportPanel, setActiveSupportPanel] = useState<"ask" | "proof" | null>(null);
  const [proofSpotlightSource, setProofSpotlightSource] = useState<"agent" | "manual" | null>(null);
  const [skuProofModalOpen, setSkuProofModalOpen] = useState(false);
  const [proofHighlight, setProofHighlight] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [showRequestSuccessModal, setShowRequestSuccessModal] = useState(false);
  const scoreRefreshTimerRef = useRef<number | null>(null);
  const proofHighlightTimerRef = useRef<number | null>(null);
  const proofPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setContractError(null);
    setKeepConfidence(null);
    setCartConfidence(null);
    getProductDetail(buyerId, productId, initialVariantId)
      .then((payload) => {
        setDetail(payload);
        const initialVariant = initialVariantId
          ? payload.variants.find((variant) => variant.variant_id === initialVariantId)
          : null;
        const nextVariantId = initialVariant?.variant_id ?? payload.selected_variant.variant_id;
        setSelectedVariantId(nextVariantId);
        if (nextVariantId && nextVariantId !== initialVariantId) {
          onVariantChange(nextVariantId);
        }
        setKeepConfidence(payload.keep_confidence.variant_id === nextVariantId ? payload.keep_confidence : null);
      });
  }, [buyerId, productId, initialVariantId, onVariantChange]);

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
    if (!detail || !selectedVariantId) return;
    let cancelled = false;
    setSellerComparison(null);
    setSellerComparisonLoading(true);
    setSellerComparisonError(null);
    onLoadSellerComparison(detail.product, selectedVariantId)
      .then((payload) => {
        if (!cancelled) setSellerComparison(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setSellerComparisonError(err.message);
      })
      .finally(() => {
        if (!cancelled) setSellerComparisonLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.product.product_id, onLoadSellerComparison, selectedVariantId]);

  useEffect(() => {
    const storageKey = `sarthi.trust-receipt.${buyerId}.${productId}`;
    const nextCount = Number(window.localStorage.getItem(storageKey) ?? "0") + 1;
    window.localStorage.setItem(storageKey, String(nextCount));
    setReceiptViewCount(nextCount);
    return () => {
      if (scoreRefreshTimerRef.current !== null) window.clearTimeout(scoreRefreshTimerRef.current);
      if (proofHighlightTimerRef.current !== null) window.clearTimeout(proofHighlightTimerRef.current);
    };
  }, [buyerId, productId]);

  useEffect(() => {
    setActiveSupportPanel(null);
    setProofSpotlightSource(null);
    setSkuProofModalOpen(false);
    setProofHighlight(false);
  }, [productId]);

  useEffect(() => {
    setProofRequested(false);
    setProofRequestError(null);
  }, [productId, selectedVariantId]);

  useEffect(() => {
    if (!skuProofModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSkuProofModalOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [skuProofModalOpen]);

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
  const selectedKeepConfidence = keepConfidence?.variant_id === selectedVariant.variant_id ? keepConfidence : null;
  const selectedCartConfidence = cartConfidence?.line_items.some((line) => line.variant.variant_id === selectedVariant.variant_id)
    ? cartConfidence
    : null;
  const selectedRecommendedSize = selectedKeepConfidence?.recommended_size ?? detail.fit.recommended_size;
  const proofTraceId = comparisonTraceId ?? keepConfidence?.trace_id ?? detail.keep_confidence.trace_id;
  const titleParts = splitProductTitle(detail.product);
  const displayTitle = titleParts.title;
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
  const answerProofAction = answer?.answer.primary_action?.type === "ask_proof" ? answer.answer.primary_action : null;

  function handleSelectVariant(nextVariantId: string) {
    if (nextVariantId === selectedVariantId) return;
    setSelectedVariantId(nextVariantId);
    onVariantChange(nextVariantId);
    if (keepConfidence?.variant_id !== nextVariantId) {
      setKeepConfidence(null);
    }
    if (!cartConfidence?.line_items.some((line) => line.variant.variant_id === nextVariantId)) {
      setCartConfidence(null);
    }
  }

  function focusProofPanel(source: "agent" | "manual") {
    setActiveSupportPanel("proof");
    setProofSpotlightSource(source);
    setProofHighlight(true);
    if (proofHighlightTimerRef.current !== null) window.clearTimeout(proofHighlightTimerRef.current);
    proofHighlightTimerRef.current = window.setTimeout(() => setProofHighlight(false), 2800);
    window.setTimeout(() => {
      proofPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function openProofFromGraph(traceId: string) {
    setGraphDrawerOpen(false);
    window.setTimeout(() => onOpenAudit(traceId), 0);
  }

  async function requestProofFromGraph(action: EvidenceAnswerAction | null | undefined = graphAnswer?.answer?.next_action) {
    if (!detail || proofRequesting) return;
    if (action?.type !== "ask_proof") {
      setGraphDrawerOpen(false);
      window.setTimeout(() => {
        void handleAskSellerProof();
      }, 0);
      return;
    }
    setProofRequesting(true);
    setProofRequestError(null);
    try {
      await requestSellerProof(buyerId, {
        product_id: action.product_id ?? detail.product.product_id,
        variant_id: action.variant_id ?? selectedVariantId,
        attribute: normalizeProofActionAttribute(action.attribute),
        question: graphAnswer?.answer.query ?? graphQuery
      });
      setProofRequested(true);
      setShowRequestSuccessModal(true);
      setGraphDrawerOpen(false);
      focusProofPanel("agent");
      await refreshTrustScore("proof", action.variant_id ?? selectedVariantId);
    } catch (err) {
      setProofRequestError(err instanceof Error ? err.message : "Could not ask seller proof");
    } finally {
      setProofRequesting(false);
    }
  }

  async function refreshTrustScore(reason: "question" | "proof", variantIdOverride?: string) {
    const targetVariantId = variantIdOverride ?? selectedVariantId;
    if (!targetVariantId) return;
    setScoreRefreshReason(reason);
    setScoreRefreshState("refreshing");
    setKeepConfidenceError(null);
    try {
      const refreshed = await getKeepConfidence(buyerId, productId, targetVariantId);
      setKeepConfidence(refreshed);
      setScoreRefreshState("updated");
      if (scoreRefreshTimerRef.current !== null) window.clearTimeout(scoreRefreshTimerRef.current);
      scoreRefreshTimerRef.current = window.setTimeout(() => setScoreRefreshState("idle"), 2400);
    } catch (err) {
      setKeepConfidenceError(err instanceof Error ? err.message : "Could not refresh trust score");
      setScoreRefreshState("idle");
    }
  }

  async function handleAgentPrimaryAction() {
    const action = answer?.answer.primary_action;
    const targetVariantId = action?.variant_id ?? selectedVariantId;
    if (action?.variant_id && action.variant_id !== selectedVariantId) {
      handleSelectVariant(action.variant_id);
    }
    if (action?.type === "ask_proof") {
      if (action.request_status === "open" || action.request_status === "submitted") {
        setProofRequested(true);
        focusProofPanel("agent");
        setSkuProofModalOpen(true);
        void refreshTrustScore("proof", targetVariantId);
        return;
      }
      if (!detail || proofRequesting || action.disabled) return;
      setProofRequesting(true);
      setProofRequestError(null);
      try {
        await requestSellerProof(buyerId, {
          product_id: action.product_id ?? detail.product.product_id,
          variant_id: action.variant_id ?? selectedVariantId,
          attribute: normalizeProofActionAttribute(action.attribute),
          question: answer?.answer.query ?? query
        });
        setProofRequested(true);
        setShowRequestSuccessModal(true);
        focusProofPanel("agent");
        await refreshTrustScore("proof", targetVariantId);
      } catch (err) {
        setProofRequestError(err instanceof Error ? err.message : "Could not ask seller proof");
      } finally {
        setProofRequesting(false);
      }
      return;
    }
    setActiveSupportPanel("proof");
    setProofSpotlightSource("agent");
    setSkuProofModalOpen(true);
    void refreshTrustScore("proof", targetVariantId);
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
        variant: { ...selectedVariant, quantity }
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
      setShowRequestSuccessModal(true);
      focusProofPanel("manual");
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
            <ProductMediaGallery product={detail.product} />
            <div className="detail-product-summary">
              <span>{t(language, "soldBy")} {detail.product.seller_name}</span>
              <h1>{displayTitle}</h1>
              {titleParts.context && <small className="detail-title-context">{titleParts.context}</small>}
              <div className="detail-price-row">
                <strong>Rs {selectedVariant.current_price}</strong>
                <span>Rs {strikePrice}</span>
                <small>{selectedVariant.stock} {t(language, "inStock")}</small>
              </div>
              <div className="detail-title-facts" aria-label="Product facts">
                <span>{detail.product.fabric}</span>
                <span>{detail.product.delivery_text}</span>
                <span>{detail.product.commerce_badge}</span>
              </div>
              <div className="detail-product-actions" aria-label="Product help actions">
                <button
                  type="button"
                  onClick={() => void onOpenSellerComparison(detail.product, selectedVariantId)}
                >
                  <Layers size={15} />
                  Compare options
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById("verified-facts")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                >
                  <ShieldCheck size={15} />
                  {t(language, "askFromVerifiedFacts")}
                </button>
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

          <SellerCompareLauncher
            comparison={sellerComparison}
            productCatalog={productCatalog}
            currentProduct={detail.product}
            loading={sellerComparisonLoading}
            error={sellerComparisonError}
            onOpenCompare={() => void onOpenSellerComparison(detail.product, selectedVariantId)}
            onOpenProofMap={() => setGraphDrawerOpen(true)}
          />

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
                  <span>{t(language, "evidenceAnswer")}</span>
                  <strong>{answer.answer.title}</strong>
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
                <AgentProofPlan answer={answer} />
                {answer.answer.caution && (
                  <div className="response-caution">
                    <strong>{t(language, "caution")}</strong>
                    <span>{answer.answer.caution}</span>
                  </div>
                )}

                {(answerProofAction || shouldOfferProofRequest) && (
                  <div className="samvaad-missing-proof-cta-box">
                    <div className="cta-info">
                      <AlertTriangle size={15} style={{ color: "#D97706" }} />
                      <span>{answerProofAction ? `${proofRequestSuccessLabel(answerProofAction.attribute)} is needed before this claim becomes stronger.` : "Seller proof can make this trust check stronger."}</span>
                    </div>
                    <button
                      type="button"
                      className={`btn-request-proof-inline ${proofRequested ? "requested" : ""}`}
                      onClick={() => void (answerProofAction ? handleAgentPrimaryAction() : handleAskSellerProof())}
                      disabled={proofRequesting || Boolean(answerProofAction?.disabled) || answerProofAction?.request_status === "open" || answerProofAction?.request_status === "submitted"}
                    >
                      {proofRequesting
                        ? "Sending..."
                        : proofRequested || answerProofAction?.request_status === "open" || answerProofAction?.request_status === "submitted"
                          ? "Requested"
                          : answerProofAction?.label ?? "Request Seller Proof"}
                    </button>
                  </div>
                )}
                <div className="response-actions">
                  <button
                    className="btn-action-primary"
                    onClick={() => void handleAgentPrimaryAction()}
                    disabled={proofRequesting || Boolean(answer.answer.primary_action?.disabled)}
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
        </div>

        <aside className="detail-decision-container" aria-label="Listing decision">

          <KeepConfidenceCard
            confidence={selectedKeepConfidence}
            loading={keepConfidenceLoading}
            error={keepConfidenceError}
            refreshState={scoreRefreshState}
            onApplySize={handleSelectVariant}
            onOpenAudit={onOpenAudit}
            language={language}
          />

          <section className="detail-buy-block">
            <div className="size-qty-row">
              <div className="size-selection-area">
                <span className="eyebrow">{t(language, "selectSize")}</span>
                <div className="detail-size-options">
                  {detail.variants.map((v) => (
                    <button
                      key={v.variant_id}
                      type="button"
                      onClick={() => handleSelectVariant(v.variant_id)}
                      className={v.variant_id === selectedVariantId ? "active" : ""}
                    >
                      {v.size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="product-qty-stepper">
                <span className="qty-label">Qty</span>
                <div className="stepper-controls">
                  <button 
                    type="button" 
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <span className="qty-value">{quantity}</span>
                  <button 
                    type="button" 
                    onClick={() => setQuantity(q => Math.min(10, q + 1))}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className={`size-recommendation-badge ${selectedVariant.size === selectedRecommendedSize ? "matches" : "differs"}`}>
              {selectedVariant.size === selectedRecommendedSize ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              <span>{sizeSelectionHint(selectedVariant.size, selectedRecommendedSize, language)}</span>
            </div>

            {detail.avoidable_issue && (
              <div className="avoidable-issue-inline">
                <AlertTriangle size={15} />
                <span><strong>{detail.avoidable_issue.title}:</strong> {detail.avoidable_issue.action}</span>
              </div>
            )}

            {contractError && <div className="notice error">{contractError}</div>}

            <div className="buy-price-cta-row">
              <div className="price-display">
                <span className="price-main">Rs {selectedVariant.current_price * quantity}</span>
                <span className={`price-helper ${trustBlocksCheckout ? "checkout-risk-note" : "checkout-ready-note"}`}>
                  {checkoutCopy.helper}
                </span>
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
            </div>
          </section>
        </aside>
      </div>

      <section className="detail-help-strip" aria-label="Extra help">
        <div>
          <span className="eyebrow">{t(language, "nextStep")}</span>
          <strong>{t(language, "askProofOrChangeSize")}</strong>
        </div>
        <div className="detail-help-actions">
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
            onClick={() => {
              if (activeSupportPanel === "proof") {
                setActiveSupportPanel(null);
                return;
              }
              focusProofPanel("manual");
            }}
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
        <section
          ref={proofPanelRef}
          className={`detail-support-panel proof-panel${proofHighlight ? " proof-focus" : ""}`}
          aria-label="Proof details"
          tabIndex={-1}
        >
          {showDetailedTrustReceipt ? (
            <TrustReceipt
              detail={detail}
              confidence={selectedKeepConfidence}
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
              confidence={selectedKeepConfidence}
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

      {skuProofModalOpen && answer && (
        <div className="sku-proof-dialog-backdrop" role="presentation">
          <section className="sku-proof-dialog" role="dialog" aria-modal="true" aria-labelledby="sku-proof-dialog-title">
            <button
              type="button"
              className="sku-proof-dialog-close"
              onClick={() => setSkuProofModalOpen(false)}
              aria-label="Close SKU proof"
            >
              <X size={18} />
            </button>
            <SkuProofSpotlight
              answer={answer}
              detail={detail}
              selectedVariant={selectedVariant}
              confidence={selectedKeepConfidence}
              source={proofSpotlightSource}
              onRefresh={() => void refreshTrustScore("proof")}
              onOpenAudit={onOpenAudit}
            />
          </section>
        </div>
      )}

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
                <span className="eyebrow">Evidence map</span>
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
              onRequestProof={requestProofFromGraph}
              proofRequestState={proofRequested ? "sent" : proofRequesting ? "loading" : "idle"}
              onRetry={onRetryGraph}
            />
          </section>
        </div>
      )}

      {showRequestSuccessModal && (
        <div className="bottom-sheet-overlay request-success-overlay" onClick={() => setShowRequestSuccessModal(false)}>
          <div className="request-success-alert" onClick={(e) => e.stopPropagation()}>
            <div className="alert-icon-check"><CheckCircle2 size={22} /></div>
            <h3>Request Submitted to Seller</h3>
            <p>We counted your {proofRequestSuccessLabel(answer?.answer.primary_action?.attribute ?? graphAnswer?.answer?.next_action?.attribute)} request as aggregate demand for this product.</p>
            <p className="alert-sub">Sarthi will notify you as soon as verified proof is updated!</p>
            <button type="button" className="btn-ok" onClick={() => setShowRequestSuccessModal(false)}>Okay, thanks</button>
          </div>
        </div>
      )}

    </div>
  );
}

function ProductMediaGallery({ product }: { product: Product }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const images = productImageSources(product);
  const safeIndex = Math.min(activeImageIndex, Math.max(0, images.length - 1));
  const activeImage = images[safeIndex] ?? fallbackProductImage(product.color_family);
  const media = product.media_evidence;
  const labels = productImageLabels(product, images);
  const activeLabel = labels[safeIndex] ?? `View ${safeIndex + 1}`;
  const qualityScore = media?.quality_score ?? media?.clarity_score ?? null;
  const missingAngle = media?.missing_angles?.[0] ?? media?.warnings?.[0] ?? null;
  const importantAssets = (media?.required_assets ?? [])
    .filter((asset) => asset.required)
    .slice(0, 3);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.product_id]);

  function shiftImage(delta: number) {
    setActiveImageIndex((current) => {
      if (images.length <= 1) return 0;
      return (current + delta + images.length) % images.length;
    });
  }

  return (
    <div className="detail-product-gallery" aria-label={`Product photos for ${product.title}`}>
      <div className="detail-gallery-thumbs" aria-label="Photo thumbnails">
        {images.map((image, index) => (
          <button
            key={`${image}-${index}`}
            type="button"
            className={index === safeIndex ? "active" : ""}
            aria-label={`Show ${labels[index] ?? `photo ${index + 1}`}`}
            aria-pressed={index === safeIndex}
            onClick={() => setActiveImageIndex(index)}
          >
            <img
              src={image}
              alt=""
              onError={(event) => { event.currentTarget.src = fallbackProductImage(product.color_family); }}
            />
          </button>
        ))}
      </div>

      <figure className="detail-image-frame">
        <img
          src={activeImage}
          alt={`${product.title} ${activeLabel}`}
          onError={(event) => { event.currentTarget.src = fallbackProductImage(product.color_family); }}
        />
        <figcaption className="detail-media-badge">{activeLabel}</figcaption>
        {images.length > 1 && (
          <div className="detail-gallery-controls" aria-label="Change product photo">
            <button type="button" onClick={() => shiftImage(-1)} aria-label="Previous product photo">
              <ChevronLeft size={16} />
            </button>
            <span>{safeIndex + 1}/{images.length}</span>
            <button type="button" onClick={() => shiftImage(1)} aria-label="Next product photo">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </figure>

      <div className="detail-media-proof-row" aria-label="Media quality checks">
        <span>
          <BadgeCheck size={14} />
          {images.length} views checked
        </span>
        <span>
          <ShieldCheck size={14} />
          {qualityScore === null ? "Media checked" : `${qualityScore}/100 media`}
        </span>
        <span className={missingAngle ? "watch" : "safe"}>
          {missingAngle ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {missingAngle ? `${missingAngle}` : "Key angles covered"}
        </span>
      </div>

      {importantAssets.length > 0 && (
        <div className="detail-media-asset-strip" aria-label="Required product media">
          {importantAssets.map((asset) => (
            <span key={asset.key} className={mediaAssetReady(asset.status) ? "ready" : "missing"}>
              {mediaAssetReady(asset.status) ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {asset.label}
            </span>
          ))}
        </div>
      )}

      {media?.buyer_copy && <p className="detail-media-note">{media.buyer_copy}</p>}
    </div>
  );
}

function SellerCompareLauncher({
  comparison,
  productCatalog,
  currentProduct,
  loading,
  error,
  onOpenCompare,
  onOpenProofMap
}: {
  comparison: CompareResponse | null;
  productCatalog: Product[];
  currentProduct: Product;
  loading: boolean;
  error: string | null;
  onOpenCompare: () => void;
  onOpenProofMap: () => void;
}) {
  const rankedRows = comparison
    ? comparison.ranking.candidates.map((candidate) => ({
        key: candidate.variant_id,
        product: productForCandidate(candidate, productCatalog, currentProduct),
        score: trustScorePercent(candidate),
        winner: candidate.variant_id === comparison.ranking.winner
      }))
    : [];
  const fallbackRows = productCatalog
    .filter((product) => product.cluster_id === currentProduct.cluster_id)
    .map((product) => ({
      key: product.product_id,
      product,
      score: product.buyer_trust?.confidence ?? null,
      winner: false
    }));
  const candidates = uniqueSellerRows([...rankedRows, ...fallbackRows]).slice(0, 3);
  const sellerCount = comparison?.similarity?.distinct_seller_count
    ?? uniqueSellerRows(fallbackRows).length
    ?? Math.max(1, candidates.length);
  const best = candidates.find((candidate) => candidate.winner)
    ?? candidates.filter((candidate) => typeof candidate.score === "number").sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
    ?? candidates[0]
    ?? null;
  const topScore = best?.score ?? null;

  return (
    <section className="detail-compare-launcher" aria-label="Seller comparison launcher">
      <span className="compare-launch-icon" aria-hidden="true">
        <Layers size={18} />
      </span>

      <div className="compare-launch-copy">
        <span className="eyebrow">Same item, safer choice</span>
        <h2>Compare options</h2>
        <p>
          Sarthi ranks this item across mapped listings using returns, proof, reviews, fit and delivery.
        </p>
      </div>

      <div className="compare-launch-meter" aria-label="Comparison readiness">
        <div>
          <strong>{loading ? "--" : sellerCount}</strong>
          <span>options</span>
        </div>
        <div>
          <strong>{loading ? "--" : topScore ?? "--"}</strong>
          <span>top trust</span>
        </div>
      </div>

      {error && (
        <div className="compare-launch-note">
          <AlertTriangle size={14} />
          <span>Comparison is slow. Proof map is still available.</span>
        </div>
      )}

      <div className="compare-launch-actions">
        <button
          type="button"
          className="btn-action-primary"
          style={{ background: "#0f172a", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}
          onClick={onOpenCompare}
        >
          <Layers size={15} />
          Compare {sellerCount} options
        </button>
        <button
          type="button"
          className="btn-action-secondary"
          style={{ background: "#f1f5f9", color: "#0f172a", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: "8px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}
          onClick={onOpenProofMap}
        >
          <ShieldCheck size={15} />
          Proof Map
        </button>
      </div>
    </section>
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
  const [showDrivers, setShowDrivers] = useState(false);

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
      <div className="simple-decision-top" onClick={() => setShowDrivers(!showDrivers)} style={{ cursor: "pointer" }}>
        <span className={`simple-decision-icon ${tone}`}>
          {tone === "safe" ? <CheckCircle2 size={20} /> : tone === "watch" ? <CircleAlert size={20} /> : <AlertTriangle size={20} />}
        </span>
        <div>
          <span className="eyebrow">{t(language, "beforeYouDecide")}</span>
          <strong>{decision.title}</strong>
          <p>{decision.line}</p>
        </div>
        <div className={`keep-score-meter ${tone} interactive-score-meter`} title="Click to view trust breakdown">
          <span>{score}</span>
          <small>/100</small>
        </div>
      </div>

      <div className="keep-driver-list simple-signal-list">
        {confidence.drivers.slice(0, showDrivers ? 6 : 2).map((driver) => (
          <span key={`${driver.type}-${driver.label}`} className={driver.positive ? "positive" : driver.severity}>
            {driver.positive ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {driver.label}
          </span>
        ))}
      </div>

      <div className="keep-score-interactive-bar">
        <button 
          type="button" 
          className="btn-toggle-drivers"
          onClick={() => setShowDrivers(!showDrivers)}
        >
          {showDrivers ? "Hide evidence signals ▲" : `View ${confidence.drivers.length} trust signals ▼`}
        </button>
        <button
          type="button"
          className="btn-open-audit-link"
          onClick={() => onOpenAudit(confidence.trace_id)}
        >
          <ShieldCheck size={13} />
          {t(language, "seeProof")}
        </button>
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
  const proofTone = firstGap || (score !== null && score < 70) ? "watch" : "safe";
  const proofTitle = firstGap ? "Proof still missing" : t(language, "checkSellerProof");
  const proofBody = score === null
    ? t(language, "checkingProof")
    : firstGap
      ? `${score}/100 because ${labelize(firstGap).toLowerCase()} is not verified yet.`
      : `${score}/100. Seller proof and recent outcomes are connected.`;

  return (
    <section className={`simple-proof-summary ${proofTone}`} aria-label="Simple proof summary">
      <div className="simple-proof-copy">
        <span className="eyebrow">Proof checkpoint</span>
        <h3>{proofTitle}</h3>
        <p>{proofBody}</p>
      </div>
      <div className="simple-proof-score" aria-label={score === null ? "Proof score loading" : `Proof score ${score} out of 100`}>
        <strong>{score ?? "--"}</strong>
        <span>/100</span>
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
          Score reasons
        </button>
        <button type="button" onClick={() => onOpenAudit(comparisonTraceId)}>
          Proof trail
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

function sizeSelectionHint(selectedSize: string, recommendedSize: string | null | undefined, language: LanguageCode) {
  const selected = selectedSize || "--";
  const recommended = recommendedSize || "--";
  if (!recommendedSize || selected === "ONE_SIZE") {
    if (language === "hindi") return "Is item me size selection ki zarurat nahi hai.";
    if (language === "hinglish") return "Is item me size selection needed nahi hai.";
    return "This item does not need a size choice.";
  }
  if (selected === recommended) {
    if (language === "hindi" || language === "hinglish") {
      return <>Selected size <strong>{selected}</strong> recommended size se match karta hai.</>;
    }
    return <>Selected size <strong>{selected}</strong> matches the recommended size.</>;
  }
  if (language === "hindi" || language === "hinglish") {
    return <>Selected size <strong>{selected}</strong> hai. Safer size <strong>{recommended}</strong> dikh raha hai.</>;
  }
  return <>Selected size <strong>{selected}</strong> differs. Safer size looks like <strong>{recommended}</strong>.</>;
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

function normalizeProofActionAttribute(attribute: EvidenceAnswerAction["attribute"]) {
  const value = String(attribute ?? "fabric").trim().toLowerCase();
  if (value === "measurement") return "size";
  return value || "fabric";
}

function proofRequestSuccessLabel(attribute: EvidenceAnswerAction["attribute"]) {
  const value = normalizeProofActionAttribute(attribute).replace(/_/g, " ");
  if (value === "size") return "size/measurement proof";
  if (value === "transparency") return "transparency proof";
  if (value === "offer") return "price proof";
  return `${value} proof`;
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

function SkuProofSpotlight({
  answer,
  detail,
  selectedVariant,
  confidence,
  source,
  onRefresh,
  onOpenAudit
}: {
  answer: AgentResponse;
  detail: ProductDetailResponse;
  selectedVariant: Variant;
  confidence: KeepConfidenceResponse | null;
  source: "agent" | "manual" | null;
  onRefresh: () => void;
  onOpenAudit: (traceId: string) => void;
}) {
  const attribute = labelize(answer.intent[0] ?? "proof");
  const score = confidence ? Math.round(confidence.score * 100) : null;
  const factLabel = answer.fact_ids.length ? `${answer.fact_ids.length} facts` : "Trace ready";
  const firstGap = detail.trust_state.missing_data[0];
  const gapLabel = firstGap ? `${labelize(firstGap)} gap` : "No major gap";
  const title = source === "agent" ? "Proof matched to your question" : "SKU proof review";
  const trustLabel = score === null ? "Checking" : `${score}/100`;

  return (
    <div className="sku-proof-spotlight" aria-live="polite">
      <div className="sku-proof-spotlight-head">
        <span><ShieldCheck size={18} /></span>
        <div>
          <strong id="sku-proof-dialog-title">{title}</strong>
          <p>{detail.product.seller_name} proof is being checked against size {selectedVariant.size}, buyer outcomes, and missing seller evidence.</p>
        </div>
      </div>

      <div className="sku-proof-decision-row">
        <div>
          <span>SKU</span>
          <strong>{selectedVariant.size}</strong>
          <small>Selected variant</small>
        </div>
        <div>
          <span>Trust</span>
          <strong>{trustLabel}</strong>
          <small>After proof check</small>
        </div>
        <div>
          <span>Evidence</span>
          <strong>{factLabel}</strong>
          <small>Grounded trail</small>
        </div>
      </div>

      <div className="sku-proof-mini-flow" aria-label="Proof check path">
        <span><b>1</b> Question: {attribute}</span>
        <span><b>2</b> Seller and outcome facts matched</span>
        <span><b>3</b> Buyer check: {gapLabel}</span>
      </div>

      <div className="sku-proof-actions">
        <button type="button" onClick={onRefresh}>
          <RefreshCcw size={14} />
          Refresh proof check
        </button>
        <button type="button" onClick={() => onOpenAudit(answer.trace_id)}>
          <HelpCircle size={14} />
          Open source trace
        </button>
      </div>
    </div>
  );
}

function AgentProofPlan({ answer }: { answer: AgentResponse }) {
  const attribute = labelize(answer.intent[0] ?? "proof");
  const factCount = answer.fact_ids.length;
  const provider = answer.agent?.provider ? labelize(answer.agent.provider) : "deterministic";
  const action = answer.answer.primary_action?.label ?? "See proof";

  return (
    <div className="response-proof-plan" aria-label="Sarthi agent proof plan">
      <div>
        <span>Checked</span>
        <strong>{attribute} facts</strong>
      </div>
      <div>
        <span>Grounded by</span>
        <strong>{factCount ? `${factCount} fact IDs` : provider}</strong>
      </div>
      <div>
        <span>Next action</span>
        <strong>{action}</strong>
      </div>
    </div>
  );
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

function splitProductTitle(productOrTitle: Product | string) {
  const product = typeof productOrTitle === "string" ? null : productOrTitle;
  const rawTitle = typeof productOrTitle === "string" ? productOrTitle : productOrTitle.title;
  const cleaned = normalizeMarketplaceTitle(product, rawTitle.split("-")[0].trim());
  const contexts = ["Everyday Wear", "Office Ready", "Festival Edit", "Comfort Fit"];
  const context = contexts.find((suffix) => cleaned.toLowerCase().endsWith(suffix.toLowerCase())) ?? null;
  if (!context) return { title: cleaned, context: null };
  return {
    title: cleaned.slice(0, -context.length).trim(),
    context
  };
}

function normalizeMarketplaceTitle(product: Product | null, title: string) {
  if (!product) return title;
  if (product.category === "women_kurtis" && /\bdress\b/i.test(title)) {
    return title.replace(/\bdress\b/gi, "Kurti");
  }
  if (product.garment_type && !new RegExp(`\\b${escapeRegExp(product.garment_type)}\\b`, "i").test(title)) {
    return title;
  }
  return title;
}

function productForCandidate(
  candidate: CompareResponse["ranking"]["candidates"][number],
  catalog: Product[],
  currentProduct: Product
) {
  const productIdFromVariant = candidate.variant_id.replace(/_[^_]+$/, "");
  return catalog.find((product) => product.product_id === candidate.product_id)
    ?? catalog.find((product) => product.product_id === productIdFromVariant)
    ?? catalog.find((product) => product.cluster_id === currentProduct.cluster_id && product.seller_id === candidate.seller_id)
    ?? currentProduct;
}

function uniqueSellerRows<T extends { product: Product }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const sellerKey = row.product.seller_id || row.product.seller_name;
    if (seen.has(sellerKey)) return false;
    seen.add(sellerKey);
    return true;
  });
}

function trustScorePercent(candidate: CompareResponse["ranking"]["candidates"][number]) {
  if (typeof candidate.score_percent === "number") {
    return Math.round(candidate.score_percent);
  }
  return Math.round(candidate.score * 100);
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mediaAssetReady(status: string) {
  return ["present", "linked", "not_required"].includes(status);
}
